import type { JSONValue } from '../../../shared/protocol/types.js'
import { isRecord } from '../../../shared/json/jsonValue.js'
import type { NormalizedClientInput } from '../../input/client/normalizeClientInput.js'
import type { AgentCommandRuntime } from '../../command/commandRouter.js'
import type {
  AgentDebugContextPanel,
  AgentMessage,
  AgentRun,
  AgentRuntimeLimits,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
  ToolCallOutcome,
} from '../../../state/shared/types.js'
import type { AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import type { AgentMemory } from '../../../memory/shared/types.js'
import type { AgentRuntimeContractResolver } from '../../../contracts/runtime/runtimeContract.js'
import type { SkillDiscoverySummary } from '../../prompt/registry/promptCandidateParts.js'
import { promptBundleDebugParts, promptBundleFragments } from '../../prompt/compiler/promptBundle.js'
import { isValidAgentProjectId, isValidAgentReferenceId } from '../../runtime/runtimeContext.js'
import { renderDebugContextText, renderMemoryFilesText } from '../../prompt/text/contextText.js'
import { renderFinalAssistantContent } from '../sources/finalSourceSummary.js'
import { modelTurnContext } from '../../prompt/turn/modelTurnContext.js'
import type { RuntimeModelChatMessage } from '../../../model/config/modelConfig.js'
import { runtimeModelContentText } from '../../../messages/model/modelMessage.js'

export function isLocalDiagnosticCommand(name: string): boolean {
  return name === 'context' || name === 'status' || name === 'compact' || name === 'memory'
}

export function buildLocalDiagnosticFallbackContextResult(clientInput: NormalizedClientInput | undefined, error: string): JSONValue {
  const ui = clientInput?.uiSnapshot
  const snapshot: Record<string, JSONValue> = {
    route: {
      pathname: ui?.route?.pathname ?? '/',
      ...(typeof ui?.route?.search === 'string' ? { search: ui.route.search } : {}),
      ...(typeof ui?.route?.hash === 'string' ? { hash: ui.route.hash } : {}),
    },
    ...(ui?.project ? {
      project: {
        ...(isValidAgentProjectId(ui.project.id) ? { id: ui.project.id } : {}),
        ...(typeof ui.project.name === 'string' ? { name: ui.project.name } : {}),
        ...(typeof ui.project.status === 'string' ? { status: ui.project.status } : {}),
        ...(typeof ui.project.description === 'string' ? { description: ui.project.description } : {}),
      },
    } : {}),
    selection: ui?.selection
      ? {
        ...(typeof ui.selection.entityType === 'string' ? { entityType: ui.selection.entityType } : {}),
        ...(isValidAgentReferenceId(ui.selection.entityId) ? { entityId: ui.selection.entityId } : {}),
        ...(typeof ui.selection.label === 'string' ? { label: ui.selection.label } : {}),
      }
      : null,
    recentResources: toJSONValue(ui?.recentResources ?? []),
    projects: [],
    contextSource: 'client_input_fallback',
    contextError: error,
  }
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ snapshot }, null, 2),
    }],
  }
}

export function renderLocalDiagnosticCommand(input: {
  command: AgentCommandRuntime
  run: AgentRun
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  skillDiscovery?: SkillDiscoverySummary
  context: AgentDebugContextPanel
  tools: ResolvedToolCatalog
  runtimeLimits: AgentRuntimeLimits
  memories: AgentMemory[]
  warnings: string[]
  history: AgentMessage[]
  userMessage: string
  memoryStorePath?: string
  contractResolver: AgentRuntimeContractResolver
}): string {
  return buildLocalDiagnosticCommand(input).content
}

