import type {
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
} from './agentChatProtocol.js'
import { agentChatElicitationFormModel } from './agentChatServerRequestForms.js'

export const MOVSCRIPT_DECISION_REQUEST_METHOD = 'movscript/decision/request'

export type MovScriptAgentDecision = 'adopt' | 'reject' | 'defer'

export type AgentChatServerRequestView = {
  title: string
  meta: string[]
  summary: string[]
  argumentDetails?: unknown
  requestDetails: unknown
  externalUrl?: string
  canAnswer: boolean
  canElicit: boolean
  canSubmitToolResult: boolean
  canCancel: boolean
  canReject: boolean
  canApprove: boolean
  canApproveForSession: boolean
  canApproveWithExecPolicyAmendment: boolean
  canApproveWithStrictAutoReview: boolean
  networkPolicyAmendments: unknown[]
}

export type AgentChatServerRequestAction =
  | { type: 'approve' }
  | { type: 'approveForSession' }
  | { type: 'approveWithExecPolicyAmendment' }
  | { type: 'approveWithNetworkPolicyAmendment'; amendmentIndex: number }
  | { type: 'approveWithStrictAutoReview' }
  | { type: 'cancel' }
  | { type: 'reject' }

export function agentChatServerRequestView(request: AgentChatServerRequest): AgentChatServerRequestView {
  return {
    title: agentChatServerRequestTitle(request),
    meta: agentChatServerRequestMeta(request),
    summary: agentChatServerRequestSummary(request),
    ...(agentChatServerRequestArgumentDetails(request) !== undefined ? { argumentDetails: agentChatServerRequestArgumentDetails(request) } : {}),
    requestDetails: request.params,
    ...(agentChatServerRequestExternalUrl(request) ? { externalUrl: agentChatServerRequestExternalUrl(request) } : {}),
    canAnswer: agentChatServerRequestCanAnswer(request),
    canElicit: agentChatServerRequestCanElicit(request),
    canSubmitToolResult: agentChatServerRequestCanSubmitToolResult(request),
    canCancel: agentChatServerRequestCanCancel(request),
    canReject: agentChatServerRequestCanReject(request),
    canApprove: agentChatServerRequestCanApprove(request),
    canApproveForSession: agentChatServerRequestCanApproveForSession(request),
    canApproveWithExecPolicyAmendment: agentChatServerRequestCanApproveWithExecPolicyAmendment(request),
    canApproveWithStrictAutoReview: agentChatServerRequestCanApproveWithStrictAutoReview(request),
    networkPolicyAmendments: agentChatServerRequestNetworkPolicyAmendments(request),
  }
}

export function agentChatServerRequestTitle(request: AgentChatServerRequest): string {
  if (request.method === 'item/commandExecution/requestApproval') return 'Command approval required'
  if (request.method === 'item/fileChange/requestApproval') return 'File change approval required'
  if (request.method === 'item/permissions/requestApproval') return 'Permission approval required'
  if (request.method === 'item/tool/requestUserInput') return 'Input required'
  if (request.method === 'mcpServer/elicitation/request') return 'MCP input required'
  if (request.method === MOVSCRIPT_DECISION_REQUEST_METHOD) return 'MovScript decision required'
  if (request.method === 'item/tool/call') return 'Tool call requested'
  if (request.method === 'applyPatchApproval') return 'Patch approval required'
  if (request.method === 'execCommandApproval') return 'Command approval required'
  if (request.method === 'account/chatgptAuthTokens/refresh') return 'ChatGPT token refresh required'
  if (request.method === 'attestation/generate') return 'Client attestation requested'
  return 'Agent request'
}

export function agentChatServerRequestCanApprove(request: AgentChatServerRequest): boolean {
  return request.method === 'item/commandExecution/requestApproval'
    || request.method === 'item/fileChange/requestApproval'
    || request.method === 'item/permissions/requestApproval'
    || mcpElicitationRequestCanAcceptWithoutContent(request)
    || request.method === 'applyPatchApproval'
    || request.method === 'execCommandApproval'
}

