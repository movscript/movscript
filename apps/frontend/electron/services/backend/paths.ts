import { createHash, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import * as electron from 'electron'
import { resolveMovScriptWorkspaceRootPaths } from '@movscript/core/workspace/node'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../movscriptWorkspaceDefaults'

const LOCAL_BACKEND_SECRET_FILE_NAME = 'local-backend-secret.json'
const LOCAL_BACKEND_SECRET_SCHEMA = 'movscript.local-backend-secret.v1'
const LOCAL_BACKEND_LOG_FILE_NAME = 'local-backend.log'

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

export function resolveLocalBackendLogPath(movScriptHomeDir = resolveDesktopDefaultMovScriptWorkspaceDir()): string {
  return join(resolveMovScriptWorkspaceRootPaths(movScriptHomeDir).backendDir, 'logs', LOCAL_BACKEND_LOG_FILE_NAME)
}

export function resolveLocalSecret(dataDir: string): string {
  const movScriptHomeDir = resolveDesktopDefaultMovScriptWorkspaceDir()
  const root = resolveMovScriptWorkspaceRootPaths(movScriptHomeDir)
  const secretPath = join(root.backendDir, LOCAL_BACKEND_SECRET_FILE_NAME)
  const persisted = readPersistedLocalSecret(secretPath)
  if (persisted) return persisted

  const secret = shouldPreserveLegacyLocalSecret(dataDir)
    ? legacyLocalSecret(dataDir)
    : randomBytes(32).toString('hex')
  writePersistedLocalSecret(secretPath, secret)
  return secret
}

function legacyLocalSecret(dataDir: string): string {
  const userDataPath = electron.app?.getPath('userData') ?? ''
  const seed = `${userDataPath}:${dataDir}:movscript-local-backend`
  return createHash('sha256').update(seed).digest('hex')
}

function shouldPreserveLegacyLocalSecret(dataDir: string): boolean {
  return existsSync(join(dataDir, 'movscript-frontend.db'))
}

function readPersistedLocalSecret(secretPath: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(secretPath, 'utf8')) as unknown
    if (!isRecord(parsed) || parsed.schema !== LOCAL_BACKEND_SECRET_SCHEMA) return undefined
    const secret = typeof parsed.secret === 'string' ? parsed.secret.trim() : ''
    return isLocalSecret(secret) ? secret : undefined
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

function writePersistedLocalSecret(secretPath: string, secret: string): void {
  mkdirSync(join(secretPath, '..'), { recursive: true })
  const tmpPath = `${secretPath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(
    tmpPath,
    `${JSON.stringify({
      schema: LOCAL_BACKEND_SECRET_SCHEMA,
      updatedAt: new Date().toISOString(),
      secret,
    }, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
  renameSync(tmpPath, secretPath)
}

function isLocalSecret(secret: string): boolean {
  return /^[0-9a-f]{64}$/i.test(secret)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}
