import { generationProgressListFromEvents, type GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export function generationProgressStatesForPinnedStatus(input: {
  messages: ChatMessage[]
  run: AgentRun | null
  visibleActivityEvents: ChatRunActivityEvent[]
}): GenerationProgressState[] {
  const historicalStates = latestHistoricalGenerationProgressStates(input.messages)
  const liveEvents = [
    ...(input.run?.traceEvents ?? []),
    ...input.visibleActivityEvents,
  ]
  const liveStates = generationProgressListFromEvents(liveEvents)
  return mergeGenerationProgressStates([...historicalStates, ...liveStates])
}

function latestHistoricalGenerationProgressStates(messages: ChatMessage[]): GenerationProgressState[] {
  const states: GenerationProgressState[] = []
  for (const message of messages) {
    if (message.role === 'user') continue
    const generationJobs = message.meta?.generationJobs ?? []
    states.push(...generationJobs)
    const activityEvents = message.meta?.localRunActivity?.events ?? []
    states.push(...generationProgressListFromEvents(activityEvents))
  }
  return mergeGenerationProgressStates(states)
}

function mergeGenerationProgressStates(states: GenerationProgressState[]): GenerationProgressState[] {
  const byKey = new Map<string, GenerationProgressState>()
  const keys: string[] = []
  states.forEach((state, index) => {
    const key = generationProgressStateKey(state, index)
    if (!byKey.has(key)) keys.push(key)
    byKey.set(key, state)
  })
  return keys.map((key) => byKey.get(key)).filter((state): state is GenerationProgressState => !!state)
}

function generationProgressStateKey(state: GenerationProgressState, index: number) {
  if (state.jobId !== undefined) return `job:${state.jobId}`
  if (state.outputResourceId !== undefined) return `resource:${state.outputResourceId}`
  return `index:${index}`
}