export function agentChatServerRequestCanReject(request: AgentChatServerRequest): boolean {
  return agentChatServerRequestCanApprove(request)
    || (agentChatServerRequestCanAnswer(request) && request.method !== MOVSCRIPT_DECISION_REQUEST_METHOD)
    || request.method === 'mcpServer/elicitation/request'
    || agentChatServerRequestCanSubmitToolResult(request)
    || request.method === 'account/chatgptAuthTokens/refresh'
    || request.method === 'attestation/generate'
}

export function agentChatServerRequestCanAnswer(request: AgentChatServerRequest): boolean {
  return request.method === 'item/tool/requestUserInput'
    || request.method === MOVSCRIPT_DECISION_REQUEST_METHOD
}

export function agentChatServerRequestCanElicit(request: AgentChatServerRequest): boolean {
  const params = isRecord(request.params) ? request.params : {}
  return request.method === 'mcpServer/elicitation/request' && (params.mode === 'form' || params.mode === 'openai/form')
}

export function agentChatServerRequestCanSubmitToolResult(request: AgentChatServerRequest): boolean {
  return request.method === 'item/tool/call'
}

export function agentChatServerRequestExternalUrl(request: AgentChatServerRequest): string | undefined {
  const params = isRecord(request.params) ? request.params : {}
  if (request.method === 'mcpServer/elicitation/request' && params.mode === 'url') return stringField(params.url)
  return undefined
}

export function agentChatApproveResponse(request: AgentChatServerRequest): AgentChatServerRequestResponse {
  if (request.method === 'mcpServer/elicitation/request') return { action: 'elicitation', accepted: true, content: null, meta: null }
  if (request.method === 'item/permissions/requestApproval') {
    const params = isRecord(request.params) ? request.params : {}
    return {
      action: 'approve',
      permissions: isRecord(params.permissions) ? params.permissions : {},
      scope: 'turn',
      strictAutoReview: false,
    }
  }
  if (request.method === 'item/tool/call') return { action: 'toolResult', success: true, contentItems: [] }
  return { action: 'approve' }
}

export function agentChatServerRequestResponseForAction(
  request: AgentChatServerRequest,
  action: AgentChatServerRequestAction,
): AgentChatServerRequestResponse | undefined {
  if (action.type === 'reject') return agentChatServerRequestCanReject(request) ? agentChatRejectResponse(request) : undefined
  if (action.type === 'approve') return agentChatServerRequestCanApprove(request) ? agentChatApproveResponse(request) : undefined
  if (action.type === 'approveForSession') return agentChatServerRequestCanApproveForSession(request) ? agentChatApproveForSessionResponse(request) : undefined
  if (action.type === 'approveWithExecPolicyAmendment') return agentChatServerRequestCanApproveWithExecPolicyAmendment(request) ? agentChatApproveWithExecPolicyAmendmentResponse(request) : undefined
  if (action.type === 'approveWithNetworkPolicyAmendment') {
    return agentChatServerRequestNetworkPolicyAmendments(request)[action.amendmentIndex] !== undefined
      ? agentChatApproveWithNetworkPolicyAmendmentResponse(request, action.amendmentIndex)
      : undefined
  }
  if (action.type === 'approveWithStrictAutoReview') return agentChatServerRequestCanApproveWithStrictAutoReview(request) ? agentChatApproveWithStrictAutoReviewResponse(request) : undefined
  if (action.type === 'cancel') return agentChatServerRequestCanCancel(request) ? agentChatCancelResponse(request) : undefined
  return undefined
}

export function agentChatServerRequestCanApproveForSession(request: AgentChatServerRequest): boolean {
  return request.method === 'item/commandExecution/requestApproval'
    || request.method === 'item/fileChange/requestApproval'
    || permissionApprovalRequestHasProfile(request)
    || request.method === 'applyPatchApproval'
    || request.method === 'execCommandApproval'
}

