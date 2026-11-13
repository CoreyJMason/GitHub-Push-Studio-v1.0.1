import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Activity, ArrowRight, ArrowUpRight, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronRight,
  CircleAlert, CircleDot, CloudUpload, Code2, Copy, ExternalLink, FileCode2, FilePlus2,
  Folder, FolderGit2, FolderOpen, GitBranch, Github, GitCommitHorizontal, HardDriveDownload, Info,
  KeyRound, Layers3, Link2, ListChecks, LockKeyhole, Plus, RefreshCw, Search,
  Settings2, ShieldCheck, Sparkles, Terminal, Trash2, LockKeyholeOpen, UploadCloud, UserRound, X
} from 'lucide-react'

const API = window.studio
const FILE_ICONS = { untracked: FilePlus2, added: FilePlus2, deleted: Trash2, renamed: ArrowRight, conflict: CircleAlert, modified: FileCode2 }
const formatCount = n => new Intl.NumberFormat().format(n || 0)
const shortPath = p => p && p.length > 48 ? '…' + p.slice(-47) : p
const ago = value => { try { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

function Button({ children, icon: Icon, type = 'button', kind = 'secondary', small = false, loading = false, disabled = false, onClick, className = '', title }) {
  return <button title={title} type={type} onClick={onClick} disabled={disabled || loading} className={`btn btn-${kind} ${small ? 'btn-small' : ''} ${className}`}>
    {loading ? <RefreshCw size={16} className="spin" /> : Icon ? <Icon size={16} strokeWidth={2.1} /> : null}<span>{children}</span>
  </button>
}
function IconButton({ icon: Icon, label, onClick, className = '', disabled = false }) {
  return <button type="button" className={`icon-button ${className}`} disabled={disabled} onClick={onClick} aria-label={label} title={label}><Icon size={17} /></button>
}
function Dot({ ok = false, warn = false }) { return <span className={`status-dot ${ok ? 'is-good' : warn ? 'is-warn' : ''}`} /> }
function StatePill({ ok = false, label, muted = false }) { return <span className={`state-pill ${ok ? 'state-good' : muted ? 'state-muted' : 'state-neutral'}`}>{ok ? <Check size={12} /> : <CircleDot size={12} />}{label}</span> }
function PanelHeader({ eyebrow, title, action }) { return <div className="panel-header"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>{action}</div> }
function SetupStep({ number, icon: Icon, title, subtitle, ok, children }) {
  return <section className={`setup-step ${ok ? 'step-complete' : ''}`}>
    <div className="step-number">{ok ? <Check size={17} /> : number}</div>
    <div className="step-inner"><div className="step-title-line"><div className="step-icon"><Icon size={18} /></div><div className="step-copy"><h3>{title}</h3><p>{subtitle}</p></div>{ok && <span className="ready-label"><CheckCircle2 size={14} /> Ready</span>}</div><div className="step-body">{children}</div></div>
  </section>
}
function Copyable({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)
  return <button type="button" className="copy-inline" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {} }} title={label}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
}

