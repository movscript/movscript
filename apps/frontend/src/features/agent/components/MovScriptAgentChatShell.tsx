import { useCallback } from 'react'
import {
  AgentChatDataSourceShell,
  openAgentChatDataSourceThread,
  type AgentChatDataSourceShellLoadResult,
} from '@/features/agent/components/AgentChatDataSourceShell'
import { createMovScriptAgentChatDataSource } from '@/shared/infrastructure/local-agent-client/movscriptAgentChatDataSource'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'

const ACTIVE_MOVSCRIPT_AGENT_THREAD_STORAGE_KEY = 'movscript.agent.activeThreadId'
export const MOVSCRIPT_AGENT_THREAD_OPEN_EVENT = 'movscript:agent-thread-open'

export interface MovScriptAgentChatShellProps {
  userId: string
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
  showCollapse?: boolean
  onCollapse?: () => void
}

export function MovScriptAgentChatShell({
  userId,
  host,
  surface = 'panel',
  showCollapse,
  onCollapse,
}: MovScriptAgentChatShellProps) {
  const loadDataSource = useCallback(async (): Promise<AgentChatDataSourceShellLoadResult> => {
    return {
      dataSource: createMovScriptAgentChatDataSource(localAgentClient),
      endpoint: localAgentClient.baseURL,
    }
  }, [])

  return (
    <AgentChatDataSourceShell
      userId={userId}
      loadDataSource={loadDataSource}
      activeThreadStorageKey={ACTIVE_MOVSCRIPT_AGENT_THREAD_STORAGE_KEY}
      openThreadEventName={MOVSCRIPT_AGENT_THREAD_OPEN_EVENT}
      providerLabel="MovScript Agent"
      threadListLabel="MovScript Agent Threads"
      emptyThreadListLabel="No MovScript Agent threads yet."
      emptyThreadLabel="Start a MovScript Agent turn from the composer."
      unavailableLabel="MovScript Agent runtime is not available."
      composerPlaceholder="Message MovScript Agent"
      newThreadLabel="New MovScript Agent thread"
      host={host}
      surface={surface}
      showThreadList={surface !== 'page'}
      showCollapse={showCollapse}
      onCollapse={onCollapse}
    />
  )
}

export function openMovScriptAgentThread(threadId: string): void {
  openAgentChatDataSourceThread({
    storageKey: ACTIVE_MOVSCRIPT_AGENT_THREAD_STORAGE_KEY,
    eventName: MOVSCRIPT_AGENT_THREAD_OPEN_EVENT,
    threadId,
  })
}
