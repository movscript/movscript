import type {
  AgentChatThread,
  AgentChatThreadItem,
} from '@movscript/agent-chat'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/workspace/home'

export interface SdkRuntimeThreadRecord {
  thread: AgentChatThread
  providerThread?: unknown
  providerThreadOptions?: Record<string, unknown>
  activeQuery?: { interrupt?: () => void; abort?: () => void; close?: () => void }
}

const SDK_RUNTIME_THREAD_FILE_SCHEMA = 'movscript.sdk-runtime-threads.v1'
const SDK_RUNTIME_THREAD_DIR_NAME = 'sdk-runtime'
const SDK_RUNTIME_THREAD_FILE_NAME = 'threads.json'

const sdkRuntimeThreads = new Map<string, SdkRuntimeThreadRecord>()
const deletedSdkRuntimeThreadKeys = new Set<string>()
const hydratedSdkRuntimeHomes = new Set<string>()

export function sdkRuntimeThreadKey(runtimeId: string, threadId: string): string {
  return `${runtimeId}:${threadId}`
}

export function getSdkRuntimeThreadRecord(runtimeId: string, threadId: string, movScriptHomeDir?: string): SdkRuntimeThreadRecord | undefined {
  hydrateSdkRuntimeThreadsFromHome(movScriptHomeDir)
  return sdkRuntimeThreads.get(sdkRuntimeThreadKey(runtimeId, threadId))
}

export function setSdkRuntimeThreadRecord(
  runtimeId: string,
  threadId: string,
  record: SdkRuntimeThreadRecord,
  movScriptHomeDir?: string,
): SdkRuntimeThreadRecord {
  hydrateSdkRuntimeThreadsFromHome(movScriptHomeDir)
  const key = sdkRuntimeThreadKey(runtimeId, threadId)
  deletedSdkRuntimeThreadKeys.delete(key)
  sdkRuntimeThreads.set(key, record)
  persistSdkRuntimeThreadsToHome(movScriptHomeDir)
  return record
}

export function requireSdkRuntimeThreadRecord(runtimeId: string, threadId: string, movScriptHomeDir?: string): SdkRuntimeThreadRecord {
  const record = getSdkRuntimeThreadRecord(runtimeId, threadId, movScriptHomeDir)
  if (!record) throw new Error(`SDK runtime thread not found: ${threadId}`)
  return record
}

export function deleteSdkRuntimeThreadRecord(runtimeId: string, threadId: string, movScriptHomeDir?: string): void {
  hydrateSdkRuntimeThreadsFromHome(movScriptHomeDir)
  const key = sdkRuntimeThreadKey(runtimeId, threadId)
  sdkRuntimeThreads.delete(key)
  deletedSdkRuntimeThreadKeys.add(key)
  persistSdkRuntimeThreadsToHome(movScriptHomeDir)
}

export function isSdkRuntimeThreadDeleted(runtimeId: string, threadId: string, movScriptHomeDir?: string): boolean {
  hydrateSdkRuntimeThreadsFromHome(movScriptHomeDir)
  return deletedSdkRuntimeThreadKeys.has(sdkRuntimeThreadKey(runtimeId, threadId))
}

export function listSdkRuntimeThreads(runtimeId: string, movScriptHomeDir?: string): AgentChatThread[] {
  hydrateSdkRuntimeThreadsFromHome(movScriptHomeDir)
  return Array.from(sdkRuntimeThreads.entries())
    .filter(([key]) => key.startsWith(`${runtimeId}:`))
    .map(([, record]) => record.thread)
}

export function createSdkRuntimeBaseThread(
  provider: string,
  runtimeId: string,
  threadId: string,
  title?: string | null,
  cwd?: string | null,
): AgentChatThread {
  const now = unixSecondsNow()
  return {
    provider,
    id: threadId,
    providerThreadId: threadId,
    preview: '',
    name: title ?? null,
    createdAt: now,
    updatedAt: now,
    status: 'idle',
    ...(cwd ? { cwd } : {}),
    turns: [],
  }
}

export function createSdkRuntimeUserMessageItem(
  turnId: string,
  text: string,
  clientId?: string | null,
): AgentChatThreadItem {
  return {
    type: 'userMessage',
    id: `${turnId}_user`,
    clientId: clientId ?? null,
    content: [{ type: 'text', text, textElements: [] }],
  }
}

export function interruptSdkRuntimeTurn(runtimeId: string, threadId: string): { ok: true } {
  const record = getSdkRuntimeThreadRecord(runtimeId, threadId)
  record?.activeQuery?.interrupt?.()
  record?.activeQuery?.abort?.()
  record?.activeQuery?.close?.()
  return { ok: true }
}

export function sdkRuntimeProviderThreadNeedsRefresh(
  record: SdkRuntimeThreadRecord,
  options: Record<string, unknown>,
): boolean {
  if (record.thread.turns.some((turn) => turn.status === 'completed')) return false
  const previous = record.providerThreadOptions
  if (!previous) return Boolean(stringField(options, 'model') || stringField(options, 'cwd'))
  return sdkRuntimeOptionChanged(previous, options, 'model') || sdkRuntimeOptionChanged(previous, options, 'cwd')
}

export function clearSdkRuntimeThreadRepositoryForTests(): void {
  sdkRuntimeThreads.clear()
  deletedSdkRuntimeThreadKeys.clear()
  hydratedSdkRuntimeHomes.clear()
}

