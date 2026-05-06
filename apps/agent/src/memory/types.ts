export type AgentMemoryScope = 'global' | 'project' | 'thread'
export type AgentMemoryKind = 'preference' | 'fact' | 'entity_ref' | 'draft' | 'decision' | 'warning'

export interface AgentMemory {
  id: string
  scope: AgentMemoryScope
  projectId?: number
  threadId?: string
  kind: AgentMemoryKind
  content: string
  sourceRunId?: string
  sourceMessageId?: string
  createdAt: string
  updatedAt: string
}

export interface MemoryQuery {
  scope?: AgentMemoryScope
  projectId?: number
  threadId?: string
  kind?: AgentMemoryKind
  query?: string
  limit?: number
}

export interface CreateMemoryInput {
  scope: AgentMemoryScope
  projectId?: number
  threadId?: string
  kind: AgentMemoryKind
  content: string
  sourceRunId?: string
  sourceMessageId?: string
}
