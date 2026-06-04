import type { AgentTraceEvent } from '../../../../state/shared/types.js'
import { previewJSON, traceEventStatusLabel } from './labels.js'
import type {
  AgentContextMutationView,
  AgentDebugAttentionEvent,
  AgentMessageWriteView,
  AgentModelCallContextView,
  AgentModelCallSummary,
  AgentPendingActionView,
  AgentPromptDetailView,
  AgentRuntimeContextDiffWindowView,
  AgentRuntimeContextProjectionView,
  AgentRuntimeContextChangeView,
  AgentRuntimeContextDiffView,
  AgentRuntimeFrame,
  AgentRuntimeFrameFocus,
  AgentSkillTraceEntry,
  AgentToolCallView,
  AgentTraceRefView,
} from './types.js'
import { arrayValue, recordValue, stringValue, uniqueStrings } from './values.js'

export function buildRuntimeFrames(input: {
  events: AgentTraceEvent[]
  promptDetails: AgentPromptDetailView[]
  contextProjections: AgentRuntimeContextProjectionView[]
  contextDiffWindows: AgentRuntimeContextDiffWindowView[]
  contextMutations: AgentContextMutationView[]
  modelCalls: AgentModelCallSummary[]
  modelContext: AgentModelCallContextView[]
  skillTrace: AgentSkillTraceEntry[]
  messageWrites: AgentMessageWriteView[]
  toolCalls: AgentToolCallView[]
  attentionEvents: AgentDebugAttentionEvent[]
  pendingActions: AgentPendingActionView[]
}): AgentRuntimeFrame[] {
  const eventById = new Map(input.events.map((event) => [event.id, event]))
  const promptByEventId = new Map(input.promptDetails.map((detail) => [detail.eventId, detail]))
  const contextProjectionByFrameKey = new Map(input.contextProjections.flatMap((projection) => {
    const key = runtimeFrameKeyFromContextProjection(projection)
    return key ? [[key, projection] as const] : []
  }))
  const contextDiffWindowByProjectionEventId = new Map(input.contextDiffWindows.map((window) => [window.projection.eventId, window]))
  const modelContextByCallId = new Map(input.modelContext.map((context) => [context.callId, context]))
  const messageWriteByEventId = new Map(input.messageWrites.map((write) => [write.eventId, write]))
  const toolCallByEventId = new Map(input.toolCalls.map((call) => [call.eventId, call]))
  const attentionByEventId = new Map(input.attentionEvents.map((event) => [event.eventId, event]))
  const contextMutationByEventId = new Map(input.contextMutations.map((mutation) => [mutation.eventId, mutation]))

  const roundGroups = new Map<string, AgentTraceEvent[]>()
  const setupEvents: AgentTraceEvent[] = []
  for (const event of input.events) {
    const key = roundKeyFromEvent(event)
    if (!key) {
      setupEvents.push(event)
      continue
    }
    const group = roundGroups.get(key) ?? []
    group.push(event)
    roundGroups.set(key, group)
  }

  const frames: AgentRuntimeFrame[] = []
  if (setupEvents.length > 0) {
    frames.push({
      id: 'setup',
      kind: 'setup',
      label: 'Runtime setup',
      ...frameTiming(setupEvents),
      status: frameStatus(setupEvents),
      focus: frameFocus(setupEvents),
      eventIds: setupEvents.map((event) => event.id),
      events: setupEvents,
      attentionEvents: setupEvents.flatMap((event) => attentionByEventId.get(event.id) ?? []),
      skills: input.skillTrace.filter((entry) => setupEvents.some((event) => event.id === entry.eventId)),
      contextMutations: setupEvents.flatMap((event) => contextMutationByEventId.get(event.id) ?? []),
    })
  }

  const sortedRoundEntries = Array.from(roundGroups.entries()).sort((left, right) => {
    const leftTime = Date.parse(left[1][0]?.createdAt ?? '')
    const rightTime = Date.parse(right[1][0]?.createdAt ?? '')
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0)
  })
  for (const [key, events] of sortedRoundEntries) {
    const roundSource = events.find((event) => event.roundId || event.roundIndex !== undefined) ?? events[0]
    const projection = contextProjectionByFrameKey.get(key)
    const prompt = input.promptDetails.find((detail) => events.some((event) => event.id === detail.eventId))
    const contextDiffWindow = projection ? contextDiffWindowByProjectionEventId.get(projection.eventId) : undefined
    const mutations = mergeContextMutations([
      ...(contextDiffWindow?.mutations ?? []),
      ...events.flatMap((event) => contextMutationByEventId.get(event.id) ?? []),
    ])
    const modelCalls = input.modelCalls.filter((call) => modelCallInRound(call, key, events))
    const modelContext = modelCalls.flatMap((call) => modelContextByCallId.get(call.id) ?? [])
    const toolCalls = events.flatMap((event) => toolCallByEventId.get(event.id) ?? [])
    const messageWrites = events.flatMap((event) => messageWriteByEventId.get(event.id) ?? [])
    const skills = input.skillTrace.filter((entry) => events.some((event) => event.id === entry.eventId))
    const attentionEvents = events.flatMap((event) => attentionByEventId.get(event.id) ?? [])
    frames.push({
      id: `round:${key}`,
      kind: 'round',
      label: roundSource?.roundLabel ?? (roundSource?.roundIndex !== undefined ? `Round ${roundSource.roundIndex}` : `Round ${frames.length + 1}`),
      ...(roundSource?.roundId ? { roundId: roundSource.roundId } : {}),
      ...(roundSource?.roundIndex !== undefined ? { roundIndex: roundSource.roundIndex } : {}),
      ...(roundSource?.roundLabel ? { roundLabel: roundSource.roundLabel } : {}),
      ...frameTiming(events),
      status: frameStatus(events),
      focus: frameFocus(events),
      eventIds: events.map((event) => event.id),
      events,
      attentionEvents,
      context: {
        ...(projection ? { projection } : {}),
        ...(prompt ? { prompt } : {}),
        diff: runtimeContextDiff({
          events,
          contextDiffWindow,
          mutations,
          previousContextProjectionEventId: contextDiffWindow?.previousContextProjectionEventId,
        }),
      },
      skills,
      modelCalls,
      modelContext,
      toolCalls,
      messageWrites,
      approvals: attentionEvents.filter((event) => event.kind === 'approval' || event.kind === 'input'),
    })
  }

  const usedEventIds = new Set(frames.flatMap((frame) => frame.eventIds))
  const finalizeEvents = input.events.filter((event) => !usedEventIds.has(event.id))
  if (finalizeEvents.length > 0 || input.pendingActions.length > 0) {
    frames.push({
      id: 'finalize',
      kind: 'finalize',
      label: 'Runtime finalize',
      ...frameTiming(finalizeEvents.length > 0 ? finalizeEvents : input.events.slice(-1)),
      status: finalizeEvents.length > 0 ? frameStatus(finalizeEvents) : 'info',
      focus: frameFocus(finalizeEvents),
      eventIds: finalizeEvents.map((event) => event.id),
      events: finalizeEvents,
      attentionEvents: finalizeEvents.flatMap((event) => attentionByEventId.get(event.id) ?? []),
      messageWrites: finalizeEvents.flatMap((event) => messageWriteByEventId.get(event.id) ?? []),
      pendingActions: input.pendingActions,
    })
  }

  return frames
}

