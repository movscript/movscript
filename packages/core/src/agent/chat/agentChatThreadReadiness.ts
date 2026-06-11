import type {
  AgentChatDataSource,
  AgentChatModelSelection,
  AgentChatRunProfileSelection,
  AgentChatThread,
  AgentChatThreadControlOptions,
} from './agentChatProtocol.js'
import { AGENT_CHAT_THREAD_READ_INITIAL_LIMIT } from './agentChatRuntime.js'

export interface EnsureAgentChatThreadReadyForTurnInput {
  dataSource: Pick<AgentChatDataSource, 'label' | 'readThread' | 'resumeThread'>
  thread: AgentChatThread
  modelSelection?: AgentChatModelSelection
  runProfile?: AgentChatRunProfileSelection
  controls?: AgentChatThreadControlOptions
}

export async function ensureAgentChatThreadReadyForTurn(input: EnsureAgentChatThreadReadyForTurnInput): Promise<AgentChatThread> {
  const { dataSource, thread } = input
  if (thread.status !== 'notLoaded') return thread

  const resumeInput = {
    threadId: thread.id,
    ...(thread.cwd?.trim() ? { cwd: thread.cwd.trim() } : {}),
    ...input.controls,
    ...input.modelSelection,
    ...(input.runProfile ? { runProfile: input.runProfile } : {}),
  }
  if (dataSource.resumeThread) return dataSource.resumeThread(resumeInput)

  const loadedThread = await dataSource.readThread(thread.id, {
    includeTurns: true,
    limit: AGENT_CHAT_THREAD_READ_INITIAL_LIMIT,
    direction: 'newer',
  })
  if (loadedThread.status === 'notLoaded') {
    throw new Error(`Thread ${thread.id} is not loaded and cannot be resumed by ${dataSource.label}.`)
  }
  return loadedThread
}
