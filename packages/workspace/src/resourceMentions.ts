export interface MovScriptResourceMention {
  id: number
  token: string
  index: number
  mediaType?: string
  role?: string
}

export type MovScriptResourceMentionPart =
  | { type: 'text'; text: string; key: string }
  | { type: 'resource'; resourceId: number; token: string; key: string; mediaType?: string; role?: string }

export const MOVSCRIPT_RESOURCE_MENTION_PATTERN = '@[resource:MEDIA_TYPE:ROLE:ID]'
export const MOVSCRIPT_LEGACY_RESOURCE_MENTION_PATTERN = '[[resource::ID]]'

const RESOURCE_MENTION_RE = /@\[resource:([^\]\s]+)\]|\[\[resource::(\d+)\]\]/g
const RESOURCE_MEDIA_TYPES = new Set(['image', 'video', 'audio', 'text', 'any'])

export function formatResourceMention(resourceId: number, options: { mediaType?: string; role?: string } = {}): string {
  const id = String(resourceId)
  const mediaType = normalizeMentionPart(options.mediaType)
  const role = normalizeMentionPart(options.role)
  if (mediaType && role) return `@[resource:${mediaType}:${role}:${id}]`
  if (mediaType) return `@[resource:${mediaType}:${id}]`
  if (role) return `@[resource:${role}:${id}]`
  return `@[resource:${id}]`
}

export function parseResourceMentions(text: string | undefined | null): MovScriptResourceMention[] {
  const mentions: MovScriptResourceMention[] = []
  for (const match of (text ?? '').matchAll(RESOURCE_MENTION_RE)) {
    const index = match.index
    if (index === undefined) continue
    const parsed = match[1] ? parseResourceMentionPayload(match[1]) : { id: Number(match[2]) }
    const id = parsed.id
    if (!Number.isInteger(id) || id <= 0) continue
    mentions.push({
      id,
      token: match[0],
      index,
      ...(parsed.mediaType ? { mediaType: parsed.mediaType } : {}),
      ...(parsed.role ? { role: parsed.role } : {}),
    })
  }
  return mentions
}

export function resourceIdsFromMentions(text: string | undefined | null): number[] {
  const ids: number[] = []
  const seen = new Set<number>()
  for (const mention of parseResourceMentions(text)) {
    if (seen.has(mention.id)) continue
    seen.add(mention.id)
    ids.push(mention.id)
  }
  return ids
}

export function stripResourceMentions(text: string): string {
  return text
    .replace(RESOURCE_MENTION_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function splitResourceMentionParts(text: string): MovScriptResourceMentionPart[] {
  const parts: MovScriptResourceMentionPart[] = []
  let lastIndex = 0
  let partIndex = 0
  for (const mention of parseResourceMentions(text)) {
    if (mention.index > lastIndex) {
      parts.push({ type: 'text', key: `text-${partIndex++}`, text: text.slice(lastIndex, mention.index) })
    }
    parts.push({
      type: 'resource',
      key: `resource-${partIndex++}-${String(mention.id)}`,
      resourceId: mention.id,
      token: mention.token,
      ...(mention.mediaType ? { mediaType: mention.mediaType } : {}),
      ...(mention.role ? { role: mention.role } : {}),
    })
    lastIndex = mention.index + mention.token.length
  }
  if (lastIndex < text.length || parts.length === 0) {
    parts.push({ type: 'text', key: `text-${partIndex++}`, text: text.slice(lastIndex) })
  }
  return parts
}

function parseResourceMentionPayload(payload: string): { id: number; mediaType?: string; role?: string } {
  const parts = payload.split(':').map((part) => normalizeMentionPart(part)).filter((part): part is string => Boolean(part))
  if (parts.length === 0) return { id: 0 }
  const id = Number(parts[parts.length - 1])
  if (!Number.isInteger(id) || id <= 0) return { id: 0 }
  const descriptors = parts.slice(0, -1)
  let mediaType = ''
  let role = ''
  if (descriptors.length === 1) {
    const first = descriptors[0] ?? ''
    if (RESOURCE_MEDIA_TYPES.has(first)) {
      mediaType = first
    } else {
      role = first
    }
  } else if (descriptors.length > 1) {
    const first = descriptors[0] ?? ''
    if (RESOURCE_MEDIA_TYPES.has(first)) {
      mediaType = first
      role = descriptors.slice(1).join(':')
    } else {
      role = descriptors.join(':')
    }
  }
  return {
    id,
    ...(mediaType ? { mediaType } : {}),
    ...(role ? { role } : {}),
  }
}

function normalizeMentionPart(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
}
