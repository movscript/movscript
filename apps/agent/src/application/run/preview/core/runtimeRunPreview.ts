import { buildDebugContext, buildDebugTrace } from '../../../../context/diagnostics/debug/debugContext.js'
import { normalizeClientInput } from '../../../../context/input/client/normalizeClientInput.js'
import { parseAgentCommand } from '../../../../context/command/commandRouter.js'
import { buildPromptMemoryIndex } from '../../../../context/prompt/hygiene/promptHygiene.js'
import { extractAgentContext, isValidAgentProjectId } from '../../../../context/runtime/runtimeContext.js'
import { modelTurnContext } from '../../../../context/prompt/turn/modelTurnContext.js'
import type { MemoryManager } from '../../../../memory/manager/memoryManager.js'
import type { RuntimeFocusContextPort } from '../../../../ports/context/focusContextPort.js'
import { planPreviewToolRequests } from '../../../../orchestration/model/planning/preview/previewPlanner.js'
import { resolveRuntimeLayers } from '../../../../skills/resolution/layers/runtimeLayerResolver.js'
import type { AgentStore } from '../../../../state/store/core/store.js'
import { defaultRuntimeLimits } from '../../../../state/run/core/limits/runtimeLimits.js'
import type {
  AgentApprovalRequest,
  AgentCapabilitiesResponse,
  AgentRunPreview,
  PreviewRunInput,
  ToolCall,
} from '../../../../state/shared/types.js'
import { resolveAgentCapabilities } from '../../../../tools/catalog/capabilities/capabilityResolver.js'
import type { AgentRuntimeContractResolver } from '../../../../contracts/runtime/runtimeContract.js'
import type { AgentRuntimeCatalogSnapshot } from '../../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import { resolvePreviewRunMessageInput } from '../../input/execution/runExecutionInput.js'
import { resolveRuntimeAgentManifest } from '../../../catalog/manifest/runtimeManifest.js'
import { requireRuntimeThread } from '../../../shared/store/runtimeStoreLookup.js'
import { shouldLoadRuntimeMemories } from '../../execution/context/package/runtimeRunContextPackage.js'
import { runtimeLimitDefaultsFromConfigFile } from '../../shared/configFileRuntimeLimits.js'

export async function buildRuntimeRunPreview(input: {
  store: Pick<AgentStore, 'getThread'>
  mcpClient: Pick<import('../../../../adapters/mcp/client/mcpClient.js').MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  focusContextPort: RuntimeFocusContextPort
  memoryManager: MemoryManager
  catalogSnapshot: AgentRuntimeCatalogSnapshot
  contractResolver: AgentRuntimeContractResolver
  updateState?: AgentCapabilitiesResponse['updates']
  previewInput: PreviewRunInput
  makePreviewId: () => string
  makeApprovalId: () => string
  now: () => string
}): Promise<AgentRunPreview> {
  const thread = typeof input.previewInput.threadId === 'string' && input.previewInput.threadId
    ? requireRuntimeThread(input.store, input.previewInput.threadId)
    : undefined
  const clientInput = normalizeClientInput(input.previewInput.clientInput)
  const { message } = resolvePreviewRunMessageInput({ clientInput, message: input.previewInput.message, thread })
  const command = parseAgentCommand(message)

  const now = input.now()
  const hasExplicitAgentManifest = input.previewInput.agentManifest !== undefined
  const agentManifest = resolveRuntimeAgentManifest({
    inputManifest: input.previewInput.agentManifest,
    activeAgentManifest: input.catalogSnapshot.activeAgentManifest,
  })
  const contextResult = await input.focusContextPort.getFocusContext()
  const context = extractAgentContext(contextResult)
  const currentProjectId = isValidAgentProjectId(context.currentProjectId) ? context.currentProjectId : undefined
  const relevantMemories = shouldLoadRuntimeMemories(command, message)
    ? input.memoryManager.loadRelevantMemories({
      ...(currentProjectId !== undefined ? { projectId: currentProjectId } : {}),
      query: message,
    })
    : []
  const memories = buildPromptMemoryIndex(relevantMemories)
  const debugContext = buildDebugContext(contextResult, memories, clientInput)
  const layers = hasExplicitAgentManifest || input.catalogSnapshot.layeredRegistry.configFiles.size === 0
    ? undefined
    : resolveRuntimeLayers({
      registry: input.catalogSnapshot.layeredRegistry,
      baseManifest: agentManifest,
      message,
      debugContext,
      ...(clientInput ? { clientInput } : {}),
      history: thread?.messages ?? [],
    })
  const activeManifest = layers?.manifest ?? agentManifest
  const skills = layers?.skills ?? []
  const capabilities = await resolveAgentCapabilities({
    mcpClient: input.mcpClient,
    manifest: activeManifest,
    currentProjectId,
    registry: input.catalogSnapshot.toolRegistry,
    pluginCatalog: input.catalogSnapshot.pluginCatalogInfo,
    warnings: [...input.catalogSnapshot.pluginWarnings, ...(layers?.warnings ?? [])],
    updates: input.updateState,
    ...(layers ? { activeSkills: skills } : {}),
    userMessage: message,
    runRole: 'planner',
  })
  const configRuntimeLimitDefaults = runtimeLimitDefaultsFromConfigFile(input.catalogSnapshot, agentManifest)
  const runtimeLimits = defaultRuntimeLimits({ sandboxMode: input.previewInput.sandboxMode === true, ...configRuntimeLimitDefaults, override: input.previewInput.runtimeLimits })
  const promptPreview = modelTurnContext.buildRuntimePromptPreview({
    manifest: activeManifest,
    skills,
    ...(layers?.skillDiscovery ? { skillDiscovery: layers.skillDiscovery } : {}),
    context: debugContext,
    tools: capabilities.resolvedTools,
    runtimeLimits,
    warnings: [...capabilities.warnings],
    history: thread?.messages ?? [],
    userMessage: message,
    command,
  })
  const warnings: string[] = [...capabilities.warnings]

  let previewToolTaskGraph = { toolCalls: [] as ToolCall[], pendingApprovals: [] as AgentApprovalRequest[] }
  try {
    previewToolTaskGraph = await planPreviewToolRequests({
      manifest: activeManifest,
      skills,
      ...(layers?.skillDiscovery ? { skillDiscovery: layers.skillDiscovery } : {}),
      context: debugContext,
      tools: capabilities.resolvedTools,
      runtimeLimits,
      warnings,
      history: thread?.messages ?? [],
      userMessage: message,
      command,
      currentProjectId,
      registry: input.catalogSnapshot.toolRegistry,
      contractResolver: input.contractResolver,
      makeApprovalId: input.makeApprovalId,
      now: input.now,
    })
  } catch {
    // Preview still works without speculative tool predictions.
  }

  return {
    id: input.makePreviewId(),
    ...(thread ? { threadId: thread.id } : {}),
    message,
    status: 'preview',
    agentManifest: activeManifest,
    ...(currentProjectId !== undefined ? { currentProjectId } : {}),
    context: debugContext,
    skills,
    tools: capabilities.resolvedTools,
    runtimeLimits,
    promptPreview,
    debug: buildDebugTrace(activeManifest, skills, capabilities.resolvedTools, promptPreview.debugParts.map((part) => part.id), layers?.trace),
    toolCalls: previewToolTaskGraph.toolCalls,
    pendingApprovals: previewToolTaskGraph.pendingApprovals,
    warnings,
    memoryIds: memories.map((memory) => memory.id),
    memoryCount: memories.length,
    createdAt: now,
  }
}