export function agentChatApproveForSessionResponse(request: AgentChatServerRequest): AgentChatServerRequestResponse {
  if (permissionApprovalRequestHasProfile(request)) {
    const params = isRecord(request.params) ? request.params : {}
    return {
      action: 'approve',
      permissions: params.permissions as Record<string, unknown>,
      scope: 'session',
      strictAutoReview: false,
    }
  }
  return agentChatServerRequestCanApproveForSession(request)
    ? { action: 'approve', scope: 'session' }
    : agentChatApproveResponse(request)
}

export function agentChatServerRequestCanApproveWithStrictAutoReview(request: AgentChatServerRequest): boolean {
  return permissionApprovalRequestHasProfile(request)
}

export function agentChatApproveWithStrictAutoReviewResponse(request: AgentChatServerRequest): AgentChatServerRequestResponse {
  if (!permissionApprovalRequestHasProfile(request)) return agentChatApproveResponse(request)
  const params = isRecord(request.params) ? request.params : {}
  return {
    action: 'approve',
    permissions: params.permissions as Record<string, unknown>,
    scope: 'turn',
    strictAutoReview: true,
  }
}

export function agentChatServerRequestCanApproveWithExecPolicyAmendment(request: AgentChatServerRequest): boolean {
  const params = isRecord(request.params) ? request.params : {}
  return (request.method === 'item/commandExecution/requestApproval' || request.method === 'execCommandApproval' || request.method === 'applyPatchApproval')
    && Array.isArray(params.proposedExecpolicyAmendment)
    && params.proposedExecpolicyAmendment.every((item) => typeof item === 'string')
}

export function agentChatApproveWithExecPolicyAmendmentResponse(request: AgentChatServerRequest): AgentChatServerRequestResponse {
  const params = isRecord(request.params) ? request.params : {}
  return agentChatServerRequestCanApproveWithExecPolicyAmendment(request)
    ? { action: 'approve', execPolicyAmendment: params.proposedExecpolicyAmendment }
    : agentChatApproveResponse(request)
}

export function agentChatServerRequestNetworkPolicyAmendments(request: AgentChatServerRequest): unknown[] {
  const params = isRecord(request.params) ? request.params : {}
  return (request.method === 'item/commandExecution/requestApproval' || request.method === 'execCommandApproval' || request.method === 'applyPatchApproval') && Array.isArray(params.proposedNetworkPolicyAmendments)
    ? params.proposedNetworkPolicyAmendments
    : []
}

export function agentChatApproveWithNetworkPolicyAmendmentResponse(
  request: AgentChatServerRequest,
  amendmentIndex: number,
): AgentChatServerRequestResponse {
  const amendment = agentChatServerRequestNetworkPolicyAmendments(request)[amendmentIndex]
  return amendment !== undefined
    ? { action: 'approve', networkPolicyAmendment: amendment }
    : agentChatApproveResponse(request)
}

export function agentChatServerRequestCanCancel(request: AgentChatServerRequest): boolean {
  return request.method === 'item/commandExecution/requestApproval'
    || request.method === 'item/fileChange/requestApproval'
    || request.method === 'mcpServer/elicitation/request'
    || request.method === 'applyPatchApproval'
    || request.method === 'execCommandApproval'
}

export function agentChatCancelResponse(request: AgentChatServerRequest): AgentChatServerRequestResponse {
  return { action: 'cancel' }
}

export function agentChatToolResultResponse(
  request: AgentChatServerRequest,
  input: { success: boolean; contentItems?: unknown[] },
): AgentChatServerRequestResponse {
  if (request.method !== 'item/tool/call') return { action: 'toolResult', success: input.success, contentItems: input.contentItems ?? [] }
  return {
    action: 'toolResult',
    success: input.success,
    contentItems: input.contentItems ?? [],
  }
}

export function agentChatElicitationResponse(
  request: AgentChatServerRequest,
  input: { accepted: boolean; content?: unknown; meta?: unknown },
): AgentChatServerRequestResponse {
  if (request.method !== 'mcpServer/elicitation/request') {
    return { action: 'elicitation', accepted: input.accepted, content: input.content ?? null, meta: input.meta ?? null }
  }
  return {
    action: 'elicitation',
    accepted: input.accepted,
    content: input.accepted ? input.content ?? null : null,
    meta: input.accepted ? input.meta ?? null : null,
  }
}

