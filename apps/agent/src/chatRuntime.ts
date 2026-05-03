import { MCPClient } from './mcpClient.js'
import { buildBackendGatewayChatRequest, callBackendGatewayChat, resolveRuntimeChatModelConfig, type RuntimeModelAuthContext } from './runtime/modelConfig.js'
import type { JSONValue } from './types.js'

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatRequest {
  message?: string
  messages?: ChatMessage[]
  conversationId?: string
  includeContext?: boolean
}

export interface ChatResponse {
  conversationId: string
  role: 'assistant'
  content: string
  provider: string
  model?: string
  contextIncluded: boolean
}

export interface ChatRuntimeOptions {
  mcpClient: MCPClient
}

export class ChatRuntime {
  private readonly mcpClient: MCPClient

  constructor(options: ChatRuntimeOptions) {
    this.mcpClient = options.mcpClient
  }

  async chat(request: ChatRequest, auth: RuntimeModelAuthContext = {}): Promise<ChatResponse> {
    const messages = normalizeMessages(request)
    const conversationId = request.conversationId || `conv_${Date.now().toString(36)}`
    const includeContext = request.includeContext !== false
    const context = includeContext ? await this.readContextSafely() : undefined
    const runtimeModelConfig = resolveRuntimeChatModelConfig()
    if (runtimeModelConfig) {
      return {
        conversationId,
        role: 'assistant',
        content: await this.callBackendModel(runtimeModelConfig, messages, context, auth),
        provider: 'backend-model-config',
        model: runtimeModelConfig.model,
        contextIncluded: !!context,
      }
    }

    return {
      conversationId,
      role: 'assistant',
      content: buildLocalResponse(messages, context),
      provider: 'local-fallback',
      contextIncluded: !!context,
    }
  }

  private async readContextSafely(): Promise<JSONValue | undefined> {
    try {
      await this.mcpClient.initialize()
      return await this.mcpClient.callTool('movscript_get_context_pack')
    } catch {
      return undefined
    }
  }

  private async callBackendModel(
    config: NonNullable<ReturnType<typeof resolveRuntimeChatModelConfig>>,
    messages: ChatMessage[],
    context: JSONValue | undefined,
    auth: RuntimeModelAuthContext,
  ): Promise<string> {
    const system = [
      'You are MovScript Agent, a pragmatic assistant for film and animation production workflows.',
      'Answer in the same language as the user unless they ask otherwise.',
      'Use the MovScript context when it is available. Do not claim you changed project data unless a tool result proves it.',
      context ? `Current MovScript context JSON:\n${JSON.stringify(context, null, 2)}` : 'Current MovScript context is unavailable.',
    ].join('\n\n')

    return callBackendGatewayChat(buildBackendGatewayChatRequest(config, [
      { role: 'system', content: system },
      ...messages,
    ], auth))
  }
}

function normalizeMessages(request: ChatRequest): ChatMessage[] {
  const fromMessages = Array.isArray(request.messages)
    ? request.messages.filter(isChatMessage)
    : []
  const fromMessage = typeof request.message === 'string' && request.message.trim()
    ? [{ role: 'user' as const, content: request.message.trim() }]
    : []
  const messages = fromMessages.length ? fromMessages : fromMessage
  if (!messages.length) throw new Error('chat requires message or messages')
  return messages
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    (record.role === 'system' || record.role === 'user' || record.role === 'assistant') &&
    typeof record.content === 'string'
  )
}

function buildLocalResponse(messages: ChatMessage[], context: JSONValue | undefined): string {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')
  const contextLine = context
    ? `我已经读取到当前 MovScript 上下文。`
    : `我还没有读取到 MovScript 上下文；请确认 Electron MCP server 正在运行。`
  const userLine = lastUser ? `你刚才说：${lastUser.content}` : '我没有收到用户消息。'

  return [
    contextLine,
    userLine,
    '',
    '当前 legacy chat 链路已经打通。要得到真正的模型回复，请先在 Agent Debug 的 Model Connection 中选择后端已配置的文本模型。',
  ].join('\n')
}
