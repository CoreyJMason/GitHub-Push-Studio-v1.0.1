const test = require('node:test')
const assert = require('node:assert/strict')
const packageJson = require('../package.json')

test('Electron version is pinned to an established published version', () => {
  assert.match(packageJson.devDependencies.electron, /^\d+\.\d+\.\d+$/)
  assert.notEqual(packageJson.devDependencies.electron, '45.3.2')
})

test('required runtime packages and build scripts are declared', () => {
  for (const name of ['react', 'react-dom', 'lucide-react']) assert.ok(packageJson.dependencies[name])
  assert.ok(packageJson.devDependencies.vite)
  assert.ok(packageJson.scripts.build)
  assert.ok(packageJson.scripts.desktop)
})
