import {
  attachRuntimeThreadContextSummaryToRun,
} from '../context/runtimeThreadContextSummary.js'
import { parseAgentCommand, type AgentCommandRuntime } from '../context/commandRouter.js'
import {
  normalizeClientInput,
  type NormalizedClientInput,
} from '../context/normalizeClientInput.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentThread,
  AgentTraceEvent,
  AgentTraceEventKind,
} from '../state/types.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import {
  resolveRunExecutionInput,
  type ResolvedRunExecutionInput,
} from './runExecutionInput.js'
import { createRuntimeMessage } from './runtimeMessageFactory.js'
import { requireRuntimeThread } from './runtimeStoreLookup.js'

export interface RuntimeRunExecutionContext {
  thread: AgentThread
  executionInput: ResolvedRunExecutionInput
  userMessage: string
  lastUser: AgentMessage
  command: AgentCommandRuntime
  clientInput?: NormalizedClientInput
}

export interface RuntimeRunExecutionContextTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  data?: unknown
}

export function loadRuntimeRunExecutionContext(input: {
  store: Pick<AgentStore, 'getThread' | 'updateRun'>
  run: AgentRun
  setupRound: AgentRunRoundInfo
  recordTrace: (run: AgentRun, trace: RuntimeRunExecutionContextTraceInput) => void
}): RuntimeRunExecutionContext {
  const thread = requireRuntimeThread(input.store, input.run.threadId)
  const executionInput = resolveRunExecutionInput(input.run, thread)
  const userMessage = executionInput.userMessage
  const lastUser = executionInput.sourceUser
    ? { ...executionInput.sourceUser, content: userMessage }
    : createRuntimeMessage({ threadId: thread.id, role: 'user', content: userMessage })
  const command = parseAgentCommand(userMessage)
  const clientInput = normalizeClientInput(input.run.metadata?.clientInput ?? thread.metadata?.lastClientInput)
  attachRuntimeThreadContextSummaryToRun({ thread, run: input.run })

  input.recordTrace(input.run, {
    kind: 'message',
    title: 'User message loaded',
    summary: userMessage.slice(0, 180),
    status: 'completed',
    round: input.setupRound,
    data: {
      messageId: lastUser.id,
      runInputFrozen: Boolean(input.run.input),
      hasClientInput: Boolean(clientInput),
      attachmentCount: clientInput?.attachments.length ?? 0,
    },
  })
  input.store.updateRun(input.run)

  return {
    thread,
    executionInput,
    userMessage,
    lastUser,
    command,
    ...(clientInput ? { clientInput } : {}),
  }
}
