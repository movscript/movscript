import type {
  ProviderSessionEventV2,
  AgentRun,
  AgentThread,
  AgentTraceEvent,
} from '@/shared/infrastructure/providerSessionHttpClient'
import type { ProviderSessionAssistantProgressV2 } from '@movscript/core/agent/protocol'

export function providerSessionRunFromEvent(event: ProviderSessionEventV2): AgentRun | undefined {
  return event.entity?.type === 'run' ? event.entity.value : undefined
}

export function providerSessionRunIdFromEvent(event: ProviderSessionEventV2): string | undefined {
  return event.causality?.runId ?? providerSessionRunFromEvent(event)?.id ?? event.assistantProgress?.runId
}

export function providerSessionThreadFromEvent(event: ProviderSessionEventV2): AgentThread | undefined {
  return event.entity?.type === 'thread' ? event.entity.value : undefined
}

export function providerSessionTraceFromEvent(event: ProviderSessionEventV2): AgentTraceEvent | undefined {
  return event.entity?.type === 'trace' ? event.entity.value : undefined
}

export function providerSessionThreadTitleFromEvent(event: ProviderSessionEventV2): string | undefined {
  const title = providerSessionThreadFromEvent(event)?.title?.trim()
  return title || undefined
}

export function providerSessionAssistantProgressFromEvent(event: ProviderSessionEventV2): ProviderSessionAssistantProgressV2 | undefined {
  return event.kind === 'assistant.progress' ? event.assistantProgress : undefined
}

export function providerSessionStateShouldRefresh(event: ProviderSessionEventV2): boolean {
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
