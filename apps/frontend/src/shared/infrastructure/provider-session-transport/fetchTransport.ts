import { ResponseProviderSessionEventStream } from './eventStream'
import type { ProviderSessionEventStream, ProviderSessionTransport } from './types'

export class FetchProviderSessionTransport implements ProviderSessionTransport {
  readonly kind = 'http'
  readonly endpointLabel: string
  private readonly baseURL: string

  constructor(baseURL: string) {
    this.baseURL = baseURL.replace(/\/+$/, '')
    this.endpointLabel = this.baseURL
  }

  request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(this.url(path), init)
  }

  async openEventStream(path: string, init: RequestInit = {}): Promise<ProviderSessionEventStream> {
    return new ResponseProviderSessionEventStream(await this.request(path, init))
  }

  private url(path: string): string {
    if (/^https?:\/\//i.test(path)) return path
    return `${this.baseURL}/${path.replace(/^\/+/, '')}`
  }
}
