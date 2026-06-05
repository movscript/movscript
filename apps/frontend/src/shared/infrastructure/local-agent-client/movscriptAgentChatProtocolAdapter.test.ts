import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { AGENT_PROTOCOL_VERSION, AGENT_RUNTIME_EVENT_V2_SCHEMA, type AgentMessage, type AgentRun, type AgentThread, type RuntimeInteraction } from '@movscript/protocol'
import {
  AGENT_CHAT_NOTIFICATION_EVENT_DISPATCH_COVERAGE,
  AGENT_CHAT_NOTIFICATION_METHOD_DISPATCH_COVERAGE,
} from '@/features/agent/domain/agentChatNotificationDispatchCoverage'
import { agentChatPlanStatusIntent } from '@/features/agent/domain/agentChatProcessItemViews'
import {
  AGENT_RUNTIME_CHAT_RUNTIME_STATUS_KIND_COVERAGE,
  AGENT_RUNTIME_CHAT_STATUS_LIGHT_STATE_COVERAGE,
  AGENT_RUNTIME_CHAT_TRACE_KIND_COVERAGE,
  AGENT_RUNTIME_CHAT_TRACE_STATUS_COVERAGE,
} from '@/shared/infrastructure/local-agent-client/agentRuntimeChatCapabilityCoverage'
import { AGENT_RUNTIME_CHAT_EVENT_COVERAGE } from '@/shared/infrastructure/local-agent-client/agentRuntimeChatEventCoverage'
import {
  AGENT_RUNTIME_CHAT_CONVERSATION_LIFECYCLE_COVERAGE,
  AGENT_RUNTIME_CHAT_CONTINUATION_STATUS_COVERAGE,
  AGENT_RUNTIME_CHAT_DISPLAY_ANCHOR_PLACEMENT_COVERAGE,
  AGENT_RUNTIME_CHAT_RUN_EXECUTION_MODE_COVERAGE,
  AGENT_RUNTIME_CHAT_RUN_ROLE_COVERAGE,
  AGENT_RUNTIME_CHAT_SCOPE_TYPE_COVERAGE,
  AGENT_RUNTIME_CHAT_TASK_GRAPH_STATUS_COVERAGE,
  AGENT_RUNTIME_CHAT_TASK_STATUS_COVERAGE,
  AGENT_RUNTIME_CHAT_THREAD_ROLE_COVERAGE,
  AGENT_RUNTIME_CHAT_WAKE_EVENT_KIND_COVERAGE,
  AGENT_RUNTIME_CHAT_WAKE_EVENT_STATUS_COVERAGE,
  AGENT_RUNTIME_CHAT_WORK_CONTINUATION_MODE_COVERAGE,
  AGENT_RUNTIME_CHAT_WORK_KIND_COVERAGE,
  AGENT_RUNTIME_CHAT_WORK_MODE_COVERAGE,
  AGENT_RUNTIME_CHAT_WORK_STATUS_COVERAGE,
} from '@/shared/infrastructure/local-agent-client/agentRuntimeChatMetadataCoverage'
import { AGENT_RUNTIME_CHAT_PLAN_TASK_STATUS_COVERAGE } from '@/shared/infrastructure/local-agent-client/agentRuntimeChatPlanCoverage'
import {
  AGENT_RUNTIME_CHAT_INTERACTION_KIND_COVERAGE,
  AGENT_RUNTIME_CHAT_INTERACTION_STATUS_COVERAGE,
  AGENT_RUNTIME_CHAT_SERVER_REQUEST_COVERAGE,
} from '@/shared/infrastructure/local-agent-client/agentRuntimeChatServerRequestCoverage'
import {
  AGENT_RUNTIME_CHAT_RUNTIME_APPROVAL_MODE_COVERAGE,
  AGENT_RUNTIME_CHAT_TOOL_APPROVAL_MODE_COVERAGE,
  AGENT_RUNTIME_CHAT_TOOL_APPROVAL_REASON_COVERAGE,
  AGENT_RUNTIME_CHAT_TOOL_GRANT_MODE_COVERAGE,
  AGENT_RUNTIME_CHAT_TOOL_INTERRUPT_BEHAVIOR_COVERAGE,
  AGENT_RUNTIME_CHAT_TOOL_RESULT_REF_STRATEGY_COVERAGE,
  AGENT_RUNTIME_CHAT_TOOL_RISK_COVERAGE,
  AGENT_RUNTIME_CHAT_TOOL_UNAVAILABLE_REASON_COVERAGE,
} from '@/shared/infrastructure/local-agent-client/agentRuntimeChatToolPolicyCoverage'
import { AGENT_RUNTIME_CHAT_RUN_STATUS_COVERAGE } from '@/shared/infrastructure/local-agent-client/agentRuntimeChatRunCoverage'
import {
  AGENT_RUNTIME_CHAT_MESSAGE_ROLE_COVERAGE,
  AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE,
  AGENT_RUNTIME_CHAT_RUN_STEP_TYPE_COVERAGE,
} from '@/shared/infrastructure/local-agent-client/agentRuntimeChatThreadItemCoverage'
import { AGENT_RUNTIME_CHAT_THREAD_STATUS_COVERAGE } from '@/shared/infrastructure/local-agent-client/agentRuntimeChatThreadCoverage'
import {
  agentChatNotificationsFromMovScriptRunMissingInteractionApprovals,
  agentChatNotificationFromMovScriptRuntimeEvent,
  agentChatServerRequestsFromMovScriptInteraction,
  agentChatServerRequestsFromMovScriptRun,
  agentChatThreadFromMovScriptAgent,
} from '@/shared/infrastructure/local-agent-client/movscriptAgentChatProtocolAdapter'
import {
  agentChatThreadItemFromAgentMessage,
  agentChatThreadItemFromAgentRunStep,
} from '@/shared/infrastructure/local-agent-client/agentRuntimeChatThreadItems'

const AGENT_RUNTIME_NEUTRAL_EVENT_ROUTES = {
  'runtime/status/updated': 'systemNotice',
  'runtime/trace/updated': 'systemNotice',
  'serverRequest/resolved': 'serverRequestResolved',
} as const

test('tracks every MovScript Agent runtime event kind in the Agent Chat coverage table', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const eventKindType = protocol.match(/export type AgentRuntimeEventKind =([\s\S]*?)\n\nexport interface AgentRuntimeEventCausalityV2/)
  assert.ok(eventKindType)
  const protocolKinds = Array.from(eventKindType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
  const coveredKinds = Object.keys(AGENT_RUNTIME_CHAT_EVENT_COVERAGE).sort()

  assert.deepEqual(coveredKinds, protocolKinds)
  assert.deepEqual(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['run.upserted'].handling, ['thread-state', 'server-request-source'])
  assert.deepEqual(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['interaction.upserted'].handling, ['server-request-source', 'pending-state'])
  assert.deepEqual(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['assistant.progress'].handling, ['thread-item-delta'])
  assert.deepEqual(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['runtime_status.upserted'].handling, ['capability-event'])
  assert.deepEqual(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['plan.upserted'].handling, ['thread-item', 'metadata-invalidation'])
  assert.deepEqual(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['plan_revision.upserted'].handling, ['thread-item', 'metadata-invalidation'])
})

