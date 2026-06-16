import type {
  AgentSessionTimelineQuery,
  AgentThreadListQuery,
  AgentThreadMessagesQuery,
  AgentTimelineQuery,
} from '@/shared/infrastructure/provider-session-client/types'

type ProviderSessionQueryValue = boolean | number | string | null | undefined
export type ProviderSessionWorkspaceScopeInput = {
  providerProfileKey?: string
  movScriptHomeDir?: string
  /** @deprecated Use movScriptHomeDir for the desktop control/home directory. */
  workspaceDir?: string
}

export function providerSessionThreadListPath(query: AgentThreadListQuery = {}): string {
  return providerSessionQueryPath('/threads', [
    ['cursor', query.cursor],
    ['limit', query.limit],
    ['includeProvisional', query.includeProvisional === true ? 'true' : undefined],
  ])
}

export function providerSessionThreadMessagesPath(threadId: string, query: AgentThreadMessagesQuery = {}): string {
  return providerSessionQueryPath(`${providerSessionThreadPath(threadId)}/messages`, [
    ['afterOrdinal', query.afterOrdinal],
    ['limit', query.limit],
    ['direction', query.direction === 'desc' ? 'desc' : undefined],
  ])
}

export function providerSessionThreadTimelinePath(threadId: string, query: AgentTimelineQuery = {}): string {
  return providerSessionQueryPath(`${providerSessionThreadPath(threadId)}/timeline`, [
    ['before', query.before],
    ['limit', query.limit],
  ])
}

export function providerSessionTimelinePath(sessionId: string, query: AgentSessionTimelineQuery = {}): string {
  return providerSessionQueryPath(`${providerSessionSessionPath(sessionId)}/timeline`, [
    ['threadId', query.threadId],
    ['before', query.before],
    ['limit', query.limit],
  ])
}

export function providerSessionCapabilitiesPath(query: { projectId?: number } = {}): string {
  return providerSessionQueryPath('/capabilities', [
    ['projectId', query.projectId],
  ])
}

export function providerSessionRunParentListPath(parentRunId: string): string {
  return providerSessionQueryPath('/runs', [
    ['parentRunId', parentRunId],
  ])
}

export function providerSessionThreadPath(threadId: string, suffix?: string): string {
  return providerSessionEncodedPath('/threads', threadId, suffix)
}

export function providerSessionSessionPath(sessionId: string, suffix?: string): string {
  return providerSessionEncodedPath('/sessions', sessionId, suffix)
}

export function providerSessionRunPath(runId: string, suffix?: string): string {
  return providerSessionEncodedPath('/runs', runId, suffix)
}

export function providerSessionWorkspaceScope(
  input: ProviderSessionWorkspaceScopeInput = {},
  fallback: ProviderSessionWorkspaceScopeInput = {},
): ProviderSessionWorkspaceScopeInput {
  const providerProfileKey = input.providerProfileKey ?? fallback.providerProfileKey
  const movScriptHomeDir = input.movScriptHomeDir ?? fallback.movScriptHomeDir ?? input.workspaceDir ?? fallback.workspaceDir
  return {
    ...(providerProfileKey ? { providerProfileKey } : {}),
    ...(movScriptHomeDir ? { movScriptHomeDir, workspaceDir: movScriptHomeDir } : {}),
  }
}

function providerSessionQueryPath(path: string, entries: Array<[string, ProviderSessionQueryValue]>): string {
  const params = new URLSearchParams()
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === false) continue
    params.set(key, String(value))
  }
  return `${path}${params.size ? `?${params.toString()}` : ''}`
}

function providerSessionEncodedPath(base: string, id: string, suffix?: string): string {
  return `${base}/${encodeURIComponent(id)}${suffix ? `/${suffix}` : ''}`
}
