import type { JSONValue } from '../../../shared/protocol/types.js'
import { isRecord } from '../../../shared/json/jsonValue.js'
import { isValidAgentEntityId, parseToolResult } from '../../../context/runtime/runtimeContext.js'
import type { RuntimeModelChatMessage } from '../../../model/config/modelConfig.js'
import type { AgentMemory } from '../../../memory/shared/types.js'
import type { AgentRun, ToolCall, ToolCallOutcome } from '../../../state/shared/types.js'
import { formatToolNameForDisplay, publicToolName } from '../../../tools/registry/naming/toolNames.js'
import { runtimeModelTextContent } from '../../model/modelMessage.js'

export function combineAssistantTurnContents(contents: string[], fallback: string): string {
  const turns: string[] = []
  const seen = new Set<string>()
  for (const content of contents) {
    const trimmed = content.trim()
    if (!trimmed) continue
    const key = normalizedAssistantTurnKey(trimmed)
    if (seen.has(key)) continue
    seen.add(key)
    turns.push(trimmed)
  }
  const fallbackContent = fallback.trim()
  const fallbackKey = normalizedAssistantTurnKey(fallbackContent)
  if (fallbackContent && !seen.has(fallbackKey)) turns.push(fallbackContent)
  return turns.join('\n\n')
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
      content: runtimeModelTextContent([
        'Use the runtime JSON sections below to summarize this turn.',
        agentSoul ? `[Agent-specific output contract]\n${agentSoul}` : undefined,
      ].join('\n')),
    },
    ...skillMessages,
    context !== undefined ? {
      role: 'system' as const,
      content: runtimeModelTextContent(`Runtime context JSON:\n${JSON.stringify(context)}`),
    } : undefined,
    {
      role: 'system',
      content: runtimeModelTextContent(`Runtime limits JSON:\n${JSON.stringify(run?.runtimeLimits ?? null)}`),
    },
    warnings.length > 0 ? {
      role: 'system' as const,
      content: runtimeModelTextContent(`Runtime warnings JSON:\n${JSON.stringify(warnings)}`),
    } : undefined,
    memories.length > 0 ? {
      role: 'system' as const,
      content: runtimeModelTextContent(`Relevant memories JSON:\n${JSON.stringify(memories.map((memory) => ({
        id: memory.id,
        projectId: memory.projectId,
        title: memory.title,
        kind: memory.kind,
        content: memory.content,
      })))}`),
    } : undefined,
    toolResults.length > 0 ? {
      role: 'system' as const,
      content: runtimeModelTextContent(`Pre-model runtime tool outcomes JSON:\n${JSON.stringify(toolResults.map((outcome) => ({
        call: outcome.call,
        ...(outcome.error ? { error: outcome.error } : { result: outcome.result ?? null }),
      })))}`),
    } : undefined,
    {
      role: 'user',
      content: runtimeModelTextContent(userMessage),
    },
  ]
  return messages.filter((message): message is RuntimeModelChatMessage => !!message)
}

function normalizedAssistantTurnKey(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
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
    return content ? [{ role: 'system', content: runtimeModelTextContent(`## ${title}\n${content}`) }] : []
  })
}

function formatMemoryBlock(memories: AgentMemory[], limit: number): string {
  return memories
    .slice(0, limit)
    .map((memory) => `- [${memory.kind}] ${memory.title}: ${memory.content}`)
    .join('\n')
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
  if (call.name === 'draft_create') {
    const draftId = isRecord(parsed) && (typeof parsed.draftId === 'string' ? parsed.draftId : typeof parsed.id === 'string' ? parsed.id : '')
    const label = typeof draftId === 'string' && draftId.length > 0 ? ` ${draftId}` : ''
    const isProposal = isRecord(parsed) && typeof parsed.proposalRef === 'string'
    return isProposal ? `创建对话提案草稿${label}。` : `创建本地草稿${label}。`
  }
  if (call.name === 'draft_apply_preview') {
    return `草稿 apply preview${isRecord(parsed) && parsed.ok === true ? '通过' : '未通过'}。`
  }
  if (call.name === 'core_work_start') {
    const work = isRecord(parsed) && isRecord(parsed.work) ? parsed.work : {}
    const kind = typeof work.kind === 'string' ? work.kind : 'runtime'
    const status = typeof work.status === 'string' ? work.status : 'started'
    const workId = typeof work.id === 'string' ? ` ${work.id}` : ''
    return `${kind} work${workId}已提交，当前状态：${status}${outputResourceSummary(parsed)}。`
  }
  if (call.name === 'core_work_get') {
    const work = isRecord(parsed) && isRecord(parsed.work) ? parsed.work : {}
    const kind = typeof work.kind === 'string' ? work.kind : 'runtime'
    const status = typeof work.status === 'string' ? work.status : 'unknown'
    const workId = typeof work.id === 'string' ? ` ${work.id}` : ''
    return `${kind} work${workId}当前状态：${status}${outputResourceSummary(parsed)}。`
  }
  if (call.name === 'core_work_wait') {
    const status = isRecord(parsed) && typeof parsed.status === 'string' ? parsed.status : 'unknown'
    const completed = isRecord(parsed) && Array.isArray(parsed.completed) ? parsed.completed.length : 0
    const pending = isRecord(parsed) && Array.isArray(parsed.pending) ? parsed.pending.length : 0
    const failed = isRecord(parsed) && Array.isArray(parsed.failed) ? parsed.failed.length : 0
    const cancelled = isRecord(parsed) && Array.isArray(parsed.cancelled) ? parsed.cancelled.length : 0
    const outputResourceId = outputResourceSummary(parsed)
    if (status === 'timeout') return `等待 runtime work 超时，仍有 ${pending} 个 work 在后台运行。`
    return `等待 runtime work 完成（成功 ${completed}，失败 ${failed}，取消 ${cancelled}，待完成 ${pending}${outputResourceId}）。`
  }
  if (call.name === 'core_work_cancel') {
    const work = isRecord(parsed) && isRecord(parsed.work) ? parsed.work : {}
    const kind = typeof work.kind === 'string' ? work.kind : 'runtime'
    const status = typeof work.status === 'string' ? work.status : 'cancelled'
    const workId = typeof work.id === 'string' ? ` ${work.id}` : ''
    return `${kind} work${workId}已请求取消，当前状态：${status}。`
  }
  return `调用 ${toolName}。`
}

function outputResourceSummary(parsed: unknown): string {
  const ids = new Set<number>()
  const add = (value: unknown) => {
    if (isValidAgentEntityId(value)) ids.add(value)
  }
  const visit = (value: unknown) => {
    if (!isRecord(value)) return
    if (Array.isArray(value.output_resource_ids)) {
      for (const id of value.output_resource_ids) add(id)
    }
    if (Array.isArray(value.outputResourceIds)) {
      for (const id of value.outputResourceIds) add(id)
    }
    add(value.output_resource_id)
    add(value.outputResourceId)
    if (isRecord(value.work)) visit(value.work)
    if (isRecord(value.result)) visit(value.result)
    for (const key of ['completed', 'failed', 'cancelled', 'pending']) {
      const items = value[key]
      if (Array.isArray(items)) for (const item of items) visit(item)
    }
  }
  visit(parsed)
  if (ids.size === 0) return ''
  return `，输出资源 ${[...ids].map((id) => `#${id}`).join('、')}`
}
