import type { GenerationToolServer } from '../../../src/shared/contracts/generationTools'

export function sanitizeGenerationToolServerForMCP(server: GenerationToolServer): Record<string, unknown> {
  return {
    id: server.id,
    scope: server.scope,
    type: server.type,
    name: server.name,
    enabled: server.enabled,
    baseURL: server.baseURL,
    timeoutMS: server.timeoutMS,
    priority: server.priority,
    authKind: server.authKind,
    passwordSet: !!server.password || !!server.passwordSet,
    tokenSet: !!server.token || !!server.tokenSet,
    tags: server.tags ?? [],
  }
}
