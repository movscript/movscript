import type { JSONValue } from '../types.js'
import { parseToolResult } from '../runtime/context.js'
import type { AgentRun, AgentMessage, ToolCallOutcome } from '../runtime/types.js'
import type { AgentMemory, AgentMemoryKind, CreateMemoryInput } from './types.js'
import type { AgentMemoryStore } from './memoryStore.js'
import { formatToolNameForDisplay, publicToolName } from '../tools/toolNames.js'

export interface RelevantMemoryContext {
  projectId?: number
  query?: string
  limit?: number
}

export interface MemoryExtractionInput {
  run: AgentRun
  userMessage: AgentMessage
  projectId?: number
  toolResults: ToolCallOutcome[]
  warnings: string[]
}

export interface MemorySearchInput {
  projectId?: number
  kind?: AgentMemoryKind
  query?: string
  limit?: number
}

export interface MemoryListInput {
  projectId?: number
  kind?: AgentMemoryKind
  limit?: number
}

export interface MemoryLookupInput {
  projectId?: number
  id: string
}

export class MemoryManager {
  constructor(private readonly store: AgentMemoryStore) {}

  loadRelevantMemories(context: RelevantMemoryContext): AgentMemory[] {
    if (typeof context.projectId !== 'number') return []
    return this.searchMemories({
      projectId: context.projectId,
      query: context.query,
      limit: context.limit ?? 6,
    })
  }

  searchMemories(query: MemorySearchInput): AgentMemory[] {
    if (typeof query.projectId !== 'number') return []
    return rankMemories(this.store.listMemories({
      projectId: query.projectId,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.query ? { query: query.query } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    }), query).slice(0, clampLimit(query.limit))
  }

  listMemorySummaries(query: MemoryListInput): Array<Pick<AgentMemory, 'id' | 'projectId' | 'title' | 'kind' | 'updatedAt'>> {
    if (typeof query.projectId !== 'number') return []
    return this.store.listMemories({
      projectId: query.projectId,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    }).map((memory) => ({
      id: memory.id,
      projectId: memory.projectId,
      title: memory.title,
      kind: memory.kind,
      updatedAt: memory.updatedAt,
    }))
  }

  getMemory(query: MemoryLookupInput): AgentMemory | undefined {
    if (typeof query.projectId !== 'number') return undefined
    const memory = this.store.getMemory(query.id)
    if (!memory || memory.projectId !== query.projectId) return undefined
    return memory
  }

  createMemory(input: CreateMemoryInput): AgentMemory {
    return this.store.createMemory(input)
  }

  deleteMemory(input: MemoryLookupInput): boolean {
    const memory = this.getMemory(input)
    if (!memory) return false
    return this.store.deleteMemory(memory.id)
  }

  extractAndWriteMemories(input: MemoryExtractionInput): AgentMemory[] {
    if (typeof input.projectId !== 'number') return []
    const writes: CreateMemoryInput[] = []
    const preference = extractPreference(input.userMessage.content)
    if (preference) {
      writes.push({
        projectId: input.projectId,
        title: buildMemoryTitle('preference', preference),
        kind: 'preference',
        content: preference,
        ...(input.userMessage.threadId ? { sourceThreadId: input.userMessage.threadId } : {}),
        sourceRunId: input.run.id,
        sourceMessageId: input.userMessage.id,
      })
    }

    for (const outcome of input.toolResults) {
      if (publicToolName(outcome.call.name) === 'movscript_create_draft' && !outcome.error) {
        const memory = describeDraftMemory(outcome.result)
        writes.push({
          projectId: input.projectId,
          title: memory.title,
          kind: 'draft',
          content: memory.content,
          ...(input.userMessage.threadId ? { sourceThreadId: input.userMessage.threadId } : {}),
          sourceRunId: input.run.id,
          sourceMessageId: input.userMessage.id,
        })
      }

      if ((publicToolName(outcome.call.name) === 'movscript_read_item' || publicToolName(outcome.call.name) === 'movscript_search_items') && !outcome.error) {
        const memory = describeEntityRefMemory(outcome)
        writes.push({
          projectId: input.projectId,
          title: memory.title,
          kind: 'item_ref',
          content: memory.content,
          ...(input.userMessage.threadId ? { sourceThreadId: input.userMessage.threadId } : {}),
          sourceRunId: input.run.id,
          sourceMessageId: input.userMessage.id,
        })
      }

      if (outcome.error) {
        writes.push({
          projectId: input.projectId,
          title: `警告：${formatToolNameForDisplay(outcome.call.name)}`,
          kind: 'warning',
          content: `${formatToolNameForDisplay(outcome.call.name)} failed: ${outcome.error}`,
          ...(input.userMessage.threadId ? { sourceThreadId: input.userMessage.threadId } : {}),
          sourceRunId: input.run.id,
          sourceMessageId: input.userMessage.id,
        })
      }
    }

    for (const warning of input.warnings) {
      writes.push({
        projectId: input.projectId,
        title: buildMemoryTitle('warning', warning),
        kind: 'warning',
        content: warning,
        ...(input.userMessage.threadId ? { sourceThreadId: input.userMessage.threadId } : {}),
        sourceRunId: input.run.id,
        sourceMessageId: input.userMessage.id,
      })
    }

    return writes
      .filter((memory) => memory.title.trim().length > 0 && memory.content.trim().length > 0)
      .map((memory) => this.store.createMemory(memory))
  }
}

