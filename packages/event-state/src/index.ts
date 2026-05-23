import {
  EVENT_STATE_DEBUG_V1_SCHEMA,
  AGENT_PROTOCOL_VERSION,
  AGENT_RUNTIME_EVENT_V2_SCHEMA,
  AGENT_RUNTIME_SNAPSHOT_V2_SCHEMA,
} from '@movscript/protocol'
import type {
  EventStateDebugReportV1,
  EventStateDropReason,
  AgentMessage,
  AgentPlan,
  AgentPlanRevision,
  AgentRun,
  AgentRunStep,
  AgentRuntimeAssistantDeltaV2,
  AgentRuntimeEventEntityV2,
  AgentRuntimeEventV2,
  AgentRuntimeScopeRef,
  AgentRuntimeSnapshotV2,
  AgentSession,
  AgentTaskGraphSnapshot,
  AgentThread,
  AgentTraceEvent,
  RuntimeContinuation,
  RuntimeInteraction,
  RuntimeWork,
} from '@movscript/protocol'

export interface EventStateOptions {
  now?: () => string
}

export interface AgentConversationProjectionMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: string
  createdAt: string
  updatedAt?: string
  runtimeRefs: {
    threadId: string
    messageId?: string
    runId?: string
    traceId?: string
  }
}

export interface AgentConversationProjection {
  threadId: string
  status?: string
  messages: AgentConversationProjectionMessage[]
  activeRunIds: string[]
  pendingInteractions: RuntimeInteraction[]
}

export type AgentRuntimeActivityState = 'stopped' | 'waiting' | 'active'

type EntityMap<T> = Map<string, T>
type MergeDecision = EventStateDebugReportV1['mergeDecisions'][number]
type ScopeState = { cursor?: string; ordinal?: number; lastSnapshotCursor?: string }

interface EntityState {
  sessions: EntityMap<AgentSession>
  threads: EntityMap<AgentThread>
  messages: EntityMap<AgentMessage>
  runs: EntityMap<AgentRun>
  steps: EntityMap<AgentRunStep>
  traces: EntityMap<AgentTraceEvent>
  interactions: EntityMap<RuntimeInteraction>
  works: EntityMap<RuntimeWork>
  continuations: EntityMap<RuntimeContinuation>
  plans: EntityMap<AgentPlan>
  planRevisions: EntityMap<AgentPlanRevision>
  taskGraphs: EntityMap<AgentTaskGraphSnapshot>
  assistantDeltas: EntityMap<AgentRuntimeAssistantDeltaV2>
}

const TERMINAL_RUN_STATUSES = new Set(['completed', 'completed_with_warnings', 'failed', 'cancelled'])
const PENDING_INTERACTION_STATUS = 'pending'

export class EventStateStore {
  private readonly now: () => string
  private readonly scopes = new Map<string, ScopeState>()
  private readonly seenEventIds = new Set<string>()
  private readonly entities: EntityState = {
    sessions: new Map(),
    threads: new Map(),
    messages: new Map(),
    runs: new Map(),
    steps: new Map(),
    traces: new Map(),
    interactions: new Map(),
    works: new Map(),
    continuations: new Map(),
    plans: new Map(),
    planRevisions: new Map(),
    taskGraphs: new Map(),
    assistantDeltas: new Map(),
  }
  private readonly eventsRead: string[] = []
  private readonly eventsAccepted: string[] = []
  private readonly eventsDropped: EventStateDebugReportV1['input']['eventsDropped'] = []
  private readonly gaps: EventStateDebugReportV1['input']['gaps'] = []
  private readonly mergeDecisions: MergeDecision[] = []

