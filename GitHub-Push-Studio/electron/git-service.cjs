const { spawn } = require('node:child_process')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { RECOMMENDED_IGNORE, validateRepoName, validateCommitMessage, normalizeGithubUrl, parseStatus, sensitivePath, isSafeGitBranch } = require('./utils.cjs')

const TOOL_NAMES = { git: 'Git', gh: 'GitHub CLI', winget: 'Windows Package Manager' }
function knownExecutables(tool) {
  const paths = []
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const local = process.env.LOCALAPPDATA || ''
    if (tool === 'git') paths.push(path.join(programFiles, 'Git', 'cmd', 'git.exe'), path.join(programFilesX86, 'Git', 'cmd', 'git.exe'), path.join(local, 'Programs', 'Git', 'cmd', 'git.exe'))
    if (tool === 'gh') paths.push(path.join(programFiles, 'GitHub CLI', 'gh.exe'), path.join(programFilesX86, 'GitHub CLI', 'gh.exe'))
  }
  return [...paths.filter(x => fs.existsSync(x)), tool]
}

function execute(file, args, { cwd = os.homedir(), timeout = 35000, onData, stdinText } = {}) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(file, args, {
        cwd,
        shell: false,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1', GIT_CONFIG_NOSYSTEM: '0' },
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch (error) { reject(error); return }
    let stdout = '', stderr = '', settled = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(result)
    }
    const timer = timeout ? setTimeout(() => { child.kill(); finish(new Error(`Command exceeded ${Math.ceil(timeout / 1000)} seconds.`)) }, timeout) : null
    const capture = (kind, chunk) => {
      const s = String(chunk)
      if (kind === 'stdout') stdout = (stdout + s).slice(-600000)
      else stderr = (stderr + s).slice(-600000)
      if (onData) onData(s)
    }
    child.stdout.on('data', c => capture('stdout', c))
    child.stderr.on('data', c => capture('stderr', c))
    child.on('error', error => finish(error))
    child.on('close', code => finish(null, { code, stdout, stderr }))
    if (stdinText != null) child.stdin.end(stdinText)
    else child.stdin.end()
  })
}

async function runTool(tool, args, options = {}) {
  let lastError = null
  for (const file of knownExecutables(tool)) {
    try {
      const result = await execute(file, args, options)
      if (result.code !== 0 && !options.allowFailure) {
        const reason = (result.stderr || result.stdout || `${tool} exited with code ${result.code}`).trim()
        throw new Error(reason.slice(-2200))
      }
      return result
    } catch (error) {
      lastError = error
      if (error.code !== 'ENOENT') throw error
    }
  }
  throw new Error(`${TOOL_NAMES[tool] || tool} is not installed or not available in PATH. ${lastError?.message || ''}`)
}
async function optional(tool, args, options = {}) {
  try { return await runTool(tool, args, { ...options, allowFailure: true }) }
  catch { return { code: -1, stdout: '', stderr: '' } }
}
const safeLine = value => (value || '').trim().split(/\r?\n/)[0].slice(0, 250)

async function getSetup() {
  const [git, gh, name, email] = await Promise.all([
    optional('git', ['--version'], { timeout: 10000 }),
    optional('gh', ['--version'], { timeout: 10000 }),
    optional('git', ['config', '--global', '--get', 'user.name'], { timeout: 10000 }),
    optional('git', ['config', '--global', '--get', 'user.email'], { timeout: 10000 })
  ])
  const setup = {
    platform: process.platform,
    git: { installed: git.code === 0, version: safeLine(git.stdout) },
    gh: { installed: gh.code === 0, version: safeLine(gh.stdout) },
    identity: { name: name.code === 0 ? name.stdout.trim() : '', email: email.code === 0 ? email.stdout.trim() : '' },
    account: null,
    winget: false
  }
  if (process.platform === 'win32') {
    const winget = await optional('winget', ['--version'], { timeout: 7000 })
    setup.winget = winget.code === 0
  }
  if (setup.gh.installed) {
    const auth = await optional('gh', ['auth', 'status', '--hostname', 'github.com'], { timeout: 16000 })
    if (auth.code === 0) {
      const user = await optional('gh', ['api', 'user', '--jq', '.login'], { timeout: 16000 })
      if (user.code === 0 && /^[a-z\d-]{1,39}$/i.test(user.stdout.trim())) setup.account = user.stdout.trim()
    }
  }
  return setup
}

