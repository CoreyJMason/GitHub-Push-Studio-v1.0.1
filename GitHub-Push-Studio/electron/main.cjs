const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')
const git = require('./git-service.cjs')
const { normalizeGithubUrl } = require('./utils.cjs')

let mainWindow
let selectedFolder = null
let recentFolders = []
let authProcess = null
let installInProgress = false
let activity = []
const statePath = () => path.join(app.getPath('userData'), 'workspace.json')

function notify(type, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('studio:event', { type, payload })
}
function log(message, kind = 'info') {
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), kind, message: String(message).slice(0, 2000) }
  activity = [entry, ...activity].slice(0, 200)
  notify('log', entry)
}
async function saveState() {
  await fsp.mkdir(path.dirname(statePath()), { recursive: true })
  await fsp.writeFile(statePath(), JSON.stringify({ selectedFolder, recentFolders }, null, 2), 'utf8')
}
async function loadState() {
  try {
    const state = JSON.parse(await fsp.readFile(statePath(), 'utf8'))
    if (typeof state.selectedFolder === 'string' && fs.existsSync(state.selectedFolder)) selectedFolder = state.selectedFolder
    recentFolders = (Array.isArray(state.recentFolders) ? state.recentFolders : []).filter(x => typeof x === 'string' && fs.existsSync(x)).slice(0, 12)
  } catch { /* first launch */ }
}
async function chooseRepo(folder) {
  const repo = await git.getRepo(folder)
  if (!repo?.exists) throw new Error('That project folder is no longer available.')
  selectedFolder = repo.folder
  recentFolders = [selectedFolder, ...recentFolders.filter(p => p !== selectedFolder)].slice(0, 12)
  await saveState()
  log(`Opened ${path.basename(selectedFolder)}`)
  return repo
}
async function snapshot() {
  const [setup, repo] = await Promise.all([git.getSetup(), git.getRepo(selectedFolder)])
  return { setup, repo, recentFolders, selectedFolder, activity, authRunning: !!authProcess, installInProgress }
}
function errorFriendly(error) {
  const raw = String(error?.message || error || 'Unknown error')
  if (/ENOENT/.test(raw)) return 'A required tool was not found. Complete setup and retry.'
  return raw.slice(-2200)
}
function action(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Invalid request source')
    try { return await handler(...args) }
    catch (error) { const message = errorFriendly(error); log(message, 'error'); return { error: message } }
  })
}
async function signIn() {
  if (authProcess) throw new Error('GitHub sign-in is already running.')
  const available = await git.getSetup()
  if (!available.gh.installed) throw new Error('Install GitHub CLI first.')
  const binary = git.knownExecutables('gh')[0]
  log('Starting GitHub browser sign-in. Authorize in your browser and return to the app.')
  const processHandle = spawn(binary, ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--clipboard'], {
    shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' }
  })
  authProcess = processHandle
  let textBuffer = ''
  const onChunk = chunk => {
    const text = String(chunk).replace(/\u001b\[[0-9;]*m/g, '')
    textBuffer = (textBuffer + text).slice(-8000)
    const match = /(?:one-time code:?|code:)\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i.exec(textBuffer)
    if (match) notify('auth-code', match[1].toUpperCase())
    for (const line of text.split(/[\r\n]/).map(x => x.trim()).filter(Boolean)) {
      if (/code|browser|device|authentication|logged|authorize|error|enter/i.test(line)) log(line.slice(0, 300))
    }
  }
  processHandle.stdout.on('data', onChunk)
  processHandle.stderr.on('data', onChunk)
  // gh sometimes waits for an Enter before opening a browser. Supply it without a terminal.
  setTimeout(() => { if (authProcess === processHandle && !processHandle.killed) { try { processHandle.stdin.write('\n') } catch { /* closed */ } } }, 900)
  processHandle.on('error', error => {
    log(`Unable to open sign-in: ${error.message}`, 'error')
    if (authProcess === processHandle) authProcess = null
    notify('auth-end', { ok: false })
  })
  processHandle.on('close', async code => {
    if (authProcess !== processHandle) return
    authProcess = null
    if (code === 0) {
      try {
        await git.runTool('gh', ['auth', 'setup-git', '--hostname', 'github.com'], { timeout: 12000 })
        log('Signed in and connected Git credentials to GitHub.', 'success')
      } catch (error) { log(`Signed in, but Git credential setup needs attention: ${errorFriendly(error)}`, 'error') }
    } else log('GitHub sign-in did not complete. Retry or use the GitHub CLI in a terminal.', 'error')
    notify('auth-end', { ok: code === 0 })
  })
  return { started: true }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420, height: 900, minWidth: 950, minHeight: 640,
    backgroundColor: '#f5f7fb', title: 'GitHub Push Studio', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const dev = process.env.VITE_DEV_SERVER_URL
    if (dev && url.startsWith(dev)) return
    if (!dev && url.startsWith('file://')) return
    event.preventDefault()
  })
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}
app.whenReady().then(async () => {
  await loadState()
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  action('bootstrap', snapshot)
  action('refresh', snapshot)
  action('choose-folder', async () => {
    const choice = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: 'Choose a project folder', buttonLabel: 'Use this folder' })
    if (choice.canceled || !choice.filePaths[0]) return { canceled: true }
    return chooseRepo(choice.filePaths[0])
  })
  action('open-recent', async folder => {
    if (!recentFolders.includes(folder)) throw new Error('Folder is not in the recent project list.')
    return chooseRepo(folder)
  })
  action('initialize', async () => { const result = await git.initialize(selectedFolder); log('Git initialized on the main branch.', 'success'); return result })
  action('ignore', async () => { const result = await git.addIgnore(selectedFolder); log('Recommended .gitignore created.', 'success'); return result })
  action('identity', async ({ name, email }) => { await git.setIdentity(name, email); log('Commit identity saved to global Git configuration.', 'success'); return true })
  action('create-repo', async ({ name, visibility }) => { const result = await git.createRemote(selectedFolder, name, visibility); log(`GitHub repository ${name} created (${visibility}).`, 'success'); return result })
  action('connect-remote', async ({ url, replace }) => { const result = await git.connectRemote(selectedFolder, url, replace); log(replace ? 'Origin remote replaced.' : 'Origin remote connected.', 'success'); return result })
  action('commit', async message => { const result = await git.commit(selectedFolder, message, log); if (result.committed) log('Local commit created.', 'success'); return result })
  action('push', async () => { const result = await git.push(selectedFolder, log); log('Changes pushed to GitHub.', 'success'); return result })
  action('commit-push', async message => { const result = await git.commitAndPush(selectedFolder, message, log); log('Project published to GitHub.', 'success'); return result })
  action('signin', signIn)
  action('setup-git', async () => { await git.runTool('gh', ['auth', 'setup-git', '--hostname', 'github.com'], { timeout: 14000 }); log('GitHub HTTPS credential helper configured.', 'success'); return true })
  action('cancel-signin', () => { if (authProcess) { authProcess.kill(); authProcess = null; log('GitHub sign-in cancelled.'); notify('auth-end', { ok: false }) } return true })
  action('install', async tool => {
    if (installInProgress) throw new Error('An installation is already running.')
    installInProgress = true
    try { await git.installWindowsTool(tool, log); log(`${tool} install completed.`, 'success'); return true }
    finally { installInProgress = false; notify('install-end', true) }
  })
  action('doctor', async () => { const result = await git.runDoctor(selectedFolder); log('Python diagnostics completed.', 'success'); return result })
  action('show-folder', async () => { if (!selectedFolder || !fs.existsSync(selectedFolder)) throw new Error('Choose a folder first.'); await shell.openPath(selectedFolder); return true })
  action('open-url', async key => {
    const destinations = {
      git: 'https://git-scm.com/downloads/win',
      gh: 'https://cli.github.com/',
      node: 'https://nodejs.org/en/download',
      device: 'https://github.com/login/device',
      help: 'https://docs.github.com/en/get-started/using-git/about-git',
      profile: 'https://github.com/settings/profile'
    }
    if (key === 'remote') {
      const repo = await git.getRepo(selectedFolder)
      if (!repo?.remoteLink) throw new Error('Connect a GitHub remote first.')
      await shell.openExternal(repo.remoteLink)
    } else if (Object.hasOwn(destinations, key)) await shell.openExternal(destinations[key])
    else throw new Error('Unknown external link.')
    return true
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { if (authProcess) authProcess.kill() })
