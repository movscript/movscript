import { generationProgressListFromEvents, type GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import type { AgentRun, AgentTimelineItem } from '@movscript/core/agent/protocol'
import type { ChatMessage, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export function generationProgressStatesForPinnedStatus(input: {
  messages: ChatMessage[]
  run: AgentRun | null
  timelineItems?: AgentTimelineItem[]
  visibleActivityEvents: ChatRunActivityEvent[]
}): GenerationProgressState[] {
  const historicalStates = latestHistoricalGenerationProgressStates(input.messages, input.timelineItems ?? [])
  const liveEvents = [
    ...(input.run?.traceEvents ?? []),
    ...input.visibleActivityEvents,
  ]
  const liveStates = generationProgressListFromEvents(liveEvents)
  return mergeGenerationProgressStates([...historicalStates, ...liveStates])
}

function latestHistoricalGenerationProgressStates(messages: ChatMessage[], timelineItems: AgentTimelineItem[]): GenerationProgressState[] {
  const states: GenerationProgressState[] = []
  for (const message of messages) {
    if (message.role === 'user') continue
    const generationJobs = message.meta?.generationJobs ?? []
    states.push(...generationJobs)
  }
  for (const item of timelineItems) {
    const activityEvents = item.activity?.events ?? []
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