async function getRepo(folder) {
  if (!folder) return null
  let stats
  try { stats = await fsp.stat(folder) } catch { return { folder, exists: false, initialized: false } }
  if (!stats.isDirectory()) return { folder, exists: false, initialized: false }
  const root = await optional('git', ['rev-parse', '--show-toplevel'], { cwd: folder })
  if (root.code !== 0) return { folder, exists: true, initialized: false, name: path.basename(folder), files: [], total: 0, branch: 'main', remote: '', hasCommits: false, ignored: fs.existsSync(path.join(folder, '.gitignore')) }
  const realFolder = root.stdout.trim()
  const [branch, remote, status, lastCommit, head, upstream, conflicts] = await Promise.all([
    optional('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: realFolder }),
    optional('git', ['remote', 'get-url', 'origin'], { cwd: realFolder }),
    optional('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: realFolder, timeout: 45000 }),
    optional('git', ['log', '-1', '--format=%h%n%s%n%cr'], { cwd: realFolder }),
    optional('git', ['rev-parse', '--verify', 'HEAD'], { cwd: realFolder }),
    optional('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd: realFolder }),
    optional('git', ['diff', '--name-only', '--diff-filter=U'], { cwd: realFolder })
  ])
  const files = parseStatus(status.stdout)
  const currentBranch = safeLine(branch.stdout) || 'main'
  let ahead = null, behind = null
  if (upstream.code === 0 && head.code === 0) {
    const count = await optional('git', ['rev-list', '--left-right', '--count', 'HEAD...@{u}'], { cwd: realFolder })
    if (count.code === 0) {
      const numbers = count.stdout.trim().split(/\s+/).map(Number)
      if (numbers.length === 2 && numbers.every(Number.isFinite)) [ahead, behind] = numbers
    }
  }
  const logLines = lastCommit.code === 0 ? lastCommit.stdout.trim().split(/\r?\n/) : []
  // Never display credentials that someone may have embedded in a pre-existing remote URL.
  const displayRemote = remote.code === 0 ? remote.stdout.trim().replace(/^https:\/\/[^/@]+@github\.com\//i, 'https://github.com/') : ''
  return {
    folder: realFolder, exists: true, initialized: true, name: path.basename(realFolder),
    branch: currentBranch, detached: branch.code !== 0 && head.code === 0,
    remote: displayRemote,
    remoteLink: normalizeGithubUrl(displayRemote)?.https || '',
    files: files.slice(0, 300), total: files.length, truncated: files.length > 300,
    hasCommits: head.code === 0, lastCommit: logLines.length ? { hash: logLines[0], message: logLines[1], date: logLines[2] } : null,
    ignored: fs.existsSync(path.join(realFolder, '.gitignore')),
    ahead, behind, upstream: upstream.code === 0 ? upstream.stdout.trim() : '',
    conflicts: conflicts.stdout.trim() !== ''
  }
}

async function initialize(folder) {
  if (!folder) throw new Error('Choose a project folder first.')
  const existing = await getRepo(folder)
  if (!existing?.exists) throw new Error('Selected folder does not exist.')
  if (existing.initialized) throw new Error('This folder is already in a Git repository.')
  const init = await optional('git', ['init', '-b', 'main'], { cwd: folder })
  if (init.code !== 0) {
    await runTool('git', ['init'], { cwd: folder })
    await runTool('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: folder })
  }
  if (!fs.existsSync(path.join(folder, '.gitignore'))) await fsp.writeFile(path.join(folder, '.gitignore'), RECOMMENDED_IGNORE, { flag: 'wx' })
  return getRepo(folder)
}
async function addIgnore(folder) {
  if (!folder) throw new Error('Select a repository first.')
  const ignoredFile = path.join(folder, '.gitignore')
  try {
    await fsp.writeFile(ignoredFile, RECOMMENDED_IGNORE, { flag: 'wx' })
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('A .gitignore already exists. It was left unchanged to protect your rules.')
    throw error
  }
  return getRepo(folder)
}
async function setIdentity(name, email) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100 || /[\r\n\0]/.test(name)) throw new Error('Enter a valid commit author name.')
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) throw new Error('Enter a valid commit email address.')
  await runTool('git', ['config', '--global', 'user.name', name.trim()])
  await runTool('git', ['config', '--global', 'user.email', email.trim()])
}
async function createRemote(folder, name, visibility) {
  if (!validateRepoName(name)) throw new Error('Use a repository name with letters, numbers, dots, hyphens or underscores (max 100 characters).')
  if (!['private', 'public'].includes(visibility)) throw new Error('Choose public or private visibility.')
  const repo = await getRepo(folder)
  if (!repo?.initialized) throw new Error('Initialize Git in this project first.')
  if (repo.remote) throw new Error('An origin remote already exists. Connect or replace it instead; no remote was modified.')
  await runTool('gh', ['repo', 'create', name, `--${visibility}`, '--source', repo.folder, '--remote', 'origin'], { cwd: repo.folder, timeout: 80000 })
  return getRepo(repo.folder)
}
async function connectRemote(folder, url, replace = false) {
  if (!normalizeGithubUrl(url)) throw new Error('Enter a valid GitHub repository URL, such as https://github.com/owner/repo.git.')
  const repo = await getRepo(folder)
  if (!repo?.initialized) throw new Error('Initialize Git first.')
  if (repo.remote && !replace) throw new Error('Origin already exists. Confirm the replacement before continuing.')
  const args = repo.remote ? ['remote', 'set-url', 'origin', url.trim()] : ['remote', 'add', 'origin', url.trim()]
  await runTool('git', args, { cwd: repo.folder })
  return getRepo(repo.folder)
}
async function preflight(folder) {
  const repo = await getRepo(folder)
  if (!repo?.initialized) throw new Error('Initialize Git first.')
  if (repo.detached) throw new Error('Detached HEAD detected. Check out a named branch before publishing.')
  if (repo.conflicts) throw new Error('This repository contains unresolved merge conflicts. Resolve them before committing.')
  const status = await runTool('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: repo.folder, timeout: 55000 })
  const listed = parseStatus(status.stdout)
  const forbidden = listed.filter(f => f.status !== 'deleted' && sensitivePath(f.path)).map(f => f.path)
  if (forbidden.length) throw new Error(`Potential secret file(s) detected: ${forbidden.slice(0, 5).join(', ')}. Remove these from tracking or add them to .gitignore before committing.`)
  const tooLarge = []
  for (const file of listed) {
    if (file.status === 'deleted') continue
    try {
      const filepath = path.resolve(repo.folder, file.path)
      if (!(filepath === repo.folder || filepath.startsWith(repo.folder + path.sep))) continue
      const stat = await fsp.lstat(filepath)
      if (stat.isFile() && stat.size > 95 * 1024 * 1024) tooLarge.push(`${file.path} (${Math.round(stat.size / 1024 / 1024)} MB)`)
    } catch { /* status may report already deleted files */ }
  }
  if (tooLarge.length) throw new Error(`Large file(s): ${tooLarge.slice(0, 5).join(', ')}. GitHub blocks files over 100 MiB; use Git LFS or exclude them.`)
  return { repo, listed }
}
async function commit(folder, message, onLog) {
  if (!validateCommitMessage(message)) throw new Error('Write a commit message between 3 and 240 characters.')
  const { repo } = await preflight(folder)
  onLog?.('Checking project files and staging changes…')
  await runTool('git', ['add', '-A'], { cwd: repo.folder, timeout: 90000 })
  // Verify the actual staged index, including files staged outside this app.
  const staged = await runTool('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { cwd: repo.folder })
  const secrets = staged.stdout.split('\0').filter(sensitivePath)
  if (secrets.length) throw new Error(`Stopped: staged files may contain secrets: ${secrets.slice(0, 5).join(', ')}. Remove them from Git tracking before retrying. The files have not been committed.`)
  const diff = await optional('git', ['diff', '--cached', '--quiet'], { cwd: repo.folder })
  if (diff.code === 0) { onLog?.('No new changes to commit.'); return { committed: false, repo: await getRepo(repo.folder) } }
  if (diff.code !== 1) throw new Error(`Unable to inspect staged changes: ${diff.stderr}`)
  onLog?.('Creating commit…')
  await runTool('git', ['commit', '-m', message.trim()], { cwd: repo.folder, timeout: 90000 })
  return { committed: true, repo: await getRepo(repo.folder) }
}
async function push(folder, onLog) {
  const repo = await getRepo(folder)
  if (!repo?.initialized) throw new Error('Initialize Git first.')
  if (!repo.hasCommits) throw new Error('No commit exists yet. Commit project files first.')
  if (!repo.remote) throw new Error('Connect or create a GitHub repository before pushing.')
  if (repo.detached || !isSafeGitBranch(repo.branch)) throw new Error('A valid named branch is required to push.')
  if (repo.conflicts) throw new Error('Resolve Git merge conflicts before pushing.')
  onLog?.(`Pushing ${repo.branch} to origin…`)
  const result = await optional('git', ['push', '--progress', '-u', 'origin', repo.branch], { cwd: repo.folder, timeout: 180000, onData: chunk => {
    const line = chunk.trim()
    if (line && /(?:Writing objects: 100%|remote:|To (?:https|git@)|new branch|up.to.date|error:|fatal:|rejected)/i.test(line)) onLog?.(line.slice(-250))
  } })
  if (result.code !== 0) {
    const output = (result.stderr || result.stdout).slice(-1800)
    if (/non-fast-forward|fetch first|rejected/i.test(output)) throw new Error('GitHub has commits not present locally. Push was safely refused. Fetch/pull and reconcile changes in Git before retrying. No force-push was performed.\n' + output)
    throw new Error(output || 'Push failed. Check your connection and GitHub access rights.')
  }
  return getRepo(repo.folder)
}
async function commitAndPush(folder, message, onLog) {
  const repo = await getRepo(folder)
  if (!repo?.remote) throw new Error('Connect or create a GitHub repository first.')
  if (repo.total) await commit(folder, message, onLog)
  return push(folder, onLog)
}
async function installWindowsTool(tool, onLog) {
  if (process.platform !== 'win32') throw new Error('Automatic installation is only supported on Windows. Use the official download link.')
  if (!['git', 'gh'].includes(tool)) throw new Error('Unsupported installation target.')
  const id = tool === 'git' ? 'Git.Git' : 'GitHub.cli'
  onLog?.(`Starting Windows Package Manager installation for ${TOOL_NAMES[tool]}…`)
  const result = await runTool('winget', ['install', '--id', id, '--exact', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'], {
    timeout: 420000, allowFailure: true,
    onData: chunk => { const line = chunk.trim().split(/[\r\n]/).filter(Boolean).slice(-1)[0]; if (line && line.length < 200) onLog?.(line) }
  })
  if (result.code !== 0) throw new Error(`Installer exited with code ${result.code}. ${result.stderr.slice(-600) || result.stdout.slice(-600)}. You can also use the official download button.`)
  onLog?.(`${TOOL_NAMES[tool]} installation finished. Restart the app if detection still shows missing.`)
  return true
}
async function runDoctor(folder) {
  const script = path.join(__dirname, '..', 'scripts', 'doctor.py')
  for (const candidate of process.platform === 'win32' ? [{ cmd: 'py', args: ['-3'] }, { cmd: 'python', args: [] }] : [{ cmd: 'python3', args: [] }, { cmd: 'python', args: [] }]) {
    try {
      const result = await execute(candidate.cmd, [...candidate.args, script, ...(folder ? ['--repo', folder] : []), '--json'], { timeout: 12000 })
      if (result.code === 0) return JSON.parse(result.stdout)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  throw new Error('Python 3 was not found. The main app works without Python; install Python 3 if you want optional diagnostics.')
}
module.exports = { getSetup, getRepo, initialize, addIgnore, setIdentity, createRemote, connectRemote, commit, push, commitAndPush, installWindowsTool, runDoctor, execute, runTool, optional, knownExecutables }
