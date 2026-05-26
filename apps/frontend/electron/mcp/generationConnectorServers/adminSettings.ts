import { backendGet } from '../backendClient'
import { getMCPAuthToken } from '../context/store'
import { isRecord } from '../valueUtils'
import type {
  GenerationToolServer,
  GenerationToolServerType,
} from '../../../src/shared/contracts/generationTools'

export type RemoteGenerationToolsSettings = {
  servers: GenerationToolServer[]
  allowLocal: boolean
  defaultServerId?: string
  defaultServerIds?: Partial<Record<GenerationToolServerType, string>>
  remoteUnavailable?: boolean
}

export async function fetchAdminGenerationToolsSettings(): Promise<RemoteGenerationToolsSettings> {
  if (!getMCPAuthToken()) return { servers: [], allowLocal: true }
  try {
    const raw = await backendGet('/generation-tools/settings')
    const source = isRecord(raw) ? raw : {}
    const servers = Array.isArray(source.servers)
      ? source.servers.map(normalizeAdminGenerationToolServer).filter((server): server is GenerationToolServer => !!server)
      : []
    return {
      servers,
      allowLocal: source.allow_local !== false,
      defaultServerId: typeof source.default_server_id === 'string' ? source.default_server_id : undefined,
      defaultServerIds: normalizeRemoteDefaultGenerationToolServerIDs(source.default_server_ids),
    }
  } catch {
    return { servers: [], allowLocal: false, remoteUnavailable: true }
  }
}

function normalizeRemoteDefaultGenerationToolServerIDs(raw: unknown): Partial<Record<GenerationToolServerType, string>> {
  if (!isRecord(raw)) return {}
  const out: Partial<Record<GenerationToolServerType, string>> = {}
  if (typeof raw.comfyui === 'string' && raw.comfyui.trim()) out.comfyui = raw.comfyui.trim()
  if (typeof raw.webui === 'string' && raw.webui.trim()) out.webui = raw.webui.trim()
  return out
}

function normalizeAdminGenerationToolServer(raw: unknown): GenerationToolServer | null {
  if (!isRecord(raw)) return null
  const type: GenerationToolServerType = raw.type === 'webui' ? 'webui' : 'comfyui'
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : ''
  const baseURL = typeof raw.base_url === 'string' ? raw.base_url : typeof raw.baseURL === 'string' ? raw.baseURL : ''
  if (!id || !baseURL.trim()) return null
  return {
    id,
    scope: raw.scope === 'org' ? 'org' : 'admin',
    type,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : (type === 'comfyui' ? 'Admin ComfyUI' : 'Admin WebUI'),
    enabled: raw.enabled === true,
    baseURL: baseURL.trim().replace(/\/+$/, ''),
    timeoutMS: typeof raw.timeout_ms === 'number' ? raw.timeout_ms : typeof raw.timeoutMS === 'number' ? raw.timeoutMS : 120000,
    priority: typeof raw.priority === 'number' ? raw.priority : 50,
    authKind: raw.auth_kind === 'basic' || raw.authKind === 'basic' ? 'basic' : raw.auth_kind === 'bearer' || raw.authKind === 'bearer' ? 'bearer' : 'none',
    username: typeof raw.username === 'string' ? raw.username : '',
    password: '',
    passwordSet: raw.password_set === true || raw.passwordSet === true,
    token: '',
    tokenSet: raw.token_set === true || raw.tokenSet === true,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  }
}
