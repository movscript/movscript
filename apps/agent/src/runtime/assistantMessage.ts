import type { JSONValue } from '../types.js'
import { parseToolResult } from './context.js'
import {
  buildBackendGatewayChatRequest,
  callBackendGatewayChat,
  callBackendGatewayChatWithTrace,
  resolveRuntimeChatFileModelConfig,
  type RuntimeModelAuthContext,
  type RuntimeModelTraceCallback,
} from './modelConfig.js'
import type { AgentMemory } from './memory/types.js'
import type { AgentRun, ToolCall, ToolCallOutcome } from './types.js'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function buildAssistantContent(
  userMessage: string,
  toolResults: ToolCallOutcome[],
  warnings: string[] = [],
  memories: AgentMemory[] = [],
  run?: AgentRun,
): string {
  if (isInspectContextCommand(userMessage) && run) {
    const context = isRecord(run.metadata?.context) ? run.metadata.context : undefined
    return JSON.stringify({
      command: '/inspect_context',
      runId: run.id,
      threadId: run.threadId,
      context,
      memories: memories.map(toMemoryRef),
      labels: Array.isArray(context?.labels) ? context.labels : [],
      warnings,
    }, null, 2)
  }

  if (isProductionPlanCommand(userMessage) && run) {
    return JSON.stringify({
      command: '/production_plan',
      runId: run.id,
      threadId: run.threadId,
      objective: userMessage.trim(),
      strategy: 'agentic_loop',
      steps: run.steps.map((step) => ({
        id: step.id,
        type: step.type,
        status: step.status,
        toolName: step.toolName,
        sandboxed: step.sandboxed === true,
      })),
      warnings,
      toolResults: toolResults.map((outcome) => ({
        call: outcome.call,
        ...(outcome.error ? { error: outcome.error } : { result: outcome.result ?? null }),
      })),
      pendingApprovals: (run.pendingApprovals ?? []).map((approval) => ({
        id: approval.id,
        toolName: approval.toolName,
        status: approval.status,
        reason: approval.reason,
        risk: approval.risk,
        permission: approval.permission,
      })),
    }, null, 2)
  }

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
  if (isInspectContextCommand(userMessage) || isProductionPlanCommand(userMessage)) {
    return buildAssistantContent(userMessage, toolResults, warnings, memories, run)
  }

  const config = resolveRuntimeChatFileModelConfig()
  const requiresModel = shouldRequireConfiguredModel(run)
  if (!config) {
    if (requiresModel) {
      throw new Error('production orchestration requires a configured backend chat model; no local fallback is allowed')
    }
    return buildAssistantContent(userMessage, toolResults, warnings, memories, run)
  }

  try {
    const result = await callBackendGatewayChatWithTrace(buildBackendGatewayChatRequest(
      config,
      buildAssistantMessages(userMessage, toolResults, warnings, memories, run),
      auth,
      {
        temperature: shouldReturnStructuredJSON(run) ? 0.1 : undefined,
        jsonMode: shouldReturnStructuredJSON(run),
      },
    ), onModelTrace)
    return result.content
  } catch (error) {
    if (requiresModel) {
      throw new Error(`production orchestration model call failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    warnings.push(`model chat fallback: ${error instanceof Error ? error.message : String(error)}`)
    return buildAssistantContent(userMessage, toolResults, warnings, memories, run)
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

function buildAssistantMessages(
  userMessage: string,
  toolResults: ToolCallOutcome[],
  warnings: string[],
  memories: AgentMemory[],
  run?: AgentRun,
): ChatMessage[] {
  const agentSoul = typeof run?.agentManifest?.soul === 'string' && run.agentManifest.soul.trim()
    ? run.agentManifest.soul.trim()
    : undefined
  return [
    {
      role: 'system',
      content: [
        'You are MovScript Agent, a pragmatic assistant for film and animation production workflows.',
        'Answer in the same language as the user unless they ask otherwise.',
        'Use the runtime context, plan, tool results, and memories when available.',
        'Do not claim you changed project data unless a tool result proves it.',
        'When writes are represented as drafts or approval requests, describe them as drafts or pending approvals.',
        agentSoul ? `[Agent-specific output contract]\n${agentSoul}` : undefined,
        shouldReturnStructuredJSON(run) ? 'This run requires machine-readable JSON. Return only a valid JSON object and no markdown fences.' : undefined,
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        userMessage,
        context: run?.metadata?.context,
        policy: run?.policy,
        warnings,
        memories: memories.map((memory) => ({
          id: memory.id,
          scope: memory.scope,
          kind: memory.kind,
          content: memory.content,
        })),
        toolResults: toolResults.map((outcome) => ({
          call: outcome.call,
          ...(outcome.error ? { error: outcome.error } : { result: outcome.result ?? null }),
        })),
      }),
    },
  ]
}

function formatMemoryBlock(memories: AgentMemory[], limit: number): string {
  return memories
    .slice(0, limit)
    .map((memory) => `- [${memory.scope}/${memory.kind}] ${memory.content}`)
    .join('\n')
}

function toMemoryRef(memory: AgentMemory): Record<string, JSONValue> {
  return {
    id: memory.id,
    scope: memory.scope,
    kind: memory.kind,
    content: memory.content,
  }
}

function shouldReturnStructuredJSON(run?: AgentRun): boolean {
  const soul = typeof run?.agentManifest?.soul === 'string' ? run.agentManifest.soul : ''
  const manifestId = typeof run?.agentManifest?.id === 'string' ? run.agentManifest.id : ''
  return manifestId === 'production-orchestrate-analyzer' || /输出JSON|JSON对象|valid JSON|machine-readable JSON/i.test(soul)
}

function shouldRequireConfiguredModel(run?: AgentRun): boolean {
  return run?.agentManifest?.id === 'production-orchestrate-analyzer'
}

function isProductionPlanCommand(message: string): boolean {
  const firstToken = message.trim().split(/\s+/, 1)[0]
  return firstToken === '/production_plan' || firstToken === '/project_plan'
}

function isInspectContextCommand(message: string): boolean {
  const firstToken = message.trim().split(/\s+/, 1)[0]
  return firstToken === '/inspect_context' || firstToken === '/context'
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
    return `${outcome.call.name} 未完成：${outcome.error}`
  }

  return describeToolResult(outcome.call, outcome.result ?? null)
}

function describeToolResult(call: ToolCall, result: JSONValue): string {
  const parsed = parseToolResult(result)
  if (call.name === 'movscript.search_entities') {
    const count = isRecord(parsed) && Array.isArray(parsed.results) ? parsed.results.length : undefined
    return `搜索项目内容${count === undefined ? '' : `，找到 ${count} 条结果`}。`
  }
  if (call.name === 'movscript.read_entity') {
    return `读取 ${String(call.args?.entityType ?? 'entity')} ${String(call.args?.entityId ?? '')}。`
  }
  if (call.name === 'movscript.read_project_structure') {
    const counts = isRecord(parsed) && isRecord(parsed.counts) ? parsed.counts : undefined
    const summary = counts
      ? `（scripts=${String(counts.scripts ?? 0)}, settings=${String(counts.settings ?? 0)}, asset_slots=${String(counts.asset_slots ?? counts.assetSlots ?? 0)}, content_units=${String(counts.content_units ?? counts.contentUnits ?? 0)}）`
      : ''
    return `读取项目结构摘要${summary}。`
  }
  if (call.name === 'movscript.create_draft') {
    const draftId = isRecord(parsed) && typeof parsed.id === 'string' ? ` ${parsed.id}` : ''
    return `创建本地草稿${draftId}。`
  }
  if (call.name === 'movscript.list_drafts') {
    const count = isRecord(parsed) && Array.isArray(parsed.drafts) ? parsed.drafts.length : undefined
    return `列出本地草稿${count === undefined ? '' : `，共 ${count} 条`}。`
  }
  if (call.name === 'movscript.apply_draft') {
    const status = isRecord(parsed) && typeof parsed.status === 'string' ? parsed.status : 'completed'
    return `应用草稿审批链已执行（${status}）；当前只更新本地 Agent 草稿生命周期，不直接写正式项目实体。`
  }
  return `调用 ${call.name}。`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
