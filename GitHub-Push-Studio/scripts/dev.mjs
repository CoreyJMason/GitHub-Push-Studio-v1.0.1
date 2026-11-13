import { spawn } from 'node:child_process'
import http from 'node:http'
import process from 'node:process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const vite = spawn(npm, ['exec', '--', 'vite', '--host', '127.0.0.1'], { stdio: 'inherit', shell: process.platform === 'win32' })
let electron = null
let finished = false
const stop = () => {
  if (finished) return
  finished = true
  vite.kill()
  electron?.kill()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
vite.on('exit', stop)

function reachable() {
  return new Promise(resolve => {
    const request = http.get('http://127.0.0.1:5173/', response => { response.resume(); resolve(true) })
    request.on('error', () => resolve(false))
    request.setTimeout(900, () => { request.destroy(); resolve(false) })
  })
}

for (let i = 0; i < 80 && !finished; i++) {
  if (await reachable()) break
  await new Promise(resolve => setTimeout(resolve, 300))
}
if (!finished && await reachable()) {
  const env = { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173' }
  electron = spawn(npm, ['exec', '--', 'electron', '.'], { stdio: 'inherit', shell: process.platform === 'win32', env })
  electron.on('exit', stop)
} else {
  console.error('Vite did not start on 127.0.0.1:5173')
  stop()
}
