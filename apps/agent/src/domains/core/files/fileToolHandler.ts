import { isJSONRecord, isJSONValue } from '../../../jsonValue.js'
import type { RuntimeToolHandler } from '../../../ports/runtime/runtimeToolHandlerPort.js'
import type { JSONValue } from '../../../state/types.js'
import type { AgentFileSearchMatch } from '../../../files/agentFileEdit.js'
import type { AgentFileEdit } from '../../../files/agentFileSystem.js'

export function createCoreFileToolHandler(): RuntimeToolHandler {
  return {
    toolNames: [
      'core_file_read',
      'core_file_search',
      'core_file_edit',
    ],
    async execute({ call, args, run, resourceFilePort, fileSystem, signal }) {
      if (call.name === 'core_file_read') {
        const ref = stringField(args.ref)
        if (!ref) throw new Error('core_file_read requires ref')
        if (resourceFilePort.isResourceRef(ref)) {
          const read = await resourceFilePort.readFile(ref, {
            startLine: positiveIntegerField(args.startLine ?? args.start_line),
            lineCount: positiveIntegerField(args.lineCount ?? args.line_count),
            contentLimit: Math.max(1, Math.min(Math.floor(numberField(args.contentLimit ?? args.content_limit) ?? 20000), 100000)),
            signal,
          })
          return { result: read as unknown as JSONValue }
        }
        const read = fileSystem.read({ ref })
        const jsonPointer = stringField(args.jsonPointer ?? args.json_pointer)
        const startLine = positiveIntegerField(args.startLine ?? args.start_line)
        const lineCount = positiveIntegerField(args.lineCount ?? args.line_count)
        const contentLimit = Math.max(1, Math.min(Math.floor(numberField(args.contentLimit ?? args.content_limit) ?? 20000), 100000))
        const base = {
          status: 'read',
          file: read.file as unknown as JSONValue,
          ref: read.file.ref,
          revision: read.revision,
          contentLength: read.contentLength,
          ...(read.validation !== undefined ? { validation: read.validation } : {}),
        }
        if (jsonPointer) {
          return {
            result: {
              ...base,
              jsonPointer,
              value: selectJSONPointerValue(read.content, jsonPointer) as JSONValue,
            } as unknown as JSONValue,
          }
        }
        if (startLine !== undefined || lineCount !== undefined) {
          const range = selectLineRange(read.content, {
            startLine: startLine ?? 1,
            lineCount: Math.min(lineCount ?? 120, 1000),
          })
          const limitedContent = range.content.length > contentLimit ? range.content.slice(0, contentLimit) : range.content
          return {
            result: {
              ...base,
              startLine: range.startLine,
              endLine: range.endLine,
              totalLines: range.totalLines,
              content: limitedContent,
              truncated: range.truncated || range.content.length > contentLimit,
            } as unknown as JSONValue,
          }
        }
        return {
          result: {
            ...base,
            content: read.content.length > contentLimit ? read.content.slice(0, contentLimit) : read.content,
            truncated: read.content.length > contentLimit,
          } as unknown as JSONValue,
        }
      }

      if (call.name === 'core_file_search') {
        const ref = stringField(args.ref)
        if (!ref) throw new Error('core_file_search requires ref')
        const query = stringField(args.query)
        const limit = Math.max(1, Math.min(Math.floor(numberField(args.limit) ?? 20), 100))
        if (!query) throw new Error('core_file_search requires query')
        if (resourceFilePort.isResourceRef(ref)) {
          const read = await resourceFilePort.readFile(ref, { signal })
          const matches = searchPlainTextContent(String(read.content ?? ''), query, limit)
          return {
            result: {
              status: 'searched',
              file: read.file,
              ref,
              revision: read.revision,
              query,
              matches: matches as unknown as JSONValue,
              matchCount: matches.length,
            } as unknown as JSONValue,
          }
        }
        const result = fileSystem.search({ ref, query, limit })
        return {
          result: {
            status: 'searched',
            file: result.file as unknown as JSONValue,
            ref: result.file.ref,
            revision: result.revision,
            query,
            matches: result.matches as unknown as JSONValue,
            matchCount: result.matchCount,
          } as unknown as JSONValue,
        }
      }

      if (call.name === 'core_file_edit') {
        const ref = stringField(args.ref)
        if (!ref) throw new Error('core_file_edit requires ref')
        if (resourceFilePort.isResourceRef(ref)) throw new Error(`core_file_edit cannot edit readonly MCP resource: ${ref}`)
        const edits = normalizeAgentFileEdits(args.edits, args.patch)
        const baseRevision = stringField(args.baseRevision ?? args.base_revision)
        const result = fileSystem.edit({
          ref,
          edits,
          precondition: baseRevision ? { baseRevision } : undefined,
          createdByRunId: run.id,
        })
        return {
          result: {
            status: 'edited',
            file: result.file as unknown as JSONValue,
            ref: result.file.ref,
            changeSet: result.changeSet as unknown as JSONValue,
            replacementCount: result.changeSet.replacementCount,
            ...(result.validation !== undefined ? { validation: result.validation } : {}),
          } as unknown as JSONValue,
        }
      }

      return undefined
    },
  }
}