export function agentChatAnswerResponse(
  request: AgentChatServerRequest,
  input: { answers?: Record<string, unknown>; choiceIds?: string[]; text?: string },
): AgentChatServerRequestResponse {
  if (request.method === MOVSCRIPT_DECISION_REQUEST_METHOD) {
    return agentChatMovScriptDecisionResponse(request, movScriptDecisionFromAnswerInput(input))
  }
  if (request.method !== 'item/tool/requestUserInput') return { action: 'answer', answers: input.answers ?? {} }
  return {
    action: 'answer',
    ...(input.answers ? { answers: input.answers } : {}),
    ...(input.choiceIds && input.choiceIds.length > 0 ? { choiceIds: input.choiceIds } : {}),
    ...(typeof input.text === 'string' ? { text: input.text } : {}),
  }
}

export function agentChatRejectResponse(request: AgentChatServerRequest): AgentChatServerRequestResponse {
  if (request.method === 'mcpServer/elicitation/request') return { action: 'elicitation', accepted: false, content: null, meta: null }
  if (request.method === MOVSCRIPT_DECISION_REQUEST_METHOD) return agentChatMovScriptDecisionResponse(request, 'reject')
  if (request.method === 'item/tool/requestUserInput') return { action: 'answer', answers: {}, text: 'Rejected.' }
  if (request.method === 'item/tool/call') return { action: 'toolResult', success: false, contentItems: [] }
  return { action: 'reject' }
}

export function agentChatServerRequestMeta(request: AgentChatServerRequest): string[] {
  return [
    request.method,
    request.threadId ? `thread ${request.threadId}` : '',
    request.turnId ? `turn ${request.turnId}` : '',
    request.itemId ? `item ${request.itemId}` : '',
  ].filter((value) => value.trim())
}

