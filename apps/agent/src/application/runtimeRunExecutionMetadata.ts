import type { NormalizedClientInput } from '../context/normalizeClientInput.js'
import type { AgentStore } from '../state/store.js'
import type { AgentRun, JSONValue } from '../state/types.js'

export function applyRuntimeRunExecutionMetadata(input: {
  store: Pick<AgentStore, 'updateRun'>
  run: AgentRun
  userRequest: string
  clientInput?: NormalizedClientInput
}): void {
  input.run.metadata = {
    ...(input.run.metadata ?? {}),
    userRequest: input.userRequest,
    ...(input.clientInput ? { clientInput: input.clientInput as unknown as JSONValue } : {}),
  }
  input.store.updateRun(input.run)
}
