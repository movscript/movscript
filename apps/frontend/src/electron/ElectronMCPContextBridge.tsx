import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { loadClientPlugins, runClientPlugin, type ClientPluginAgentToolContribution, type ClientPluginManifest } from '@/features/plugins/application/clientPlugins'
import type { ElectronMCPObjectSchema, ElectronMCPPluginTool } from '@/shared/contracts/electronApi'
import type { MCPContextUpdate } from '@/shared/contracts/mcpContext'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ROUTES } from '@/routes/projectRoutes'

const productionOrchestrationPaths: readonly string[] = [
  ROUTES.project.productionOrchestration,
]

export function ElectronMCPContextBridge() {
  const location = useLocation()
  const navigate = useNavigate()
  const project = useProjectStore((s) => s.current)
  const productionId = useMemo(() => {
    if (!productionOrchestrationPaths.includes(location.pathname)) return null
    const params = new URLSearchParams(location.search)
    const value = Number(params.get('productionId') ?? '')
    return Number.isFinite(value) && value > 0 ? value : null
  }, [location.pathname, location.search])
  const user = useUserStore((s) => s.currentUser)
  const token = useUserStore((s) => s.token)
  const lastSentSnapshotRef = useRef('')
  const lastSentPluginToolsRef = useRef('')

  const snapshot = useMemo<Omit<MCPContextUpdate, 'updatedAt'>>(() => ({
    route: {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    },
    project: project ? {
      id: project.ID,
      name: project.name,
      description: project.description,
      status: project.status,
      totalEpisodes: project.total_episodes,
    } : null,
    productionId,
    user: user ? {
      id: user.ID,
      username: user.username,
      systemRole: user.system_role,
    } : null,
    auth: token ? { token } : null,
    selection: null,
  }), [
    location.hash,
    location.pathname,
    location.search,
    productionId,
    project?.ID,
    project?.description,
    project?.name,
    project?.status,
    project?.total_episodes,
    token,
    user?.ID,
    user?.system_role,
    user?.username,
  ])

  useEffect(() => {
    const stableSnapshot = JSON.stringify(snapshot)
    if (stableSnapshot === lastSentSnapshotRef.current) return
    lastSentSnapshotRef.current = stableSnapshot
    window.api?.updateMCPContext?.({
      ...snapshot,
      updatedAt: new Date().toISOString(),
    })
  }, [snapshot])

  useEffect(() => {
    return window.api?.onMCPOpenRoute?.((route) => {
      const currentRoute = `${location.pathname}${location.search}${location.hash}`
      if (route !== currentRoute) navigate(route)
    })
  }, [location.hash, location.pathname, location.search, navigate])

  useEffect(() => {
    let cancelled = false
    async function syncPluginTools() {
      if (!window.api?.updateMCPPluginTools) return
      const plugins = await loadClientPlugins().catch(() => [])
      if (cancelled) return
      const tools = plugins.flatMap(pluginMCPTools)
      const stableTools = JSON.stringify(tools)
      if (stableTools === lastSentPluginToolsRef.current) return
      lastSentPluginToolsRef.current = stableTools
      await window.api.updateMCPPluginTools(tools)
    }

    void syncPluginTools()
    const interval = window.setInterval(() => {
      void syncPluginTools()
    }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    return window.api?.onMCPPluginToolCall?.(async (call) => {
      const plugins = await loadClientPlugins()
      const plugin = plugins.find((item) => item.id === call.pluginId)
      if (!plugin) throw new Error(`Plugin not installed: ${call.pluginId}`)
      console.info('[mcp-plugin-tool] call', {
        pluginId: call.pluginId,
        toolName: call.toolName,
        argKeys: Object.keys(call.args ?? {}),
      })
      try {
        const result = await runClientPlugin(plugin, call.args, { toolName: call.toolName })
        console.info('[mcp-plugin-tool] result', {
          pluginId: call.pluginId,
          toolName: call.toolName,
          ...summarizePluginToolResult(result),
        })
        return result
      } catch (error) {
        console.error('[mcp-plugin-tool] failed', {
          pluginId: call.pluginId,
          toolName: call.toolName,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })
  }, [])

  return null
}

function pluginMCPTools(plugin: ClientPluginManifest): ElectronMCPPluginTool[] {
  return (plugin.contributes?.tools ?? [])
    .map((tool) => pluginMCPTool(plugin, tool))
    .filter((tool): tool is ElectronMCPPluginTool => Boolean(tool))
}

function pluginMCPTool(plugin: ClientPluginManifest, tool: ClientPluginAgentToolContribution): ElectronMCPPluginTool | undefined {
  const name = typeof tool.name === 'string' && tool.name.trim()
    ? tool.name.trim()
    : typeof tool.id === 'string' && tool.id.trim()
      ? tool.id.trim()
      : ''
  if (!name) return undefined
  const outputSchema = objectSchema(tool.outputSchema)
  return {
    pluginId: plugin.id,
    name,
    description: tool.description ?? tool.title ?? plugin.description ?? name,
    inputSchema: objectSchema(tool.inputSchema) ?? objectSchema(plugin.inputSchema) ?? emptyObjectSchema(),
    ...(outputSchema ? { outputSchema } : {}),
  }
}

function objectSchema(value: unknown): ElectronMCPObjectSchema | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const item = value as Record<string, unknown>
  if (item.type !== 'object') return undefined
  return {
    type: 'object',
    properties: isRecord(item.properties) ? item.properties : {},
    ...(Array.isArray(item.required) ? { required: item.required.filter((key): key is string => typeof key === 'string') } : {}),
    ...(typeof item.additionalProperties === 'boolean' ? { additionalProperties: item.additionalProperties } : {}),
  }
}

function emptyObjectSchema(): ElectronMCPObjectSchema {
  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function summarizePluginToolResult(result: unknown): Record<string, unknown> {
  if (!isRecord(result)) return { resultType: typeof result }
  const data = isRecord(result.data) ? result.data : undefined
  const job = isRecord(data?.job) ? data.job : undefined
  const monitor = isRecord(data?.monitor) ? data.monitor : undefined
  return {
    hasData: Boolean(data),
    status: typeof data?.status === 'string' ? data.status : undefined,
    terminal: typeof data?.terminal === 'boolean' ? data.terminal : undefined,
    jobId: data?.jobId,
    job_id: data?.job_id,
    monitorTool: typeof monitor?.tool === 'string' ? monitor.tool : undefined,
    jobRawId: job?.id ?? job?.ID,
    jobStatus: typeof job?.status === 'string' ? job.status : undefined,
  }
}