  constructor(options: EventStateOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  ingestSnapshot(snapshot: AgentRuntimeSnapshotV2): void {
    if (snapshot.schema !== AGENT_RUNTIME_SNAPSHOT_V2_SCHEMA || snapshot.protocolVersion !== AGENT_PROTOCOL_VERSION) {
      throw new Error('EventStateStore only accepts movscript.agent.runtime-snapshot.v2 snapshots')
    }
    if (!isValidScope(snapshot.scope) || !snapshot.cursor || !Number.isInteger(snapshot.ordinal)) {
      throw new Error('AgentRuntimeSnapshotV2 requires a valid scope, cursor, and integer ordinal')
    }

    const scope = this.scopeState(snapshot.scope)
    scope.cursor = snapshot.cursor
    scope.ordinal = snapshot.ordinal
    scope.lastSnapshotCursor = snapshot.cursor

    this.mergeMany('session', snapshot.entities.sessions ?? [])
    this.mergeMany('thread', snapshot.entities.threads ?? [])
    this.mergeMany('message', snapshot.entities.messages ?? [])
    this.mergeMany('run', snapshot.entities.runs ?? [])
    this.mergeMany('step', snapshot.entities.steps ?? [])
    this.mergeMany('trace', snapshot.entities.traces ?? [])
    this.mergeMany('interaction', snapshot.entities.interactions ?? [])
    this.mergeMany('work', snapshot.entities.works ?? [])
    this.mergeMany('continuation', snapshot.entities.continuations ?? [])
    this.mergeMany('plan', snapshot.entities.plans ?? [])
    this.mergeMany('plan_revision', snapshot.entities.planRevisions ?? [])
    this.mergeMany('task_graph', snapshot.entities.taskGraphs ?? [])
  }

  ingestEvent(event: AgentRuntimeEventV2): void {
    const eventId = typeof event?.id === 'string' ? event.id : undefined
    if (eventId) this.eventsRead.push(eventId)
    if (!this.isValidEventEnvelope(event)) {
      this.drop(event, 'invalid_schema', 'event must use movscript.agent.runtime-event.v2 and current protocol version')
      return
    }
    if (this.seenEventIds.has(event.id)) {
      this.drop(event, 'duplicate_event')
      return
    }

    const scope = this.scopeState(event.scope)
    if (typeof scope.ordinal === 'number') {
      if (event.ordinal <= scope.ordinal) {
        this.drop(event, 'ordinal_regression', 'event ordinal is not newer than the current scope ordinal')
        return
      }
      if (event.ordinal !== scope.ordinal + 1) {
        this.gaps.push({ expectedOrdinal: scope.ordinal + 1, receivedOrdinal: event.ordinal, action: 'snapshot_required' })
        this.drop(event, 'ordinal_gap', 'event ordinal skipped at least one event; reload snapshot before continuing')
        return
      }
    }

    if (!this.applyEventPayload(event)) return

    this.seenEventIds.add(event.id)
    this.eventsAccepted.push(event.id)
    scope.cursor = event.cursor
    scope.ordinal = event.ordinal
  }

  getConversationView(threadId: string): AgentConversationProjection {
    const thread = this.entities.threads.get(threadId)
    const messages = [...this.entities.messages.values()]
      .filter((message) => message.threadId === threadId && (message.role === 'user' || message.role === 'assistant'))
    const finalAssistantRunIds = new Set(messages.filter((message) => message.role === 'assistant' && message.runId).map((message) => message.runId as string))
    const deltaMessages = [...this.entities.assistantDeltas.values()]
      .filter((delta) => {
        const run = this.entities.runs.get(delta.runId)
        return run?.threadId === threadId && !finalAssistantRunIds.has(delta.runId)
      })
      .map((delta): AgentConversationProjectionMessage => {
        const run = this.entities.runs.get(delta.runId)
        return {
          id: 'assistant-delta:' + delta.runId + ':' + delta.traceId,
          role: 'assistant',
          content: delta.accumulated,
          status: run?.status,
          createdAt: delta.createdAt,
          runtimeRefs: { threadId, runId: delta.runId, traceId: delta.traceId },
        }
      })
    const projectedMessages = [
      ...messages.map((message): AgentConversationProjectionMessage => ({
        id: message.id,
        role: message.role as 'user' | 'assistant',
        content: message.content,
        status: message.runId ? this.entities.runs.get(message.runId)?.status : undefined,
        createdAt: message.createdAt,
        runtimeRefs: { threadId: message.threadId, messageId: message.id, runId: message.runId },
      })),
      ...deltaMessages,
    ].sort(compareProjectionMessages)

    return {
      threadId,
      status: thread?.status,
      messages: projectedMessages,
      activeRunIds: this.activeRunIds(threadId),
      pendingInteractions: this.pendingInteractions(threadId),
    }
  }

  getRunActivityView(runId: string): { run?: AgentRun; steps: AgentRunStep[]; traces: AgentTraceEvent[]; interactions: RuntimeInteraction[]; assistantDeltas: AgentRuntimeAssistantDeltaV2[] } {
    return {
      run: this.entities.runs.get(runId),
      steps: [...this.entities.steps.values()].filter((step) => step.runId === runId).sort(compareByCreatedAt),
      traces: [...this.entities.traces.values()].filter((trace) => trace.runId === runId).sort(compareByCreatedAt),
      interactions: [...this.entities.interactions.values()].filter((interaction) => interaction.runId === runId).sort(compareByCreatedAt),
      assistantDeltas: [...this.entities.assistantDeltas.values()].filter((delta) => delta.runId === runId).sort(compareByCreatedAt),
    }
  }

  getPendingInteractions(threadId: string): RuntimeInteraction[] {
    return this.pendingInteractions(threadId)
  }

  getDebugReport(scope: AgentRuntimeScopeRef): EventStateDebugReportV1 {
    const scopeState = this.scopes.get(scopeKey(scope))
    const projection = scope.type === 'thread'
      ? this.getConversationView(scope.id)
      : { messages: [], pendingInteractions: [], activeRunIds: [] }
    return {
      schema: EVENT_STATE_DEBUG_V1_SCHEMA,
      generatedAt: this.now(),
      scope,
      input: {
        lastSnapshotCursor: scopeState?.lastSnapshotCursor,
        currentCursor: scopeState?.cursor,
        currentOrdinal: scopeState?.ordinal,
        eventsRead: [...this.eventsRead],
        eventsAccepted: [...this.eventsAccepted],
        eventsDropped: [...this.eventsDropped],
        gaps: [...this.gaps],
      },
      normalized: {
        sessions: [...this.entities.sessions.values()],
        threads: [...this.entities.threads.values()],
        messages: [...this.entities.messages.values()],
        runs: [...this.entities.runs.values()],
        steps: [...this.entities.steps.values()],
        traces: [...this.entities.traces.values()],
        interactions: [...this.entities.interactions.values()],
        works: [...this.entities.works.values()],
        continuations: [...this.entities.continuations.values()],
        plans: [...this.entities.plans.values()],
        planRevisions: [...this.entities.planRevisions.values()],
        taskGraphs: [...this.entities.taskGraphs.values()],
        assistantDeltas: [...this.entities.assistantDeltas.values()],
      },
      mergeDecisions: [...this.mergeDecisions],
      projection: {
        conversationMessages: projection.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          runId: message.runtimeRefs.runId,
          messageId: message.runtimeRefs.messageId,
          traceId: message.runtimeRefs.traceId,
          status: message.status,
        })),
        pendingInteractions: projection.pendingInteractions,
        activeRunIds: projection.activeRunIds,
      },
      invariants: this.invariants(scope),
    }
  }

  private isValidEventEnvelope(event: AgentRuntimeEventV2): boolean {
    return event?.schema === AGENT_RUNTIME_EVENT_V2_SCHEMA
      && event.protocolVersion === AGENT_PROTOCOL_VERSION
      && typeof event.id === 'string'
      && event.id.length > 0
      && isValidScope(event.scope)
      && Number.isInteger(event.ordinal)
      && typeof event.cursor === 'string'
      && event.cursor.length > 0
      && typeof event.emittedAt === 'string'
  }

  private applyEventPayload(event: AgentRuntimeEventV2): boolean {
    if (event.kind === 'assistant.delta') {
      if (!event.assistantDelta || event.entity) {
        this.drop(event, 'kind_entity_mismatch', 'assistant.delta requires assistantDelta and must not include entity')
        return false
      }
      return this.mergeAssistantDelta(event.assistantDelta, event)
    }
    if (event.kind === 'scope.done') {
      if (event.entity || event.assistantDelta) {
        this.drop(event, 'kind_entity_mismatch', 'scope.done must not include entity or assistantDelta')
        return false
      }
      return true
    }
    if (!event.entity || event.assistantDelta) {
      this.drop(event, 'kind_entity_mismatch', 'upsert events require entity and must not include assistantDelta')
      return false
    }
    const expectedType = entityTypeForKind(event.kind)
    if (!expectedType || event.entity.type !== expectedType) {
      this.drop(event, 'kind_entity_mismatch', 'event kind ' + event.kind + ' does not match entity type ' + event.entity.type)
      return false
    }
    this.mergeEntity(event.entity, event)
    return true
  }

  private mergeAssistantDelta(delta: AgentRuntimeAssistantDeltaV2, event: AgentRuntimeEventV2): boolean {
    if (!delta.runId || !delta.traceId) {
      this.drop(event, 'invalid_shape', 'assistant delta requires runId and traceId')
      return false
    }
    const key = assistantDeltaKey(delta)
    const previous = this.entities.assistantDeltas.get(key)
    if (previous && delta.accumulated.length < previous.accumulated.length) {
      this.mergeDecisions.push({ entityType: 'assistant_delta', entityId: key, decision: 'drop', reason: 'delta_regression', previousRevision: previous.accumulated.length, nextRevision: delta.accumulated.length })
      this.drop(event, 'delta_regression', 'assistant delta accumulated content cannot shrink')
      return false
    }
    this.entities.assistantDeltas.set(key, delta)
    this.mergeDecisions.push({
      entityType: 'assistant_delta',
      entityId: key,
      decision: previous ? 'replace' : 'insert',
      reason: previous ? 'longer_or_equal_accumulated_content' : 'new_delta',
      previousRevision: previous?.accumulated.length,
      nextRevision: delta.accumulated.length,
    })
    return true
  }

  private mergeMany(type: AgentRuntimeEventEntityV2['type'], values: unknown[]): void {
    for (const value of values) this.mergeEntity({ type, value } as AgentRuntimeEventEntityV2)
  }

  private mergeEntity(entity: AgentRuntimeEventEntityV2, event?: AgentRuntimeEventV2): void {
    const id = entityId(entity)
    if (!id) {
      if (event) this.drop(event, 'invalid_shape', entity.type + ' entity requires a stable id')
      return
    }
    const map = entityMap(this.entities, entity.type)
    const previous = map.get(id)
    const nextRevision = revisionOf(entity.value)
    const previousRevision = revisionOf(previous)
    if (previous && compareRevision(nextRevision, previousRevision) < 0) {
      this.mergeDecisions.push({ entityType: entity.type, entityId: id, decision: 'keep_existing', reason: 'newer_entity_already_present', previousRevision, nextRevision })
      if (event) this.drop(event, 'stale_entity', entity.type + ' ' + id + ' is older than current state')
      return
    }
    map.set(id, entity.value as never)
    this.mergeDecisions.push({
      entityType: entity.type,
      entityId: id,
      decision: previous ? 'replace' : 'insert',
      reason: previous ? 'newer_or_equal_revision' : 'new_entity',
      previousRevision,
      nextRevision,
    })
  }

  private activeRunIds(threadId: string): string[] {
    const thread = this.entities.threads.get(threadId)
    const active = new Set<string>()
    if (thread?.activeRunId) active.add(thread.activeRunId)
    for (const run of this.entities.runs.values()) {
      if (run.threadId === threadId && !TERMINAL_RUN_STATUSES.has(run.status)) active.add(run.id)
    }
    return [...active]
  }

  private pendingInteractions(threadId: string): RuntimeInteraction[] {
    return [...this.entities.interactions.values()]
      .filter((interaction) => interaction.threadId === threadId && interaction.status === PENDING_INTERACTION_STATUS)
      .sort(compareByCreatedAt)
  }

  private scopeState(scope: AgentRuntimeScopeRef): ScopeState {
    const key = scopeKey(scope)
    const existing = this.scopes.get(key)
    if (existing) return existing
    const next: ScopeState = {}
    this.scopes.set(key, next)
    return next
  }

  private drop(event: Partial<AgentRuntimeEventV2> | undefined, reason: EventStateDropReason, detail?: string): void {
    this.eventsDropped.push({
      eventId: typeof event?.id === 'string' ? event.id : undefined,
      ordinal: typeof event?.ordinal === 'number' ? event.ordinal : undefined,
      kind: typeof event?.kind === 'string' ? event.kind : undefined,
      reason,
      detail,
    })
  }

  private invariants(scope: AgentRuntimeScopeRef): EventStateDebugReportV1['invariants'] {
    const result: EventStateDebugReportV1['invariants'] = []
    if (scope.type === 'thread') {
      const view = this.getConversationView(scope.id)
      const ids = new Set<string>()
      const duplicate = view.messages.find((message) => {
        if (ids.has(message.id)) return true
        ids.add(message.id)
        return false
      })
      result.push({ name: 'no_duplicate_projection_messages', status: duplicate ? 'fail' : 'pass', ...(duplicate ? { detail: duplicate.id } : {}) })
      result.push({ name: 'pending_interactions_are_thread_scoped', status: view.pendingInteractions.every((interaction) => interaction.threadId === scope.id) ? 'pass' : 'fail' })
    }
    result.push({ name: 'no_ordinal_gaps_unresolved', status: this.gaps.length === 0 ? 'pass' : 'fail', ...(this.gaps.length > 0 ? { detail: String(this.gaps.length) + ' gap(s) require snapshot reload' } : {}) })
    return result
  }
}

