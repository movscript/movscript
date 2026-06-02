import {
  normalizeClientInput,
  type NormalizedClientInput,
} from '../../../../context/input/client/normalizeClientInput.js'
import type { AgentStore } from '../../../../state/store/core/store.js'
import type {
  AgentThread,
  CreateRunInput,
} from '../../../../state/shared/types.js'
import { requireRuntimeThread } from '../../../shared/store/runtimeStoreLookup.js'
import { recordThreadClientInput } from '../../../../messages/thread/threadMessage.js'

export interface RuntimeRunThreadPreparation {
  thread: AgentThread
  clientInput?: NormalizedClientInput
}

export function prepareRuntimeRunThread(input: {
  store: Pick<AgentStore, 'getThread' | 'updateThread'>
  runInput: Pick<CreateRunInput, 'threadId' | 'clientInput'>
}): RuntimeRunThreadPreparation {
  if (typeof input.runInput.threadId !== 'string' || !input.runInput.threadId) {
    throw new Error('threadId is required')
  }
  const thread = requireRuntimeThread(input.store, input.runInput.threadId)
  const clientInput = normalizeClientInput(input.runInput.clientInput)
  if (clientInput) {
    recordThreadClientInput(thread, clientInput)
    input.store.updateThread(thread)
  }
  return {
    thread,
    ...(clientInput ? { clientInput } : {}),
  }
}
