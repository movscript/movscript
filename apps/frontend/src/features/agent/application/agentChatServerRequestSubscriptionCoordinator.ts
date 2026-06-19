import type {
  AgentChatDataSource,
  AgentChatNotification,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
} from '@movscript/core/agent/chat'

interface AgentChatServerRequestSubscriptionListener {
  onNotification?: (notification: AgentChatNotification) => void
  onServerRequest?: (request: AgentChatServerRequest) => AgentChatServerRequestResponse | undefined | Promise<AgentChatServerRequestResponse | undefined>
}

interface AgentChatServerRequestSubscriptionEntry {
  closed: boolean
  controller: AbortController
  dispose?: () => void
  listeners: AgentChatServerRequestSubscriptionListener[]
}

const serverRequestSubscriptions = new Map<string, AgentChatServerRequestSubscriptionEntry>()

export function subscribeSharedAgentChatServerRequests(
  dataSource: AgentChatDataSource,
  listener: AgentChatServerRequestSubscriptionListener,
): () => void {
  if (!dataSource.subscribeServerRequests) return () => undefined
  const key = agentChatDataSourceServerRequestSubscriptionKey(dataSource)
  let entry = serverRequestSubscriptions.get(key)
  if (!entry) {
    const controller = new AbortController()
    entry = {
      closed: false,
      controller,
      listeners: [],
    }
    const currentEntry = entry
    serverRequestSubscriptions.set(key, entry)
    const subscription = dataSource.subscribeServerRequests({
      signal: controller.signal,
      onNotification: (notification) => {
        if (currentEntry.closed) return
        for (const current of currentEntry.listeners) current.onNotification?.(notification)
      },
      onServerRequest: (request) => {
        if (currentEntry.closed) return undefined
        const owner = [...currentEntry.listeners].reverse().find((current) => current.onServerRequest)
        return owner?.onServerRequest?.(request)
      },
    })
    if (typeof subscription === 'function') {
      installAgentChatServerRequestSubscriptionCleanup(currentEntry, subscription)
    } else if (isPromiseLikeAgentChatServerRequestSubscription(subscription)) {
      void subscription.then((cleanup) => {
        if (typeof cleanup === 'function') installAgentChatServerRequestSubscriptionCleanup(currentEntry, cleanup)
      })
    }
  }
  entry.listeners.push(listener)
  return () => {
    const current = serverRequestSubscriptions.get(key)
    if (!current) return
    current.listeners = current.listeners.filter((candidate) => candidate !== listener)
    if (current.listeners.length > 0) return
    current.closed = true
    current.controller.abort()
    current.dispose?.()
    serverRequestSubscriptions.delete(key)
  }
}

function agentChatDataSourceServerRequestSubscriptionKey(dataSource: AgentChatDataSource): string {
  return [
    dataSource.provider,
    dataSource.providerId ?? '',
    dataSource.providerInstanceId ?? '',
    dataSource.label,
  ].join(':')
}

function installAgentChatServerRequestSubscriptionCleanup(
  entry: AgentChatServerRequestSubscriptionEntry,
  cleanup: () => void,
): void {
  if (entry.closed) {
    cleanup()
    return
  }
  entry.dispose = cleanup
}

function isPromiseLikeAgentChatServerRequestSubscription(
  value: void | (() => void) | Promise<void | (() => void)>,
): value is Promise<void | (() => void)> {
  return typeof value === 'object' && value !== null && typeof value.then === 'function'
}