export function agentChatServerRequestSummary(request: AgentChatServerRequest): string[] {
  const params = isRecord(request.params) ? request.params : {}
  if (request.method === 'item/commandExecution/requestApproval') {
    const networkApprovalContext = isRecord(params.networkApprovalContext) ? params.networkApprovalContext : null
    const commandActions = Array.isArray(params.commandActions) ? params.commandActions : []
    const proposedNetworkPolicyAmendments = Array.isArray(params.proposedNetworkPolicyAmendments) ? params.proposedNetworkPolicyAmendments : []
    const networkSummary = networkApprovalContext
      ? [stringField(networkApprovalContext.protocol), stringField(networkApprovalContext.host)].filter(Boolean).join('://')
      : ''
    return compactStrings([
      stringField(params.command),
      stringField(params.cwd) ? `cwd: ${stringField(params.cwd)}` : '',
      stringField(params.reason) ? `reason: ${stringField(params.reason)}` : '',
      commandActions.length ? `${commandActions.length} command action(s)` : '',
      ...commandActions.slice(0, 4).map((action, index) => agentChatServerRequestCommandActionSummary(action, index)),
      networkSummary ? `network: ${networkSummary}` : '',
      execPolicyAmendmentSummary(params.proposedExecpolicyAmendment),
      proposedNetworkPolicyAmendments.length ? `${proposedNetworkPolicyAmendments.length} network policy amendment(s)` : '',
      ...proposedNetworkPolicyAmendments.slice(0, 4).map((amendment, index) => networkPolicyAmendmentSummary(amendment, index)),
    ])
  }
  if (request.method === 'execCommandApproval') {
    return compactStrings([
      Array.isArray(params.command) ? params.command.filter((item): item is string => typeof item === 'string').join(' ') : '',
      stringField(params.cwd) ? `cwd: ${stringField(params.cwd)}` : '',
      stringField(params.reason) ? `reason: ${stringField(params.reason)}` : '',
    ])
  }
  if (request.method === 'item/fileChange/requestApproval') {
    return compactStrings([
      stringField(params.reason) ? `reason: ${stringField(params.reason)}` : '',
      stringField(params.grantRoot) ? `grant root: ${stringField(params.grantRoot)}` : '',
    ])
  }
  if (request.method === 'applyPatchApproval') {
    const fileChangeSummaries = agentChatServerRequestFileChangeSummaries(params.fileChanges)
    return compactStrings([
      stringField(params.callId) ? `call: ${stringField(params.callId)}` : '',
      stringField(params.reason) ? `reason: ${stringField(params.reason)}` : '',
      stringField(params.grantRoot) ? `grant root: ${stringField(params.grantRoot)}` : '',
      fileChangeSummaries.count ? `${fileChangeSummaries.count} file change(s)` : '',
      ...fileChangeSummaries.items,
    ])
  }
  if (request.method === 'item/permissions/requestApproval') {
    const permissionSummaries = agentChatServerRequestPermissionSummaries(params.permissions)
    const actionSummaries = agentChatServerRequestApprovalActionSummaries(params.action, request.itemId)
    return compactStrings([
      stringField(params.toolName) ?? stringField(params.action),
      stringField(params.cwd) ? `cwd: ${stringField(params.cwd)}` : '',
      stringField(params.environmentId) ? `environment: ${stringField(params.environmentId)}` : '',
      stringField(params.reason) ? `reason: ${stringField(params.reason)}` : '',
      stringField(params.risk) ? `risk: ${stringField(params.risk)}` : '',
      stringField(params.permission) ? `permission: ${stringField(params.permission)}` : '',
      stringField(params.interactionId) ? `interaction: ${stringField(params.interactionId)}` : '',
      ...actionSummaries,
      ...agentChatServerRequestArgumentSummaries(params.args),
      ...agentChatServerRequestPreviewSummaries(params.preview),
      ...permissionSummaries,
    ])
  }
  if (request.method === 'item/tool/requestUserInput') {
    const questions = Array.isArray(params.questions) ? params.questions : []
    if (questions.length) return [
      `${questions.length} question(s)`,
      ...questions.slice(0, 4).map((question, index) => agentChatServerRequestQuestionSummary(question, index)),
    ]
    const choices = Array.isArray(params.choices) ? params.choices : []
    return compactStrings([
      stringField(params.title),
      stringField(params.summary) ? `summary: ${stringField(params.summary)}` : '',
      stringField(params.question),
      stringField(params.inputType) ? `input: ${stringField(params.inputType)}` : '',
      stringField(params.interactionId) ? `interaction: ${stringField(params.interactionId)}` : '',
      choices.length ? `${choices.length} choice(s)` : '',
      params.allowCustomAnswer === true ? 'custom answer allowed' : '',
    ])
  }
  if (request.method === MOVSCRIPT_DECISION_REQUEST_METHOD) {
    const resourceId = resourceIdField(params.resourceId ?? params.resource_id)
    return compactStrings([
      stringField(params.title),
      stringField(params.summary) ? `summary: ${stringField(params.summary)}` : '',
      stringField(params.question),
      stringField(params.projectId ?? params.project_id) ? `project: ${stringField(params.projectId ?? params.project_id)}` : '',
      stringField(params.contentUnitId ?? params.content_unit_id) ? `content unit: ${stringField(params.contentUnitId ?? params.content_unit_id)}` : '',
      stringField(params.candidateId ?? params.candidate_id) ? `candidate: ${stringField(params.candidateId ?? params.candidate_id)}` : '',
      resourceId !== undefined ? `resource: ${resourceId}` : '',
      stringField(params.targetKind ?? params.target_kind) ? `target: ${stringField(params.targetKind ?? params.target_kind)}` : '',
      stringField(params.targetPath ?? params.target_path) ? `path: ${stringField(params.targetPath ?? params.target_path)}` : '',
    ])
  }
  if (request.method === 'mcpServer/elicitation/request') {
    return compactStrings([
      stringField(params.serverName) ? `server: ${stringField(params.serverName)}` : stringField(params.server) ? `server: ${stringField(params.server)}` : '',
      stringField(params.mode) ? `mode: ${stringField(params.mode)}` : '',
      stringField(params.elicitationId) ? `elicitation: ${stringField(params.elicitationId)}` : '',
      stringField(params.message),
      stringField(params.url) ? `url: ${stringField(params.url)}` : '',
      stringField(params.mode) === 'url' ? 'URL elicitation requires external completion' : '',
      stringField(params.mode) === 'url' ? 'generic Agent Chat cannot complete this URL elicitation inline' : '',
    ])
  }
  if (request.method === 'item/tool/call') {
    return compactStrings([
      [stringField(params.namespace), stringField(params.tool)].filter(Boolean).join('/'),
      stringField(params.callId) ? `call: ${stringField(params.callId)}` : '',
      ...agentChatServerRequestArgumentSummaries(params.arguments),
    ])
  }
  if (request.method === 'account/chatgptAuthTokens/refresh') {
    return compactStrings([
      stringField(params.reason) ? `reason: ${stringField(params.reason)}` : '',
      stringField(params.previousAccountId) ? `account: ${stringField(params.previousAccountId)}` : '',
      'managed ChatGPT token refresh required',
      'generic Agent Chat can only reject this request',
    ])
  }
  if (request.method === 'attestation/generate') {
    return [
      'managed client attestation required',
      'generic Agent Chat can only reject this request',
    ]
  }
  return []
}

