import { createHash } from 'node:crypto'

export function stableMediaWorkspacePathPart(value: string): string {
  const trimmed = value.trim()
  const readable = trimmed
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72) || 'default'
  const hash = createHash('sha256').update(trimmed || 'default').digest('hex').slice(0, 10)
  return `${readable}--${hash}`
}
