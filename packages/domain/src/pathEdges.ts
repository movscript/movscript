import type {
  MovScriptDomainDiagnostic,
  MovScriptDomainRef,
  MovScriptNormalizedPathParentEdge,
} from './types.js'

export function normalizePathParentEdge(
  child: MovScriptDomainRef,
  parent: MovScriptDomainRef | undefined,
): MovScriptNormalizedPathParentEdge {
  if (!parent) {
    return {
      diagnostics: [{
        severity: 'warning',
        code: 'path_parent_missing',
        message: `no path parent found for ${child.kind}`,
      }],
    }
  }
  return {
    edge: {
      source: child,
      target: parent,
      relation: 'parent',
      origin: 'path',
    },
    diagnostics: [],
  }
}

export function entityDir(path: string): string {
  return path.replace(/\/[^/]+$/, '')
}

export function nearestParentPath(path: string, candidates: Iterable<string>): string | undefined {
  const candidateSet = new Set(candidates)
  const parts = path.split('/').filter(Boolean)
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const candidate = parts.slice(0, index).join('/')
    if (candidateSet.has(candidate)) return candidate
  }
  return undefined
}

export function assertExplicitParentRefMatchesPath(input: {
  child: MovScriptDomainRef
  pathParent?: MovScriptDomainRef
  explicitParentRef?: string | number
  field: string
  path?: string
}): MovScriptDomainDiagnostic[] {
  const explicitParentRef = idString(input.explicitParentRef)
  if (!explicitParentRef || !input.pathParent) return []
  if (domainRefMatches(input.pathParent, explicitParentRef)) return []

  const pathParentLabel = [
    input.pathParent.kind,
    input.pathParent.id !== undefined ? String(input.pathParent.id) : undefined,
    input.pathParent.path,
  ].filter(Boolean).join(' ')
  return [{
    severity: 'error',
    code: 'path_parent_ref_conflict',
    field: input.field,
    ...(input.path ? { path: input.path } : {}),
    message: `${input.child.kind} ${input.field} ${explicitParentRef} conflicts with path parent ${pathParentLabel}; source path is the canonical instance parent`,
  }]
}

function domainRefMatches(ref: MovScriptDomainRef, value: string): boolean {
  const normalizedValue = normalizePathLike(value)
  if (ref.id !== undefined && String(ref.id) === value) return true
  if (ref.path) {
    const normalizedPath = normalizePathLike(ref.path)
    const normalizedDir = domainRefDir(normalizedPath)
    if (normalizedPath === normalizedValue) return true
    if (normalizedDir === normalizedValue) return true
  }
  const pathTail = ref.path ? domainRefDir(normalizePathLike(ref.path)).split('/').filter(Boolean).at(-1) : undefined
  return pathTail !== undefined && pathTail === value
}

function idString(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function domainRefDir(path: string): string {
  return path.endsWith('.json') ? entityDir(path) : path
}