export function agentChatServerRequestArgumentDetails(request: AgentChatServerRequest): unknown | undefined {
  const params = isRecord(request.params) ? request.params : {}
  if (request.method === 'item/permissions/requestApproval') return params.args
  if (request.method === MOVSCRIPT_DECISION_REQUEST_METHOD) return params
  if (request.method !== 'item/tool/call') return undefined
  return params.arguments
}

export function agentChatMovScriptDecisionResponse(
  request: AgentChatServerRequest,
  decision: MovScriptAgentDecision,
  reason?: string,
): AgentChatServerRequestResponse {
  const params = isRecord(request.params) ? request.params : {}
  const resourceId = resourceIdField(params.resourceId ?? params.resource_id)
  return {
    action: 'decision',
    decision,
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
    metadata: {
      requestId: request.id,
      ...(stringField(params.projectId ?? params.project_id) ? { projectId: stringField(params.projectId ?? params.project_id) } : {}),
      ...(stringField(params.contentUnitId ?? params.content_unit_id) ? { contentUnitId: stringField(params.contentUnitId ?? params.content_unit_id) } : {}),
      ...(stringField(params.candidateId ?? params.candidate_id) ? { candidateId: stringField(params.candidateId ?? params.candidate_id) } : {}),
      ...(resourceId !== undefined ? { resourceId } : {}),
      ...(stringField(params.targetKind ?? params.target_kind) ? { targetKind: stringField(params.targetKind ?? params.target_kind) } : {}),
      ...(stringField(params.targetPath ?? params.target_path) ? { targetPath: stringField(params.targetPath ?? params.target_path) } : {}),
    },
  }
}

function movScriptDecisionFromAnswerInput(input: { choiceIds?: string[]; text?: string }): MovScriptAgentDecision {
  const value = [...(input.choiceIds ?? []), input.text]
    .find((item): item is string => typeof item === 'string' && item.trim().length > 0)
    ?.trim()
    .toLowerCase()
  if (value === 'adopt' || value === 'accept' || value === 'select' || value === '采纳') return 'adopt'
  if (value === 'defer' || value === 'pending' || value === '待定') return 'defer'
  return 'reject'
}

function compactStrings(values: Array<string | undefined | null | false>): string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

function permissionApprovalRequestHasProfile(request: AgentChatServerRequest): boolean {
  const params = isRecord(request.params) ? request.params : {}
  return request.method === 'item/permissions/requestApproval' && isRecord(params.permissions)
}

function mcpElicitationRequestCanAcceptWithoutContent(request: AgentChatServerRequest): boolean {
  if (request.method !== 'mcpServer/elicitation/request') return false
  if (!agentChatServerRequestCanElicit(request)) return false
  return agentChatElicitationFormModel(request).fields.length === 0
}

