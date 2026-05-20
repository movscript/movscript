import type { AgentMessage, AgentMessageRole } from '../state/types.js'
import type { JSONValue } from '../types.js'
import { buildThreadMessage } from './threadLifecycle.js'
import { isoNow, makeId } from './runtimeIdentity.js'

export function createRuntimeMessage(input: {
  threadId: string
  role: AgentMessageRole
  content: string
  runId?: string
  metadata?: Record<string, JSONValue>
  id?: string
  now?: string
}): AgentMessage {
  return buildThreadMessage({
    id: input.id ?? makeId('msg'),
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    runId: input.runId,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    now: input.now ?? isoNow(),
  })
}