function rankMemories(memories: AgentMemory[], query: MemorySearchInput): AgentMemory[] {
  const terms = tokenize(query.query)
  return memories
    .map((memory) => ({ memory, score: scoreMemory(memory, terms, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.memory.updatedAt.localeCompare(a.memory.updatedAt))
    .map((item) => item.memory)
}

function scoreMemory(memory: AgentMemory, terms: string[], query: MemorySearchInput): number {
  let score = 1
  if (query.kind && memory.kind === query.kind) score += 2
  if (memory.projectId === query.projectId) score += 1
  if (terms.length === 0) return score
  const haystack = `${memory.title}\n${memory.content}`.toLowerCase()
  const matches = terms.filter((term) => haystack.includes(term)).length
  return matches > 0 ? score + matches * 3 : 0
}

function tokenize(input: string | undefined): string[] {
  if (!input) return []
  const normalized = input.toLowerCase()
  const terms = normalized.split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length >= 2)
  const cjkTerms = Array.from(normalized.matchAll(/[\p{Script=Han}]{2,}/gu))
    .flatMap((match) => cjkNgrams(match[0]))
  return Array.from(new Set([...terms, ...cjkTerms])).slice(0, 32)
}

function cjkNgrams(input: string): string[] {
  const grams: string[] = []
  for (let size = 2; size <= Math.min(6, input.length); size += 1) {
    for (let index = 0; index <= input.length - size; index += 1) {
      grams.push(input.slice(index, index + size))
    }
  }
  return grams
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return 8
  return Math.max(1, Math.min(25, Math.floor(limit)))
}

function extractPreference(message: string): string | undefined {
  if (!/(记住|以后|默认|偏好|不要|总是|remember|default|prefer|always|never)/i.test(message)) return undefined
  return message.trim()
}

function describeDraftMemory(result: JSONValue | undefined): { title: string; content: string } {
  const parsed = parseToolResult(result ?? null)
  if (isRecord(parsed)) {
    const id = parsed.id ?? parsed.ID
    const title = parsed.title
    const displayTitle = typeof title === 'string' && title.trim() ? title.trim() : '草稿'
    return {
      title: `草稿：${truncate(displayTitle, 24)}`,
      content: `Created draft${id ? ` ${String(id)}` : ''}${title ? `: ${String(title)}` : ''}.`,
    }
  }
  return { title: '草稿', content: 'Created draft.' }
}

function describeEntityRefMemory(outcome: ToolCallOutcome): { title: string; content: string } {
  if (publicToolName(outcome.call.name) === 'movscript_read_item') {
    const itemType = String(outcome.call.args?.itemType ?? outcome.call.args?.entityType ?? 'item')
    const itemId = String(outcome.call.args?.itemId ?? outcome.call.args?.entityId ?? '')
    return {
      title: `引用：${itemType} ${itemId}`.trim(),
      content: `Read business item ${itemType} ${itemId}.`,
    }
  }
  const parsed = parseToolResult(outcome.result ?? null)
  const count = isRecord(parsed) && Array.isArray(parsed.results) ? parsed.results.length : undefined
  const query = String(outcome.call.args?.query ?? '')
  return {
    title: `搜索引用：${truncate(query, 24) || '项目内容'}`,
    content: `Searched business items with query "${query}"${typeof count === 'number' ? `, found ${count}` : ''}.`,
  }
}

function buildMemoryTitle(kind: AgentMemoryKind, content: string): string {
  const prefixMap: Record<AgentMemoryKind, string> = {
    preference: '偏好',
    fact: '事实',
    item_ref: '引用',
    entity_ref: '引用',
    draft: '草稿',
    decision: '决策',
    warning: '警告',
  }
  return `${prefixMap[kind]}：${truncate(content, 24)}`
}

function truncate(value: string, limit: number): string {
  const text = value.trim()
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
