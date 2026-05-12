import { MCPClient } from '../mcpClient.js'
import { AgentRuntime, loadAgentPluginCatalog } from '../application/agentRuntime.js'
import { FileAgentStore, resolveAgentMemoryPath, resolveAgentStatePath } from '../state/fileStore.js'
import { FileAgentDraftStore, resolveAgentDraftPath } from '../drafts/draftStore.js'
import { BackendApplyClient } from '../drafts/backendApplyClient.js'
import { MCPBackendApplyClient } from '../drafts/mcpBackendApplyClient.js'
import { FileAgentMemoryStore } from '../memory/fileMemoryStore.js'
import { FileAgentCatalogStateStore, resolveAgentCatalogStatePath } from '../catalog/state.js'
import { RuntimeModelConfigStore, resolveRuntimeModelConfigPath } from '../model/modelConfig.js'
import {
  EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
} from '../contracts/runtimeContract.js'
import { buildAgentUpdateState } from '../updates/updatePolicy.js'

const DEFAULT_AGENT_PORT = 28765
const DEFAULT_MCP_ENDPOINT = 'http://127.0.0.1:18765/mcp'
const RUNTIME_API_VERSION = 1

export interface AgentServerContext {
  port: number
  mcpEndpoint: string
  paths: {
    statePath: string
    memoryPath: string
    draftPath: string
    catalogStatePath: string
    modelConfigPath: string
  }
  updates: ReturnType<typeof buildAgentUpdateState>
  client: MCPClient
  agentRuntime: AgentRuntime
  backendApplyClient: BackendApplyClient
  modelConfigStore: RuntimeModelConfigStore
  pluginCatalog: ReturnType<typeof loadAgentPluginCatalog>
}

export interface AgentRuntimeCapabilities {
  service: 'movscript-agent'
  mode: 'server'
  runtime: {
    apiVersion: number
    features: string[]
    endpoints: string[]
  }
  mcpEndpoint: string
  pluginCatalog: {
    skillsDir: string
    toolsDir: string
    builtinSkillsDir: string
    builtinToolsDir: string
    skillCount: number
    toolCount: number
    warnings: string[]
  }
  paths: AgentServerContext['paths']
  modelConfig: {
    supported: true
    provider: 'backend-model-config'
    path: string
  }
  updates: ReturnType<typeof buildAgentUpdateState>
  backendApplyEnabled: boolean
}

export function createAgentServerContext(): AgentServerContext {
  const port = Number(process.env.MOVSCRIPT_AGENT_PORT || DEFAULT_AGENT_PORT)
  const mcpEndpoint = process.env.MOVSCRIPT_MCP_ENDPOINT || DEFAULT_MCP_ENDPOINT
  const statePath = resolveAgentStatePath()
  const memoryPath = resolveAgentMemoryPath(statePath)
  const draftPath = resolveAgentDraftPath(statePath)
  const catalogStatePath = resolveAgentCatalogStatePath(statePath)
  const modelConfigPath = resolveRuntimeModelConfigPath(statePath)
  const modelConfigStore = new RuntimeModelConfigStore(modelConfigPath)
  const pluginCatalog = loadAgentPluginCatalog()
  const catalogStateStore = new FileAgentCatalogStateStore(catalogStatePath)
  const updateState = buildAgentUpdateState({
    runtimeVersion: '0.1.0',
    manifestVersion: pluginCatalog.manifest.version,
    applied: [
      {
        id: pluginCatalog.manifest.id,
        version: pluginCatalog.manifest.version,
        kind: 'policy',
        severity: 'normal',
        source: 'builtin',
        metadata: {
          skills: pluginCatalog.skills.length,
          tools: pluginCatalog.tools.length,
        },
      },
    ],
    warnings: [
      'Remote update source is not configured; dynamic updates are limited to builtin and local catalog files.',
    ],
  })
  const client = new MCPClient({ endpoint: mcpEndpoint })
  const backendApplyClient = new MCPBackendApplyClient(client)
  const runtimeContractResolver = EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER

  const agentRuntime = new AgentRuntime({
    mcpClient: client,
    store: new FileAgentStore(statePath),
    draftStore: new FileAgentDraftStore(draftPath),
    backendApplyClient,
    memoryStore: new FileAgentMemoryStore(memoryPath),
    defaultAgentManifest: pluginCatalog.manifest,
    skillCatalog: pluginCatalog.skills,
    toolRegistry: pluginCatalog.registry,
    catalogStateStore,
    pluginCatalogLoader: (options) => loadAgentPluginCatalog(options),
    contractResolver: runtimeContractResolver,
    pluginCatalogInfo: {
      skillsDir: pluginCatalog.skillsDir,
      toolsDir: pluginCatalog.toolsDir,
      builtinSkillsDir: pluginCatalog.builtinSkillsDir,
      builtinToolsDir: pluginCatalog.builtinToolsDir,
      skillCount: pluginCatalog.skills.length,
      toolCount: pluginCatalog.tools.length,
    },
    pluginWarnings: pluginCatalog.warnings,
    updateState,
  })

  return {
    port,
    mcpEndpoint,
    paths: {
      statePath,
      memoryPath,
      draftPath,
      catalogStatePath,
      modelConfigPath,
    },
    updates: updateState,
    client,
    agentRuntime,
    backendApplyClient,
    modelConfigStore,
    pluginCatalog,
  }
}

