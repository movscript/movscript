import { ROUTES } from '@/routes/projectRoutes'
import {
  agentProviderSessionCompatibilityClient,
  createAgentProviderSessionCompatibilityClient,
} from '@/features/agent/infrastructure/agentProviderSessionCompatibility'
import type { AgentThreadClearResult, AgentThreadSummary } from '@movscript/core/agent/protocol'
import type { ProviderSessionSummary } from '@/shared/contracts/electronApiProviderSessions'
import type { ProviderSessionRunListItem } from '@/features/agent/application/providerSessionThreadQueryCache'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'
import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
import type { AgentChatDataSource } from '@movscript/core/agent/chat'
import { providerRoute } from '@/features/agent/application/providerRoutes'

export type AgentControlIssueTone = 'action' | 'warning' | 'ready'

export interface AgentControlIssue {
  id: string
  tone: AgentControlIssueTone
  title: string
  detail: string
  to?: string
}

export interface AgentControlCapabilityHealth {
  checkedProviderCount: number
  providerCount: number
  warningCount: number
  toolSummary: AgentControlToolSummary
  skillSummary: AgentControlSkillSummary
  pluginSummary: AgentControlPluginSummary
  providers: AgentControlProviderCapabilityHealth[]
}

export interface AgentControlProviderCapabilityHealth {
  providerId: string
  providerKind: ProviderConfig['kind']
  providerLabel: string
  ok: boolean
  warningCount: number
  credential?: AgentControlCredentialHealth
  toolCount: number
  blockedToolCount: number
  mcpServerCount: number
  mcpToolCount: number
  skillCount: number
  pluginCount: number
  warnings: string[]
}

export interface AgentControlCredentialHealth {
  ok: boolean
  configured: boolean
  env: string
  source: string
  modelEndpointBaseURL?: string
  detail?: string
}

export interface AgentControlToolSummary {
  available: number
  blocked: number
  discovered: number
  warningCount: number
}

export interface AgentControlSkillSummary {
  total: number
  enabled: number
  warningCount: number
}

export interface AgentControlPluginSummary {
  total: number
  enabled: number
  warningCount: number
}

export const EMPTY_AGENT_CONTROL_CAPABILITY_HEALTH: AgentControlCapabilityHealth = {
  checkedProviderCount: 0,
  providerCount: 0,
  warningCount: 0,
  toolSummary: {
    available: 0,
    blocked: 0,
    discovered: 0,
    warningCount: 0,
  },
  skillSummary: {
    total: 0,
    enabled: 0,
    warningCount: 0,
  },
  pluginSummary: {
    total: 0,
    enabled: 0,
    warningCount: 0,
  },
  providers: [],
}

export async function listAgentControlProviderSessions(input: { providerProfileKey?: string } = {}): Promise<ProviderSessionSummary[]> {
  const providerProfileKey = input.providerProfileKey?.trim()
  const client = providerProfileKey
    ? createAgentProviderSessionCompatibilityClient('control-center-diagnostics', { providerProfileKey })
    : agentProviderSessionCompatibilityClient('control-center-diagnostics')
  return client.listProviderSessionsFromWorkspace().then((result) => result.sessions)
}

