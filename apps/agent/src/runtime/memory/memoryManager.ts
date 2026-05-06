import type { JSONValue } from '../../types.js'
import { parseToolResult } from '../context.js'
import type { AgentRun, AgentMessage, ToolCallOutcome } from '../types.js'
import type { AgentMemory, AgentMemoryKind, AgentMemoryScope, CreateMemoryInput, MemoryQuery } from './types.js'
import type { AgentMemoryStore } from './memoryStore.js'

export interface RelevantMemoryContext {
  projectId?: number
  threadId: string
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

export class MemoryManager {
  constructor(private readonly store: AgentMemoryStore) {}

  loadRelevantMemories(context: RelevantMemoryContext): AgentMemory[] {
    return this.searchMemories({
      projectId: context.projectId,
      threadId: context.threadId,
      query: context.query,
      limit: context.limit ?? 6,
    })
  }

  searchMemories(query: MemorySearchInput): AgentMemory[] {
    const byId = new Map<string, AgentMemory>()
    if (!query.scope || query.scope === 'global') {
      for (const memory of this.store.listMemories({ scope: 'global', ...(query.kind ? { kind: query.kind } : {}) })) {
        byId.set(memory.id, memory)
      }
    }
    if ((!query.scope || query.scope === 'project') && typeof query.projectId === 'number') {
      for (const memory of this.store.listMemories({ scope: 'project', projectId: query.projectId, ...(query.kind ? { kind: query.kind } : {}) })) {
        byId.set(memory.id, memory)
      }
    }
    if ((!query.scope || query.scope === 'thread') && query.threadId) {
      for (const memory of this.store.listMemories({ scope: 'thread', threadId: query.threadId, ...(query.kind ? { kind: query.kind } : {}) })) {
        byId.set(memory.id, memory)
      }
    }
    return rankMemories(Array.from(byId.values()), query).slice(0, clampLimit(query.limit))
  }

  extractAndWriteMemories(input: MemoryExtractionInput): AgentMemory[] {
    const writes: CreateMemoryInput[] = []
    const preference = extractPreference(input.userMessage.content)
    if (preference) {
      writes.push({
        scope: typeof input.projectId === 'number' ? 'project' : 'thread',
        projectId: input.projectId,
        threadId: typeof input.projectId === 'number' ? undefined : input.userMessage.threadId,
        kind: 'preference',
        content: preference,
        sourceRunId: input.run.id,
        sourceMessageId: input.userMessage.id,
      })
    }

    for (const outcome of input.toolResults) {
      if (outcome.call.name === 'movscript_create_draft' && !outcome.error) {
        writes.push({
          scope: typeof input.projectId === 'number' ? 'project' : 'thread',
          projectId: input.projectId,
          threadId: typeof input.projectId === 'number' ? undefined : input.userMessage.threadId,
          kind: 'draft',
          content: describeDraftMemory(outcome.result),
          sourceRunId: input.run.id,
          sourceMessageId: input.userMessage.id,
        })
      }

      if ((outcome.call.name === 'movscript_read_entity' || outcome.call.name === 'movscript_search_entities') && !outcome.error) {
        writes.push({
          scope: typeof input.projectId === 'number' ? 'project' : 'thread',
          projectId: input.projectId,
          threadId: typeof input.projectId === 'number' ? undefined : input.userMessage.threadId,
          kind: 'entity_ref',
          content: describeEntityRefMemory(outcome),
          sourceRunId: input.run.id,
          sourceMessageId: input.userMessage.id,
        })
      }

      if (outcome.error) {
        writes.push({
          scope: 'thread',
          threadId: input.userMessage.threadId,
          kind: 'warning',
          content: `${formatToolNameForDisplay(outcome.call.name)} failed: ${outcome.error}`,
          sourceRunId: input.run.id,
          sourceMessageId: input.userMessage.id,
        })
      }
    }

    for (const warning of input.warnings) {
      writes.push({
        scope: 'thread',
        threadId: input.userMessage.threadId,
        kind: 'warning',
        content: warning,
        sourceRunId: input.run.id,
        sourceMessageId: input.userMessage.id,
      })
    }

    return writes
      .filter((memory) => memory.content.trim().length > 0)
      .map((memory) => this.store.createMemory(memory))
  }
}

export interface MemorySearchInput {
  projectId?: number
  threadId?: string
  scope?: AgentMemoryScope
  kind?: AgentMemoryKind
  query?: string
  limit?: number
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
  if (query.scope && memory.scope === query.scope) score += 1
  if (memory.threadId && query.threadId && memory.threadId === query.threadId) score += 1.5
  if (typeof memory.projectId === 'number' && memory.projectId === query.projectId) score += 1
  if (terms.length === 0) return score
  const content = memory.content.toLowerCase()
  const matches = terms.filter((term) => content.includes(term)).length
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

function describeDraftMemory(result: JSONValue | undefined): string {
  const parsed = parseToolResult(result ?? null)
  if (isRecord(parsed)) {
    const id = parsed.id ?? parsed.ID
    const title = parsed.title
    return `Created draft${id ? ` ${String(id)}` : ''}${title ? `: ${String(title)}` : ''}.`
  }
  return 'Created draft.'
}

function describeEntityRefMemory(outcome: ToolCallOutcome): string {
  if (outcome.call.name === 'movscript_read_entity') {
    return `Read ${String(outcome.call.args?.entityType ?? 'entity')} ${String(outcome.call.args?.entityId ?? '')}.`
  }
  const parsed = parseToolResult(outcome.result ?? null)
  const count = isRecord(parsed) && Array.isArray(parsed.results) ? parsed.results.length : undefined
  return `Searched entities with query "${String(outcome.call.args?.query ?? '')}"${typeof count === 'number' ? `, found ${count}` : ''}.`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function formatToolNameForDisplay(name: string): string {
  return name.startsWith('movscript_') ? `movscript.${name.slice('movscript_'.length)}` : name
}
