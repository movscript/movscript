#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const WATCH_ROOTS = ['src', 'catalog']
const WATCH_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.json'])
const POLL_MS = Number(process.env.MOVSCRIPT_AGENT_DEV_POLL_MS || 700)

let child = null
let snapshot = new Map()
let scanning = false
let restarting = false
let stopped = false

function startAgent() {
  console.info('[agent:dev] starting node --import tsx src/server.ts')
  child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
  child.on('exit', (code, signal) => {
    if (stopped) return
    console.info(`[agent:dev] child exited code=${code ?? 'null'} signal=${signal ?? 'null'}; waiting for file changes`)
    child = null
  })
}

async function stopAgent() {
  const current = child
  child = null
  if (!current || current.killed) return

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!current.killed) current.kill('SIGKILL')
      resolve()
    }, 2_000)
    current.once('exit', () => {
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

async function shutdown(signal) {
  stopped = true
  clearInterval(timer)
  await stopAgent()
  process.kill(process.pid, signal)
}

snapshot = await collectSnapshot()
startAgent()
const timer = setInterval(() => {
  void tick()
}, POLL_MS)

process.once('SIGINT', () => {
  void shutdown('SIGINT')
})
process.once('SIGTERM', () => {
  void shutdown('SIGTERM')
})
