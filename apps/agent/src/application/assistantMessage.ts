import type { JSONValue } from '../types.js'
import { isJSONValue, isRecord } from '../jsonValue.js'
import { isValidAgentEntityId, isValidAgentProjectId, parseToolResult } from '../context/runtimeContext.js'
import { parseAgentCommand } from '../context/commandRouter.js'
import { renderLocalFinalAssistantContent } from '../context/localDiagnosticCommands.js'
import {
  resolveRuntimeChatFileModelConfig,
  type RuntimeModelChatMessage,
  type RuntimeModelChatTool,
  type RuntimeModelChatToolCall,
  type RuntimeModelAuthContext,
  type RuntimeModelTraceCallback,
} from '../model/modelConfig.js'
import { callModel } from '../model/modelClient.js'
import type { AgentMemory } from '../memory/types.js'
import type { AgentMessageRole, AgentRun, ResolvedToolCatalog, ToolCall, ToolCallOutcome } from '../state/types.js'
import { formatToolNameForDisplay, publicToolName } from '../tools/toolNames.js'

export function isMessageRole(value: unknown): value is AgentMessageRole {
  return value === 'system' || value === 'user' || value === 'assistant'
}

export function combineAssistantTurnContents(contents: string[], fallback: string): string {
  const turns: string[] = []
  for (const content of contents) {
    const trimmed = content.trim()
    if (!trimmed) continue
    if (turns.at(-1) === trimmed) continue
    turns.push(trimmed)
  }
  const fallbackContent = fallback.trim()
  if (fallbackContent && turns.at(-1) !== fallbackContent) turns.push(fallbackContent)
  return turns.join('\n\n')
}

export function buildFinalAssistantContent(input: {
  userMessage: string
  modelContent: string
  toolResults: ToolCallOutcome[]
  warnings: string[]
  memories: AgentMemory[]
  run: AgentRun
  memoryStorePath?: string
}): string {
  const command = parseAgentCommand(input.userMessage)
  return renderLocalFinalAssistantContent({
    command,
    run: input.run,
    context: isRecord(input.run.metadata?.context) ? input.run.metadata.context : undefined,
    warnings: input.warnings,
    memories: input.memories,
    toolResults: input.toolResults,
    memoryStorePath: input.memoryStorePath,
    modelContent: input.modelContent,
  })
}

export function buildAssistantContent(
  userMessage: string,
  toolResults: ToolCallOutcome[],
  warnings: string[] = [],
  memories: AgentMemory[] = [],
  run?: AgentRun,
): string {
  const memoryCount = memories.length
  const memoryLine = memoryCount > 0 ? `已参考 ${memoryCount} 条记忆。` : undefined
  const memoryBlock = memoryCount > 0 ? `相关记忆：\n${formatMemoryBlock(memories, 5)}` : undefined
  if (warnings.includes('当前没有选中项目')) {
    return [
      '当前没有选中项目。',
      memoryLine,
      memoryBlock,
      `收到的请求：${userMessage.trim()}`,
      '请先在 MovScript 中选中项目，再让我查找项目内容或创建项目草稿。',
    ].filter(Boolean).join('\n')
  }

  if (toolResults.length === 0) {
    return [
      '我已经读取了当前 MovScript 上下文。',
      memoryLine,
      memoryBlock,
      `收到的请求：${userMessage.trim()}`,
      '第一阶段 runtime 目前只会自动读取上下文，并在你要求查项目内容或生成草稿时调用对应 MCP 工具。',
    ].filter(Boolean).join('\n')
  }

  const lines = ['我已经读取了当前 MovScript 上下文，并完成这些操作：']
  if (memoryLine) lines.push(memoryLine)
  if (memoryBlock) lines.push(memoryBlock)
  for (const outcome of toolResults) {
    lines.push(`- ${describeToolOutcome(outcome)}`)
  }
  return lines.join('\n')
}

