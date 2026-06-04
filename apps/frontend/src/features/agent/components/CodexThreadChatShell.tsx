import { useCallback } from 'react'
import {
  AgentChatDataSourceShell,
  openAgentChatDataSourceThread,
  type AgentChatDataSourceShellLoadResult,
} from '@/features/agent/components/AgentChatDataSourceShell'
import { createCodexAgentChatDataSource } from '@/shared/infrastructure/codex-app-server/codexAgentChatDataSource'
import { ensureCodexAppServerRpcClient } from '@/shared/infrastructure/codex-app-server/codexAppServerRpcClient'

export const ACTIVE_CODEX_THREAD_STORAGE_KEY = 'movscript.codex.activeThreadId'
export const CODEX_THREAD_OPEN_EVENT = 'movscript:codex-thread-open'

export interface CodexThreadChatShellProps {
  userId: string
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
  showCollapse?: boolean
  onCollapse?: () => void
}

export function CodexThreadChatShell({
  userId,
  host,
  surface = 'panel',
  showCollapse,
  onCollapse,
}: CodexThreadChatShellProps) {
  const loadDataSource = useCallback(async (): Promise<AgentChatDataSourceShellLoadResult> => {
    const client = await ensureCodexAppServerRpcClient()
    return {
      dataSource: client ? createCodexAgentChatDataSource(client) : undefined,
      endpoint: client?.url,
    }
  }, [])

  return (
    <AgentChatDataSourceShell
      userId={userId}
      loadDataSource={loadDataSource}
      activeThreadStorageKey={ACTIVE_CODEX_THREAD_STORAGE_KEY}
      openThreadEventName={CODEX_THREAD_OPEN_EVENT}
      providerLabel="Codex"
      threadListLabel="Codex Threads"
      emptyThreadListLabel="No Codex threads yet."
      emptyThreadLabel="Start a Codex turn from the composer."
      unavailableLabel="Codex app-server URL is not configured."
      composerPlaceholder="Message Codex"
      newThreadLabel="New Codex thread"
      host={host}
      surface={surface}
      showThreadList={surface !== 'page'}
      showCollapse={showCollapse}
      onCollapse={onCollapse}
    />
  )
}

export function openCodexThread(threadId: string): void {
  openAgentChatDataSourceThread({
    storageKey: ACTIVE_CODEX_THREAD_STORAGE_KEY,
    eventName: CODEX_THREAD_OPEN_EVENT,
    threadId,
  })
}
