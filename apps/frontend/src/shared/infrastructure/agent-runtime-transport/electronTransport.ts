import type {
  ElectronAgentRuntimeEnsureInput,
  ElectronAgentRuntimeStreamMessage,
} from '@/shared/contracts/electronApi'
import type { AgentRuntimeEventStream, AgentRuntimeTransport, AgentRuntimeTransportKind } from './types'

export class ElectronAgentRuntimeTransport implements AgentRuntimeTransport {
  readonly kind: AgentRuntimeTransportKind
  readonly endpointLabel: string
  readonly socketPath?: string

  constructor(private readonly input: ElectronAgentRuntimeEnsureInput = {}) {
    this.kind = input.transportKind === 'unix-socket' ? 'unix-socket' : 'electron'
    this.socketPath = input.socketPath
    this.endpointLabel = input.transportKind === 'unix-socket' && input.socketPath
      ? `unix:${input.socketPath}`
      : 'electron:agent-runtime'
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const api = resolveElectronAgentRuntimeAPI()
    const response = await api.agentRuntimeRequest({
      ...this.input,
      path,
      method: init.method,
      headers: normalizeHeaders(init.headers),
      body: await requestBodyText(init.body),
    })
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }

  async openEventStream(path: string, init: RequestInit = {}): Promise<AgentRuntimeEventStream> {
    const api = resolveElectronAgentRuntimeAPI()
    if (init.signal?.aborted) throw asError(init.signal.reason ?? new Error(`Agent runtime stream aborted before opening ${path}`))
    const streamId = createRuntimeStreamId()
    const stream = new ElectronAgentRuntimeEventStream(streamId, () => api.agentRuntimeCloseEventStream({ streamId }))
    const response = await api.agentRuntimeOpenEventStream({
      ...this.input,
      streamId,
      path,
      method: init.method,
      headers: normalizeHeaders(init.headers),
      body: await requestBodyText(init.body),
    })
    stream.setResponse(response.status, response.body)
    stream.attachAbortSignal(init.signal)
    return stream
  }
}

class ElectronAgentRuntimeEventStream implements AgentRuntimeEventStream {
  private readonly queue: ElectronAgentRuntimeStreamMessage[] = []
  private notify: (() => void) | undefined
  private readonly unsubscribe: () => void
  private abort: (() => void) | undefined
  private abortSignal: AbortSignal | undefined
  private abortReason: unknown
  private closed = false
  status = 0
  private body = ''

  constructor(
    private readonly streamId: string,
    private readonly closeRemote: () => Promise<void>,
  ) {
    this.unsubscribe = resolveElectronAgentRuntimeAPI().onAgentRuntimeStreamMessage((message) => {
      if (this.closed) return
      if (message.streamId !== this.streamId) return
      this.queue.push(message)
      this.notify?.()
      this.notify = undefined
    })
  }

  attachAbortSignal(signal?: AbortSignal | null): void {
    if (signal) {
      this.abortSignal = signal
      this.abort = () => {
        this.abortReason = signal.reason ?? new Error(`Agent runtime stream aborted: ${this.streamId}`)
        void this.close()
        this.notify?.()
        this.notify = undefined
      }
      if (signal.aborted) this.abort()
      else signal.addEventListener('abort', this.abort, { once: true })
    }
  }

  get ok(): boolean {
    return this.status >= 200 && this.status < 300
  }

  setResponse(status: number, body: string): void {
    this.status = status
    this.body = body
  }

  async responseText(): Promise<string> {
    await this.close()
    return this.body
  }

  async *messages(): AsyncIterable<string> {
    try {
      while (true) {
        while (this.queue.length > 0) {
          const message = this.queue.shift()!
          if (message.kind === 'message' && message.data !== undefined) {
            yield message.data
            continue
          }
          if (message.kind === 'error') throw new Error(message.error || 'Agent runtime stream failed')
          if (message.kind === 'end') return
        }
        if (this.closed) {
          if (this.abortReason) throw asError(this.abortReason)
          return
        }
        await new Promise<void>((resolve) => {
          this.notify = resolve
        })
      }
    } finally {
      await this.close()
    }
  }

  private async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.unsubscribe()
    if (this.abort) this.abortSignal?.removeEventListener('abort', this.abort)
    await this.closeRemote().catch(() => undefined)
  }
}

function resolveElectronAgentRuntimeAPI(): Required<Pick<NonNullable<Window['api']>, 'agentRuntimeRequest' | 'agentRuntimeOpenEventStream' | 'agentRuntimeCloseEventStream' | 'onAgentRuntimeStreamMessage'>> {
  const api = typeof window !== 'undefined' ? window.api : undefined
  if (!api?.agentRuntimeRequest || !api.agentRuntimeOpenEventStream || !api.agentRuntimeCloseEventStream || !api.onAgentRuntimeStreamMessage) {
    throw new Error('Electron agent runtime transport is not available in this window')
  }
  return {
    agentRuntimeRequest: api.agentRuntimeRequest,
    agentRuntimeOpenEventStream: api.agentRuntimeOpenEventStream,
    agentRuntimeCloseEventStream: api.agentRuntimeCloseEventStream,
    onAgentRuntimeStreamMessage: api.onAgentRuntimeStreamMessage,
  }
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) return Object.fromEntries(headers.entries())
  if (Array.isArray(headers)) return Object.fromEntries(headers)
  return headers
}

async function requestBodyText(body: BodyInit | null | undefined): Promise<string | undefined> {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') return body
  if (body instanceof Blob) return body.text()
  if (body instanceof URLSearchParams) return body.toString()
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body)
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body)
  throw new Error('Electron agent runtime transport only supports text-compatible request bodies')
}

function createRuntimeStreamId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-runtime-stream-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
