import { createHash } from 'node:crypto'
import {
  ensureMovScriptWorkspaceContext,
  readMovScriptWorkspaceRootManifest,
  resolveMovScriptWorkspaceContextPaths,
  resolveMovScriptWorkspaceRootPaths,
  type MovScriptWorkspaceContextInput,
  type MovScriptWorkspaceContextPaths,
  type MovScriptWorkspaceRealm,
} from '@movscript/core/workspace/node'
import { readMovScriptBackendAuth, readMovScriptBackendConfig } from '@movscript/core/backend/node'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import type { ElectronMovScriptWorkspaceContext } from '../../src/shared/contracts/electronApi'

export interface DesktopWorkspaceRealmContextInput {
  workspaceDir?: string
  workspaceContext?: ElectronMovScriptWorkspaceContext | Record<string, unknown>
  projectId?: string | number
  fallbackCwd?: string | null
}

export function resolveDesktopWorkspaceRealm(workspaceDir = resolveDesktopDefaultMovScriptWorkspaceDir()): MovScriptWorkspaceRealm {
  const config = readMovScriptBackendConfig(workspaceDir)
  if (config.realm?.kind) return config.realm
  const manifest = readMovScriptWorkspaceRootManifest(resolveMovScriptWorkspaceRootPaths(workspaceDir).manifestPath)
  if (manifest?.activeRealm?.kind) return manifest.activeRealm
  if (isLocalBackendBaseURL(config.baseURL)) return { kind: 'local', id: 'local' }
  return { kind: 'cloud', id: cloudRealmId(config.baseURL) }
}

export function resolveDesktopWorkspaceContextPaths(input: DesktopWorkspaceRealmContextInput = {}): MovScriptWorkspaceContextPaths {
  const workspaceDir = input.workspaceDir?.trim() || resolveDesktopDefaultMovScriptWorkspaceDir()
  const workspaceContext = isRecord(input.workspaceContext) ? input.workspaceContext : undefined
  const explicitCwd = typeof input.fallbackCwd === 'string' && input.fallbackCwd.trim() ? input.fallbackCwd : undefined
  if (explicitCwd) {
    throw new Error('Explicit cwd should be handled before resolving a MovScript workspace context.')
  }

  const realm = normalizeWorkspaceContextRealm(workspaceContext) ?? resolveDesktopWorkspaceRealm(workspaceDir)
  const owner = workspaceContextOwner(workspaceContext) ?? activeWorkspaceOwner(workspaceDir, realm)
  const projectId = workspaceContext?.projectId ?? input.projectId
  const scope = workspaceContext?.scope === 'project' || workspaceContext?.scope === 'production' || projectId !== undefined
    ? (workspaceContext?.scope === 'production' ? 'production' : 'project')
    : 'global'
  const context: MovScriptWorkspaceContextInput = {
    workspaceDir,
    realm,
    scope,
    ...owner,
    ...(projectId !== undefined ? { projectId: projectId as string | number } : {}),
  }
  return ensureMovScriptWorkspaceContext(resolveMovScriptWorkspaceContextPaths(context))
}

export function cloudRealmId(baseURL: string | undefined): string {
  const normalized = (baseURL || 'cloud').trim().replace(/\/+$/, '').toLowerCase()
  return createHash('sha256').update(normalized).digest('hex').slice(0, 12)
}

function normalizeWorkspaceContextRealm(context: Record<string, unknown> | undefined): MovScriptWorkspaceRealm | undefined {
  const realm = context?.realm
  if (isRecord(realm)) {
    const kind = realm.kind === 'local' || realm.kind === 'cloud' ? realm.kind : undefined
    const id = typeof realm.id === 'string' || typeof realm.id === 'number' ? String(realm.id) : undefined
    if (kind === 'local') return { kind: 'local', id: 'local' }
    if (kind === 'cloud' && id) return { kind, id }
  }
  const realmKind = context?.realmKind === 'local' || context?.realmKind === 'cloud' ? context.realmKind : undefined
  const realmId = typeof context?.realmId === 'string' || typeof context?.realmId === 'number' ? String(context.realmId) : undefined
  if (realmKind === 'local') return { kind: 'local', id: 'local' }
  if (realmKind === 'cloud' && realmId) return { kind: 'cloud', id: realmId }
  return undefined
}

function workspaceContextOwner(context: Record<string, unknown> | undefined): { userId?: string | number; orgId?: string | number } | undefined {
  const orgId = idField(context?.orgId)
  if (orgId !== undefined) return { orgId }
  const userId = idField(context?.userId)
  if (userId !== undefined) return { userId }
  return undefined
}

function activeWorkspaceOwner(workspaceDir: string, realm: MovScriptWorkspaceRealm): { userId?: string | number; orgId?: string | number } {
  const auth = readMovScriptBackendAuth(workspaceDir, realm)
  const config = readMovScriptBackendConfig(workspaceDir)
  const manifest = readMovScriptWorkspaceRootManifest(resolveMovScriptWorkspaceRootPaths(workspaceDir).manifestPath)
  const userId = idField(auth?.user?.id) ?? idField(config.activeUserId) ?? idField(manifest?.activeUserId)
  if (userId === undefined) throw new Error('MovScript workspace owner requires an active user session')
  return { userId }
}

function isLocalBackendBaseURL(baseURL: string | undefined): boolean {
  const value = baseURL?.trim()
  return !value || /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i.test(value)
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
