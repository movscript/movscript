import type { AgentTraceEvent } from '../../../../state/shared/types.js'
import { skillTraceTitle } from './labels.js'
import { contextRefsFromRefs } from './refs.js'
import type {
  AgentContextMutationView,
  AgentPendingActionView,
  AgentPromptContextLedgerStateView,
  AgentPromptDetailView,
  AgentPromptSkillStateView,
  AgentRoundContextUpdateView,
  AgentRunRuntimeSummary,
  AgentRuntimeSkillOmissionView,
  AgentSkillTraceEntry,
  AgentSkillTraceSummary,
  AgentToolCallView,
} from './types.js'
import { arrayValue, firstNumber, numberValue, recordValue, stringList, stringValue, uniqueStrings } from './values.js'

export function buildSkillTraceSummary(events: AgentTraceEvent[]): AgentSkillTraceSummary {
  const timeline = events.flatMap((event): AgentSkillTraceEntry[] => {
    const data = recordValue(event.data)
    const skillData = skillTraceData(event, data)
    const eventType = stringValue(skillData?.skillEventType) ?? stringValue(skillData?.eventType)
    if (event.kind !== 'skill' && !eventType?.startsWith('skill.')) return []
    return [{
      eventId: event.id,
      createdAt: event.createdAt,
      eventType: eventType ?? 'skill.event',
      title: skillTraceTitle(eventType, event.title),
      ...(event.summary ? { summary: event.summary } : {}),
      activeSkillIds: stringList(skillData?.activeSkillIds),
      loadedSkillIds: stringList(skillData?.loadedSkillIds),
      unloadedSkillIds: stringList(skillData?.unloadedSkillIds),
      availableSkillIds: stringList(skillData?.availableSkillIds),
      omissions: runtimeSkillOmissionViews(skillData?.skillOmissions),
    }]
  })
  const latest = timeline.at(-1)
  return {
    timeline,
    currentActiveSkillIds: latest?.activeSkillIds ?? [],
    currentLoadedSkillIds: latest?.loadedSkillIds ?? [],
    currentUnloadedSkillIds: latest?.unloadedSkillIds ?? [],
    currentAvailableSkillIds: latest?.availableSkillIds ?? [],
    currentOmissions: latest?.omissions ?? [],
  }
}

export function correlatePromptDetailsWithRuntimeState(input: {
  promptDetails: AgentPromptDetailView[]
  events: AgentTraceEvent[]
  skillTimeline: AgentSkillTraceSummary
  contextMutations: AgentContextMutationView[]
}): AgentPromptDetailView[] {
  const eventById = new Map(input.events.map((event) => [event.id, event]))
  return input.promptDetails.map((detail) => {
    const promptEvent = eventById.get(detail.eventId)
    if (!promptEvent) return detail
    const skillState = promptSkillStateAt(promptEvent, input.skillTimeline.timeline)
    const contextState = promptContextLedgerStateAt(promptEvent, input.contextMutations, eventById)
    return {
      ...detail,
      runtimeSkillState: skillState,
      contextLedgerState: contextState,
    }
  })
}

function promptSkillStateAt(promptEvent: AgentTraceEvent, timeline: AgentSkillTraceEntry[]): AgentPromptSkillStateView {
  const latest = timeline
    .filter((entry) => entry.createdAt <= promptEvent.createdAt)
    .at(-1)
  return {
    activeSkillIds: latest?.activeSkillIds ?? [],
    loadedSkillIds: latest?.loadedSkillIds ?? [],
    unloadedSkillIds: latest?.unloadedSkillIds ?? [],
    availableSkillIds: latest?.availableSkillIds ?? [],
    omissions: latest?.omissions ?? [],
    ...(latest ? { sourceEventId: latest.eventId } : {}),
  }
}

function promptContextLedgerStateAt(
  promptEvent: AgentTraceEvent,
  contextMutations: AgentContextMutationView[],
  eventById: Map<string, AgentTraceEvent>,
): AgentPromptContextLedgerStateView {
  const mutations = contextMutations.filter((mutation) => {
    const event = eventById.get(mutation.eventId)
    return event ? event.createdAt <= promptEvent.createdAt : false
  })
  const latest = mutations.at(-1)
  return {
    mutationCount: mutations.length,
    mutationEventIds: mutations.map((mutation) => mutation.eventId),
    ...(latest ? { latestMutationEventId: latest.eventId } : {}),
    ...(latest?.latest?.reason ? { latestMutationReason: latest.latest.reason } : {}),
  }
}