function agentChatServerRequestCommandActionSummary(value: unknown, index: number): string {
  if (!isRecord(value)) return `action ${index + 1}: ${String(value)}`
  const type = stringField(value.type)
  if (type === 'read') {
    return compactStrings([
      `action ${index + 1}: read`,
      stringField(value.name) ? `name=${stringField(value.name)}` : '',
      stringField(value.path) ? `path=${stringField(value.path)}` : '',
      stringField(value.command) ? `command=${stringField(value.command)}` : '',
    ]).join(' ')
  }
  if (type === 'listFiles') {
    return compactStrings([
      `action ${index + 1}: listFiles`,
      stringField(value.path) ? `path=${stringField(value.path)}` : '',
      stringField(value.command) ? `command=${stringField(value.command)}` : '',
    ]).join(' ')
  }
  if (type === 'search') {
    return compactStrings([
      `action ${index + 1}: search`,
      stringField(value.query) ? `query=${stringField(value.query)}` : '',
      stringField(value.path) ? `path=${stringField(value.path)}` : '',
      stringField(value.command) ? `command=${stringField(value.command)}` : '',
    ]).join(' ')
  }
  return compactStrings([
    `action ${index + 1}: ${type ?? 'unknown'}`,
    stringField(value.command) ? `command=${stringField(value.command)}` : '',
  ]).join(' ')
}

function execPolicyAmendmentSummary(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const command = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(' ')
  return command ? `exec policy amendment: ${command}` : ''
}

function networkPolicyAmendmentSummary(value: unknown, index: number): string {
  if (!isRecord(value)) return `network policy ${index + 1}: ${String(value)}`
  const action = stringField(value.action)
  const host = stringField(value.host)
  return compactStrings([
    `network policy ${index + 1}:`,
    action,
    host,
  ]).join(' ')
}

function agentChatServerRequestQuestionSummary(value: unknown, index: number): string {
  if (!isRecord(value)) return `question ${index + 1}: ${String(value)}`
  const header = stringField(value.header)
  const question = stringField(value.question)
  const options = Array.isArray(value.options) ? value.options : []
  return compactStrings([
    `question ${index + 1}:`,
    header ?? question ?? stringField(value.id) ?? 'untitled',
    header && question ? `- ${question}` : '',
    options.length ? `${options.length} option(s)` : 'free text',
    value.isSecret === true ? 'secret' : '',
    value.isOther === true ? 'optional' : 'required',
  ]).join(' ')
}

function agentChatServerRequestFileChangeSummaries(value: unknown): { count: number; items: string[] } {
  const changes = agentChatServerRequestFileChangeEntries(value)
  return {
    count: changes.length,
    items: changes.slice(0, 4).map(({ path, change }, index) => agentChatServerRequestFileChangeSummary(path, change, index)),
  }
}

function agentChatServerRequestFileChangeEntries(value: unknown): Array<{ path: string | null; change: unknown }> {
  if (Array.isArray(value)) {
    return value.map((change) => ({
      path: isRecord(change) ? stringField(change.path) ?? null : null,
      change,
    }))
  }
  if (!isRecord(value)) return []
  return Object.entries(value)
    .filter(([, change]) => change !== undefined)
    .map(([path, change]) => ({ path, change }))
}

function agentChatServerRequestFileChangeSummary(path: string | null, value: unknown, index: number): string {
  if (!isRecord(value)) return compactStrings([`file ${index + 1}:`, path, String(value)]).join(' ')
  const kind = stringField(value.type) ?? stringField(value.kind) ?? 'change'
  const filePath = path ?? stringField(value.path)
  const movePath = stringField(value.move_path) ?? stringField(value.movePath)
  return compactStrings([
    `file ${index + 1}: ${kind}`,
    filePath,
    movePath ? `-> ${movePath}` : '',
  ]).join(' ')
}