export function buildLocalDiagnosticCommand(input: {
  command: AgentCommandRuntime
  run: AgentRun
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  skillDiscovery?: SkillDiscoverySummary
  context: AgentDebugContextPanel
  tools: ResolvedToolCatalog
  runtimeLimits: AgentRuntimeLimits
  memories: AgentMemory[]
  warnings: string[]
  history: AgentMessage[]
  userMessage: string
  memoryStorePath?: string
  contractResolver: AgentRuntimeContractResolver
}): { content: string; metadata?: Record<string, JSONValue> } {
  if (input.command.name === 'context') {
    const composedTurnContext = modelTurnContext.composeModelTurn({
      manifest: input.manifest,
      skills: input.skills,
      ...(input.skillDiscovery ? { skillDiscovery: input.skillDiscovery } : {}),
      context: input.context,
      tools: input.tools,
      runtimeLimits: input.runtimeLimits,
      warnings: input.warnings,
      history: input.history,
      userMessage: input.userMessage,
      command: input.command,
      contractResolver: input.contractResolver,
    })
    const { promptContext } = composedTurnContext
    return {
      content: renderModelGatewayMessagesText(promptContext.providerProjection.messages),
      metadata: {
        schema: 'movscript.local_context_diagnostic.v1',
        command: input.command as unknown as JSONValue,
        modelGatewayCalled: false,
        messages: promptContext.providerProjection.messages.map((message) => ({
          role: message.role,
          content: runtimeModelContentText(message.content),
        })) as unknown as JSONValue,
        systemPrompt: promptContext.promptBundle.sectionPrompt,
        sectionPrompt: promptContext.promptBundle.sectionPrompt,
        providerSystemPrompt: promptContext.providerProjection.systemPrompt,
        debugParts: promptBundleDebugParts(promptContext.promptBundle) as unknown as JSONValue,
        promptFragments: promptBundleFragments(promptContext.promptBundle) as unknown as JSONValue,
        promptStats: promptContext.promptStats as unknown as JSONValue,
        tools: {
          available: compactDiagnosticTools(input.tools.available),
          blocked: compactDiagnosticTools(input.tools.blocked),
          discoveredCount: input.tools.discovered.length,
          modelTools: composedTurnContext.tools.map((tool) => ({
            name: tool.function.name,
            ...(tool.function.description ? { description: tool.function.description } : {}),
            ...(tool.function.parameters !== undefined ? { parameters: tool.function.parameters as JSONValue } : {}),
          })),
        } as unknown as JSONValue,
        skills: input.skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          activationReason: skill.activationReason,
          resolvedPriority: skill.resolvedPriority,
        })) as unknown as JSONValue,
        warnings: promptContext.warnings as unknown as JSONValue,
      },
    }
  }
  if (input.command.name === 'status') {
    const promptHistory = modelTurnContext.compactThreadHistory({
      messages: input.history,
      maxMessages: numberField(input.run.metadata?.limits, 'maxHistoryMessages'),
      threadSummary: input.run.metadata?.threadContextSummary,
    })
    const composedTurnContext = modelTurnContext.composeModelTurn({
      manifest: input.manifest,
      skills: input.skills,
      ...(input.skillDiscovery ? { skillDiscovery: input.skillDiscovery } : {}),
      context: input.context,
      tools: input.tools,
      runtimeLimits: input.runtimeLimits,
      warnings: input.warnings,
      history: promptHistory.messages,
      historyProjection: promptHistory,
      userMessage: input.userMessage,
      ...(promptHistory.summary ? { threadSummary: promptHistory.summary } : {}),
      command: input.command,
      contractResolver: input.contractResolver,
    })
    const { promptContext } = composedTurnContext
    const status = buildRuntimeStatusDiagnostic({
      run: input.run,
      manifest: input.manifest,
      skills: input.skills,
      skillDiscovery: input.skillDiscovery,
      tools: input.tools,
      memories: input.memories,
      warnings: promptContext.warnings,
      promptStats: promptContext.promptStats,
      messageCount: promptContext.providerProjection.messages.length,
      systemMessageCount: promptContext.providerProjection.systemMessages.length,
      historyInputCount: input.history.length,
      historyRetainedCount: promptHistory.messages.length,
      historyCompactedCount: promptHistory.compactedCount,
      hasThreadSummary: Boolean(promptHistory.summary),
      modelToolCount: composedTurnContext.tools.length,
      degraded: promptContext.degraded,
    })
    return {
      content: renderRuntimeStatusDiagnostic(status),
      metadata: status as unknown as Record<string, JSONValue>,
    }
  }
  if (input.command.name === 'compact') {
    const promptHistory = modelTurnContext.compactThreadHistory({
      messages: input.history,
      maxMessages: numberField(input.run.metadata?.limits, 'maxHistoryMessages'),
      threadSummary: input.run.metadata?.threadContextSummary,
    })
    const composedTurnContext = modelTurnContext.composeModelTurn({
      manifest: input.manifest,
      skills: input.skills,
      ...(input.skillDiscovery ? { skillDiscovery: input.skillDiscovery } : {}),
      context: input.context,
      tools: input.tools,
      runtimeLimits: input.runtimeLimits,
      warnings: input.warnings,
      history: promptHistory.messages,
      historyProjection: promptHistory,
      userMessage: input.userMessage,
      ...(promptHistory.summary ? { threadSummary: promptHistory.summary } : {}),
      command: input.command,
      contractResolver: input.contractResolver,
    })
    const compact = buildRuntimeCompactDiagnostic({
      run: input.run,
      promptStats: composedTurnContext.promptContext.promptStats,
      historyInputCount: input.history.length,
      historyRetainedCount: promptHistory.messages.length,
      historyCompactedCount: promptHistory.compactedCount,
      summary: promptHistory.summary,
      warnings: composedTurnContext.promptContext.warnings,
      degraded: composedTurnContext.promptContext.degraded,
    })
    return {
      content: renderRuntimeCompactDiagnostic(compact),
      metadata: compact as unknown as Record<string, JSONValue>,
    }
  }
  if (input.command.name === 'memory') {
    return { content: renderMemoryFilesText(input.memories, input.memoryStorePath) }
  }
  return { content: '' }
}

