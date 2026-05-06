import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { app } from 'electron'

let proc: ChildProcess | null = null

export type BackendLaunchPolicy = 'external' | 'spawn' | 'cloud'

export function getBackendLaunchPolicy(): BackendLaunchPolicy {
  const raw = process.env.MOVSCRIPT_BACKEND_POLICY?.trim()
  if (raw === 'external' || raw === 'spawn' || raw === 'cloud') return raw
  return process.env.NODE_ENV === 'development' ? 'external' : 'cloud'
}

export async function startBackend(policy: BackendLaunchPolicy = getBackendLaunchPolicy()): Promise<void> {
  if (policy !== 'spawn') {
    console.info(`[backend] launch policy=${policy}; not spawning local backend`)
    return
  }
  if (proc) return

  const bin = resolveBackendBinary()
  const adminDir = resolveAdminDir()
  proc = spawn(bin, [], {
    cwd: resolveBackendCwd(bin),
    env: {
      ...process.env,
      MOVSCRIPT_APP_MODE: process.env.MOVSCRIPT_APP_MODE || 'local',
      MOVSCRIPT_ADMIN_DIR: process.env.MOVSCRIPT_ADMIN_DIR || adminDir,
      STORAGE_BACKEND: process.env.STORAGE_BACKEND || 'filesystem',
    },
    stdio: 'inherit'
  })

  proc.on('error', (err) => console.error('[backend]', err))
  proc.on('exit', (code, signal) => {
    console.info(`[backend] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    proc = null
  })

  await new Promise((r) => setTimeout(r, 500))
}

function resolveBackendBinary(): string {
  const envPath = process.env.MOVSCRIPT_BACKEND_BIN?.trim()
  if (envPath) return envPath

  const binary = process.platform === 'win32' ? 'server.exe' : 'server'
  const candidates = app.isPackaged
    ? [
        join(process.resourcesPath, 'backend', binary),
        join(app.getAppPath(), '..', 'backend', binary),
      ]
    : [
        resolve(process.cwd(), '../backend/bin', binary),
        resolve(process.cwd(), '../../apps/backend/bin', binary),
      ]

  const found = candidates.find((candidate) => existsSync(candidate))
  if (found) return found
  return candidates[0]
}

function resolveBackendCwd(binaryPath: string): string {
  if (app.isPackaged) return join(binaryPath, '..')
  return resolve(process.cwd(), '../backend')
}

function resolveAdminDir(): string {
  const envPath = process.env.MOVSCRIPT_ADMIN_DIR?.trim()
  if (envPath) return envPath
  if (app.isPackaged) return join(process.resourcesPath, 'backend', 'admin')
  return resolve(process.cwd(), '../admin/dist')
}

export async function stopBackend(): Promise<void> {
  if (proc) {
    proc.kill()
    proc = null
  }
}
