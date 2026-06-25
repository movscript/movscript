#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const appDir = resolve(scriptDir, '..')
const repoDir = resolve(appDir, '../..')
const workspaceDir = resolve(process.env.MOVSCRIPT_HOME || process.env.MOVSCRIPT_WORKSPACE_DIR || resolve(repoDir, '.movscript-dev', '.movscript'))
const runtimeDir = resolve(workspaceDir, 'runtime')
const platform = process.platform
const serverName = platform === 'win32' ? 'movscript-server.exe' : 'movscript-server'
const sourceServer = resolve(repoDir, 'services/data-service/bin', serverName)
const targetServer = resolve(workspaceDir, 'bin', serverName)
const localNodeApplicationId = 'movscript.local-node'
const localNodeServices = new Set([
  'movscript.local-node.control',
  'movscript.local-node.gateway',
  'movscript.data.service',
  'movscript.project.service',
  'movscript.editing.service',
  'movscript.canvas.service',
  'movscript.local-surface.host',
  'movscript.media.pipeline',
])

if (process.argv.includes('--help')) {
  console.log(`usage: node apps/desktop/scripts/dev-local-daemon-refresh.mjs [--no-stop] [--no-prune]

Installs the freshly built data-service binary into the dev MovScript home,
then stops and clears stale local runtime endpoint/service records so Desktop
starts a fresh local daemon on next boot.
`)
  process.exit(0)
}

const shouldStop = !process.argv.includes('--no-stop')
const shouldPrune = !process.argv.includes('--no-prune')

main().catch((error) => {
  console.error(`[dev-local-daemon-refresh] ${error?.stack || error?.message || String(error)}`)
  process.exit(1)
})

async function main() {
  console.info(`[dev-local-daemon-refresh] workspace: ${workspaceDir}`)
  installDataServiceBinary()
  if (shouldStop) await stopLocalRuntimeDaemon()
  if (shouldPrune) await pruneRuntimeRecords()
}

function installDataServiceBinary() {
  if (!existsSync(sourceServer)) {
    throw new Error(`data-service binary is missing: ${sourceServer}\nRun pnpm --filter @movscript/data-service build first.`)
  }
  mkdirSync(dirname(targetServer), { recursive: true })
  copyFileSync(sourceServer, targetServer)
  if (platform !== 'win32') chmodSync(targetServer, 0o755)
  console.info(`[dev-local-daemon-refresh] installed data-service: ${targetServer}`)
}

async function stopLocalRuntimeDaemon() {
  const controlEndpoint = readEndpointURL(resolve(runtimeDir, 'endpoints', 'movscript.local-node.control.json'))
  if (controlEndpoint) {
    try {
      const response = await fetch(`${controlEndpoint}/shutdown`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      })
      if (response.ok) {
        console.info(`[dev-local-daemon-refresh] stopped local daemon via ${controlEndpoint}`)
        await waitForEndpointToStop(controlEndpoint, 5000)
        return
      }
      console.warn(`[dev-local-daemon-refresh] daemon shutdown returned HTTP ${response.status}; falling back to pid cleanup`)
    } catch (error) {
      console.warn(`[dev-local-daemon-refresh] daemon control unavailable: ${errorMessage(error)}`)
    }
  }

  const appRecord = readJSON(resolve(runtimeDir, 'apps', 'movscript.local-node.json'))
  const pid = numberField(appRecord?.pid)
  if (!pid || pid === process.pid) {
    console.info('[dev-local-daemon-refresh] no local daemon pid to stop')
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
    console.info(`[dev-local-daemon-refresh] sent SIGTERM to local daemon pid ${pid}`)
    await waitForPidExit(pid, 5000)
  } catch (error) {
    if (error?.code === 'ESRCH') {
      console.info(`[dev-local-daemon-refresh] local daemon pid ${pid} is not running`)
      return
    }
    console.warn(`[dev-local-daemon-refresh] failed to stop local daemon pid ${pid}: ${errorMessage(error)}`)
  }
}

async function pruneRuntimeRecords() {
  let pruned = 0
  for (const path of runtimeEndpointRecordPaths()) {
    const record = readJSON(path)
    if (isLocalNodeEndpointRecord(record)) {
      await removePath(path)
      pruned += 1
      console.info(`[dev-local-daemon-refresh] pruned ${path}`)
    }
  }
  for (const { dir, path } of runtimeServiceRecordPaths()) {
    const record = readJSON(path)
    if (isLocalNodeServiceRecord(record)) {
      await removePath(path)
      pruneEmptyDir(dir)
      pruned += 1
      console.info(`[dev-local-daemon-refresh] pruned ${path}`)
    }
  }
  const lockPath = resolve(runtimeDir, 'locks', 'movscript.local-node.startup.lock')
  if (existsSync(lockPath)) {
    await removePath(lockPath)
    pruned += 1
    console.info(`[dev-local-daemon-refresh] pruned ${lockPath}`)
  }
  console.info(`[dev-local-daemon-refresh] pruned ${pruned} local daemon runtime record${pruned === 1 ? '' : 's'}`)
}

function readEndpointURL(path) {
  const record = readJSON(path)
  if (!record || typeof record !== 'object') return ''
  return stringField(record.baseURL) || stringField(record.url)
}

function readJSON(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

function runtimeEndpointRecordPaths() {
  return safeReaddir(resolve(runtimeDir, 'endpoints'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => resolve(runtimeDir, 'endpoints', name))
}

function runtimeServiceRecordPaths() {
  const servicesDir = resolve(runtimeDir, 'services')
  return safeReaddir(servicesDir).flatMap((serviceDirName) => {
    const dir = join(servicesDir, serviceDirName)
    return safeReaddir(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => ({ dir, path: join(dir, name) }))
  })
}

function isLocalNodeEndpointRecord(record) {
  if (!record || typeof record !== 'object') return false
  const serviceName = stringField(record.serviceName)
  return stringField(record.applicationId) === localNodeApplicationId
    || (serviceName ? localNodeServices.has(serviceName) : false)
}

function isLocalNodeServiceRecord(record) {
  if (!record || typeof record !== 'object') return false
  const endpoint = record.endpoint && typeof record.endpoint === 'object' ? record.endpoint : undefined
  const serviceName = stringField(record.serviceName)
  return stringField(record.ownerApplicationId) === localNodeApplicationId
    || stringField(record.applicationId) === localNodeApplicationId
    || stringField(endpoint?.applicationId) === localNodeApplicationId
    || (serviceName ? localNodeServices.has(serviceName) : false)
}

function safeReaddir(path) {
  try {
    return readdirSync(path)
  } catch {
    return []
  }
}

async function removePath(path) {
  let lastError
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
      return
    } catch (error) {
      lastError = error
      await delay(100)
    }
  }
  throw lastError
}

function pruneEmptyDir(path) {
  try {
    if (safeReaddir(path).length === 0) rmdirSync(path)
  } catch {
    // Active runtime writers may recreate records while this script is cleaning up.
  }
}

async function waitForEndpointToStop(endpoint, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(500) })
      if (!response.ok) return
    } catch {
      return
    }
    await delay(150)
  }
  console.warn(`[dev-local-daemon-refresh] daemon control still responds after shutdown timeout: ${endpoint}`)
}

async function waitForPidExit(pid, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      process.kill(pid, 0)
    } catch {
      return
    }
    await delay(150)
  }
  console.warn(`[dev-local-daemon-refresh] local daemon pid ${pid} still exists after shutdown timeout`)
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

function stringField(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberField(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function errorMessage(error) {
  return error?.message || String(error)
}