interface RuntimeStatusDiagnostic {
  schema: 'movscript.local_status_diagnostic.v1'
  modelGatewayCalled: false
  run: {
    id: string
    threadId: string
    status: AgentRun['status']
    createdAt: string
    updatedAt: string
  }
  manifest: {
    id: string
    version: string
    name: string
    model?: JSONValue
  }
  contextBudget: {
    limitChars: number
    usedChars: number
    remainingChars: number
    usageRatio: number
    usagePercent: number
    status: string
    degraded?: string
  }
  prompt: {
    messageCount: number
    systemMessageCount: number
    historyInputCount: number
    historyRetainedCount: number
    historyCompactedCount: number
    hasThreadSummary: boolean
    parts: Array<{ id: string; title: string; kind: string; layer: string; chars: number }>
    byLayer: Record<string, number>
    byContextLayer?: Record<string, number>
  }
  skills: {
    activeCount: number
    availableCount: number
    active: Array<{ id: string; name: string; priority: number }>
  }
  tools: {
    visibleCount: number
    blockedCount: number
    discoveredCount: number
    modelToolCount: number
  }
  context: {
    memoryCount: number
    retrievedRefCount: number
    artifactRefCount: number
    warningCount: number
  }
  warnings: string[]
}

interface RuntimeCompactDiagnostic {
  schema: 'movscript.local_compact_diagnostic.v1'
  modelGatewayCalled: false
  run: {
    id: string
    threadId: string
    status: AgentRun['status']
  }
  compact: {
    historyInputCount: number
    historyRetainedCount: number
    historyCompactedCount: number
    summaryChars: number
    summaryIncluded: boolean
  }
  contextBudget: RuntimeStatusDiagnostic['contextBudget']
  warnings: string[]
}

function buildRuntimeCompactDiagnostic(input: {
  run: AgentRun
  promptStats: ReturnType<typeof modelTurnContext.composeRuntimePromptContext>['promptStats']
  historyInputCount: number
  historyRetainedCount: number
  historyCompactedCount: number
  summary?: string
  warnings: string[]
  degraded?: string
}): RuntimeCompactDiagnostic {
  const budget = input.promptStats.budget
  return {
    schema: 'movscript.local_compact_diagnostic.v1',
    modelGatewayCalled: false,
    run: {
      id: input.run.id,
      threadId: input.run.threadId,
      status: input.run.status,
    },
    compact: {
      historyInputCount: input.historyInputCount,
      historyRetainedCount: input.historyRetainedCount,
      historyCompactedCount: input.historyCompactedCount,
      summaryChars: input.summary?.length ?? 0,
      summaryIncluded: Boolean(input.summary),
    },
    contextBudget: {
      limitChars: budget.limitChars,
      usedChars: budget.usedChars,
      remainingChars: budget.remainingChars,
      usageRatio: budget.usageRatio,
      usagePercent: Math.round(budget.usageRatio * 1000) / 10,
      status: budget.status,
      ...(input.degraded ? { degraded: input.degraded } : {}),
    },
    warnings: input.warnings,
  }
}