function runtimeContextDiff(input: {
  events: AgentTraceEvent[]
  contextDiffWindow: AgentRuntimeContextDiffWindowView | undefined
  mutations: AgentContextMutationView[]
  previousContextProjectionEventId?: string
}): AgentRuntimeContextDiffView {
  const affectedContextKeys = uniqueStrings(input.mutations.flatMap((mutation) => mutation.affectedContextKeys))
  const appendedContextKeys = uniqueStrings(input.mutations.flatMap((mutation) => mutation.appendedContextKeys))
  const amendedContextKeys = uniqueStrings(input.mutations.flatMap((mutation) => mutation.amendedContextKeys))
  const deletedContextKeys = uniqueStrings(input.mutations.flatMap((mutation) => mutation.deletedContextKeys))
  const changes = input.mutations.flatMap((mutation) => {
    const event = input.events.find((candidate) => candidate.id === mutation.eventId)
    return contextChangesForMutation(mutation, event)
  })
  return {
    ...(input.previousContextProjectionEventId ? { previousContextProjectionEventId: input.previousContextProjectionEventId } : {}),
    mutationCount: input.mutations.length > 0 ? input.mutations.length : input.contextDiffWindow?.mutationCount ?? 0,
    appended: input.mutations.length > 0 ? input.mutations.reduce((sum, mutation) => sum + mutation.appended, 0) : input.contextDiffWindow?.appended ?? 0,
    amended: input.mutations.length > 0 ? input.mutations.reduce((sum, mutation) => sum + mutation.amended, 0) : input.contextDiffWindow?.amended ?? 0,
    deleted: input.mutations.length > 0 ? input.mutations.reduce((sum, mutation) => sum + mutation.deleted, 0) : input.contextDiffWindow?.deleted ?? 0,
    affectedContextKeys: input.mutations.length > 0 ? affectedContextKeys : input.contextDiffWindow?.affectedContextKeys ?? [],
    appendedContextKeys: input.mutations.length > 0 ? appendedContextKeys : input.contextDiffWindow?.appendedContextKeys ?? [],
    amendedContextKeys: input.mutations.length > 0 ? amendedContextKeys : input.contextDiffWindow?.amendedContextKeys ?? [],
    deletedContextKeys: input.mutations.length > 0 ? deletedContextKeys : input.contextDiffWindow?.deletedContextKeys ?? [],
    ...(input.contextDiffWindow?.latestMutationReason ?? input.mutations.at(-1)?.latest?.reason ? { latestMutationReason: input.contextDiffWindow?.latestMutationReason ?? input.mutations.at(-1)?.latest?.reason } : {}),
    mutationEventIds: input.mutations.length > 0 ? input.mutations.map((mutation) => mutation.eventId) : input.contextDiffWindow?.mutationEventIds ?? [],
    changes,
    mutations: input.mutations,
  }
}

