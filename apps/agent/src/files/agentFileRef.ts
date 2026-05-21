export interface AgentFileRefParts {
  provider: string
  id: string
  path: string
}

const AGENT_FILE_REF_PREFIX = 'agent://'

export function parseAgentFileRef(ref: unknown): AgentFileRefParts {
  if (typeof ref !== 'string' || !ref.trim()) {
    throw new Error('agent file ref is required')
  }
  const normalized = ref.trim()
  if (!normalized.startsWith(AGENT_FILE_REF_PREFIX)) {
    throw new Error(`invalid agent file ref: ${normalized}`)
  }
  const body = normalized.slice(AGENT_FILE_REF_PREFIX.length)
  const [provider, id, ...pathParts] = body.split('/').filter((part) => part.length > 0)
  if (!provider || !id) throw new Error(`invalid agent file ref: ${normalized}`)
  return {
    provider,
    id: decodeURIComponent(id),
    path: pathParts.length > 0 ? `/${pathParts.map(decodeURIComponent).join('/')}` : '/content',
  }
}

export function buildAgentFileRef(parts: AgentFileRefParts): string {
  const path = parts.path.startsWith('/') ? parts.path : `/${parts.path}`
  return `${AGENT_FILE_REF_PREFIX}${parts.provider}/${encodeURIComponent(parts.id)}${path.split('/').map((part) => part ? encodeURIComponent(part) : '').join('/')}`
}

