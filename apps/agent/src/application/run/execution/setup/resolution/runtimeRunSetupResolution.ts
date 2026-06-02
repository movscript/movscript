import type { JSONValue } from '../../../../../shared/protocol/types.js'
import type { AgentManifest } from '../../../../../catalog/manifest/agentManifest.js'
import type { NormalizedClientInput } from '../../../../../context/input/client/normalizeClientInput.js'
import type { AgentCommandRuntime } from '../../../../../context/command/commandRouter.js'
import { isValidAgentEntityId, type AgentContext } from '../../../../../context/runtime/runtimeContext.js'
import { buildDebugContext } from '../../../../../context/diagnostics/debug/debugContext.js'
import type { AgentRuntimeContract, AgentRuntimeContractResolver } from '../../../../../contracts/runtime/runtimeContract.js'
import type { AgentMemory } from '../../../../../memory/shared/types.js'
import { addSkillToolGrantsToManifest, resolveRuntimeLayers, type RuntimeLayerResolution } from '../../../../../skills/resolution/layers/runtimeLayerResolver.js'
import { activeSkillStateFromRun } from '../../../../../skills/activation/state/activeSkillState.js'
import type { AgentStore } from '../../../../../state/store/core/store.js'
import type {
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentMessage,
  AgentRun,
  AgentRunRole,
  AgentTraceEvent,
  AgentTraceEventKind,
  ResolvedAgentSkill,
} from '../../../../../state/shared/types.js'
import type { AgentRunRoundInfo } from '../../../../../state/run/core/round/runRound.js'
import { buildRunSetupMetadata } from '../../../../../state/run/core/setup/runSetup.js'
import { resolveAgentCapabilities, type CapabilityMCPClient } from '../../../../../tools/catalog/capabilities/capabilityResolver.js'
import { attachRuntimePlanDebugContext } from '../../../../taskgraph/read/context/runtimePlanContext.js'
import type { AgentRuntimeCatalogSnapshot } from '../../../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import { recordRuntimeRunSetupTraces } from '../trace/runtimeRunSetupTrace.js'

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
  store: Pick<AgentStore, 'getTaskGraph' | 'listTasks' | 'listRuns'>
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
  const agentManifest = input.run.agentManifest ?? input.catalogSnapshot.activeAgentManifest
  const contextWarnings = input.contextError ? [`Focus unavailable: ${input.contextError}`] : []
  const baseDebugContext = buildDebugContext(input.contextResult, input.memories, input.clientInput)
  if (isValidAgentEntityId(input.context.currentProductionId)) {
    baseDebugContext.productionId = input.context.currentProductionId
  }

  const activeSkillState = activeSkillStateFromRun(input.run)
  const shouldUseLayeredRuntime = input.catalogSnapshot.layeredRegistry.configFiles.size > 0
    && (input.run.metadata?.manifestSource === 'default' || activeSkillState.loadedSkillIds.length > 0 || activeSkillState.unloadedSkillIds.length > 0)
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

  const activeManifest = layers?.manifest
    ? input.run.metadata?.manifestSource === 'default'
      ? layers.manifest
      : addSkillToolGrantsToManifest({
        ...agentManifest,
        metadata: {
          ...(agentManifest.metadata ?? {}),
          ...(layers.manifest.metadata?.resolvedFrom ? { resolvedFrom: layers.manifest.metadata.resolvedFrom } : {}),
          ...(layers.manifest.metadata?.configFileId ? { configFileId: layers.manifest.metadata.configFileId } : {}),
          ...(layers.manifest.metadata?.configFileVersion ? { configFileVersion: layers.manifest.metadata.configFileVersion } : {}),
        },
      }, {
        registry: input.catalogSnapshot.layeredRegistry,
        skillIds: layers.skills.map((skill) => skill.id),
      })
    : agentManifest
  input.run.agentManifest = activeManifest
  const runtimeContract = input.contractResolver.find(activeManifest)
  const skills = layers?.skills ?? []
  const configFileLimits = layers?.ctx.configFile.limits

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
    ...(configFileLimits ? { limits: configFileLimits } : {}),
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