function hydrateSdkRuntimeThreadsFromHome(movScriptHomeDir?: string): void {
  if (!movScriptHomeDir) return
  const paths = resolveSdkRuntimeThreadStorePaths(movScriptHomeDir)
  if (hydratedSdkRuntimeHomes.has(paths.homeDir)) return
  hydratedSdkRuntimeHomes.add(paths.homeDir)
  const snapshot = readSdkRuntimeThreadSnapshot(paths.path)
  for (const [key, record] of Object.entries(snapshot.records)) {
    if (!sdkRuntimeThreads.has(key)) sdkRuntimeThreads.set(key, record)
  }
  for (const key of snapshot.deletedKeys) deletedSdkRuntimeThreadKeys.add(key)
}

function persistSdkRuntimeThreadsToHome(movScriptHomeDir?: string): void {
  if (!movScriptHomeDir) return
  const paths = resolveSdkRuntimeThreadStorePaths(movScriptHomeDir)
  const records: Record<string, PersistedSdkRuntimeThreadRecord> = {}
  for (const [key, record] of sdkRuntimeThreads.entries()) {
    const persisted = persistedSdkRuntimeThreadRecord(record)
    if (persisted) records[key] = persisted
  }
  writeJSONAtomic(paths.path, {
    schema: SDK_RUNTIME_THREAD_FILE_SCHEMA,
    updatedAt: new Date().toISOString(),
    records,
    deletedKeys: Array.from(deletedSdkRuntimeThreadKeys),
  })
}

interface PersistedSdkRuntimeThreadRecord {
  thread: AgentChatThread
  providerThreadOptions?: Record<string, unknown>
  providerThread?: {
    id?: string
    threadId?: string
    resumeToken?: string
    claudeSessionId?: string
    session_id?: string
  }
}

function persistedSdkRuntimeThreadRecord(record: SdkRuntimeThreadRecord): PersistedSdkRuntimeThreadRecord | null {
  if (!isRecord(record.thread) || typeof record.thread.id !== 'string') return null
  const providerThread = persistedProviderThread(record.providerThread, record.thread)
  return {
    thread: record.thread,
    ...(serializableRecord(record.providerThreadOptions) ? { providerThreadOptions: record.providerThreadOptions } : {}),
    ...(providerThread ? { providerThread } : {}),
  }
}

function persistedProviderThread(providerThread: unknown, thread: AgentChatThread): PersistedSdkRuntimeThreadRecord['providerThread'] {
  const output: NonNullable<PersistedSdkRuntimeThreadRecord['providerThread']> = {
    id: thread.providerThreadId?.trim() || thread.id,
    threadId: thread.providerThreadId?.trim() || thread.id,
  }
  if (isRecord(providerThread)) {
    const resumeToken = stringField(providerThread, 'resumeToken')
      ?? stringField(providerThread, 'claudeSessionId')
      ?? stringField(providerThread, 'session_id')
    if (resumeToken) {
      output.resumeToken = resumeToken
      output.claudeSessionId = resumeToken
      output.session_id = resumeToken
    }
  }
  return output
}

function readSdkRuntimeThreadSnapshot(filePath: string): {
  records: Record<string, SdkRuntimeThreadRecord>
  deletedKeys: string[]
} {
  const parsed = readJSON(filePath)
  if (!isRecord(parsed)) return { records: {}, deletedKeys: [] }
  const recordsInput = parsed.schema === SDK_RUNTIME_THREAD_FILE_SCHEMA ? parsed.records : parsed
  const records: Record<string, SdkRuntimeThreadRecord> = {}
  if (isRecord(recordsInput)) {
    for (const [key, value] of Object.entries(recordsInput)) {
      const record = normalizePersistedSdkRuntimeThreadRecord(value)
      if (record) records[key] = record
    }
  }
  return {
    records,
    deletedKeys: Array.isArray(parsed.deletedKeys) ? parsed.deletedKeys.filter((value): value is string => typeof value === 'string') : [],
  }
}

function normalizePersistedSdkRuntimeThreadRecord(value: unknown): SdkRuntimeThreadRecord | null {
  if (!isRecord(value) || !isRecord(value.thread)) return null
  const thread = value.thread as unknown as AgentChatThread
  if (typeof thread.id !== 'string') return null
  return {
    thread,
    ...(isRecord(value.providerThread) ? { providerThread: value.providerThread } : { providerThread: persistedProviderThread(undefined, thread) }),
    ...(isRecord(value.providerThreadOptions) ? { providerThreadOptions: value.providerThreadOptions } : {}),
  }
}

function resolveSdkRuntimeThreadStorePaths(movScriptHomeDir: string): { homeDir: string; path: string } {
  const root = resolveMovScriptWorkspaceRootPaths(movScriptHomeDir)
  ensureMovScriptWorkspaceRoot(root)
  return {
    homeDir: root.workspaceDir,
    path: join(root.rootDir, SDK_RUNTIME_THREAD_DIR_NAME, SDK_RUNTIME_THREAD_FILE_NAME),
  }
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
  try {
    writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    renameSync(tmpPath, filePath)
  } catch (error) {
    if (existsSync(tmpPath)) rmSync(tmpPath, { force: true })
    throw error
  }
}

function serializableRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  try {
    JSON.stringify(value)
    return true
  } catch {
    return false
  }
}

function sdkRuntimeOptionChanged(left: Record<string, unknown>, right: Record<string, unknown>, field: string): boolean {
  return stringField(left, field) !== stringField(right, field)
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unixSecondsNow(): number {
  return Math.floor(Date.now() / 1000)
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}
