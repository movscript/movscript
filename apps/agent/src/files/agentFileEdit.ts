import { createHash } from 'node:crypto'
import type { JSONValue } from '../types.js'

export interface AgentFileDescriptor {
  provider: string
  kind: string
  ref: string
  id: string
  title?: string
  updatedAt?: string
  metadata?: Record<string, JSONValue>
}

export interface AgentFileReadResult {
  file: AgentFileDescriptor
  content: string
  contentLength: number
  revision: string
  validation?: JSONValue
}

export interface AgentFileSearchMatch {
  line: number
  column: number
  excerpt: string
}

export interface AgentFileSearchResult {
  file: AgentFileDescriptor
  query: string
  revision: string
  matches: AgentFileSearchMatch[]
  matchCount: number
}

export type AgentFileEdit =
  | {
      type: 'replace_text'
      oldText: string
      newText: string
      replaceAll?: boolean
    }
  | {
      type: 'set_content'
      content: string
    }

export interface AgentFileEditPrecondition {
  baseRevision?: string
}

export interface AgentFileChangeSet {
  id: string
  fileRef: string
  baseRevision: string
  nextRevision: string
  edits: AgentFileEdit[]
  replacementCount: number
  validation?: JSONValue
  createdByRunId?: string
  createdAt: string
}

export interface AgentFileEditResult {
  file: AgentFileDescriptor
  changeSet: AgentFileChangeSet
  contentLength: number
  validation?: JSONValue
}

export function contentRevision(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

export function applyAgentFileEdits(content: string, edits: AgentFileEdit[]): {
  content: string
  replacementCount: number
} {
  let next = content
  let replacementCount = 0
  for (const edit of edits) {
    if (edit.type === 'set_content') {
      if (edit.content === next) throw new Error('set_content edit must change content')
      next = edit.content
      replacementCount += 1
      continue
    }
    if (edit.oldText === edit.newText) throw new Error('replace_text edit must change content')
    const matches = countOccurrences(next, edit.oldText)
    if (edit.replaceAll === true) {
      if (matches === 0) throw new Error('replace_text oldText was not found')
      next = next.split(edit.oldText).join(edit.newText)
      replacementCount += matches
      continue
    }
    if (matches !== 1) throw new Error(`replace_text oldText must match exactly once; found ${matches}`)
    next = next.replace(edit.oldText, edit.newText)
    replacementCount += 1
  }
  return { content: next, replacementCount }
}

function countOccurrences(value: string, needle: string): number {
  if (needle.length === 0) throw new Error('replace_text oldText must not be empty')
  let count = 0
  let index = 0
  while (true) {
    index = value.indexOf(needle, index)
    if (index === -1) return count
    count += 1
    index += needle.length
  }
}

