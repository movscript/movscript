export type OrgGenerationToolServer = {
  id: string
  scope: 'org'
  type: 'comfyui' | 'webui'
  name: string
  enabled: boolean
  base_url: string
  timeout_ms: number
  priority: number
  auth_kind: 'none' | 'basic' | 'bearer'
  username?: string
  password?: string
  password_set?: boolean
  token?: string
  token_set?: boolean
  tags?: string[]
}

export type OrgGenerationToolsSettings = {
  servers: OrgGenerationToolServer[]
  default_server_id?: string
  default_server_ids?: Partial<Record<OrgGenerationToolServer['type'], string>>
  allow_local: boolean
}

export type OrgGenerationToolTestResult = {
  success: boolean
  latency_ms?: number
  status_code?: number
  message?: string
}

export const emptyOrgGenerationToolsSettings: OrgGenerationToolsSettings = {
  servers: [],
  default_server_id: '',
  default_server_ids: {},
  allow_local: true,
}

export function createOrgGenerationToolServer(type: OrgGenerationToolServer['type']): OrgGenerationToolServer {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  return {
    id: `org-${type}-${suffix}`,
    scope: 'org',
    type,
    name: type === 'comfyui' ? '组织 ComfyUI' : '组织 WebUI',
    enabled: true,
    base_url: type === 'comfyui' ? 'http://gpu.example.com:8188' : 'http://webui.example.com:7860',
    timeout_ms: 120000,
    priority: 30,
    auth_kind: 'none',
    username: '',
    password: '',
    token: '',
    tags: [],
  }
}

export function removeServerFromOrgSettings(current: OrgGenerationToolsSettings, id: string): OrgGenerationToolsSettings {
  return {
    ...current,
    servers: current.servers.filter((item) => item.id !== id),
    default_server_id: current.default_server_id === id ? '' : current.default_server_id,
    default_server_ids: clearOrgGenerationToolDefaultServerID(current.default_server_ids, id),
  }
}

export function clearOrgGenerationToolDefaultServerID(
  defaults: OrgGenerationToolsSettings['default_server_ids'] | undefined,
  serverID: string,
): OrgGenerationToolsSettings['default_server_ids'] {
  if (!defaults) return {}
  const next = { ...defaults }
  for (const type of ['comfyui', 'webui'] as const) {
    if (next[type] === serverID) delete next[type]
  }
  return next
}

export function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

export function orgGenerationToolServerValid(server: OrgGenerationToolServer): boolean {
  if (!Number.isFinite(Number(server.timeout_ms)) || Number(server.timeout_ms) < 1000 || Number(server.timeout_ms) > 600000) return false
  if (!server.enabled) return true
  const baseURL = server.base_url.trim()
  return baseURL.startsWith('http://') || baseURL.startsWith('https://')
}

export function orgGenerationToolServerMatchesSaved(current: OrgGenerationToolServer, saved?: OrgGenerationToolServer): boolean {
  if (!saved) return false
  return current.id === saved.id
    && current.scope === saved.scope
    && current.type === saved.type
    && current.name.trim() === saved.name.trim()
    && current.enabled === saved.enabled
    && current.base_url.trim() === saved.base_url.trim()
    && Number(current.timeout_ms) === Number(saved.timeout_ms)
    && Number(current.priority) === Number(saved.priority)
    && current.auth_kind === saved.auth_kind
    && (current.username ?? '').trim() === (saved.username ?? '').trim()
    && !current.password
    && !current.token
    && Boolean(current.password_set) === Boolean(saved.password_set)
    && Boolean(current.token_set) === Boolean(saved.token_set)
    && normalizedStringArrayEquals(normalizeOrgGenerationToolTags(current.tags), normalizeOrgGenerationToolTags(saved.tags))
}

export function normalizeOrgGenerationToolTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const tag of tags ?? []) {
    const next = tag.trim()
    if (!next || seen.has(next)) continue
    seen.add(next)
    normalized.push(next)
  }
  return normalized
}

function normalizedStringArrayEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}
