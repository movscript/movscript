import type { AppServerJsonRpcId } from '@/shared/infrastructure/app-server/appServerProtocol'

export class AppServerRpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message)
    this.name = 'AppServerRpcError'
  }
}

export function isAlreadyInitializedError(error: unknown): boolean {
  return error instanceof AppServerRpcError
    && error.code === -32600
    && error.message === 'Already initialized'
}

export function compactRecord<T extends Record<string, unknown>>(input: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value
  }
  return output as T
}

export function compactProtocolParams(params: unknown): unknown {
  if (params === undefined) return undefined
  if (!isRecord(params) || Array.isArray(params)) return params
  return compactRecord(params)
}

export function fallbackServerRequestResult(method: string): unknown {
  if (method === 'item/permissions/requestApproval') return { permissions: {}, scope: 'turn', strictAutoReview: true }
  if (method === 'item/tool/requestUserInput') return { answers: {} }
  if (method === 'item/tool/call') return { contentItems: [], success: false }
  if (method === 'mcpServer/elicitation/request') return { action: 'decline', content: null, _meta: null }
  if (method === 'movscript/decision/request') return { decision: 'defer' }
  if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') return { decision: 'decline' }
  if (method === 'applyPatchApproval' || method === 'execCommandApproval') return { decision: 'denied' }
  if (method === 'account/chatgptAuthTokens/refresh' || method === 'attestation/generate') {
    return { action: 'decline', reason: 'No Agent Chat request handler is available.' }
  }
  return null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export function isJsonRpcId(value: unknown): value is AppServerJsonRpcId {
  return typeof value === 'number' || typeof value === 'string'
}
