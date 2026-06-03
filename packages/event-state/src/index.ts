import type {
  AgentRuntimeAssistantProgressV2,
  AgentRuntimeEventV2,
  AgentRun,
  AgentThread,
  AgentTraceEvent,
} from '@movscript/protocol'

export function runtimeRunFromEvent(event: AgentRuntimeEventV2): AgentRun | undefined {
  return event.entity?.type === 'run' ? event.entity.value : undefined
}

export function runtimeRunIdFromEvent(event: AgentRuntimeEventV2): string | undefined {
  return event.causality?.runId ?? runtimeRunFromEvent(event)?.id ?? event.assistantProgress?.runId
}

export function runtimeThreadFromEvent(event: AgentRuntimeEventV2): AgentThread | undefined {
  return event.entity?.type === 'thread' ? event.entity.value : undefined
}

export function runtimeTraceFromEvent(event: AgentRuntimeEventV2): AgentTraceEvent | undefined {
  return event.entity?.type === 'trace' ? event.entity.value : undefined
}

export function runtimeThreadTitleFromEvent(event: AgentRuntimeEventV2): string | undefined {
  const title = runtimeThreadFromEvent(event)?.title?.trim()
  return title || undefined
}

export function runtimeAssistantProgressFromEvent(event: AgentRuntimeEventV2): AgentRuntimeAssistantProgressV2 | undefined {
  return event.kind === 'assistant.progress' ? event.assistantProgress : undefined
}

export function runtimeStateShouldRefresh(event: AgentRuntimeEventV2): boolean {
  return event.kind === 'run.upserted'
    || event.kind === 'trace.upserted'
    || event.kind === 'message.upserted'
    || event.kind === 'thread.upserted'
    || event.kind === 'assistant.progress'
    || event.kind === 'interaction.upserted'
    || event.kind === 'work.upserted'
    || event.kind === 'continuation.upserted'
    || event.kind === 'wake_event.upserted'
    || event.kind === 'scope.done'
}
