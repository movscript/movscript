import { generationProgressListFromEvents, type GenerationProgressState } from '@/lib/agentGenerationMedia'
import type { AgentRun } from '@/lib/localAgentClient'
import type { ChatMessage, ChatRunActivityEvent } from '@/store/agentStore'

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
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'user') continue
    const generationJobs = message.meta?.generationJobs ?? []
    if (generationJobs.length > 0) return generationJobs
    const activityEvents = message.meta?.localRunActivity?.events ?? []
    const states = generationProgressListFromEvents(activityEvents)
    if (states.length > 0) return states
  }
  return []
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
