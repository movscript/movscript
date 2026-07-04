import { randomBytes, createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveMovScriptWorkspaceRootPaths } from '@movscript/workspace/home'

// Legacy Electron userData compatibility is limited to preserving existing local-backend secrets.
// MOVSCRIPT_DESKTOP_USER_DATA_DIR/userDataDir remain Desktop identity inputs, not new backend state roots.

export function resolveLocalDataDir(movScriptHomeDir: string): string {
  const explicit = process.env.MOVSCRIPT_DATA_DIR?.trim()
  if (explicit) return explicit
  return join(resolveMovScriptWorkspaceRootPaths(movScriptHomeDir).backendDir, 'local-data')
}

export function resolveLocalBackendLogPath(movScriptHomeDir: string): string {
  return join(resolveMovScriptWorkspaceRootPaths(movScriptHomeDir).logsDir, 'local-backend.log')
}

export function resolveLocalBackendPidPath(movScriptHomeDir: string): string {
  return join(resolveMovScriptWorkspaceRootPaths(movScriptHomeDir).backendDir, 'local-backend.pid')
}

export function resolveLocalSecret(dataDir: string): string {
  const homeDir = process.env.MOVSCRIPT_HOME?.trim() || process.env.MOVSCRIPT_WORKSPACE_DIR?.trim() || dataDir
  const backendDir = resolveMovScriptWorkspaceRootPaths(homeDir).backendDir
  const secretPath = join(backendDir, 'local-backend-secret.json')
  mkdirSync(backendDir, { recursive: true })

  const existing = readSecret(secretPath)
  if (existing) return existing

  const legacy = existsSync(join(dataDir, 'movscript-frontend.db'))
    ? createHash('sha256').update(dataDir).digest('hex')
    : ''
  const secret = legacy || randomBytes(32).toString('hex')
  writeFileSync(secretPath, `${JSON.stringify({ schema: 'movscript.local-backend-secret.v1', secret }, null, 2)}\n`, 'utf8')
  return secret
}

function readSecret(path: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { secret?: unknown }
    return typeof parsed.secret === 'string' && /^[0-9a-f]{64}$/.test(parsed.secret) ? parsed.secret : undefined
  } catch {
    return undefined
  }
}
