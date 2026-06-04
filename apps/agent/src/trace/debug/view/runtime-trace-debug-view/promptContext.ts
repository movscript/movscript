import type { AgentTraceEvent } from '../../../../state/shared/types.js'
import { localizedPromptContextLayer, localizedPromptLayer } from './labels.js'
import { contextBundleRefView } from './refs.js'
import type {
  AgentGenericPromptProjectionView,
  AgentPromptDetailView,
  AgentPromptHistoryProjectionView,
  AgentRuntimeContextProjectionView,
  AgentSkillContextProjectionView,
} from './types.js'
import { arrayValue, numberValue, recordValue, stringList, stringValue } from './values.js'

export function buildRuntimeContextProjectionViews(events: AgentTraceEvent[]): AgentRuntimeContextProjectionView[] {
  return events.flatMap((event): AgentRuntimeContextProjectionView[] => {
    if (event.kind !== 'context') return []
    const data = recordValue(event.data)
    const eventType = stringValue(data?.eventType) ?? stringValue(data?.contextEventType)
    if (eventType !== 'context.round_projection_updated') return []
    const historyProjection = promptHistoryProjectionView(data?.historyProjection)
    const toolLoopProjection = genericPromptProjectionView(data?.toolLoopProjection)
    const historicalVisualProjection = genericPromptProjectionView(data?.historicalVisualProjection)
    const attachmentProjection = genericPromptProjectionView(data?.attachmentProjection)
    return [{
      eventId: event.id,
      title: event.title || 'Round context projection updated',
      ...(event.roundId ? { roundId: event.roundId } : {}),
      ...(event.roundIndex !== undefined ? { roundIndex: event.roundIndex } : {}),
      ...(event.roundLabel ? { roundLabel: event.roundLabel } : {}),
      ...(numberValue(data?.messageCount) !== undefined ? { messageCount: String(numberValue(data?.messageCount)) } : {}),
      ...(numberValue(data?.systemMessageCount) !== undefined ? { systemMessageCount: String(numberValue(data?.systemMessageCount)) } : {}),
      ...(numberValue(data?.promptChars) !== undefined ? { promptChars: String(numberValue(data?.promptChars)) } : {}),
      ...(contextBundleRefView(data) ? { contextBundle: contextBundleRefView(data) } : {}),
      ...(historyProjection ? { historyProjection } : {}),
      ...(toolLoopProjection ? { toolLoopProjection } : {}),
      ...(historicalVisualProjection ? { historicalVisualProjection } : {}),
      ...(attachmentProjection ? { attachmentProjection } : {}),
    }]
  })
}