test('MovScript Agent stream notifications target neutral dispatcher methods', () => {
  const adapter = readFileSync(resolve('src/shared/infrastructure/local-agent-client/movscriptAgentChatProtocolAdapter.ts'), 'utf8')
  const notificationMapper = adapter.match(/export function agentChatNotificationFromMovScriptRuntimeEvent[\s\S]*?\nexport function agentChatServerRequestsFromMovScriptRun/)
  assert.ok(notificationMapper)
  const directMethodValues = Array.from(new Set(Array.from(notificationMapper[0].matchAll(/method: '([^']+)'/g), (match) => match[1] as string))).sort()
  const uncoveredMethods = directMethodValues
    .filter((method) => !hasOwn(AGENT_CHAT_NOTIFICATION_METHOD_DISPATCH_COVERAGE, method))
    .filter((method) => {
      const eventType = AGENT_RUNTIME_NEUTRAL_EVENT_ROUTES[method as keyof typeof AGENT_RUNTIME_NEUTRAL_EVENT_ROUTES]
      return !eventType || !hasOwn(AGENT_CHAT_NOTIFICATION_EVENT_DISPATCH_COVERAGE, eventType)
    })
  const neutralMethodMentions = Object.keys(AGENT_CHAT_NOTIFICATION_METHOD_DISPATCH_COVERAGE)
    .filter((method) => notificationMapper[0].includes(`'${method}'`))
    .sort()

  assert.deepEqual(uncoveredMethods, [])
  assert.deepEqual(neutralMethodMentions, [
    'item/agentMessage/delta',
    'item/completed',
    'item/started',
    'thread/metadata/updated',
    'turn/completed',
    'turn/plan/updated',
    'turn/started',
  ])
  assert.equal(AGENT_RUNTIME_NEUTRAL_EVENT_ROUTES['runtime/status/updated'], 'systemNotice')
  assert.equal(AGENT_RUNTIME_NEUTRAL_EVENT_ROUTES['runtime/trace/updated'], 'systemNotice')
})

test('MovScript Agent runtime event handling coverage is backed by adapter or data source branches', () => {
  const adapter = readFileSync(resolve('src/shared/infrastructure/local-agent-client/movscriptAgentChatProtocolAdapter.ts'), 'utf8')
  const dataSource = readFileSync(resolve('src/shared/infrastructure/local-agent-client/movscriptAgentChatDataSource.ts'), 'utf8')
  const notificationMapper = adapter.match(/export function agentChatNotificationFromMovScriptRuntimeEvent[\s\S]*?\nexport function agentChatServerRequestsFromMovScriptRun/)
  assert.ok(notificationMapper)
  const notificationEventKinds = Array.from(new Set(Array.from(notificationMapper[0].matchAll(/event\.kind === '([^']+)'/g), (match) => match[1]))).sort()
  const expectedNotificationEventKinds = Object.entries(AGENT_RUNTIME_CHAT_EVENT_COVERAGE)
    .filter(([, coverage]) => coverage.handling.some((handling) => handling === 'thread-state' || handling === 'thread-item' || handling === 'thread-item-delta' || handling === 'capability-event'))
    .map(([kind]) => kind)
    .sort()
  const pendingStateEventKinds = Object.entries(AGENT_RUNTIME_CHAT_EVENT_COVERAGE)
    .filter(([, coverage]) => coverage.handling.includes('pending-state'))
    .map(([kind]) => kind)
    .sort()
  const serverRequestSourceEventKinds = Object.entries(AGENT_RUNTIME_CHAT_EVENT_COVERAGE)
    .filter(([, coverage]) => coverage.handling.includes('server-request-source'))
    .map(([kind]) => kind)
    .sort()
  const dataSourceServerRequestEventKinds = Array.from(new Set(Array.from(dataSource.matchAll(/event\.kind === '([^']+)'/g), (match) => match[1]))).sort()

  assert.deepEqual(notificationEventKinds, Array.from(new Set([...expectedNotificationEventKinds, ...pendingStateEventKinds])).sort())
  assert.deepEqual(pendingStateEventKinds, ['interaction.upserted'])
  assert.deepEqual(serverRequestSourceEventKinds, ['interaction.upserted', 'run.upserted', 'step.upserted'])
  assert.deepEqual(serverRequestSourceEventKinds.filter((kind) => !dataSourceServerRequestEventKinds.includes(kind)), [])
})

test('MovScript Agent metadata invalidation events declare their external owner', () => {
  const missingOwners = Object.entries(AGENT_RUNTIME_CHAT_EVENT_COVERAGE)
    .filter(([, coverage]) => coverage.handling.includes('metadata-invalidation'))
    .filter(([, coverage]) => !coverage.invalidationOwner)
    .map(([kind]) => kind)
    .sort()
  const unexpectedOwners = Object.entries(AGENT_RUNTIME_CHAT_EVENT_COVERAGE)
    .filter(([, coverage]) => !coverage.handling.includes('metadata-invalidation'))
    .filter(([, coverage]) => coverage.invalidationOwner)
    .map(([kind]) => kind)
    .sort()

  assert.deepEqual(missingOwners, [])
  assert.deepEqual(unexpectedOwners, [])
  assert.deepEqual(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['task_graph.upserted'].invalidationOwner, 'plan-task-graph')
  assert.deepEqual(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['scope.done'].invalidationOwner, 'runtime-stream-lifecycle')
})

test('maps every MovScript Agent conversation role and execution metadata union', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const lifecycles = Object.keys(AGENT_RUNTIME_CHAT_CONVERSATION_LIFECYCLE_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_CONVERSATION_LIFECYCLE_COVERAGE>
  const threadRoles = Object.keys(AGENT_RUNTIME_CHAT_THREAD_ROLE_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_THREAD_ROLE_COVERAGE>
  const runRoles = Object.keys(AGENT_RUNTIME_CHAT_RUN_ROLE_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_RUN_ROLE_COVERAGE>
  const executionModes = Object.keys(AGENT_RUNTIME_CHAT_RUN_EXECUTION_MODE_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_RUN_EXECUTION_MODE_COVERAGE>

  assert.deepEqual(lifecycles, protocolStringUnion(protocol, 'AgentConversationLifecycle'))
  assert.deepEqual(threadRoles, protocolStringUnion(protocol, 'AgentThreadRole'))
  assert.deepEqual(runRoles, protocolStringUnion(protocol, 'AgentRunRole'))
  assert.deepEqual(executionModes, protocolStringUnion(protocol, 'AgentRunExecutionMode'))
  assert.deepEqual(lifecycles.map((status) => AGENT_RUNTIME_CHAT_CONVERSATION_LIFECYCLE_COVERAGE[status].transcriptItem), lifecycles.map(() => false))
  assert.deepEqual(threadRoles.map((role) => AGENT_RUNTIME_CHAT_THREAD_ROLE_COVERAGE[role].transcriptItem), threadRoles.map(() => false))
  assert.deepEqual(runRoles.map((role) => AGENT_RUNTIME_CHAT_RUN_ROLE_COVERAGE[role].transcriptItem), runRoles.map(() => false))
  assert.deepEqual(executionModes.map((mode) => AGENT_RUNTIME_CHAT_RUN_EXECUTION_MODE_COVERAGE[mode].transcriptItem), executionModes.map(() => false))
  assert.equal(AGENT_RUNTIME_CHAT_CONVERSATION_LIFECYCLE_COVERAGE.active.owner, 'thread-metadata')
  assert.equal(AGENT_RUNTIME_CHAT_THREAD_ROLE_COVERAGE.root.owner, 'thread-metadata')
  assert.equal(AGENT_RUNTIME_CHAT_RUN_ROLE_COVERAGE.worker.owner, 'plan-task-graph')
})

test('maps every MovScript Agent task graph status into metadata ownership', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const statuses = Object.keys(AGENT_RUNTIME_CHAT_TASK_GRAPH_STATUS_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_TASK_GRAPH_STATUS_COVERAGE>

  assert.deepEqual(statuses, protocolStringUnion(protocol, 'AgentTaskGraphStatus'))
  assert.deepEqual(statuses.map((status) => AGENT_RUNTIME_CHAT_TASK_GRAPH_STATUS_COVERAGE[status].owner), statuses.map(() => 'plan-task-graph'))
  assert.deepEqual(statuses.map((status) => AGENT_RUNTIME_CHAT_TASK_GRAPH_STATUS_COVERAGE[status].invalidationEvent), statuses.map(() => 'task_graph.upserted'))
  assert.deepEqual(statuses.filter((status) => AGENT_RUNTIME_CHAT_TASK_GRAPH_STATUS_COVERAGE[status].phase === 'waiting'), [
    'blocked',
    'needs_review',
  ])
  assert.deepEqual(statuses.filter((status) => AGENT_RUNTIME_CHAT_TASK_GRAPH_STATUS_COVERAGE[status].phase === 'failed'), ['failed'])
  assert.equal(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['task_graph.upserted'].invalidationOwner, 'plan-task-graph')
})

test('maps every MovScript Agent task status into metadata ownership', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const statuses = Object.keys(AGENT_RUNTIME_CHAT_TASK_STATUS_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_TASK_STATUS_COVERAGE>

  assert.deepEqual(statuses, protocolStringUnion(protocol, 'AgentTaskStatus'))
  assert.deepEqual(statuses.map((status) => AGENT_RUNTIME_CHAT_TASK_STATUS_COVERAGE[status].owner), statuses.map(() => 'plan-task-graph'))
  assert.deepEqual(statuses.map((status) => AGENT_RUNTIME_CHAT_TASK_STATUS_COVERAGE[status].invalidationEvent), statuses.map(() => 'task_graph.upserted'))
  assert.deepEqual(statuses.filter((status) => AGENT_RUNTIME_CHAT_TASK_STATUS_COVERAGE[status].phase === 'waiting'), [
    'blocked',
    'needs_review',
  ])
  assert.deepEqual(statuses.filter((status) => AGENT_RUNTIME_CHAT_TASK_STATUS_COVERAGE[status].phase === 'failed'), ['failed'])
})

test('maps every MovScript runtime work status into metadata ownership', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const statuses = Object.keys(AGENT_RUNTIME_CHAT_WORK_STATUS_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_WORK_STATUS_COVERAGE>

  assert.deepEqual(statuses, protocolStringUnion(protocol, 'RuntimeWorkStatus'))
  assert.deepEqual(statuses.map((status) => AGENT_RUNTIME_CHAT_WORK_STATUS_COVERAGE[status].owner), statuses.map(() => 'runtime-activity'))
  assert.deepEqual(statuses.map((status) => AGENT_RUNTIME_CHAT_WORK_STATUS_COVERAGE[status].invalidationEvent), statuses.map(() => 'work.upserted'))
  assert.deepEqual(statuses.filter((status) => AGENT_RUNTIME_CHAT_WORK_STATUS_COVERAGE[status].phase === 'waiting'), [
    'pending_approval',
    'waiting',
  ])
  assert.deepEqual(statuses.filter((status) => AGENT_RUNTIME_CHAT_WORK_STATUS_COVERAGE[status].phase === 'failed'), [
    'failed',
    'timeout',
  ])
  assert.equal(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['work.upserted'].invalidationOwner, 'runtime-activity')
})

test('maps every MovScript runtime work shape and scope union into metadata ownership', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const workKinds = Object.keys(AGENT_RUNTIME_CHAT_WORK_KIND_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_WORK_KIND_COVERAGE>
  const workModes = Object.keys(AGENT_RUNTIME_CHAT_WORK_MODE_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_WORK_MODE_COVERAGE>
  const continuationModes = Object.keys(AGENT_RUNTIME_CHAT_WORK_CONTINUATION_MODE_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_WORK_CONTINUATION_MODE_COVERAGE>
  const placements = Object.keys(AGENT_RUNTIME_CHAT_DISPLAY_ANCHOR_PLACEMENT_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_DISPLAY_ANCHOR_PLACEMENT_COVERAGE>
  const scopeTypes = Object.keys(AGENT_RUNTIME_CHAT_SCOPE_TYPE_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_SCOPE_TYPE_COVERAGE>

  assert.deepEqual(workKinds, protocolStringUnion(protocol, 'RuntimeWorkKind'))
  assert.deepEqual(workModes, protocolStringUnion(protocol, 'RuntimeWorkMode'))
  assert.deepEqual(continuationModes, protocolStringUnion(protocol, 'RuntimeWorkContinuationMode'))
  assert.deepEqual(placements, protocolStringUnion(protocol, 'RuntimeDisplayAnchorPlacement'))
  assert.deepEqual(scopeTypes, protocolStringUnion(protocol, 'AgentRuntimeScopeType'))
  assert.deepEqual(workKinds.map((kind) => AGENT_RUNTIME_CHAT_WORK_KIND_COVERAGE[kind].owner), workKinds.map(() => 'runtime-activity'))
  assert.deepEqual(workModes.map((mode) => AGENT_RUNTIME_CHAT_WORK_MODE_COVERAGE[mode].owner), workModes.map(() => 'runtime-activity'))
  assert.deepEqual(continuationModes.map((mode) => AGENT_RUNTIME_CHAT_WORK_CONTINUATION_MODE_COVERAGE[mode].owner), continuationModes.map(() => 'runtime-scheduler'))
  assert.deepEqual(placements.map((placement) => AGENT_RUNTIME_CHAT_DISPLAY_ANCHOR_PLACEMENT_COVERAGE[placement].owner), placements.map(() => 'server-request-anchor'))
  assert.deepEqual(scopeTypes.map((scope) => AGENT_RUNTIME_CHAT_SCOPE_TYPE_COVERAGE[scope].owner), scopeTypes.map(() => 'runtime-stream-lifecycle'))
  assert.deepEqual(workKinds.map((kind) => AGENT_RUNTIME_CHAT_WORK_KIND_COVERAGE[kind].transcriptItem), workKinds.map(() => false))
  assert.deepEqual(scopeTypes.map((scope) => AGENT_RUNTIME_CHAT_SCOPE_TYPE_COVERAGE[scope].transcriptItem), scopeTypes.map(() => false))
})

test('maps every MovScript runtime scheduler status into metadata ownership', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const continuationStatuses = Object.keys(AGENT_RUNTIME_CHAT_CONTINUATION_STATUS_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_CONTINUATION_STATUS_COVERAGE>
  const wakeEventKinds = Object.keys(AGENT_RUNTIME_CHAT_WAKE_EVENT_KIND_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_WAKE_EVENT_KIND_COVERAGE>
  const wakeEventStatuses = Object.keys(AGENT_RUNTIME_CHAT_WAKE_EVENT_STATUS_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_WAKE_EVENT_STATUS_COVERAGE>

  assert.deepEqual(continuationStatuses, protocolStringUnion(protocol, 'RuntimeContinuationStatus'))
  assert.deepEqual(wakeEventKinds, protocolStringUnion(protocol, 'RuntimeWakeEventKind'))
  assert.deepEqual(wakeEventStatuses, protocolStringUnion(protocol, 'RuntimeWakeEventStatus'))
  assert.deepEqual(continuationStatuses.map((status) => AGENT_RUNTIME_CHAT_CONTINUATION_STATUS_COVERAGE[status].owner), continuationStatuses.map(() => 'runtime-scheduler'))
  assert.deepEqual(wakeEventKinds.map((kind) => AGENT_RUNTIME_CHAT_WAKE_EVENT_KIND_COVERAGE[kind].owner), wakeEventKinds.map(() => 'runtime-scheduler'))
  assert.deepEqual(wakeEventStatuses.map((status) => AGENT_RUNTIME_CHAT_WAKE_EVENT_STATUS_COVERAGE[status].owner), wakeEventStatuses.map(() => 'runtime-scheduler'))
  assert.deepEqual(continuationStatuses.map((status) => AGENT_RUNTIME_CHAT_CONTINUATION_STATUS_COVERAGE[status].invalidationEvent), continuationStatuses.map(() => 'continuation.upserted'))
  assert.deepEqual(wakeEventKinds.map((kind) => AGENT_RUNTIME_CHAT_WAKE_EVENT_KIND_COVERAGE[kind].invalidationEvent), wakeEventKinds.map(() => 'wake_event.upserted'))
  assert.deepEqual(wakeEventStatuses.map((status) => AGENT_RUNTIME_CHAT_WAKE_EVENT_STATUS_COVERAGE[status].invalidationEvent), wakeEventStatuses.map(() => 'wake_event.upserted'))
  assert.equal(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['continuation.upserted'].invalidationOwner, 'runtime-scheduler')
  assert.equal(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['wake_event.upserted'].invalidationOwner, 'runtime-scheduler')
})

test('MovScript Agent capability events declare their display owner', () => {
  const missingEventOwners = Object.entries(AGENT_RUNTIME_CHAT_EVENT_COVERAGE)
    .filter(([, coverage]) => coverage.handling.includes('capability-event'))
    .filter(([, coverage]) => !coverage.eventOwner)
    .map(([kind]) => kind)
    .sort()
  const unexpectedEventOwners = Object.entries(AGENT_RUNTIME_CHAT_EVENT_COVERAGE)
    .filter(([, coverage]) => !coverage.handling.includes('capability-event'))
    .filter(([, coverage]) => coverage.eventOwner)
    .map(([kind]) => kind)
    .sort()

  assert.deepEqual(missingEventOwners, [])
  assert.deepEqual(unexpectedEventOwners, [])
  assert.equal(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['trace.upserted'].eventOwner, 'recent-capability-events')
  assert.equal(AGENT_RUNTIME_CHAT_EVENT_COVERAGE['runtime_status.upserted'].eventOwner, 'recent-capability-events')
})

test('maps every MovScript Agent trace kind into recent capability events', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const traceEventKinds = protocol.match(/export const AGENT_TRACE_EVENT_KINDS = \[([\s\S]*?)\] as const/)
  assert.ok(traceEventKinds)
  const protocolTraceKinds = Array.from(traceEventKinds[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
  const kinds = Object.keys(AGENT_RUNTIME_CHAT_TRACE_KIND_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_TRACE_KIND_COVERAGE>
  const notifications = kinds.map((kind) => agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: `event_trace_kind_${kind}`,
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 1,
    cursor: `cursor_trace_kind_${kind}`,
    emittedAt: '2026-06-04T00:00:01.000Z',
    kind: 'trace.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    entity: {
      type: 'trace',
      value: {
        id: `trace_kind_${kind}`,
        runId: 'run_1',
        kind,
        title: '',
        status: 'info',
        createdAt: '2026-06-04T00:00:01.000Z',
      },
    },
  }))

  assert.deepEqual(kinds, protocolTraceKinds)
  assert.deepEqual(notifications.map((notification) => notification?.method), kinds.map((kind) => AGENT_RUNTIME_CHAT_TRACE_KIND_COVERAGE[kind].streamMethod))
  assert.deepEqual(notifications.map((notification) => notification?.event?.type === 'systemNotice' ? notification.event.title : null), kinds.map((kind) => `Trace ${kind}`))
  assert.deepEqual(Object.values(AGENT_RUNTIME_CHAT_TRACE_KIND_COVERAGE).map((entry) => entry.eventOwner).sort(), kinds.map(() => 'recent-capability-events').sort())
  assert.deepEqual(Object.values(AGENT_RUNTIME_CHAT_TRACE_KIND_COVERAGE).map((entry) => entry.transcriptItem), kinds.map(() => false))
})

test('maps every MovScript Agent trace status into recent capability notice levels', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const traceStatusType = protocol.match(/export type AgentTraceStatus = ([^\n]+)/)
  assert.ok(traceStatusType)
  const protocolTraceStatuses = Array.from(traceStatusType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
  const statuses = Object.keys(AGENT_RUNTIME_CHAT_TRACE_STATUS_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_TRACE_STATUS_COVERAGE>
  const notifications = statuses.map((status) => agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: `event_trace_${status}`,
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 1,
    cursor: `cursor_trace_${status}`,
    emittedAt: '2026-06-04T00:00:01.000Z',
    kind: 'trace.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    entity: {
      type: 'trace',
      value: {
        id: `trace_${status}`,
        runId: 'run_1',
        kind: 'tool_call',
        title: `Trace ${status}`,
        status,
        createdAt: '2026-06-04T00:00:01.000Z',
      },
    },
  }))

  assert.deepEqual(statuses, protocolTraceStatuses)
  assert.deepEqual(notifications.map((notification) => notification?.method), statuses.map((status) => AGENT_RUNTIME_CHAT_TRACE_STATUS_COVERAGE[status].streamMethod))
  assert.deepEqual(notifications.map((notification) => notification?.event?.type === 'systemNotice' ? notification.event.level : null), statuses.map((status) => AGENT_RUNTIME_CHAT_TRACE_STATUS_COVERAGE[status].noticeLevel))
  assert.deepEqual(Object.values(AGENT_RUNTIME_CHAT_TRACE_STATUS_COVERAGE).map((entry) => entry.eventOwner).sort(), statuses.map(() => 'recent-capability-events').sort())
})

test('maps every MovScript Agent runtime status kind into recent capability notices', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const runtimeStatusMessageType = protocol.match(/export type AgentRuntimeStatusMessage =([\s\S]*?)\n\nexport interface AgentChatMessageMeta/)
  assert.ok(runtimeStatusMessageType)
  const runtimeStatusMessageInterfaces = Array.from(runtimeStatusMessageType[1].matchAll(/\|\s+(AgentRuntime\w+)/g), (match) => match[1])
  const protocolKinds = runtimeStatusMessageInterfaces.map((name) => {
    const statusInterface = protocol.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`))
    assert.ok(statusInterface)
    const kind = statusInterface[1].match(/kind: '([^']+)'/)
    assert.ok(kind)
    return kind[1]
  }).sort()
  const kinds = Object.keys(AGENT_RUNTIME_CHAT_RUNTIME_STATUS_KIND_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_RUNTIME_STATUS_KIND_COVERAGE>
  const notifications = kinds.map((kind) => agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: `event_runtime_status_${kind}`,
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 1,
    cursor: `cursor_runtime_status_${kind}`,
    emittedAt: '2026-06-04T00:00:01.000Z',
    kind: 'runtime_status.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    entity: {
      type: 'runtime_status',
      value: {
        id: `runtime_status_${kind}`,
        threadId: 'thread_1',
        runId: 'run_1',
        content: '',
        status: kind === 'async_work_handoff'
          ? {
            kind,
            title: 'Async work',
            detail: 'Background work',
            workKind: 'generation_job',
            workStatus: 'running',
          }
          : {
            kind,
            state: 'waiting',
            label: 'Waiting',
            detail: 'Approval required',
          },
        createdAt: '2026-06-04T00:00:01.000Z',
      },
    },
  } as never))

  assert.deepEqual(kinds, protocolKinds)
  assert.deepEqual(notifications.map((notification) => notification?.method), kinds.map((kind) => AGENT_RUNTIME_CHAT_RUNTIME_STATUS_KIND_COVERAGE[kind].streamMethod))
  assert.deepEqual(Object.values(AGENT_RUNTIME_CHAT_RUNTIME_STATUS_KIND_COVERAGE).map((entry) => entry.eventOwner).sort(), kinds.map(() => 'recent-capability-events').sort())
  assert.deepEqual(notifications.map((notification) => notification?.event?.type === 'systemNotice' ? notification.event.title : null), [
    'Async work',
    'Waiting',
  ])
  assert.deepEqual(notifications.map((notification) => notification?.event?.type === 'systemNotice' ? notification.event.detail : null), [
    'Background work\ngeneration_job\nrunning',
    'Approval required',
  ])
})

test('maps every MovScript Agent status-light state into recent capability notice levels', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const statusLightStateType = protocol.match(/export type AgentRuntimeStatusLightState = ([^\n]+)/)
  assert.ok(statusLightStateType)
  const protocolStates = Array.from(statusLightStateType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
  const states = Object.keys(AGENT_RUNTIME_CHAT_STATUS_LIGHT_STATE_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_STATUS_LIGHT_STATE_COVERAGE>
  const notifications = states.map((state) => agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: `event_status_light_${state}`,
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 1,
    cursor: `cursor_status_light_${state}`,
    emittedAt: '2026-06-04T00:00:01.000Z',
    kind: 'runtime_status.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    entity: {
      type: 'runtime_status',
      value: {
        id: `status_light_${state}`,
        threadId: 'thread_1',
        runId: 'run_1',
        content: '',
        status: {
          kind: 'status_light',
          state,
          label: `State ${state}`,
          detail: `Detail ${state}`,
        },
        createdAt: '2026-06-04T00:00:01.000Z',
      },
    },
  }))

  assert.deepEqual(states, protocolStates)
  assert.deepEqual(notifications.map((notification) => notification?.method), states.map((state) => AGENT_RUNTIME_CHAT_STATUS_LIGHT_STATE_COVERAGE[state].streamMethod))
  assert.deepEqual(notifications.map((notification) => notification?.event?.type === 'systemNotice' ? notification.event.level : null), states.map((state) => AGENT_RUNTIME_CHAT_STATUS_LIGHT_STATE_COVERAGE[state].noticeLevel))
  assert.deepEqual(Object.values(AGENT_RUNTIME_CHAT_STATUS_LIGHT_STATE_COVERAGE).map((entry) => entry.eventOwner).sort(), states.map(() => 'recent-capability-events').sort())
})

test('maps every MovScript Agent run status into neutral turn lifecycle', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const runStatusType = protocol.match(/export type AgentRunStatus = ([^\n]+)/)
  assert.ok(runStatusType)
  const protocolRunStatuses = Array.from(runStatusType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
  const statuses = Object.keys(AGENT_RUNTIME_CHAT_RUN_STATUS_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_RUN_STATUS_COVERAGE>
  const notifications = statuses.map((status) => agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: `event_run_${status}`,
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 1,
    cursor: `cursor_run_${status}`,
    emittedAt: '2026-06-04T00:00:01.000Z',
    kind: 'run.upserted',
    causality: { threadId: 'thread_1', runId: `run_${status}` },
    entity: {
      type: 'run',
      value: runFixture({ id: `run_${status}`, status }),
    },
  }))

  assert.deepEqual(statuses, protocolRunStatuses)
  assert.deepEqual(notifications.map((notification) => notification?.method), statuses.map((status) => AGENT_RUNTIME_CHAT_RUN_STATUS_COVERAGE[status].streamMethod))
  assert.deepEqual(notifications.map((notification) => {
    const params = isRecord(notification?.params) ? notification.params : {}
    const turn = isRecord(params.turn) ? params.turn : {}
    return turn.status
  }), statuses.map((status) => AGENT_RUNTIME_CHAT_RUN_STATUS_COVERAGE[status].neutralTurnStatus))
  assert.deepEqual(statuses.filter((status) => AGENT_RUNTIME_CHAT_RUN_STATUS_COVERAGE[status].terminal), [
    'cancelled',
    'completed',
    'completed_with_warnings',
    'failed',
  ])
  assert.deepEqual(statuses.filter((status) => !AGENT_RUNTIME_CHAT_RUN_STATUS_COVERAGE[status].terminal), [
    'in_progress',
    'queued',
    'requires_action',
  ])
})

test('maps every MovScript Agent thread status into neutral thread metadata', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const threadStatusType = protocol.match(/export type AgentThreadStatus = ([^\n]+)/)
  assert.ok(threadStatusType)
  const protocolThreadStatuses = Array.from(threadStatusType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
  const statuses = Object.keys(AGENT_RUNTIME_CHAT_THREAD_STATUS_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_THREAD_STATUS_COVERAGE>
  const threads = statuses.map((status) => agentChatThreadFromMovScriptAgent({
    thread: threadFixture({ id: `thread_${status}`, status }),
  }))
  const notifications = statuses.map((status) => agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: `event_thread_${status}`,
    scope: { type: 'thread', id: `thread_${status}` },
    ordinal: 1,
    cursor: `cursor_thread_${status}`,
    emittedAt: '2026-06-04T00:00:01.000Z',
    kind: 'thread.upserted',
    causality: { threadId: `thread_${status}` },
    entity: {
      type: 'thread',
      value: threadFixture({ id: `thread_${status}`, status }),
    },
  }))

  assert.deepEqual(statuses, protocolThreadStatuses)
  assert.deepEqual(threads.map((thread) => thread.status), statuses.map((status) => AGENT_RUNTIME_CHAT_THREAD_STATUS_COVERAGE[status].neutralThreadStatus))
  assert.deepEqual(notifications.map((notification) => notification?.method), statuses.map((status) => AGENT_RUNTIME_CHAT_THREAD_STATUS_COVERAGE[status].streamMethod))
  assert.deepEqual(notifications.map((notification) => {
    const params = isRecord(notification?.params) ? notification.params : {}
    return params.status
  }), statuses.map((status) => AGENT_RUNTIME_CHAT_THREAD_STATUS_COVERAGE[status].neutralThreadStatus))
  assert.deepEqual(statuses.filter((status) => AGENT_RUNTIME_CHAT_THREAD_STATUS_COVERAGE[status].active), [
    'requires_action',
    'running',
  ])
})

test('maps every MovScript Agent plan task status into neutral plan intent', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const planTaskStatusType = protocol.match(/export type AgentPlanTaskStatus = ([^\n]+)/)
  assert.ok(planTaskStatusType)
  const protocolPlanTaskStatuses = Array.from(planTaskStatusType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
  const statuses = Object.keys(AGENT_RUNTIME_CHAT_PLAN_TASK_STATUS_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_PLAN_TASK_STATUS_COVERAGE>
  const notifications = statuses.map((status) => agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: `event_plan_${status}`,
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 1,
    cursor: `cursor_plan_${status}`,
    emittedAt: '2026-06-04T00:00:01.000Z',
    kind: 'plan.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    entity: {
      type: 'plan',
      value: {
        schema: 'movscript.agent.plan.v1',
        id: `plan_${status}`,
        threadId: 'thread_1',
        runId: 'run_1',
        explanation: 'Plan status coverage',
        items: [{ step: `Step ${status}`, status }],
        completedCount: status === 'completed' ? 1 : 0,
        totalCount: 1,
        createdAt: '2026-06-04T00:00:00.000Z',
        updatedAt: '2026-06-04T00:00:01.000Z',
      },
    },
  }))
  const mappedStatuses = notifications.map((notification) => {
    const params = isRecord(notification?.params) ? notification.params : {}
    const plan = Array.isArray(params.plan) ? params.plan : []
    const step = isRecord(plan[0]) ? plan[0] : {}
    return step.status
  })

  assert.deepEqual(statuses, protocolPlanTaskStatuses)
  assert.deepEqual(notifications.map((notification) => notification?.method), statuses.map((status) => AGENT_RUNTIME_CHAT_PLAN_TASK_STATUS_COVERAGE[status].streamMethod))
  assert.deepEqual(mappedStatuses, statuses.map((status) => AGENT_RUNTIME_CHAT_PLAN_TASK_STATUS_COVERAGE[status].neutralPlanStatus))
  assert.deepEqual(statuses.map((status) => agentChatPlanStatusIntent(AGENT_RUNTIME_CHAT_PLAN_TASK_STATUS_COVERAGE[status].neutralPlanStatus)), statuses.map((status) => AGENT_RUNTIME_CHAT_PLAN_TASK_STATUS_COVERAGE[status].renderIntent))
})

test('maps every MovScript Agent message role into neutral message items', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const messageRoleType = protocol.match(/export type AgentMessageRole = ([^\n]+)/)
  assert.ok(messageRoleType)
  const protocolMessageRoles = Array.from(messageRoleType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
  const roles = Object.keys(AGENT_RUNTIME_CHAT_MESSAGE_ROLE_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_MESSAGE_ROLE_COVERAGE>
  const items = roles.map((role) => agentChatThreadItemFromAgentMessage({
    id: `message_${role}`,
    threadId: 'thread_1',
    runId: 'run_1',
    role,
    content: `${role} content`,
    createdAt: '2026-06-04T00:00:01.000Z',
  } as AgentMessage))

  assert.deepEqual(roles, protocolMessageRoles)
  assert.deepEqual(items.map((item) => item.type), roles.map((role) => AGENT_RUNTIME_CHAT_MESSAGE_ROLE_COVERAGE[role].neutralItem))
  const systemItem = items.find((item) => item.type === 'systemNotice')
  assert.equal(systemItem?.type, 'systemNotice')
  if (systemItem?.type === 'systemNotice') {
    assert.equal(systemItem.code, 'runtime.message.system')
    assert.equal(systemItem.title, 'System message')
  }
})

test('maps every MovScript Agent run step type explicitly', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const itemMapper = readFileSync(resolve('src/shared/infrastructure/local-agent-client/agentRuntimeChatThreadItems.ts'), 'utf8')
  const stepInterface = protocol.match(/export interface AgentRunStep \{([\s\S]*?)\n\}/)
  assert.ok(stepInterface)
  const stepTypeLine = stepInterface[1].match(/\n\s+type: ([^\n]+)/)
  assert.ok(stepTypeLine)
  const protocolStepTypes = Array.from(stepTypeLine[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
  const mappedStepTypes = Array.from(itemMapper.matchAll(/case '([^']+)'/g), (match) => match[1]).sort()
  const stepStatusType = protocol.match(/export type AgentStepStatus = ([^\n]+)/)
  assert.ok(stepStatusType)
  const protocolStepStatuses = Array.from(stepStatusType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()

  assert.deepEqual(mappedStepTypes, protocolStepTypes)
  assert.deepEqual(Object.keys(AGENT_RUNTIME_CHAT_RUN_STEP_TYPE_COVERAGE).sort(), protocolStepTypes)
  assert.equal(AGENT_RUNTIME_CHAT_RUN_STEP_TYPE_COVERAGE.message.neutralItem, 'reasoning')
  assert.equal(AGENT_RUNTIME_CHAT_RUN_STEP_TYPE_COVERAGE.tool_call.neutralItem, 'dynamicToolCall')
  assert.deepEqual(Object.keys(AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE).sort(), protocolStepStatuses)
  assert.equal(AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE.in_progress.dynamicToolSuccess, null)
  assert.equal(AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE.in_progress.mcpStatus, 'inProgress')
  assert.equal(AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE.completed.dynamicToolSuccess, true)
  assert.equal(AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE.failed.dynamicToolSuccess, false)
  assert.match(itemMapper, /assertNeverAgentRunStepType/)
})

test('maps every MovScript Agent run step status into neutral tool state', () => {
  const statuses = Object.keys(AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE) as Array<keyof typeof AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE>
  const dynamicItems = statuses.map((status) => agentChatThreadItemFromAgentRunStep('run_1', {
    id: `dynamic_${status}`,
    runId: 'run_1',
    type: 'tool_call',
    status,
    toolName: 'search',
    args: {},
    createdAt: '2026-06-04T00:00:01.000Z',
  } as never))
  const mcpItems = statuses.map((status) => agentChatThreadItemFromAgentRunStep('run_1', {
    id: `mcp_${status}`,
    runId: 'run_1',
    type: 'tool_call',
    status,
    toolName: 'movscript_focus_get',
    args: {},
    createdAt: '2026-06-04T00:00:01.000Z',
  } as never))

  assert.deepEqual(dynamicItems.map((item) => item.type), ['dynamicToolCall', 'dynamicToolCall', 'dynamicToolCall'])
  assert.deepEqual(dynamicItems.map((item) => item.type === 'dynamicToolCall' ? item.success : null), [
    AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE.in_progress.dynamicToolSuccess,
    AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE.completed.dynamicToolSuccess,
    AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE.failed.dynamicToolSuccess,
  ])
  assert.deepEqual(mcpItems.map((item) => item.type), ['mcpToolCall', 'mcpToolCall', 'mcpToolCall'])
  assert.deepEqual(mcpItems.map((item) => item.type === 'mcpToolCall' ? item.status : null), [
    AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE.in_progress.mcpStatus,
    AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE.completed.mcpStatus,
    AGENT_RUNTIME_CHAT_RUN_STEP_STATUS_COVERAGE.failed.mcpStatus,
  ])
})

test('tracks MovScript Agent pending interaction sources in the server request coverage table', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const adapter = readFileSync(resolve('src/shared/infrastructure/local-agent-client/movscriptAgentChatProtocolAdapter.ts'), 'utf8')
  const interactionKindType = protocol.match(/export type RuntimeInteractionKind = ([^\n]+)/)
  assert.ok(interactionKindType)
  const protocolInteractionKinds = Array.from(interactionKindType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
  const interactionStatusType = protocol.match(/export type RuntimeInteractionStatus = ([^\n]+)/)
  assert.ok(interactionStatusType)
  const protocolInteractionStatuses = Array.from(interactionStatusType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()

  assert.deepEqual(Object.keys(AGENT_RUNTIME_CHAT_INTERACTION_KIND_COVERAGE).sort(), protocolInteractionKinds)
  assert.deepEqual(Object.values(AGENT_RUNTIME_CHAT_INTERACTION_KIND_COVERAGE).map((entry) => entry.source).sort(), [
    'pendingApprovalInteractions',
    'pendingInputInteractions',
    'pendingSelectionInteractions',
  ])
  assert.equal(AGENT_RUNTIME_CHAT_INTERACTION_KIND_COVERAGE.approval.method, 'item/permissions/requestApproval')
  assert.equal(AGENT_RUNTIME_CHAT_INTERACTION_KIND_COVERAGE.input.method, 'item/tool/requestUserInput')
  assert.equal(AGENT_RUNTIME_CHAT_INTERACTION_KIND_COVERAGE.selection.method, 'item/tool/requestUserInput')
  assert.deepEqual(Object.keys(AGENT_RUNTIME_CHAT_INTERACTION_STATUS_COVERAGE).sort(), protocolInteractionStatuses)
  assert.deepEqual(Object.entries(AGENT_RUNTIME_CHAT_INTERACTION_STATUS_COVERAGE)
    .filter(([, coverage]) => coverage.phase === 'pending')
    .map(([status]) => status), ['pending'])
  assert.deepEqual(Object.entries(AGENT_RUNTIME_CHAT_INTERACTION_STATUS_COVERAGE)
    .filter(([, coverage]) => coverage.phase === 'resolved')
    .map(([status]) => status)
    .sort(), ['answered', 'approved', 'cancelled', 'rejected'])
  assert.equal(AGENT_RUNTIME_CHAT_INTERACTION_STATUS_COVERAGE.pending.emitsServerRequest, true)
  assert.equal(AGENT_RUNTIME_CHAT_INTERACTION_STATUS_COVERAGE.pending.emitsResolvedNotification, false)
  for (const status of ['approved', 'rejected', 'answered', 'cancelled'] as const) {
    assert.equal(AGENT_RUNTIME_CHAT_INTERACTION_STATUS_COVERAGE[status].emitsServerRequest, false)
    assert.equal(AGENT_RUNTIME_CHAT_INTERACTION_STATUS_COVERAGE[status].emitsResolvedNotification, true)
  }
  assert.deepEqual(Object.keys(AGENT_RUNTIME_CHAT_SERVER_REQUEST_COVERAGE).sort(), [
    'pendingApprovalInteractions',
    'pendingApprovals',
    'pendingInputInteractions',
    'pendingInputRequests',
    'pendingMcpToolStepInteraction',
    'pendingSelectionInteractions',
  ])
  assert.deepEqual(Object.values(AGENT_RUNTIME_CHAT_SERVER_REQUEST_COVERAGE).map((entry) => entry.method).sort(), [
    'item/permissions/requestApproval',
    'item/permissions/requestApproval',
    'item/permissions/requestApproval',
    'item/tool/requestUserInput',
    'item/tool/requestUserInput',
    'item/tool/requestUserInput',
  ])
  assert.match(adapter, /run\.pendingApprovals/)
  assert.match(adapter, /run\.pendingInputRequests/)
  assert.match(adapter, /agentChatServerRequestsFromMovScriptInteraction/)
  assert.match(adapter, /interaction\.kind === 'approval'/)
  assert.match(adapter, /interaction\.kind === 'input'/)
  assert.match(adapter, /interaction\.kind === 'selection'/)
  assert.match(adapter, /agentChatServerRequestsFromMovScriptMcpToolStepEvent/)
  assert.match(adapter, /event\.causality\?\.interactionId/)
  assert.match(adapter, /approval\.status === 'pending' && Boolean\(approval\.interactionId\?\.trim\(\)\)/)
  assert.match(adapter, /input\.status === 'pending'/)
})

test('maps every MovScript Agent tool policy union into chat request ownership', () => {
  const protocol = readFileSync(resolve('../../packages/protocol/src/index.ts'), 'utf8')
  const runtimeApprovalModes = Object.keys(AGENT_RUNTIME_CHAT_RUNTIME_APPROVAL_MODE_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_RUNTIME_APPROVAL_MODE_COVERAGE>
  const approvalModes = Object.keys(AGENT_RUNTIME_CHAT_TOOL_APPROVAL_MODE_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_TOOL_APPROVAL_MODE_COVERAGE>
  const grantModes = Object.keys(AGENT_RUNTIME_CHAT_TOOL_GRANT_MODE_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_TOOL_GRANT_MODE_COVERAGE>
  const risks = Object.keys(AGENT_RUNTIME_CHAT_TOOL_RISK_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_TOOL_RISK_COVERAGE>
  const interruptBehaviors = Object.keys(AGENT_RUNTIME_CHAT_TOOL_INTERRUPT_BEHAVIOR_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_TOOL_INTERRUPT_BEHAVIOR_COVERAGE>
  const resultRefStrategies = Object.keys(AGENT_RUNTIME_CHAT_TOOL_RESULT_REF_STRATEGY_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_TOOL_RESULT_REF_STRATEGY_COVERAGE>
  const approvalReasons = Object.keys(AGENT_RUNTIME_CHAT_TOOL_APPROVAL_REASON_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_TOOL_APPROVAL_REASON_COVERAGE>
  const unavailableReasons = Object.keys(AGENT_RUNTIME_CHAT_TOOL_UNAVAILABLE_REASON_COVERAGE).sort() as Array<keyof typeof AGENT_RUNTIME_CHAT_TOOL_UNAVAILABLE_REASON_COVERAGE>

  assert.deepEqual(runtimeApprovalModes, protocolInterfacePropertyStringUnion(protocol, 'AgentRuntimeLimits', 'approvalMode'))
  assert.deepEqual(approvalModes, protocolStringUnion(protocol, 'AgentToolApprovalMode'))
  assert.deepEqual(grantModes, protocolStringUnion(protocol, 'AgentToolGrantMode'))
  assert.deepEqual(risks, protocolStringUnion(protocol, 'AgentToolRiskLevel'))
  assert.deepEqual(interruptBehaviors, protocolStringUnion(protocol, 'AgentToolInterruptBehavior'))
  assert.deepEqual(resultRefStrategies, protocolStringUnion(protocol, 'AgentToolResultRefStrategy'))
  assert.deepEqual(approvalReasons, protocolInterfacePropertyStringUnion(protocol, 'AgentToolRuntimeExplanation', 'approvalReason'))
  assert.deepEqual(unavailableReasons, protocolStringUnion(protocol, 'ToolUnavailableReason'))
  assert.deepEqual(runtimeApprovalModes.map((mode) => AGENT_RUNTIME_CHAT_RUNTIME_APPROVAL_MODE_COVERAGE[mode].transcriptItem), runtimeApprovalModes.map(() => false))
  assert.deepEqual(approvalModes.map((mode) => AGENT_RUNTIME_CHAT_TOOL_APPROVAL_MODE_COVERAGE[mode].owner), approvalModes.map(() => 'server-request-policy'))
  assert.deepEqual(grantModes.map((mode) => AGENT_RUNTIME_CHAT_TOOL_GRANT_MODE_COVERAGE[mode].owner), grantModes.map(() => 'tool-permission-settings'))
  assert.deepEqual(risks.map((risk) => AGENT_RUNTIME_CHAT_TOOL_RISK_COVERAGE[risk].owner), risks.map(() => 'server-request-policy'))
  assert.deepEqual(interruptBehaviors.map((behavior) => AGENT_RUNTIME_CHAT_TOOL_INTERRUPT_BEHAVIOR_COVERAGE[behavior].owner), interruptBehaviors.map(() => 'turn-control-policy'))
  assert.deepEqual(resultRefStrategies.map((strategy) => AGENT_RUNTIME_CHAT_TOOL_RESULT_REF_STRATEGY_COVERAGE[strategy].owner), resultRefStrategies.map(() => 'tool-result-display'))
  assert.deepEqual(approvalReasons.map((reason) => AGENT_RUNTIME_CHAT_TOOL_APPROVAL_REASON_COVERAGE[reason].owner), approvalReasons.map(() => 'server-request-policy'))
  assert.deepEqual(unavailableReasons.map((reason) => AGENT_RUNTIME_CHAT_TOOL_UNAVAILABLE_REASON_COVERAGE[reason].owner), unavailableReasons.map(() => 'tool-availability'))
  assert.equal(AGENT_RUNTIME_CHAT_RUNTIME_APPROVAL_MODE_COVERAGE.interactive.canEmitApprovalRequest, true)
  assert.equal(AGENT_RUNTIME_CHAT_RUNTIME_APPROVAL_MODE_COVERAGE.auto.canEmitApprovalRequest, false)
  assert.equal(AGENT_RUNTIME_CHAT_TOOL_APPROVAL_MODE_COVERAGE.on_write.canEmitApprovalRequest, 'conditional')
  assert.equal(AGENT_RUNTIME_CHAT_TOOL_GRANT_MODE_COVERAGE.deny.canEmitApprovalRequest, false)
  assert.equal(AGENT_RUNTIME_CHAT_TOOL_UNAVAILABLE_REASON_COVERAGE.approval_required.canEmitApprovalRequest, true)
})

test('maps MovScript Agent messages and runs into Codex-shaped thread turns and items', () => {
  const thread = agentChatThreadFromMovScriptAgent({
    thread: threadFixture(),
    runs: [runFixture()],
  })

  assert.equal(thread.provider, 'movscript')
  assert.equal(thread.id, 'thread_1')
  assert.equal(thread.turns.length, 1)
  assert.equal(thread.turns[0]?.id, 'run_1')
  assert.equal(thread.turns[0]?.status, 'completed')
  assert.deepEqual(thread.turns[0]?.items.map((item) => item.type), ['userMessage', 'agentMessage', 'dynamicToolCall'])
  const firstItem = thread.turns[0]?.items[0]
  const firstContent = firstItem?.type === 'userMessage' ? firstItem.content[0] : undefined
  assert.equal(firstContent?.type === 'text' ? firstContent.text : '', 'Make a plan')
  assert.equal(thread.turns[0]?.items[1]?.type === 'agentMessage' ? thread.turns[0].items[1].text : '', 'Plan ready')
  const toolItem = thread.turns[0]?.items[2]
  assert.equal(toolItem?.type, 'dynamicToolCall')
  if (toolItem?.type === 'dynamicToolCall') {
    assert.equal(toolItem.namespace, 'model')
    assert.deepEqual(toolItem.arguments, { query: 'outline' })
    assert.deepEqual(toolItem.result, {
      matches: 2,
      output_resources: [
        { ID: 42, type: 'video', name: 'Cut.mp4', url: 'https://cdn.example.com/cut.mp4', mime_type: 'video/mp4' },
        { ID: 43, type: 'image', name: 'Frame.png', url: 'https://cdn.example.com/frame.png', mime_type: 'image/png' },
      ],
    })
    assert.deepEqual(toolItem.contentItems, [
      {
        type: 'resource',
        resource: {
          uri: 'resource:42',
          url: 'https://cdn.example.com/cut.mp4',
          name: 'Cut.mp4',
          mimeType: 'video/mp4',
        },
      },
      {
        type: 'image',
        url: 'https://cdn.example.com/frame.png',
        mimeType: 'image/png',
        name: 'Frame.png',
      },
    ])
    assert.equal(toolItem.durationMs, 1000)
  }
})

test('maps MovScript Agent edge messages and steps into neutral items', () => {
  const userMessageWithClientInput = agentChatThreadItemFromAgentMessage({
    id: 'msg_user_client_input',
    threadId: 'thread_1',
    role: 'user',
    content: 'Fallback message',
    clientInput: {
      message: 'Rendered message',
      attachments: [
        { id: 'att_image', name: 'Frame', type: 'image', mimeType: 'image/png', previewUrl: 'https://cdn.example.com/frame-preview.png', url: 'https://cdn.example.com/frame.png' },
        { id: 'att_resource', name: 'Storyboard', type: 'video', mimeType: 'video/mp4', resourceId: 42, url: 'https://cdn.example.com/cut.mp4' },
        { id: 'att_audio', name: 'Voiceover', type: 'audio', mime_type: 'audio/wav', resource_id: '43', direct_url: 'https://cdn.example.com/voice.wav' },
        { id: 'att_bad_resource', name: 'Bad resource', type: 'video', mime_type: 'video/mp4', resource_id: '0', direct_url: 'https://cdn.example.com/bad-resource.mp4' },
      ],
    },
    createdAt: '2026-06-04T00:00:00.000Z',
  } as AgentMessage)
  const systemMessage = agentChatThreadItemFromAgentMessage({
    id: 'msg_system',
    threadId: 'thread_1',
    role: 'system',
    content: 'Runtime system message',
    createdAt: '2026-06-04T00:00:00.000Z',
  } as AgentMessage)
  const reasoningStep = agentChatThreadItemFromAgentRunStep('run_1', {
    id: 'step_message',
    runId: 'run_1',
    type: 'message',
    status: 'failed',
    roundId: 'round_final',
    roundIndex: 2,
    roundLabel: 'Final response',
    roundSource: 'final',
    title: 'Checked constraints',
    result: { findings: 0 },
    error: 'Minor warning',
    errorData: { code: 'E_MINOR' },
    durationMs: 44,
    createdAt: '2026-06-04T00:00:01.000Z',
    completedAt: '2026-06-04T00:00:02.000Z',
  } as never)
  const failedToolStep = agentChatThreadItemFromAgentRunStep('run_1', {
    id: 'step_failed_tool',
    runId: 'run_1',
    type: 'tool_call',
    status: 'failed',
    roundId: 'round_model',
    roundIndex: 1,
    roundLabel: 'Model turn 1',
    roundSource: 'model',
    toolName: 'search',
    title: 'Search',
    args: { query: 'outline' },
    error: 'Search failed',
    errorData: { code: 'E_SEARCH' },
    sandboxed: true,
    durationMs: 55,
    createdAt: '2026-06-04T00:00:01.000Z',
    completedAt: '2026-06-04T00:00:02.000Z',
  } as never)
  const mediaToolStep = agentChatThreadItemFromAgentRunStep('run_1', {
    id: 'step_media_tool',
    runId: 'run_1',
    type: 'tool_call',
    status: 'completed',
    roundSource: 'model',
    toolName: 'render',
    args: { prompt: 'clip' },
    result: {
      contentItems: [{ type: 'inputText', text: 'Render complete' }],
      contents: [
        {
          uri: 'movscript://render/summary',
          mimeType: 'text/markdown',
          text: '# Render summary\nGenerated clip is ready.',
        },
        {
          uri: 'resource:77',
          mimeType: 'video/mp4',
          text: 'Generated clip manifest',
        },
      ],
      data: {
        outputResourceId: 77,
        outputResources: [
          { id: 77, type: 'video', name: 'Generated clip', url: 'https://cdn.example.com/generated.mp4', mimeType: 'video/mp4' },
        ],
      },
    },
    createdAt: '2026-06-04T00:00:01.000Z',
    completedAt: '2026-06-04T00:00:02.000Z',
  } as never)

  assert.equal(userMessageWithClientInput.type, 'userMessage')
  if (userMessageWithClientInput.type === 'userMessage') {
    assert.equal(userMessageWithClientInput.content[0]?.type, 'text')
    assert.equal(userMessageWithClientInput.content[0]?.type === 'text' ? userMessageWithClientInput.content[0].text : '', 'Rendered message')
    assert.equal(userMessageWithClientInput.content[1]?.type, 'image')
    assert.equal(userMessageWithClientInput.content[1]?.type === 'image' ? userMessageWithClientInput.content[1].url : '', 'https://cdn.example.com/frame-preview.png')
    assert.equal(userMessageWithClientInput.content[2]?.type, 'mention')
    assert.equal(userMessageWithClientInput.content[2]?.type === 'mention' ? userMessageWithClientInput.content[2].path : '', 'resource:42')
    assert.deepEqual(userMessageWithClientInput.content[3], {
      type: 'mention',
      name: 'Voiceover',
      path: 'resource:43',
      kind: 'audio',
      mimeType: 'audio/wav',
      url: 'https://cdn.example.com/voice.wav',
    })
    assert.deepEqual(userMessageWithClientInput.content[4], {
      type: 'mention',
      name: 'Bad resource',
      path: 'att_bad_resource',
      kind: 'video',
      mimeType: 'video/mp4',
      url: 'https://cdn.example.com/bad-resource.mp4',
    })
  }
  assert.equal(systemMessage.type, 'systemNotice')
  if (systemMessage.type === 'systemNotice') {
    assert.equal(systemMessage.code, 'runtime.message.system')
    assert.equal(systemMessage.title, 'System message')
    assert.equal(systemMessage.detail, 'Runtime system message')
  }
  assert.equal(reasoningStep.type, 'reasoning')
  if (reasoningStep.type === 'reasoning') {
    assert.equal(reasoningStep.title, 'Checked constraints')
    assert.equal(reasoningStep.status, 'failed')
    assert.equal(reasoningStep.source, 'final')
    assert.equal(reasoningStep.roundId, 'round_final')
    assert.equal(reasoningStep.roundIndex, 2)
    assert.equal(reasoningStep.roundLabel, 'Final response')
    assert.deepEqual(reasoningStep.summary, ['Checked constraints'])
    assert.deepEqual(reasoningStep.content, ['Minor warning'])
    assert.deepEqual(reasoningStep.result, { findings: 0 })
    assert.deepEqual(reasoningStep.error, { code: 'E_MINOR' })
    assert.equal(reasoningStep.durationMs, 44)
  }
  assert.equal(failedToolStep.type, 'dynamicToolCall')
  if (failedToolStep.type === 'dynamicToolCall') {
    assert.equal(failedToolStep.status, 'failed')
    assert.equal(failedToolStep.roundId, 'round_model')
    assert.equal(failedToolStep.roundIndex, 1)
    assert.equal(failedToolStep.roundLabel, 'Model turn 1')
    assert.equal(failedToolStep.success, false)
    assert.deepEqual(failedToolStep.error, { code: 'E_SEARCH' })
    assert.equal(failedToolStep.sandboxed, true)
    assert.equal(failedToolStep.durationMs, 55)
  }
  assert.equal(mediaToolStep.type, 'dynamicToolCall')
  if (mediaToolStep.type === 'dynamicToolCall') {
    assert.deepEqual(mediaToolStep.contentItems, [
      { type: 'inputText', text: 'Render complete' },
      {
        type: 'resource',
        resource: {
          uri: 'movscript://render/summary',
          mimeType: 'text/markdown',
          text: '# Render summary\nGenerated clip is ready.',
        },
      },
      {
        type: 'resource',
        resource: {
          uri: 'resource:77',
          url: 'https://cdn.example.com/generated.mp4',
          name: 'Generated clip',
          mimeType: 'video/mp4',
          text: 'Generated clip manifest',
        },
      },
    ])
  }
})

test('maps MovScript Agent resource id aliases in tool results into neutral resource items', () => {
  const candidateAttachStep = agentChatThreadItemFromAgentRunStep('run_1', {
    id: 'step_candidate_attach',
    runId: 'run_1',
    type: 'tool_call',
    status: 'completed',
    roundSource: 'model',
    toolName: 'candidate_asset_slot_attach',
    args: { asset_slot_id: 12, resource_id: 77 },
    result: {
      content: [
        { type: 'text', text: 'Attached candidate resources' },
        { type: 'resource', resource: { uri: 'resource:77', url: '/api/v1/resources/77/file', name: 'Attached resource' } },
      ],
      status: 'ok',
      resource_id: 77,
      resource_ids: [78],
      message: 'Attached candidate resources',
    },
    createdAt: '2026-06-04T00:00:01.000Z',
    completedAt: '2026-06-04T00:00:02.000Z',
  } as never)
  const uploadStep = agentChatThreadItemFromAgentRunStep('run_1', {
    id: 'step_resource_upload',
    runId: 'run_1',
    type: 'tool_call',
    status: 'completed',
    roundSource: 'model',
    toolName: 'movscript_resource_upload',
    args: { artifact_path: '.movscript/guide.png' },
    result: {
      status: 'ok',
      resource_id: 91,
      resource: {
        ID: 91,
        type: 'image',
        name: 'Guide.png',
        direct_url: 'https://cdn.example.com/guide.png',
        mime_type: 'image/png',
      },
      message: 'Uploaded resource',
    },
    createdAt: '2026-06-04T00:00:01.000Z',
    completedAt: '2026-06-04T00:00:02.000Z',
  } as never)
  const wrappedMcpStep = agentChatThreadItemFromAgentRunStep('run_1', {
    id: 'step_wrapped_mcp_resource',
    runId: 'run_1',
    type: 'tool_call',
    status: 'completed',
    roundSource: 'model',
    toolName: 'candidate_keyframe_attach',
    args: { keyframe_id: 22, resource_id: 92 },
    result: {
      content: [{ type: 'text', text: 'Attached keyframe candidate' }],
      structuredContent: {
        status: 'ok',
        resource_id: 92,
        resource: {
          ID: 92,
          type: 'video',
          name: 'Keyframe candidate.mp4',
          url: 'https://cdn.example.com/keyframe-candidate.mp4',
          mime_type: 'video/mp4',
        },
      },
      _meta: { requestId: 'mcp_result_1' },
    },
    createdAt: '2026-06-04T00:00:01.000Z',
    completedAt: '2026-06-04T00:00:02.000Z',
  } as never)

  assert.equal(candidateAttachStep.type, 'mcpToolCall')
  if (candidateAttachStep.type === 'mcpToolCall') {
    const result = isRecord(candidateAttachStep.result) ? candidateAttachStep.result : {}
    assert.deepEqual(result.content, [
      { type: 'text', text: 'Attached candidate resources' },
      { type: 'resource', resource: { uri: 'resource:77', url: '/api/v1/resources/77/file', name: 'Attached resource' } },
      {
        type: 'resource',
        resource: {
          uri: 'resource:78',
          url: '/api/v1/resources/78/file',
          name: 'resource-78',
        },
      },
    ])
    assert.deepEqual(result.structuredContent, {
      content: [
        { type: 'text', text: 'Attached candidate resources' },
        { type: 'resource', resource: { uri: 'resource:77', url: '/api/v1/resources/77/file', name: 'Attached resource' } },
      ],
      status: 'ok',
      resource_id: 77,
      resource_ids: [78],
      message: 'Attached candidate resources',
    })
  }
  assert.equal(uploadStep.type, 'mcpToolCall')
  if (uploadStep.type === 'mcpToolCall') {
    const result = isRecord(uploadStep.result) ? uploadStep.result : {}
    assert.deepEqual(result.content, [
      {
        type: 'image',
        url: 'https://cdn.example.com/guide.png',
        mimeType: 'image/png',
        name: 'Guide.png',
      },
    ])
  }
  assert.equal(wrappedMcpStep.type, 'mcpToolCall')
  if (wrappedMcpStep.type === 'mcpToolCall') {
    const result = isRecord(wrappedMcpStep.result) ? wrappedMcpStep.result : {}
    assert.deepEqual(result.content, [
      { type: 'text', text: 'Attached keyframe candidate' },
      {
        type: 'resource',
        resource: {
          uri: 'resource:92',
          url: 'https://cdn.example.com/keyframe-candidate.mp4',
          name: 'Keyframe candidate.mp4',
          mimeType: 'video/mp4',
        },
      },
    ])
    assert.deepEqual(result.structuredContent, {
      status: 'ok',
      resource_id: 92,
      resource: {
        ID: 92,
        type: 'video',
        name: 'Keyframe candidate.mp4',
        url: 'https://cdn.example.com/keyframe-candidate.mp4',
        mime_type: 'video/mp4',
      },
    })
    assert.deepEqual(result._meta, { requestId: 'mcp_result_1' })
  }
})

test('maps MovScript Agent MCP contents arrays into neutral MCP content items', () => {
  const resourceReadStep = agentChatThreadItemFromAgentRunStep('run_1', {
    id: 'step_resource_read',
    runId: 'run_1',
    type: 'tool_call',
    status: 'completed',
    roundSource: 'model',
    toolName: 'mcp__movscript_workspace__resources_read',
    args: { uri: 'movscript://ui/current-route' },
    result: {
      contents: [
        {
          uri: 'movscript://ui/current-route',
          mimeType: 'text/markdown',
          text: '# Current route\n/projects/42',
        },
        {
          uri: 'movscript://resource-file/91',
          mimeType: 'image/png',
          blob: 'AAAA',
        },
        {
          uri: 'movscript://resource-file/93',
          mimeType: 'image/png',
          data: 'BBBB',
        },
        {
          uri: 'movscript://resource-file/94',
          mimeType: 'audio/wav',
          data: 'CCCC',
        },
        {
          uri: 'movscript://resource-file/92',
          name: 'Rendered frame',
          mimeType: 'image/png',
          url: 'https://cdn.example.com/rendered-frame.png',
        },
      ],
      data: { route: '/projects/42' },
    },
    createdAt: '2026-06-04T00:00:01.000Z',
    completedAt: '2026-06-04T00:00:02.000Z',
  } as never)

  assert.equal(resourceReadStep.type, 'mcpToolCall')
  if (resourceReadStep.type === 'mcpToolCall') {
    assert.equal(resourceReadStep.server, 'movscript_workspace')
    assert.equal(resourceReadStep.tool, 'resources_read')
    const result = isRecord(resourceReadStep.result) ? resourceReadStep.result : {}
    assert.deepEqual(result.content, [
      {
        type: 'resource',
        resource: {
          uri: 'movscript://ui/current-route',
          mimeType: 'text/markdown',
          text: '# Current route\n/projects/42',
        },
      },
      {
        uri: 'movscript://resource-file/91',
        mimeType: 'image/png',
        blob: 'AAAA',
        type: 'image',
        data: 'AAAA',
      },
      {
        uri: 'movscript://resource-file/93',
        mimeType: 'image/png',
        data: 'BBBB',
        type: 'image',
      },
      {
        type: 'resource',
        resource: {
          uri: 'movscript://resource-file/94',
          mimeType: 'audio/wav',
          data: 'CCCC',
        },
      },
      {
        uri: 'movscript://resource-file/92',
        name: 'Rendered frame',
        mimeType: 'image/png',
        url: 'https://cdn.example.com/rendered-frame.png',
        type: 'image',
      },
    ])
    assert.deepEqual(result.structuredContent, {
      contents: [
        {
          uri: 'movscript://ui/current-route',
          mimeType: 'text/markdown',
          text: '# Current route\n/projects/42',
        },
        {
          uri: 'movscript://resource-file/91',
          mimeType: 'image/png',
          blob: 'AAAA',
        },
        {
          uri: 'movscript://resource-file/93',
          mimeType: 'image/png',
          data: 'BBBB',
        },
        {
          uri: 'movscript://resource-file/94',
          mimeType: 'audio/wav',
          data: 'CCCC',
        },
        {
          uri: 'movscript://resource-file/92',
          name: 'Rendered frame',
          mimeType: 'image/png',
          url: 'https://cdn.example.com/rendered-frame.png',
        },
      ],
      data: { route: '/projects/42' },
    })
  }
})

test('maps MovScript Agent MCP workspace tool steps into neutral MCP tool calls', () => {
  const focusToolStep = agentChatThreadItemFromAgentRunStep('run_1', {
    id: 'call_Ys6DnWNeoWwc3bT6XWAs3eu4',
    runId: 'run_1',
    type: 'tool_call',
    status: 'in_progress',
    roundSource: 'model',
    toolName: 'movscript_focus_get',
    args: {},
    createdAt: '2026-06-04T00:00:01.000Z',
  } as never)
  const generatedVideoStep = agentChatThreadItemFromAgentRunStep('run_1', {
    id: 'step_generation_video',
    runId: 'run_1',
    type: 'tool_call',
    status: 'completed',
    roundSource: 'model',
    toolName: 'generation_video_generate',
    args: { prompt: 'wide establishing shot' },
    result: {
      contentItems: [
        { type: 'inputText', text: 'Generation queued' },
        { type: 'inputVideo', url: 'https://cdn.example.com/generated.mp4', mimeType: 'video/mp4' },
      ],
      structuredContent: { jobId: 'job_1' },
    },
    durationMs: 500,
    createdAt: '2026-06-04T00:00:01.000Z',
    completedAt: '2026-06-04T00:00:02.000Z',
  } as never)
  const externalMcpStep = agentChatThreadItemFromAgentRunStep('run_1', {
    id: 'step_external_mcp',
    runId: 'run_1',
    type: 'tool_call',
    status: 'completed',
    roundSource: 'model',
    toolName: 'mcp__filesystem__read_file',
    args: { path: 'story.md' },
    result: { content: [{ type: 'text', text: 'Story' }], structuredContent: null, _meta: null },
    createdAt: '2026-06-04T00:00:01.000Z',
    completedAt: '2026-06-04T00:00:02.000Z',
  } as never)

  assert.equal(focusToolStep.type, 'mcpToolCall')
  if (focusToolStep.type === 'mcpToolCall') {
    assert.equal(focusToolStep.id, 'call_Ys6DnWNeoWwc3bT6XWAs3eu4')
    assert.equal(focusToolStep.server, 'movscript_workspace')
    assert.equal(focusToolStep.tool, 'movscript_focus_get')
    assert.equal(focusToolStep.status, 'inProgress')
    assert.deepEqual(focusToolStep.arguments, {})
    assert.equal(focusToolStep.pluginId, 'movscript@movscript-bundled')
    assert.equal(focusToolStep.result, null)
    assert.equal(focusToolStep.error, null)
  }
  assert.equal(generatedVideoStep.type, 'mcpToolCall')
  if (generatedVideoStep.type === 'mcpToolCall') {
    assert.equal(generatedVideoStep.server, 'movscript_workspace')
    assert.equal(generatedVideoStep.tool, 'generation_video_generate')
    assert.equal(generatedVideoStep.status, 'completed')
    const result = isRecord(generatedVideoStep.result) ? generatedVideoStep.result : {}
    assert.deepEqual(result.structuredContent, { jobId: 'job_1' })
    assert.deepEqual(result.content, [
      { type: 'text', text: 'Generation queued' },
      { type: 'video', url: 'https://cdn.example.com/generated.mp4', mimeType: 'video/mp4' },
    ])
    assert.equal(generatedVideoStep.durationMs, 500)
  }
  assert.equal(externalMcpStep.type, 'mcpToolCall')
  if (externalMcpStep.type === 'mcpToolCall') {
    assert.equal(externalMcpStep.server, 'filesystem')
    assert.equal(externalMcpStep.tool, 'read_file')
    assert.equal(externalMcpStep.pluginId, null)
    assert.deepEqual(externalMcpStep.result, { content: [{ type: 'text', text: 'Story' }], structuredContent: null, _meta: null })
  }
})

test('maps MovScript Agent approvals without interaction ids into non-actionable notices', () => {
  const thread = agentChatThreadFromMovScriptAgent({
    thread: threadFixture(),
    runs: [runFixture({
      status: 'requires_action',
      pendingApprovals: [{
        id: 'approval_without_interaction',
        runId: 'run_1',
        toolName: 'writeFile',
        reason: 'Needs write access',
        permission: 'workspace-write',
        risk: 'medium',
        status: 'pending',
        createdAt: '2026-06-04T00:00:00.000Z',
        updatedAt: '2026-06-04T00:00:00.000Z',
      }],
    })],
  })

  const notice = thread.turns[0]?.items.find((item) => item.type === 'systemNotice')
  assert.equal(notice?.type, 'systemNotice')
  if (notice?.type === 'systemNotice') {
    assert.equal(notice.id, 'runtime-approval-unavailable:approval_without_interaction')
    assert.equal(notice.level, 'warning')
    assert.equal(notice.code, 'runtime.approval.missing_interaction')
    assert.match(notice.title, /writeFile/)
    assert.match(notice.detail ?? '', /runtime reported a pending approval without an interaction id/)
    assert.match(notice.detail ?? '', /the UI will show approval controls when the interaction event arrives/)
    assert.match(notice.detail ?? '', /Needs write access/)
    assert.match(notice.detail ?? '', /workspace-write/)
  }
})

test('maps MovScript Agent runtime events into Codex-shaped stream notifications', () => {
  const threadNotification = agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_thread',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 0,
    cursor: 'cursor_0',
    emittedAt: '2026-06-04T00:00:00.000Z',
    kind: 'thread.upserted',
    causality: { threadId: 'thread_1' },
    entity: {
      type: 'thread',
      value: threadFixture({ title: 'Updated title', status: 'completed', updatedAt: '2026-06-04T00:00:05.000Z' }),
    },
  })
  const run = runFixture({ status: 'in_progress' })
  const runNotification = agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_run',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 1,
    cursor: 'cursor_1',
    emittedAt: '2026-06-04T00:00:00.000Z',
    kind: 'run.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    entity: { type: 'run', value: run },
  })
  const progressNotification = agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_progress',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 2,
    cursor: 'cursor_2',
    emittedAt: '2026-06-04T00:00:01.000Z',
    kind: 'assistant.progress',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    assistantProgress: {
      runId: 'run_1',
      traceId: 'msg_stream',
      delta: 'hello',
      accumulated: 'hello',
      createdAt: '2026-06-04T00:00:01.000Z',
    },
  })
  const stepNotification = agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_step',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 3,
    cursor: 'cursor_3',
    emittedAt: '2026-06-04T00:00:02.000Z',
    kind: 'step.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    entity: {
      type: 'step',
      value: {
        id: 'step_stream',
        runId: 'run_1',
        type: 'tool_call',
        status: 'failed',
        roundId: 'round_stream',
        roundIndex: 3,
        roundLabel: 'Model turn 3',
        roundSource: 'model',
        toolName: 'search',
        args: { query: 'outline' },
        error: 'Search failed',
        errorData: { code: 'E_SEARCH' },
        sandboxed: true,
        durationMs: 55,
        createdAt: '2026-06-04T00:00:01.000Z',
        completedAt: '2026-06-04T00:00:02.000Z',
      },
    },
  })
  const runtimeStatusNotification = agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_status',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 4,
    cursor: 'cursor_4',
    emittedAt: '2026-06-04T00:00:03.000Z',
    kind: 'runtime_status.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    entity: {
      type: 'runtime_status',
      value: {
        id: 'status_1',
        threadId: 'thread_1',
        runId: 'run_1',
        content: 'Waiting for approval',
        status: {
          kind: 'status_light',
          state: 'waiting',
          label: 'Waiting',
          detail: 'Approval required',
        },
        createdAt: '2026-06-04T00:00:03.000Z',
      },
    },
  })
  const planNotification = agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_plan',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 5,
    cursor: 'cursor_5',
    emittedAt: '2026-06-04T00:00:03.000Z',
    kind: 'plan.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1', planId: 'plan_1' },
    entity: {
      type: 'plan',
      value: {
        schema: 'movscript.agent.plan.v1',
        id: 'plan_1',
        threadId: 'thread_1',
        runId: 'run_1',
        explanation: 'Use a staged plan',
        items: [
          { step: 'Inspect protocol', status: 'completed' },
          { step: 'Render neutral plan', status: 'in_progress' },
        ],
        completedCount: 1,
        totalCount: 2,
        createdAt: '2026-06-04T00:00:01.000Z',
        updatedAt: '2026-06-04T00:00:03.000Z',
      },
    },
  } as never)
  const planRevisionNotification = agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_plan_revision',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 6,
    cursor: 'cursor_6',
    emittedAt: '2026-06-04T00:00:03.500Z',
    kind: 'plan_revision.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1', planId: 'plan_1' },
    entity: {
      type: 'plan_revision',
      value: {
        schema: 'movscript.agent.plan-revision.v1',
        id: 'plan_revision_1',
        planId: 'plan_1',
        threadId: 'thread_1',
        runId: 'run_1',
        explanation: 'Revision snapshot',
        snapshot: {
          schema: 'movscript.agent.plan.v1',
          id: 'plan_1',
          threadId: 'thread_1',
          runId: 'run_1',
          explanation: 'Snapshot explanation',
          items: [
            { step: 'Inspect revision', status: 'completed' },
            { step: 'Render revision plan', status: 'pending' },
          ],
          completedCount: 1,
          totalCount: 2,
          createdAt: '2026-06-04T00:00:01.000Z',
          updatedAt: '2026-06-04T00:00:03.500Z',
        },
        createdAt: '2026-06-04T00:00:03.500Z',
      },
    },
  } as never)
  const traceNotification = agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_trace',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 7,
    cursor: 'cursor_7',
    emittedAt: '2026-06-04T00:00:04.000Z',
    kind: 'trace.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    entity: {
      type: 'trace',
      value: {
        id: 'trace_1',
        runId: 'run_1',
        kind: 'tool_call',
        title: 'Running search',
        summary: 'Searching outline',
        status: 'started',
        roundId: 'round_trace',
        roundIndex: 4,
        roundLabel: 'Model turn 4',
        roundSource: 'model',
        toolName: 'search',
        stepId: 'step_stream',
        durationMs: 123,
        data: { query: 'outline' },
        createdAt: '2026-06-04T00:00:04.000Z',
      },
    },
  })
  const resolvedInteractionNotification = agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_interaction_resolved',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 8,
    cursor: 'cursor_8',
    emittedAt: '2026-06-04T00:00:05.000Z',
    kind: 'interaction.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1', interactionId: 'interaction_selection_1' },
    entity: {
      type: 'interaction',
      value: {
        id: 'interaction_selection_1',
        threadId: 'thread_1',
        runId: 'run_1',
        kind: 'selection',
        status: 'answered',
        payload: {
          requestId: 'selection_request_1',
          title: 'Select option',
          question: 'Pick one',
          choices: [{ id: 'a', label: 'Option A' }],
        },
        result: { choiceIds: ['a'] },
        createdAt: '2026-06-04T00:00:02.000Z',
        updatedAt: '2026-06-04T00:00:05.000Z',
        resolvedAt: '2026-06-04T00:00:05.000Z',
      },
    },
  } as never)

  assert.equal(threadNotification?.method, 'thread/metadata/updated')
  assert.deepEqual(threadNotification?.params, {
    threadId: 'thread_1',
    threadName: 'Updated title',
    preview: 'Make a plan',
    status: 'completed',
    updatedAt: 1780531205,
  })
  assert.equal(runNotification?.method, 'turn/started')
  assert.equal(progressNotification?.method, 'item/agentMessage/delta')
  assert.deepEqual(progressNotification?.params, {
    threadId: 'thread_1',
    turnId: 'run_1',
    itemId: 'msg_stream',
    delta: 'hello',
  })
  assert.equal(stepNotification?.method, 'item/completed')
  const stepParams = isRecord(stepNotification?.params) ? stepNotification.params : {}
  assert.equal(stepParams.turnId, 'run_1')
  const stepItem = (isRecord(stepParams.item) ? stepParams.item : undefined) as { type?: string; error?: unknown; success?: unknown; sandboxed?: unknown; roundId?: unknown; roundIndex?: unknown; roundLabel?: unknown; durationMs?: unknown } | undefined
  assert.equal(stepItem?.type, 'dynamicToolCall')
  assert.deepEqual(stepItem?.error, { code: 'E_SEARCH' })
  assert.equal(stepItem?.success, false)
  assert.equal(stepItem?.sandboxed, true)
  assert.equal(stepItem?.roundId, 'round_stream')
  assert.equal(stepItem?.roundIndex, 3)
  assert.equal(stepItem?.roundLabel, 'Model turn 3')
  assert.equal(stepItem?.durationMs, 55)
  assert.equal(runtimeStatusNotification?.method, 'runtime/status/updated')
  assert.deepEqual(runtimeStatusNotification?.event, {
    type: 'systemNotice',
    level: 'warning',
    id: 'runtime-status:status_1',
    code: 'runtime_status.upserted',
    threadId: 'thread_1',
    title: 'Waiting',
    detail: 'Waiting for approval',
    raw: runtimeStatusNotification.raw,
  })
  assert.equal(planNotification?.method, 'turn/plan/updated')
  assert.deepEqual(planNotification?.params, {
    threadId: 'thread_1',
    turnId: 'run_1',
    explanation: 'Use a staged plan',
    plan: [
      { step: 'Inspect protocol', status: 'completed' },
      { step: 'Render neutral plan', status: 'in_progress' },
    ],
  })
  assert.equal(planRevisionNotification?.method, 'turn/plan/updated')
  assert.deepEqual(planRevisionNotification?.params, {
    threadId: 'thread_1',
    turnId: 'run_1',
    explanation: 'Revision snapshot',
    plan: [
      { step: 'Inspect revision', status: 'completed' },
      { step: 'Render revision plan', status: 'pending' },
    ],
  })
  assert.equal(traceNotification?.method, 'runtime/trace/updated')
  assert.deepEqual(traceNotification?.event, {
    type: 'systemNotice',
    level: 'info',
    id: 'runtime-trace:trace_1',
    code: 'trace.upserted',
    threadId: 'thread_1',
    title: 'Running search',
    detail: 'Searching outline\nkind: tool_call\nstatus: started\nround: Model turn 4\nround index: 4\nround id: round_trace\nround source: model\ntool: search\nstep: step_stream\nduration: 123ms\ndata: {"query":"outline"}',
    raw: traceNotification.raw,
  })
  assert.equal(resolvedInteractionNotification?.method, 'serverRequest/resolved')
  assert.deepEqual(resolvedInteractionNotification?.event, {
    type: 'serverRequestResolved',
    threadId: 'thread_1',
    requestId: 'selection_request_1',
    raw: resolvedInteractionNotification.raw,
  })
})

test('maps every resolved MovScript Agent interaction status into server request resolved notifications', () => {
  const pendingNotification = agentChatNotificationFromMovScriptRuntimeEvent(runtimeInteractionEvent({
    id: 'interaction_pending',
    kind: 'input',
    status: 'pending',
    payload: { requestId: 'input_pending' },
  }))
  const resolvedNotifications = (['approved', 'rejected', 'answered', 'cancelled'] as const).map((status) => agentChatNotificationFromMovScriptRuntimeEvent(runtimeInteractionEvent({
    id: `interaction_${status}`,
    kind: status === 'answered' ? 'input' : 'approval',
    status,
    payload: {
      ...(status === 'answered' ? { requestId: `request_${status}` } : { approvalId: `request_${status}` }),
    },
  })))

  assert.equal(pendingNotification, null)
  assert.deepEqual(resolvedNotifications.map((notification) => notification?.method), [
    'serverRequest/resolved',
    'serverRequest/resolved',
    'serverRequest/resolved',
    'serverRequest/resolved',
  ])
  assert.deepEqual(resolvedNotifications.map((notification) => notification?.event?.type), [
    'serverRequestResolved',
    'serverRequestResolved',
    'serverRequestResolved',
    'serverRequestResolved',
  ])
  assert.deepEqual(resolvedNotifications.map((notification) => notification?.event?.type === 'serverRequestResolved' ? notification.event.requestId : null), [
    'request_approved',
    'request_rejected',
    'request_answered',
    'request_cancelled',
  ])
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

test('maps MovScript Agent pending interactions into Codex-shaped server requests', () => {
  const requests = agentChatServerRequestsFromMovScriptRun(runFixture({
    status: 'requires_action',
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_1',
      interactionId: 'interaction_approval_1',
      displayThreadId: 'display_thread_1',
      displayAnchor: { threadId: 'display_thread_1', runId: 'display_run_1', placement: 'after' },
      toolName: 'writeFile',
      args: { path: 'story.md' },
      preview: { operation: 'write' },
      reason: 'Needs write access',
      permission: 'workspace-write',
      status: 'pending',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    }, {
      id: 'approval_without_interaction',
      runId: 'run_1',
      toolName: 'writeFile',
      reason: 'Missing interaction id',
      permission: 'workspace-write',
      status: 'pending',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    }, {
      id: 'approval_resolved',
      runId: 'run_1',
      interactionId: 'interaction_approval_resolved',
      toolName: 'writeFile',
      reason: 'Already approved',
      permission: 'workspace-write',
      status: 'approved',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    }],
    pendingInputRequests: [{
      id: 'input_1',
      runId: 'run_1',
      displayThreadId: 'display_thread_1',
      displayAnchor: { threadId: 'display_thread_1', runId: 'display_run_1', placement: 'after' },
      title: 'Choose',
      question: 'Continue?',
      inputType: 'confirmation',
      choices: [],
      allowCustomAnswer: false,
      status: 'pending',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    }, {
      id: 'input_resolved',
      runId: 'run_1',
      title: 'Choose',
      question: 'Continue?',
      inputType: 'confirmation',
      choices: [],
      allowCustomAnswer: false,
      status: 'answered',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    }],
  }))

  assert.deepEqual(requests.map((request) => request.method), [
    'item/permissions/requestApproval',
    'item/tool/requestUserInput',
  ])
  assert.deepEqual(requests.map((request) => request.id), ['approval_1', 'input_1'])
  assert.deepEqual(requests.map((request) => request.threadId), ['display_thread_1', 'display_thread_1'])
  assert.deepEqual(requests.map((request) => request.turnId), ['display_run_1', 'display_run_1'])
  assert.deepEqual(isRecord(requests[0]?.params) ? requests[0].params.args : null, { path: 'story.md' })
  assert.deepEqual(isRecord(requests[0]?.params) ? requests[0].params.preview : null, { operation: 'write' })
})

test('maps MovScript Agent pending approvals without interaction ids into warning notices', () => {
  const notifications = agentChatNotificationsFromMovScriptRunMissingInteractionApprovals(runFixture({
    status: 'requires_action',
    pendingApprovals: [{
      id: 'approval_without_interaction',
      runId: 'run_1',
      toolName: 'movscript_focus_get',
      reason: 'Read current focus context',
      permission: 'workspace.read',
      risk: 'read',
      status: 'pending',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    }, {
      id: 'approval_with_interaction',
      runId: 'run_1',
      interactionId: 'interaction_approval_1',
      toolName: 'movscript_focus_get',
      reason: 'Read current focus context',
      status: 'pending',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    }],
  }))

  assert.equal(notifications.length, 1)
  assert.equal(notifications[0]?.method, 'item/completed')
  assert.deepEqual(notifications[0]?.params, {
    threadId: 'thread_1',
    turnId: 'run_1',
    item: {
      type: 'systemNotice',
      id: 'runtime-approval-unavailable:approval_without_interaction',
      level: 'warning',
      code: 'runtime.approval.missing_interaction',
      title: 'Approval waiting for interaction metadata: movscript_focus_get',
      detail: 'runtime reported a pending approval without an interaction id\nthe UI will show approval controls when the interaction event arrives\nRead current focus context\npermission: workspace.read\nrisk: read',
      raw: {
        id: 'approval_without_interaction',
        runId: 'run_1',
        toolName: 'movscript_focus_get',
        reason: 'Read current focus context',
        permission: 'workspace.read',
        risk: 'read',
        status: 'pending',
        createdAt: '2026-06-04T00:00:00.000Z',
        updatedAt: '2026-06-04T00:00:00.000Z',
      },
    },
  })
})

test('maps MovScript Agent pending interactions directly into server requests when they stream independently', () => {
  const approvalRequests = agentChatServerRequestsFromMovScriptInteraction(interactionFixture({
    id: 'interaction_approval_1',
    kind: 'approval',
    displayAnchor: { threadId: 'display_thread_approval', runId: 'display_run_approval', placement: 'after' },
    payload: {
      approvalId: 'approval_1',
      toolName: 'writeFile',
      reason: 'Needs write access',
      permission: 'workspace-write',
      args: { path: 'story.md' },
      preview: { operation: 'write' },
    },
  }))
  const inputRequests = agentChatServerRequestsFromMovScriptInteraction(interactionFixture({
    id: 'interaction_input_1',
    kind: 'input',
    displayThreadId: 'display_thread_1',
    displayAnchor: { threadId: 'display_thread_1', runId: 'display_run_1', messageId: 'message_1', placement: 'after' },
    originRunId: 'origin_run_1',
    payload: {
      requestId: 'input_1',
      title: 'Continue',
      summary: 'Resolve the streamed input interaction',
      question: 'Continue?',
      inputType: 'confirmation',
      choices: [{ id: 'yes', label: 'Yes' }],
      allowCustomAnswer: false,
    },
  }))
  const selectionRequests = agentChatServerRequestsFromMovScriptInteraction(interactionFixture({
    id: 'interaction_selection_1',
    kind: 'selection',
    payload: {
      requestId: 'selection_1',
      title: 'Pick target',
      question: 'Which target should continue?',
      choices: [
        { id: 'shot_1', label: 'Shot 1', description: 'Opening shot' },
        { id: 'shot_2', label: 'Shot 2' },
      ],
      allowCustomAnswer: false,
    },
  }))
  const resolvedRequests = agentChatServerRequestsFromMovScriptInteraction(interactionFixture({
    id: 'interaction_resolved',
    kind: 'approval',
    status: 'approved',
  }))

  assert.equal(approvalRequests[0]?.id, 'approval_1')
  assert.equal(approvalRequests[0]?.method, 'item/permissions/requestApproval')
  assert.equal(approvalRequests[0]?.threadId, 'display_thread_approval')
  assert.equal(approvalRequests[0]?.turnId, 'display_run_approval')
  assert.equal(isRecord(approvalRequests[0]?.params) ? approvalRequests[0].params.interactionId : null, 'interaction_approval_1')
  assert.deepEqual(isRecord(approvalRequests[0]?.params) ? approvalRequests[0].params.args : null, { path: 'story.md' })
  assert.deepEqual(isRecord(approvalRequests[0]?.params) ? approvalRequests[0].params.preview : null, { operation: 'write' })
  assert.equal(inputRequests[0]?.id, 'input_1')
  assert.equal(inputRequests[0]?.method, 'item/tool/requestUserInput')
  assert.equal(inputRequests[0]?.threadId, 'display_thread_1')
  assert.equal(inputRequests[0]?.turnId, 'display_run_1')
  assert.equal(isRecord(inputRequests[0]?.params) ? inputRequests[0].params.inputType : null, 'confirmation')
  assert.equal(isRecord(inputRequests[0]?.params) ? inputRequests[0].params.summary : null, 'Resolve the streamed input interaction')
  assert.equal(isRecord(inputRequests[0]?.params) ? inputRequests[0].params.interactionId : null, 'interaction_input_1')
  assert.equal(selectionRequests[0]?.id, 'selection_1')
  assert.equal(selectionRequests[0]?.method, 'item/tool/requestUserInput')
  assert.equal(isRecord(selectionRequests[0]?.params) ? selectionRequests[0].params.inputType : null, 'choice')
  assert.deepEqual(isRecord(selectionRequests[0]?.params) ? selectionRequests[0].params.choices : null, [
    { id: 'shot_1', label: 'Shot 1', description: 'Opening shot' },
    { id: 'shot_2', label: 'Shot 2' },
  ])
  assert.deepEqual(resolvedRequests, [])
})

function threadFixture(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    sessionId: 'session_1',
    title: 'Planning',
    status: 'completed',
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:03.000Z',
    messages: [{
      id: 'msg_user',
      threadId: 'thread_1',
      role: 'user',
      content: 'Make a plan',
      runId: 'run_1',
      createdAt: '2026-06-04T00:00:00.000Z',
    }, {
      id: 'msg_agent',
      threadId: 'thread_1',
      role: 'assistant',
      content: 'Plan ready',
      runId: 'run_1',
      createdAt: '2026-06-04T00:00:02.000Z',
    }],
    ...overrides,
  }
}

function interactionFixture(overrides: Partial<RuntimeInteraction> & { id: string; kind: RuntimeInteraction['kind'] }): RuntimeInteraction {
  return {
    threadId: 'thread_1',
    runId: 'run_1',
    status: 'pending',
    payload: {},
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
    ...overrides,
  }
}

function runtimeInteractionEvent(interaction: Partial<RuntimeInteraction> & { id: string; kind: RuntimeInteraction['kind']; status: RuntimeInteraction['status'] }) {
  return {
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: `event_${interaction.id}`,
    scope: { type: 'thread', id: interaction.threadId ?? 'thread_1' },
    ordinal: 1,
    cursor: `cursor_${interaction.id}`,
    emittedAt: '2026-06-04T00:00:05.000Z',
    kind: 'interaction.upserted',
    causality: {
      threadId: interaction.threadId ?? 'thread_1',
      runId: interaction.runId ?? 'run_1',
      interactionId: interaction.id,
    },
    entity: {
      type: 'interaction',
      value: interactionFixture(interaction),
    },
  } as never
}

function runFixture(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    runtimeLimits: {
      approvalMode: 'interactive',
      maxToolCalls: 10,
      maxIterations: 5,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:03.000Z',
    startedAt: '2026-06-04T00:00:00.000Z',
    completedAt: '2026-06-04T00:00:03.000Z',
    steps: [{
      id: 'step_tool',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      roundSource: 'model',
      toolName: 'search',
      title: 'Search',
      args: { query: 'outline' },
      result: {
        matches: 2,
        output_resources: [
          { ID: 42, type: 'video', name: 'Cut.mp4', url: 'https://cdn.example.com/cut.mp4', mime_type: 'video/mp4' },
          { ID: 43, type: 'image', name: 'Frame.png', url: 'https://cdn.example.com/frame.png', mime_type: 'image/png' },
        ],
      },
      durationMs: 1000,
      createdAt: '2026-06-04T00:00:01.000Z',
      completedAt: '2026-06-04T00:00:02.000Z',
    }],
    ...overrides,
  }
}

function protocolStringUnion(protocol: string, typeName: string): string[] {
  const unionType = protocol.match(new RegExp(`export type ${typeName} =([\\s\\S]*?)(?=\\n\\n|\\nexport )`))
  assert.ok(unionType)
  return Array.from(unionType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
}

function protocolInterfacePropertyStringUnion(protocol: string, interfaceName: string, propertyName: string): string[] {
  const interfaceType = protocol.match(new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`))
  assert.ok(interfaceType)
  const propertyType = interfaceType[1].match(new RegExp(`${propertyName}: ([^\\n]+)`))
  assert.ok(propertyType)
  return Array.from(propertyType[1].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
}

function hasOwn<T extends object>(object: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(object, key)
}
