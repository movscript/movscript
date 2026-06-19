import type {
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
} from '@movscript/core/agent/chat'
import type { AppServerJsonRpcMessage } from './appServerRuntimeMapper'

export function appServerAgentRequest(message: AppServerJsonRpcMessage): AgentChatServerRequest | undefined {
  if (message.id === undefined || typeof message.method !== 'string') return undefined
  const params = isRecord(message.params) ? message.params : {}
  const threadId = stringField(params.threadId)
  const turnId = stringField(params.turnId)
  const itemId = stringField(params.itemId) ?? stringField(params.callId)
  return {
    id: String(message.id),
    method: message.method,
    ...(threadId ? { threadId } : {}),
    ...(turnId ? { turnId } : {}),
    ...(itemId ? { itemId } : {}),
    params: message.params,
    raw: message,
  }
}

export function appServerResponseForAgentResponse(
  request: AgentChatServerRequest,
  response: AgentChatServerRequestResponse,
): unknown {
  if (request.method === 'item/commandExecution/requestApproval') {
    return { decision: commandExecutionDecision(response) }
  }
  if (request.method === 'item/fileChange/requestApproval') {
    return { decision: fileChangeDecision(response) }
  }
  if (request.method === 'item/permissions/requestApproval') {
    return permissionsResponse(request, response)
  }
  if (request.method === 'item/tool/requestUserInput') {
    return { answers: userInputAnswers(response) }
  }
  if (request.method === 'mcpServer/elicitation/request') {
    return elicitationResponse(response)
  }
  if (request.method === 'item/tool/call') {
    return dynamicToolResponse(response)
  }
  if (request.method === 'applyPatchApproval' || request.method === 'execCommandApproval') {
    return { decision: reviewDecision(response) }
  }
  return response
}

export function defaultAgentResponseForRequest(request: AgentChatServerRequest): AgentChatServerRequestResponse {
  if (request.method === 'item/tool/call') return { action: 'toolResult', success: false, contentItems: [] }
  if (request.method === 'mcpServer/elicitation/request') return { action: 'elicitation', accepted: false, content: null, meta: null }
  if (request.method === 'item/tool/requestUserInput') return { action: 'answer', answers: {}, text: 'Rejected.' }
  if (request.method === 'item/permissions/requestApproval') return { action: 'reject' }
  return { action: 'reject', reason: 'No UI subscriber handled the request.' }
}

function commandExecutionDecision(response: AgentChatServerRequestResponse): unknown {
  if (response.action === 'approve') {
    if (response.networkPolicyAmendment !== undefined) {
      return { applyNetworkPolicyAmendment: { network_policy_amendment: response.networkPolicyAmendment } }
    }
    if (response.execPolicyAmendment !== undefined) {
      return { acceptWithExecpolicyAmendment: { execpolicy_amendment: response.execPolicyAmendment } }
    }
    return response.scope === 'session' ? 'acceptForSession' : 'accept'
  }
  return response.action === 'cancel' ? 'cancel' : 'decline'
}

function fileChangeDecision(response: AgentChatServerRequestResponse): unknown {
  if (response.action === 'approve') return response.scope === 'session' ? 'acceptForSession' : 'accept'
  return response.action === 'cancel' ? 'cancel' : 'decline'
}

function reviewDecision(response: AgentChatServerRequestResponse): unknown {
  if (response.action === 'approve') {
    if (response.networkPolicyAmendment !== undefined) {
      return { network_policy_amendment: { network_policy_amendment: response.networkPolicyAmendment } }
    }
    if (response.execPolicyAmendment !== undefined) {
      return { approved_execpolicy_amendment: { proposed_execpolicy_amendment: response.execPolicyAmendment } }
    }
    return response.scope === 'session' ? 'approved_for_session' : 'approved'
  }
  return response.action === 'cancel' ? 'abort' : 'denied'
}

function permissionsResponse(
  request: AgentChatServerRequest,
  response: AgentChatServerRequestResponse,
): unknown {
  if (response.action !== 'approve') return { permissions: {}, scope: 'turn' }
  const params = isRecord(request.params) ? request.params : {}
  const permissions = isRecord(response.permissions)
    ? response.permissions
    : isRecord(params.permissions)
      ? params.permissions
      : {}
  return compactParams({
    permissions,
    scope: response.scope ?? 'turn',
    strictAutoReview: response.strictAutoReview,
  })
}

function userInputAnswers(response: AgentChatServerRequestResponse): Record<string, { answers: string[] }> {
  if (response.action !== 'answer') return {}
  const output: Record<string, { answers: string[] }> = {}
  if (response.answers) {
    for (const [key, value] of Object.entries(response.answers)) output[key] = { answers: answerStrings(value) }
  }
  if (response.choiceIds?.length) output.choiceIds = { answers: response.choiceIds }
  if (typeof response.text === 'string') output.text = { answers: [response.text] }
  return output
}

function answerStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (value === undefined || value === null) return []
  return [String(value)]
}

function elicitationResponse(response: AgentChatServerRequestResponse): unknown {
  if (response.action === 'cancel') return { action: 'cancel', content: null, _meta: null }
  if (response.action !== 'elicitation' || !response.accepted) return { action: 'decline', content: null, _meta: null }
  return {
    action: 'accept',
    content: response.content ?? null,
    _meta: response.meta ?? null,
  }
}

function dynamicToolResponse(response: AgentChatServerRequestResponse): unknown {
  if (response.action !== 'toolResult') return { success: false, contentItems: [] }
  return {
    success: response.success,
    contentItems: response.contentItems ?? [],
  }
}

function compactParams<T extends object>(input: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value
  }
  return output as T
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
