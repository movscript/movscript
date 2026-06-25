import type { AgentChatDataSource } from './agentChatProtocol.js'

export type AgentChatCapabilityProbeTone = 'ready' | 'warning' | 'action'

export interface AgentChatCapabilityProbeProvider {
  id: string
  kind: string
  label: string
}

export interface AgentChatCapabilityProbeItem {
  id: string
  label: string
  method: string
  supported: boolean
  ok: boolean
  tone: AgentChatCapabilityProbeTone
  detail: string
  count?: number
  error?: string
}

export interface AgentChatCapabilityProbeResult {
  providerId: string
  providerKind: string
  providerLabel: string
  dataSourceLabel: string
  ok: boolean
  supportedCount: number
  warningCount: number
  items: AgentChatCapabilityProbeItem[]
}

type ProbeDefinition = {
  id: string
  label: string
  method: string
  supported: (dataSource: AgentChatDataSource) => boolean
  run?: (dataSource: AgentChatDataSource) => Promise<unknown>
  passiveDetail?: string
}

const PROBES: ProbeDefinition[] = [
  {
    id: 'runtime',
    label: 'Runtime',
    method: 'runtime/probe',
    supported: (dataSource) => Boolean(dataSource.capabilities?.runtime?.probe),
    run: (dataSource) => dataSource.capabilities?.runtime?.probe() ?? Promise.resolve(null),
  },
  {
    id: 'thread-list',
    label: 'Thread / Turn',
    method: 'thread/list',
    supported: () => true,
    run: (dataSource) => dataSource.listThreads({ limit: 1 }),
  },
  {
    id: 'thread-stream',
    label: 'JSON-RPC / Provider Session Stream',
    method: 'thread/subscribe',
    supported: (dataSource) => Boolean(dataSource.subscribeThread),
    passiveDetail: '已实现 thread 事件订阅入口。',
  },
  {
    id: 'command-exec',
    label: 'Command / Terminal',
    method: 'command/exec',
    supported: (dataSource) => Boolean(dataSource.capabilities?.command?.exec),
    passiveDetail: '已实现命令/终端流入口；探针不会主动执行命令。',
  },
  {
    id: 'filesystem',
    label: 'Filesystem',
    method: 'fs/readFile',
    supported: (dataSource) => Boolean(dataSource.capabilities?.fs?.readFile),
    passiveDetail: '已实现文件系统流入口；探针不会主动读取路径。',
  },
  {
    id: 'mcp',
    label: 'MCP',
    method: 'mcpServerStatus/list',
    supported: (dataSource) => Boolean(dataSource.capabilities?.mcp?.listServers),
    run: (dataSource) => dataSource.capabilities?.mcp?.listServers() ?? Promise.resolve(null),
  },
  {
    id: 'plugins',
    label: 'Plugins',
    method: 'plugin/list',
    supported: (dataSource) => Boolean(dataSource.capabilities?.plugins?.list),
    run: (dataSource) => dataSource.capabilities?.plugins?.list() ?? Promise.resolve(null),
  },
  {
    id: 'models',
    label: 'Models',
    method: 'model/list',
    supported: (dataSource) => Boolean(dataSource.capabilities?.models?.list),
    run: (dataSource) => dataSource.capabilities?.models?.list({ limit: 20 }) ?? Promise.resolve(null),
  },
  {
    id: 'config',
    label: 'Config',
    method: 'config/read',
    supported: (dataSource) => Boolean(dataSource.capabilities?.config?.read),
    run: (dataSource) => dataSource.capabilities?.config?.read({ includeLayers: true }) ?? Promise.resolve(null),
  },
  {
    id: 'permission-profiles',
    label: 'Permission Profiles',
    method: 'permissionProfile/list',
    supported: (dataSource) => Boolean(dataSource.capabilities?.config?.listPermissionProfiles),
    run: (dataSource) => dataSource.capabilities?.config?.listPermissionProfiles?.() ?? Promise.resolve(null),
  },
  {
    id: 'account',
    label: 'Account',
    method: 'account/read',
    supported: (dataSource) => Boolean(dataSource.capabilities?.account?.read),
    run: (dataSource) => dataSource.capabilities?.account?.read({ refreshToken: false }) ?? Promise.resolve(null),
  },
  {
    id: 'rate-limits',
    label: 'Rate Limits',
    method: 'account/rateLimits/read',
    supported: (dataSource) => Boolean(dataSource.capabilities?.account?.readRateLimits),
    run: (dataSource) => dataSource.capabilities?.account?.readRateLimits?.() ?? Promise.resolve(null),
  },
  {
    id: 'realtime',
    label: 'Realtime',
    method: 'thread/realtime/listVoices',
    supported: (dataSource) => Boolean(dataSource.capabilities?.realtime?.supported),
    run: (dataSource) => dataSource.capabilities?.realtime?.listVoices?.() ?? Promise.resolve(null),
  },
]

