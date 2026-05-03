import type { JSONValue } from '../types.js'
import { parseToolResult } from './context.js'
import { formatMemoryBlock } from './planner.js'
import type { AgentMemory } from './memory/types.js'
import type { ToolCall, ToolCallOutcome } from './types.js'

export function buildAssistantContent(
  userMessage: string,
  toolResults: ToolCallOutcome[],
  warnings: string[] = [],
  memories: AgentMemory[] = [],
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
