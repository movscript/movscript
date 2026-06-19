import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/core/workspace/node'
import { resolveMovScriptHomeDir } from './movscriptHomeInput'
import type {
  ElectronAgentSessionState,
  ElectronAgentSessionStateResult,
  ElectronMovScriptHomeInput,
} from '../../src/shared/contracts/electronApi'

const AGENT_SESSION_FILE_SCHEMA = 'movscript.desktop-agent-sessions.v1'
const AGENT_SESSION_DIR_NAME = 'agent'
const AGENT_SESSION_FILE_NAME = 'sessions.json'

export function emptyDesktopAgentSessionState(): ElectronAgentSessionState {
  return {
    activeConversationIdsByUser: {},
    activeConversationIdsByScope: {},
    conversationsById: {},
    workspacesByUser: {},
  }
}

export function readDesktopAgentSessionState(input?: ElectronMovScriptHomeInput): ElectronAgentSessionStateResult {
  const paths = resolveDesktopAgentSessionPaths(input)
  const parsed = readJSON(paths.path)
  const state = normalizeAgentSessionFile(parsed)
  return {
    movScriptHomeDir: paths.movScriptHomeDir,
    workspaceDir: paths.movScriptHomeDir,
    path: paths.path,
    version: fileVersion(paths.path),
    state,
  }
}

export function writeDesktopAgentSessionState(input: ElectronMovScriptHomeInput & { state?: unknown; expectedVersion?: string | null }): ElectronAgentSessionStateResult {
  const paths = resolveDesktopAgentSessionPaths(input)
  if (input.expectedVersion !== undefined && input.expectedVersion !== null) {
    const currentVersion = fileVersion(paths.path)
    if (currentVersion !== input.expectedVersion) {
      throw new Error('Agent session state changed before it could be saved.')
    }
  }
  const state = normalizeAgentSessionState(input.state)
  writeJSONAtomic(paths.path, {
    schema: AGENT_SESSION_FILE_SCHEMA,
    updatedAt: new Date().toISOString(),
    state,
  })
  return readDesktopAgentSessionState({ movScriptHomeDir: paths.movScriptHomeDir })
}

function resolveDesktopAgentSessionPaths(input?: ElectronMovScriptHomeInput) {
  const movScriptHomeDir = resolveMovScriptHomeDir(input)
  const root = resolveMovScriptWorkspaceRootPaths(movScriptHomeDir)
  ensureMovScriptWorkspaceRoot(root)
  return {
    movScriptHomeDir: root.workspaceDir,
    path: join(root.rootDir, AGENT_SESSION_DIR_NAME, AGENT_SESSION_FILE_NAME),
  }
}

function normalizeAgentSessionFile(input: unknown): ElectronAgentSessionState {
  if (!isRecord(input)) return emptyDesktopAgentSessionState()
  if (input.schema === AGENT_SESSION_FILE_SCHEMA) {
    return normalizeAgentSessionState(input.state)
  }
  return normalizeAgentSessionState(input)
}

function normalizeAgentSessionState(input: unknown): ElectronAgentSessionState {
  if (!isRecord(input)) return emptyDesktopAgentSessionState()
  return {
    activeConversationIdsByUser: normalizeStringNullableRecord(input.activeConversationIdsByUser),
    activeConversationIdsByScope: normalizeStringNullableRecord(input.activeConversationIdsByScope),
    conversationsById: normalizeRecordMap(input.conversationsById) as unknown as ElectronAgentSessionState['conversationsById'],
    workspacesByUser: normalizeNestedRecordMap(input.workspacesByUser) as unknown as ElectronAgentSessionState['workspacesByUser'],
  }
}

function normalizeStringNullableRecord(input: unknown): Record<string, string | null> {
  if (!isRecord(input)) return {}
  const output: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') output[key] = value
    else if (value === null) output[key] = null
  }
  return output
}

function normalizeRecordMap<T extends Record<string, unknown> = Record<string, unknown>>(input: unknown): Record<string, T> {
  if (!isRecord(input)) return {}
  const output: Record<string, T> = {}
  for (const [key, value] of Object.entries(input)) {
    if (isRecord(value)) output[key] = value as T
  }
  return output
}

function normalizeNestedRecordMap<T extends Record<string, unknown> = Record<string, unknown>>(input: unknown): Record<string, Record<string, T>> {
  if (!isRecord(input)) return {}
  const output: Record<string, Record<string, T>> = {}
  for (const [key, value] of Object.entries(input)) {
    const normalized = normalizeRecordMap<T>(value)
    if (Object.keys(normalized).length > 0) output[key] = normalized
  }
  return output
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
