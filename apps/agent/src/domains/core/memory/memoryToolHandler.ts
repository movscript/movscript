import type { RuntimeToolHandler } from '../../../ports/runtime/runtimeToolHandlerPort.js'
import type { AgentMemoryKind } from '../../../memory/types.js'
import type { JSONValue } from '../../../state/types.js'
import { isValidAgentProjectId } from '../../../context/runtimeContext.js'

export function createCoreMemoryToolHandler(): RuntimeToolHandler {
  return {
    toolNames: [
      'core_memory_search',
      'core_memory_get',
      'core_memory_create',
      'core_memory_delete',
    ],
    execute({ call, args, memoryManager }) {
      if (call.name === 'core_memory_search') {
        if (!memoryManager) return { result: { memories: [], count: 0 } as unknown as JSONValue }
        const projectId = projectIdField(args.projectId)
        if (projectId === undefined) throw new Error('search_memories requires projectId')
        const memories = memoryManager.searchMemories({
          projectId,
          kind: normalizeMemoryKind(args.kind),
          query: typeof args.query === 'string' ? args.query : undefined,
          limit: typeof args.limit === 'number' ? args.limit : undefined,
        })
        return {
          result: {
            memories: memories.map((memory) => ({
              id: memory.id,
              projectId: memory.projectId,
              title: memory.title,
              kind: memory.kind,
              excerpt: truncate(memory.content, 180),
              updatedAt: memory.updatedAt,
            })),
            count: memories.length,
          } as unknown as JSONValue,
        }
      }

      if (call.name === 'core_memory_get') {
        if (!memoryManager) return { result: null as unknown as JSONValue }
        const projectId = projectIdField(args.projectId)
        const id = stringField(args.id) ?? stringField(args.memoryId)
        if (projectId === undefined) throw new Error('get_memory requires projectId')
        if (!id) throw new Error('get_memory requires id')
        const memory = memoryManager.getMemory({ projectId, id })
        return { result: (memory ?? null) as unknown as JSONValue }
      }

      if (call.name === 'core_memory_create') {
        if (!memoryManager) throw new Error('memory manager unavailable')
        const projectId = projectIdField(args.projectId)
        const title = stringField(args.title)
        const content = stringField(args.content)
        const kind = normalizeMemoryKind(args.kind)
        if (projectId === undefined) throw new Error('create_memory requires projectId')
        if (!title) throw new Error('create_memory requires title')
        if (!kind) throw new Error('create_memory requires kind')
        if (!content) throw new Error('create_memory requires content')
        const memory = memoryManager.createMemory({
          projectId,
          title,
          kind,
          content,
          ...(typeof args.sourceThreadId === 'string' ? { sourceThreadId: args.sourceThreadId } : {}),
          ...(typeof args.sourceRunId === 'string' ? { sourceRunId: args.sourceRunId } : {}),
          ...(typeof args.sourceMessageId === 'string' ? { sourceMessageId: args.sourceMessageId } : {}),
        })
        return { result: memory as unknown as JSONValue }
      }

      if (call.name === 'core_memory_delete') {
        if (!memoryManager) throw new Error('memory manager unavailable')
        const projectId = projectIdField(args.projectId)
        const id = stringField(args.id) ?? stringField(args.memoryId)
        if (projectId === undefined) throw new Error('delete_memory requires projectId')
        if (!id) throw new Error('delete_memory requires id')
        return {
          result: {
            deleted: memoryManager.deleteMemory({ projectId, id }),
          } as unknown as JSONValue,
        }
      }

      return undefined
    },
  }
}

function projectIdField(value: JSONValue | undefined): number | undefined {
  return isValidAgentProjectId(value) ? value : undefined
}

function stringField(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeMemoryKind(value: JSONValue | undefined): AgentMemoryKind | undefined {
  return value === 'preference'
    || value === 'fact'
    || value === 'item_ref'
    || value === 'entity_ref'
    || value === 'draft'
    || value === 'decision'
    || value === 'warning'
    ? value
    : undefined
}

function truncate(value: string, limit: number): string {
  const text = value.trim()
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}
