import type { JSONValue } from '../types.js'
import { isRecord } from '../jsonValue.js'
import type { NormalizedClientInput } from './normalizeClientInput.js'
import type { AgentCommandRuntime } from './commandRouter.js'
import type {
  AgentDebugContextPanel,
  AgentMessage,
  AgentRun,
  AgentRunPolicy,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
  ToolCallOutcome,
} from '../state/types.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentMemory } from '../memory/types.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { SkillDiscoverySummary } from '../contextManager/modelContextBuilder.js'
import { isValidAgentEntityId, isValidAgentProjectId, isValidAgentReferenceId, parseToolResult } from './runtimeContext.js'
import { renderDebugContextText, renderMemoryFilesText } from './contextText.js'
import { appendFinalSourceSummary } from '../contextManager/finalSourceSummary.js'
import { contextManager } from '../contextManager/contextManager.js'

export function isLocalDiagnosticCommand(name: string): boolean {
  return name === 'context' || name === 'memory'
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
    ...(isValidAgentEntityId(ui?.productionId) ? { productionId: ui.productionId } : {}),
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
  policy: AgentRunPolicy
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
  policy: AgentRunPolicy
  memories: AgentMemory[]
  warnings: string[]
  history: AgentMessage[]
  userMessage: string
  memoryStorePath?: string
  contractResolver: AgentRuntimeContractResolver
}): { content: string; metadata?: Record<string, JSONValue> } {
  if (input.command.name === 'context') {
    const modelTurnContext = contextManager.composeModelTurn({
      manifest: input.manifest,
      skills: input.skills,
      ...(input.skillDiscovery ? { skillDiscovery: input.skillDiscovery } : {}),
      context: input.context,
      tools: input.tools,
      policy: input.policy,
      memories: input.memories,
      warnings: input.warnings,
      history: input.history,
      userMessage: input.userMessage,
      command: input.command,
      contractResolver: input.contractResolver,
    })
    const { builtContext } = modelTurnContext
    return {
      content: renderModelGatewayMessagesText(builtContext.messages),
      metadata: {
        schema: 'movscript.local_context_diagnostic.v1',
        command: input.command as unknown as JSONValue,
        modelGatewayCalled: false,
        messages: builtContext.messages.map((message) => ({
          role: message.role,
          content: message.content ?? '',
        })) as unknown as JSONValue,
        systemPrompt: builtContext.systemPrompt,
        debugParts: builtContext.debugParts as unknown as JSONValue,
        promptStats: builtContext.promptStats as unknown as JSONValue,
        tools: {
          available: compactDiagnosticTools(input.tools.available),
          blocked: compactDiagnosticTools(input.tools.blocked),
          discoveredCount: input.tools.discovered.length,
          modelTools: modelTurnContext.tools.map((tool) => ({
            name: tool.function.name,
            ...(tool.function.description ? { description: tool.function.description } : {}),
            ...(tool.function.parameters !== undefined ? { parameters: tool.function.parameters as JSONValue } : {}),
          })),
        } as unknown as JSONValue,
        skills: input.skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          category: skill.category,
          activationReason: skill.activationReason,
          resolvedPriority: skill.resolvedPriority,
        })) as unknown as JSONValue,
        warnings: builtContext.warnings as unknown as JSONValue,
      },
    }
  }
  if (input.command.name === 'memory') {
    return { content: renderMemoryFilesText(input.memories, input.memoryStorePath) }
  }
  return { content: '' }
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
  if (input.command.name === 'image') {
    return renderLocalGenerationCommand({
      command: input.command.rawName ?? '/image',
      run: input.run,
      warnings: input.warnings,
      toolResults: input.toolResults ?? [],
      modelContent: input.modelContent,
    })
  }
  if (input.command.name === 'video') {
    return renderLocalGenerationCommand({
      command: input.command.rawName ?? '/video',
      run: input.run,
      warnings: input.warnings,
      toolResults: input.toolResults ?? [],
      modelContent: input.modelContent,
    })
  }
  return appendFinalSourceSummary(input.modelContent, {
    run: input.run,
    toolResults: input.toolResults ?? [],
    memories: input.memories,
    userMessage: input.command.payload,
  })
}