export default function App() {
  const [data, setData] = useState(null)
  const [view, setView] = useState('workspace')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('Update project files')
  const [visibility, setVisibility] = useState('private')
  const [repoName, setRepoName] = useState('')
  const [remoteMode, setRemoteMode] = useState('create')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [editingRemote, setEditingRemote] = useState(false)
  const [identity, setIdentity] = useState({ name: '', email: '' })
  const [toast, setToast] = useState(null)
  const [authCode, setAuthCode] = useState('')
  const [pythonResult, setPythonResult] = useState(null)
  const [filter, setFilter] = useState('')
  const [expandedChanges, setExpandedChanges] = useState(false)

  const inform = useCallback((text, variant = 'success') => setToast({ text, variant, id: Date.now() }), [])
  const refresh = useCallback(async (quiet = false) => {
    const result = await API.refresh()
    if (result?.error) { inform(result.error, 'error'); return }
    setData(result)
    if (!quiet) inform('Workspace refreshed')
  }, [inform])
  useEffect(() => {
    API.bootstrap().then(result => { if (result?.error) inform(result.error, 'error'); else setData(result) }).catch(err => inform(err.message, 'error'))
    return API.onEvent(event => {
      if (event.type === 'log') setData(old => old ? { ...old, activity: [event.payload, ...old.activity].slice(0, 200) } : old)
      if (event.type === 'auth-code') setAuthCode(event.payload)
      if (event.type === 'auth-end') {
        setData(old => old ? { ...old, authRunning: false } : old)
        API.refresh().then(x => { if (!x?.error) setData(x) })
        if (event.payload.ok) inform('GitHub account connected successfully.')
        else inform('Sign-in ended. Check activity for details.', 'error')
      }
      if (event.type === 'install-end') API.refresh().then(x => { if (!x?.error) setData(x) })
    })
  }, [inform])
  useEffect(() => { if (data?.setup?.identity) setIdentity(data.setup.identity) }, [data?.setup?.identity?.name, data?.setup?.identity?.email])
  useEffect(() => { if (data?.repo?.name) setRepoName(data.repo.name.replace(/[^\w.-]/g, '-')); setRemoteUrl(''); setEditingRemote(false); setPythonResult(null) }, [data?.repo?.folder])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5800); return () => clearTimeout(t) }, [toast])
  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); run('choose-folder', () => API.chooseFolder(), { quiet: true }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const setup = data?.setup || {}
  const repo = data?.repo || null
  const recent = data?.recentFolders || []
  const readyCount = [setup.git?.installed, setup.gh?.installed, !!setup.account, !!setup.identity?.name && !!setup.identity?.email].filter(Boolean).length
  const isReady = readyCount === 4
  const files = repo?.files || []
  const filteredFiles = useMemo(() => files.filter(f => f.path.toLowerCase().includes(filter.toLowerCase())).slice(0, expandedChanges ? 300 : 7), [files, filter, expandedChanges])

  async function run(name, operation, opts = {}) {
    if (busy) return
    setBusy(name)
    try {
      const response = await operation()
      if (response?.error) throw new Error(response.error)
      if (response?.canceled) return
      if (name === 'choose-folder' || name === 'open-recent') {
        const snapshot = await API.refresh()
        if (!snapshot?.error) { setData(snapshot); setView('workspace') }
      } else if (name !== 'signin') {
        const snapshot = await API.refresh()
        if (!snapshot?.error) setData(snapshot)
      } else setData(old => old ? { ...old, authRunning: true } : old)
      if (!opts.quiet) inform(opts.success || 'Action completed successfully.')
    } catch (error) { inform(error.message || 'The action failed.', 'error') }
    finally { setBusy('') }
  }
  function authStart() { setAuthCode(''); run('signin', () => API.signIn(), { quiet: true }) }
  async function openUrl(key) { const response = await API.openUrl(key); if (response?.error) inform(response.error, 'error') }
  function chooseFolder() { run('choose-folder', () => API.chooseFolder(), { quiet: true }) }
  function connect() {
    if (repo?.remote && !window.confirm(`Replace the existing origin remote?\n\nCurrent: ${repo.remote}\nNew: ${remoteUrl}\n\nThis changes the destination of future pushes.`)) return
    run('connect-remote', () => API.connectRemote({ url: remoteUrl, replace: !!repo?.remote }), { success: 'GitHub remote connected.' })
  }
  function publish() { run('commit-push', () => API.commitAndPush(message), { success: 'Your repository was pushed to GitHub.' }) }
  const setupNav = () => setView('setup')

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-row"><div className="brand-icon"><GitBranch size={23} strokeWidth={2.5} /></div><div><strong>Push Studio</strong><span>FOR GITHUB</span></div></div>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="primary-nav" aria-label="Main navigation">
        <button className={`nav-item ${view === 'workspace' ? 'active' : ''}`} onClick={() => setView('workspace')}><Layers3 size={18} /> <span>Overview</span>{view === 'workspace' && <ChevronRight size={15} className="nav-tail" />}</button>
        <button className={`nav-item ${view === 'activity' ? 'active' : ''}`} onClick={() => setView('activity')}><Activity size={18} /> <span>Activity log</span>{view === 'activity' && <ChevronRight size={15} className="nav-tail" />}</button>
        <button className={`nav-item ${view === 'setup' ? 'active' : ''}`} onClick={setupNav}><Settings2 size={18} /> <span>Setup & account</span>{!isReady && <i className="nav-alert" />}{view === 'setup' && <ChevronRight size={15} className="nav-tail" />}</button>
      </nav>
      <div className="side-divider" />
      <div className="side-row"><div className="sidebar-section-label">YOUR PROJECTS</div><IconButton icon={Plus} label="Add project" className="sidebar-plus" onClick={chooseFolder} disabled={!!busy} /></div>
      <div className="recent-list">
        {recent.length ? recent.map(folder => <button key={folder} className={`recent-item ${repo?.folder === folder ? 'recent-active' : ''}`} title={folder} onClick={() => run('open-recent', () => API.openRecent(folder), { quiet: true })} disabled={!!busy}><Folder size={16} /><span>{folder.split(/[\\/]/).pop()}</span>{repo?.folder === folder && <span className="recent-active-dot" />}</button>) : <div className="side-empty">No projects opened yet.</div>}
      </div>
      <div className="sidebar-bottom">
        <div className="connection-tile"><div className="connection-top"><div className="connection-icon"><Github size={19} /></div><span><Dot ok={!!setup.account} />{setup.account ? 'Connected' : 'Not connected'}</span></div><strong>{setup.account ? '@' + setup.account : 'GitHub account'}</strong><p>{setup.account ? 'Ready to publish projects' : 'Sign in to publish your work'}</p><button onClick={setupNav}>{setup.account ? 'Manage account' : 'Complete setup'} <ArrowUpRight size={14} /></button></div>
        <div className="sidebar-foot"><ShieldCheck size={14} /><span>Local-first · Safe by default</span><span>v1.0</span></div>
      </div>
    </aside>

    <main className="main-area">
      <div className="topbar"><div className="breadcrumbs"><span>Push Studio</span><ChevronRight size={14} /><strong>{view === 'workspace' ? 'Overview' : view === 'activity' ? 'Activity log' : 'Setup & account'}</strong></div><div className="top-actions"><span className="online-label"><Dot ok={!!setup.account} />{setup.account ? '@' + setup.account : 'Not signed in'}</span><div className="top-separator" /><IconButton icon={RefreshCw} label="Refresh environment and repository" onClick={() => refresh()} disabled={!!busy}/><div className="avatar"><UserRound size={16} /></div></div></div>

      <div className="page-scroll">
        {view === 'workspace' && <div className="page-content">
          <div className="page-title-row"><div><div className="page-kicker">DEVELOPER WORKSPACE <span className="kicker-line" /></div><h1>{repo ? 'Repository overview' : 'Welcome to Push Studio'}<span className="heading-period">.</span></h1><p>{repo ? 'Manage local changes, connect a remote, and publish confidently.' : 'The simple way to bring your projects to GitHub.'}</p></div><Button icon={FolderOpen} kind="primary" onClick={chooseFolder} loading={busy === 'choose-folder'}>Open project</Button></div>
          {!repo && <div className="welcome-layout">
            <section className="welcome-card"><div className="welcome-decoration dec-1"/><div className="welcome-decoration dec-2"/><div className="welcome-body"><div className="welcome-tag"><Sparkles size={14}/> GET STARTED IN MINUTES</div><h2>From your computer<br/>to <span>GitHub.</span></h2><p>Choose a project folder, review its files, and push your code—without memorizing terminal commands.</p><Button icon={FolderOpen} kind="white" onClick={chooseFolder} loading={busy === 'choose-folder'}>Choose a project folder <ArrowRight size={17}/></Button><span className="keyboard-hint">Or press <kbd>Ctrl</kbd> + <kbd>O</kbd></span></div><div className="hero-terminal" aria-hidden="true"><div className="terminal-bar"><i/><i/><i/><span>push-studio / your-project</span></div><div className="terminal-content"><div><span className="code-purple">$</span> git status</div><div className="code-muted">On branch main</div><div className="code-muted">Changes ready to publish</div><div className="terminal-divider"/><div className="code-green"><CheckCircle2 size={15} /> Ready to push</div></div></div></section>
            <section className="white-panel welcome-setup"><div className="mini-heading">YOUR STARTUP CHECKLIST</div><h3>Set up your workspace</h3><p>Everything you need to start publishing.</p><div className="setup-progress"><span style={{ width: `${readyCount * 25}%` }}/></div><div className="progress-copy">{readyCount} of 4 steps complete</div><div className="checklist">{[['Git installed', !!setup.git?.installed], ['GitHub CLI installed', !!setup.gh?.installed], ['GitHub account connected', !!setup.account], ['Commit identity configured', !!setup.identity?.name && !!setup.identity?.email]].map(([label, ok]) => <div className="checklist-item" key={label}>{ok ? <CheckCircle2 className="good" size={18} /> : <CircleDot size={18} />}<span>{label}</span></div>)}</div><Button icon={ArrowRight} kind="secondary" className="wide" onClick={setupNav}>{isReady ? 'Review settings' : 'Finish setup'}</Button></section>
          </div>}
          {repo && <>
            <div className="repository-heading"><div className="repo-mark"><FolderGit2 size={26} /></div><div className="repo-heading-text"><div className="repo-name-line"><h2>{repo.name}</h2><StatePill ok={repo.initialized} label={repo.initialized ? 'Git repository' : 'Not initialized'} /></div><div className="repo-path" title={repo.folder}><Folder size={13}/>{shortPath(repo.folder)}<Copyable text={repo.folder} label="Copy folder path" /></div></div><div className="repo-heading-actions"><Button small icon={FolderOpen} onClick={() => run('show-folder', () => API.showFolder(), { quiet: true })}>Open folder</Button>{repo.remoteLink && <Button small icon={ExternalLink} onClick={() => openUrl('remote')}>GitHub</Button>}</div></div>
            <div className="metric-grid"><div className="metric-card"><div className="metric-label"><GitBranch size={16}/> CURRENT BRANCH</div><div className="metric-value metric-branch">{repo.initialized ? repo.branch : '—'}</div><div className="metric-hint">{repo.detached ? 'Detached HEAD' : repo.initialized ? 'Local working branch' : 'Initialize Git to begin'}</div></div><div className="metric-card"><div className="metric-label"><FileCode2 size={16}/> FILE CHANGES</div><div className="metric-value">{formatCount(repo.total)}</div><div className="metric-hint">{repo.total === 0 ? 'Working tree is clean' : 'Files awaiting commit'}</div></div><div className="metric-card"><div className="metric-label"><CloudUpload size={16}/> REMOTE REPOSITORY</div><div className="metric-value metric-remote">{repo.remote ? 'Connected' : 'Not linked'}</div><div className="metric-hint">{repo.remote ? shortPath(repo.remoteLink || repo.remote) : 'Create or connect a remote'}</div></div></div>
            <div className="work-grid">
              <section className="white-panel changes-panel"><PanelHeader eyebrow="YOUR WORKING TREE" title="Local changes" action={<div className="panel-controls"><StatePill ok={!!repo.initialized && repo.total === 0} label={repo.total ? `${formatCount(repo.total)} changed` : 'All clear'} /><IconButton icon={RefreshCw} label="Refresh files" onClick={() => refresh(true)} disabled={!!busy}/></div>} />
                {!repo.initialized ? <div className="empty-state changes-empty"><div className="empty-state-icon"><GitBranch size={24}/></div><h3>Git isn’t initialized</h3><p>This folder needs a local Git repository before you can track and publish changes.</p><Button kind="primary" icon={GitBranch} onClick={() => run('initialize', () => API.initialize(), { success: 'Local repository initialized.' })} loading={busy === 'initialize'}>Initialize repository</Button></div>
                  : repo.total === 0 ? <div className="empty-state changes-empty clean"><div className="empty-state-icon"><CheckCheck size={24}/></div><h3>Everything is up to date locally</h3><p>No uncommitted changes detected. You can still push existing commits to GitHub.</p>{repo.lastCommit && <div className="last-commit"><GitCommitHorizontal size={15}/><span>{repo.lastCommit.message}</span><code>{repo.lastCommit.hash}</code></div>}</div>
                  : <><div className="changes-search"><Search size={16}/><input aria-label="Filter changed files" placeholder="Filter files by name…" value={filter} onChange={e => setFilter(e.target.value)}/><span>{filteredFiles.length}{expandedChanges ? '' : ` / ${formatCount(repo.total)}`}</span></div><div className="files-scroll" aria-label="Changed files">{filteredFiles.map((file, i) => { const Icon = FILE_ICONS[file.status] || FileCode2; return <div key={`${file.path}-${i}`} className="file-row"><div className={`file-icon file-${file.status}`}><Icon size={16}/></div><div className="file-details"><span title={file.path}>{file.path.split(/[\\/]/).pop()}</span><small title={file.path}>{file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : 'Project root'}</small></div><span className={`file-state status-${file.status}`}>{file.status}</span></div> })}{filteredFiles.length === 0 && <p className="file-no-results">No changed files match your filter.</p>}</div>{repo.total > 7 && !filter && <button className="show-all" onClick={() => setExpandedChanges(!expandedChanges)}>{expandedChanges ? 'Show less' : `View all ${formatCount(repo.total)} changed files`} <ChevronDown size={15} className={expandedChanges ? 'flip' : ''}/></button>}{repo.truncated && <div className="notice-line"><Info size={15}/> Showing the first 300 changed files.</div>}</>}
                <div className="commit-section"><div className="commit-top"><div><h3>Commit message</h3><p>Describe what changed in this version.</p></div><span className="optional-caption">3–240 characters</span></div><textarea aria-label="Commit message" maxLength={240} rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="e.g. Add new dashboard layout" disabled={!repo.initialized || !!busy} /><div className="commit-footer"><span><ShieldCheck size={15}/> Checks for obvious secrets and large files</span><Button small icon={GitCommitHorizontal} disabled={!repo.initialized || repo.total === 0 || message.trim().length < 3 || !!busy} loading={busy === 'commit'} onClick={() => run('commit', () => API.commit(message), { success: 'Changes committed locally.' })}>Commit locally</Button></div></div>
              </section>
              <section className="white-panel publish-panel"><PanelHeader eyebrow="CLOUD SYNC" title="Publish to GitHub" action={<div className="publish-icon"><UploadCloud size={19}/></div>}/><div className="publish-timeline"><div className="timeline-row"><div className={`timeline-marker ${repo.initialized ? 'complete' : ''}`}>{repo.initialized ? <Check size={14}/> : '1'}</div><div><h3>Local Git repository</h3><p>{repo.initialized ? `Tracking changes on ${repo.branch}` : 'Initialize tracking in this folder'}</p></div></div><div className="timeline-row"><div className={`timeline-marker ${setup.account ? 'complete' : ''}`}>{setup.account ? <Check size={14}/> : '2'}</div><div><h3>GitHub account</h3><p>{setup.account ? `Connected as @${setup.account}` : 'Sign in from the setup page'}</p>{!setup.account && <button className="inline-action" onClick={setupNav}>Go to setup <ArrowRight size={13}/></button>}</div></div><div className="timeline-row"><div className={`timeline-marker ${repo.remote ? 'complete' : ''}`}>{repo.remote ? <Check size={14}/> : '3'}</div><div><h3>Remote destination</h3><p>{repo.remote ? 'Origin is configured' : 'Create or link a repository on GitHub'}</p></div></div></div>
                <div className="remote-section"><div className="remote-section-heading"><strong>{repo.remote ? 'Connected destination' : 'Set up GitHub repository'}</strong>{repo.remote && <StatePill ok label="Linked"/>}</div>
                  {repo.remote ? <><div className="remote-connected"><Github size={19}/><div><strong>{repo.remoteLink ? repo.remoteLink.replace('https://github.com/', '') : 'Origin remote'}</strong><small title={repo.remote}>{repo.remote}</small></div><IconButton icon={ExternalLink} label="Open repository on GitHub" onClick={() => openUrl('remote')} disabled={!repo.remoteLink}/></div><button className="edit-remote-toggle" onClick={() => { setEditingRemote(!editingRemote); setRemoteUrl(repo.remote) }}>{editingRemote ? 'Cancel editing' : 'Change origin destination'} <ChevronRight size={13}/></button>{editingRemote && <div className="remote-inputs edit-remote-form"><label htmlFor="replace-origin">New GitHub repository URL</label><input id="replace-origin" value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)} placeholder="https://github.com/owner/repo.git"/><Button small icon={Link2} disabled={!!busy || !remoteUrl.trim()} onClick={connect}>Replace origin remote</Button><p className="field-hint">You will be asked to confirm the destination change. Your files and commits remain local.</p></div>}</>
                  : <div className="remote-form"><div className="segmented" role="tablist" aria-label="Remote repository setup"><button role="tab" aria-selected={remoteMode === 'create'} className={remoteMode === 'create' ? 'selected' : ''} onClick={() => setRemoteMode('create')}>Create new</button><button role="tab" aria-selected={remoteMode === 'connect'} className={remoteMode === 'connect' ? 'selected' : ''} onClick={() => setRemoteMode('connect')}>Connect existing</button></div>
                    {remoteMode === 'create' ? <div className="remote-inputs"><label htmlFor="repo-name">Repository name</label><input id="repo-name" placeholder="my-awesome-project" value={repoName} onChange={e => setRepoName(e.target.value)}/><label>Visibility</label><div className="visibility-pair"><button className={visibility === 'private' ? 'chosen' : ''} onClick={() => setVisibility('private')}><LockKeyhole size={16}/><strong>Private</strong><small>Only invited people</small></button><button className={visibility === 'public' ? 'chosen' : ''} onClick={() => setVisibility('public')}><LockKeyholeOpen size={16}/><strong>Public</strong><small>Anyone can view</small></button></div><Button kind="secondary" className="wide" icon={Plus} loading={busy === 'create-repo'} disabled={!repo.initialized || !setup.account || !!busy} onClick={() => run('create-repo', () => API.createRepo({ name: repoName, visibility }), { success: 'Remote repository created successfully.' })}>Create on GitHub</Button></div>
                    : <div className="remote-inputs"><label htmlFor="remote-url">GitHub repository URL</label><input id="remote-url" type="url" value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)} placeholder="https://github.com/owner/repo.git"/><p className="field-hint">Create a blank repository on GitHub first, then paste its URL here.</p><Button kind="secondary" icon={Link2} className="wide" disabled={!repo.initialized || !remoteUrl.trim() || !!busy} loading={busy === 'connect-remote'} onClick={connect}>Connect repository</Button></div>}
                    </div>}
                </div>
                <div className="publish-bottom"><Button kind="primary" className="wide publish-cta" icon={UploadCloud} disabled={!repo.initialized || !repo.remote || !setup.account || !setup.identity?.name || !setup.identity?.email || !!busy} loading={busy === 'commit-push'} onClick={publish}>{repo.total > 0 ? 'Commit & push to GitHub' : 'Push to GitHub'} <ArrowRight size={17}/></Button><p><ShieldCheck size={14}/> Standard push only. No force pushes or hidden overwrites.</p>{repo.behind > 0 && <div className="warning-banner"><CircleAlert size={15}/> Your local branch is {repo.behind} commit(s) behind its tracked remote. Reconcile before pushing.</div>}</div>
              </section>
            </div>
          </>}
          <div className="bottom-info"><span><ShieldCheck size={15}/> Your code stays on your computer until you explicitly push.</span><button onClick={() => openUrl('help')}>GitHub basics <ArrowUpRight size={14}/></button></div>
        </div>}

        {view === 'setup' && <div className="page-content narrow-page"><div className="page-kicker">INITIAL CONFIGURATION <span className="kicker-line" /></div><div className="page-title-row"><div><h1>Setup & account<span className="heading-period">.</span></h1><p>Configure everything you need without leaving the app.</p></div><StatePill ok={isReady} label={isReady ? 'Setup complete' : `${readyCount} / 4 steps`} /></div>
          <div className="setup-overview"><div className="setup-overview-icon"><ListChecks size={23}/></div><div><strong>{isReady ? 'You’re ready to publish.' : 'Let’s prepare your environment.'}</strong><p>{isReady ? 'All essential tools and account settings are connected.' : 'Follow the steps below, in order. Installed tools are detected automatically.'}</p></div><div className="setup-score">{readyCount}<span>/ 4</span></div></div>
          <div className="setup-step-list">
            <SetupStep number="01" icon={Terminal} title="Install Git" subtitle="Git tracks your source files and creates commits." ok={!!setup.git?.installed}>
              {setup.git?.installed ? <div className="setup-status-detail"><CheckCircle2 size={16}/> {setup.git.version || 'Git detected'}</div> : <div className="step-actions">{setup.platform === 'win32' && setup.winget && <Button kind="primary" small icon={HardDriveDownload} loading={busy === 'install-git'} disabled={!!busy} onClick={() => run('install-git', () => API.install('git'), { success: 'Git installation finished.' })}>Install Git here</Button>}<Button small icon={ExternalLink} onClick={() => openUrl('git')}>Official download</Button><span className="step-hint">Restart the app if a new install isn't detected.</span></div>}
            </SetupStep>
            <SetupStep number="02" icon={Github} title="Install GitHub CLI" subtitle="The official tool used to authenticate and create repositories." ok={!!setup.gh?.installed}>
              {setup.gh?.installed ? <div className="setup-status-detail"><CheckCircle2 size={16}/> {setup.gh.version || 'GitHub CLI detected'}</div> : <div className="step-actions">{setup.platform === 'win32' && setup.winget && <Button kind="primary" small icon={HardDriveDownload} disabled={!!busy} loading={busy === 'install-gh'} onClick={() => run('install-gh', () => API.install('gh'), { success: 'GitHub CLI installation finished.' })}>Install GitHub CLI here</Button>}<Button small icon={ExternalLink} onClick={() => openUrl('gh')}>Official download</Button></div>}
            </SetupStep>
            <SetupStep number="03" icon={KeyRound} title="Connect your GitHub account" subtitle="Sign in through GitHub's official browser authorization." ok={!!setup.account}>
              {setup.account ? <><div className="account-ready"><div className="account-avatar"><Github size={21}/></div><div><strong>@{setup.account}</strong><small>Authenticated with GitHub CLI</small></div><CheckCircle2 size={18} className="good"/></div><Button small icon={KeyRound} kind="secondary" disabled={!!busy} loading={busy === 'setup-git'} onClick={() => run('setup-git', () => API.configureGit(), { success: 'Git HTTPS credentials configured.' })}>Configure Git credentials</Button></> : <div className="auth-section"><div className="step-actions"><Button kind="primary" small icon={Github} loading={busy === 'signin' || data?.authRunning} disabled={!setup.gh?.installed || !!busy || data?.authRunning} onClick={authStart}>{data?.authRunning ? 'Waiting for browser approval…' : 'Sign in with GitHub'}</Button>{data?.authRunning && <Button small icon={X} onClick={() => run('cancel-signin', () => API.cancelSignIn(), { quiet: true })}>Cancel</Button>}</div>{data?.authRunning && <div className="auth-notice"><Info size={18}/><div><strong>Approve sign-in in your browser.</strong><p>The one-time code is copied by GitHub CLI when supported. You can open the device authorization page manually.</p>{authCode && <div className="auth-code"><span>{authCode}</span><Copyable text={authCode}/></div>}<button className="inline-action" onClick={() => openUrl('device')}>Open GitHub device login <ExternalLink size={14}/></button></div></div>}<p className="step-hint">Credentials are handled by GitHub CLI, not stored by Push Studio. If browser login is blocked, you can run <code>gh auth login --web</code> in a terminal and refresh.</p></div>}
            </SetupStep>
            <SetupStep number="04" icon={UserRound} title="Set your commit identity" subtitle="Your name and email are attached to every commit you create." ok={!!setup.identity?.name && !!setup.identity?.email}>
              <form className="identity-form" onSubmit={event => { event.preventDefault(); run('identity', () => API.saveIdentity(identity), { success: 'Commit author details saved.' }) }}><div><label htmlFor="git-name">Author name</label><input id="git-name" autoComplete="name" value={identity.name} onChange={e => setIdentity(v => ({ ...v, name: e.target.value }))} placeholder="Your Name" required/></div><div><label htmlFor="git-email">Commit email</label><input id="git-email" autoComplete="email" type="email" value={identity.email} onChange={e => setIdentity(v => ({ ...v, email: e.target.value }))} placeholder="you@example.com" required/></div><Button type="submit" kind="secondary" small icon={Check} loading={busy === 'identity'} disabled={!setup.git?.installed || !!busy}>Save identity</Button></form><p className="step-hint">For email privacy, you can use your GitHub-provided noreply address.</p>
            </SetupStep>
          </div>
          <section className="white-panel tools-panel"><div><h3><Code2 size={19}/> Optional Python diagnostics</h3><p>Read-only local checks. Python is not required to use the desktop app.</p></div><Button small icon={Activity} disabled={!!busy} loading={busy === 'doctor'} onClick={async () => { setBusy('doctor'); try { const result = await API.doctor(); if (result?.error) throw new Error(result.error); setPythonResult(result); inform('Diagnostics completed.') } catch (e) { inform(e.message, 'error') } finally { setBusy('') } }}>Run diagnostics</Button>{pythonResult && <div className="doctor-results">{pythonResult.checks.map(item => <div key={item.name}><span>{item.ok ? <CheckCircle2 size={16} className="good"/> : <CircleAlert size={16} className="warn"/>}{item.name}</span><small>{item.detail}</small></div>)}</div>}</section>
          <div className="bottom-info"><span><LockKeyhole size={15}/> Push Studio never asks for or stores GitHub passwords or access tokens.</span><button onClick={() => refresh()}>Recheck setup <RefreshCw size={14}/></button></div>
        </div>}

        {view === 'activity' && <div className="page-content narrow-page"><div className="page-kicker">EVENT HISTORY <span className="kicker-line" /></div><div className="page-title-row"><div><h1>Activity log<span className="heading-period">.</span></h1><p>See the actions your application has completed and any errors to resolve.</p></div><Button small icon={RefreshCw} onClick={() => refresh()}>Refresh</Button></div><section className="white-panel activity-panel"><PanelHeader eyebrow="RECENT ACTIONS" title="Session history" action={<StatePill ok label={`${(data?.activity || []).length} events`}/>} />{data?.activity?.length ? data.activity.map(item => <div className="activity-row" key={item.id}><span className={`activity-icon ${item.kind === 'error' ? 'activity-error' : item.kind === 'success' ? 'activity-success' : ''}`}>{item.kind === 'error' ? <CircleAlert size={18} /> : item.kind === 'success' ? <Check size={18} /> : <Terminal size={18} />}</span><div><strong>{item.message}</strong><span>{item.kind === 'error' ? 'Action needs attention' : item.kind === 'success' ? 'Completed successfully' : 'System event'}</span></div><time dateTime={item.at}>{ago(item.at)}</time></div>) : <div className="empty-state changes-empty"><div className="empty-state-icon"><Activity size={23}/></div><h3>No activity yet</h3><p>Actions such as sign-in, repository creation and pushes appear here.</p></div>}</section></div>}
      </div>
      <footer className="statusbar"><span><Dot ok={!!setup.git?.installed}/> Git {setup.git?.installed ? 'ready' : 'missing'}</span><span><Dot ok={!!setup.gh?.installed}/> GitHub CLI {setup.gh?.installed ? 'ready' : 'missing'}</span><span className="footer-spacer"/>{busy && <span className="footer-busy"><RefreshCw size={12} className="spin"/> Working: {busy.replaceAll('-', ' ')}</span>}<span><ShieldCheck size={13}/> Safe publishing</span></footer>
    </main>
    {toast && <div key={toast.id} className={`toast ${toast.variant === 'error' ? 'toast-error' : ''}`} role="status" aria-live="polite"><span>{toast.variant === 'error' ? <CircleAlert size={18}/> : <CheckCircle2 size={18}/>}</span><p>{toast.text}</p><IconButton icon={X} label="Dismiss notification" onClick={() => setToast(null)}/></div>}
  </div>
}