export function createEventStateStore(options: EventStateOptions = {}): EventStateStore {
  return new EventStateStore(options)
}

export function runtimeRunFromEvent(event: AgentRuntimeEventV2): AgentRun | undefined {
  return event.entity?.type === 'run' ? event.entity.value : undefined
}

export function runtimeRunIdFromEvent(event: AgentRuntimeEventV2): string | undefined {
  return event.causality?.runId ?? runtimeRunFromEvent(event)?.id ?? event.assistantDelta?.runId
}

export function runtimeThreadFromEvent(event: AgentRuntimeEventV2): AgentThread | undefined {
  return event.entity?.type === 'thread' ? event.entity.value : undefined
}

export function runtimeTraceFromEvent(event: AgentRuntimeEventV2): AgentTraceEvent | undefined {
  return event.entity?.type === 'trace' ? event.entity.value : undefined
}

export function runtimeThreadTitleFromEvent(event: AgentRuntimeEventV2): string | undefined {
  const title = runtimeThreadFromEvent(event)?.title?.trim()
  return title || undefined
}

export function runtimeAssistantDeltaFromEvent(event: AgentRuntimeEventV2): AgentRuntimeAssistantDeltaV2 | undefined {
  return event.kind === 'assistant.delta' ? event.assistantDelta : undefined
}

