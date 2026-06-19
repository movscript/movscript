export const PROVIDER_MODEL_API_KINDS = [
  'openai_chat_completions',
  'openai_responses',
  'anthropic_messages',
] as const

export type ProviderModelAPIKind = typeof PROVIDER_MODEL_API_KINDS[number]

export const PROVIDER_MODEL_CAPABILITIES = ['reasoning', 'text', 'planning', 'multimodal'] as const

export type ProviderModelCapability = typeof PROVIDER_MODEL_CAPABILITIES[number]

export type ProviderModelRouteSource =
  | 'configured'
  | 'chat-config-fallback'
  | 'planner-config'
  | 'disabled'
  | 'unconfigured'

export interface ProviderModelCredentialStatusPublic {
  required: boolean
  configured: boolean
  sourceEnv: string[]
  acceptedEnv: string[]
}

export interface ProviderModelCapabilityRoutePublic {
  capability: ProviderModelCapability
  configured: boolean
  provider?: 'backend-model-config'
  model?: string
  source: ProviderModelRouteSource
}

export interface ProviderModelConfigPublic {
  configured: boolean
  provider: 'backend-model-config'
  model: string
  apiKind: ProviderModelAPIKind
  modelEndpointBaseURL?: string
  apiKeyConfigured: boolean
  useForChat: boolean
  useForPlanner: boolean
  updatedAt?: string
  source: 'file' | 'none'
  credentialStatus: ProviderModelCredentialStatusPublic
  capabilities?: ProviderModelCapabilityRoutePublic[]
}

export interface ProviderModelChatToolCallPublic {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ProviderModelChatMessagePublic {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: ProviderModelContentPartPublic[]
  tool_call_id?: string
  tool_calls?: ProviderModelChatToolCallPublic[]
}

export type ProviderModelContentPartPublic = ProviderModelTextContentPartPublic | ProviderModelImageContentPartPublic

export interface ProviderModelTextContentPartPublic {
  type: 'text'
  text: string
}

export interface ProviderModelImageContentPartPublic {
  type: 'image'
  source: ProviderModelImageSourcePublic
  detail?: 'low' | 'high' | 'auto'
}

export type ProviderModelImageSourcePublic =
  | { type: 'url'; url: string }
  | { type: 'data_url'; dataUrl: string }
  | { type: 'file_id'; fileId: string }

export interface ProviderModelRequestSnapshotPublic {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: Record<string, unknown> & {
    model: string
    messages: unknown[]
    stream?: boolean
    temperature?: number
    response_format?: { type: 'json_object' }
    tools?: unknown
    tool_choice?: unknown
    sdk_body?: unknown
  }
}

export interface ProviderModelTestResult {
  ok: boolean
  provider: string
  model: string
  apiKind: ProviderModelAPIKind
  latencyMs: number
  content: string
  request: ProviderModelRequestSnapshotPublic
}
