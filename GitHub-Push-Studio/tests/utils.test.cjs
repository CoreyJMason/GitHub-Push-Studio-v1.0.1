const test = require('node:test')
const assert = require('node:assert/strict')
const { parseStatus, normalizeGithubUrl, validateRepoName, sensitivePath, validateCommitMessage, isSafeGitBranch } = require('../electron/utils.cjs')

test('parses changed, deleted and untracked paths containing spaces', () => {
  const files = parseStatus(' M src/main app.js\0?? my new file.txt\0 D removed.js\0')
  assert.deepEqual(files.map(x => x.status), ['modified', 'untracked', 'deleted'])
  assert.equal(files[0].path, 'src/main app.js')
})
test('reads rename extra path correctly', () => {
  const files = parseStatus('R  new name.js\0old name.js\0?? extra.js\0')
  assert.equal(files.length, 2)
  assert.equal(files[0].from, 'old name.js')
})
test('accepts only normal GitHub HTTPS and SSH URLs', () => {
  assert.equal(normalizeGithubUrl('https://github.com/user/repo.git').https, 'https://github.com/user/repo')
  assert.equal(normalizeGithubUrl('git@github.com:user/repo.git').repo, 'repo')
  assert.equal(normalizeGithubUrl('https://github.com.evil.com/a/b'), null)
  assert.equal(normalizeGithubUrl('https://evil.com/a/b'), null)
})
test('validates names and messages', () => {
  assert.equal(validateRepoName('my-project'), true)
  assert.equal(validateRepoName('foo/bar'), false)
  assert.equal(validateCommitMessage('Fix login'), true)
  assert.equal(validateCommitMessage(''), false)
  assert.equal(isSafeGitBranch('feature/my-work'), true)
  assert.equal(isSafeGitBranch('-unsafe'), false)
})
test('flags obvious private files while allowing examples', () => {
  assert.equal(sensitivePath('backend/.env.production'), true)
  assert.equal(sensitivePath('certs/key.pem'), true)
  assert.equal(sensitivePath('.env.example'), false)
  assert.equal(sensitivePath('src/index.js'), false)
})
