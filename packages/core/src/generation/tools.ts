export type GenerationToolServerType = 'comfyui' | 'webui'
export type GenerationToolServerScope = 'local' | 'org' | 'admin'
export type GenerationToolAuthKind = 'none' | 'basic' | 'bearer'

export type GenerationToolServer = {
  id: string
  scope: GenerationToolServerScope
  type: GenerationToolServerType
  name: string
  enabled: boolean
  baseURL: string
  timeoutMS: number
  priority: number
  authKind: GenerationToolAuthKind
  username?: string
  password?: string
  token?: string
  tokenSet?: boolean
  passwordSet?: boolean
  tags?: string[]
}

export type GenerationToolsSettings = {
  servers: GenerationToolServer[]
  defaultServerId?: string
  defaultServerIds?: Partial<Record<GenerationToolServerType, string>>
  preferLocalServers: boolean
}

export const DEFAULT_GENERATION_TOOLS_SETTINGS: GenerationToolsSettings = {
  servers: [
    createGenerationToolServer('comfyui', {
      id: 'local-comfyui-default',
      name: '本机 ComfyUI',
      baseURL: 'http://127.0.0.1:8188',
      priority: 10,
    }),
    createGenerationToolServer('webui', {
      id: 'local-webui-default',
      name: '本机 WebUI',
      baseURL: 'http://127.0.0.1:7860',
      priority: 20,
    }),
  ],
  defaultServerId: undefined,
  defaultServerIds: {},
  preferLocalServers: true,
}

export function createGenerationToolServer(
  type: GenerationToolServerType,
  overrides: Partial<GenerationToolServer> = {},
): GenerationToolServer {
  const id = overrides.id ?? newLocalServerId()
  return {
    id,
    scope: overrides.scope ?? 'local',
    type,
    name: overrides.name ?? (type === 'comfyui' ? 'ComfyUI' : 'Stable Diffusion WebUI'),
    enabled: overrides.enabled ?? false,
    baseURL: overrides.baseURL ?? (type === 'comfyui' ? 'http://127.0.0.1:8188' : 'http://127.0.0.1:7860'),
    timeoutMS: overrides.timeoutMS ?? 120000,
    priority: overrides.priority ?? 50,
    authKind: overrides.authKind ?? 'none',
    username: overrides.username ?? '',
    password: overrides.password ?? '',
    passwordSet: overrides.passwordSet ?? false,
    token: overrides.token ?? '',
    tokenSet: overrides.tokenSet ?? false,
    tags: overrides.tags ?? [],
  }
}

export function normalizeGenerationToolsSettings(settings?: Partial<GenerationToolsSettings> | null): GenerationToolsSettings {
  const legacy = settings as Partial<GenerationToolsSettings> & {
    comfyui?: Partial<GenerationToolServer> & { apiKey?: string }
    webui?: Partial<GenerationToolServer>
  } | null | undefined
  const servers: GenerationToolServer[] = Array.isArray(settings?.servers)
    ? settings.servers.map(normalizeServer).filter(isGenerationToolServer)
    : [
        legacy?.comfyui ? normalizeServer({
          ...legacy.comfyui,
          id: 'local-comfyui-default',
          scope: 'local',
          type: 'comfyui',
          name: '本机 ComfyUI',
          authKind: legacy.comfyui.apiKey ? 'bearer' : 'none',
          token: legacy.comfyui.apiKey,
        }) : null,
        legacy?.webui ? normalizeServer({
          ...legacy.webui,
          id: 'local-webui-default',
          scope: 'local',
          type: 'webui',
          name: '本机 WebUI',
          authKind: legacy.webui.password || legacy.webui.username ? 'basic' : 'none',
        }) : null,
      ].filter(isGenerationToolServer)
  const fallbackServers = DEFAULT_GENERATION_TOOLS_SETTINGS.servers
  const effectiveServers = servers.length ? servers : fallbackServers
  const defaultServerIds = normalizeDefaultServerIds(settings?.defaultServerIds, settings?.defaultServerId, effectiveServers)
  return {
    servers: effectiveServers,
    defaultServerId: typeof settings?.defaultServerId === 'string' && effectiveServers.some((server) => server.id === settings.defaultServerId)
      ? settings.defaultServerId
      : undefined,
    defaultServerIds,
    preferLocalServers: settings?.preferLocalServers ?? true,
  }
}

function normalizeDefaultServerIds(
  value: Partial<Record<GenerationToolServerType, string>> | undefined,
  legacyDefaultServerId: string | undefined,
  servers: GenerationToolServer[],
): Partial<Record<GenerationToolServerType, string>> {
  const out: Partial<Record<GenerationToolServerType, string>> = {}
  for (const type of ['comfyui', 'webui'] as const) {
    const id = typeof value?.[type] === 'string' ? value[type] : undefined
    if (id && servers.some((server) => server.type === type && server.enabled && server.id === id)) {
      out[type] = id
    }
  }
  if (legacyDefaultServerId) {
    const legacyServer = servers.find((server) => server.enabled && server.id === legacyDefaultServerId)
    if (legacyServer && !out[legacyServer.type]) {
      out[legacyServer.type] = legacyServer.id
    }
  }
  return out
}

function normalizeBaseURL(value: string, fallback: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed || fallback
}

function normalizeTimeout(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(600000, Math.max(1000, Math.round(value)))
}

function isGenerationToolServer(server: GenerationToolServer | null): server is GenerationToolServer {
  return server !== null
}

function normalizeServer(server?: Partial<GenerationToolServer> | null): GenerationToolServer | null {
  if (!server) return null
  const type: GenerationToolServerType = server.type === 'webui' ? 'webui' : 'comfyui'
  const fallback = type === 'comfyui' ? 'http://127.0.0.1:8188' : 'http://127.0.0.1:7860'
  const authKind: GenerationToolAuthKind = server.authKind === 'basic' || server.authKind === 'bearer' ? server.authKind : 'none'
  return {
    id: typeof server.id === 'string' && server.id.trim() ? server.id : newLocalServerId(),
    scope: server.scope === 'admin' ? 'admin' : server.scope === 'org' ? 'org' : 'local',
    type,
    name: server.name?.trim() || (type === 'comfyui' ? 'ComfyUI' : 'Stable Diffusion WebUI'),
    enabled: Boolean(server.enabled),
    baseURL: normalizeBaseURL(server.baseURL ?? '', fallback),
    timeoutMS: normalizeTimeout(server.timeoutMS ?? 0, 120000),
    priority: Number.isFinite(server.priority) ? Math.round(server.priority ?? 50) : 50,
    authKind,
    username: server.username?.trim() ?? '',
    password: server.password ?? '',
    passwordSet: server.passwordSet ?? false,
    token: server.token ?? '',
    tokenSet: server.tokenSet ?? false,
    tags: Array.isArray(server.tags) ? Array.from(new Set(server.tags.map((tag) => tag.trim()).filter(Boolean))) : [],
  }
}

function newLocalServerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `local-${crypto.randomUUID()}`
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
