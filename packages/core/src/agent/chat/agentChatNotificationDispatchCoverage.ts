import type { AgentChatNotificationEvent } from './agentChatProtocol.js'

export type AgentChatNotificationDispatchHandling =
  | 'thread-state'
  | 'thread-item'
  | 'thread-item-delta'
  | 'pending-state'
  | 'streaming-state'
  | 'refresh-effect'
  | 'visible-item-projection'

export const AGENT_CHAT_NOTIFICATION_METHOD_DISPATCH_COVERAGE: Record<string, {
  handling: readonly AgentChatNotificationDispatchHandling[]
  note: string
}> = {
  'thread/started': {
    handling: ['thread-state'],
    note: 'Upserts a normalized thread snapshot.',
  },
  'thread/status/changed': {
    handling: ['thread-state'],
    note: 'Updates thread status metadata in the local list.',
  },
  'thread/name/updated': {
    handling: ['thread-state'],
    note: 'Updates thread display name metadata in the local list.',
  },
  'thread/settings/updated': {
    handling: ['thread-state'],
    note: 'Updates thread execution settings without replacing turn history.',
  },
  'thread/metadata/updated': {
    handling: ['thread-state'],
    note: 'Updates provider-neutral thread metadata without replacing turn history.',
  },
  'turn/started': {
    handling: ['thread-state'],
    note: 'Upserts a normalized turn snapshot.',
  },
  'turn/plan/updated': {
    handling: ['thread-item'],
    note: 'Projects turn-level plan metadata into a stable neutral plan item.',
  },
  'turn/diff/updated': {
    handling: ['thread-item'],
    note: 'Projects turn-level diff metadata into a stable neutral fileChange item.',
  },
  'item/plan/delta': {
    handling: ['thread-item-delta'],
    note: 'Appends streamed plan text into a neutral plan item.',
  },
  'item/reasoning/textDelta': {
    handling: ['thread-item-delta'],
    note: 'Appends streamed reasoning content text.',
  },
  'item/reasoning/summaryTextDelta': {
    handling: ['thread-item-delta'],
    note: 'Appends streamed reasoning summary text.',
  },
  'item/reasoning/summaryPartAdded': {
    handling: ['thread-item'],
    note: 'Ensures the target reasoning summary slot exists before later deltas.',
  },
  'item/commandExecution/outputDelta': {
    handling: ['thread-item-delta'],
    note: 'Appends streamed command output into a neutral commandExecution item.',
  },
  'item/fileChange/outputDelta': {
    handling: ['thread-item-delta'],
    note: 'Appends streamed file-change output into a neutral fileChange item.',
  },
  'item/fileChange/patchUpdated': {
    handling: ['thread-item'],
    note: 'Replaces neutral fileChange patch contents.',
  },
  'item/mcpToolCall/progress': {
    handling: ['thread-item'],
    note: 'Appends progress messages into a neutral MCP tool-call item.',
  },
  'item/commandExecution/terminalInteraction': {
    handling: ['thread-item'],
    note: 'Appends terminal input into a neutral commandExecution item.',
  },
  'item/autoApprovalReview/started': {
    handling: ['thread-item'],
    note: 'Upserts a stable neutral approvalReview item.',
  },
  'item/autoApprovalReview/completed': {
    handling: ['thread-item'],
    note: 'Completes a stable neutral approvalReview item.',
  },
  'thread/compacted': {
    handling: ['thread-item'],
    note: 'Projects compaction metadata into a stable neutral contextCompaction item.',
  },
  'item/started': {
    handling: ['thread-item'],
    note: 'Appends or replaces a normalized neutral item at turn scope.',
  },
  'item/agentMessage/delta': {
    handling: ['streaming-state', 'visible-item-projection'],
    note: 'Stores streamed assistant text outside committed turns until the completed item arrives.',
  },
  'item/completed': {
    handling: ['thread-item', 'pending-state', 'streaming-state'],
    note: 'Commits the normalized item and clears matching optimistic/streaming state.',
  },
  'turn/completed': {
    handling: ['thread-state', 'pending-state', 'streaming-state'],
    note: 'Commits the completed turn from the live connection and clears transient user/server/streaming turn state.',
  },
}

export const AGENT_CHAT_NOTIFICATION_EVENT_DISPATCH_COVERAGE: Record<AgentChatNotificationEvent['type'], {
  handling: readonly AgentChatNotificationDispatchHandling[]
  note: string
}> = {
  commandOutput: {
    handling: ['thread-item-delta'],
    note: 'Connection-scoped command output updates matching commandExecution items by processId.',
  },
  processOutput: {
    handling: ['thread-item-delta'],
    note: 'Process output updates matching commandExecution items by processHandle.',
  },
  processExited: {
    handling: ['thread-item'],
    note: 'Process exit updates matching commandExecution status/output by processHandle.',
  },
  threadLifecycle: {
    handling: ['thread-state', 'pending-state', 'streaming-state', 'refresh-effect'],
    note: 'Archive/close clears provider thread state; unarchive triggers a canonical thread reload.',
  },
  serverRequestResolved: {
    handling: ['pending-state'],
    note: 'Removes a resolved pending server request.',
  },
  systemNotice: {
    handling: ['thread-item'],
    note: 'Turn-scoped notices become stable neutral systemNotice items.',
  },
  fsChanged: {
    handling: [],
    note: 'Displayed as a recent capability event only; no thread-state mutation.',
  },
  realtime: {
    handling: ['visible-item-projection'],
    note: 'Realtime transcript deltas, output audio, and text-bearing itemAdded events are projected as transient visible items; other realtime events remain recent capability events.',
  },
  account: {
    handling: [],
    note: 'Displayed as a recent capability event only; no thread-state mutation.',
  },
  mcpStatus: {
    handling: [],
    note: 'Displayed as a recent capability event only; no thread-state mutation.',
  },
}
