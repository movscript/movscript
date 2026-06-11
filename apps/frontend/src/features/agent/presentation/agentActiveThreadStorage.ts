export interface AgentActiveThreadStorageOpenInput {
  storageKey: string
  eventName: string
  threadId: string
}

export function openAgentChatDataSourceThread(input: AgentActiveThreadStorageOpenInput): void {
  if (typeof window === 'undefined') return
  writeStoredActiveThreadId(input.storageKey, input.threadId)
  window.dispatchEvent(new CustomEvent(input.eventName, { detail: { threadId: input.threadId } }))
}

export function readStoredActiveThreadId(storageKey: string): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(storageKey)?.trim() || null
}

export function writeStoredActiveThreadId(storageKey: string, threadId: string | null): void {
  if (typeof window === 'undefined') return
  if (threadId) window.localStorage.setItem(storageKey, threadId)
  else window.localStorage.removeItem(storageKey)
}
