import { createProviderSessionTransport, type ProviderSessionTransport } from '@/shared/infrastructure/providerSessionTransport'

export const DEFAULT_PROVIDER_SESSION_HEALTH_TIMEOUT_MS = 5_000
export const DEFAULT_PROVIDER_SESSION_REQUEST_TIMEOUT_MS = 30_000
export const DEFAULT_RUN_STREAM_HTTP_TIMEOUT_MS = 60_000

export function providerSessionTransport(input: { baseURL?: string; movScriptHomeDir?: string; workspaceDir?: string; sessionId?: string } = {}): ProviderSessionTransport {
  return createProviderSessionTransport({
    ...(input.baseURL ? { baseURL: input.baseURL } : {}),
    ...(input.movScriptHomeDir ? { movScriptHomeDir: input.movScriptHomeDir } : {}),
    ...(input.workspaceDir ? { workspaceDir: input.workspaceDir } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  })
}
