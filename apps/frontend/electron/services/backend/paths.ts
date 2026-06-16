import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import * as electron from 'electron'
import { resolveMovScriptWorkspaceRootPaths } from '@movscript/core/workspace/node'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../movscriptWorkspaceDefaults'

export function resolveBackendBinary(): string {
  const envPath = process.env.MOVSCRIPT_BACKEND_BIN?.trim()
  if (envPath) return envPath

  const binary = process.platform === 'win32' ? 'movscript-server.exe' : 'movscript-server'
  const legacyBinary = process.platform === 'win32' ? 'server.exe' : 'server'
  const candidates = electron.app.isPackaged
    ? [
        join(process.resourcesPath, 'backend', binary),
        join(process.resourcesPath, 'backend', legacyBinary),
        join(electron.app.getAppPath(), '..', 'backend', binary),
        join(electron.app.getAppPath(), '..', 'backend', legacyBinary),
      ]
    : [
        resolve(process.cwd(), '../backend/bin', binary),
        resolve(process.cwd(), '../backend/bin', legacyBinary),
        resolve(process.cwd(), '../../apps/backend/bin', binary),
        resolve(process.cwd(), '../../apps/backend/bin', legacyBinary),
      ]

  const found = candidates.find((candidate) => existsSync(candidate))
  if (found) return found
  return candidates[0]
}

export function resolveBackendCwd(binaryPath: string): string {
  if (electron.app.isPackaged) return join(binaryPath, '..')
  return resolve(process.cwd(), '../backend')
}

export function resolveLocalDataDir(movScriptHomeDir = resolveDesktopDefaultMovScriptWorkspaceDir()): string {
  const explicit = process.env.MOVSCRIPT_DATA_DIR?.trim()
  if (explicit) return explicit
  return join(resolveMovScriptWorkspaceRootPaths(movScriptHomeDir).backendDir, 'local-data')
}

export function resolveLocalSecret(dataDir: string): string {
  const seed = `${electron.app.getPath('userData')}:${dataDir}:movscript-local-backend`
  return createHash('sha256').update(seed).digest('hex')
}