export async function probeAgentChatDataSourceCapabilities(input: {
  provider: AgentChatCapabilityProbeProvider
  dataSource: AgentChatDataSource
}): Promise<AgentChatCapabilityProbeResult> {
  const items = await Promise.all(PROBES.map((probe) => runProbe(input.dataSource, probe)))
  const supportedCount = items.filter((item) => item.supported).length
  const warningCount = items.filter((item) => item.tone !== 'ready').length
  return {
    providerId: input.provider.id,
    providerKind: input.provider.kind,
    providerLabel: input.provider.label,
    dataSourceLabel: input.dataSource.label,
    ok: warningCount === 0,
    supportedCount,
    warningCount,
    items,
  }
}

export function failedAgentChatCapabilityProbeResult(input: {
  provider: AgentChatCapabilityProbeProvider
  error: unknown
}): AgentChatCapabilityProbeResult {
  const detail = errorMessage(input.error)
  return {
    providerId: input.provider.id,
    providerKind: input.provider.kind,
    providerLabel: input.provider.label,
    dataSourceLabel: input.provider.label,
    ok: false,
    supportedCount: 0,
    warningCount: 1,
    items: [{
      id: 'connect',
      label: 'Data Source',
      method: 'createAgentChatDataSourceForProvider',
      supported: false,
      ok: false,
      tone: 'action',
      detail,
      error: detail,
    }],
  }
}

function runProbe(dataSource: AgentChatDataSource, probe: ProbeDefinition): Promise<AgentChatCapabilityProbeItem> {
  if (!probe.supported(dataSource)) {
    return Promise.resolve({
      id: probe.id,
      label: probe.label,
      method: probe.method,
      supported: false,
      ok: false,
      tone: 'warning',
      detail: '当前 Agent 未实现这个统一能力入口。',
    })
  }
  if (!probe.run) {
    return Promise.resolve({
      id: probe.id,
      label: probe.label,
      method: probe.method,
      supported: true,
      ok: true,
      tone: 'ready',
      detail: probe.passiveDetail ?? '已实现统一能力入口。',
    })
  }
  return probe.run(dataSource)
    .then((response) => {
      const readiness = readinessFromResponse(response)
      if (readiness && !readiness.ok) {
        return {
          id: probe.id,
          label: probe.label,
          method: probe.method,
          supported: true,
          ok: false,
          tone: 'action' as const,
          detail: readiness.detail,
          error: readiness.detail,
        }
      }
      const count = countItems(response)
      return {
        id: probe.id,
        label: probe.label,
        method: probe.method,
        supported: true,
        ok: true,
        tone: 'ready' as const,
        detail: count === undefined ? '请求成功。' : `请求成功，返回 ${count} 项。`,
        count,
      }
    })
    .catch((error) => {
      const detail = errorMessage(error)
      return {
        id: probe.id,
        label: probe.label,
        method: probe.method,
        supported: true,
        ok: false,
        tone: 'action' as const,
        detail,
        error: detail,
      }
    })
}

function readinessFromResponse(value: unknown): { ok: boolean; detail: string } | undefined {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return undefined
  if (value.ok) return { ok: true, detail: '请求成功。' }
  const detail = typeof value.error === 'string' && value.error.trim()
    ? value.error
    : '运行时探针返回未就绪。'
  return { ok: false, detail }
}

function countItems(value: unknown): number | undefined {
  if (Array.isArray(value)) return value.length
  if (!isRecord(value)) return undefined
  for (const key of [
    'threads',
    'data',
    'items',
    'servers',
    'plugins',
    'installed',
    'skills',
    'models',
    'permissionProfiles',
    'profiles',
    'voices',
    'limits',
  ]) {
    const next = value[key]
    if (Array.isArray(next)) return next.length
    if (isRecord(next)) return Object.keys(next).length
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
