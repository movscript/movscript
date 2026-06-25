#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, chmodSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
  if (shouldPrune) pruneRuntimeRecords()
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
  } catch (error) {
    if (error?.code === 'ESRCH') {
      console.info(`[dev-local-daemon-refresh] local daemon pid ${pid} is not running`)
      return
    }
    console.warn(`[dev-local-daemon-refresh] failed to stop local daemon pid ${pid}: ${errorMessage(error)}`)
  }
}

function pruneRuntimeRecords() {
  for (const path of [
    resolve(runtimeDir, 'endpoints'),
    resolve(runtimeDir, 'services'),
    resolve(runtimeDir, 'locks', 'movscript.local-node.startup.lock'),
  ]) {
    rmSync(path, { recursive: true, force: true })
    console.info(`[dev-local-daemon-refresh] pruned ${path}`)
  }
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

function stringField(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberField(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function errorMessage(error) {
  return error?.message || String(error)
}
