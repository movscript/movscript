import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/workspace/home'
import { resolveMovScriptHomeDir } from './movscriptHomeInput'
import type {
  ElectronDesktopStateInput,
  ElectronDesktopStateResult,
  ElectronDesktopStateSaveInput,
} from '../../src/shared/contracts/electronApi'

const DESKTOP_STATE_FILE_SCHEMA = 'movscript.desktop-state.v1'
const DESKTOP_STATE_DIR_NAME = 'desktop-state'

export function readDesktopState(input: ElectronDesktopStateInput): ElectronDesktopStateResult {
  const paths = resolveDesktopStatePaths(input)
  const parsed = readJSON(paths.path)
  const value = isDesktopStateFile(parsed, paths.key) ? parsed.value : null
  return {
    key: paths.key,
    movScriptHomeDir: paths.movScriptHomeDir,
    workspaceDir: paths.movScriptHomeDir,
    path: paths.path,
    version: fileVersion(paths.path),
    value,
  }
}

export function writeDesktopState(input: ElectronDesktopStateSaveInput): ElectronDesktopStateResult {
  const paths = resolveDesktopStatePaths(input)
  if (input.expectedVersion !== undefined && input.expectedVersion !== null) {
    const currentVersion = fileVersion(paths.path)
    if (currentVersion !== input.expectedVersion) {
      throw new Error(`Desktop state ${paths.key} changed before it could be saved.`)
    }
  }
  writeJSONAtomic(paths.path, {
    schema: DESKTOP_STATE_FILE_SCHEMA,
    key: paths.key,
    updatedAt: new Date().toISOString(),
    value: serializableValue(input.value),
  })
  return readDesktopState({ key: paths.key, movScriptHomeDir: paths.movScriptHomeDir })
}

export function removeDesktopState(input: ElectronDesktopStateInput): { ok: true; key: string; movScriptHomeDir: string; workspaceDir: string; path: string } {
  const paths = resolveDesktopStatePaths(input)
  rmSync(paths.path, { force: true })
  return {
    ok: true,
    key: paths.key,
    movScriptHomeDir: paths.movScriptHomeDir,
    workspaceDir: paths.movScriptHomeDir,
    path: paths.path,
  }
}

function resolveDesktopStatePaths(input: ElectronDesktopStateInput) {
  const key = normalizeDesktopStateKey(input.key)
  const movScriptHomeDir = resolveMovScriptHomeDir(input)
  const root = resolveMovScriptWorkspaceRootPaths(movScriptHomeDir)
  ensureMovScriptWorkspaceRoot(root)
  return {
    key,
    movScriptHomeDir: root.workspaceDir,
    path: join(root.rootDir, DESKTOP_STATE_DIR_NAME, `${key}.json`),
  }
}

function normalizeDesktopStateKey(value: unknown): string {
  const key = typeof value === 'string' ? value.trim() : ''
  if (!/^[a-zA-Z0-9._-]{1,96}$/.test(key) || key === '.' || key === '..') {
    throw new Error('Desktop state key must be a safe file segment.')
  }
  return key
}

function isDesktopStateFile(value: unknown, key: string): value is { schema: typeof DESKTOP_STATE_FILE_SCHEMA; key: string; value: unknown } {
  return isRecord(value) && value.schema === DESKTOP_STATE_FILE_SCHEMA && value.key === key
}

function serializableValue(value: unknown): unknown {
  if (value === undefined) return null
  const serialized = JSON.stringify(value)
  if (serialized === undefined) return null
  return JSON.parse(serialized) as unknown
}

function readJSON(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

function writeJSONAtomic(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmpPath, filePath)
}

function fileVersion(filePath: string): string {
  if (!existsSync(filePath)) return ''
  const stat = statSync(filePath)
  return `${stat.mtimeMs}:${stat.size}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}
