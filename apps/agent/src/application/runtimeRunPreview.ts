import { buildDebugContext, buildDebugTrace } from '../context/debugContext.js'
import { normalizeClientInput } from '../context/normalizeClientInput.js'
import { parseAgentCommand } from '../context/commandRouter.js'
import { buildPromptMemoryIndex } from '../context/promptHygiene.js'
import { extractAgentContext, isValidAgentProjectId } from '../context/runtimeContext.js'
import { contextManager } from '../contextManager/contextManager.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import { planPreviewToolRequests } from '../orchestration/previewPlanner.js'
import { resolveRuntimeLayers } from '../skills/runtimeLayerResolver.js'
import type { AgentStore } from '../state/store.js'
import { defaultRunPolicy } from '../state/runPolicy.js'
import type {
  AgentApprovalRequest,
  AgentCapabilitiesResponse,
  AgentRunPreview,
  PreviewRunInput,
  ToolCall,
} from '../state/types.js'
import { resolveAgentCapabilities } from '../tools/capabilityResolver.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { AgentRuntimeCatalogSnapshot } from './runtimeCatalogSnapshot.js'
import { resolvePreviewRunMessageInput } from './runExecutionInput.js'
import { resolveRuntimeAgentManifest } from './runtimeManifest.js'
import { requireRuntimeThread } from './runtimeStoreLookup.js'

export async function buildRuntimeRunPreview(input: {
  store: Pick<AgentStore, 'getThread'>
  mcpClient: Pick<import('../mcpClient.js').MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  memoryManager: MemoryManager
  draftStore: AgentDraftStore
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
    defaultAgentManifest: input.catalogSnapshot.defaultAgentManifest,
  })
  await input.mcpClient.initialize()
  const contextResult = await input.mcpClient.callTool('movscript_get_focus', {})
  const context = extractAgentContext(contextResult)
  const currentProjectId = isValidAgentProjectId(context.currentProjectId) ? context.currentProjectId : undefined
  const relevantMemories = input.memoryManager.loadRelevantMemories({
    ...(currentProjectId !== undefined ? { projectId: currentProjectId } : {}),
    query: message,
  })
  const memories = buildPromptMemoryIndex(relevantMemories)
  const debugContext = buildDebugContext(contextResult, memories, clientInput)
  const layers = hasExplicitAgentManifest
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
  const policy = defaultRunPolicy({ sandboxMode: input.previewInput.sandboxMode !== false, policy: input.previewInput.policy })
  const promptPreview = contextManager.buildPromptPreview({
    manifest: activeManifest,
    skills,
    ...(layers?.skillDiscovery ? { skillDiscovery: layers.skillDiscovery } : {}),
    context: debugContext,
    tools: capabilities.resolvedTools,
    policy,
    memories,
    warnings: [...capabilities.warnings],
    history: thread?.messages ?? [],
    userMessage: message,
    command,
    contractResolver: input.contractResolver,
  })
  const warnings: string[] = [...capabilities.warnings]

  let previewToolPlan = { toolCalls: [] as ToolCall[], pendingApprovals: [] as AgentApprovalRequest[] }
  try {
    previewToolPlan = await planPreviewToolRequests({
      manifest: activeManifest,
      skills,
      ...(layers?.skillDiscovery ? { skillDiscovery: layers.skillDiscovery } : {}),
      context: debugContext,
      tools: capabilities.resolvedTools,
      policy,
      memories,
      warnings,
      history: thread?.messages ?? [],
      userMessage: message,
      command,
      currentProjectId,
      registry: input.catalogSnapshot.toolRegistry,
      draftStore: input.draftStore,
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
    policy,
    promptPreview,
    debug: buildDebugTrace(activeManifest, skills, capabilities.resolvedTools, promptPreview.debugParts.map((part) => part.id), layers?.trace),
    toolCalls: previewToolPlan.toolCalls,
    pendingApprovals: previewToolPlan.pendingApprovals,
    warnings,
    memoryIds: memories.map((memory) => memory.id),
    memoryCount: memories.length,
    createdAt: now,
  }
}
