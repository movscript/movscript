import { safeWorkspacePathToken } from './pathUtils.js'

export interface MovScriptEntityIdentity {
  id: string
  slug: string
}

export function semanticEntityId(value: unknown, entityKind: string, fallback = 'local'): string {
  void entityKind
  return safeWorkspacePathToken(rawIdentityValue(value, fallback))
}

export function entityPathSlug(value: unknown, entityKind?: string, fallback = 'local'): string {
  void entityKind
  return safeWorkspacePathToken(rawIdentityValue(value, fallback))
}

export function entityIdentity(value: unknown, entityKind: string, fallback = 'local'): MovScriptEntityIdentity {
  const id = semanticEntityId(value, entityKind, fallback)
  return {
    id,
    slug: entityPathSlug(id, entityKind, fallback),
  }
}

export function entityRefAliases(value: unknown, entityKind?: string): string[] {
  if (value === undefined || value === null || String(value).trim() === '') return []
  const raw = String(value).trim()
  const normalized = normalizeRefPath(raw)
  const aliases = new Set<string>([raw, normalized])
  if (entityKind) {
    aliases.add(semanticEntityId(raw, entityKind))
    aliases.add(entityPathSlug(raw, entityKind))
    aliases.add(semanticEntityId(normalized, entityKind))
    aliases.add(entityPathSlug(normalized, entityKind))
  }
  return [...aliases].filter(Boolean)
}

export function sameEntityRef(left: unknown, right: unknown, entityKind?: string): boolean {
  const leftAliases = new Set(entityRefAliases(left, entityKind))
  return entityRefAliases(right, entityKind).some((alias) => leftAliases.has(alias))
}

export function displayEntityId(value: string, entityKind: string): string {
  void entityKind
  return value
}

function rawIdentityValue(value: unknown, fallback: string): string {
  if (value === undefined || value === null || String(value).trim() === '') return fallback
  const raw = String(value).trim()
  return raw.startsWith('-') ? `local_${raw.replace(/^-+/, '')}` : raw
}

function normalizeRefPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}
