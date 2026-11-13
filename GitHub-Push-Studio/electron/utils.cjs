const path = require('node:path')

const RECOMMENDED_IGNORE = `# Dependencies and generated files\nnode_modules/\ndist/\nbuild/\ncoverage/\n.next/\n.venv/\n__pycache__/\n*.pyc\n\n# Secrets and local configuration\n.env\n.env.*\n!.env.example\n!.env.sample\n*.pem\n*.p12\n*.pfx\n\n# Operating system / editor\n.DS_Store\nThumbs.db\n.vscode/\n.idea/\n`

function validateRepoName(name) {
  return typeof name === 'string' && /^[\w.-]{1,100}$/.test(name) && !['.', '..'].includes(name) && !name.endsWith('.git')
}
function validateCommitMessage(message) {
  return typeof message === 'string' && message.trim().length >= 3 && message.trim().length <= 240 && !/[\x00-\x08\x0B-\x1F\x7F]/.test(message)
}
function normalizeGithubUrl(url) {
  if (typeof url !== 'string') return null
  let match
  const value = url.trim()
  match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(value)
  if (!match) match = /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/i.exec(value)
  if (!match || match[1] === '.' || match[2] === '.' || match[1] === '..' || match[2] === '..') return null
  return { owner: match[1], repo: match[2], https: `https://github.com/${match[1]}/${match[2]}`, git: value }
}
function parseStatus(output) {
  if (typeof output !== 'string' || !output) return []
  const parts = output.split('\0')
  const files = []
  for (let i = 0; i < parts.length; i++) {
    const record = parts[i]
    if (!record || record.length < 3) continue
    const xy = record.slice(0, 2)
    const file = record.slice(3)
    if (!file) continue
    let from = null
    if (xy.includes('R') || xy.includes('C')) from = parts[++i] || null
    let status = 'modified'
    if (xy === '??') status = 'untracked'
    else if (xy.includes('D')) status = 'deleted'
    else if (xy.includes('A')) status = 'added'
    else if (xy.includes('R')) status = 'renamed'
    else if (xy.includes('U')) status = 'conflict'
    files.push({ path: file, status, staged: xy[0] !== ' ' && xy[0] !== '?', from })
  }
  return files
}
function sensitivePath(file) {
  const base = path.posix.basename(String(file).replace(/\\/g, '/')).toLowerCase()
  if (['.env.example', '.env.sample', '.env.template'].includes(base)) return false
  return /^(\.env($|\.)|id_rsa$|id_ed25519$|credentials\.json$|service-account.*\.json$|\.npmrc$)/i.test(base) || /\.(pem|p12|pfx|key|keystore|jks)$/i.test(base)
}
function isSafeGitBranch(name) {
  return typeof name === 'string' && name.length > 0 && name.length < 220 && !name.startsWith('-') && !/[\x00-\x20~^:?*\[\\]/.test(name) && !name.includes('..') && !name.endsWith('/') && !name.includes('@{')
}
module.exports = { RECOMMENDED_IGNORE, validateRepoName, validateCommitMessage, normalizeGithubUrl, parseStatus, sensitivePath, isSafeGitBranch }
