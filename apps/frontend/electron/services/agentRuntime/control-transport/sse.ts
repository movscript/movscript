import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import type { AgentRuntimeControlEventStream } from './types'

export class ResponseAgentRuntimeControlEventStream implements AgentRuntimeControlEventStream {
  readonly ok: boolean
  readonly status: number
  readonly statusText?: string
  readonly headers: Record<string, string>

  constructor(private readonly response: Response) {
    this.ok = response.ok
    this.status = response.status
    this.statusText = response.statusText
    this.headers = Object.fromEntries(response.headers.entries())
  }

  responseText(): Promise<string> {
    return this.response.text()
  }

  async *messages(): AsyncIterable<string> {
    const body = this.response.body
    if (!body) return
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        for (const message of drainSSEMessages(buffer)) {
          buffer = message.remainder
          if (message.data !== undefined) yield message.data
        }
      }
      const tail = decoder.decode()
      if (tail) buffer += tail
      const parsed = parseSSEBlock(buffer)
      if (parsed) yield parsed.data
    } finally {
      await reader.cancel().catch(() => undefined)
    }
  }
}

export class IncomingMessageAgentRuntimeControlEventStream implements AgentRuntimeControlEventStream {
  readonly ok: boolean
  readonly status: number
  readonly statusText?: string
  readonly headers: Record<string, string>

  constructor(private readonly response: IncomingMessage) {
    this.status = response.statusCode ?? 500
    this.statusText = response.statusMessage
    this.ok = this.status >= 200 && this.status < 300
    this.headers = normalizeIncomingHeaders(response.headers)
  }

  async responseText(): Promise<string> {
    const chunks: Buffer[] = []
    for await (const chunk of this.response) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  async *messages(): AsyncIterable<string> {
    let buffer = ''
    for await (const chunk of this.response) {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      for (const message of drainSSEMessages(buffer)) {
        buffer = message.remainder
        if (message.data !== undefined) yield message.data
      }
    }
    const parsed = parseSSEBlock(buffer)
    if (parsed) yield parsed.data
  }
}

function drainSSEMessages(buffer: string): Array<{ data?: string; remainder: string }> {
  const output: Array<{ data?: string; remainder: string }> = []
  let normalized = buffer.replace(/\r\n/g, '\n')
  let separatorIndex = normalized.indexOf('\n\n')
  while (separatorIndex >= 0) {
    const parsed = parseSSEBlock(normalized.slice(0, separatorIndex))
    normalized = normalized.slice(separatorIndex + 2)
    output.push({ data: parsed?.data, remainder: normalized })
    separatorIndex = normalized.indexOf('\n\n')
  }
  if (output.length === 0) output.push({ remainder: normalized })
  return output
}

function parseSSEBlock(block: string): { event?: string; data: string } | undefined {
  const lines = block.split('\n')
  let event: string | undefined
  const data: string[] = []
  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(':')) continue
    const colonIndex = line.indexOf(':')
    const field = colonIndex >= 0 ? line.slice(0, colonIndex) : line
    const value = colonIndex >= 0 ? line.slice(colonIndex + 1).replace(/^ /, '') : ''
    if (field === 'event') event = value
    if (field === 'data') data.push(value)
  }
  if (data.length === 0) return undefined
  return { event, data: data.join('\n') }
}

function normalizeIncomingHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) result[key] = value.join(', ')
    else if (value !== undefined) result[key] = String(value)
  }
  return result
}
