import { ROUTES } from '@/routes/projectRoutes'
import i18n from '@/i18n'
import {
  agentProviderSessionCompatibilityClient,
  createAgentProviderSessionCompatibilityClient,
} from '@/features/agent/infrastructure/agentProviderSessionCompatibility'
import type { AgentThreadClearResult, AgentThreadSummary } from '@movscript/core/agent/protocol'
import type { ProviderSessionSummary } from '@/shared/contracts/electronApiProviderSessions'
import type { ProviderSessionRunListItem } from '@/features/agent/application/providerSessionThreadQueryCache'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'
import { providerRoute } from '@/features/agent/application/providerRoutes'

export type AgentControlIssueTone = 'action' | 'warning' | 'ready'

export interface AgentControlIssue {
  id: string
  tone: AgentControlIssueTone
  title: string
  detail: string
  to?: string
}

export {
  EMPTY_AGENT_CONTROL_CAPABILITY_HEALTH,
  inspectAgentControlDataSourceCapabilities,
  inspectAgentControlProviderCapabilities,
  summarizeAgentControlCapabilityHealth,
  type AgentControlCapabilityHealth,
  type AgentControlCredentialHealth,
  type AgentControlPluginSummary,
  type AgentControlProviderCapabilityHealth,
  type AgentControlSkillSummary,
  type AgentControlToolSummary,
} from '@/features/agent/application/agentControlCapabilityHealth'

export async function listAgentControlProviderSessions(input: { providerProfileKey?: string } = {}): Promise<ProviderSessionSummary[]> {
  const providerProfileKey = input.providerProfileKey?.trim()
  const client = providerProfileKey
    ? createAgentProviderSessionCompatibilityClient('control-center-diagnostics', { providerProfileKey })
    : agentProviderSessionCompatibilityClient('control-center-diagnostics')
  return client.listProviderSessionsFromWorkspace().then((result) => result.sessions)
}

export async function clearWorkspaceSessionThreadHistory(sessions: ProviderSessionSummary[]): Promise<{ threadCount: number; runCount: number }> {
  const scopedSessions = sessions
    .map((session) => ({
      providerSessionTreeId: session.session.id.trim(),
      movScriptHomeDir: session.movScriptHomeDir?.trim() || session.workspaceDir?.trim(),
    }))
    .filter((session) => session.providerSessionTreeId)

  if (scopedSessions.length === 0) {
    throw new Error('没有可清理的 workspace session 索引。请先刷新控制台。')
  }

  const results = await Promise.all(scopedSessions.map((session) => (
    agentProviderSessionCompatibilityClient('control-center-diagnostics')
      .forSession({
        sessionId: session.providerSessionTreeId,
        ...(session.movScriptHomeDir ? { movScriptHomeDir: session.movScriptHomeDir, workspaceDir: session.movScriptHomeDir } : {}),
      })
      .deleteAllThreads()
  )))

  return summarizeThreadClearResults(results)
}

export function buildAgentControlIssues(input: {
  sessionIndexError: unknown
  modelConfigured: boolean
  modelError: unknown
  activeRuns: number
  waitingRuns: number
  failedRuns: number
  blockedTools: number
  capabilityWarnings: number
  checkedCapabilityProviders?: number
  connectionProvider?: ProviderConfig
}): AgentControlIssue[] {
  const issues: AgentControlIssue[] = []
  if (input.sessionIndexError) {
    issues.push({
      id: 'session-index-unavailable',
      tone: 'action',
      title: 'Session 索引不可用',
      detail: errorMessage(input.sessionIndexError),
      to: input.connectionProvider ? providerRoute(input.connectionProvider) : ROUTES.agents,
    })
  }
  if (!input.modelConfigured || input.modelError) {
    issues.push({
      id: 'model-config',
      tone: 'action',
      title: '模型配置需要确认',
      detail: input.modelError ? errorMessage(input.modelError) : '未配置模型时，Agent 无法稳定执行聊天、规划或工具调用。',
      to: ROUTES.agentSettings,
    })
  }
  if (input.waitingRuns > 0) {
    issues.push({
      id: 'waiting-runs',
      tone: 'action',
      title: '有运行等待输入或审批',
      detail: `${input.waitingRuns} 个 Run 处于等待处理状态。`,
      to: ROUTES.agentConsole,
    })
  }
  if (input.failedRuns > 0) {
    issues.push({
      id: 'failed-runs',
      tone: 'warning',
      title: '最近存在失败运行',
      detail: i18n.t('agents.console.attention.failedRunsDetail', { count: input.failedRuns }),
      to: ROUTES.agentConsole,
    })
  }
  if (input.blockedTools > 0 || input.capabilityWarnings > 0) {
    issues.push({
      id: 'tool-permissions',
      tone: 'warning',
      title: '工具能力存在限制',
      detail: `${input.blockedTools} 个工具不可用，${input.capabilityWarnings} 条能力警告，已检查 ${input.checkedCapabilityProviders ?? 0} 个运行中 Agent。`,
      to: ROUTES.agentSettings,
    })
  }
  return issues
}

export function summarizeAgentControlRuns(runs: ProviderSessionRunListItem[]) {
  return {
    total: runs.length,
    active: runs.filter((run) => run.status === 'queued' || run.status === 'in_progress').length,
    requiresAction: runs.filter((run) => run.status === 'requires_action').length,
    failed: runs.filter((run) => run.status === 'failed').length,
  }
}

export function summarizeAgentControlThreads(threads: AgentThreadSummary[]) {
  return {
    total: threads.length,
    running: threads.filter((thread) => thread.status === 'running').length,
    requiresAction: threads.filter((thread) => thread.status === 'requires_action').length,
    failed: threads.filter((thread) => thread.status === 'failed').length,
  }
}

export function sortAgentControlRuns(runs: ProviderSessionRunListItem[]) {
  return [...runs].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

export function modelDisplay(value: string) {
  return value.length > 42 ? `${value.slice(0, 39)}...` : value
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function summarizeThreadClearResults(results: AgentThreadClearResult[]): { threadCount: number; runCount: number } {
  const deletedThreadIds = new Set<string>()
  const deletedRunIds = new Set<string>()
  for (const result of results) {
    for (const threadId of result.deletedThreadIds) deletedThreadIds.add(threadId)
    for (const runId of result.deletedRunIds) deletedRunIds.add(runId)
  }
  return {
    threadCount: deletedThreadIds.size,
    runCount: deletedRunIds.size,
  }
}
