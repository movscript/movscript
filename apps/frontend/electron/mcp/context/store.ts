import type { MCPContextSnapshot, MCPContextUpdate } from '../types'

const contextSnapshot: MCPContextSnapshot = {
  route: { pathname: '/', search: '', hash: '' },
  project: null,
  user: null,
  selection: null,
  updatedAt: new Date(0).toISOString(),
}

let contextAuthToken = ''

export function updateMCPContextSnapshot(next: MCPContextUpdate): void {
  contextSnapshot.route = next.route
  contextSnapshot.project = next.project
  contextSnapshot.productionId = next.productionId
  contextSnapshot.user = next.user
  contextSnapshot.selection = next.selection
  contextSnapshot.updatedAt = next.updatedAt
  contextAuthToken = next.auth?.token ?? ''
}

export function getMCPContextSnapshot(): MCPContextSnapshot {
  return { ...contextSnapshot }
}

export function getMCPFocusSnapshot(): MCPContextSnapshot {
  return {
    ...contextSnapshot,
    route: sanitizeFocusRoute(contextSnapshot.route),
  }
}

export function getMCPAuthToken(): string {
  return contextAuthToken
}

function sanitizeFocusRoute(route: MCPContextSnapshot['route']): MCPContextSnapshot['route'] {
  return {
    ...route,
    search: sanitizeFocusSearch(route.search),
  }
}

function sanitizeFocusSearch(search: string): string {
  if (!search || !search.includes('draftId')) return search
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (!params.has('draftId')) return search
  params.delete('draftId')
  const next = params.toString()
  return next ? `?${next}` : ''
}
