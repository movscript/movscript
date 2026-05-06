import { MCPClient } from '../mcpClient.js'
import { AgentRuntime, loadAgentPluginCatalog } from '../runtime/agentRuntime.js'
import { FileAgentStore, resolveAgentMemoryPath, resolveAgentStatePath } from '../runtime/store/fileStore.js'
import { FileAgentDraftStore, resolveAgentDraftPath } from '../runtime/store/draftStore.js'
import { BackendApplyClient } from '../runtime/store/backendApplyClient.js'
import { FileAgentMemoryStore } from '../runtime/memory/fileMemoryStore.js'
import { RuntimeModelConfigStore, resolveRuntimeModelConfigPath } from '../runtime/modelConfig.js'
import { ProductionRuntime } from '../production/runtime.js'
import { FileProductionStore, resolveProductionStatePath } from '../production/store.js'
import { ProductionPreviewSemanticFallbackClient } from '../production/semanticFallbackClient.js'
import {
  StaticAgentRuntimeContractResolver,
} from '../runtime/contracts/runtimeContract.js'
import {
  PRODUCTION_ORCHESTRATION_RUNTIME_CONTRACT,
} from '../production/orchestrationContract.js'
import {
  SCRIPT_SPLIT_RUNTIME_CONTRACT,
} from '../runtime/contracts/scriptSplitContract.js'

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
    productionStatePath: string
    modelConfigPath: string
  }
  client: MCPClient
  agentRuntime: AgentRuntime
  productionRuntime: ProductionRuntime
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
  backendApplyEnabled: boolean
  productionSemanticFallbackEnabled: boolean
}

export function createAgentServerContext(): AgentServerContext {
  const port = Number(process.env.MOVSCRIPT_AGENT_PORT || DEFAULT_AGENT_PORT)
  const mcpEndpoint = process.env.MOVSCRIPT_MCP_ENDPOINT || DEFAULT_MCP_ENDPOINT
  const statePath = resolveAgentStatePath()
  const memoryPath = resolveAgentMemoryPath(statePath)
  const draftPath = resolveAgentDraftPath(statePath)
  const productionStatePath = resolveProductionStatePath()
  const modelConfigPath = resolveRuntimeModelConfigPath(statePath)
  const backendApplyClient = new BackendApplyClient()
  const modelConfigStore = new RuntimeModelConfigStore(modelConfigPath)
  const productionSemanticFallbackClient = new ProductionPreviewSemanticFallbackClient()
  const pluginCatalog = loadAgentPluginCatalog()
  const client = new MCPClient({ endpoint: mcpEndpoint })
  const productionRuntime = new ProductionRuntime({
    store: new FileProductionStore(productionStatePath),
    semanticFallbackClient: productionSemanticFallbackClient,
  })
  const runtimeContractResolver = new StaticAgentRuntimeContractResolver([
    PRODUCTION_ORCHESTRATION_RUNTIME_CONTRACT,
    SCRIPT_SPLIT_RUNTIME_CONTRACT,
  ])

  const agentRuntime = new AgentRuntime({
    mcpClient: client,
    store: new FileAgentStore(statePath),
    draftStore: new FileAgentDraftStore(draftPath),
    backendApplyClient,
    memoryStore: new FileAgentMemoryStore(memoryPath),
    defaultAgentManifest: pluginCatalog.manifest,
    skillCatalog: pluginCatalog.skills,
    toolRegistry: pluginCatalog.registry,
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
  })

  return {
    port,
    mcpEndpoint,
    paths: {
      statePath,
      memoryPath,
      draftPath,
      productionStatePath,
      modelConfigPath,
    },
    client,
    agentRuntime,
    productionRuntime,
    backendApplyClient,
    modelConfigStore,
    pluginCatalog,
  }
}

export function getAgentRuntimeCapabilities(context: AgentServerContext): AgentRuntimeCapabilities {
  const { pluginCatalog, paths, mcpEndpoint, backendApplyClient, productionRuntime } = context
  return {
    service: 'movscript-agent',
    mode: 'server',
    runtime: {
      apiVersion: RUNTIME_API_VERSION,
      features: [
        'model-config',
        'runtime-capabilities',
        'backend-api-base-url-header',
        'drafts',
        'memories',
        'production-runtime',
      ],
      endpoints: [
        '/health',
        '/runtime/capabilities',
        '/model-config',
        '/runs',
        '/drafts',
        '/memories',
        '/production/actions',
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
    backendApplyEnabled: backendApplyClient.isEnabled(),
    productionSemanticFallbackEnabled: productionRuntime.isSemanticFallbackEnabled(),
  }
}

export function logAgentServerStartup(context: AgentServerContext): void {
  const { port, mcpEndpoint, paths, backendApplyClient, productionRuntime, pluginCatalog } = context
  console.info(`[agent] movscript-agent listening on http://127.0.0.1:${port}`)
  console.info(`[agent] using MovScript MCP endpoint ${mcpEndpoint}`)
  console.info(`[agent] state path ${paths.statePath}`)
  console.info(`[agent] memory path ${paths.memoryPath}`)
  console.info(`[agent] draft path ${paths.draftPath}`)
  console.info(`[agent] production state path ${paths.productionStatePath}`)
  console.info(`[agent] model config path ${paths.modelConfigPath}`)
  console.info(`[agent] backend apply ${backendApplyClient.isEnabled() ? 'enabled' : 'disabled'}`)
  console.info(`[agent] production semantic fallback ${productionRuntime.isSemanticFallbackEnabled() ? 'enabled' : 'disabled'}`)
  console.info(`[agent] skills dir ${pluginCatalog.skillsDir} (${pluginCatalog.skills.length})`)
  console.info(`[agent] tools dir ${pluginCatalog.toolsDir} (${pluginCatalog.tools.length})`)
  for (const warning of pluginCatalog.warnings) console.warn(`[agent] plugin warning: ${warning}`)
}