export function buildRuntimeSummary(input: {
  events: AgentTraceEvent[]
  promptDetails: AgentPromptDetailView[]
  skillTimeline: AgentSkillTraceSummary
  toolCalls: AgentToolCallView[]
  contextMutations: AgentContextMutationView[]
  roundContextUpdates: AgentRoundContextUpdateView[]
  pendingActions: AgentPendingActionView[]
}): AgentRunRuntimeSummary {
  const latestPrompt = input.promptDetails.at(-1)
  const latestRoundContextUpdate = input.roundContextUpdates.at(-1)
  const latestSkill = input.skillTimeline.timeline.at(-1)
  const usedToolNames = uniqueStrings(input.toolCalls.map((toolCall) => toolCall.toolName))
  const failedToolNames = uniqueStrings(input.toolCalls.filter((toolCall) => toolCall.status === 'failed').map((toolCall) => toolCall.toolName))
  const blockedToolNames = uniqueStrings(input.toolCalls.filter((toolCall) => toolCall.status === 'blocked').map((toolCall) => toolCall.toolName))
  const toolPermissionRuntime = buildToolPermissionRuntimeSummary(input.events)
  const permissionGateBlockedToolNames = uniqueStrings(input.toolCalls
    .filter((toolCall) => toolCall.status === 'failed' && /policy/i.test(`${toolCall.summary ?? ''} ${toolCall.dataPreview ?? ''}`))
    .map((toolCall) => toolCall.toolName))
  const pendingApprovalToolNames = uniqueStrings(input.pendingActions.flatMap((action) => action.type === 'approval' ? [action.toolName] : []))
  const latestMutation = input.contextMutations.at(-1)?.latest
  const blockedToolCount = latestPrompt?.blockedToolCount !== undefined ? firstNumber(latestPrompt.blockedToolCount) : undefined
  return {
    skills: {
      activeSkillIds: input.skillTimeline.currentActiveSkillIds,
      loadedSkillIds: input.skillTimeline.currentLoadedSkillIds,
      unloadedSkillIds: input.skillTimeline.currentUnloadedSkillIds,
      availableSkillIds: input.skillTimeline.currentAvailableSkillIds,
      contextProjection: latestPrompt?.skillContextProjection ?? [],
      omissions: input.skillTimeline.currentOmissions,
      ...(latestSkill ? { sourceEventId: latestSkill.eventId } : {}),
    },
    tools: {
      availableToolNames: latestPrompt?.tools ?? [],
      usedToolNames,
      failedToolNames,
      blockedToolNames,
      approvalRequiredToolNames: toolPermissionRuntime.approvalRequiredToolNames,
      deniedToolNames: toolPermissionRuntime.deniedToolNames,
      permissionGateBlockedToolNames,
      pendingApprovalToolNames,
      ...(blockedToolCount !== undefined ? { blockedToolCount } : {}),
      ...(latestPrompt ? { sourceEventId: latestPrompt.eventId } : {}),
    },
    context: {
      ...(latestPrompt ? { promptEventId: latestPrompt.eventId } : {}),
      contextMutationCount: input.contextMutations.length,
      roundContextUpdateCount: input.roundContextUpdates.length,
      ...(latestRoundContextUpdate ? { latestRoundContextUpdate } : {}),
      ...(latestMutation?.reason ? { latestMutationReason: latestMutation.reason } : {}),
      ...(latestPrompt?.historyProjection ? { historyProjection: latestPrompt.historyProjection } : {}),
      ...(latestPrompt?.toolLoopProjection ? { toolLoopProjection: latestPrompt.toolLoopProjection } : {}),
      ...(latestPrompt?.historicalVisualProjection ? { historicalVisualProjection: latestPrompt.historicalVisualProjection } : latestRoundContextUpdate?.historicalVisualProjection ? { historicalVisualProjection: latestRoundContextUpdate.historicalVisualProjection } : {}),
      ...(latestPrompt?.attachmentProjection ? { attachmentProjection: latestPrompt.attachmentProjection } : {}),
    },
  }
}

