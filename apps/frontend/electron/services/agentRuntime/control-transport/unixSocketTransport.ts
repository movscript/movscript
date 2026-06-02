import { request as httpRequest, type OutgoingHttpHeaders } from 'node:http'
import { IncomingMessageAgentRuntimeControlEventStream } from './sse'
import type { AgentRuntimeControlEventStream, AgentRuntimeControlTransport } from './types'

export class UnixSocketAgentRuntimeControlTransport implements AgentRuntimeControlTransport {
  readonly kind = 'unix-socket'
  readonly endpointLabel: string

  constructor(readonly socketPath: string) {
    this.endpointLabel = `unix:${socketPath}`
  }

  request(path: string, init: RequestInit = {}): Promise<Response> {
    return new Promise((resolve, reject) => {
      const signal = init.signal
      if (signal?.aborted) {
        reject(signal.reason ?? new Error(`Request aborted before ${this.endpointLabel}${path}`))
        return
      }

      const req = httpRequest({
        socketPath: this.socketPath,
        path,
        method: init.method ?? 'GET',
        headers: normalizeNodeHeaders(init.headers),
      }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
        })
        res.on('end', () => {
          resolve(new Response(Buffer.concat(chunks), {
            status: res.statusCode ?? 500,
            statusText: res.statusMessage,
            headers: res.headers as HeadersInit,
          }))
        })
      })

      const abort = () => {
        req.destroy(signal?.reason instanceof Error ? signal.reason : new Error(`Request aborted for ${this.endpointLabel}${path}`))
      }
      signal?.addEventListener('abort', abort, { once: true })
      req.on('error', reject)
      req.on('close', () => signal?.removeEventListener('abort', abort))

      endNodeRequest(req, init.body)
    })
  }

  openEventStream(path: string, init: RequestInit = {}): Promise<AgentRuntimeControlEventStream> {
    return new Promise((resolve, reject) => {
      const signal = init.signal
      if (signal?.aborted) {
        reject(signal.reason ?? new Error(`Request aborted before ${this.endpointLabel}${path}`))
        return
      }

      const req = httpRequest({
        socketPath: this.socketPath,
        path,
        method: init.method ?? 'GET',
        headers: normalizeNodeHeaders(init.headers),
      }, (res) => {
        resolve(new IncomingMessageAgentRuntimeControlEventStream(res))
      })

      const abort = () => {
        req.destroy(signal?.reason instanceof Error ? signal.reason : new Error(`Request aborted for ${this.endpointLabel}${path}`))
      }
      signal?.addEventListener('abort', abort, { once: true })
      req.on('error', reject)
      req.on('close', () => signal?.removeEventListener('abort', abort))

      endNodeRequest(req, init.body)
    })
  }
}

export function createUnixSocketAgentRuntimeControlTransport(socketPath: string): AgentRuntimeControlTransport {
  return new UnixSocketAgentRuntimeControlTransport(socketPath)
}

function normalizeNodeHeaders(headers: HeadersInit | undefined): OutgoingHttpHeaders {
  if (!headers) return {}
  if (headers instanceof Headers) return Object.fromEntries(headers.entries())
  if (Array.isArray(headers)) return Object.fromEntries(headers)
  return headers
}

function endNodeRequest(req: ReturnType<typeof httpRequest>, body: BodyInit | null | undefined): void {
  if (body === undefined || body === null) {
    req.end()
  } else if (typeof body === 'string' || body instanceof Uint8Array) {
    req.end(body)
  } else {
    req.destroy(new Error('Unix socket agent runtime transport only supports string and Uint8Array request bodies'))
  }
}