export function buildPromptDetails(events: AgentTraceEvent[]): AgentPromptDetailView[] {
  return events.flatMap((event): AgentPromptDetailView[] => {
    if (event.kind !== 'prompt') return []
    const data = recordValue(event.data)
    const promptStats = recordValue(data?.promptStats)
    const parts = arrayValue(promptStats?.parts)?.slice(0, 24).map((part, index) => {
      const record = recordValue(part)
      return {
        id: stringValue(record?.id) ?? `part_${index + 1}`,
        ...(localizedPromptLayer(stringValue(record?.layer)) ? { layer: localizedPromptLayer(stringValue(record?.layer)) } : {}),
        ...(localizedPromptContextLayer(stringValue(record?.contextLayer)) ? { contextLayer: localizedPromptContextLayer(stringValue(record?.contextLayer)) } : {}),
        ...(numberValue(record?.chars) !== undefined ? { chars: String(numberValue(record?.chars)) } : {}),
      }
    }) ?? []
    const skills = stringList(data?.skillIds)
    const skillContextProjection = skillContextProjectionViews(data?.skillContextProjection)
    const tools = stringList(data?.availableToolNames)
    const historyProjection = promptHistoryProjectionView(data?.historyProjection)
    const toolLoopProjection = genericPromptProjectionView(data?.toolLoopProjection)
    const historicalVisualProjection = genericPromptProjectionView(data?.historicalVisualProjection)
    const attachmentProjection = genericPromptProjectionView(data?.attachmentProjection)
    const budgetLedger = recordValue(promptStats?.budgetLedger) ?? recordValue(data?.budgetLedger)
    const budgetDecisions = arrayValue(budgetLedger?.decisions)?.slice(0, 24).map((decision, index) => {
      const record = recordValue(decision)
      const stage = stringValue(record?.stage)
      const reason = stringValue(record?.reason)
      const originalChars = numberValue(record?.originalChars)
      const renderedChars = numberValue(record?.renderedChars)
      return {
        action: stringValue(record?.action) ?? 'unknown',
        ...(stage ? { stage } : {}),
        partId: stringValue(record?.partId) ?? `decision_${index + 1}`,
        ...(reason ? { reason } : {}),
        ...(originalChars !== undefined ? { originalChars: String(originalChars) } : {}),
        ...(renderedChars !== undefined ? { renderedChars: String(renderedChars) } : {}),
      }
    }) ?? []
    if (!promptStats && skills.length === 0 && tools.length === 0) return []
    return [{
      eventId: event.id,
      title: '模型上下文详情',
      ...(contextBundleRefView(data) ? { contextBundle: contextBundleRefView(data) } : {}),
      ...(numberValue(promptStats?.totalChars) !== undefined ? { totalChars: String(numberValue(promptStats?.totalChars)) } : numberValue(data?.charCount) !== undefined ? { totalChars: String(numberValue(data?.charCount)) } : {}),
      ...(numberValue(data?.messageCount) !== undefined ? { messageCount: String(numberValue(data?.messageCount)) } : {}),
      ...(numberValue(data?.systemMessageCount) !== undefined ? { systemMessageCount: String(numberValue(data?.systemMessageCount)) } : {}),
      ...(numberValue(data?.blockedToolCount) !== undefined ? { blockedToolCount: String(numberValue(data?.blockedToolCount)) } : {}),
      skills,
      skillContextProjection,
      tools,
      layers: metricEntries(recordValue(promptStats?.byLayer), localizedPromptLayer),
      contextLayers: metricEntries(recordValue(promptStats?.byContextLayer), localizedPromptContextLayer),
      partGroups: promptPartGroups(parts),
      parts,
      budgetDecisions,
      ...(historyProjection ? { historyProjection } : {}),
      ...(toolLoopProjection ? { toolLoopProjection } : {}),
      ...(historicalVisualProjection ? { historicalVisualProjection } : {}),
      ...(attachmentProjection ? { attachmentProjection } : {}),
    }]
  })
}

function genericPromptProjectionView(value: unknown): AgentGenericPromptProjectionView | undefined {
  const record = recordValue(value)
  const decisions = arrayValue(record?.decisions)
  if (!record || !decisions) return undefined
  return {
    ...record,
    decisions: decisions.flatMap((decision) => {
      const item = recordValue(decision)
      return item ? [item] : []
    }),
  }
}

function promptHistoryProjectionView(value: unknown): AgentPromptHistoryProjectionView | undefined {
  const record = recordValue(value)
  if (!record) return undefined
  const inputCount = numberValue(record.inputCount)
  const retainedCount = numberValue(record.retainedCount)
  const compactedCount = numberValue(record.compactedCount)
  const filteredCount = numberValue(record.filteredCount)
  const summaryChars = numberValue(record.summaryChars)
  if (inputCount === undefined || retainedCount === undefined || compactedCount === undefined || filteredCount === undefined || summaryChars === undefined) return undefined
  return {
    inputCount,
    retainedCount,
    compactedCount,
    filteredCount,
    summaryChars,
    decisions: (arrayValue(record.decisions) ?? []).flatMap((decision): AgentPromptHistoryProjectionView['decisions'] => {
      const item = recordValue(decision)
      if (!item) return []
      const action = stringValue(item.action)
      if (!action) return []
      return [{
        action,
        ...(stringValue(item.stage) ? { stage: stringValue(item.stage) } : {}),
        ...(stringValue(item.reason) ? { reason: stringValue(item.reason) } : {}),
        ...(numberValue(item.messageCount) !== undefined ? { messageCount: numberValue(item.messageCount) } : {}),
        ...(numberValue(item.retainedCount) !== undefined ? { retainedCount: numberValue(item.retainedCount) } : {}),
        ...(numberValue(item.summaryChars) !== undefined ? { summaryChars: numberValue(item.summaryChars) } : {}),
        ...(numberValue(item.maxMessages) !== undefined ? { maxMessages: numberValue(item.maxMessages) } : {}),
      }]
    }),
  }
}

