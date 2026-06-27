export interface MovScriptEntityIdSuggestionInput {
  entityKind?: string
  title?: unknown
  fallbackPrefix?: string
}

export interface MovScriptEntityIdAllocationInput extends MovScriptEntityIdSuggestionInput {
  existingIds?: Iterable<unknown>
}

const ENTITY_KIND_FALLBACK_PREFIXES: Record<string, string> = {
  audio_cue: 'audio',
  content_unit: 'cu',
  expression_unit: 'expression',
  keyframe: 'keyframe',
  production: 'production',
  scene_moment: 'scene',
  segment: 'segment',
  setting: 'setting',
  setting_state: 'state',
  state: 'state',
  storyboard: 'storyboard',
  asset: 'asset',
}

export function suggestMovScriptEntityId(input: MovScriptEntityIdSuggestionInput): string {
  const fallbackPrefix = normalizedEntityIdToken(
    input.fallbackPrefix
      ?? (input.entityKind ? ENTITY_KIND_FALLBACK_PREFIXES[input.entityKind] : undefined)
      ?? input.entityKind
      ?? 'item',
  ) || 'item'
  const title = stringField(input.title)
  const titleToken = title ? normalizedEntityIdToken(title) : undefined
  if (titleToken) return titleToken
  if (title) return `${fallbackPrefix}_${stableShortHash(title)}`
  return fallbackPrefix
}

export function allocateMovScriptEntityId(input: MovScriptEntityIdAllocationInput): string {
  const base = suggestMovScriptEntityId(input)
  const existingIds = new Set(
    [...(input.existingIds ?? [])]
      .map((id) => stringField(id)?.toLowerCase())
      .filter((id): id is string => Boolean(id)),
  )
  if (!existingIds.has(base.toLowerCase())) return base
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${base}_${index}`
    if (!existingIds.has(candidate.toLowerCase())) return candidate
  }
  return `${base}_${stableShortHash([...existingIds].join('\n'))}`
}

export function normalizeMovScriptEntityIdToken(value: unknown): string {
  return normalizedEntityIdToken(value) || 'item'
}

function normalizedEntityIdToken(value: unknown): string {
  const text = stringField(value)
  if (!text) return ''
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function stableShortHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36).slice(0, 6)
}

function stringField(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}
