import { MCPClient } from './mcpClient.js'
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

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const DEFAULT_GATEWAY_MODEL = 'movscript-default-chat'
const DEFAULT_GATEWAY_BASE_URL = 'http://127.0.0.1:8080/v1'
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

export class ChatRuntime {
  private readonly mcpClient: MCPClient

  constructor(options: ChatRuntimeOptions) {
    this.mcpClient = options.mcpClient
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages = normalizeMessages(request)
    const conversationId = request.conversationId || `conv_${Date.now().toString(36)}`
    const includeContext = request.includeContext !== false
    const context = includeContext ? await this.readContextSafely() : undefined
    const gatewayKey = process.env.MOVSCRIPT_AGENT_GATEWAY_API_KEY || process.env.MOVSCRIPT_AGENT_GATEWAY_USER_ID

    if (gatewayKey) {
      const model = process.env.MOVSCRIPT_AGENT_GATEWAY_MODEL || process.env.MOVSCRIPT_AGENT_OPENAI_MODEL || DEFAULT_GATEWAY_MODEL
      const baseURL = process.env.MOVSCRIPT_AGENT_GATEWAY_BASE_URL || process.env.MOVSCRIPT_AGENT_OPENAI_BASE_URL || DEFAULT_GATEWAY_BASE_URL
      return {
        conversationId,
        role: 'assistant',
        content: await this.callOpenAICompatible(gatewayKey, model, messages, context, baseURL),
        provider: 'movscript-model-gateway',
        model,
        contextIncluded: !!context,
      }
    }

    const apiKey = process.env.MOVSCRIPT_AGENT_OPENAI_API_KEY || process.env.OPENAI_API_KEY
    if (apiKey) {
      const model = process.env.MOVSCRIPT_AGENT_OPENAI_MODEL || DEFAULT_OPENAI_MODEL
      return {
        conversationId,
        role: 'assistant',
        content: await this.callOpenAICompatible(apiKey, model, messages, context),
        provider: 'openai-compatible',
        model,
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
      return await this.mcpClient.callTool('movscript.get_context_pack')
    } catch {
      return undefined
    }
  }

  private async callOpenAICompatible(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    context: JSONValue | undefined,
    baseURL = process.env.MOVSCRIPT_AGENT_OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
  ): Promise<string> {
    const system = [
      'You are MovScript Agent, a pragmatic assistant for film and animation production workflows.',
      'Answer in the same language as the user unless they ask otherwise.',
      'Use the MovScript context when it is available. Do not claim you changed project data unless a tool result proves it.',
      context ? `Current MovScript context JSON:\n${JSON.stringify(context, null, 2)}` : 'Current MovScript context is unavailable.',
    ].join('\n\n')

    const res = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          ...messages,
        ],
      }),
    })

    if (!res.ok) {
      throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`)
    }

    const json = await res.json() as OpenAIChatResponse
    const content = json.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('LLM returned no assistant content')
    return content
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
    '当前 legacy chat 链路已经打通。要得到真正的模型回复，请在启动 movscript-production-runtime 前设置 MOVSCRIPT_AGENT_OPENAI_API_KEY 或 OPENAI_API_KEY；也可以设置 MOVSCRIPT_AGENT_OPENAI_MODEL 和 MOVSCRIPT_AGENT_OPENAI_BASE_URL 接入 OpenAI-compatible 服务。',
  ].join('\n')
}
