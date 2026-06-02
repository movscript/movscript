import { isValidAgentProjectId } from '../../context/runtime/runtimeContext.js'

export type AgentMemoryKind = 'preference' | 'fact' | 'item_ref' | 'entity_ref' | 'workspace' | 'decision' | 'warning'

export interface AgentMemory {
  id: string
  projectId: number
  title: string
  kind: AgentMemoryKind
  content: string
  sourceThreadId?: string
  sourceRunId?: string
  sourceMessageId?: string
  createdAt: string
  updatedAt: string
}

export interface MemoryQuery {
  projectId?: number
  kind?: AgentMemoryKind
  query?: string
  limit?: number
}

export interface CreateMemoryInput {
  projectId: number
  title: string
  kind: AgentMemoryKind
  content: string
  sourceThreadId?: string
  sourceRunId?: string
  sourceMessageId?: string
}

export function isValidMemoryProjectId(value: unknown): value is number {
  return isValidAgentProjectId(value)
}
