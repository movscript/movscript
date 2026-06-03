import type { JSONValue } from '../../../shared/protocol/types.js'
import type { ResolvedAgentSkill, ResolvedToolCatalog } from '../../../state/shared/types.js'
import type { RuntimeModelChatMessage } from '../../../model/config/modelConfig.js'
import type { RuntimePromptContext } from '../pipeline/runtimePromptPipeline.js'
import type { CompactedPromptHistory } from '../hygiene/promptHygiene.js'
import { promptBundleDebugParts, promptBundleFragments } from '../compiler/promptBundle.js'
import type { ReactiveModelTurnProjection } from './modelTurnProjection.js'

export interface ModelTurnPromptTrace {
  title: string
  summary: string
  data: Record<string, unknown>
}

export interface SkillContextProjection {
  skillId: string
  name: string
  activationReason: ResolvedAgentSkill['activationReason']
  contextBehavior?: string
  includedInPrompt: boolean
  promptPartId: string
  promptLayer?: string
  promptKind?: string
  renderedChars?: number
  omittedReason?: string
  omittedStage?: string
  originalChars?: number
  priority?: number
}

export interface BuildModelTurnPromptTraceInput {
  promptContext: RuntimePromptContext
  messages: RuntimeModelChatMessage[]
  skills: ResolvedAgentSkill[]
  tools: ResolvedToolCatalog
  projection: ReactiveModelTurnProjection
  historyProjection?: CompactedPromptHistory
}

export function buildModelTurnPromptTrace(input: BuildModelTurnPromptTraceInput): ModelTurnPromptTrace {
  const providerProjection = input.promptContext.providerProjection
  const providerSystemChars = providerProjection.systemPrompt.length
  return {
    title: 'Prompt composed',
    summary: `${providerSystemChars} provider system prompt chars, ${input.skills.length} active skill(s).`,
    data: {
      eventType: 'prompt.composed',
      contextEventType: 'context.prompt_composed',
      charCount: providerSystemChars,
      promptBundle: promptBundleTrace(input.promptContext),
      providerProjection: providerProjectionTrace(input.promptContext),
      sectionPromptChars: input.promptContext.promptBundle.sectionPrompt.length,
      providerSystemChars,
      messageCount: input.messages.length,
      systemMessageCount: providerProjection.systemMessages.length,
      systemMessageProjections: providerProjection.systemMessageProjections as unknown as JSONValue,
      promptLedger: input.promptContext.promptLedger as unknown as JSONValue,
      promptStats: input.promptContext.promptStats,
      ...(input.historyProjection ? { historyProjection: promptHistoryProjectionTrace(input.historyProjection) } : {}),
      ...(input.projection.toolLoopProjection ? { toolLoopProjection: input.projection.toolLoopProjection } : {}),
      ...(input.projection.historicalVisualProjection ? { historicalVisualProjection: input.projection.historicalVisualProjection } : {}),
      ...(input.projection.attachmentProjection ? { attachmentProjection: input.projection.attachmentProjection } : {}),
      skillIds: input.skills.map((skill) => skill.id),
      skillContextProjection: buildSkillContextProjection(input.skills, input.promptContext),
      availableToolNames: input.tools.available.map((tool) => tool.name),
      blockedToolCount: input.tools.blocked.length,
      debugPartIds: promptBundleDebugParts(input.promptContext.promptBundle).map((part) => part.id),
      promptFragments: promptBundleFragments(input.promptContext.promptBundle) as unknown as JSONValue,
      promptEligibilityDecisions: input.promptContext.promptEligibilityDecisions as unknown as JSONValue,
      ...(input.promptContext.degraded ? { degraded: input.promptContext.degraded } : {}),
      warnings: input.promptContext.warnings,
    },
  }
}

function providerProjectionTrace(promptContext: RuntimePromptContext): JSONValue {
  return {
    schema: promptContext.providerProjection.schema,
    provider: promptContext.providerProjection.provider,
    promptBundleId: promptContext.providerProjection.promptBundleId,
    messageCount: promptContext.providerProjection.messages.length,
    systemMessageCount: promptContext.providerProjection.systemMessages.length,
    projectionCount: promptContext.providerProjection.systemMessageProjections.length,
  }
}

function promptBundleTrace(promptContext: RuntimePromptContext): JSONValue {
  return {
    schema: promptContext.promptBundle.schema,
    id: promptContext.promptBundle.id,
    sectionCount: promptContext.promptBundle.sections.length,
    fragmentCount: promptBundleFragments(promptContext.promptBundle).length,
    historyMessageCount: promptContext.promptBundle.history.length,
  }
}

function buildSkillContextProjection(skills: ResolvedAgentSkill[], promptContext: RuntimePromptContext): SkillContextProjection[] {
  const partsById = new Map(promptContext.promptStats.parts.map((part) => [part.id, part]))
  const latestDecisionByPartId = new Map<string, RuntimePromptContext['budgetLedger']['decisions'][number]>()
  for (const decision of promptContext.budgetLedger.decisions) {
    if (decision.partId.startsWith('skill.')) latestDecisionByPartId.set(decision.partId, decision)
  }
  return skills.map((skill) => {
    const promptPartId = `skill.${skill.id}`
    const part = partsById.get(promptPartId)
    const decision = latestDecisionByPartId.get(promptPartId)
    return {
      skillId: skill.id,
      name: skill.name,
      activationReason: skill.activationReason,
      ...(skill.runtime?.contextBehavior ? { contextBehavior: skill.runtime.contextBehavior } : {}),
      includedInPrompt: !!part,
      promptPartId,
      ...(part?.layer ? { promptLayer: part.layer } : {}),
      ...(part?.kind ? { promptKind: part.kind } : {}),
      ...(part?.chars !== undefined ? { renderedChars: part.chars } : {}),
      ...(decision?.reason ? { omittedReason: decision.reason } : {}),
      ...(decision?.stage ? { omittedStage: decision.stage } : {}),
      ...(decision?.originalChars !== undefined ? { originalChars: decision.originalChars } : {}),
      ...(decision?.priority !== undefined ? { priority: decision.priority } : {}),
    }
  })
}

function promptHistoryProjectionTrace(history: CompactedPromptHistory): Record<string, JSONValue> {
  return {
    inputCount: history.inputCount,
    retainedCount: history.retainedCount,
    compactedCount: history.compactedCount,
    filteredCount: history.filteredCount,
    summaryChars: history.summaryChars,
    decisions: history.projectionDecisions as unknown as JSONValue,
  }
}