export function getAgentRuntimeCapabilities(context: AgentServerContext): AgentRuntimeCapabilities {
  const { pluginCatalog, paths, mcpEndpoint, backendApplyClient } = context
  return {
    service: 'movscript-agent',
    mode: 'server',
    runtime: {
      apiVersion: RUNTIME_API_VERSION,
      features: [
        'model-config',
        'runtime-capabilities',
        'backend-api-base-url-header',
        'dynamic-update-policy',
        'drafts',
        'memories',
        'agent-catalog-runtime-tools',
        'run-cancel',
      ],
      endpoints: [
        '/health',
        '/runtime/capabilities',
        '/model-config',
        '/runs',
        '/runs/{id}/cancel',
        '/drafts',
        '/memories',
      ],
    },
    mcpEndpoint,
    pluginCatalog: {
      skillsDir: pluginCatalog.skillsDir,
      toolsDir: pluginCatalog.toolsDir,
      builtinSkillsDir: pluginCatalog.builtinSkillsDir,
      builtinToolsDir: pluginCatalog.builtinToolsDir,
      skillCount: pluginCatalog.skills.length,
      toolCount: pluginCatalog.tools.length,
      warnings: pluginCatalog.warnings,
    },
    paths,
    modelConfig: {
      supported: true,
      provider: 'backend-model-config',
      path: paths.modelConfigPath,
    },
    updates: context.updates,
    backendApplyEnabled: backendApplyClient.isEnabled(),
  }
}

export function logAgentServerStartup(context: AgentServerContext): void {
  const { port, mcpEndpoint, paths, backendApplyClient, pluginCatalog, updates } = context
  console.info(`[agent] movscript-agent listening on http://127.0.0.1:${port}`)
  console.info(`[agent] using MovScript MCP endpoint ${mcpEndpoint}`)
  console.info(`[agent] state path ${paths.statePath}`)
  console.info(`[agent] memory path ${paths.memoryPath}`)
  console.info(`[agent] draft path ${paths.draftPath}`)
  console.info(`[agent] catalog state path ${paths.catalogStatePath}`)
  console.info(`[agent] model config path ${paths.modelConfigPath}`)
  console.info(`[agent] backend apply ${backendApplyClient.isEnabled() ? 'enabled' : 'disabled'}`)
  console.info(`[agent] update policy ${updates.policy.channel} (${updates.current.policyVersion})`)
  console.info(`[agent] skills dir ${pluginCatalog.skillsDir} (${pluginCatalog.skills.length})`)
  console.info(`[agent] tools dir ${pluginCatalog.toolsDir} (${pluginCatalog.tools.length})`)
  for (const warning of pluginCatalog.warnings) console.warn(`[agent] plugin warning: ${warning}`)
}
