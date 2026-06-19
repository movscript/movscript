import type {
  AgentChatServerRequest,
  AgentChatServerRequestMethod,
  AgentChatServerRequestResponse,
} from '@movscript/core/agent/chat'
import type { SdkRuntimeRunPromptEventSink } from './sdkRuntimeTurnEvents'

export function sdkRuntimeProviderRequestCallbacks(
  sink: SdkRuntimeRunPromptEventSink | undefined,
): Record<string, unknown> {
  if (!sink?.requestServer) return {}
  const request = (...args: unknown[]) => handleSdkRuntimeProviderServerRequest(sink, providerRequestInput(args))
  return {
    requestServer: request,
    onServerRequest: request,
    serverRequestHandler: request,
    onApprovalRequest: request,
    approvalHandler: request,
    onToolCallRequest: request,
    toolCallHandler: request,
    canUseTool: async (...args: unknown[]) => sdkCanUseToolResponse(await request(...args)),
  }
}

export async function handleSdkRuntimeProviderServerRequest(
  sink: SdkRuntimeRunPromptEventSink | undefined,
  input: unknown,
): Promise<AgentChatServerRequestResponse | undefined> {
  if (!sink?.requestServer) return undefined
  const request = sdkRuntimeServerRequestFromProvider(input, sink)
  if (!request) return undefined
  const response = await sink.requestServer(request)
  await respondToProviderServerRequest(input, response)
  return response
}

