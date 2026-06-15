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
import type { ProviderSessionSummary, AgentThreadSummary } from '@/shared/infrastructure/providerSessionClient'
import type { ProviderSessionRunListItem } from '@/features/agent/application/providerSessionThreadQueryCache'
import {
  errorMessage,
  sortAgentControlRuns,
  summarizeAgentControlThreads,
} from '@/features/agent/application/agentControlCenter'
import {
  resolveAppServerProfile,
  usesAppServerProtocol,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'

export function AgentSessionIntegrationPanel({
  providerSessions,
  threads,
  runs,
  providers,
  loading,
  error,
}: {
  providerSessions: ProviderSessionSummary[]
  threads: AgentThreadSummary[]
  runs: ProviderSessionRunListItem[]
  providers: ProviderConfig[]
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
      title="会话集成模型"
      icon={<MessageSquare size={14} />}
      action={
        <AgentConsolePanelActions>
          {loading && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
          <AgentConsoleStatusBadge intent={threadSummary.requiresAction > 0 ? 'warning' : 'success'} emphasis="soft">
            {threadSummary.total} 个 ThreadRef
          </AgentConsoleStatusBadge>
        </AgentConsolePanelActions>
      }
    >
      <AgentConsoleIntroRow>
        <AgentConsoleDescription>
          先把用户看到的 Conversation 和 runtime 内部 thread/session 拆开：控制台负责注册和恢复映射，聊天壳只负责渲染选中的统一数据源。
        </AgentConsoleDescription>
        <AgentConsoleToolbar>
          <AgentConsoleStatusBadge intent={providers.length > 0 ? 'success' : 'warning'} emphasis="soft">
            {providers.length} 个 Runtime source
          </AgentConsoleStatusBadge>
          <AgentConsoleStatusBadge intent={providerSessions.length > 0 ? 'success' : 'neutral'} emphasis="soft">
            {providerSessions.length} 个 Runtime session
          </AgentConsoleStatusBadge>
        </AgentConsoleToolbar>
      </AgentConsoleIntroRow>

      <AgentConsoleGrid columns="three">
        <AgentConsoleBoundaryCard title="Conversation Record" detail="面板、项目页和历史列表共用一个会话对象；不再按 provider 分散保存 activeThreadId。" />
        <AgentConsoleBoundaryCard title="Runtime ThreadRef" detail="ThreadRef 携带 providerId、providerInstanceId、threadId、runtime session 或 session tree、workspaceDir，避免跨 runtime 冲突。" />
        <AgentConsoleBoundaryCard title="Participants" detail="主会话可以挂多个 worker/subagent thread，Pinned Status 和 Trace 从 participant refs 聚合。" />
      </AgentConsoleGrid>

      <AgentConsoleDivider>
        <AgentConsoleGrid columns="server">
          {providers.map((provider) => (
            <ProviderConversationSourceCard
              key={provider.id}
              provider={provider}
              threadCount={0}
              sessionCount={0}
            />
          ))}
        </AgentConsoleGrid>
      </AgentConsoleDivider>

      {error ? (
        <AgentConsoleInlineError>{errorMessage(error)}</AgentConsoleInlineError>
      ) : threads.length === 0 ? (
        <AgentConsoleDivider>
          <AgentConsoleEmptyText>当前 workspace 还没有可注册的 Agent Runtime 会话。任一 runtime adapter 都可以接入同一个 registry。</AgentConsoleEmptyText>
        </AgentConsoleDivider>
      ) : (
        <AgentConsoleDivider>
          <AgentConsoleStack>
            {threads.slice(0, 6).map((thread) => (
              <ConversationThreadRefRow
                key={thread.id}
                thread={thread}
                session={thread.sessionId ? sessionsById.get(thread.sessionId) : undefined}
                runs={runsByThreadId.get(thread.id) ?? []}
              />
            ))}
          </AgentConsoleStack>
        </AgentConsoleDivider>
      )}
    </AgentConsolePanel>
  )
}

function ProviderConversationSourceCard({
  provider,
  threadCount,
  sessionCount,
}: {
  provider: ProviderConfig
  threadCount: number
  sessionCount: number
}) {
  const isAppServer = usesAppServerProtocol(provider)
  const profile = isAppServer ? resolveAppServerProfile(provider) : undefined
  return (
    <AgentConsoleLocalToolCard>
      <AgentConsoleLocalToolHeader>
        <AgentConsoleLocalToolCopy>
          <AgentConsoleLocalToolTitle>{provider.label}</AgentConsoleLocalToolTitle>
          <AgentConsoleLocalToolDetail>
            {isAppServer
              ? `${provider.label} app-server / ${profile?.id ?? provider.id}`
              : 'MovScript runtime profile'}
          </AgentConsoleLocalToolDetail>
        </AgentConsoleLocalToolCopy>
        <AgentConsoleLocalToolControls>
          <AgentConsoleStatusBadge intent={provider.enabled ? 'success' : 'neutral'} emphasis="soft">
            {provider.enabled ? '启用' : '停用'}
          </AgentConsoleStatusBadge>
        </AgentConsoleLocalToolControls>
      </AgentConsoleLocalToolHeader>
      <AgentConsoleLocalToolFields>
        <AgentConsoleTestResult tone="neutral">
          <Network size={12} /> source：{isAppServer ? 'thread/list + realtime subscription' : 'runtime sessions + event stream'}
        </AgentConsoleTestResult>
        <AgentConsoleTestResult tone="neutral">
          <PlugZap size={12} /> registry key：{provider.kind}:{provider.id}:{profile?.id ?? provider.id}
        </AgentConsoleTestResult>
        <AgentConsoleTestResult tone={isAppServer || threadCount > 0 ? 'success' : 'warning'}>
          {isAppServer ? '等待 app-server thread list 接入' : `${sessionCount} session / ${threadCount} thread`}
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
  return (
    <AgentConsoleLocalToolCard invalid={status === 'failed'}>
      <AgentConsoleLocalToolHeader>
        <AgentConsoleLocalToolCopy>
          <AgentConsoleLocalToolTitle>{thread.title || thread.id}</AgentConsoleLocalToolTitle>
          <AgentConsoleLocalToolDetail>
            provider={providerKey} / runtime session={thread.sessionId ?? '-'} / thread={thread.id}
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
          conversation key：{providerKey}:{thread.sessionId ?? 'runtime-session'}:{thread.id}
        </AgentConsoleTestResult>
        <AgentConsoleTestResult tone={session?.state?.status === 'running' || session?.state?.status === 'requires_action' ? 'success' : 'neutral'}>
          runtime session：{session?.state?.status ?? 'indexed'} / messages={thread.messageCount ?? 0}
        </AgentConsoleTestResult>
        <AgentConsoleTestResult tone={latestRun?.status === 'failed' ? 'danger' : latestRun?.status === 'requires_action' ? 'warning' : 'neutral'}>
          latest run：{latestRun ? `${latestRun.id} / ${runStatusLabel(latestRun.status)}` : 'none'}
        </AgentConsoleTestResult>
      </AgentConsoleLocalToolFields>
    </AgentConsoleLocalToolCard>
  )
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