function agentChatServerRequestPermissionSummaries(value: unknown): string[] {
  if (!isRecord(value)) return []
  const summaries: string[] = []
  if (isRecord(value.network)) {
    summaries.push(`network: ${value.network.enabled === true ? 'enabled' : value.network.enabled === false ? 'disabled' : 'requested'}`)
  }
  if (isRecord(value.fileSystem)) {
    summaries.push(...agentChatServerRequestFileSystemPermissionSummaries(value.fileSystem))
  }
  return summaries.length ? summaries : ['permissions requested']
}

function agentChatServerRequestApprovalActionSummaries(value: unknown, itemId: string | undefined): string[] {
  if (!isRecord(value)) return []
  const type = stringField(value.type)
  if (type === 'mcpToolCall') {
    return compactStrings([
      'action: mcpToolCall',
      itemId ? `approval for MCP call: ${itemId}` : '',
      stringField(value.server) ? `server: ${stringField(value.server)}` : '',
      stringField(value.toolName) ? `tool: ${stringField(value.toolName)}` : '',
      stringField(value.toolTitle) ? `title: ${stringField(value.toolTitle)}` : '',
      stringField(value.connectorName) ? `connector: ${stringField(value.connectorName)}` : '',
      stringField(value.connectorId) ? `connector id: ${stringField(value.connectorId)}` : '',
    ])
  }
  if (type === 'requestPermissions') {
    return compactStrings([
      'action: requestPermissions',
      stringField(value.reason) ? `action reason: ${stringField(value.reason)}` : '',
    ])
  }
  return type ? [`action: ${type}`] : []
}

function agentChatServerRequestArgumentSummaries(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return [`arguments: ${value.length} item(s)`]
  if (!isRecord(value)) return [`arguments: ${String(value)}`]
  const entries = Object.entries(value)
  if (!entries.length) return ['arguments: empty object']
  const simpleEntries = entries
    .slice(0, 4)
    .map(([key, entryValue]) => `arg ${key}: ${agentChatServerRequestArgumentValueSummary(entryValue)}`)
  return [
    `arguments: ${entries.length} field(s)`,
    ...simpleEntries,
  ]
}

function agentChatServerRequestArgumentValueSummary(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'
  if (Array.isArray(value)) return `${value.length} item(s)`
  if (isRecord(value)) return `${Object.keys(value).length} field(s)`
  return typeof value
}

function agentChatServerRequestPreviewSummaries(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return [`preview: ${value.length} item(s)`]
  if (!isRecord(value)) return [`preview: ${String(value)}`]
  const entries = Object.entries(value)
  if (!entries.length) return ['preview: empty object']
  return [
    `preview: ${entries.length} field(s)`,
    ...entries.slice(0, 4).map(([key, entryValue]) => `preview ${key}: ${agentChatServerRequestArgumentValueSummary(entryValue)}`),
  ]
}

function agentChatServerRequestFileSystemPermissionSummaries(value: Record<string, unknown>): string[] {
  return compactStrings([
    ...agentChatServerRequestPathListSummaries('fs read', value.read),
    ...agentChatServerRequestPathListSummaries('fs write', value.write),
    ...agentChatServerRequestFileSystemEntrySummaries(value.entries),
    typeof value.globScanMaxDepth === 'number' ? `glob scan max depth: ${value.globScanMaxDepth}` : '',
  ])
}

function agentChatServerRequestPathListSummaries(label: string, value: unknown): string[] {
  const paths = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
  if (!paths.length) return []
  return [
    `${label}: ${paths.length} path(s)`,
    ...paths.slice(0, 3).map((path) => `${label}: ${path}`),
  ]
}

function agentChatServerRequestFileSystemEntrySummaries(value: unknown): string[] {
  const entries = Array.isArray(value) ? value.filter(isRecord) : []
  if (!entries.length) return []
  return [
    `fs entries: ${entries.length}`,
    ...entries.slice(0, 4).map((entry) => {
      const access = stringField(entry.access) ?? 'access'
      const path = stringField(entry.path) ?? 'unknown'
      return `fs entry: ${access} ${path}`
    }),
  ]
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resourceIdField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
