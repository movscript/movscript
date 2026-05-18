import type { JSONValue } from '../types.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import type { NormalizedClientInput } from '../context/normalizeClientInput.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import { isValidAgentEntityId, type AgentContext } from '../context/runtimeContext.js'
import { buildDebugContext } from '../context/debugContext.js'
import type { AgentRuntimeContract, AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { AgentMemory } from '../memory/types.js'
import { resolveRuntimeLayers, type RuntimeLayerResolution } from '../skills/runtimeLayerResolver.js'
import { activeSkillStateFromRun } from '../skills/activeSkillState.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentMessage,
  AgentRun,
  AgentRunRole,
  AgentTraceEvent,
  AgentTraceEventKind,
  ResolvedAgentSkill,
} from '../state/types.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import { buildRunSetupMetadata } from '../state/runSetup.js'
import { resolveAgentCapabilities, type CapabilityMCPClient } from '../tools/capabilityResolver.js'
import { attachRuntimePlanDebugContext } from './runtimePlanContext.js'
import type { AgentRuntimeCatalogSnapshot } from './runtimeCatalogSnapshot.js'
import { recordRuntimeRunSetupTraces } from './runtimeRunSetupTrace.js'

export interface RuntimeRunSetupResolution {
  agentManifest: AgentManifest
  activeManifest: AgentManifest
  runtimeContract?: AgentRuntimeContract
  skills: ResolvedAgentSkill[]
  layers?: RuntimeLayerResolution
  capabilities: AgentCapabilitiesResponse
  capabilityDurationMs: number
  debugContext: AgentDebugContextPanel
  contextWarnings: string[]
}

export interface RuntimeRunSetupResolutionTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  data?: unknown
}

export async function resolveRuntimeRunSetup(input: {
  run: AgentRun
  store: Pick<AgentStore, 'getPlan' | 'listTasks' | 'listRuns'>
  catalogSnapshot: AgentRuntimeCatalogSnapshot
  contractResolver: Pick<AgentRuntimeContractResolver, 'find'>
  mcpClient: CapabilityMCPClient
  contextResult: JSONValue
  context: AgentContext
  contextError?: string
  contextDurationMs: number
  contextStartedAt: number
  contextCompletedAt: number
  focusTimings?: unknown
  memories: AgentMemory[]
  command: AgentCommandRuntime
  clientInput?: NormalizedClientInput
  userMessage: string
  history: AgentMessage[]
  runRole?: AgentRunRole
  setupRound: AgentRunRoundInfo
  authMetadata?: Record<string, JSONValue>
  updateState?: AgentCapabilitiesResponse['updates']
  timestampMs: () => number
  now: () => string
  recordTrace: (run: AgentRun, trace: RuntimeRunSetupResolutionTraceInput) => void
}): Promise<RuntimeRunSetupResolution> {
  const agentManifest = input.run.agentManifest ?? input.catalogSnapshot.defaultAgentManifest
  const contextWarnings = input.contextError ? [`Focus unavailable: ${input.contextError}`] : []
  const baseDebugContext = buildDebugContext(input.contextResult, input.memories, input.clientInput)
  if (isValidAgentEntityId(input.context.currentProductionId)) {
    baseDebugContext.productionId = input.context.currentProductionId
  }

  const shouldUseLayeredRuntime = input.run.metadata?.manifestSource === 'default'
    && input.catalogSnapshot.layeredRegistry.profiles.size > 0
  const activeSkillState = activeSkillStateFromRun(input.run)
  const layers = shouldUseLayeredRuntime
    ? resolveRuntimeLayers({
      registry: input.catalogSnapshot.layeredRegistry,
      baseManifest: agentManifest,
      message: input.userMessage,
      debugContext: baseDebugContext,
      ...(input.clientInput ? { clientInput: input.clientInput } : {}),
      history: input.history,
      requestedSkillIds: activeSkillState.loadedSkillIds,
      unloadedSkillIds: activeSkillState.unloadedSkillIds,
    })
    : undefined

  const activeManifest = layers?.manifest ?? agentManifest
  input.run.agentManifest = activeManifest
  const runtimeContract = input.contractResolver.find(activeManifest)
  const skills = layers?.skills ?? []
  const profileLimits = layers?.ctx.profile.limits

  const capabilityStartedAt = input.timestampMs()
  const capabilities = await resolveAgentCapabilities({
    mcpClient: input.mcpClient,
    manifest: activeManifest,
    currentProjectId: input.context.currentProjectId,
    registry: input.catalogSnapshot.toolRegistry,
    pluginCatalog: input.catalogSnapshot.pluginCatalogInfo,
    warnings: [...input.catalogSnapshot.pluginWarnings, ...contextWarnings, ...(layers?.warnings ?? [])],
    updates: input.updateState,
    ...(layers ? { activeSkills: skills } : {}),
    userMessage: input.userMessage,
    runRole: input.runRole,
  })
  const capabilityDurationMs = input.timestampMs() - capabilityStartedAt

  const setup = buildRunSetupMetadata({
    run: input.run,
    agentManifest: activeManifest,
    skills,
    capabilities,
    contextResult: input.contextResult,
    context: input.context,
    memories: input.memories,
    command: input.command,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    authMetadata: input.authMetadata,
    catalogSnapshot: {
      id: input.catalogSnapshot.id,
      version: input.catalogSnapshot.catalogVersion,
    },
    ...(profileLimits ? { limits: profileLimits } : {}),
  })
  const debugContext = attachRuntimePlanDebugContext({ store: input.store, context: setup.debugContext, run: input.run })

  recordRuntimeRunSetupTraces({
    run: input.run,
    setupRound: input.setupRound,
    debugContext,
    ...(input.contextError ? { contextError: input.contextError } : {}),
    contextDurationMs: input.contextDurationMs,
    contextStartedAt: input.contextStartedAt,
    contextCompletedAt: input.contextCompletedAt,
    ...(input.focusTimings ? { focusTimings: input.focusTimings } : {}),
    agentManifest,
    activeManifest,
    ...(layers ? { layers } : {}),
    toolRegistry: input.catalogSnapshot.toolRegistry,
    skills,
    capabilities,
    capabilityStartedAt,
    capabilityDurationMs,
    memories: input.memories,
    catalogSnapshotId: input.catalogSnapshot.id,
    catalogSnapshotVersion: input.catalogSnapshot.catalogVersion,
    pluginWarningCount: input.catalogSnapshot.pluginWarnings.length,
    contextWarningCount: contextWarnings.length,
    now: input.now,
    recordTrace: input.recordTrace,
  })

  input.run.metadata = setup.metadata

  return {
    agentManifest,
    activeManifest,
    ...(runtimeContract ? { runtimeContract } : {}),
    skills,
    ...(layers ? { layers } : {}),
    capabilities,
    capabilityDurationMs,
    debugContext,
    contextWarnings,
  }
}