function mergeContextMutations(mutations: AgentContextMutationView[]): AgentContextMutationView[] {
  const seen = new Set<string>()
  const merged: AgentContextMutationView[] = []
  for (const mutation of mutations) {
    if (seen.has(mutation.eventId)) continue
    seen.add(mutation.eventId)
    merged.push(mutation)
  }
  return merged
}

function contextChangesForMutation(mutation: AgentContextMutationView, event: AgentTraceEvent | undefined): AgentRuntimeContextChangeView[] {
  const data = recordValue(event?.data)
  const summary = recordValue(data?.mutationSummary)
  const explicitChanges = arrayValue(summary?.changes) ?? arrayValue(data?.changes)
  if (explicitChanges) {
    return explicitChanges.flatMap((item): AgentRuntimeContextChangeView[] => {
      const record = recordValue(item)
      const op = contextChangeOp(stringValue(record?.op) ?? stringValue(record?.type) ?? stringValue(record?.action))
      const key = stringValue(record?.key) ?? stringValue(recordValue(record?.after)?.key) ?? stringValue(recordValue(record?.before)?.key)
      if (!record || !key) return []
      return [{
        eventId: mutation.eventId,
        op,
        key,
        ...(stringValue(record.reason) ? { reason: stringValue(record.reason) } : mutation.latest?.reason ? { reason: mutation.latest.reason } : {}),
        ...(traceRefFromUnknown(record.ref, key) ? { ref: traceRefFromUnknown(record.ref, key) } : {}),
        ...(traceRefFromUnknown(record.before, key) ? { before: traceRefFromUnknown(record.before, key) } : {}),
        ...(traceRefFromUnknown(record.after, key) ? { after: traceRefFromUnknown(record.after, key) } : {}),
        ...(record.preview !== undefined ? { preview: typeof record.preview === 'string' ? record.preview : previewJSON(record.preview) } : {}),
        raw: item,
      }]
    })
  }
  return mutation.affectedContextKeys.map((key): AgentRuntimeContextChangeView => {
    const op = mutation.appendedContextKeys.includes(key)
      ? 'append'
      : mutation.amendedContextKeys.includes(key)
        ? 'amend'
        : mutation.deletedContextKeys.includes(key)
          ? 'delete'
          : mutation.latest?.type ?? 'unknown'
    const ref = mutation.refs.find((candidate) => candidate.key === key) ?? mutation.refs[0]
    return {
      eventId: mutation.eventId,
      op,
      key,
      ...(mutation.latest?.reason ? { reason: mutation.latest.reason } : {}),
      ...(ref ? { ref, after: op === 'delete' ? undefined : ref, before: op === 'delete' ? ref : undefined } : {}),
    }
  })
}