export function sdkRuntimeServerRequestFromProvider(
  input: unknown,
  sink?: Pick<SdkRuntimeRunPromptEventSink, 'turnId'>,
): AgentChatServerRequest | undefined {
  const source = providerRequestRecord(input)
  if (!source) return undefined
  const requestRecord = isRecord(source.request) ? source.request : source
  const method = serverRequestMethod(requestRecord, source)
  const id = stringField(requestRecord, 'id')
    ?? stringField(requestRecord, 'requestId')
    ?? stringField(requestRecord, 'request_id')
    ?? stringField(requestRecord, 'callId')
    ?? stringField(requestRecord, 'call_id')
    ?? `sdk_req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    method,
    ...(stringField(requestRecord, 'threadId') ?? stringField(requestRecord, 'thread_id') ? { threadId: stringField(requestRecord, 'threadId') ?? stringField(requestRecord, 'thread_id') } : {}),
    ...(stringField(requestRecord, 'turnId') ?? stringField(requestRecord, 'turn_id') ?? sink?.turnId ? { turnId: stringField(requestRecord, 'turnId') ?? stringField(requestRecord, 'turn_id') ?? sink?.turnId } : {}),
    ...(stringField(requestRecord, 'itemId') ?? stringField(requestRecord, 'item_id') ? { itemId: stringField(requestRecord, 'itemId') ?? stringField(requestRecord, 'item_id') } : {}),
    params: requestParams(requestRecord, source),
    raw: input,
  }
}

export function sdkRuntimeProviderRunProfileOptions(input?: Record<string, unknown>): Record<string, unknown> {
  const approvalPolicy = stringField(input, 'approvalPolicy')
  const approvalsReviewer = stringField(input, 'approvalsReviewer')
  const permissionProfileId = stringField(input, 'permissionProfileId') ?? stringField(input, 'permissions')
  const sandbox = input?.sandbox ?? input?.sandboxPolicy
  const next: Record<string, unknown> = {
    ...(approvalPolicy ? { approvalPolicy, approval_policy: approvalPolicy } : {}),
    ...(approvalsReviewer ? { approvalsReviewer, approvals_reviewer: approvalsReviewer } : {}),
    ...(permissionProfileId ? { permissionProfileId, permissionProfile: permissionProfileId, permissions: permissionProfileId } : {}),
    ...(sandbox !== undefined ? { sandbox, sandboxMode: sandbox, sandbox_mode: sandbox } : {}),
  }
  return next
}

export function sdkRuntimeClaudePermissionMode(input?: Record<string, unknown>): string | undefined {
  const approvalPolicy = stringField(input, 'approvalPolicy')
  const permissionProfileId = stringField(input, 'permissionProfileId') ?? stringField(input, 'permissions')
  const sandbox = input?.sandbox ?? input?.sandboxPolicy
  if (approvalPolicy === 'never' || permissionProfileId === ':danger-full-access' || sandbox === 'danger-full-access') return 'bypassPermissions'
  if (permissionProfileId === ':read-only' || sandbox === 'read-only') return 'default'
  return undefined
}

function providerRequestInput(args: unknown[]): unknown {
  if (args.length <= 1) return args[0]
  const [toolName, input, options] = args
  return {
    type: 'tool_permission',
    toolName,
    args: input,
    options,
  }
}

function providerRequestRecord(input: unknown): Record<string, unknown> | undefined {
  if (!isRecord(input)) return undefined
  if (isRecord(input.request)) return input
  if (input.id !== undefined || input.requestId !== undefined || input.method !== undefined || input.type !== undefined) return input
  if (input.toolName !== undefined || input.tool !== undefined || input.name !== undefined) return input
  return undefined
}

function serverRequestMethod(
  request: Record<string, unknown>,
  source: Record<string, unknown>,
): AgentChatServerRequestMethod {
  const method = stringField(request, 'method') ?? stringField(source, 'method')
  if (method && isMovScriptServerRequestMethod(method)) return method
  const type = `${method ?? ''} ${stringField(request, 'type') ?? ''} ${stringField(source, 'type') ?? ''}`.toLowerCase()
  if (/apply.?patch/.test(type)) return 'applyPatchApproval'
  if (/exec|command|shell/.test(type)) return 'execCommandApproval'
  if (/file.*change|edit|write/.test(type)) return 'item/fileChange/requestApproval'
  if (/elicitation|elicit/.test(type)) return 'mcpServer/elicitation/request'
  if (/input|question|prompt/.test(type)) return 'item/tool/requestUserInput'
  if (/tool/.test(type) && !/approval|permission/.test(type)) return 'item/tool/call'
  return 'item/permissions/requestApproval'
}

function isMovScriptServerRequestMethod(method: string): method is AgentChatServerRequestMethod {
  return method.includes('/')
    || method === 'applyPatchApproval'
    || method === 'execCommandApproval'
    || method === 'attestation/generate'
}

function requestParams(request: Record<string, unknown>, source: Record<string, unknown>): unknown {
  if (request.params !== undefined) return request.params
  if (source.params !== undefined) return source.params
  if (isRecord(source.request) && source.request !== request && source.request.params !== undefined) return source.request.params
  const toolName = stringField(request, 'toolName') ?? stringField(request, 'tool') ?? stringField(request, 'name')
  const params: Record<string, unknown> = {
    ...request,
    ...(toolName ? { toolName } : {}),
  }
  delete params.id
  delete params.requestId
  delete params.request_id
  delete params.method
  delete params.type
  delete params.resolve
  delete params.respond
  return params
}

async function respondToProviderServerRequest(
  input: unknown,
  response: AgentChatServerRequestResponse | undefined,
): Promise<void> {
  const source = isRecord(input) ? input : undefined
  const request = source && isRecord(source.request) ? source.request : source
  const responder = functionField(source, 'respond')
    ?? functionField(source, 'resolve')
    ?? functionField(request, 'respond')
    ?? functionField(request, 'resolve')
  if (responder) await responder(response)
}

function sdkCanUseToolResponse(response: AgentChatServerRequestResponse | undefined): unknown {
  if (!response) return { behavior: 'deny', message: 'No response was provided.' }
  if (response.action === 'approve') return { behavior: 'allow' }
  if (response.action === 'toolResult') return response.success ? { behavior: 'allow' } : { behavior: 'deny', message: 'Tool call rejected.' }
  if (response.action === 'elicitation') return response.accepted ? { behavior: 'allow' } : { behavior: 'deny', message: 'Elicitation rejected.' }
  if (response.action === 'answer') return { behavior: 'allow', answer: response }
  if (response.action === 'decision') return response.decision === 'adopt' ? { behavior: 'allow', decision: response } : { behavior: 'deny', message: response.reason ?? 'Decision rejected.' }
  return { behavior: 'deny', message: response.reason ?? 'Request rejected.' }
}

function stringField(record: Record<string, unknown> | undefined, field: string): string | undefined {
  const value = record?.[field]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function functionField(record: Record<string, unknown> | undefined, field: string): ((value: unknown) => unknown) | undefined {
  const value = record?.[field]
  return typeof value === 'function' ? value as (value: unknown) => unknown : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