function buildToolPermissionRuntimeSummary(events: AgentTraceEvent[]): {
  approvalRequiredToolNames: string[]
  deniedToolNames: string[]
} {
  const approvalRequired: string[] = []
  const denied: string[] = []
  for (const event of events) {
    const data = recordValue(event.data)
    const eventType = stringValue(data?.eventType)
    if (event.kind === 'permission' && eventType === 'tool.call.permission_decision') {
      for (const blocked of arrayValue(data?.blocked) ?? []) {
        const item = recordValue(blocked)
        const name = stringValue(item?.name)
        if (!name) continue
        if (item?.reason === 'approval_required') approvalRequired.push(name)
        else denied.push(name)
      }
    }
    if (event.kind === 'approval' && eventType === 'approval.requested') {
      for (const tool of arrayValue(data?.tools) ?? []) {
        const name = stringValue(recordValue(tool)?.name)
        if (name) approvalRequired.push(name)
      }
    }
  }
  return {
    approvalRequiredToolNames: uniqueStrings(approvalRequired),
    deniedToolNames: uniqueStrings(denied),
  }
}

function runtimeSkillOmissionViews(value: unknown): AgentRuntimeSkillOmissionView[] {
  return (arrayValue(value) ?? []).flatMap((item): AgentRuntimeSkillOmissionView[] => {
    const record = recordValue(item)
    const skillId = stringValue(record?.skillId)
    const stage = stringValue(record?.stage)
    const reason = stringValue(record?.reason)
    if (!record || !skillId || !stage || !reason) return []
    return [{
      skillId,
      name: stringValue(record.name) ?? skillId,
      stage,
      reason,
      ...(typeof record.matched === 'boolean' ? { matched: record.matched } : {}),
      ...(typeof record.selected === 'boolean' ? { selected: record.selected } : {}),
      ...(stringValue(record.triggerReason) ? { triggerReason: stringValue(record.triggerReason) } : {}),
      dependencyIds: stringList(record.dependencyIds),
      missingDependencyIds: stringList(record.missingDependencyIds),
      inactiveDependencyIds: stringList(record.inactiveDependencyIds),
      conflictSkillIds: stringList(record.conflictSkillIds),
    }]
  })
}

function skillTraceData(event: AgentTraceEvent, data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const directEventType = stringValue(data?.skillEventType) ?? stringValue(data?.eventType)
  if (directEventType?.startsWith('skill.')) return data
  if (event.toolName !== 'core_skill_update') return data
  const result = recordValue(data?.result)
  return stringValue(result?.eventType)?.startsWith('skill.') ? result : data
}

export function buildContextMutationViews(events: AgentTraceEvent[]): AgentContextMutationView[] {
  return events.flatMap((event): AgentContextMutationView[] => {
    if (event.kind !== 'context') return []
    const data = recordValue(event.data)
    const eventType = stringValue(data?.eventType) ?? stringValue(data?.contextEventType)
    if (eventType !== 'context.ledger_updated') return []
    const summary = recordValue(data?.mutationSummary)
    if (!summary) return []
    return [{
      eventId: event.id,
      title: '上下文变动',
      total: numberValue(summary.total) ?? 0,
      appended: numberValue(summary.appended) ?? 0,
      amended: numberValue(summary.amended) ?? 0,
      deleted: numberValue(summary.deleted) ?? 0,
      affectedContextKeys: stringList(summary.affectedContextKeys),
      appendedContextKeys: stringList(summary.appendedContextKeys),
      amendedContextKeys: stringList(summary.amendedContextKeys),
      deletedContextKeys: stringList(summary.deletedContextKeys),
      ...(mutationLatestView(summary.latest) ? { latest: mutationLatestView(summary.latest) } : {}),
      refs: contextRefsFromRefs(data?.refs),
    }]
  })
}

function mutationLatestView(value: unknown): AgentContextMutationView['latest'] | undefined {
  const record = recordValue(value)
  const type = stringValue(record?.type)
  const id = stringValue(record?.id)
  const createdAt = stringValue(record?.createdAt)
  if (!id || !createdAt || (type !== 'append' && type !== 'amend' && type !== 'delete')) return undefined
  return {
    id,
    type,
    createdAt,
    ...(stringValue(record?.reason) ? { reason: stringValue(record?.reason) } : {}),
  }
}