export async function inspectAgentControlProviderCapabilities(providers: ProviderConfig[]): Promise<AgentControlCapabilityHealth> {
  const providerHealth = await Promise.all(providers.map(inspectAgentControlProviderCapability))
  return summarizeAgentControlCapabilityHealth(providerHealth, providers.length)
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
      detail: `${input.failedRuns} 个 Run 失败，可从 Agent 控制台检查当前状态。`,
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

async function inspectAgentControlProviderCapability(provider: ProviderConfig): Promise<AgentControlProviderCapabilityHealth> {
  try {
    const dataSource = await createAgentChatDataSourceForProvider(provider)
    return await inspectAgentControlDataSourceCapabilities(provider, dataSource)
  } catch (error) {
    return failedAgentControlProviderCapabilityHealth(provider, error)
  }
}

export async function inspectAgentControlDataSourceCapabilities(
  provider: ProviderConfig,
  dataSource: AgentChatDataSource,
): Promise<AgentControlProviderCapabilityHealth> {
  const warnings: string[] = []
  const commandAvailable = Boolean(dataSource.capabilities?.command?.exec)
  const fsAvailable = Boolean(dataSource.capabilities?.fs?.readFile)
  const runtime = dataSource.capabilities?.runtime?.probe
    ? await inspectCapabilityCall('Runtime', () => dataSource.capabilities?.runtime?.probe?.() ?? Promise.resolve(null))
    : okCapabilityCall('Runtime', null)
  const mcp = dataSource.capabilities?.mcp?.listServers
    ? await inspectCapabilityCall('MCP', () => dataSource.capabilities?.mcp?.listServers?.() ?? Promise.resolve(null))
    : okCapabilityCall('MCP', null)
  const plugins = dataSource.capabilities?.plugins?.installed || dataSource.capabilities?.plugins?.list
    ? await inspectCapabilityCall('Plugins', () => inspectAgentControlInstalledPlugins(dataSource))
    : okCapabilityCall('Plugins', null)
  const skills = dataSource.capabilities?.skills?.list
    ? await inspectCapabilityCall('Skills', () => dataSource.capabilities?.skills?.list?.() ?? Promise.resolve(null))
    : okCapabilityCall('Skills', null)

  for (const result of [runtime, mcp, plugins, skills]) {
    if (!result.ok) warnings.push(`${result.label}：${result.error}`)
  }
  const credential = runtime.ok ? agentControlCredentialHealthFromProbe(runtime.value) : undefined
  if (runtime.ok && runtimeProbeFailed(runtime.value) && !credential) {
    warnings.push(`Runtime：${runtimeProbeError(runtime.value) ?? 'Agent runtime probe failed.'}`)
  }
  if (credential && !credential.ok) warnings.push(`Runtime 凭据：${credential.detail ?? `${credential.env} 未配置。`}`)

  const mcpServerCount = mcp.ok ? countMcpServers(mcp.value) : 0
  const mcpToolCount = mcp.ok ? countMcpTools(mcp.value) : 0
  const pluginCount = plugins.ok ? countPluginItems(plugins.value) : 0
  const skillCount = skills.ok ? countSkillItems(skills.value) : 0
  const directToolCount = [commandAvailable, fsAvailable].filter(Boolean).length
  const catalogToolCount = skills.ok ? countResolvedTools(skills.value, 'available') : 0
  const blockedToolCount = skills.ok ? countResolvedTools(skills.value, 'blocked') : 0

  return {
    providerId: provider.id,
    providerKind: provider.kind,
    providerLabel: provider.label,
    ok: warnings.length === 0,
    warningCount: warnings.length,
    ...(credential ? { credential } : {}),
    toolCount: directToolCount + mcpToolCount + catalogToolCount,
    blockedToolCount,
    mcpServerCount,
    mcpToolCount,
    skillCount,
    pluginCount,
    warnings,
  }
}

export function summarizeAgentControlCapabilityHealth(
  providers: AgentControlProviderCapabilityHealth[],
  providerCount: number,
): AgentControlCapabilityHealth {
  const warningCount = providers.reduce((sum, provider) => sum + provider.warningCount, 0)
  const discoveredTools = providers.reduce((sum, provider) => sum + provider.toolCount, 0)
  const blockedTools = providers.reduce((sum, provider) => sum + provider.blockedToolCount, 0)
  const skills = providers.reduce((sum, provider) => sum + provider.skillCount, 0)
  const plugins = providers.reduce((sum, provider) => sum + provider.pluginCount, 0)
  return {
    checkedProviderCount: providers.length,
    providerCount,
    warningCount,
    toolSummary: {
      available: discoveredTools,
      blocked: blockedTools,
      discovered: discoveredTools,
      warningCount,
    },
    skillSummary: {
      total: skills,
      enabled: skills,
      warningCount: providers.filter((provider) => provider.skillCount === 0).length,
    },
    pluginSummary: {
      total: plugins,
      enabled: plugins,
      warningCount: providers.filter((provider) => provider.pluginCount === 0).length,
    },
    providers,
  }
}

function failedAgentControlProviderCapabilityHealth(
  provider: ProviderConfig,
  error: unknown,
): AgentControlProviderCapabilityHealth {
  return {
    providerId: provider.id,
    providerKind: provider.kind,
    providerLabel: provider.label,
    ok: false,
    warningCount: 1,
    credential: {
      ok: false,
      configured: false,
      env: '-',
      source: 'unknown',
      detail: errorMessage(error),
    },
    toolCount: 0,
    blockedToolCount: 0,
    mcpServerCount: 0,
    mcpToolCount: 0,
    skillCount: 0,
    pluginCount: 0,
    warnings: [errorMessage(error)],
  }
}

function agentControlCredentialHealthFromProbe(value: unknown): AgentControlCredentialHealth | undefined {
  if (!isRecord(value)) return undefined
  const raw = isRecord(value.credentials) ? value.credentials : isRecord(value.checks) && isRecord(value.checks.credentials) ? value.checks.credentials : undefined
  if (!raw) return undefined
  const env = stringField(raw.env) ?? '-'
  return {
    ok: raw.ok === true || raw.configured === true,
    configured: raw.configured === true,
    env,
    source: stringField(raw.source) ?? 'unknown',
    ...(stringField(raw.modelEndpointBaseURL) ? { modelEndpointBaseURL: stringField(raw.modelEndpointBaseURL) } : {}),
    ...(stringField(raw.detail) ? { detail: stringField(raw.detail) } : {}),
  }
}

function runtimeProbeFailed(value: unknown): boolean {
  return isRecord(value) && value.ok === false
}

function runtimeProbeError(value: unknown): string | undefined {
  return isRecord(value) ? stringField(value.error) : undefined
}

async function inspectCapabilityCall(label: string, fn: () => Promise<unknown>): Promise<{ ok: true; label: string; value: unknown } | { ok: false; label: string; error: string }> {
  try {
    return { ok: true, label, value: await fn() }
  } catch (error) {
    return { ok: false, label, error: errorMessage(error) }
  }
}

function inspectAgentControlInstalledPlugins(dataSource: AgentChatDataSource): Promise<unknown> {
  if (dataSource.capabilities?.plugins?.installed) return dataSource.capabilities.plugins.installed()
  if (dataSource.capabilities?.plugins?.list) return dataSource.capabilities.plugins.list()
  return Promise.resolve(null)
}

function okCapabilityCall(label: string, value: unknown): { ok: true; label: string; value: unknown } {
  return { ok: true, label, value }
}

function countMcpServers(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (!isRecord(value)) return 0
  for (const key of ['servers', 'data', 'items']) {
    const next = value[key]
    if (Array.isArray(next)) return next.length
    if (isRecord(next)) return Object.keys(next).length
  }
  return 0
}

function countMcpTools(value: unknown): number {
  const servers = extractCollection(value, ['servers', 'data', 'items'])
  return servers.reduce<number>((sum, server) => {
    if (!isRecord(server)) return sum
    const tools = server.tools
    if (Array.isArray(tools)) return sum + tools.length
    if (isRecord(tools)) return sum + Object.keys(tools).length
    return sum
  }, 0)
}

function countPluginItems(value: unknown): number {
  return extractCollection(value, ['plugins', 'installed', 'data', 'items']).length
}

function countSkillItems(value: unknown): number {
  const entries = extractCollection(value, ['skills', 'data', 'items'])
  if (entries.length > 0 && entries.every((entry) => isRecord(entry) && Array.isArray(entry.skills))) {
    return entries.reduce<number>((sum, entry) => sum + (isRecord(entry) && Array.isArray(entry.skills) ? entry.skills.length : 0), 0)
  }
  return entries.length
}

function countResolvedTools(value: unknown, key: 'available' | 'blocked'): number {
  if (!isRecord(value)) return 0
  const resolvedTools = value.resolvedTools
  if (!isRecord(resolvedTools)) return 0
  const tools = resolvedTools[key]
  if (Array.isArray(tools)) return tools.length
  if (isRecord(tools)) return Object.keys(tools).length
  return 0
}

function extractCollection(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) return []
  for (const key of keys) {
    const next = value[key]
    if (Array.isArray(next)) return next
    if (isRecord(next)) return Object.values(next)
  }
  return []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
