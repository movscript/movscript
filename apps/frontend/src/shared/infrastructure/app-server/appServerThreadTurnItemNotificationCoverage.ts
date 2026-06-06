import type { AppServerServerNotification } from '@/shared/infrastructure/app-server/appServerProtocol'

export type AppServerThreadTurnItemNotificationHandling =
  | 'thread-state'
  | 'thread-item'
  | 'thread-item-notice'
  | 'capability-event'
  | 'global-event'
  | 'metadata-invalidation'
  | 'intentional-ignore'

export const APP_SERVER_THREAD_TURN_ITEM_NOTIFICATION_COVERAGE: Record<AppServerServerNotification['method'], {
  handling: AppServerThreadTurnItemNotificationHandling
  invalidationOwner?: 'plugin-catalog' | 'thread-settings' | 'app-metadata'
  eventOwner?: 'neutral-dispatcher' | 'recent-capability-events'
  ignoreOwner?: 'raw-response-debug' | 'composer-search'
  note: string
}> = {
  error: { handling: 'thread-item-notice', note: 'Turn-scoped error becomes a neutral systemNotice item when turnId is present.' },
  'thread/started': { handling: 'thread-state', note: 'Upserts normalized thread state.' },
  'thread/status/changed': { handling: 'thread-state', note: 'Updates normalized thread status.' },
  'thread/archived': { handling: 'capability-event', eventOwner: 'neutral-dispatcher', note: 'Thread lifecycle event removes local tab/list state.' },
  'thread/unarchived': { handling: 'capability-event', eventOwner: 'neutral-dispatcher', note: 'Thread lifecycle event reloads thread state.' },
  'thread/closed': { handling: 'capability-event', eventOwner: 'neutral-dispatcher', note: 'Thread lifecycle event removes local tab/list state.' },
  'skills/changed': { handling: 'metadata-invalidation', invalidationOwner: 'plugin-catalog', note: 'Invalidates skill metadata; not a transcript item.' },
  'thread/name/updated': { handling: 'thread-state', note: 'Updates thread display name.' },
  'thread/goal/updated': { handling: 'thread-item-notice', note: 'Goal updates can be shown as neutral systemNotice when turn-scoped.' },
  'thread/goal/cleared': { handling: 'global-event', eventOwner: 'recent-capability-events', note: 'Goal clear has no turnId, so it remains an ephemeral systemNotice.' },
  'thread/settings/updated': { handling: 'metadata-invalidation', invalidationOwner: 'thread-settings', note: 'Thread settings are not part of the current neutral thread display model.' },
  'thread/tokenUsage/updated': { handling: 'thread-item-notice', note: 'Token usage can be shown as neutral systemNotice when turn-scoped.' },
  'turn/started': { handling: 'thread-state', note: 'Upserts normalized turn state.' },
  'hook/started': { handling: 'thread-item-notice', note: 'Hook lifecycle can be shown as neutral systemNotice when turn-scoped.' },
  'turn/completed': { handling: 'thread-state', note: 'Upserts completed turn and refreshes canonical thread.' },
  'hook/completed': { handling: 'thread-item-notice', note: 'Hook lifecycle can be shown as neutral systemNotice when turn-scoped.' },
  'turn/diff/updated': { handling: 'thread-item', note: 'Projects turn diff into stable neutral fileChange item.' },
  'turn/plan/updated': { handling: 'thread-item', note: 'Projects turn plan into stable neutral plan item.' },
  'item/started': { handling: 'thread-item', note: 'Upserts normalized neutral item.' },
  'item/autoApprovalReview/started': { handling: 'thread-item', note: 'Upserts neutral approvalReview item.' },
  'item/autoApprovalReview/completed': { handling: 'thread-item', note: 'Upserts neutral approvalReview item.' },
  'item/completed': { handling: 'thread-item', note: 'Upserts normalized neutral item and clears matching optimistic state.' },
  'rawResponseItem/completed': { handling: 'thread-item-notice', note: 'Raw model response debug payload is preserved as a folded turn-scoped systemNotice.' },
  'item/agentMessage/delta': { handling: 'thread-item', note: 'Maintains streaming assistant text until completed item arrives.' },
  'item/plan/delta': { handling: 'thread-item', note: 'Appends streaming plan text to neutral plan item.' },
  'command/exec/outputDelta': { handling: 'capability-event', eventOwner: 'neutral-dispatcher', note: 'Capability command stream is shown as ephemeral output and may update matching process item.' },
  'process/outputDelta': { handling: 'capability-event', eventOwner: 'neutral-dispatcher', note: 'Process stream updates matching commandExecution item by process handle.' },
  'process/exited': { handling: 'capability-event', eventOwner: 'neutral-dispatcher', note: 'Process exit updates matching commandExecution item by process handle.' },
  'item/commandExecution/outputDelta': { handling: 'thread-item', note: 'Appends output to neutral commandExecution item.' },
  'item/commandExecution/terminalInteraction': { handling: 'thread-item', note: 'Appends terminal input to neutral commandExecution item.' },
  'item/fileChange/outputDelta': { handling: 'thread-item', note: 'Appends output to neutral fileChange item.' },
  'item/fileChange/patchUpdated': { handling: 'thread-item', note: 'Replaces neutral fileChange patch contents.' },
  'serverRequest/resolved': { handling: 'capability-event', eventOwner: 'neutral-dispatcher', note: 'Clears matching pending server request.' },
  'item/mcpToolCall/progress': { handling: 'thread-item', note: 'Appends progress to neutral mcpToolCall item.' },
  'mcpServer/oauthLogin/completed': { handling: 'global-event', eventOwner: 'recent-capability-events', note: 'Global MCP OAuth status, not a transcript item.' },
  'mcpServer/startupStatus/updated': { handling: 'capability-event', eventOwner: 'recent-capability-events', note: 'MCP status shown as ephemeral capability event.' },
  'account/updated': { handling: 'capability-event', eventOwner: 'recent-capability-events', note: 'Account state shown as ephemeral capability event.' },
  'account/rateLimits/updated': { handling: 'capability-event', eventOwner: 'recent-capability-events', note: 'Account rate-limit state shown as ephemeral capability event.' },
  'app/list/updated': { handling: 'metadata-invalidation', invalidationOwner: 'app-metadata', note: 'Invalidates app metadata; not a transcript item.' },
  'remoteControl/status/changed': { handling: 'global-event', eventOwner: 'recent-capability-events', note: 'Global remote-control status, not a transcript item.' },
  'externalAgentConfig/import/completed': { handling: 'global-event', eventOwner: 'recent-capability-events', note: 'Global import completion status, not a transcript item.' },
  'fs/changed': { handling: 'capability-event', eventOwner: 'recent-capability-events', note: 'Filesystem watch event shown as ephemeral capability event.' },
  'item/reasoning/summaryTextDelta': { handling: 'thread-item', note: 'Appends summary text to neutral reasoning item.' },
  'item/reasoning/summaryPartAdded': { handling: 'thread-item', note: 'Ensures reasoning summary part before subsequent deltas.' },
  'item/reasoning/textDelta': { handling: 'thread-item', note: 'Appends content text to neutral reasoning item.' },
  'thread/compacted': { handling: 'thread-item', note: 'Deprecated fallback projected into stable neutral contextCompaction item.' },
  'model/rerouted': { handling: 'thread-item-notice', note: 'Model reroute can be shown as neutral systemNotice when turn-scoped.' },
  'model/verification': { handling: 'thread-item-notice', note: 'Model verification can be shown as neutral systemNotice when turn-scoped.' },
  warning: { handling: 'capability-event', eventOwner: 'recent-capability-events', note: 'Warning notice shown as ephemeral systemNotice.' },
  guardianWarning: { handling: 'capability-event', eventOwner: 'recent-capability-events', note: 'Guardian warning shown as ephemeral systemNotice.' },
  deprecationNotice: { handling: 'capability-event', eventOwner: 'recent-capability-events', note: 'Deprecation notice shown as ephemeral systemNotice.' },
  configWarning: { handling: 'capability-event', eventOwner: 'recent-capability-events', note: 'Config warning shown as ephemeral systemNotice.' },
  'fuzzyFileSearch/sessionUpdated': { handling: 'intentional-ignore', ignoreOwner: 'composer-search', note: 'Composer/search UI concern, not a chat transcript item.' },
  'fuzzyFileSearch/sessionCompleted': { handling: 'intentional-ignore', ignoreOwner: 'composer-search', note: 'Composer/search UI concern, not a chat transcript item.' },
  'thread/realtime/started': { handling: 'capability-event', eventOwner: 'recent-capability-events', note: 'Realtime event shown as ephemeral capability event.' },
  'thread/realtime/itemAdded': { handling: 'capability-event', eventOwner: 'neutral-dispatcher', note: 'Text-bearing realtime items are projected as transient visible message items; non-text items remain recent capability events.' },
  'thread/realtime/transcript/delta': { handling: 'capability-event', eventOwner: 'neutral-dispatcher', note: 'Realtime transcript delta is projected as a transient visible message item.' },
  'thread/realtime/transcript/done': { handling: 'capability-event', eventOwner: 'neutral-dispatcher', note: 'Realtime transcript completion finalizes the transient visible message item.' },
  'thread/realtime/outputAudio/delta': { handling: 'capability-event', eventOwner: 'neutral-dispatcher', note: 'Realtime output audio is projected as a transient visible media item.' },
  'thread/realtime/sdp': { handling: 'capability-event', eventOwner: 'recent-capability-events', note: 'Realtime SDP event shown as ephemeral capability event.' },
  'thread/realtime/error': { handling: 'capability-event', eventOwner: 'recent-capability-events', note: 'Realtime error shown as ephemeral capability event.' },
  'thread/realtime/closed': { handling: 'capability-event', eventOwner: 'recent-capability-events', note: 'Realtime close event shown as ephemeral capability event.' },
  'windows/worldWritableWarning': { handling: 'global-event', eventOwner: 'recent-capability-events', note: 'Global Windows filesystem warning, not a transcript item.' },
  'windowsSandbox/setupCompleted': { handling: 'global-event', eventOwner: 'recent-capability-events', note: 'Global Windows sandbox setup status, not a transcript item.' },
  'account/login/completed': { handling: 'capability-event', eventOwner: 'recent-capability-events', note: 'Account login completion shown as ephemeral account event.' },
}
