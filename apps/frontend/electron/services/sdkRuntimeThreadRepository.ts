import type {
  AgentChatThread,
  AgentChatThreadItem,
} from '@movscript/core/agent/chat'

export interface SdkRuntimeThreadRecord {
  thread: AgentChatThread
  providerThread?: unknown
  providerThreadOptions?: Record<string, unknown>
  activeQuery?: { interrupt?: () => void; abort?: () => void; close?: () => void }
}

const sdkRuntimeThreads = new Map<string, SdkRuntimeThreadRecord>()
const deletedSdkRuntimeThreadKeys = new Set<string>()

export function sdkRuntimeThreadKey(runtimeId: string, threadId: string): string {
  return `${runtimeId}:${threadId}`
}

export function getSdkRuntimeThreadRecord(runtimeId: string, threadId: string): SdkRuntimeThreadRecord | undefined {
  return sdkRuntimeThreads.get(sdkRuntimeThreadKey(runtimeId, threadId))
}

export function setSdkRuntimeThreadRecord(
  runtimeId: string,
  threadId: string,
  record: SdkRuntimeThreadRecord,
): SdkRuntimeThreadRecord {
  const key = sdkRuntimeThreadKey(runtimeId, threadId)
  deletedSdkRuntimeThreadKeys.delete(key)
  sdkRuntimeThreads.set(key, record)
  return record
}

export function requireSdkRuntimeThreadRecord(runtimeId: string, threadId: string): SdkRuntimeThreadRecord {
  const record = getSdkRuntimeThreadRecord(runtimeId, threadId)
  if (!record) throw new Error(`SDK runtime thread not found: ${threadId}`)
  return record
}

export function deleteSdkRuntimeThreadRecord(runtimeId: string, threadId: string): void {
  const key = sdkRuntimeThreadKey(runtimeId, threadId)
  sdkRuntimeThreads.delete(key)
  deletedSdkRuntimeThreadKeys.add(key)
}

export function isSdkRuntimeThreadDeleted(runtimeId: string, threadId: string): boolean {
  return deletedSdkRuntimeThreadKeys.has(sdkRuntimeThreadKey(runtimeId, threadId))
}

export function listSdkRuntimeThreads(runtimeId: string): AgentChatThread[] {
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

function sdkRuntimeOptionChanged(left: Record<string, unknown>, right: Record<string, unknown>, field: string): boolean {
  return stringField(left, field) !== stringField(right, field)
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function unixSecondsNow(): number {
  return Math.floor(Date.now() / 1000)
}
