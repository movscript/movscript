import type { NormalizedClientInput } from '../../../../../context/input/client/normalizeClientInput.js'
import { cloneJSONValue } from '../../../../../shared/json/jsonValue.js'
import type { AgentStore } from '../../../../../state/store/core/store.js'
import type { AgentRun, JSONValue } from '../../../../../state/shared/types.js'

export function applyRuntimeRunExecutionMetadata(input: {
  store: Pick<AgentStore, 'updateRun'>
  run: AgentRun
  userRequest: string
  clientInput?: NormalizedClientInput
}): void {
  input.run.metadata = {
    ...(input.run.metadata ?? {}),
    userRequest: input.userRequest,
    ...(input.clientInput ? { clientInput: cloneJSONValue(input.clientInput as unknown as JSONValue) } : {}),
  }
  input.store.updateRun(input.run)
}
