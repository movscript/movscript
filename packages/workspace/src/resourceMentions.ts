export interface MovScriptResourceMention {
  id: number
  token: string
  index: number
}

export type MovScriptResourceMentionPart =
  | { type: 'text'; text: string; key: string }
  | { type: 'resource'; resourceId: number; token: string; key: string }

export const MOVSCRIPT_RESOURCE_MENTION_PATTERN = '@[resource:ID]'
export const MOVSCRIPT_LEGACY_RESOURCE_MENTION_PATTERN = '[[resource::ID]]'

const RESOURCE_MENTION_RE = /@\[resource:(\d+)\]|\[\[resource::(\d+)\]\]/g

export function formatResourceMention(resourceId: number): string {
  return `@[resource:${String(resourceId)}]`
}

export function parseResourceMentions(text: string | undefined | null): MovScriptResourceMention[] {
  const mentions: MovScriptResourceMention[] = []
  for (const match of (text ?? '').matchAll(RESOURCE_MENTION_RE)) {
    const index = match.index
    if (index === undefined) continue
    const id = Number(match[1] ?? match[2])
    if (!Number.isInteger(id) || id <= 0) continue
    mentions.push({ id, token: match[0], index })
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
    })
    lastIndex = mention.index + mention.token.length
  }
  if (lastIndex < text.length || parts.length === 0) {
    parts.push({ type: 'text', key: `text-${partIndex++}`, text: text.slice(lastIndex) })
  }
  return parts
}
