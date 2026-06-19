import {
  useMemo } from 'react'
import { MessageSquare,
  Network,
  PlugZap } from 'lucide-react'

import {
  AgentConsoleBoundaryCard,
  AgentConsoleDescription,
  AgentConsoleDivider,
  AgentConsoleEmptyText,
  AgentConsoleGrid,
  AgentConsoleInlineError,
  AgentConsoleIntroRow,
  AgentConsoleLocalToolCard,
  AgentConsoleLocalToolControls,
  AgentConsoleLocalToolCopy,
  AgentConsoleLocalToolDetail,
  AgentConsoleLocalToolFields,
  AgentConsoleLocalToolHeader,
  AgentConsoleLocalToolTitle,
  AgentConsolePanel,
  AgentConsolePanelActions,
  AgentConsoleStack,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
  AgentConsoleTestResult,
  AgentConsoleToolbar,
} from '@/features/agent/components/AgentConsoleUi'
import { runStatusLabel } from '@/features/agent/domain/agentRunUi'
import { agentRunStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import type { AgentThreadSummary } from '@movscript/core/agent/protocol'
import type { ProviderSessionSummary } from '@/shared/contracts/electronApiProviderSessions'
import type { ProviderSessionRunListItem } from '@/features/agent/application/providerSessionThreadQueryCache'
import {
  errorMessage,
  sortAgentControlRuns,
  summarizeAgentControlThreads,
} from '@/features/agent/application/agentControlCenter'
import type { AgentProfile } from '@/features/agent/application/agentProfileModel'

export function AgentSessionIntegrationPanel({
  providerSessions,
  threads,
  runs,
  profiles,
  loading,
  error,
}: {
  providerSessions: ProviderSessionSummary[]
  threads: AgentThreadSummary[]
  runs: ProviderSessionRunListItem[]
  profiles: AgentProfile[]
  loading: boolean
  error: unknown
}) {
  const threadSummary = summarizeAgentControlThreads(threads)
  const runsByThreadId = useMemo(() => {
    const grouped = new Map<string, ProviderSessionRunListItem[]>()
    for (const run of runs) {
      const list = grouped.get(run.threadId) ?? []
      list.push(run)
      grouped.set(run.threadId, list)
    }
    return grouped
  }, [runs])
  const sessionsById = useMemo(() => new Map(providerSessions.map((session) => [session.session.id, session])), [providerSessions])

  return (
    <AgentConsolePanel
      title="会话状态"
      icon={<MessageSquare size={14} />}
      action={
        <AgentConsolePanelActions>
          {loading && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
        <AgentConsoleStatusBadge intent={threadSummary.requiresAction > 0 ? 'warning' : 'success'} emphasis="soft">
            {threadSummary.total} 个会话
          </AgentConsoleStatusBadge>
        </AgentConsolePanelActions>
      }
    >
      <AgentConsoleIntroRow>
        <AgentConsoleDescription>
          Conversation 是用户可见的会话；内部线程和连接映射只作为恢复与排障信息保留。
        </AgentConsoleDescription>
        <AgentConsoleToolbar>
          <AgentConsoleStatusBadge intent={profiles.length > 0 ? 'success' : 'warning'} emphasis="soft">
            {profiles.length} 个 Agent
          </AgentConsoleStatusBadge>
          <AgentConsoleStatusBadge intent={providerSessions.length > 0 ? 'success' : 'neutral'} emphasis="soft">
            {providerSessions.length} 个连接记录
          </AgentConsoleStatusBadge>
        </AgentConsoleToolbar>
      </AgentConsoleIntroRow>

      <AgentConsoleGrid columns="three">
        <AgentConsoleBoundaryCard title="Conversation Record" detail="面板、项目页和历史列表共用一个会话对象；不再按 provider 分散保存 activeThreadId。" />
        <AgentConsoleBoundaryCard title="Thread Binding" detail="内部线程引用携带 Agent、threadId 和 workspace 范围，避免跨 Agent 恢复错位。" />
        <AgentConsoleBoundaryCard title="Participants" detail="主会话可以挂多个 worker/subagent thread，Pinned Status 和 Trace 从 participant refs 聚合。" />
      </AgentConsoleGrid>

      <AgentConsoleDivider>
        <AgentConsoleGrid columns="server">
          {profiles.map((profile) => (
            <AgentConversationSourceCard
              key={profile.id}
              profile={profile}
              threadCount={profiles.length === 1 ? threads.length : 0}
              sessionCount={profiles.length === 1 ? providerSessions.length : 0}
            />
          ))}
        </AgentConsoleGrid>
      </AgentConsoleDivider>

      {error ? (
        <AgentConsoleInlineError>{errorMessage(error)}</AgentConsoleInlineError>
      ) : threads.length === 0 ? (
        <AgentConsoleDivider>
          <AgentConsoleEmptyText>当前 workspace 还没有可恢复的 Agent 会话。</AgentConsoleEmptyText>
        </AgentConsoleDivider>
      ) : (
        <AgentConsoleDivider>
          <AgentConsoleStack>
            {threads.slice(0, 6).map((thread) => (
              <ConversationThreadRefRow
                key={thread.id}
                thread={thread}
                session={sessionsById.get(providerSessionTreeIdForThread(thread) ?? '')}
                runs={runsByThreadId.get(thread.id) ?? []}
              />
            ))}
          </AgentConsoleStack>
        </AgentConsoleDivider>
      )}
    </AgentConsolePanel>
  )
}

function AgentConversationSourceCard({
  profile,
  threadCount,
  sessionCount,
}: {
  profile: AgentProfile
  threadCount: number
  sessionCount: number
}) {
  return (
    <AgentConsoleLocalToolCard>
      <AgentConsoleLocalToolHeader>
        <AgentConsoleLocalToolCopy>
          <AgentConsoleLocalToolTitle>{profile.label}</AgentConsoleLocalToolTitle>
          <AgentConsoleLocalToolDetail>
            {profile.runtimeBackend.label} / {profile.connectionLabel}
          </AgentConsoleLocalToolDetail>
        </AgentConsoleLocalToolCopy>
        <AgentConsoleLocalToolControls>
          <AgentConsoleStatusBadge intent={profile.enabled ? 'success' : 'neutral'} emphasis="soft">
            {profile.enabled ? '启用' : '停用'}
          </AgentConsoleStatusBadge>
        </AgentConsoleLocalToolControls>
      </AgentConsoleLocalToolHeader>
      <AgentConsoleLocalToolFields>
        <AgentConsoleTestResult tone="neutral">
          <Network size={12} /> source：runtime thread list + events
        </AgentConsoleTestResult>
        <AgentConsoleTestResult tone="neutral">
          <PlugZap size={12} /> binding key：{profile.routeKey}:{profile.runtimeBackend.id}
        </AgentConsoleTestResult>
        <AgentConsoleTestResult tone={threadCount > 0 ? 'success' : 'neutral'}>
          {sessionCount} connection / {threadCount} thread
        </AgentConsoleTestResult>
      </AgentConsoleLocalToolFields>
    </AgentConsoleLocalToolCard>
  )
}

function ConversationThreadRefRow({
  thread,
  session,
  runs,
}: {
  thread: AgentThreadSummary
  session?: ProviderSessionSummary
  runs: ProviderSessionRunListItem[]
}) {
  const status = thread.status ?? 'idle'
  const statusRecipe = agentRunStatusRecipe(status === 'running' ? 'in_progress' : status === 'requires_action' ? 'requires_action' : status === 'failed' ? 'failed' : 'completed')
  const latestRun = sortAgentControlRuns(runs)[0]
  const providerKey = providerKeyForThreadRef(thread, session)
  const providerSessionTreeId = providerSessionTreeIdForThread(thread)
  return (
    <AgentConsoleLocalToolCard invalid={status === 'failed'}>
      <AgentConsoleLocalToolHeader>
        <AgentConsoleLocalToolCopy>
          <AgentConsoleLocalToolTitle>{thread.title || thread.id}</AgentConsoleLocalToolTitle>
          <AgentConsoleLocalToolDetail>
            agent={providerKey} / connection={providerSessionTreeId ?? '-'} / thread={thread.id}
          </AgentConsoleLocalToolDetail>
        </AgentConsoleLocalToolCopy>
        <AgentConsoleLocalToolControls>
          <AgentConsoleStatusBadge intent={statusRecipe.intent} emphasis={statusRecipe.emphasis}>
            {status}
          </AgentConsoleStatusBadge>
        </AgentConsoleLocalToolControls>
      </AgentConsoleLocalToolHeader>
      <AgentConsoleLocalToolFields>
        <AgentConsoleTestResult tone="neutral">
          conversation key：{providerKey}:{providerSessionTreeId ?? 'connection'}:{thread.id}
        </AgentConsoleTestResult>
        <AgentConsoleTestResult tone={session?.state?.status === 'running' || session?.state?.status === 'requires_action' ? 'success' : 'neutral'}>
          connection：{session?.state?.status ?? 'indexed'} / messages={thread.messageCount ?? 0}
        </AgentConsoleTestResult>
        <AgentConsoleTestResult tone={latestRun?.status === 'failed' ? 'danger' : latestRun?.status === 'requires_action' ? 'warning' : 'neutral'}>
          latest run：{latestRun ? `${latestRun.id} / ${runStatusLabel(latestRun.status)}` : 'none'}
        </AgentConsoleTestResult>
      </AgentConsoleLocalToolFields>
    </AgentConsoleLocalToolCard>
  )
}

function providerSessionTreeIdForThread(thread: AgentThreadSummary): string | undefined {
  return thread.providerSessionTreeId?.trim() || thread.sessionId?.trim() || undefined
}

function providerKeyForThreadRef(thread: AgentThreadSummary, session?: ProviderSessionSummary): string {
  const rawMetadata = (thread as { metadata?: unknown }).metadata
  const metadata = isRecord(rawMetadata) ? rawMetadata : undefined
  const rawSession: unknown = session?.session
  const sessionRecord = isRecord(rawSession) ? rawSession : undefined
  const providerId = stringField(metadata?.providerId)
    ?? stringField(metadata?.provider)
    ?? stringField(metadata?.providerKind)
    ?? stringField(sessionRecord?.providerId)
    ?? stringField(sessionRecord?.provider)
    ?? stringField(sessionRecord?.providerKind)
  return providerId?.trim() || 'provider'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
