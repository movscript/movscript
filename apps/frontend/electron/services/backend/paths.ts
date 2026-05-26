import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { app } from 'electron'

export function resolveBackendBinary(): string {
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

export function resolveBackendCwd(binaryPath: string): string {
  if (app.isPackaged) return join(binaryPath, '..')
  return resolve(process.cwd(), '../backend')
}

export function resolveAdminDir(): string {
  const envPath = process.env.MOVSCRIPT_ADMIN_DIR?.trim()
  if (envPath) return envPath
  if (app.isPackaged) return join(process.resourcesPath, 'backend', 'admin')
  return resolve(process.cwd(), '../admin/dist')
}

export function resolveLocalDataDir(): string {
  return process.env.MOVSCRIPT_DATA_DIR?.trim() || join(app.getPath('userData'), 'local-backend')
}

export function resolveLocalSecret(dataDir: string): string {
  const seed = `${app.getPath('userData')}:${dataDir}:movscript-local-backend`
  return createHash('sha256').update(seed).digest('hex')
}
