import {
  type RuntimeModelChatMessage,
  type RuntimeModelChatToolCall,
} from '../../config/modelConfig.js'
import { runtimeModelTextContent } from '../../../messages/model/modelMessage.js'
import { isJSONRecord } from '../../../shared/json/jsonValue.js'
import type { ModelCallResult } from '../modelClient.js'
import { numericValue, stringValue } from './values.js'

export function normalizeOpenAIResponsesResult(response: unknown): Omit<ModelCallResult, 'trace'> {
  const record = isJSONRecord(response) ? response : {}
  const output = Array.isArray(record.output) ? record.output : []
  const contentParts: string[] = []
  const toolCalls: RuntimeModelChatToolCall[] = []
  for (const item of output) {
    const itemRecord = isJSONRecord(item) ? item : undefined
    if (!itemRecord) continue
    if (itemRecord.type === 'message') {
      for (const block of Array.isArray(itemRecord.content) ? itemRecord.content : []) {
        const blockRecord = isJSONRecord(block) ? block : undefined
        const text = stringValue(blockRecord?.text)
        if (text) contentParts.push(text)
      }
      continue
    }
    if (itemRecord.type === 'function_call') {
      const id = stringValue(itemRecord.call_id) || stringValue(itemRecord.id)
      const name = stringValue(itemRecord.name)
      if (!id || !name) continue
      toolCalls.push({
        id,
        type: 'function',
        function: {
          name,
          arguments: stringValue(itemRecord.arguments) || '{}',
        },
      })
    }
  }
  const content = typeof record.output_text === 'string' && record.output_text.trim()
    ? record.output_text.trim()
    : contentParts.join('').trim() || null
  const usage = isJSONRecord(record.usage) ? record.usage : undefined
  const rawAssistantMessage: RuntimeModelChatMessage = {
    role: 'assistant',
    content: content ? runtimeModelTextContent(content) : [],
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  }
  return {
    content,
    tool_calls: toolCalls,
    finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    usage: usage ? {
      input_tokens: numericValue(usage.input_tokens),
      output_tokens: numericValue(usage.output_tokens),
    } : undefined,
    rawAssistantMessage,
  }
}

export function normalizeAnthropicMessagesResult(response: unknown): Omit<ModelCallResult, 'trace'> {
  const record = isJSONRecord(response) ? response : {}
  const contentBlocks = Array.isArray(record.content) ? record.content : []
  const contentParts: string[] = []
  const toolCalls: RuntimeModelChatToolCall[] = []
  for (const block of contentBlocks) {
    const blockRecord = isJSONRecord(block) ? block : undefined
    if (!blockRecord) continue
    if (blockRecord.type === 'text') {
      const text = stringValue(blockRecord.text)
      if (text) contentParts.push(text)
      continue
    }
    if (blockRecord.type === 'tool_use') {
      const id = stringValue(blockRecord.id)
      const name = stringValue(blockRecord.name)
      if (!id || !name) continue
      toolCalls.push({
        id,
        type: 'function',
        function: {
          name,
          arguments: JSON.stringify(blockRecord.input ?? {}),
        },
      })
    }
  }
  const content = contentParts.join('').trim() || null
  const usage = isJSONRecord(record.usage) ? record.usage : undefined
  const rawAssistantMessage: RuntimeModelChatMessage = {
    role: 'assistant',
    content: content ? runtimeModelTextContent(content) : [],
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  }
  return {
    content,
    tool_calls: toolCalls,
    finish_reason: toolCalls.length > 0 ? 'tool_calls' : stringValue(record.stop_reason) || 'stop',
    usage: usage ? {
      input_tokens: numericValue(usage.input_tokens),
      output_tokens: numericValue(usage.output_tokens),
    } : undefined,
    rawAssistantMessage,
  }
}
