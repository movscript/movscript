import { isJSONRecord } from '../jsonValue.js'
import type { AgentInputRequest, JSONValue } from '../state/types.js'

export type AgentGraphMakeId = (prefix: string) => string

export function buildModelRetryInputRequest(runId: string, message: string, makeId: AgentGraphMakeId): AgentInputRequest {
  const now = new Date().toISOString()
  return {
    id: makeId('input_model_retry'),
    runId,
    title: '模型调用需要恢复',
    summary: `模型请求没有完成：${message}`,
    question: '修复登录状态或模型配置后，继续当前 run。',
    inputType: 'confirmation',
    choices: [{
      id: 'retry',
      label: '修复后重试',
      description: '使用当前登录状态和模型配置继续这个 run。',
    }],
    allowCustomAnswer: false,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }
}

export function buildInputRequest(runId: string, args: Record<string, JSONValue>, makeId: AgentGraphMakeId): AgentInputRequest {
  const now = new Date().toISOString()
  const choices = normalizeChoices(args.choices)
  const inputType = args.inputType === 'text' || args.inputType === 'confirmation' || args.inputType === 'choice'
    ? args.inputType
    : choices.length > 0 ? 'choice' : 'text'
  return {
    id: makeId('input'),
    runId,
    title: normalizeText(args.title) ?? normalizeText(args.header) ?? '需要补充信息',
    ...(normalizeText(args.summary) ?? normalizeText(args.description) ? { summary: normalizeText(args.summary) ?? normalizeText(args.description) } : {}),
    question: normalizeText(args.question) ?? '请补充必要信息后继续。',
    inputType,
    choices,
    allowCustomAnswer: args.allowCustomAnswer !== false,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeChoices(value: JSONValue | undefined): AgentInputRequest['choices'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (typeof item === 'string' && item.trim()) {
      return [{ id: `choice_${index + 1}`, label: item.trim() }]
    }
    if (!isJSONRecord(item)) return []
    const label = normalizeText(item.label)
    if (!label) return []
    return [{
      id: normalizeText(item.id) ?? `choice_${index + 1}`,
      label,
      ...(normalizeText(item.description) ? { description: normalizeText(item.description) } : {}),
    }]
  })
}

function normalizeText(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}