function renderRuntimeCompactDiagnostic(compact: RuntimeCompactDiagnostic): string {
  const lines = [
    'Runtime compact:',
    `- Run: ${compact.run.id} (${compact.run.status})`,
    `- Thread: ${compact.run.threadId}`,
    `- History: ${compact.compact.historyRetainedCount}/${compact.compact.historyInputCount} retained, ${compact.compact.historyCompactedCount} compacted`,
    `- Thread summary: ${compact.compact.summaryIncluded ? `${compact.compact.summaryChars} chars included` : 'not needed'}`,
    `- Context budget after compact: ${compact.contextBudget.usedChars}/${compact.contextBudget.limitChars} chars (${compact.contextBudget.usagePercent}%), remaining ${compact.contextBudget.remainingChars}, status=${compact.contextBudget.status}${compact.contextBudget.degraded ? `, degraded=${compact.contextBudget.degraded}` : ''}`,
    '- Model gateway: not called',
  ]
  if (compact.warnings.length > 0) {
    lines.push('', 'Warnings:', ...compact.warnings.map((warning) => `- ${warning}`))
  }
  return lines.join('\n')
}

function buildRuntimeStatusDiagnostic(input: {
  run: AgentRun
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  skillDiscovery?: SkillDiscoverySummary
  tools: ResolvedToolCatalog
  memories: AgentMemory[]
  warnings: string[]
  promptStats: ReturnType<typeof modelTurnContext.composeRuntimePromptContext>['promptStats']
  messageCount: number
  systemMessageCount: number
  historyInputCount: number
  historyRetainedCount: number
  historyCompactedCount: number
  hasThreadSummary: boolean
  modelToolCount: number
  degraded?: string
}): RuntimeStatusDiagnostic {
  const ledger = isRecord(input.run.metadata?.contextLedger) ? input.run.metadata.contextLedger : undefined
  const retrievedRefCount = Array.isArray(ledger?.retrieved) ? ledger.retrieved.length : 0
  const artifactRefCount = Array.isArray(ledger?.artifactRefs) ? ledger.artifactRefs.length : 0
  const budget = input.promptStats.budget
  return {
    schema: 'movscript.local_status_diagnostic.v1',
    modelGatewayCalled: false,
    run: {
      id: input.run.id,
      threadId: input.run.threadId,
      status: input.run.status,
      createdAt: input.run.createdAt,
      updatedAt: input.run.updatedAt,
    },
    manifest: {
      id: input.manifest.id,
      version: input.manifest.version,
      name: input.manifest.name,
      ...(input.manifest.model ? { model: toJSONValue(input.manifest.model) } : {}),
    },
    contextBudget: {
      limitChars: budget.limitChars,
      usedChars: budget.usedChars,
      remainingChars: budget.remainingChars,
      usageRatio: budget.usageRatio,
      usagePercent: Math.round(budget.usageRatio * 1000) / 10,
      status: budget.status,
      ...(input.degraded ? { degraded: input.degraded } : {}),
    },
    prompt: {
      messageCount: input.messageCount,
      systemMessageCount: input.systemMessageCount,
      historyInputCount: input.historyInputCount,
      historyRetainedCount: input.historyRetainedCount,
      historyCompactedCount: input.historyCompactedCount,
      hasThreadSummary: input.hasThreadSummary,
      parts: input.promptStats.parts.map((part) => ({
        id: part.id,
        title: part.title,
        kind: part.kind,
        layer: part.layer,
        chars: part.chars,
      })),
      byLayer: input.promptStats.byLayer,
      byContextLayer: input.promptStats.byContextLayer,
    },
    skills: {
      activeCount: input.skills.length,
      availableCount: input.skillDiscovery?.availableSkills.length ?? input.skills.length,
      active: input.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        priority: skill.resolvedPriority,
      })),
    },
    tools: {
      visibleCount: input.tools.available.length,
      blockedCount: input.tools.blocked.length,
      discoveredCount: input.tools.discovered.length,
      modelToolCount: input.modelToolCount,
    },
    context: {
      memoryCount: input.memories.length,
      retrievedRefCount,
      artifactRefCount,
      warningCount: input.warnings.length,
    },
    warnings: input.warnings,
  }
}