function traceRefFromUnknown(value: unknown, key?: string): AgentTraceRefView | undefined {
  const record = recordValue(value)
  if (!record) return undefined
  const ref = recordValue(record.ref) ?? record
  const type = stringValue(ref.type)
  const id = stringValue(ref.id)
  const hash = stringValue(ref.hash) ?? stringValue(ref.version)
  const resolvedKey = stringValue(record.key) ?? key
  if (!type && !id && !hash) return undefined
  return {
    kind: type || id ? 'context' : 'content_hash',
    label: type && id ? `${type}:${id}` : hash ?? resolvedKey ?? 'context ref',
    ...(resolvedKey ? { key: resolvedKey } : {}),
    ...(id ? { id } : {}),
    ...(type ? { type } : {}),
    ...(hash ? { hash } : {}),
  }
}

function contextChangeOp(value: string | undefined): AgentRuntimeContextChangeView['op'] {
  if (value === 'append' || value === 'added' || value === 'add') return 'append'
  if (value === 'amend' || value === 'updated' || value === 'update') return 'amend'
  if (value === 'delete' || value === 'deleted' || value === 'remove') return 'delete'
  return 'unknown'
}

function modelCallInRound(call: AgentModelCallSummary, roundKey: string, events: AgentTraceEvent[]): boolean {
  if (call.roundId && `id:${call.roundId}` === roundKey) return true
  if (call.roundIndex !== undefined && `index:${call.roundIndex}` === roundKey) return true
  return call.eventIds.some((eventId) => events.some((event) => event.id === eventId))
}

function frameTiming(events: AgentTraceEvent[]): { startedAt: string; completedAt?: string; durationMs?: number } {
  const sorted = [...events].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  const startedAt = sorted[0]?.createdAt ?? new Date(0).toISOString()
  const completedAt = sorted.flatMap((event) => event.completedAt ?? event.createdAt).sort().at(-1)
  const startMs = Date.parse(startedAt)
  const completeMs = completedAt ? Date.parse(completedAt) : undefined
  return {
    startedAt,
    ...(completedAt ? { completedAt } : {}),
    ...(completeMs !== undefined && Number.isFinite(startMs) && Number.isFinite(completeMs) && completeMs >= startMs ? { durationMs: completeMs - startMs } : {}),
  }
}

function frameStatus(events: AgentTraceEvent[]): AgentTraceEvent['status'] {
  if (events.some((event) => event.status === 'failed')) return 'failed'
  if (events.some((event) => event.status === 'blocked')) return 'blocked'
  if (events.some((event) => event.status === 'started')) return 'started'
  return events.length > 0 ? 'completed' : 'info'
}

function frameFocus(events: AgentTraceEvent[]): AgentRuntimeFrameFocus[] {
  const focus = new Set<AgentRuntimeFrameFocus>()
  for (const event of events) {
    if (event.kind === 'context' || event.kind === 'prompt') focus.add('context')
    if (event.kind === 'model_call') focus.add('model')
    if (event.kind === 'tool_call') focus.add('tool')
    if (event.kind === 'skill') focus.add('skill')
    if (event.kind === 'assistant' || event.kind === 'message') focus.add('message')
    if (event.kind === 'approval' || event.kind === 'input' || event.kind === 'permission') focus.add('approval')
    if (event.status === 'failed' || event.status === 'blocked' || event.kind === 'error') focus.add('attention')
    focus.add('raw')
  }
  return Array.from(focus)
}

function roundKeyFromEvent(event: AgentTraceEvent): string | undefined {
  if (event.roundId) return `id:${event.roundId}`
  if (event.roundIndex !== undefined) return `index:${event.roundIndex}`
  if (isRuntimeRoundEvent(event)) {
    const data = recordValue(event.data)
    const callId = stringValue(data?.callId) ?? stringValue(data?.toolCallId) ?? stringValue(data?.messageId)
    return `event:${event.kind}:${callId ?? event.id}`
  }
  return undefined
}

function isRuntimeRoundEvent(event: AgentTraceEvent): boolean {
  return event.kind === 'context'
    || event.kind === 'prompt'
    || event.kind === 'model_call'
    || event.kind === 'tool_call'
    || event.kind === 'skill'
    || event.kind === 'assistant'
    || event.kind === 'message'
    || event.kind === 'approval'
    || event.kind === 'input'
    || event.kind === 'permission'
}

function runtimeFrameKeyFromContextProjection(projection: AgentRuntimeContextProjectionView): string | undefined {
  if (projection.roundId) return `id:${projection.roundId}`
  if (projection.roundIndex !== undefined) return `index:${projection.roundIndex}`
  return undefined
}
