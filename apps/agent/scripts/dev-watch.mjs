#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const WATCH_ROOTS = ['src', 'catalog']
const WATCH_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.json'])
const POLL_MS = Number(process.env.MOVSCRIPT_AGENT_DEV_POLL_MS || 700)
const parentPid = Number(process.env.MOVSCRIPT_AGENT_PARENT_PID || 0)

let child = null
let snapshot = new Map()
let scanning = false
let restarting = false
let stopped = false
let timer = null
let parentTimer = null

function startAgent() {
  if (stopped) return
  console.info(`[agent:dev] starting ${process.execPath} --import tsx src/server.ts (cwd=${process.cwd()} agentPort=${process.env.MOVSCRIPT_AGENT_PORT || 'unset'} mcpEndpoint=${process.env.MOVSCRIPT_MCP_ENDPOINT || 'unset'})`)
  const startedAt = Date.now()
  child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
  console.info(`[agent:dev] child pid=${child.pid ?? 'unknown'}`)
  child.on('exit', (code, signal) => {
    const elapsedMs = Date.now() - startedAt
    if (stopped) {
      console.info(`[agent:dev] child exited code=${code ?? 'null'} signal=${signal ?? 'null'} elapsedMs=${elapsedMs} (shutdown in progress)`)
      return
    }
    console.info(`[agent:dev] child exited code=${code ?? 'null'} signal=${signal ?? 'null'} elapsedMs=${elapsedMs}; waiting for file changes`)
    child = null
    if (!restarting && code && elapsedMs < 3_000) {
      console.warn(`[agent:dev] child exited with code=${code} after only ${elapsedMs}ms; propagating exit (no restart). Inspect the agent stdout/stderr above for the real cause.`)
      stopped = true
      if (timer) clearInterval(timer)
      process.exit(code)
    }
  })
}

async function stopAgent() {
  const current = child
  child = null
  if (!current || current.exitCode !== null || current.signalCode !== null) return

  await new Promise((resolve) => {
    let exited = false
    const timer = setTimeout(() => {
      if (!exited) current.kill('SIGKILL')
      resolve()
    }, 2_000)
    current.once('exit', () => {
      exited = true
      clearTimeout(timer)
      resolve()
    })
    current.kill('SIGTERM')
  })
}

async function restartAgent() {
  if (restarting || stopped) return
  restarting = true
  try {
    console.info('[agent:dev] change detected; restarting')
    await stopAgent()
    if (!stopped) startAgent()
  } finally {
    restarting = false
  }
}

function getSignalExitCode(signal) {
  if (signal === 'SIGINT') return 130
  if (signal === 'SIGTERM') return 143
  if (signal === 'SIGHUP') return 129
  return 1
}

async function collectSnapshot() {
  const next = new Map()
  for (const root of WATCH_ROOTS) {
    await collectFiles(root, next)
  }
  return next
}

async function collectFiles(dir, next) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      await collectFiles(path, next)
      continue
    }
    if (!entry.isFile()) continue
    if (!WATCH_EXTENSIONS.has(path.slice(path.lastIndexOf('.')))) continue
    const info = await stat(path)
    next.set(path, `${info.mtimeMs}:${info.size}`)
  }
}

function changed(previous, next) {
  if (previous.size !== next.size) return true
  for (const [path, value] of next) {
    if (previous.get(path) !== value) return true
  }
  return false
}

async function tick() {
  if (scanning || stopped) return
  scanning = true
  try {
    const next = await collectSnapshot()
    if (changed(snapshot, next)) {
      snapshot = next
      await restartAgent()
    }
  } catch (error) {
    console.warn(`[agent:dev] watch scan failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    scanning = false
  }
}

function parentProcessIsAlive() {
  if (!parentPid || parentPid === process.pid) return true
  try {
    process.kill(parentPid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    return true
  }
}

async function shutdown(signal) {
  if (stopped) return
  stopped = true
  if (timer) clearInterval(timer)
  if (parentTimer) clearInterval(parentTimer)
  await stopAgent()
  process.exit(getSignalExitCode(signal))
}

snapshot = await collectSnapshot()
startAgent()
timer = setInterval(() => {
  void tick()
}, POLL_MS)

if (parentPid) {
  parentTimer = setInterval(() => {
    if (!parentProcessIsAlive()) {
      void shutdown('SIGHUP')
    }
  }, Math.max(POLL_MS, 1_000))
}

process.once('SIGINT', () => {
  void shutdown('SIGINT')
})
process.once('SIGTERM', () => {
  void shutdown('SIGTERM')
})
process.once('SIGHUP', () => {
  void shutdown('SIGHUP')
})
