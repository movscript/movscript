import { createHash } from 'node:crypto'
import type { AnsweredRunInputInteraction } from '../../state/runInteractionState.js'
import type { AgentApprovalRequest, AgentInputRequest, JSONValue } from '../../state/types.js'

export function summarizeApprovalRequestsTrace(approvals: AgentApprovalRequest[]): Record<string, JSONValue> {
  return {
    schema: 'movscript.approval-trace-summary.v1',
    total: approvals.length,
    pendingCount: approvals.filter((approval) => approval.status === 'pending').length,
    approvedCount: approvals.filter((approval) => approval.status === 'approved').length,
    rejectedCount: approvals.filter((approval) => approval.status === 'rejected').length,
    records: approvals.map(summarizeApprovalRequest),
  }
}

export function summarizeInputRequestsTrace(requests: AgentInputRequest[]): Record<string, JSONValue> {
  return {
    schema: 'movscript.input-request-trace-summary.v1',
    total: requests.length,
    pendingCount: requests.filter((request) => request.status === 'pending').length,
    answeredCount: requests.filter((request) => request.status === 'answered').length,
    cancelledCount: requests.filter((request) => request.status === 'cancelled').length,
    records: requests.map(summarizeInputRequest),
  }
}

export function summarizeInputAnswerTrace(answer: AnsweredRunInputInteraction): Record<string, JSONValue> {
  return omitUndefinedJSON({
    schema: 'movscript.input-answer-trace-summary.v1',
    requestId: answer.request.id,
    inputType: answer.request.inputType,
    choiceIds: answer.choiceIds,
    choiceCount: answer.choiceIds.length,
    ...(answer.text ? summarizeTextPayload('text', answer.text) : {}),
    request: summarizeInputRequest(answer.request),
  })
}

function summarizeApprovalRequest(approval: AgentApprovalRequest): Record<string, JSONValue> {
  return omitUndefinedJSON({
    id: approval.id,
    runId: approval.runId,
    interactionId: approval.interactionId,
    displayThreadId: approval.displayThreadId,
    displayAnchor: approval.displayAnchor,
    toolName: approval.toolName,
    risk: approval.risk,
    permission: approval.permission,
    status: approval.status,
    createdAt: approval.createdAt,
    updatedAt: approval.updatedAt,
    approvedAt: approval.approvedAt,
    rejectedAt: approval.rejectedAt,
    ...summarizeTextPayload('reason', approval.reason),
    ...(approval.args !== undefined ? summarizeJSONPayload('args', approval.args) : {}),
    ...(approval.preview !== undefined ? summarizeJSONPayload('preview', approval.preview) : {}),
  })
}

function summarizeInputRequest(request: AgentInputRequest): Record<string, JSONValue> {
  return omitUndefinedJSON({
    id: request.id,
    runId: request.runId,
    displayThreadId: request.displayThreadId,
    displayAnchor: request.displayAnchor,
    inputType: request.inputType,
    allowCustomAnswer: request.allowCustomAnswer,
    choiceCount: request.choices.length,
    choiceIds: request.choices.map((choice) => choice.id),
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    answeredAt: request.answeredAt,
    ...summarizeTextPayload('title', request.title),
    ...(request.summary ? summarizeTextPayload('summary', request.summary) : {}),
    ...summarizeTextPayload('question', request.question),
    ...(request.answer?.choiceIds ? { answerChoiceIds: request.answer.choiceIds } : {}),
    ...(request.answer?.text ? summarizeTextPayload('answerText', request.answer.text) : {}),
  })
}

function summarizeTextPayload(prefix: string, value: string): Record<string, JSONValue> {
  return {
    [`${prefix}Hash`]: hashString(value),
    [`${prefix}Chars`]: value.length,
    [`${prefix}Mode`]: 'summary',
  }
}

function summarizeJSONPayload(prefix: string, value: JSONValue): Record<string, JSONValue> {
  const json = stableStringify(value)
  return {
    [`${prefix}Hash`]: hashString(json),
    [`${prefix}Chars`]: json.length,
    [`${prefix}Mode`]: 'summary',
  }
}

function omitUndefinedJSON(input: Record<string, unknown>): Record<string, JSONValue> {
  const output: Record<string, JSONValue> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    output[key] = toJSONValue(value)
  }
  return output
}

function toJSONValue(value: unknown): JSONValue {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(toJSONValue)
  if (value && typeof value === 'object') return omitUndefinedJSON(value as Record<string, unknown>)
  return null
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableJSON(value))
}

function stableJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJSON)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableJSON(item)]),
  )
}

function hashString(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
