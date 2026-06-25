import { getAPIV1BaseURL } from '@/shared/infrastructure/config'
import { FetchProviderSessionTransport } from './fetchTransport'
import type { ProviderSessionTransport, ProviderSessionTransportConfig } from './types'

export function createFetchProviderSessionTransport(baseURL = getAPIV1BaseURL()): ProviderSessionTransport {
  return new FetchProviderSessionTransport(baseURL)
}

export function createProviderSessionTransport(config: ProviderSessionTransportConfig): ProviderSessionTransport {
  return createFetchProviderSessionTransport(config.baseURL)
}