export async function buildConfiguredAssistantContent(
  userMessage: string,
  toolResults: ToolCallOutcome[],
  warnings: string[] = [],
  memories: AgentMemory[] = [],
  run?: AgentRun,
  auth: RuntimeModelAuthContext = {},
  onModelTrace?: RuntimeModelTraceCallback,
): Promise<string> {
  const turn = await buildConfiguredAssistantTurn({
    userMessage,
    toolResults,
    warnings,
    memories,
    run,
    auth,
    onModelTrace,
  })
  return turn.content
}

export interface ConfiguredAssistantTurnInput {
  userMessage: string
  toolResults: ToolCallOutcome[]
  warnings?: string[]
  memories?: AgentMemory[]
  run?: AgentRun
  auth?: RuntimeModelAuthContext
  onModelTrace?: RuntimeModelTraceCallback
  messages?: RuntimeModelChatMessage[]
  tools?: RuntimeModelChatTool[]
}

export interface ConfiguredAssistantTurn {
  content: string
  assistantMessage?: RuntimeModelChatMessage
}

export async function buildConfiguredAssistantTurn(input: ConfiguredAssistantTurnInput): Promise<ConfiguredAssistantTurn> {
  const {
    userMessage,
    toolResults,
    warnings = [],
    memories = [],
    run,
    auth = {},
    onModelTrace,
    messages,
    tools = [],
  } = input
  const config = resolveRuntimeChatFileModelConfig()
  const requiresModel = shouldRequireConfiguredModel(run)
  if (!config) {
    if (requiresModel) {
      throw new Error('production orchestration requires a configured backend chat model; no local fallback is allowed')
    }
    return { content: buildAssistantContent(userMessage, toolResults, warnings, memories, run) }
  }

  try {
    const result = await callModel({
      config,
      messages: messages ?? buildAssistantMessages(userMessage, toolResults, warnings, memories, run),
      auth,
      tools,
      toolChoice: tools.length > 0 ? 'auto' : undefined,
      onTrace: onModelTrace,
    })
    return { content: result.content ?? '', assistantMessage: result.rawAssistantMessage }
  } catch (error) {
    if (requiresModel) {
      throw new Error(`production orchestration model call failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    warnings.push(`model chat fallback: ${error instanceof Error ? error.message : String(error)}`)
    return { content: buildAssistantContent(userMessage, toolResults, warnings, memories, run) }
  }
}

export function buildOpenAIChatTools(catalog: ResolvedToolCatalog): RuntimeModelChatTool[] {
  return catalog.available.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      ...(tool.inputSchema !== undefined ? { parameters: tool.inputSchema } : {}),
    },
  }))
}

export function appendAssistantToolExchange(
  messages: RuntimeModelChatMessage[],
  assistantMessage: RuntimeModelChatMessage | undefined,
  outcomes: ToolCallOutcome[],
  requestedToolCalls: ToolCall[] = [],
): RuntimeModelChatMessage[] {
  const toolCalls = assistantMessage?.tool_calls?.length
    ? assistantMessage.tool_calls
    : requestedToolCalls.map(toRuntimeToolCall)
  if (toolCalls.length === 0 || outcomes.length === 0) return messages
  const assistantContent = assistantMessage?.tool_calls?.length ? assistantMessage?.content ?? null : null
  return [
    ...messages,
    {
      role: 'assistant',
      content: assistantContent,
      tool_calls: toolCalls,
    },
    ...matchToolOutcomes(toolCalls, outcomes).map(({ toolCall, outcome }) => ({
      role: 'tool' as const,
      tool_call_id: toolCall.id,
      content: JSON.stringify(outcome.error
        ? { error: outcome.error, call: outcome.call }
        : { result: outcome.result ?? null, call: outcome.call }),
    })),
  ]
}

function toRuntimeToolCall(call: ToolCall, index: number): RuntimeModelChatToolCall {
  return {
    id: `call_runtime_${index + 1}`,
    type: 'function',
    function: {
      name: call.name,
      arguments: JSON.stringify(call.args ?? {}),
    },
  }
}

export function extractRequestedToolCallsFromAssistantContent(content: string): ToolCall[] {
  const parsed = parseAssistantJSON(content)
  if (!isRecord(parsed)) return []
  const rawToolCalls = Array.isArray(parsed.tool_calls)
    ? parsed.tool_calls
    : Array.isArray(parsed.toolCalls)
      ? parsed.toolCalls
      : isRecord(parsed.tool_call)
        ? [parsed.tool_call]
        : isRecord(parsed.toolCall)
          ? [parsed.toolCall]
          : typeof parsed.name === 'string' || typeof parsed.tool_name === 'string'
            ? [parsed]
            : []
  return dedupeToolCalls(rawToolCalls.flatMap(normalizeAssistantToolCall))
}

export function buildAssistantMessages(
  userMessage: string,
  toolResults: ToolCallOutcome[],
  warnings: string[],
  memories: AgentMemory[],
  run?: AgentRun,
): RuntimeModelChatMessage[] {
  const agentSoul = typeof run?.agentManifest?.soul === 'string' && run.agentManifest.soul.trim()
    ? run.agentManifest.soul.trim()
    : undefined
  const context = run?.metadata?.context
  const skillMessages = assistantSkillMessages(run)
  const messages: Array<RuntimeModelChatMessage | undefined> = [
    skillMessages.length > 0 ? undefined : {
      role: 'system',
      content: [
        'Use the runtime JSON sections below to summarize this turn.',
        agentSoul ? `[Agent-specific output contract]\n${agentSoul}` : undefined,
      ].join('\n'),
    },
    ...skillMessages,
    context !== undefined ? {
      role: 'system' as const,
      content: `Runtime context JSON:\n${JSON.stringify(context)}`,
    } : undefined,
    {
      role: 'system',
      content: `Execution policy JSON:\n${JSON.stringify(run?.policy ?? null)}`,
    },
    warnings.length > 0 ? {
      role: 'system' as const,
      content: `Runtime warnings JSON:\n${JSON.stringify(warnings)}`,
    } : undefined,
    memories.length > 0 ? {
      role: 'system' as const,
      content: `Relevant memories JSON:\n${JSON.stringify(memories.map((memory) => ({
        id: memory.id,
        projectId: memory.projectId,
        title: memory.title,
        kind: memory.kind,
        content: memory.content,
      })))}`,
    } : undefined,
    toolResults.length > 0 ? {
      role: 'system' as const,
      content: `Pre-model runtime tool outcomes JSON:\n${JSON.stringify(toolResults.map((outcome) => ({
        call: outcome.call,
        ...(outcome.error ? { error: outcome.error } : { result: outcome.result ?? null }),
      })))}`,
    } : undefined,
    {
      role: 'user',
      content: userMessage,
    },
  ]
  return messages.filter((message): message is RuntimeModelChatMessage => !!message)
}

function assistantSkillMessages(run?: AgentRun): RuntimeModelChatMessage[] {
  const rawSkills = run?.metadata?.skills
  if (!Array.isArray(rawSkills)) return []
  return rawSkills.flatMap((item): RuntimeModelChatMessage[] => {
    if (!isRecord(item)) return []
    const record = item
    const title = typeof record.name === 'string' && record.name.trim()
      ? record.name.trim()
      : typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : 'Agent Skill'
    const content = typeof record.compiledInstruction === 'string' && record.compiledInstruction.trim()
      ? record.compiledInstruction.trim()
      : typeof record.instruction === 'string' && record.instruction.trim()
        ? record.instruction.trim()
        : undefined
    return content ? [{ role: 'system', content: `## ${title}\n${content}` }] : []
  })
}

function matchToolOutcomes(
  toolCalls: RuntimeModelChatToolCall[],
  outcomes: ToolCallOutcome[],
): Array<{ toolCall: RuntimeModelChatToolCall; outcome: ToolCallOutcome }> {
  const remaining = [...toolCalls]
  return outcomes.flatMap((outcome) => {
    const index = remaining.findIndex((toolCall) => toolCall.function.name === outcome.call.name)
    const toolCall = index >= 0 ? remaining.splice(index, 1)[0] : remaining.shift()
    return toolCall ? [{ toolCall, outcome }] : []
  })
}

function formatMemoryBlock(memories: AgentMemory[], limit: number): string {
  return memories
    .slice(0, limit)
    .map((memory) => `- [${memory.kind}] ${memory.title}: ${memory.content}`)
    .join('\n')
}

function shouldRequireConfiguredModel(run?: AgentRun): boolean {
  return run?.metadata?.runtimeRequiresConfiguredModel === true
}

function parseAssistantJSON(content: string): unknown {
  const trimmed = content.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

function normalizeAssistantToolCall(value: unknown): ToolCall[] {
  if (!isRecord(value)) return []
  const name = typeof value.name === 'string' && value.name.trim()
    ? value.name.trim()
    : typeof value.tool_name === 'string' && value.tool_name.trim()
      ? value.tool_name.trim()
      : isRecord(value.function) && typeof value.function.name === 'string' && value.function.name.trim()
        ? value.function.name.trim()
        : undefined
  if (!name) return []

  const rawArgs = isRecord(value.parameters)
    ? value.parameters
    : isRecord(value.args)
      ? value.args
      : isRecord(value.arguments)
        ? value.arguments
        : isRecord(value.function) && typeof value.function.arguments === 'string'
          ? parseArgumentsObject(value.function.arguments)
          : typeof value.arguments === 'string'
            ? parseArgumentsObject(value.arguments)
            : undefined

  return [{
    name,
    ...(isRecord(rawArgs) ? { args: normalizeAssistantToolArgs(rawArgs) } : {}),
  }]
}

function normalizeAssistantToolArgs(args: Record<string, unknown>): Record<string, JSONValue> {
  const output: Record<string, JSONValue> = {}
  for (const [key, value] of Object.entries(args)) {
    if ((key === 'projectId' || key === 'project_id' || key === 'productionId' || key === 'production_id') && !isJSONValue(value)) continue
    if (isJSONValue(value)) output[key] = value
  }
  const projectId = isValidAgentProjectId(args.projectId)
    ? args.projectId
    : isValidAgentProjectId(args.project_id)
      ? args.project_id
      : undefined
  const productionId = isValidAgentEntityId(args.productionId)
    ? args.productionId
    : isValidAgentEntityId(args.production_id)
      ? args.production_id
      : undefined
  if (projectId !== undefined) output.projectId = projectId
  else delete output.projectId
  if (!isValidAgentProjectId(output.project_id)) delete output.project_id
  if (productionId !== undefined) output.productionId = productionId
  else delete output.productionId
  if (!isValidAgentEntityId(output.production_id)) delete output.production_id
  return output
}

function parseArgumentsObject(value: string): unknown {
  if (!value.trim()) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function dedupeToolCalls(calls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>()
  const result: ToolCall[] = []
  for (const call of calls) {
    const key = JSON.stringify([call.name, call.args ?? {}])
    if (seen.has(key)) continue
    seen.add(key)
    result.push(call)
  }
  return result
}

function describeToolOutcome(outcome: ToolCallOutcome): string {
  if (outcome.error) {
    return `${formatToolNameForDisplay(outcome.call.name)} 未完成：${outcome.error}`
  }

  return describeToolResult(outcome.call, outcome.result ?? null)
}

function describeToolResult(call: ToolCall, result: JSONValue): string {
  const parsed = parseToolResult(result)
  const toolName = publicToolName(call.name)
  if (call.name === 'movscript_create_draft') {
    const draftId = isRecord(parsed) && (typeof parsed.draftId === 'string' ? parsed.draftId : typeof parsed.id === 'string' ? parsed.id : '')
    const label = typeof draftId === 'string' && draftId.length > 0 ? ` ${draftId}` : ''
    const isProposal = isRecord(parsed) && typeof parsed.proposalRef === 'string'
    return isProposal ? `创建对话提案草稿${label}。` : `创建本地草稿${label}。`
  }
  if (call.name === 'movscript_update_draft') {
    const status = isRecord(parsed) && typeof parsed.status === 'string' ? parsed.status : undefined
    const count = isRecord(parsed) && typeof parsed.replacementCount === 'number' ? `，替换 ${parsed.replacementCount} 处` : ''
    if (status === 'validated') return '校验本地草稿。'
    if (status === 'patched') return '更新本地草稿 JSON。'
    if (isRecord(parsed) && 'ok' in parsed) return `草稿 apply preview${parsed.ok === true ? '通过' : '未通过'}。`
    return `更新本地草稿${count}。`
  }
  if (call.name === 'movscript_create_generation_job') {
    const status = isRecord(parsed) && typeof parsed.status === 'string' ? parsed.status : 'completed'
    const outputResourceId = outputResourceSummary(parsed)
    const jobId = isRecord(parsed) && isValidAgentEntityId(parsed.jobId) ? `Job #${parsed.jobId}` : '生成任务'
    const terminal = isRecord(parsed) && parsed.terminal === true
    if (!terminal && !outputResourceId) return `${jobId} 已创建，当前状态：${status}。`
    return `${jobId} 已执行（${status}${outputResourceId}）。`
  }
  if (call.name === 'movscript_get_generation_job') {
    const status = isRecord(parsed) && typeof parsed.status === 'string' ? parsed.status : 'unknown'
    const jobId = isRecord(parsed) && isValidAgentEntityId(parsed.jobId) ? `Job #${parsed.jobId}` : '生成任务'
    const outputResourceId = outputResourceSummary(parsed)
    const progress = isRecord(parsed) && typeof parsed.progress === 'number' ? `，进度 ${parsed.progress}%` : ''
    const error = isRecord(parsed) && typeof parsed.error === 'string' && parsed.error ? `：${parsed.error}` : ''
    if (status === 'succeeded') return `${jobId} 生成完成${outputResourceId}。`
    if (status === 'failed') return `${jobId} 生成失败${error}。`
    if (status === 'cancelled') return `${jobId} 已取消。`
    return `${jobId} 仍在运行（${status}${progress}）。`
  }
  if (call.name === 'movscript_list_generation_jobs') {
    const count = isRecord(parsed) && typeof parsed.count === 'number' ? parsed.count : undefined
    const active = isRecord(parsed) && typeof parsed.active === 'number' ? parsed.active : undefined
    return `查看生成任务${count === undefined ? '' : `，返回 ${count} 条`}${active === undefined ? '' : `，运行中 ${active} 条`}。`
  }
  if (call.name === 'movscript_cancel_generation_job') {
    const status = isRecord(parsed) && typeof parsed.status === 'string' ? parsed.status : 'unknown'
    const jobId = isRecord(parsed) && isValidAgentEntityId(parsed.jobId) ? `Job #${parsed.jobId}` : '生成任务'
    return `${jobId} 已请求取消，当前状态：${status}。`
  }
  return `调用 ${call.name}。`
}

function outputResourceSummary(parsed: unknown): string {
  if (!isRecord(parsed)) return ''
  const ids = new Set<number>()
  const add = (value: unknown) => {
    if (isValidAgentEntityId(value)) ids.add(value)
  }
  if (Array.isArray(parsed.output_resource_ids)) {
    for (const id of parsed.output_resource_ids) add(id)
  }
  if (Array.isArray(parsed.outputResourceIds)) {
    for (const id of parsed.outputResourceIds) add(id)
  }
  add(parsed.output_resource_id)
  add(parsed.outputResourceId)
  if (ids.size === 0) return ''
  return `，输出资源 ${[...ids].map((id) => `#${id}`).join('、')}`
}
