import { createHash } from 'node:crypto'
import type { JSONValue } from '../../../shared/protocol/types.js'

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
      type: 'apply_patch'
      patch: string
    }
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
    if (edit.type === 'apply_patch') {
      const result = applyTextPatch(next, edit.patch)
      next = result.content
      replacementCount += result.replacementCount
      continue
    }
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

interface ParsedPatchHunk {
  oldText: string
  newText: string
}

function applyTextPatch(content: string, patch: string): { content: string; replacementCount: number } {
  const hunks = parseTextPatch(patch)
  let next = content
  let replacementCount = 0
  for (const hunk of hunks) {
    if (hunk.oldText === hunk.newText) throw new Error('apply_patch hunk must change content')
    const matches = countOccurrences(next, hunk.oldText)
    if (matches !== 1) throw new Error(`apply_patch hunk old text must match exactly once; found ${matches}`)
    next = next.replace(hunk.oldText, hunk.newText)
    replacementCount += 1
  }
  return { content: next, replacementCount }
}

function parseTextPatch(patch: string): ParsedPatchHunk[] {
  const lines = patch.replace(/\r\n/g, '\n').split('\n')
  if (lines[0] !== '*** Begin Patch') throw new Error('apply_patch must start with *** Begin Patch')
  if (!lines.some((line) => line === '*** End Patch')) throw new Error('apply_patch must end with *** End Patch')
  const hunks: ParsedPatchHunk[] = []
  let index = 1
  while (index < lines.length) {
    const line = lines[index]
    if (line === '*** End Patch') break
    if (line === '' || line?.startsWith('*** Update File: ')) {
      index += 1
      continue
    }
    if (line !== '@@' && !line?.startsWith('@@ ')) {
      throw new Error(`apply_patch expected hunk header, got: ${line ?? '(eof)'}`)
    }
    index += 1
    const oldLines: string[] = []
    const newLines: string[] = []
    while (index < lines.length) {
      const hunkLine = lines[index] ?? ''
      if (hunkLine === '*** End Patch' || hunkLine.startsWith('@@') || hunkLine.startsWith('*** Update File: ')) break
      if (hunkLine.startsWith(' ')) {
        oldLines.push(hunkLine.slice(1))
        newLines.push(hunkLine.slice(1))
      } else if (hunkLine.startsWith('-')) {
        oldLines.push(hunkLine.slice(1))
      } else if (hunkLine.startsWith('+')) {
        newLines.push(hunkLine.slice(1))
      } else {
        throw new Error(`apply_patch hunk lines must start with space, -, or +; got: ${hunkLine}`)
      }
      index += 1
    }
    if (oldLines.length === 0) throw new Error('apply_patch hunk requires at least one context or removed line')
    hunks.push({
      oldText: oldLines.join('\n'),
      newText: newLines.join('\n'),
    })
  }
  if (hunks.length === 0) throw new Error('apply_patch requires at least one hunk')
  return hunks
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
