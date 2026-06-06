import type { MCPContextSnapshot, MCPContextUpdate } from './types.js'
import { setMovScriptBackendRuntimeAuthToken } from '../../../backend/runtime.js'

type MCPContextAuthPersistence = (next: MCPContextUpdate) => void

const contextSnapshot: MCPContextSnapshot = {
  route: { pathname: '/', search: '', hash: '' },
  project: null,
  user: null,
  selection: null,
  updatedAt: new Date(0).toISOString(),
}

let contextAuthToken = ''
let persistContextAuth: MCPContextAuthPersistence | undefined

export function setMCPContextAuthPersistence(persist: MCPContextAuthPersistence | undefined): void {
  persistContextAuth = persist
}

export function updateMCPContextSnapshot(next: MCPContextUpdate): void {
  contextSnapshot.route = next.route
  contextSnapshot.project = next.project
  contextSnapshot.productionId = next.productionId
  contextSnapshot.user = next.user
  contextSnapshot.selection = next.selection
  contextSnapshot.updatedAt = next.updatedAt
  contextAuthToken = next.auth?.token ?? ''
  setMovScriptBackendRuntimeAuthToken(contextAuthToken)
  persistContextAuth?.(next)
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
  if (!search || !search.includes('workspaceId')) return search
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (!params.has('workspaceId')) return search
  params.delete('workspaceId')
  const next = params.toString()
  return next ? `?${next}` : ''
}