export function runtimeThreadProjectionShouldRefresh(event: AgentRuntimeEventV2): boolean {
  return event.kind === 'run.upserted'
    || event.kind === 'trace.upserted'
    || event.kind === 'message.upserted'
    || event.kind === 'thread.upserted'
    || event.kind === 'assistant.delta'
    || event.kind === 'interaction.upserted'
    || event.kind === 'work.upserted'
    || event.kind === 'continuation.upserted'
    || event.kind === 'scope.done'
}

export function runtimeStatusStateFromSnapshot(snapshot?: Pick<AgentRuntimeSnapshotV2, 'entities' | 'scope'> | null): AgentRuntimeActivityState {
  if (!snapshot) return 'stopped'
  const threadId = snapshot.scope.type === 'thread' ? snapshot.scope.id : undefined
  const runs = snapshot.entities.runs ?? []
  if (runs.some((run) => (!threadId || run.threadId === threadId) && (run.status === 'queued' || run.status === 'in_progress'))) return 'active'
  if (
    runs.some((run) => (!threadId || run.threadId === threadId) && run.status === 'requires_action')
    || (snapshot.entities.works ?? []).some((work) => (!threadId || work.threadId === threadId) && (work.status === 'pending_approval' || work.status === 'queued' || work.status === 'running' || work.status === 'waiting'))
    || (snapshot.entities.interactions ?? []).some((interaction) => (!threadId || interaction.threadId === threadId) && interaction.status === 'pending')
    || (snapshot.entities.continuations ?? []).some((continuation) => (!threadId || continuation.threadId === threadId) && continuation.status === 'ready')
  ) {
    return 'waiting'
  }
  return 'stopped'
}