export interface GenerationDebugCommandSpec {
  prompt: string
  outputType: 'image' | 'video'
  jobType: 'image' | 'image_edit' | 'video' | 'video_i2v' | 'video_v2v'
  aspectRatio?: string
  duration?: number
  featureKey: string
  timeoutMs: number
  extraParams: Record<string, JSONValue>
  referenceResourceIds: number[]
}

export function parseGenerationDebugCommand(command: AgentCommandRuntime): GenerationDebugCommandSpec | undefined {
  if (command.name !== 'image' && command.name !== 'video') return undefined
  const prompt = command.payload.trim() || '一段电影感的动态镜头，强调运动、光影和节奏。'
  const referenceResourceIds = extractReferenceResourceIds(command.payload)
  const outputType = command.name === 'image' ? 'image' : 'video'
  return {
    prompt,
    outputType,
    jobType: outputType === 'image'
      ? (referenceResourceIds.length > 0 ? 'image_edit' : 'image')
      : (referenceResourceIds.length > 0 ? 'video_i2v' : 'video'),
    ...(outputType === 'video' ? { aspectRatio: extractAspectRatio(command.payload) ?? '16:9' } : {}),
    ...(outputType === 'video' ? { duration: extractDuration(command.payload) ?? 5 } : {}),
    featureKey: outputType === 'image' ? 'plugin.image_generator' : 'plugin.video_generator',
    timeoutMs: 600_000,
    extraParams: {
      ...(outputType === 'video' && extractFps(command.payload) !== undefined ? { fps: extractFps(command.payload) } : {}),
    },
    referenceResourceIds,
  }
}

function renderLocalGenerationCommand(input: {
  command: string
  run: AgentRun
  warnings: string[]
  toolResults: ToolCallOutcome[]
  modelContent: string
}): string {
  const toolOutcome = input.toolResults[0]
  const parsed = toolOutcome && !toolOutcome.error && isRecord(parseToolResult(toolOutcome.result ?? null))
    ? parseToolResult(toolOutcome.result ?? null)
    : undefined
  const parsedRecord = isRecord(parsed) ? parsed : undefined
  const jobId = isValidAgentEntityId(parsedRecord?.jobId) ? parsedRecord.jobId : undefined
  const status = typeof parsedRecord?.status === 'string' ? parsedRecord.status : undefined
  const outputResourceId = isValidAgentEntityId(parsedRecord?.output_resource_id)
    ? parsedRecord.output_resource_id
    : isValidAgentEntityId(parsedRecord?.outputResourceId)
      ? parsedRecord.outputResourceId
      : undefined
  const lines = [
    `Command: ${input.command}`,
    `Run: ${input.run.id}`,
    `Thread: ${input.run.threadId}`,
    '',
    jobId !== undefined ? `Job #${jobId}` : 'No job id was returned.',
    status ? `Status: ${status}` : undefined,
    outputResourceId !== undefined ? `Output resource: #${outputResourceId}` : undefined,
    toolOutcome?.error ? `Error: ${toolOutcome.error}` : undefined,
    input.modelContent.trim() ? input.modelContent.trim() : undefined,
  ]
  if (input.warnings.length > 0) {
    lines.push('', 'Warnings:', ...input.warnings.map((warning) => `- ${warning}`))
  }
  return lines.filter((line): line is string => typeof line === 'string' && line.length > 0).join('\n')
}

function extractReferenceResourceIds(text: string): number[] {
  const matches = text.match(/(?:ref|reference|资源|资源id|resource)\s*[:=]?\s*([0-9,\s]+)/i)
  if (!matches?.[1]) return []
  return matches[1]
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
}

function extractAspectRatio(text: string): string | undefined {
  return text.match(/(16:9|9:16|1:1|4:3|3:4)/)?.[1]
}

function extractDuration(text: string): number | undefined {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:s|秒)/i)
  const value = match ? Number(match[1]) : undefined
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function extractFps(text: string): number | undefined {
  const match = text.match(/fps\s*[:=]?\s*(\d+(?:\.\d+)?)/i)
  const value = match ? Number(match[1]) : undefined
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
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

function renderModelGatewayMessagesText(messages: Array<{ role: string; content?: string | null }>): string {
  const lines = ['Model gateway messages:']
  messages.forEach((message, index) => {
    lines.push('', `--- message ${index + 1}: ${message.role} ---`)
    lines.push(message.content ?? '')
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
