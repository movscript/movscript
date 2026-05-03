import type { JSONValue } from '../types.js'
import { parseToolResult } from './context.js'
import {
  buildBackendGatewayChatRequest,
  callBackendGatewayChat,
  resolveRuntimeChatFileModelConfig,
  type RuntimeModelAuthContext,
} from './modelConfig.js'
import { formatMemoryBlock } from './planner.js'
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
  if (isInspectContextCommand(userMessage) && run?.envelope) {
    return JSON.stringify({
      command: '/inspect_context',
      runId: run.id,
      threadId: run.threadId,
      context: run.envelope.context,
      memories: run.envelope.memories,
      labels: run.envelope.context.labels,
      warnings,
    }, null, 2)
  }

  if (isProductionPlanCommand(userMessage) && run?.plan) {
    return JSON.stringify({
      command: '/production_plan',
      runId: run.id,
      threadId: run.threadId,
      planner: typeof run.metadata?.planner === 'string' ? run.metadata.planner : undefined,
      objective: run.plan.objective,
      strategy: run.plan.strategy,
      tasks: run.plan.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        agentRole: task.agentRole,
        status: task.status,
        toolCalls: task.toolCalls,
        ...(task.successCriteria ? { successCriteria: task.successCriteria } : {}),
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
): Promise<string> {
  if (isInspectContextCommand(userMessage) || isProductionPlanCommand(userMessage)) {
    return buildAssistantContent(userMessage, toolResults, warnings, memories, run)
  }

  const config = resolveRuntimeChatFileModelConfig()
  if (!config) return buildAssistantContent(userMessage, toolResults, warnings, memories, run)

  try {
    return await callBackendGatewayChat(buildBackendGatewayChatRequest(
      config,
      buildAssistantMessages(userMessage, toolResults, warnings, memories, run),
      auth,
      {
        temperature: shouldReturnStructuredJSON(run) ? 0.1 : undefined,
        jsonMode: shouldReturnStructuredJSON(run),
      },
    ))
  } catch (error) {
    warnings.push(`model chat fallback: ${error instanceof Error ? error.message : String(error)}`)
    return buildAssistantContent(userMessage, toolResults, warnings, memories, run)
  }
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
        context: run?.envelope?.context,
        planner: typeof run?.metadata?.planner === 'string' ? run.metadata.planner : undefined,
        plan: run?.plan,
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

function shouldReturnStructuredJSON(run?: AgentRun): boolean {
  const soul = typeof run?.agentManifest?.soul === 'string' ? run.agentManifest.soul : ''
  const manifestId = typeof run?.agentManifest?.id === 'string' ? run.agentManifest.id : ''
  return manifestId === 'production-orchestrate-analyzer' || /输出JSON|JSON对象|valid JSON|machine-readable JSON/i.test(soul)
}

function isProductionPlanCommand(message: string): boolean {
  const firstToken = message.trim().split(/\s+/, 1)[0]
  return firstToken === '/production_plan' || firstToken === '/project_plan'
}

function isInspectContextCommand(message: string): boolean {
  const firstToken = message.trim().split(/\s+/, 1)[0]
  return firstToken === '/inspect_context' || firstToken === '/context'
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