function stringField(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function numberField(value: JSONValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function positiveIntegerField(value: JSONValue | undefined): number | undefined {
  const number = numberField(value)
  if (number === undefined) return undefined
  const integer = Math.floor(number)
  return integer > 0 ? integer : undefined
}

function selectJSONPointerValue(content: string, path: string): JSONValue {
  let value: unknown
  try {
    value = JSON.parse(content) as unknown
  } catch (error) {
    throw new Error(`read_draft_file jsonPointer requires JSON draft content: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isJSONValue(value)) throw new Error('read_draft_file jsonPointer resolved non-JSON draft content')
  if (path === '') return value
  if (!path.startsWith('/')) throw new Error('read_draft_file jsonPointer must be a JSON pointer')
  let current: unknown = value
  for (const segment of decodeToolJSONPointer(path)) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) throw new Error(`jsonPointer array path does not exist: ${path}`)
      current = current[index]
      continue
    }
    if (!isJSONRecord(current) || !(segment in current)) throw new Error(`jsonPointer object path does not exist: ${path}`)
    current = current[segment]
  }
  if (!isJSONValue(current)) throw new Error(`jsonPointer resolved non-JSON value: ${path}`)
  return current
}

function decodeToolJSONPointer(path: string): string[] {
  if (path === '/') return ['']
  return path.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
}

function selectLineRange(content: string, input: { startLine: number; lineCount: number }): {
  content: string
  startLine: number
  endLine: number
  totalLines: number
  truncated: boolean
} {
  const lines = content.split(/\r?\n/)
  const totalLines = lines.length
  const startLine = Math.min(input.startLine, Math.max(totalLines, 1))
  const startIndex = startLine - 1
  const endIndexExclusive = Math.min(startIndex + input.lineCount, totalLines)
  const selected = lines.slice(startIndex, endIndexExclusive)
  return {
    content: selected.join('\n'),
    startLine,
    endLine: endIndexExclusive,
    totalLines,
    truncated: startLine > 1 || endIndexExclusive < totalLines,
  }
}

function searchPlainTextContent(content: string, query: string, limit: number): AgentFileSearchMatch[] {
  const matches: AgentFileSearchMatch[] = []
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length && matches.length < limit; index += 1) {
    const line = lines[index] ?? ''
    const column = line.indexOf(query)
    if (column === -1) continue
    matches.push({
      line: index + 1,
      column: column + 1,
      excerpt: line.length > 240 ? `${line.slice(0, 237)}...` : line,
    })
  }
  return matches
}

function normalizeAgentFileEdits(value: JSONValue | undefined, patch: JSONValue | undefined): AgentFileEdit[] {
  if (typeof patch === 'string' && patch.trim()) {
    if (value !== undefined) throw new Error('core_file_edit accepts either edits or patch, not both')
    return [{ type: 'apply_patch', patch }]
  }
  if (!Array.isArray(value)) throw new Error('core_file_edit requires edits or patch')
  return value.map((edit) => {
    if (!isJSONRecord(edit)) throw new Error('core_file_edit edit must be an object')
    if (edit.type === 'apply_patch') {
      if (typeof edit.patch !== 'string') throw new Error('apply_patch edit requires patch')
      return { type: 'apply_patch', patch: edit.patch }
    }
    if (edit.type === 'set_content') {
      if (typeof edit.content !== 'string') throw new Error('set_content edit requires content')
      return { type: 'set_content', content: edit.content }
    }
    if (edit.type === 'replace_text') {
      if (typeof edit.oldText !== 'string') throw new Error('replace_text edit requires oldText')
      if (typeof edit.newText !== 'string') throw new Error('replace_text edit requires newText')
      return {
        type: 'replace_text',
        oldText: edit.oldText,
        newText: edit.newText,
        ...(edit.replaceAll === true ? { replaceAll: true } : {}),
      }
    }
    throw new Error(`unsupported agent file edit type: ${String(edit.type)}`)
  })
}
