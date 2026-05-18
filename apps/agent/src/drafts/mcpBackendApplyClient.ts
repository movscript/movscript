import type { MCPClient } from '../mcpClient.js'
import type { JSONValue } from '../types.js'
import { isJSONRecord as isRecord } from '../jsonValue.js'
import { BackendApplyClient, normalizeBackendApplyAuthUserId, type BackendApplyAuthContext, type BackendApplyResult } from './backendApplyClient.js'
import type { ApplyDraftReview } from './draftApply.js'

type BackendApplyMCPClient = Pick<MCPClient, 'initialize' | 'callTool'>

const BACKEND_APPLY_MCP_TOOLS = {
  applyReview: 'movscript_apply_draft_review',
  previewApplyReview: 'movscript_preview_apply_draft_review',
} as const

export class MCPBackendApplyClient extends BackendApplyClient {
  private readonly mcpClient: BackendApplyMCPClient

  constructor(mcpClient: BackendApplyMCPClient) {
    super()
    this.mcpClient = mcpClient
  }

  override isEnabled(): boolean {
    return true
  }

  override async applyReview(review: ApplyDraftReview, auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    return this.callBackendApplyTool(BACKEND_APPLY_MCP_TOOLS.applyReview, {
      review: review as unknown as JSONValue,
      ...authArgs(auth),
    })
  }

  override async previewApplyReview(review: ApplyDraftReview, auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    return this.callBackendApplyTool(BACKEND_APPLY_MCP_TOOLS.previewApplyReview, {
      review: review as unknown as JSONValue,
      ...authArgs(auth),
    })
  }

  private async callBackendApplyTool(name: string, args: Record<string, JSONValue>): Promise<BackendApplyResult> {
    await this.mcpClient.initialize()
    const raw = await this.mcpClient.callTool(name, args)
    const data = unwrapToolData(raw)
    if (!isRecord(data)) {
      throw new Error(`${name} returned invalid backend apply result`)
    }
    return data as unknown as BackendApplyResult
  }
}

function authArgs(auth?: BackendApplyAuthContext): Record<string, JSONValue> {
  const userId = normalizeBackendApplyAuthUserId(auth?.userId)
  return {
    ...(userId !== undefined ? { userId } : {}),
  }
}

function unwrapToolData(value: JSONValue): JSONValue {
  if (isRecord(value) && value.data !== undefined) return value.data as JSONValue
  return value
}
