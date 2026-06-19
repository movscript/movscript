import type { AgentChatThreadItem } from '@movscript/core/agent/chat'

export interface SdkRuntimeTurnItemMappingInput {
  turnId: string
  result: unknown
}

export function sdkRuntimeTurnItemsFromResult(input: SdkRuntimeTurnItemMappingInput): AgentChatThreadItem[] {
  if (isRecord(input.result) && Array.isArray(input.result.items)) {
    const items = input.result.items
      .map((message, index) => sdkRuntimeThreadItemFromMessage(message, input.turnId, index))
      .filter((item): item is AgentChatThreadItem => Boolean(item))
    if (items.length > 0) return items
  }
  const messages = Array.isArray(input.result) ? input.result : [input.result]
  const items: AgentChatThreadItem[] = []
  for (const [index, message] of messages.entries()) {
    const mapped = sdkRuntimeThreadItemFromMessage(message, input.turnId, index)
    if (mapped) items.push(mapped)
  }
  if (items.length > 0) return items
  return [agentMessageItem(input.turnId, sdkRuntimeTextFromResult(input.result), input.result)]
}

export function sdkRuntimeTextFromResult(result: unknown): string {
  if (typeof result === 'string') return result
  if (isRecord(result)) {
    const finalResponse = stringField(result, 'finalResponse')
      ?? stringField(result, 'final_response')
      ?? stringField(result, 'result')
      ?? stringField(result, 'text')
      ?? textFromContent(result.content)
    if (finalResponse) return finalResponse
  }
  if (Array.isArray(result)) {
    const lastText = result.map(sdkRuntimeTextFromResult).filter(Boolean).at(-1)
    if (lastText) return lastText
  }
  return JSON.stringify(result)
}

export function sdkRuntimeThreadItemFromMessage(message: unknown, turnId: string, index: number): AgentChatThreadItem | null {
  if (typeof message === 'string') return agentMessageItem(turnId, message, message, index)
  if (!isRecord(message)) return null
  const type = stringField(message, 'type') ?? stringField(message, 'role') ?? ''
  const text = stringField(message, 'text')
    ?? stringField(message, 'result')
    ?? stringField(message, 'finalResponse')
    ?? stringField(message, 'final_response')
    ?? textFromContent(message.content)
  if (isReasoningType(type)) {
    return {
      type: 'reasoning',
      id: itemId(turnId, 'reasoning', message, index),
      summary: text ? [text] : [],
      content: [],
      raw: message,
    }
  }
  if (type === 'command_execution') {
    return {
      type: 'commandExecution',
      id: itemId(turnId, 'command', message, index),
      command: stringField(message, 'command') ?? '',
      status: stringField(message, 'status') ?? undefined,
      aggregatedOutput: stringField(message, 'aggregated_output') ?? stringField(message, 'aggregatedOutput') ?? null,
      exitCode: numberField(message, 'exit_code') ?? numberField(message, 'exitCode') ?? null,
      raw: message,
    }
  }
  if (type === 'file_change') {
    return {
      type: 'fileChange',
      id: itemId(turnId, 'file_change', message, index),
      status: stringField(message, 'status') ?? undefined,
      changes: Array.isArray(message.changes) ? message.changes : undefined,
      raw: message,
    }
  }
  if (type === 'mcp_tool_call') {
    return {
      type: 'mcpToolCall',
      id: itemId(turnId, 'tool', message, index),
      server: stringField(message, 'server') ?? 'sdk',
      tool: stringField(message, 'tool') ?? stringField(message, 'name') ?? 'tool',
      status: stringField(message, 'status') ?? undefined,
      arguments: message.arguments,
      result: message.result,
      error: message.error,
      raw: message,
    }
  }
  if (type === 'web_search') {
    return {
      type: 'webSearch',
      id: itemId(turnId, 'web_search', message, index),
      query: stringField(message, 'query') ?? '',
      raw: message,
    }
  }
  if (type === 'todo_list') {
    const items = Array.isArray(message.items)
      ? message.items.map((item) => isRecord(item) ? {
          text: stringField(item, 'text') ?? '',
          status: Boolean(item.completed) ? 'completed' : 'pending',
          raw: item,
        } : {
          text: String(item),
          status: 'pending',
          raw: item,
        })
      : []
    return {
      type: 'plan',
      id: itemId(turnId, 'todo', message, index),
      text: items.map((item) => item.text).filter(Boolean).join('\n'),
      items,
      raw: message,
    }
  }
  if (isToolType(type)) {
    const name = stringField(message, 'name') ?? stringField(message, 'tool') ?? 'tool'
    const server = stringField(message, 'server') ?? stringField(message, 'mcpServer') ?? 'sdk'
    return {
      type: 'mcpToolCall',
      id: itemId(turnId, 'tool', message, index),
      server,
      tool: name,
      status: stringField(message, 'status') ?? 'completed',
      arguments: message.input ?? message.arguments,
      result: message.result ?? message.output ?? message.content,
      raw: message,
    }
  }
  if (isSystemType(type)) {
    return {
      type: 'systemNotice',
      id: itemId(turnId, 'notice', message, index),
      level: type.includes('error') ? 'error' : type.includes('warning') ? 'warning' : 'info',
      title: text ?? stringField(message, 'message') ?? 'SDK runtime notice',
      raw: message,
    }
  }
  if (text) return agentMessageItem(turnId, text, message, index)
  return null
}

function agentMessageItem(turnId: string, text: string, raw: unknown, index = 0): AgentChatThreadItem {
  return {
    type: 'agentMessage',
    id: itemId(turnId, 'assistant', raw, index),
    text,
    phase: null,
    memoryCitation: null,
    raw,
  }
}

function itemId(turnId: string, prefix: string, raw: unknown, index: number): string {
  if (isRecord(raw)) {
    const id = stringField(raw, 'id') ?? stringField(raw, 'uuid') ?? stringField(raw, 'messageId')
    if (id) return id
  }
  return `${turnId}_${prefix}_${index}`
}

function isReasoningType(type: string): boolean {
  return /reasoning|thinking|summary/i.test(type)
}

function isToolType(type: string): boolean {
  return /tool|mcp|function/i.test(type)
}

function isSystemType(type: string): boolean {
  return /system|error|warning|notice|hook/i.test(type)
}

function textFromContent(content: unknown): string | undefined {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  const parts = content
    .map((item) => {
      if (typeof item === 'string') return item
      if (!isRecord(item)) return ''
      return stringField(item, 'text') ?? stringField(item, 'content') ?? ''
    })
    .filter(Boolean)
  return parts.length > 0 ? parts.join('\n') : undefined
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function numberField(record: Record<string, unknown>, field: string): number | undefined {
  const value = record[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