function isValidScope(scope: AgentRuntimeScopeRef | undefined): scope is AgentRuntimeScopeRef {
  return !!scope && typeof scope.id === 'string' && scope.id.length > 0
    && (scope.type === 'thread' || scope.type === 'session' || scope.type === 'run' || scope.type === 'plan')
}

function scopeKey(scope: AgentRuntimeScopeRef): string {
  return scope.type + ':' + scope.id
}

function entityTypeForKind(kind: string): AgentRuntimeEventEntityV2['type'] | undefined {
  switch (kind) {
    case 'session.upserted': return 'session'
    case 'thread.upserted': return 'thread'
    case 'message.upserted': return 'message'
    case 'run.upserted': return 'run'
    case 'step.upserted': return 'step'
    case 'trace.upserted': return 'trace'
    case 'interaction.upserted': return 'interaction'
    case 'work.upserted': return 'work'
    case 'continuation.upserted': return 'continuation'
    case 'plan.upserted': return 'plan'
    case 'plan_revision.upserted': return 'plan_revision'
    case 'task_graph.upserted': return 'task_graph'
    default: return undefined
  }
}

function entityId(entity: AgentRuntimeEventEntityV2): string | undefined {
  if (entity.type === 'task_graph') return entity.value.taskGraph.id
  return 'id' in entity.value && typeof entity.value.id === 'string' ? entity.value.id : undefined
}

