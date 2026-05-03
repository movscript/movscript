import type { JSONValue } from '../../types.js'
import { parseToolResult } from '../context.js'
import type { AgentRun, AgentMessage, ToolCallOutcome } from '../types.js'
import type { AgentMemory, CreateMemoryInput } from './types.js'
import type { AgentMemoryStore } from './memoryStore.js'

export interface RelevantMemoryContext {
  projectId?: number
  threadId: string
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
    const byId = new Map<string, AgentMemory>()
    for (const memory of this.store.listMemories({ scope: 'global' })) byId.set(memory.id, memory)
    if (typeof context.projectId === 'number') {
      for (const memory of this.store.listMemories({ scope: 'project', projectId: context.projectId })) {
        byId.set(memory.id, memory)
      }
    }
    for (const memory of this.store.listMemories({ scope: 'thread', threadId: context.threadId })) {
      byId.set(memory.id, memory)
    }
    return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
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
          content: `${outcome.call.name} failed: ${outcome.error}`,
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
