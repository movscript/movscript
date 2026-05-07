import type { JSONValue } from '../types.js'
import { parseToolResult } from '../context/runtimeContext.js'
import {
  buildBackendGatewayChatRequest,
  callBackendGatewayChatWithTrace,
  resolveRuntimeChatFileModelConfig,
  type RuntimeModelChatMessage,
  type RuntimeModelChatTool,
  type RuntimeModelChatToolCall,
  type RuntimeModelAuthContext,
  type RuntimeModelTraceCallback,
} from '../model/modelConfig.js'
import type { AgentMemory } from '../memory/types.js'
import type { AgentRun, ResolvedToolCatalog, ToolCall, ToolCallOutcome } from '../state/types.js'

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
    const result = await callBackendGatewayChatWithTrace(buildBackendGatewayChatRequest(
      config,
      messages ?? buildAssistantMessages(userMessage, toolResults, warnings, memories, run),
      auth,
      {
        tools,
        toolChoice: tools.length > 0 ? 'auto' : undefined,
      },
    ), onModelTrace)
    return { content: result.content, assistantMessage: result.assistantMessage }
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
  const messages: Array<RuntimeModelChatMessage | undefined> = [
    {
      role: 'system',
      content: [
        'You are MovScript Agent, a pragmatic assistant for film and animation production workflows.',
        'Answer in the same language as the user unless they ask otherwise.',
        'Use the runtime context, plan, tool results, and memories when available.',
        'Do not claim you changed project data unless a tool result proves it.',
        'When writes are represented as drafts or approval requests, describe them as drafts or pending approvals.',
        agentSoul ? `[Agent-specific output contract]\n${agentSoul}` : undefined,
      ].join('\n'),
    },
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
        scope: memory.scope,
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
    .map((memory) => `- [${memory.scope}/${memory.kind}] ${memory.content}`)
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
  return {
    ...args,
    ...(typeof args.projectId !== 'number' && typeof args.project_id === 'number' ? { projectId: args.project_id } : {}),
    ...(typeof args.productionId !== 'number' && typeof args.production_id === 'number' ? { productionId: args.production_id } : {}),
  } as Record<string, JSONValue>
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
  if (call.name === 'movscript_search_entities') {
    const count = isRecord(parsed) && Array.isArray(parsed.results) ? parsed.results.length : undefined
    return `搜索项目内容${count === undefined ? '' : `，找到 ${count} 条结果`}。`
  }
  if (call.name === 'movscript_read_entity') {
    return `读取 ${String(call.args?.entityType ?? 'entity')} ${String(call.args?.entityId ?? '')}。`
  }
  if (call.name === 'movscript_read_project_structure') {
    const counts = isRecord(parsed) && isRecord(parsed.counts) ? parsed.counts : undefined
    const summary = counts
      ? `（scripts=${String(counts.scripts ?? 0)}, creative_references=${String(counts.creative_references ?? counts.creativeReferences ?? 0)}, asset_slots=${String(counts.asset_slots ?? counts.assetSlots ?? 0)}, content_units=${String(counts.content_units ?? counts.contentUnits ?? 0)}）`
      : ''
    return `读取项目结构摘要${summary}。`
  }
  if (call.name === 'movscript_create_draft') {
    const draftId = isRecord(parsed) && typeof parsed.id === 'string' ? ` ${parsed.id}` : ''
    return `创建本地草稿${draftId}。`
  }
  if (call.name === 'movscript_get_draft') {
    const draftId = isRecord(parsed) && typeof parsed.id === 'string' ? ` ${parsed.id}` : ''
    return `读取本地草稿${draftId}。`
  }
  if (call.name === 'movscript_list_drafts') {
    const count = isRecord(parsed) && Array.isArray(parsed.drafts) ? parsed.drafts.length : undefined
    return `列出本地草稿${count === undefined ? '' : `，共 ${count} 条`}。`
  }
  if (call.name === 'movscript_update_draft') {
    const draft = isRecord(parsed) && isRecord(parsed.draft) ? parsed.draft : parsed
    const draftId = isRecord(draft) && typeof draft.id === 'string' ? ` ${draft.id}` : ''
    return `更新本地草稿${draftId}。`
  }
  if (call.name === 'movscript_patch_draft') {
    const paths = isRecord(parsed) && Array.isArray(parsed.changedPaths) ? parsed.changedPaths.length : undefined
    return `细粒度修改本地草稿${paths === undefined ? '' : `，变更 ${paths} 个路径`}。`
  }
  if (call.name === 'movscript_validate_draft') {
    const ok = isRecord(parsed) && parsed.ok === true
    const issues = isRecord(parsed) && Array.isArray(parsed.issues) ? parsed.issues.length : undefined
    return `校验本地草稿${ok ? '通过' : '未通过'}${issues === undefined ? '' : `，问题 ${issues} 个`}。`
  }
  if (call.name === 'movscript_apply_draft') {
    const status = isRecord(parsed) && typeof parsed.status === 'string' ? parsed.status : 'completed'
    return `应用草稿审批链已执行（${status}）；当前只更新本地 Agent 草稿生命周期，不直接写正式项目实体。`
  }
  if (call.name === 'movscript_create_generation_job') {
    const status = isRecord(parsed) && typeof parsed.status === 'string' ? parsed.status : 'completed'
    const outputResourceId = isRecord(parsed) && typeof parsed.output_resource_id === 'number'
      ? `，输出资源 #${parsed.output_resource_id}`
      : ''
    return `生成任务已执行（${status}${outputResourceId}）。`
  }
  return `调用 ${call.name}。`
}

function formatToolNameForDisplay(name: string): string {
  return name.startsWith('movscript_') ? `movscript.${name.slice('movscript_'.length)}` : name
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
