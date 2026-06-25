import {
  extractAgentConnectionDebugThreadId,
  recordAgentConnectionDebugEvent,
} from '@/shared/infrastructure/agentConnectionDebugStore'
import { ResponseProviderSessionEventStream, type ProviderSessionEventStreamDebugContext } from './eventStream'
import type { ProviderSessionEventStream, ProviderSessionTransport } from './types'

let nextProviderSessionDebugRequestId = 1

export class FetchProviderSessionTransport implements ProviderSessionTransport {
  readonly kind = 'http'
  readonly endpointLabel: string
  private readonly baseURL: string

  constructor(baseURL: string) {
    this.baseURL = baseURL.replace(/\/+$/, '')
    this.endpointLabel = this.baseURL
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const { response } = await this.requestWithDebug(path, init)
    return response
  }

  async openEventStream(path: string, init: RequestInit = {}): Promise<ProviderSessionEventStream> {
    const { response, debugContext } = await this.requestWithDebug(path, init)
    return new ResponseProviderSessionEventStream(response, debugContext)
  }

  private url(path: string): string {
    if (/^https?:\/\//i.test(path)) return path
    return `${this.baseURL}/${path.replace(/^\/+/, '')}`
  }

  private async requestWithDebug(path: string, init: RequestInit = {}): Promise<{
    response: Response
    debugContext: ProviderSessionEventStreamDebugContext
  }> {
    const url = this.url(path)
    const method = init.method?.toUpperCase() || 'GET'
    const requestId = `provider-session:${nextProviderSessionDebugRequestId++}`
    const requestBody = readableBody(init.body)
    const threadId = threadIdFromPath(path) || extractAgentConnectionDebugThreadId(requestBody)
    const debugContext = {
      connectionId: this.endpointLabel,
      requestId,
      method: `${method} ${path}`,
      path,
      ...(threadId ? { threadId } : {}),
    }
    recordAgentConnectionDebugEvent({
      direction: 'request',
      source: 'provider-session-http',
      connectionId: this.endpointLabel,
      requestId,
      method: debugContext.method,
      threadId,
      raw: {
        url,
        path,
        method,
        headers: headersRecord(init.headers),
        ...(requestBody !== undefined ? { body: requestBody } : {}),
      },
    })
    const response = await fetch(url, init)
    const responseHeaders = headersRecord(response.headers)
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('text/event-stream')) {
      recordAgentConnectionDebugEvent({
        direction: 'response',
        source: 'provider-session-http',
        connectionId: this.endpointLabel,
        requestId,
        method: `${debugContext.method}:open`,
        threadId,
        raw: {
          url,
          path,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          eventStream: true,
        },
      })
    } else {
      void response.clone().text().then((body) => {
        recordAgentConnectionDebugEvent({
          direction: 'response',
          source: 'provider-session-http',
          connectionId: this.endpointLabel,
          requestId,
          method: debugContext.method,
          threadId: extractAgentConnectionDebugThreadId(parseJsonMaybe(body)) || threadId,
          raw: {
            url,
            path,
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body: parseJsonMaybe(body),
          },
        })
      }).catch((error) => {
        recordAgentConnectionDebugEvent({
          direction: 'response',
          source: 'provider-session-http',
          connectionId: this.endpointLabel,
          requestId,
          method: `${debugContext.method}:body-error`,
          threadId,
          raw: {
            url,
            path,
            status: response.status,
            statusText: response.statusText,
            error: error instanceof Error ? error.message : String(error),
          },
        })
      })
    }
    return { response, debugContext }
  }
}

function threadIdFromPath(path: string): string | undefined {
  const match = path.match(/\/threads\/([^/?#]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

function readableBody(body: BodyInit | null | undefined): unknown {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') return parseJsonMaybe(body)
  if (body instanceof URLSearchParams) return Object.fromEntries(body.entries())
  if (body instanceof FormData) return Object.fromEntries(Array.from(body.entries()).map(([key, value]) => [
    key,
    typeof value === 'string' ? value : { name: value.name, size: value.size, type: value.type },
  ]))
  return Object.prototype.toString.call(body)
}

function headersRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {}
  return Object.fromEntries(new Headers(headers).entries())
}

function parseJsonMaybe(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