function renderRuntimeStatusDiagnostic(status: RuntimeStatusDiagnostic): string {
  const topParts = status.prompt.parts
    .slice()
    .sort((a, b) => b.chars - a.chars || a.id.localeCompare(b.id))
    .slice(0, 8)
  const lines = [
    'Runtime status:',
    `- Run: ${status.run.id} (${status.run.status})`,
    `- Thread: ${status.run.threadId}`,
    `- Config file: ${status.manifest.name} (${status.manifest.id}@${status.manifest.version})`,
    `- Context budget: ${status.contextBudget.usedChars}/${status.contextBudget.limitChars} chars (${status.contextBudget.usagePercent}%), remaining ${status.contextBudget.remainingChars}, status=${status.contextBudget.status}${status.contextBudget.degraded ? `, degraded=${status.contextBudget.degraded}` : ''}`,
    `- Messages: ${status.prompt.messageCount} total, ${status.prompt.systemMessageCount} system`,
    `- History: ${status.prompt.historyRetainedCount}/${status.prompt.historyInputCount} retained, ${status.prompt.historyCompactedCount} compacted${status.prompt.hasThreadSummary ? ', thread summary included' : ''}`,
    `- Skills: ${status.skills.activeCount} active / ${status.skills.availableCount} available`,
    `- Tools: ${status.tools.visibleCount} visible, ${status.tools.blockedCount} blocked, ${status.tools.modelToolCount} exposed to model`,
    `- Context refs: ${status.context.retrievedRefCount} retrieved, ${status.context.artifactRefCount} artifacts, ${status.context.memoryCount} memories`,
  ]
  if (topParts.length > 0) {
    lines.push('', 'Largest prompt parts:')
    lines.push(...topParts.map((part) => `- ${part.id}: ${part.chars} chars (${part.layer})`))
  }
  if (status.warnings.length > 0) {
    lines.push('', 'Warnings:', ...status.warnings.map((warning) => `- ${warning}`))
  }
  return lines.join('\n')
}

function numberField(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined
  const field = value[key]
  return typeof field === 'number' && Number.isFinite(field) ? field : undefined
}

function compactDiagnosticTools(tools: ResolvedToolCatalog['available']): JSONValue {
  return tools.map((tool) => ({
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    source: tool.source,
    registered: tool.registered,
    granted: tool.granted,
    available: tool.available,
    ...(tool.permission ? { permission: tool.permission } : {}),
    ...(tool.risk ? { risk: tool.risk } : {}),
    ...(tool.projectScoped !== undefined ? { projectScoped: tool.projectScoped } : {}),
    approval: tool.approval,
    requiresApproval: tool.requiresApproval,
    ...(tool.unavailableReason ? { unavailableReason: tool.unavailableReason } : {}),
    ...(tool.resolution ? { resolution: tool.resolution as unknown as JSONValue } : {}),
    ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
    ...(tool.outputSchema !== undefined ? { outputSchema: tool.outputSchema } : {}),
  })) as unknown as JSONValue
}

export function renderLocalFinalAssistantContent(input: {
  command: AgentCommandRuntime
  run: AgentRun
  context: Record<string, unknown> | undefined
  warnings: string[]
  memories: AgentMemory[]
  toolResults?: ToolCallOutcome[]
  memoryStorePath?: string
  modelContent: string
}): string {
  if (input.command.name === 'context') {
    return renderLocalContextCommand({
      command: input.command.rawName ?? '/context',
      run: input.run,
      context: input.context,
      warnings: input.warnings,
    })
  }
  if (input.command.name === 'memory') {
    return renderMemoryFilesText(input.memories, input.memoryStorePath)
  }
  return renderFinalAssistantContent(input.modelContent, {
    run: input.run,
  })
}

function renderLocalContextCommand(input: {
  command: string
  run: AgentRun
  context: Record<string, unknown> | undefined
  warnings: string[]
}): string {
  const lines = [
    `Command: ${input.command}`,
    `Run: ${input.run.id}`,
    `Thread: ${input.run.threadId}`,
    '',
    'Model context text:',
    isAgentDebugContextPanel(input.context)
      ? renderDebugContextText(input.context)
      : 'No runtime context was available.',
  ]
  if (input.warnings.length > 0) {
    lines.push('', 'Warnings:', ...input.warnings.map((warning) => `- ${warning}`))
  }
  return lines.join('\n')
}

function renderModelGatewayMessagesText(messages: RuntimeModelChatMessage[]): string {
  const lines = ['Model gateway messages:']
  messages.forEach((message, index) => {
    lines.push('', `--- message ${index + 1}: ${message.role} ---`)
    lines.push(runtimeModelContentText(message.content))
  })
  return lines.join('\n')
}

function isAgentDebugContextPanel(value: unknown): value is AgentDebugContextPanel {
  return isRecord(value) && isRecord(value.route) && Array.isArray(value.projects) && Array.isArray(value.recentResources) && Array.isArray(value.attachments) && Array.isArray(value.memories) && Array.isArray(value.labels)
}

function toJSONValue(value: unknown): JSONValue {
  if (value === undefined) return null
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value as JSONValue
  if (Array.isArray(value)) return value.map(toJSONValue)
  if (!isRecord(value)) return String(value)
  const out: Record<string, JSONValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue
    out[key] = toJSONValue(item)
  }
  return out
}