function entityMap(state: EntityState, type: AgentRuntimeEventEntityV2['type']): EntityMap<never> {
  switch (type) {
    case 'session': return state.sessions as EntityMap<never>
    case 'thread': return state.threads as EntityMap<never>
    case 'message': return state.messages as EntityMap<never>
    case 'run': return state.runs as EntityMap<never>
    case 'step': return state.steps as EntityMap<never>
    case 'trace': return state.traces as EntityMap<never>
    case 'interaction': return state.interactions as EntityMap<never>
    case 'work': return state.works as EntityMap<never>
    case 'continuation': return state.continuations as EntityMap<never>
    case 'plan': return state.plans as EntityMap<never>
    case 'plan_revision': return state.planRevisions as EntityMap<never>
    case 'task_graph': return state.taskGraphs as EntityMap<never>
  }
}

function revisionOf(value: unknown): string | number | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (typeof record.revision === 'number' || typeof record.revision === 'string') return record.revision
  if (typeof record.version === 'number' || typeof record.version === 'string') return record.version
  if (typeof record.updatedAt === 'string') return Date.parse(record.updatedAt)
  if (typeof record.completedAt === 'string') return Date.parse(record.completedAt)
  if (typeof record.createdAt === 'string') return Date.parse(record.createdAt)
  return undefined
}

function compareRevision(next: string | number | undefined, previous: string | number | undefined): number {
  if (typeof next === 'number' && typeof previous === 'number') return next - previous
  if (typeof next === 'string' && typeof previous === 'string') return next.localeCompare(previous)
  if (next === undefined && previous !== undefined) return -1
  if (next !== undefined && previous === undefined) return 1
  return 0
}

function assistantDeltaKey(delta: Pick<AgentRuntimeAssistantDeltaV2, 'runId' | 'traceId'>): string {
  return delta.runId + ':' + delta.traceId
}

function compareProjectionMessages(left: AgentConversationProjectionMessage, right: AgentConversationProjectionMessage): number {
  return Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id)
}

function compareByCreatedAt<T extends { createdAt: string; id?: string }>(left: T, right: T): number {
  return Date.parse(left.createdAt) - Date.parse(right.createdAt) || (left.id ?? '').localeCompare(right.id ?? '')
}
