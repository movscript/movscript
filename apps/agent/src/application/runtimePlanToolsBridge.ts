import type { AgentStore } from '../state/store.js'
import type { AgentMessage, AgentRun, JSONValue } from '../state/types.js'
import { isoNow } from './runtimeIdentity.js'
import { updateRuntimePlan } from './runtimePlanTools.js'

export interface RuntimePlanToolsBridge {
  updatePlan: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
}

export function createRuntimePlanToolsBridge(input: {
  store: AgentStore
  emitAssistantMessage: (run: AgentRun, message: AgentMessage) => void
  now?: () => string
}): RuntimePlanToolsBridge {
  const now = input.now ?? isoNow
  return {
    updatePlan: (run, request = {}) => {
      const result = updateRuntimePlan({
        store: input.store,
        run,
        request,
        now: now(),
      })
      if (result.message) input.emitAssistantMessage(run, result.message)
      return result as unknown as JSONValue
    },
  }
}