function skillContextProjectionViews(value: unknown): AgentSkillContextProjectionView[] {
  return (arrayValue(value) ?? []).flatMap((item, index): AgentSkillContextProjectionView[] => {
    const record = recordValue(item)
    const skillId = stringValue(record?.skillId)
    if (!record || !skillId) return []
    const renderedChars = numberValue(record.renderedChars)
    const originalChars = numberValue(record.originalChars)
    const priority = numberValue(record.priority)
    return [{
      skillId,
      name: stringValue(record.name) ?? skillId,
      ...(stringValue(record.category) ? { category: stringValue(record.category) } : {}),
      ...(stringValue(record.activationReason) ? { activationReason: stringValue(record.activationReason) } : {}),
      ...(stringValue(record.contextBehavior) ? { contextBehavior: stringValue(record.contextBehavior) } : {}),
      includedInPrompt: record.includedInPrompt === true,
      ...(stringValue(record.promptPartId) ? { promptPartId: stringValue(record.promptPartId) } : { promptPartId: `skill.${skillId || index + 1}` }),
      ...(localizedPromptLayer(stringValue(record.promptLayer)) ? { promptLayer: localizedPromptLayer(stringValue(record.promptLayer)) } : stringValue(record.promptLayer) ? { promptLayer: stringValue(record.promptLayer) } : {}),
      ...(stringValue(record.promptKind) ? { promptKind: stringValue(record.promptKind) } : {}),
      ...(renderedChars !== undefined ? { renderedChars: String(renderedChars) } : {}),
      ...(stringValue(record.omittedReason) ? { omittedReason: stringValue(record.omittedReason) } : {}),
      ...(stringValue(record.omittedStage) ? { omittedStage: stringValue(record.omittedStage) } : {}),
      ...(originalChars !== undefined ? { originalChars: String(originalChars) } : {}),
      ...(priority !== undefined ? { priority: String(priority) } : {}),
    }]
  })
}

function promptPartGroups(parts: AgentPromptDetailView['parts']): AgentPromptDetailView['partGroups'] {
  const groups = new Map<string, { contextLayer: string; count: number; chars: number; partIds: string[] }>()
  for (const part of parts) {
    const key = part.contextLayer ?? '未分类'
    const group = groups.get(key) ?? { contextLayer: key, count: 0, chars: 0, partIds: [] }
    group.count += 1
    group.chars += Number(part.chars ?? 0) || 0
    group.partIds.push(part.id)
    groups.set(key, group)
  }
  return Array.from(groups.values())
    .sort((left, right) => right.chars - left.chars || left.contextLayer.localeCompare(right.contextLayer))
    .map((group) => ({
      contextLayer: group.contextLayer,
      count: group.count,
      chars: String(group.chars),
      partIds: group.partIds,
    }))
}

function metricEntries(record: Record<string, unknown> | undefined, labeler: (value: string | undefined) => string | undefined): Array<{ label: string; value: string }> {
  if (!record) return []
  return Object.entries(record)
    .flatMap(([key, value]) => {
      const number = numberValue(value)
      if (number === undefined) return []
      return [{ label: labeler(key) ?? key, value: String(number) }]
    })
    .sort((left, right) => Number(right.value) - Number(left.value))
}
