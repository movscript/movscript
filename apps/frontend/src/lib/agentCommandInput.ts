import type { AgentClientInput } from './localAgentClient'

export type AgentInputMode = 'chat' | 'plan' | 'create' | 'review'

type AgentSelectionHint = {
  entityType?: string
  entityId?: number | string
  label?: string
} | null

export function normalizeAgentCommandMessage(message: string, mode: AgentInputMode = 'chat'): string {
  const trimmed = message.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('/')) return trimmed
  if (mode === 'plan') return `/production_plan ${trimmed}`
  if (mode === 'create') return `/draft ${trimmed}`
  if (mode === 'review') return `/project_structure ${trimmed}`
  return trimmed
}

export function buildCommandFirstClientInput(input: {
  message: string
  attachments?: AgentClientInput['attachments']
  labels?: string[]
  hints?: {
    projectId?: number
    productionId?: number
    selection?: AgentSelectionHint
  }
}): AgentClientInput {
  return {
    message: input.message,
    ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
    ...((input.labels?.length || input.hints) ? {
      uiSnapshot: {
        ...(input.hints?.projectId !== undefined ? { project: { id: input.hints.projectId } } : {}),
        ...(input.hints?.productionId !== undefined ? { productionId: input.hints.productionId } : {}),
        ...(input.hints && 'selection' in input.hints ? { selection: input.hints.selection ?? null } : {}),
        ...(input.labels?.length ? { labels: input.labels } : {}),
      },
    } : {}),
  }
}
