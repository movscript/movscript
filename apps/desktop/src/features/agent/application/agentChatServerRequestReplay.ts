import {
  agentChatPendingServerRequestEntryKey,
  upsertAgentChatPendingServerRequest,
  type AgentChatRuntimePendingServerRequest,
} from '@movscript/agent-chat'

export interface AgentChatServerRequestReplayResult {
  pendingServerRequests: AgentChatRuntimePendingServerRequest[]
  replayedCount: number
}

export function replayAgentChatPersistentServerRequests(input: {
  current: readonly AgentChatRuntimePendingServerRequest[]
  persistent: readonly AgentChatRuntimePendingServerRequest[]
}): AgentChatServerRequestReplayResult {
  let next = [...input.current]
  const currentKeys = new Set(next.map(agentChatPendingServerRequestEntryKey))
  let replayedCount = 0

  for (const entry of input.persistent) {
    const entryKey = agentChatPendingServerRequestEntryKey(entry)
    if (currentKeys.has(entryKey)) continue
    currentKeys.add(entryKey)
    replayedCount += 1
    next = upsertAgentChatPendingServerRequest(next, entry.request, entry.resolve)
  }

  return {
    pendingServerRequests: next,
    replayedCount,
  }
}
