import type { AgentMessage, AgentMessageRole } from '../state/types.js'
import { buildThreadMessage } from './threadLifecycle.js'
import { isoNow, makeId } from './runtimeIdentity.js'

export function createRuntimeMessage(input: {
  threadId: string
  role: AgentMessageRole
  content: string
  runId?: string
  id?: string
  now?: string
}): AgentMessage {
  return buildThreadMessage({
    id: input.id ?? makeId('msg'),
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    runId: input.runId,
    now: input.now ?? isoNow(),
  })
}
