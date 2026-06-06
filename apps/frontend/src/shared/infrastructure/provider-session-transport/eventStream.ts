import type { ProviderSessionEventStream } from './types'

export class ResponseProviderSessionEventStream implements ProviderSessionEventStream {
  readonly ok: boolean
  readonly status: number

  constructor(private readonly response: Response) {
    this.ok = response.ok
    this.status = response.status
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
        let normalized = buffer.replace(/\r\n/g, '\n')
        let separatorIndex = normalized.indexOf('\n\n')
        while (separatorIndex >= 0) {
          const parsed = parseSSEBlock(normalized.slice(0, separatorIndex))
          if (parsed) yield parsed.data
          normalized = normalized.slice(separatorIndex + 2)
          separatorIndex = normalized.indexOf('\n\n')
        }
        buffer = normalized
      }
      const tail = decoder.decode()
      if (tail) buffer += tail
      if (buffer.trim()) {
        const parsed = parseSSEBlock(buffer)
        if (parsed) yield parsed.data
      }
    } finally {
      await reader.cancel().catch(() => undefined)
    }
  }
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
