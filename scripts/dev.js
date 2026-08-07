import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'

const projectRoot = process.cwd()
const serverPort = Number(process.env.PORT || 4000)
const isHostedProduction = process.env.RENDER === 'true' || process.env.NODE_ENV === 'production'
const children = new Set()
let shuttingDown = false

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: 'localhost', port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
    socket.setTimeout(500, () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function waitForPort(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

function startNodeProcess(argumentsList, label) {
  const child = spawn(process.execPath, argumentsList, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  })
  children.add(child)
  child.once('exit', (code, signal) => {
    children.delete(child)
    if (!shuttingDown && code !== 0) {
      console.error(`[dev] ${label} stopped unexpectedly (${signal || code}).`)
      shutdown(code || 1)
    }
  })
  return child
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  setTimeout(() => process.exit(exitCode), 50).unref()
}

process.once('SIGINT', () => shutdown(0))
process.once('SIGTERM', () => shutdown(0))

if (isHostedProduction) {
  const buildProcess = startNodeProcess(
    [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build'],
    'Vite build',
  )
  const buildExitCode = await new Promise((resolve) => {
    buildProcess.once('exit', (code) => resolve(code ?? 1))
  })

  if (buildExitCode === 0 && !shuttingDown) {
    startNodeProcess([path.join('server', 'index.js')], 'production server')
  }
} else {
  if (await isPortOpen(serverPort)) {
    console.log(`[dev] Reusing the API server already running on port ${serverPort}.`)
  } else {
    startNodeProcess([path.join('server', 'index.js')], 'API server')
    if (!(await waitForPort(serverPort))) {
      console.error(`[dev] API server did not become ready on port ${serverPort}.`)
      shutdown(1)
    }
  }

  startNodeProcess([path.join('node_modules', 'vite', 'bin', 'vite.js')], 'Vite')
}
