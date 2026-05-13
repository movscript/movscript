import { MCPError, type MCPClient } from '../mcpClient.js'
import type { JSONValue } from '../types.js'
import { DEFAULT_AGENT_MANIFEST, normalizeAgentManifest, type AgentManifest } from '../catalog/agentManifest.js'
import type { AgentProfile, CapabilityPack, SkillDefinition, ToolDefinition } from '../catalog/types.js'
import {
  InMemoryAgentCatalogStateStore,
  type AgentCatalogStateStore,
} from '../catalog/state.js'
import { loadAgentPluginCatalog as loadCatalogSnapshot, type AgentPluginCatalog } from '../catalog/loader.js'
import { extractAgentContext, parseToolResult } from '../context/runtimeContext.js'
import { resolveAgentCapabilities } from '../tools/capabilityResolver.js'
import { MemoryManager } from '../memory/memoryManager.js'
import { InMemoryAgentMemoryStore, type AgentMemoryStore } from '../memory/memoryStore.js'
import type { AgentMemory, MemoryQuery } from '../memory/types.js'
import { InMemoryAgentStore, type AgentStore, type AgentTraceQuery } from '../state/store.js'
import { DEFAULT_TOOL_REGISTRY, type ToolRegistry } from '../tools/toolRegistry.js'
import {
  InMemoryAgentDraftStore,
  normalizeDraftStatus,
  validateDraft,
  type AgentDraft,
  type AgentDraftStore,
} from '../drafts/draftStore.js'
import { buildApplyDraftPreview, markDraftApplied, rejectDraft, type ApplyDraftInput } from '../drafts/draftApply.js'
import { BackendApplyClient, BackendApplyHTTPError, type BackendApplyResult } from '../drafts/backendApplyClient.js'
import { MCPBackendApplyClient } from '../drafts/mcpBackendApplyClient.js'
import { runAgentGraph } from '../orchestration/agentGraph.js'
import { planSupervisorDispatch } from '../orchestration/supervisorGraph.js'
import { generatePlanTasks } from '../orchestration/planGenerator.js'
import { buildPromptPreview } from '../orchestration/contextBuilder.js'
import { buildPromptMemoryIndex } from '../context/promptHygiene.js'
import { resolveRuntimeLayers } from '../skills/runtimeLayerResolver.js'
import {
  EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
  type AgentRuntimeContractResolver,
} from '../contracts/runtimeContract.js'
import { buildAgentRun } from '../state/runFactory.js'
import { appendTraceEvent, buildRunStep } from '../state/runTrace.js'
import { buildRunSetupMetadata } from '../state/runSetup.js'
import type {
  AgentApprovalRequest,
  AgentPlan,
  AgentPlanSummary,
  AgentPlanSnapshot,
  AgentPlanStreamEvent,
  AgentRunRole,
  AgentTask,
  AgentTaskArtifact,
  AgentInputRequest,
  AgentMessage,
  AgentMessageRole,
  AgentRunPreview,
  AgentRun,
  AgentRunStreamRun,
  AgentTraceEvent,
  AgentTraceEventKind,
  AgentRunStreamEvent,
  AgentRunStep,
  AgentRuntimeOptions,
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentRunPolicy,
  AgentThread,
  AgentThreadSummary,
  ApproveRunInput,
  CancelRunInput,
  AnswerRunInputRequestInput,
  CreateMessageInput,
  CreatePlanInput,
  CreatePlanTaskInput,
  CreateRunInput,
  CreateToolRunInput,
  CreateThreadInput,
  DispatchPlanInput,
  DispatchPlanResult,
  PreviewRunInput,
  RejectRunInput,
  ReplanRunInput,
  ReplanRunResult,
  ToolCallOutcome,
  ToolCall,
  UpdatePlanTaskInput,
  UpdateThreadInput,
} from '../state/types.js'
import { normalizeClientInput, buildRuntimeUserMessage } from '../context/normalizeClientInput.js'
import {
  normalizeStringArray,
  normalizeApprovedToolNames,
  normalizeToolCall,
  normalizeBackendAuthToken,
  normalizeBackendAPIBaseURL,
  normalizeDraftQuery,
  normalizeOptionalDraftKind,
  getApprovedToolNames,
  defaultRunPolicy,
  buildRunRound,
  mergePendingApprovals,
  mergePendingInputRequests,
  formatInputAnswerMessage,
  type AgentRunRoundInfo,
} from '../context/normalizeRunInput.js'
import { buildDebugContext, buildDebugTrace } from '../context/debugContext.js'
import { parseAgentCommand } from '../context/commandRouter.js'
import { planPreviewToolRequests } from '../orchestration/previewPlanner.js'
import { reloadCatalogCandidate } from '../catalog/reloader.js'
import {
  buildLocalDiagnosticCommand,
  buildLocalDiagnosticFallbackContextResult,
  isLocalDiagnosticCommand,
  parseGenerationDebugCommand,
  renderLocalFinalAssistantContent,
} from '../context/localDiagnosticCommands.js'
import { executeTool } from '../orchestration/toolExecutor.js'
import { buildGenerationEvent } from '../generation/generationEvents.js'

export type {
  AgentMessage,
  AgentMessageRole,
  AgentPlan,
  AgentPlanSnapshot,
  AgentPlanStreamEvent,
  AgentRun,
  AgentRunRole,
  AgentRunPreview,
  AgentRunStatus,
  AgentRunStreamEvent,
  AgentRunStep,
  AgentRuntimeOptions,
  AgentApprovalRequest,
  AgentInputRequest,
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentRunDebugTrace,
  AgentRunPolicy,
  AgentStepStatus,
  AgentThread,
  AgentThreadSummary,
  ApproveRunInput,
  CancelRunInput,
  AnswerRunInputRequestInput,
  CreateMessageInput,
  CreatePlanInput,
  CreatePlanTaskInput,
  CreateRunInput,
  CreateToolRunInput,
  CreateThreadInput,
  DispatchPlanInput,
  DispatchPlanResult,
  PreviewRunInput,
  RejectRunInput,
  UpdateThreadInput,
  ToolCall,
  ToolCallOutcome,
  UpdatePlanTaskInput,
} from '../state/types.js'
export type { AgentMemory, AgentMemoryKind, MemoryQuery } from '../memory/types.js'
export type { AgentManifest, AgentToolGrant } from '../catalog/agentManifest.js'
export type { AgentPluginCatalog } from '../catalog/loader.js'
export type {
  AgentUpdateCandidate,
  AgentUpdateChannel,
  AgentUpdateDecision,
  AgentUpdateEvaluation,
  AgentUpdateKind,
  AgentUpdatePolicy,
  AgentUpdatePolicyRule,
  AgentUpdateSeverity,
  AgentUpdateState,
} from '../updates/updatePolicy.js'
export { DEFAULT_AGENT_MANIFEST, normalizeAgentManifest } from '../catalog/agentManifest.js'
export {
  DEFAULT_AGENT_UPDATE_POLICY,
  buildAgentUpdateState,
  evaluateAgentUpdateCandidate,
  normalizeAgentUpdateCandidate,
  normalizeAgentUpdatePolicy,
} from '../updates/updatePolicy.js'
export { InMemoryAgentMemoryStore } from '../memory/memoryStore.js'
export { InMemoryAgentStore } from '../state/store.js'
export {
  FileAgentDraftStore,
  InMemoryAgentDraftStore,
  normalizeDraftStatus,
  resolveAgentDraftPath,
} from '../drafts/draftStore.js'
export { DEFAULT_TOOL_REGISTRY, StaticToolRegistry } from '../tools/toolRegistry.js'
export {
  loadAgentPluginCatalog,
  resolveAgentSkillsDir,
  resolveAgentToolsDir,
  resolveBuiltinAgentSkillsDir,
  resolveBuiltinAgentToolsDir,
} from '../catalog/loader.js'
export {
  FileAgentCatalogStateStore,
  InMemoryAgentCatalogStateStore,
  resolveAgentCatalogStatePath,
  type AgentCatalogState,
  type AgentCatalogStateStore,
} from '../catalog/state.js'

interface AgentRuntimeCatalogSnapshot {
  id: string
  catalogVersion: string | null
  defaultAgentManifest: AgentManifest
  toolRegistry: ToolRegistry
  layeredRegistry: AgentPluginCatalog['layeredRegistry']
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings: string[]
}

export class AgentRuntime {
  private readonly mcpClient: Pick<MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  private readonly store: AgentStore
  private readonly draftStore: AgentDraftStore
  private readonly backendApplyClient: BackendApplyClient
  private readonly memoryStore: AgentMemoryStore
  private readonly memoryManager: MemoryManager
  private defaultAgentManifest: AgentManifest
  private toolRegistry: ToolRegistry
  private layeredRegistry: AgentPluginCatalog['layeredRegistry']
  private readonly contractResolver: AgentRuntimeContractResolver
  private pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  private pluginWarnings: string[]
  private catalogSnapshot: AgentRuntimeCatalogSnapshot
  private readonly catalogStateStore: AgentCatalogStateStore
  private readonly pluginCatalogLoader?: NonNullable<AgentRuntimeOptions['pluginCatalogLoader']>
  private readonly updateState?: AgentCapabilitiesResponse['updates']
  private readonly runControllers = new Map<string, AbortController>()
  private readonly runAuth = new Map<string, { backendAuthToken?: string; backendAPIBaseURL?: string }>()
  private readonly runCatalogSnapshots = new Map<string, AgentRuntimeCatalogSnapshot>()
  private readonly runStreamSubscribers = new Map<string, Set<(event: AgentRunStreamEvent) => void>>()
  private readonly planStreamSubscribers = new Map<string, Set<(event: AgentPlanStreamEvent) => void>>()
  private readonly postRunRecordTasks = new Set<Promise<void>>()

  constructor(options: AgentRuntimeOptions) {
    this.mcpClient = options.mcpClient
    this.store = options.store ?? new InMemoryAgentStore()
    this.draftStore = options.draftStore ?? new InMemoryAgentDraftStore()
    this.backendApplyClient = options.backendApplyClient ?? new MCPBackendApplyClient(this.mcpClient)
    this.memoryStore = options.memoryStore ?? new InMemoryAgentMemoryStore()
    this.memoryManager = new MemoryManager(this.memoryStore)
    const initialCatalog = options.pluginCatalog
    const builtinCatalog = initialCatalog ?? (!options.pluginCatalogLoader
      && !options.defaultAgentManifest
      && !options.toolRegistry
      ? loadCatalogSnapshot()
      : undefined)
    this.defaultAgentManifest = options.defaultAgentManifest ?? builtinCatalog?.manifest ?? DEFAULT_AGENT_MANIFEST
    this.toolRegistry = options.toolRegistry ?? builtinCatalog?.registry ?? DEFAULT_TOOL_REGISTRY
    this.layeredRegistry = builtinCatalog?.layeredRegistry
      ?? loadCatalogSnapshot({
        baseManifest: this.defaultAgentManifest,
        baseTools: this.toolRegistry.list(),
      }).layeredRegistry
    this.contractResolver = options.contractResolver ?? EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER
    this.pluginCatalogInfo = options.pluginCatalogInfo ?? (builtinCatalog
      ? {
        skillsDir: builtinCatalog.skillsDir,
        toolsDir: builtinCatalog.toolsDir,
        builtinSkillsDir: builtinCatalog.builtinSkillsDir,
        builtinToolsDir: builtinCatalog.builtinToolsDir,
        skillCount: builtinCatalog.layeredSkills.length,
        toolCount: builtinCatalog.layeredTools.length,
      }
      : undefined)
    this.pluginWarnings = options.pluginWarnings ?? builtinCatalog?.warnings ?? []
    this.catalogSnapshot = this.createCatalogSnapshot()
    this.catalogStateStore = options.catalogStateStore ?? new InMemoryAgentCatalogStateStore()
    this.pluginCatalogLoader = options.pluginCatalogLoader
    this.updateState = options.updateState
    if (this.pluginCatalogLoader && !initialCatalog) this.reloadAgentCatalog()
  }

  async getCapabilities(input: {
    agentManifest?: unknown
    currentProjectId?: number
    includeResources?: boolean
    runRole?: AgentRunRole
  } = {}): Promise<AgentCapabilitiesResponse> {
    const agentManifest = normalizeAgentManifest(input.agentManifest ?? this.defaultAgentManifest)
    return resolveAgentCapabilities({
      mcpClient: this.mcpClient,
      manifest: agentManifest,
      currentProjectId: input.currentProjectId,
      includeResources: input.includeResources,
      registry: this.toolRegistry,
      pluginCatalog: this.pluginCatalogInfo,
      warnings: this.pluginWarnings,
      updates: this.updateState,
      runRole: input.runRole,
    })
  }

  listRegisteredTools(): ReturnType<ToolRegistry['list']> {
    return this.toolRegistry.list()
  }

  listSkillCatalog(): SkillDefinition[] {
    return Array.from(this.layeredRegistry.skills.values())
  }

  getDefaultAgentManifest(): AgentManifest {
    return this.defaultAgentManifest
  }

  private createCatalogSnapshot(): AgentRuntimeCatalogSnapshot {
    return {
      id: makeId('catalog'),
      catalogVersion: this.pluginCatalogInfo?.metadata?.catalogVersion as string | null | undefined ?? null,
      defaultAgentManifest: this.defaultAgentManifest,
      toolRegistry: this.toolRegistry,
      layeredRegistry: this.layeredRegistry,
      ...(this.pluginCatalogInfo ? { pluginCatalogInfo: this.pluginCatalogInfo } : {}),
      pluginWarnings: this.pluginWarnings,
    }
  }

  private captureRunCatalogSnapshot(runId: string): AgentRuntimeCatalogSnapshot {
    const snapshot = this.catalogSnapshot
    this.runCatalogSnapshots.set(runId, snapshot)
    return snapshot
  }

  private getRunCatalogSnapshot(runId: string): AgentRuntimeCatalogSnapshot {
    return this.runCatalogSnapshots.get(runId) ?? this.catalogSnapshot
  }

  reloadAgentCatalog(): JSONValue {
    if (!this.pluginCatalogLoader) {
      return {
        status: 'unchanged',
        reason: 'dynamic agent catalog loading is not configured',
        skillCount: this.layeredRegistry.skills.size,
        toolCount: this.layeredRegistry.tools.size,
      } as unknown as JSONValue
    }
    const reload = reloadCatalogCandidate({
      load: () => this.pluginCatalogLoader?.() ?? loadCatalogSnapshot(),
      previous: {
        catalogVersion: this.pluginCatalogInfo?.metadata?.catalogVersion as string | null | undefined ?? null,
        skillCount: this.layeredRegistry.skills.size,
        toolCount: this.layeredRegistry.tools.size,
      },
      isBlockingIssue: isBlockingCatalogIssue,
    })
    if (reload.status === 'rolled_back') return reload as unknown as JSONValue
    const catalog = reload.catalog
    this.defaultAgentManifest = catalog.manifest
    this.toolRegistry = catalog.registry
    this.layeredRegistry = catalog.layeredRegistry
    this.pluginWarnings = catalog.warnings
    this.pluginCatalogInfo = {
      skillsDir: catalog.skillsDir,
      toolsDir: catalog.toolsDir,
      builtinSkillsDir: catalog.builtinSkillsDir,
      builtinToolsDir: catalog.builtinToolsDir,
      skillCount: catalog.layeredSkills.length,
      toolCount: catalog.layeredTools.length,
      metadata: {
        catalogVersion: reload.catalogVersion,
        catalogIssueCount: reload.catalogIssueCount,
      },
    }
    this.catalogSnapshot = this.createCatalogSnapshot()
    return {
      status: reload.status,
      eventType: reload.eventType,
      outcome: reload.outcome,
      catalogVersion: reload.catalogVersion,
      stagingDir: reload.stagingDir,
      skillCount: reload.skillCount,
      toolCount: reload.toolCount,
      warnings: reload.warnings,
      catalogIssueCount: reload.catalogIssueCount,
    } as unknown as JSONValue
  }

  inspectAgentCatalog(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    const snapshot = this.getRunCatalogSnapshot(run.id)
    const registry = snapshot.layeredRegistry
    const view = normalizeCatalogInspectView(input.view)
    const id = normalizeNonEmptyString(input.id)
    const profileId = normalizeNonEmptyString(run.agentManifest?.metadata?.profileId)
      ?? normalizeNonEmptyString(snapshot.defaultAgentManifest.metadata?.profileId)
      ?? 'movscript.profile.default'
    const profile = registry.profiles.get(profileId) ?? registry.profiles.get('movscript.profile.default') ?? registry.profiles.values().next().value
    const enabledPackIds = profile ? collectCatalogPackClosure(profile.enabledPacks, registry.packs) : []
    const enabledPackSet = new Set(enabledPackIds)
    const activeSkillIds = activeSkillIdsFromRun(run)
    const base = {
      status: 'ok',
      catalogSnapshot: {
        id: snapshot.id,
        version: snapshot.catalogVersion,
      },
      view,
    }

    if (view === 'summary') {
      return {
        ...base,
        profile: profile ? summarizeCatalogProfile(profile) : null,
        counts: {
          packs: registry.packs.size,
          enabledPacks: enabledPackIds.length,
          skills: registry.skills.size,
          tools: registry.tools.size,
          profiles: registry.profiles.size,
        },
        enabledPackIds,
        activeSkillIds,
        availableSkillIds: profile ? uniqueStrings([
          ...(profile.persona ? [profile.persona] : []),
          ...profile.enabledPolicies,
          ...profile.enabledWorkflows,
        ]) : [],
        toolNames: profile?.toolGrants.map((grant) => grant.name) ?? [],
        warnings: snapshot.pluginWarnings,
      } as unknown as JSONValue
    }

    if (!id) throw new Error(`inspect_agent_catalog ${view} view requires id`)
    if (view === 'pack') {
      const pack = registry.packs.get(id)
      if (!pack) throw new Error(`catalog pack not found: ${id}`)
      return {
        ...base,
        pack: summarizeCatalogPack(pack),
        enabled: enabledPackSet.has(pack.id),
      } as unknown as JSONValue
    }
    if (view === 'skill') {
      const skill = registry.skills.get(id)
      if (!skill) throw new Error(`catalog skill not found: ${id}`)
      return {
        ...base,
        skill: summarizeCatalogSkill(skill, input.includeInstruction === true),
        active: activeSkillIds.includes(skill.id),
        coveredByEnabledPack: enabledPackIds.some((packId) => registry.packs.get(packId)?.skills.includes(skill.id)),
      } as unknown as JSONValue
    }
    if (view === 'tool') {
      const tool = registry.tools.get(id)
      if (!tool) throw new Error(`catalog tool not found: ${id}`)
      const grant = profile?.toolGrants.find((item) => item.name === tool.name)
      return {
        ...base,
        tool: summarizeCatalogTool(tool, input.includeSchema === true),
        enabledByPack: enabledPackIds.some((packId) => registry.packs.get(packId)?.tools.includes(tool.name)),
        grant: grant ? { mode: grant.mode, ...(grant.approval ? { approval: grant.approval } : {}) } : null,
      } as unknown as JSONValue
    }
    if (view === 'profile') {
      const target = registry.profiles.get(id)
      if (!target) throw new Error(`catalog profile not found: ${id}`)
      return {
        ...base,
        profile: summarizeCatalogProfile(target),
        isCurrent: target.id === profile?.id,
      } as unknown as JSONValue
    }
    throw new Error(`unsupported catalog inspect view: ${view}`)
  }

  async createAgentPlan(run: AgentRun, input: Record<string, JSONValue> = {}): Promise<JSONValue> {
    const plannerRun = this.requirePlannerRun(run.id)
    if (plannerRun.planId) {
      return {
        status: 'exists',
        planId: plannerRun.planId,
        plannerRunId: plannerRun.id,
        snapshot: this.getPlanSnapshot(plannerRun.planId),
      } as unknown as JSONValue
    }
    const existingPlan = this.findThreadPlan(plannerRun.threadId)
    if (existingPlan) {
      this.attachPlannerRunToPlan(plannerRun.id, existingPlan.id, 'movscript_create_plan')
      return {
        status: 'attached',
        planId: existingPlan.id,
        plannerRunId: plannerRun.id,
        snapshot: this.getPlanSnapshot(existingPlan.id),
      } as unknown as JSONValue
    }
    const snapshot = await this.createPlan({
      ...input,
      threadId: plannerRun.threadId,
      createPlannerRun: false,
    })
    this.attachPlannerRunToPlan(plannerRun.id, snapshot.plan.id, 'movscript_create_plan')
    const plan = this.requirePlan(snapshot.plan.id)
    plan.status = snapshot.tasks.length > 0 ? 'running' : 'blocked'
    plan.updatedAt = isoNow()
    this.store.updatePlan(plan)

    return {
      status: 'created',
      planId: plan.id,
      plannerRunId: plannerRun.id,
      snapshot: this.getPlanSnapshot(plan.id),
    } as unknown as JSONValue
  }

  getAgentPlan(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    const plannerRun = this.requirePlannerRun(run.id)
    const planId = normalizeNonEmptyString(input.planId) ?? plannerRun.planId ?? this.findThreadPlan(plannerRun.threadId)?.id
    if (!planId) throw new Error('get_plan requires planId or a planner run plan')
    const plan = this.requirePlan(planId)
    if (plan.threadId !== plannerRun.threadId) throw new Error(`planner run ${plannerRun.id} cannot inspect plan ${planId}`)
    return {
      status: 'ok',
      planId,
      plannerRunId: plannerRun.id,
      snapshot: this.getPlanSnapshot(planId),
    } as unknown as JSONValue
  }

  replanAgentPlan(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    const plannerRun = this.requirePlannerRun(run.id)
    const planId = normalizeNonEmptyString(input.planId) ?? plannerRun.planId ?? this.findThreadPlan(plannerRun.threadId)?.id
    if (!planId) throw new Error('replan requires planId or a planner run plan')
    if (plannerRun.planId && plannerRun.planId !== planId) throw new Error(`planner run ${plannerRun.id} cannot replan plan ${planId}`)
    const plan = this.requirePlan(planId)
    if (plan.threadId !== plannerRun.threadId) throw new Error(`planner run ${plannerRun.id} cannot replan plan ${planId}`)
    if (!plannerRun.planId) this.attachPlannerRunToPlan(plannerRun.id, planId, 'movscript_replan')
    const result = this.replanRun(plannerRun.id, {
      ...input,
      planId,
      plannerRunId: plannerRun.id,
    })
    return {
      status: 'updated',
      planId,
      plannerRunId: plannerRun.id,
      createdTaskIds: result.createdTaskIds,
      updatedTaskIds: result.updatedTaskIds,
      resetTaskIds: result.resetTaskIds,
      ...(result.dispatch ? { dispatch: result.dispatch } : {}),
      snapshot: this.getPlanSnapshot(planId),
    } as unknown as JSONValue
  }

  spawnSubagent(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    const plannerRun = this.requirePlannerRun(run.id)
    const planId = plannerRun.planId
    if (!planId) throw new Error('spawn_subagent requires the planner run to be attached to a plan')
    const createdTaskIds: string[] = []
    const taskInputs = normalizePlanTaskInputs(input.tasks)
    const usedSubagentNames = this.collectSubagentNames(planId)
    const tasksToCreate: AgentTask[] = []
    for (const [index, taskInput] of taskInputs.entries()) {
      const subagentName = normalizeNonEmptyString(taskInput.subagentName)
        ?? normalizeSubagentNameAt(input.subagentNames, index)
        ?? nextSubagentName(usedSubagentNames)
      if (usedSubagentNames.has(subagentName)) throw new Error(`subagent name already exists in plan ${planId}: ${subagentName}`)
      usedSubagentNames.add(subagentName)
      const task = buildAgentTask(planId, {
        ...taskInput,
        metadata: {
          ...(isJSONRecord(taskInput.metadata) ? taskInput.metadata : {}),
          executionMode: 'worker',
          createdByPlannerRunId: plannerRun.id,
          ...(subagentName ? { subagentName } : {}),
          ...taskExecutionOverrideMetadata(taskInput),
        },
      }, isoNow())
      if (this.store.getTask(task.id)) throw new Error(`task already exists: ${task.id}`)
      if (tasksToCreate.some((item) => item.id === task.id)) throw new Error(`task already exists: ${task.id}`)
      tasksToCreate.push(task)
    }
    const taskToCreateById = new Map(tasksToCreate.map((task) => [task.id, task]))
    const requestedTaskIds = uniqueStrings([
      ...normalizeStringList(input.taskIds),
      ...(typeof input.taskId === 'string' && input.taskId.trim() ? [input.taskId.trim()] : []),
      ...tasksToCreate.map((task) => task.id),
    ])
    const subagentNameByTaskId = buildRequestedSubagentNameMap(input, requestedTaskIds)
    for (const taskId of requestedTaskIds) {
      if (!subagentNameByTaskId.has(taskId)) {
        const task = taskToCreateById.get(taskId) ?? this.requireTask(taskId)
        if (task.planId !== planId) throw new Error(`task ${taskId} does not belong to plan ${planId}`)
        const existingName = subagentNameFromTask(task)
        const name = existingName ?? nextSubagentName(usedSubagentNames)
        subagentNameByTaskId.set(taskId, name)
        usedSubagentNames.add(name)
      }
    }
    for (const taskId of requestedTaskIds) {
      const task = taskToCreateById.get(taskId) ?? this.requireTask(taskId)
      if (task.planId !== planId) throw new Error(`task ${taskId} does not belong to plan ${planId}`)
      const subagentName = subagentNameByTaskId.get(taskId)
      if (subagentName) this.assertUniqueSubagentNameForTask(planId, taskId, subagentName, subagentNameByTaskId)
    }
    for (const task of tasksToCreate) {
      this.store.createTask(task)
      this.recordTaskProtocolEvents(task)
      this.emitPlanTaskEvent(planId, task)
      createdTaskIds.push(task.id)
    }

    for (const taskId of requestedTaskIds) {
      const task = this.requireTask(taskId)
      const subagentName = subagentNameByTaskId.get(taskId)
      if (subagentName && (!isRecord(task.metadata) || task.metadata.subagentName !== subagentName)) {
        this.updateTask(task.id, {
          metadata: {
            ...(task.metadata ?? {}),
            subagentName,
          },
        })
      }
      if (task.status === 'blocked' || ((task.status === 'failed' || task.status === 'cancelled') && input.retryFailed !== true)) {
        this.updateTask(task.id, {
          status: 'pending',
          progress: 0,
          metadata: {
            ...(task.metadata ?? {}),
            executionMode: 'worker',
            resetByPlannerRunId: plannerRun.id,
          },
        })
      }
    }

    const dispatch = this.dispatchPlan({
      planId,
      plannerRunId: plannerRun.id,
      ...(requestedTaskIds.length > 0 ? { taskIds: requestedTaskIds } : {}),
      maxWorkers: input.maxWorkers,
      maxTaskAttempts: input.maxTaskAttempts,
      retryFailed: input.retryFailed,
      workerTimeoutMs: input.workerTimeoutMs,
    })
    return {
      status: dispatch.spawnedRuns.length > 0 ? 'spawned' : 'no_runnable_tasks',
      planId,
      plannerRunId: plannerRun.id,
      createdTaskIds,
      spawnedRuns: dispatch.spawnedRuns.map(toSubagentRunSummary),
      blockedTaskIds: dispatch.blockedTaskIds,
      retriedTaskIds: dispatch.retriedTaskIds,
      timedOutRunIds: dispatch.timedOutRunIds,
      snapshot: this.subagentSnapshot(planId, plannerRun.id),
    } as unknown as JSONValue
  }

  listSubagents(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    const plannerRun = this.requirePlannerRun(run.id)
    const planId = this.resolvePlannerRunPlanId(plannerRun, input.planId, 'movscript_list_subagents', 'inspect')
    return {
      status: 'ok',
      planId,
      plannerRunId: plannerRun.id,
      snapshot: this.subagentSnapshot(planId, plannerRun.id),
    } as unknown as JSONValue
  }

  async waitSubagent(run: AgentRun, input: Record<string, JSONValue> = {}): Promise<JSONValue> {
    const plannerRun = this.requirePlannerRun(run.id)
    const planId = this.resolvePlannerRunPlanId(plannerRun, input.planId, 'movscript_wait_subagent', 'wait on')
    const timeoutMs = Math.min(30_000, Math.max(0, normalizePositiveInteger(input.timeoutMs) ?? 0))
    const deadline = Date.now() + timeoutMs
    const resolvedInput = this.resolveSubagentNameInput(planId, input)
    let result = this.resolveSubagentWaitTarget(planId, resolvedInput)
    while (!result.done && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      result = this.resolveSubagentWaitTarget(planId, resolvedInput)
    }
    return {
      status: result.status,
      done: result.done,
      target: result.target,
      planId,
      plannerRunId: plannerRun.id,
      snapshot: this.subagentSnapshot(planId, plannerRun.id),
    } as unknown as JSONValue
  }

  cancelSubagent(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    const plannerRun = this.requirePlannerRun(run.id)
    const planId = plannerRun.planId
    if (!planId) throw new Error('cancel_subagent requires the planner run to be attached to a plan')
    const resolvedInput = this.resolveSubagentNameInput(planId, input)
    const taskId = normalizeNonEmptyString(resolvedInput.taskId)
    const runId = normalizeNonEmptyString(resolvedInput.runId) ?? this.requireTaskOwnerRunId(planId, taskId)
    if (!runId && !taskId) throw new Error('cancel_subagent requires runId or taskId')
    if (!runId && taskId) return this.cancelPendingSubagentTask(plannerRun, taskId, input)
    const targetRunId = runId!
    const childRun = this.requireRun(targetRunId)
    if (childRun.planId !== planId) throw new Error(`run ${targetRunId} does not belong to plan ${planId}`)
    if (childRun.role !== 'worker') {
      throw new Error(`cancel_subagent can only cancel worker subagent runs`)
    }
    const result = this.cancelSubtree(targetRunId, { reason: input.reason })
    const cancelledRun = this.requireRun(targetRunId)
    return {
      status: result.cancelledRunIds.length > 0 ? 'cancelled' : 'unchanged',
      planId,
      plannerRunId: plannerRun.id,
      target: { kind: 'run', run: this.toSubagentRunSummaryForPlan(cancelledRun) as unknown as JSONValue },
      cancelledRunIds: result.cancelledRunIds,
      snapshot: this.subagentSnapshot(planId, plannerRun.id),
    } as unknown as JSONValue
  }

  private cancelPendingSubagentTask(plannerRun: AgentRun, taskId: string, input: Record<string, JSONValue>): JSONValue {
    const planId = plannerRun.planId
    if (!planId) throw new Error('cancel_subagent requires the planner run to be attached to a plan')
    const task = this.requireTask(taskId)
    if (task.planId !== planId) throw new Error(`task ${taskId} does not belong to plan ${planId}`)
    if (task.ownerRunId) throw new Error(`task ${taskId} is already owned by run ${task.ownerRunId}`)
    const cancellable = task.status === 'pending' || task.status === 'blocked' || task.status === 'needs_review'
    const cancelledTask = cancellable
      ? this.updateTask(task.id, {
        status: 'cancelled',
        progress: task.progress,
        blockedReason: normalizeNonEmptyString(input.reason) ?? 'Subagent task was cancelled before a worker run started.',
        metadata: {
          cancelledByPlannerRunId: plannerRun.id,
        },
      })
      : task
    return {
      status: cancellable ? 'cancelled' : 'unchanged',
      planId,
      plannerRunId: plannerRun.id,
      target: {
        kind: 'task',
        task: {
          ...cancelledTask,
          ...(subagentNameFromTask(cancelledTask) ? { subagentName: subagentNameFromTask(cancelledTask) } : {}),
        } as unknown as JSONValue,
      },
      cancelledRunIds: [],
      snapshot: this.subagentSnapshot(planId, plannerRun.id),
    } as unknown as JSONValue
  }

  createThread(input: CreateThreadInput = {}): AgentThread {
    const now = isoNow()
    const thread: AgentThread = {
      id: makeId('thread'),
      ...(typeof input.title === 'string' && input.title.trim() ? { title: input.title.trim() } : {}),
      ...(typeof input.projectId === 'number' && Number.isFinite(input.projectId) ? { projectId: input.projectId } : {}),
      ...(isRecord(input.metadata) ? { metadata: input.metadata as Record<string, JSONValue> } : {}),
      archived: input.archived === true,
      status: 'idle',
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    this.store.createThread(thread)
    for (const message of input.messages ?? []) {
      if (!isMessageRole(message.role) || typeof message.content !== 'string') continue
      this.addMessage(thread.id, { role: message.role, content: message.content })
    }
    return this.requireThread(thread.id)
  }

  listThreads(): AgentThread[] {
    return this.store.listThreads()
  }

  listThreadSummaries(): AgentThreadSummary[] {
    return this.store.listThreadSummaries()
  }

  getThread(id: string): AgentThread | undefined {
    return this.store.getThread(id)
  }

  updateThread(id: string, input: UpdateThreadInput): AgentThread {
    const thread = this.requireThread(id)
    if (typeof input.title === 'string') {
      const title = input.title.trim()
      if (title) thread.title = title
      else delete thread.title
    }
    if (typeof input.archived === 'boolean') thread.archived = input.archived
    if (isRecord(input.metadata)) {
      thread.metadata = { ...(thread.metadata ?? {}), ...(input.metadata as Record<string, JSONValue>) }
    }
    thread.updatedAt = isoNow()
    this.store.updateThread(thread)
    return thread
  }

  addMessage(threadId: string, input: CreateMessageInput): AgentMessage {
    const thread = this.requireThread(threadId)
    const role = isMessageRole(input.role) ? input.role : 'user'
    const clientInput = normalizeClientInput(input.clientInput)
    const content = role === 'user' && clientInput
      ? buildRuntimeUserMessage(clientInput)
      : typeof input.content === 'string' ? input.content.trim() : ''
    if (!content) throw new Error('message content is required')
    const message = this.createMessage(threadId, role, content)
    thread.messages.push(message)
    if (clientInput) {
      thread.metadata = { ...(thread.metadata ?? {}), lastClientInput: clientInput as unknown as JSONValue }
    }
    thread.updatedAt = message.createdAt
    this.store.updateThread(thread)
    return message
  }

  createRun(input: CreateRunInput): AgentRun {
    if (typeof input.threadId !== 'string' || !input.threadId) throw new Error('threadId is required')
    const thread = this.requireThread(input.threadId)
    const clientInput = normalizeClientInput(input.clientInput)
    if (clientInput) {
      thread.metadata = { ...(thread.metadata ?? {}), lastClientInput: clientInput as unknown as JSONValue }
      this.store.updateThread(thread)
    }
    const now = isoNow()
    const catalogSnapshot = this.catalogSnapshot
    const hasExplicitAgentManifest = input.agentManifest !== undefined
    const agentManifest = this.resolveAgentManifest(input.agentManifest, clientInput, catalogSnapshot)
    const runtimeContract = this.contractResolver.find(agentManifest)
    const approvedToolNames = normalizeApprovedToolNames(input.approvedToolNames)
    const policy = defaultRunPolicy({ sandboxMode: input.sandboxMode === true, policy: input.policy })
    const initialUser = [...thread.messages].reverse().find((message) => message.role === 'user')
    const run = buildAgentRun({
      id: makeId('run'),
      threadId: input.threadId,
      agentManifest,
      policy,
      now,
      runtimeContract,
      ...(approvedToolNames.length > 0 ? { approvedToolNames } : {}),
      ...(clientInput ? { clientInput: clientInput as unknown as JSONValue } : {}),
      ...(initialUser ? { initialUserMessageId: initialUser.id } : {}),
      ...normalizeRunHierarchyInput(input, { defaultRole: 'planner' }),
    })
    this.runCatalogSnapshots.set(run.id, catalogSnapshot)
    run.metadata = {
      ...(run.metadata ?? {}),
      ...(isJSONRecord(input.metadata) ? input.metadata : {}),
      ...(!hasExplicitAgentManifest ? { manifestSource: 'default' } : {}),
      catalogSnapshot: {
        id: catalogSnapshot.id,
        version: catalogSnapshot.catalogVersion,
      },
    }
    this.store.createRun(run)
    this.applyThreadRunProjection(thread, run)
    thread.updatedAt = now
    this.store.updateThread(thread)
    this.rememberRunAuth(run.id, input)
    this.startRunExecution(run.id)
    return run
  }

  createToolRun(input: CreateToolRunInput): AgentRun {
    const toolCall = normalizeToolCall(input.toolCall)
    if (!toolCall) throw new Error('toolCall is required')
    const thread = typeof input.threadId === 'string' && input.threadId
      ? this.requireThread(input.threadId)
      : this.createThread({
        title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : `Tool run: ${toolCall.name}`,
      })
    const clientInput = normalizeClientInput(input.clientInput)
    const message = clientInput
      ? buildRuntimeUserMessage(clientInput)
      : typeof input.message === 'string' && input.message.trim()
        ? input.message.trim()
        : `Run tool ${toolCall.name}`
    const userMessage = this.createMessage(thread.id, 'user', message)
    thread.messages.push(userMessage)
    if (clientInput) {
      thread.metadata = { ...(thread.metadata ?? {}), lastClientInput: clientInput as unknown as JSONValue }
    }
    thread.updatedAt = userMessage.createdAt
    this.store.updateThread(thread)
    const now = isoNow()
    const approvedToolNames = normalizeApprovedToolNames(input.approvedToolNames)
    const catalogSnapshot = this.catalogSnapshot
    const hasExplicitAgentManifest = input.agentManifest !== undefined
    const agentManifest = this.resolveAgentManifest(input.agentManifest, clientInput, catalogSnapshot)
    const runtimeContract = this.contractResolver.find(agentManifest)
    const policy = defaultRunPolicy({ sandboxMode: input.sandboxMode === true, policy: input.policy })
    const run = buildAgentRun({
      id: makeId('run'),
      threadId: thread.id,
      agentManifest,
      policy,
      now,
      forcedToolCall: toolCall,
      initialUserMessageId: userMessage.id,
      runtimeContract,
      ...(approvedToolNames.length > 0 ? { approvedToolNames } : {}),
      ...(clientInput ? { clientInput: clientInput as unknown as JSONValue } : {}),
      ...normalizeRunHierarchyInput(input, { defaultRole: 'worker' }),
    })
    this.runCatalogSnapshots.set(run.id, catalogSnapshot)
    run.metadata = {
      ...(run.metadata ?? {}),
      ...(!hasExplicitAgentManifest ? { manifestSource: 'default' } : {}),
      catalogSnapshot: {
        id: catalogSnapshot.id,
        version: catalogSnapshot.catalogVersion,
      },
    }
    this.store.createRun(run)
    this.applyThreadRunProjection(thread, run)
    thread.updatedAt = now
    this.store.updateThread(thread)
    this.rememberRunAuth(run.id, input)
    this.startRunExecution(run.id)
    return run
  }

  async previewRun(input: PreviewRunInput): Promise<AgentRunPreview> {
    const thread = typeof input.threadId === 'string' && input.threadId
      ? this.requireThread(input.threadId)
      : undefined
    const clientInput = normalizeClientInput(input.clientInput)
    const explicitMessage = clientInput
      ? buildRuntimeUserMessage(clientInput)
      : typeof input.message === 'string' && input.message.trim().length > 0
        ? input.message.trim()
        : undefined
    const lastUser = thread
      ? [...thread.messages].reverse().find((message) => message.role === 'user')
      : undefined
    const message = explicitMessage ?? lastUser?.content
    if (!message) throw new Error('preview requires a message or a thread with a user message')
    const command = parseAgentCommand(message)

    const now = isoNow()
    const catalogSnapshot = this.catalogSnapshot
    const hasExplicitAgentManifest = input.agentManifest !== undefined
    const agentManifest = this.resolveAgentManifest(input.agentManifest, clientInput, catalogSnapshot)
    await this.mcpClient.initialize()
    const contextResult = await this.mcpClient.callTool('movscript_get_focus', {})
    const context = extractAgentContext(contextResult)
    const relevantMemories = this.memoryManager.loadRelevantMemories({
      ...(typeof context.currentProjectId === 'number' ? { projectId: context.currentProjectId } : {}),
      query: message,
    })
    const memories = buildPromptMemoryIndex(relevantMemories)
    const debugContext = buildDebugContext(contextResult, memories, clientInput)
    const layers = hasExplicitAgentManifest
      ? undefined
      : resolveRuntimeLayers({
        registry: catalogSnapshot.layeredRegistry,
        baseManifest: agentManifest,
        message,
        debugContext,
        ...(clientInput ? { clientInput } : {}),
        history: thread?.messages ?? [],
      })
    const activeManifest = layers?.manifest ?? agentManifest
    const skills = layers?.skills ?? []
    const capabilities = await resolveAgentCapabilities({
      mcpClient: this.mcpClient,
      manifest: activeManifest,
      currentProjectId: context.currentProjectId,
      registry: catalogSnapshot.toolRegistry,
      pluginCatalog: catalogSnapshot.pluginCatalogInfo,
      warnings: [...catalogSnapshot.pluginWarnings, ...(layers?.warnings ?? [])],
      updates: this.updateState,
      ...(layers ? { activeSkills: skills } : {}),
      userMessage: message,
      runRole: 'planner',
    })
    const policy = defaultRunPolicy({ sandboxMode: input.sandboxMode !== false, policy: input.policy })
    const promptPreview = buildPromptPreview({
      manifest: activeManifest,
      skills,
      context: debugContext,
      tools: capabilities.resolvedTools,
      policy,
      memories,
      warnings: [...capabilities.warnings],
      history: thread?.messages ?? [],
      userMessage: message,
      command,
      contractResolver: this.contractResolver,
    })
    const warnings: string[] = [...capabilities.warnings]

    let previewToolPlan = { toolCalls: [] as ToolCall[], pendingApprovals: [] as AgentApprovalRequest[] }
    try {
      previewToolPlan = await planPreviewToolRequests({
        manifest: activeManifest,
        skills,
        context: debugContext,
        tools: capabilities.resolvedTools,
        policy,
        memories,
        warnings,
        history: thread?.messages ?? [],
        userMessage: message,
        command,
        currentProjectId: context.currentProjectId,
        registry: catalogSnapshot.toolRegistry,
        draftStore: this.draftStore,
        contractResolver: this.contractResolver,
        makeApprovalId: () => makeId('approval'),
        now: isoNow,
      })
    } catch {
      // model call failed — preview still works without tool predictions
    }

    return {
      id: makeId('preview'),
      ...(thread ? { threadId: thread.id } : {}),
      message,
      status: 'preview',
      agentManifest: activeManifest,
      ...(typeof context.currentProjectId === 'number' ? { currentProjectId: context.currentProjectId } : {}),
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

  listRuns(): AgentRun[] {
    return this.store.listRuns().map(toProductRun)
  }

  listRunsByParent(parentRunId: string): AgentRun[] {
    return this.store.listRuns({ parentRunId }).map(toProductRun)
  }

  getRun(id: string): AgentRun | undefined {
    const run = this.store.getRun(id)
    return run ? toProductRun(run) : undefined
  }

  getChildRuns(parentRunId: string): AgentRun[] {
    this.requireRun(parentRunId)
    return this.store.listChildRuns(parentRunId).map(toProductRun)
  }

  async createPlan(input: CreatePlanInput): Promise<AgentPlanSnapshot> {
    const threadId = typeof input.threadId === 'string' && input.threadId.trim() ? input.threadId.trim() : undefined
    if (!threadId) throw new Error('threadId is required')
    const thread = this.requireThread(threadId)
    const existingPlan = this.findThreadPlan(thread.id)
    if (existingPlan) throw new Error(`thread ${thread.id} already has plan ${existingPlan.id}`)
    const now = isoNow()
    let tasksInput = normalizePlanTaskInputs(input.tasks)
    const planGoal = normalizeNonEmptyString(input.goal) ?? normalizeNonEmptyString(input.message)
    const plannerWarnings: string[] = []
    let plannerSource: string | undefined
    if (tasksInput.length === 0 && planGoal) {
      const generated = await generatePlanTasks({
        goal: planGoal,
        title: normalizeNonEmptyString(input.title),
        maxTasks: normalizePositiveInteger(input.maxTasks),
        auth: {
          ...normalizeBackendAuthToken(input.backendAuthToken),
          ...normalizeBackendAPIBaseURL(input.backendAPIBaseURL),
        },
      })
      tasksInput = generated.tasks
      plannerSource = generated.source
      plannerWarnings.push(...generated.warnings)
    }
    const plan: AgentPlan = {
      id: makeId('plan'),
      threadId: thread.id,
      title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : thread.title ?? 'Agent plan',
      status: tasksInput.length > 0 ? 'pending' : 'blocked',
      progress: 0,
      metadata: {
        ...(isJSONRecord(input.metadata) ? input.metadata : {}),
        ...(planGoal ? { goal: planGoal } : {}),
        ...(plannerSource ? { plannerSource } : {}),
        ...(plannerWarnings.length > 0 ? { plannerWarnings } : {}),
      },
      createdAt: now,
      updatedAt: now,
    }
    const createdTasks: AgentTask[] = []
    const tasksToCreate = tasksInput.map((taskInput) => buildAgentTask(plan.id, taskInput, now))
    this.assertTaskGraphReferencesForCreate(plan.id, tasksToCreate)
    this.assertTaskParentHierarchyAcyclic(plan.id, new Map(tasksToCreate.map((task) => [task.id, task.parentId])))
    this.assertTaskGraphAcyclic(plan.id, new Map(tasksToCreate.map((task) => [task.id, task.deps])))
    this.store.createPlan(plan)
    for (const task of tasksToCreate) {
      this.store.createTask(task)
      this.recordTaskProtocolEvents(task)
      createdTasks.push(task)
    }

    let rootRun: AgentRun | undefined
    const inlinePlannerTask = selectPlannerInlineTask(createdTasks)
    if (input.createPlannerRun !== false) {
      rootRun = this.createRun({
        ...input,
        threadId: thread.id,
        role: 'planner',
        planId: plan.id,
        ...(inlinePlannerTask ? { taskId: inlinePlannerTask.id } : {}),
        progress: 0,
      })
      plan.rootRunId = rootRun.id
      plan.status = 'running'
      plan.updatedAt = isoNow()
      this.store.updatePlan(plan)
      if (inlinePlannerTask) {
        this.assignTaskToPlannerRun(inlinePlannerTask.id, rootRun.id)
      }
    }

    return this.getPlanSnapshot(plan.id)
  }

  listPlans(): AgentPlan[] {
    return this.store.listPlans()
  }

  getPlan(id: string): AgentPlan | undefined {
    return this.store.getPlan(id)
  }

  getPlanSnapshot(planId: string): AgentPlanSnapshot {
    const plan = this.store.getPlan(planId)
    if (!plan) throw new Error(`plan not found: ${planId}`)
    const tasks = this.store.listTasks(planId)
    const nameConflicts = subagentNameConflicts(tasks)
    const runs = this.store.listRuns({ planId }).map(toProductRun)
    const artifacts = taskArtifactReferences(tasks)
    return {
      plan,
      tasks,
      runs,
      ...(nameConflicts.length > 0 ? { nameConflicts } : {}),
      summary: agentPlanSummary(tasks, runs, artifacts, nameConflicts),
    }
  }

  getTaskTree(planId: string): AgentTask[] {
    this.requirePlan(planId)
    return this.store.listTasks(planId)
  }

  updateTask(taskId: string, input: UpdatePlanTaskInput): AgentTask {
    const task = this.requireTask(taskId)
    const previousTask = { ...task, deps: [...task.deps], artifacts: [...task.artifacts] }
    const now = isoNow()
    const nextStatus = normalizeTaskStatus(input.status)
    if (nextStatus) {
      task.status = nextStatus
      if (nextStatus === 'running' && !task.startedAt) task.startedAt = now
      if (nextStatus === 'done') task.completedAt = now
      if (nextStatus === 'failed') task.failedAt = now
      if (nextStatus === 'cancelled') task.cancelledAt = now
    }
    const parentId = normalizeNonEmptyString(input.parentId)
    if (parentId) {
      this.assertTaskReferenceInPlan(task.planId, parentId, 'parent task')
      if (parentId === task.id) throw new Error(`task ${task.id} cannot use itself as parent`)
      this.assertTaskParentHierarchyAcyclic(task.planId, new Map([[task.id, parentId]]))
      task.parentId = parentId
    } else if ('parentId' in input) {
      this.assertTaskParentHierarchyAcyclic(task.planId, new Map([[task.id, undefined]]))
      delete task.parentId
    }
    if (Array.isArray(input.deps)) {
      const deps = normalizeStringList(input.deps)
      for (const depId of deps) {
        this.assertTaskReferenceInPlan(task.planId, depId, 'dependency task')
        if (depId === task.id) throw new Error(`task ${task.id} cannot depend on itself`)
      }
      this.assertTaskGraphAcyclic(task.planId, new Map([[task.id, deps]]))
      task.deps = deps
    }
    const title = normalizeNonEmptyString(input.title)
    if (title) task.title = title
    if (typeof input.description === 'string') {
      const description = input.description.trim()
      if (description) task.description = description
      else delete task.description
    }
    const progress = normalizeProgress(input.progress)
    if (progress !== undefined) task.progress = progress
    const ownerRunId = typeof input.ownerRunId === 'string' && input.ownerRunId.trim() ? input.ownerRunId.trim() : undefined
    if (ownerRunId) {
      const ownerRun = this.requireRun(ownerRunId)
      if (ownerRun.planId !== task.planId) throw new Error(`owner run ${ownerRunId} does not belong to plan ${task.planId}`)
      if (ownerRun.taskId && ownerRun.taskId !== task.id) throw new Error(`owner run ${ownerRunId} is attached to task ${ownerRun.taskId}, not task ${task.id}`)
      task.ownerRunId = ownerRunId
    }
    if (typeof input.blockedReason === 'string') {
      const blockedReason = input.blockedReason.trim()
      if (blockedReason) task.blockedReason = blockedReason
      else delete task.blockedReason
    }
    const artifacts = normalizeTaskArtifacts(input.artifacts, now)
    if (artifacts.length > 0) task.artifacts = [...task.artifacts, ...artifacts]
    if (isJSONRecord(input.metadata)) {
      const nextSubagentName = normalizeNonEmptyString(input.metadata.subagentName)
      if (nextSubagentName) this.assertUniqueSubagentNameForTask(task.planId, task.id, nextSubagentName, new Map([[task.id, nextSubagentName]]))
      task.metadata = { ...(task.metadata ?? {}), ...input.metadata }
    }
    task.updatedAt = now
    this.store.updateTask(task)
    this.recomputePlanStatus(task.planId)
    this.recordTaskProtocolEvents(task, previousTask)
    this.emitPlanTaskEvent(task.planId, task)
    return task
  }

  private assertTaskReferenceInPlan(planId: string, taskId: string, label: string): void {
    const referencedTask = this.requireTask(taskId)
    if (referencedTask.planId !== planId) throw new Error(`${label} ${taskId} does not belong to plan ${planId}`)
  }

  private assertTaskReferenceInTaskMap(planId: string, tasksById: Map<string, AgentTask>, taskId: string, label: string): void {
    if (tasksById.has(taskId)) return
    const referencedTask = this.store.getTask(taskId)
    if (referencedTask && referencedTask.planId !== planId) throw new Error(`${label} ${taskId} does not belong to plan ${planId}`)
    throw new Error(`task not found: ${taskId}`)
  }

  private assignTaskToPlannerRun(taskId: string, runId: string): void {
    const task = this.requireTask(taskId)
    const run = this.requireRun(runId)
    if (run.role !== 'planner') throw new Error(`run ${runId} is not a planner run`)
    const previousTask = { ...task, deps: [...task.deps], artifacts: [...task.artifacts] }
    const now = isoNow()
    task.status = 'running'
    task.progress = 0
    task.ownerRunId = run.id
    task.startedAt = now
    task.updatedAt = now
    task.metadata = {
      ...(task.metadata ?? {}),
      executionMode: 'planner_inline',
    }
    delete task.blockedReason
    this.store.updateTask(task)
    this.recordTaskProtocolEvents(task, previousTask)
    this.emitPlanTaskEvent(task.planId, task)
  }

  cancelSubtree(runId: string, input: CancelRunInput = {}): { cancelledRunIds: string[] } {
    this.requireRun(runId)
    const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : 'Run subtree was cancelled.'
    const runIds = this.collectSubtreeRunIds(runId)
    const cancelledRunIds: string[] = []
    for (const id of runIds.reverse()) {
      const run = this.store.getRun(id)
      if (!run || isFinishedOrCancelledRunStatus(run.status)) continue
      this.cancelRun(id, { reason })
      cancelledRunIds.push(id)
    }
    return { cancelledRunIds }
  }

  cancelPlanTree(runId: string, input: CancelRunInput = {}): { cancelledRunIds: string[] } {
    const run = this.requirePlannerRun(runId)
    if (!run.planId) throw new Error(`planner run ${runId} is not attached to a plan`)
    const plan = this.requirePlan(run.planId)
    if (plan.rootRunId && plan.rootRunId !== run.id) {
      throw new Error(`planner run ${run.id} is not the root planner for plan ${plan.id}`)
    }
    return this.cancelSubtree(run.id, input)
  }

  dispatchPlan(input: DispatchPlanInput): DispatchPlanResult {
    const planId = typeof input.planId === 'string' && input.planId.trim() ? input.planId.trim() : undefined
    if (!planId) throw new Error('planId is required')
    const plan = this.requirePlan(planId)
    const plannerRunId = typeof input.plannerRunId === 'string' && input.plannerRunId.trim()
      ? input.plannerRunId.trim()
      : plan.rootRunId
    if (!plannerRunId) throw new Error(`plan ${planId} has no plannerRunId`)
    const plannerRun = this.requirePlannerRun(plannerRunId)
    if (plannerRun.planId && plannerRun.planId !== plan.id) throw new Error(`planner run ${plannerRun.id} does not belong to plan ${plan.id}`)
    const maxTaskAttempts = normalizePositiveInteger(input.maxTaskAttempts) ?? 1
    const workerTimeoutMs = normalizePositiveInteger(input.workerTimeoutMs)
    const timedOutRunIds = this.cancelTimedOutPlanWorkers(plan.id, workerTimeoutMs)
    const retriedTaskIds = input.retryFailed === true ? this.resetRetryablePlanTasks(plan.id, maxTaskAttempts) : []
    const requestedTaskIds = uniqueStrings(normalizeStringList(input.taskIds))
    for (const taskId of requestedTaskIds) {
      const task = this.requireTask(taskId)
      if (task.planId !== plan.id) throw new Error(`task ${taskId} does not belong to plan ${plan.id}`)
    }
    const tasks = this.store.listTasks(plan.id)
    const runs = this.store.listRuns({ planId: plan.id })
    const decision = planSupervisorDispatch({
      plan,
      tasks,
      runs,
      maxWorkers: normalizePositiveInteger(input.maxWorkers),
      ...(requestedTaskIds.length > 0 ? { taskIds: requestedTaskIds } : {}),
    })
    const now = isoNow()
    for (const blocked of decision.blockedTasks) {
      const current = this.store.getTask(blocked.task.id)
      if (!current || current.blockedReason === blocked.blockedReason) continue
      current.blockedReason = blocked.blockedReason
      current.updatedAt = now
      this.store.updateTask(current)
      this.emitPlanTaskEvent(plan.id, current)
    }

    const spawnedRuns: AgentRun[] = []
    const usedSubagentNames = this.collectSubagentNames(plan.id)
    for (const task of decision.runnableTasks) {
      const existingSubagentName = subagentNameFromTask(task)
      const subagentName = existingSubagentName ?? nextSubagentName(usedSubagentNames)
      usedSubagentNames.add(subagentName)
      const workerTask = existingSubagentName === subagentName
        ? task
        : this.updateTask(task.id, {
          metadata: {
            ...(task.metadata ?? {}),
            subagentName,
          },
        })
      const workerMessage = this.createMessage(plan.threadId, 'user', formatWorkerTaskMessage(plan, workerTask), undefined)
      const thread = this.requireThread(plan.threadId)
      thread.messages.push(workerMessage)
      thread.updatedAt = workerMessage.createdAt
      this.store.updateThread(thread)

      const run = this.createRun({
        threadId: plan.threadId,
        role: 'worker',
        parentRunId: plannerRun.id,
        planId: plan.id,
        taskId: task.id,
        progress: 0,
        metadata: { subagentName },
        agentManifest: input.agentManifest ?? plannerRun.agentManifest,
        approvedToolNames: input.approvedToolNames,
        policy: input.policy ?? plannerRun.policy,
        backendAuthToken: input.backendAuthToken,
        backendAPIBaseURL: input.backendAPIBaseURL,
        sandboxMode: input.sandboxMode,
      })
      const dispatchedRun = run
      const currentTask = this.requireTask(task.id)
      const previousTask = { ...currentTask, deps: [...currentTask.deps], artifacts: [...currentTask.artifacts] }
      currentTask.status = 'running'
      currentTask.progress = 0
      currentTask.ownerRunId = run.id
      currentTask.startedAt = now
      currentTask.updatedAt = now
      delete currentTask.blockedReason
      this.store.updateTask(currentTask)
      this.recordTaskProtocolEvents(currentTask, previousTask)
      this.emitPlanTaskEvent(plan.id, currentTask)
      spawnedRuns.push(dispatchedRun)
    }
    this.recomputePlanStatus(plan.id)
    return {
      plan: this.requirePlan(plan.id),
      spawnedRuns,
      blockedTaskIds: decision.blockedTasks.map((item) => item.task.id),
      retriedTaskIds,
      timedOutRunIds,
    }
  }

  replanRun(runId: string, input: ReplanRunInput = {}): ReplanRunResult {
    const run = this.requireRun(runId)
    if (!run.planId) throw new Error(`run ${runId} is not attached to a plan`)
    const plan = this.requirePlan(run.planId)
    const plannerRunId = normalizeNonEmptyString(input.plannerRunId)
      ?? (run.role === 'planner' ? run.id : run.parentRunId)
      ?? plan.rootRunId
    if (!plannerRunId) throw new Error(`plan ${plan.id} has no plannerRunId`)
    const plannerRun = this.requirePlannerRun(plannerRunId)
    if (plannerRun.planId && plannerRun.planId !== plan.id) throw new Error(`planner run ${plannerRun.id} does not belong to plan ${plan.id}`)

    const now = isoNow()
    const taskInputs = this.normalizeReplanTaskInputsForPlan(plan.id, input.tasks, input.addTasks)
    const tasksToCreate = this.buildReplanTasksToCreate(plan.id, taskInputs.creates, now)
    const updatesToApply = this.normalizeAndValidateReplanTaskUpdates(plan.id, [
      ...taskInputs.updates,
      ...normalizePlanTaskUpdateInputs(input.updates),
      ...normalizePlanTaskUpdateInputs(input.updateTasks),
    ], tasksToCreate)
    const createdTaskIds: string[] = []
    for (const task of tasksToCreate) {
      this.store.createTask(task)
      this.recordTaskProtocolEvents(task)
      this.emitPlanTaskEvent(plan.id, task)
      createdTaskIds.push(task.id)
    }

    const updatedTaskIds: string[] = []
    for (const { taskId, update } of updatesToApply) {
      this.updateTask(taskId, update)
      updatedTaskIds.push(taskId)
    }

    const resetTaskIds = this.resetPlanTasksForReplan(plan.id, input)
    this.recomputePlanStatus(plan.id)
    const shouldDispatch = input.dispatch !== false
    const dispatch = shouldDispatch
      ? this.dispatchPlan({
        ...input,
        planId: plan.id,
        plannerRunId,
      })
      : undefined
    return {
      plan: this.requirePlan(plan.id),
      createdTaskIds,
      updatedTaskIds: uniqueStrings(updatedTaskIds),
      resetTaskIds,
      ...(dispatch ? { dispatch } : {}),
    }
  }

  getRunTraceEvents(runId: string, query: AgentTraceQuery = {}): AgentTraceEvent[] {
    this.requireRun(runId)
    return this.store.listRunTraceEvents(runId, query)
  }

  getRunTraceSummary(runId: string): {
    runId: string
    total: number
    byKind: Partial<Record<AgentTraceEventKind, number>>
    latestEvent?: AgentTraceEvent
  } {
    this.requireRun(runId)
    const events = this.store.listRunTraceEvents(runId, { limit: Number.MAX_SAFE_INTEGER })
    const byKind: Partial<Record<AgentTraceEventKind, number>> = {}
    for (const event of events) byKind[event.kind] = (byKind[event.kind] ?? 0) + 1
    const latestEvent = events.at(-1)
    return {
      runId,
      total: events.length,
      byKind,
      ...(latestEvent ? { latestEvent } : {}),
    }
  }

  subscribeRunStream(runId: string, listener: (event: AgentRunStreamEvent) => void): () => void {
    const run = this.requireRun(runId)
    let subscribers = this.runStreamSubscribers.get(runId)
    if (!subscribers) {
      subscribers = new Set()
      this.runStreamSubscribers.set(runId, subscribers)
    }
    subscribers.add(listener)
    this.replayRunStream(run, listener)
    return () => {
      const current = this.runStreamSubscribers.get(runId)
      if (!current) return
      current.delete(listener)
      if (current.size === 0) this.runStreamSubscribers.delete(runId)
    }
  }

  subscribePlanStream(planId: string, listener: (event: AgentPlanStreamEvent) => void): () => void {
    this.requirePlan(planId)
    let subscribers = this.planStreamSubscribers.get(planId)
    if (!subscribers) {
      subscribers = new Set()
      this.planStreamSubscribers.set(planId, subscribers)
    }
    subscribers.add(listener)
    this.replayPlanStream(planId, listener)
    return () => {
      const current = this.planStreamSubscribers.get(planId)
      if (!current) return
      current.delete(listener)
      if (current.size === 0) this.planStreamSubscribers.delete(planId)
    }
  }

  approveRun(runId: string, input: ApproveRunInput = {}): AgentRun {
    const run = this.requireRun(runId)
    if (run.status !== 'requires_action') throw new Error(`run ${runId} is not waiting for approval`)
    const now = isoNow()
    const selectedApprovalIds = new Set(normalizeStringArray(input.approvalIds))
    const selectedToolNames = new Set(normalizeStringArray(input.approvedToolNames))
    const approvals = run.pendingApprovals ?? []
    const approvingAll = selectedApprovalIds.size === 0 && selectedToolNames.size === 0
    const approvedToolNames = new Set(getApprovedToolNames(run))
    run.pendingApprovals = approvals.map((approval) => {
      const approve = approvingAll || selectedApprovalIds.has(approval.id) || selectedToolNames.has(approval.toolName)
      if (!approve) return approval
      approvedToolNames.add(approval.toolName)
      return { ...approval, status: 'approved', approvedAt: now, updatedAt: now }
    })
    run.metadata = { ...(run.metadata ?? {}), approvedToolNames: Array.from(approvedToolNames) }
    run.status = 'queued'
    run.updatedAt = now
    this.recordTraceEvent(run, {
      kind: 'approval',
      title: 'Approval granted',
      summary: approvingAll ? 'Approved all pending tool calls.' : `Approved ${selectedApprovalIds.size + selectedToolNames.size} pending action(s).`,
      status: 'completed',
      data: {
        eventType: 'approval.resolved',
        outcome: 'approved',
        approvalIds: Array.from(selectedApprovalIds),
        toolNames: Array.from(selectedToolNames),
        approvedToolNames: Array.from(approvedToolNames),
      },
    })
    this.store.updateRun(run)
    this.updateThreadRunStatus(run.threadId, run.status, run.id)
    this.emitRunSnapshot(run)
    this.rememberRunAuth(run.id, input)
    this.startRunExecution(run.id)
    return run
  }

  rejectRun(runId: string, input: RejectRunInput = {}): AgentRun {
    const run = this.requireRun(runId)
    if (run.status !== 'requires_action') throw new Error(`run ${runId} is not waiting for approval`)
    const now = isoNow()
    const selectedApprovalIds = new Set(normalizeStringArray(input.approvalIds))
    const rejectingAll = selectedApprovalIds.size === 0
    const rejectedToolNames: string[] = []
    run.pendingApprovals = (run.pendingApprovals ?? []).map((approval) => {
      const reject = approval.status === 'pending' && (rejectingAll || selectedApprovalIds.has(approval.id))
      if (!reject) return approval
      rejectedToolNames.push(approval.toolName)
      return { ...approval, status: 'rejected', rejectedAt: now, updatedAt: now }
    })
    const warning = `用户拒绝执行工具：${rejectedToolNames.join(', ') || 'unknown'}`
    run.warnings = Array.from(new Set([...(run.warnings ?? []), warning]))
    this.recordTraceEvent(run, {
      kind: 'approval',
      title: 'Approval rejected',
      summary: warning,
      status: 'blocked',
      data: {
        eventType: 'approval.resolved',
        outcome: 'denied',
        rejectedToolNames,
      },
    })
    run.status = 'completed_with_warnings'
    run.completedAt = now
    run.updatedAt = now
    const thread = this.requireThread(run.threadId)
    const assistant = this.createMessage(thread.id, 'assistant', `已取消需要确认的工具调用。\n\n${warning}`, run.id)
    thread.messages.push(assistant)
    thread.updatedAt = assistant.createdAt
    this.applyThreadRunProjection(thread, run)
    run.assistantMessageId = assistant.id
    const step = this.createStep(run, 'message')
    step.status = 'completed'
    step.result = { messageId: assistant.id, rejectedToolNames }
    step.completedAt = now
    this.store.updateThread(thread)
    this.store.updateRun(run)
    this.emitRunSnapshot(run, { done: true })
    return run
  }

  cancelRun(runId: string, input: CancelRunInput = {}): AgentRun {
    const run = this.requireRun(runId)
    if (run.status === 'cancelled') return run
    if (isFinishedRunStatus(run.status)) return run
    const controller = this.runControllers.get(runId)
    controller?.abort(createAbortError(typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : 'Run was cancelled.'))
    return this.markRunCancelled(run, typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : undefined)
  }

  answerRunInputRequest(runId: string, input: AnswerRunInputRequestInput = {}): AgentRun {
    const run = this.requireRun(runId)
    if (run.status !== 'requires_action') throw new Error(`run ${runId} is not waiting for user input`)
    const pendingInputs = (run.pendingInputRequests ?? []).filter((request) => request.status === 'pending')
    if (pendingInputs.length === 0) throw new Error(`run ${runId} has no pending user input request`)
    const requestId = typeof input.requestId === 'string' && input.requestId.trim() ? input.requestId.trim() : undefined
    const request = requestId
      ? pendingInputs.find((item) => item.id === requestId)
      : pendingInputs[0]
    if (!request) throw new Error(`input request not found: ${requestId}`)

    const choiceIds = normalizeStringArray(input.choiceIds).filter((choiceId) => request.choices.some((choice) => choice.id === choiceId))
    const text = typeof input.text === 'string' && input.text.trim() ? input.text.trim() : undefined
    if (choiceIds.length === 0 && !text) throw new Error('input answer requires choiceIds or text')

    const now = isoNow()
    run.pendingInputRequests = (run.pendingInputRequests ?? []).map((item) => {
      if (item.id !== request.id) return item
      return {
        ...item,
        status: 'answered',
        answer: {
          ...(choiceIds.length > 0 ? { choiceIds } : {}),
          ...(text ? { text } : {}),
        },
        answeredAt: now,
        updatedAt: now,
      }
    })
    run.status = 'queued'
    run.updatedAt = now
    this.recordTraceEvent(run, {
      kind: 'input',
      title: 'User input received',
      summary: request.title,
      status: 'completed',
      data: {
        requestId: request.id,
        choiceIds,
        ...(text ? { text } : {}),
      },
    })

    const thread = this.requireThread(run.threadId)
    const answerMessage = this.createMessage(thread.id, 'user', formatInputAnswerMessage(request, choiceIds, text))
    thread.messages.push(answerMessage)
    thread.updatedAt = answerMessage.createdAt
    this.applyThreadRunProjection(thread, run)
    this.store.updateThread(thread)
    this.store.updateRun(run)
    this.emitRunSnapshot(run)
    this.rememberRunAuth(run.id, input)
    this.startRunExecution(run.id)
    return run
  }

  listMemories(query: MemoryQuery): AgentMemory[] {
    return this.memoryStore.listMemories(query)
  }

  listMemorySummaries(query: Parameters<MemoryManager['listMemorySummaries']>[0]): ReturnType<MemoryManager['listMemorySummaries']> {
    return this.memoryManager.listMemorySummaries(query)
  }

  getMemory(projectId: number, id: string): AgentMemory | undefined {
    return this.memoryManager.getMemory({ projectId, id })
  }

  listDrafts(query: {
    projectId?: unknown
    kind?: unknown
    status?: unknown
    threadId?: unknown
    runId?: unknown
    sourceEntityType?: unknown
    sourceEntityId?: unknown
    pageKey?: unknown
    pageType?: unknown
    pageRoute?: unknown
    pageEntityType?: unknown
    pageEntityId?: unknown
    limit?: unknown
  } = {}): AgentDraft[] {
    return this.draftStore.listDrafts(normalizeDraftQuery(query))
  }

  createLocalDraft(input: {
    projectId?: unknown
    kind?: unknown
    title?: unknown
    content?: unknown
    source?: unknown
    target?: unknown
    metadata?: unknown
  }): AgentDraft {
    return this.draftStore.createDraft({
      projectId: typeof input.projectId === 'number' && Number.isFinite(input.projectId) ? input.projectId : undefined,
      kind: input.kind,
      title: input.title,
      content: input.content,
      source: normalizeDraftSource(input.source),
      target: input.target,
      metadata: input.metadata,
    })
  }

  getDraft(id: string): AgentDraft | undefined {
    return this.draftStore.getDraft(id)
  }

  updateDraft(input: {
    draftId?: unknown
    status?: unknown
    title?: unknown
    content?: unknown
    target?: unknown
    metadata?: unknown
  }): AgentDraft {
    const draftId = typeof input.draftId === 'string' && input.draftId.trim() ? input.draftId.trim() : undefined
    if (!draftId) throw new Error('update draft requires draftId')
    const status = normalizeDraftStatus(input.status)
    return this.draftStore.updateDraft(draftId, {
      ...(status ? { status } : {}),
      ...(typeof input.title === 'string' ? { title: input.title } : {}),
      ...(typeof input.content === 'string' ? { content: input.content } : {}),
      ...(isJSONRecord(input.target) ? { target: input.target } : {}),
      ...(isJSONRecord(input.metadata) ? { metadata: input.metadata } : {}),
    })
  }

  patchDraft(input: {
    draftId?: unknown
    ops?: unknown
    expectedUpdatedAt?: unknown
    metadata?: unknown
  }): JSONValue {
    const draftId = typeof input.draftId === 'string' && input.draftId.trim() ? input.draftId.trim() : undefined
    if (!draftId) throw new Error('patch draft requires draftId')
    const result = this.draftStore.patchDraft(draftId, {
      ops: input.ops,
      expectedUpdatedAt: input.expectedUpdatedAt,
      metadata: input.metadata,
    })
    return {
      status: 'patched',
      ...result,
      validation: validateDraft(result.draft),
    } as unknown as JSONValue
  }

  validateDraft(input: { draftId?: unknown }): JSONValue {
    const draftId = typeof input.draftId === 'string' && input.draftId.trim() ? input.draftId.trim() : undefined
    if (!draftId) throw new Error('validate draft requires draftId')
    const draft = this.draftStore.getDraft(draftId)
    if (!draft) throw new Error(`draft not found: ${draftId}`)
    return validateDraft(draft) as unknown as JSONValue
  }

  previewApplyDraft(input: {
    draftId?: unknown
    target?: unknown
    targetEntityType?: unknown
    targetEntityId?: unknown
    targetField?: unknown
    currentValue?: unknown
    proposedValue?: unknown
  }): JSONValue {
    return buildApplyDraftPreview(this.draftStore, input) as unknown as JSONValue
  }

  async simulateApplyDraft(input: {
    draftId?: unknown
    target?: unknown
    targetEntityType?: unknown
    targetEntityId?: unknown
    targetField?: unknown
    currentValue?: unknown
    proposedValue?: unknown
    backendAuthToken?: unknown
    backendAPIBaseURL?: unknown
  }): Promise<JSONValue> {
    const preview = buildApplyDraftPreview(this.draftStore, input)
    const validation = validateDraft(preview.draft)
    if (!validation.ok) {
      return {
        ok: false,
        stage: 'local_validation',
        draftId: preview.draft.id,
        validation,
        message: 'Draft failed local validation. Patch the draft and validate again before simulating backend apply.',
      } as unknown as JSONValue
    }
    if (preview.draft.kind === 'asset_proposal') {
      return {
        ok: true,
        stage: 'local_validation',
        draftId: preview.draft.id,
        validation,
        message: 'Asset proposal draft is locally valid. It is a planning artifact; backend apply is intentionally not performed.',
      } as unknown as JSONValue
    }
    try {
      const backendApply = await this.backendApplyClient.previewApplyReview(preview.review, {
        ...(typeof input.backendAuthToken === 'string' ? { backendAuthToken: input.backendAuthToken } : {}),
        ...(typeof input.backendAPIBaseURL === 'string' ? { backendAPIBaseURL: input.backendAPIBaseURL } : {}),
      })
      return {
        ok: true,
        stage: 'backend_apply_preview',
        draftId: preview.draft.id,
        validation,
        backendApply,
      } as unknown as JSONValue
    } catch (error) {
      return {
        ok: false,
        stage: 'backend_apply_preview',
        draftId: preview.draft.id,
        validation,
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof BackendApplyHTTPError ? { backendError: error.detail as unknown as JSONValue } : {}),
        message: 'Backend apply preview failed. Use backendError.response or backendError.responseText to patch the draft, then simulate again.',
      } as unknown as JSONValue
    }
  }

  async applyDraftFromUI(input: ApplyDraftInput & { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }): Promise<JSONValue> {
    const preview = buildApplyDraftPreview(this.draftStore, input)
    const appliedByUserId = input.appliedByUserId
    let backendApply: BackendApplyResult
    try {
      backendApply = await this.backendApplyClient.applyReview(preview.review, {
        ...(typeof appliedByUserId === 'number' || typeof appliedByUserId === 'string' ? { userId: appliedByUserId } : {}),
        ...(typeof input.backendAuthToken === 'string' ? { backendAuthToken: input.backendAuthToken } : {}),
        ...(typeof input.backendAPIBaseURL === 'string' ? { backendAPIBaseURL: input.backendAPIBaseURL } : {}),
      })
    } catch (error) {
      this.draftStore.updateDraft(preview.draft.id, {
        metadata: {
          ...(isRecord(preview.draft.metadata) ? preview.draft.metadata : {}),
          backendWritePerformed: false,
          backendWriteError: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
    const finalDraft = markDraftApplied(this.draftStore, preview.draft, preview.review, input, {
      appliedBy: 'movscript-ui',
      backendWritePerformed: backendApply.performed,
      backendApply: backendApply as unknown as JSONValue,
    })
    return {
      status: 'applied',
      review: preview.review,
      draft: finalDraft,
      message: backendApply.performed
        ? 'Draft applied by UI and backend business item patch completed.'
        : 'Draft marked applied by UI. Backend business item patch was skipped.',
      backendApply,
    } as unknown as JSONValue
  }

  rejectDraft(input: { draftId?: unknown; reason?: unknown }): AgentDraft {
    return rejectDraft(this.draftStore, input.draftId, input.reason)
  }

  createMemory(input: Parameters<AgentMemoryStore['createMemory']>[0]): AgentMemory {
    return this.memoryManager.createMemory(input)
  }

  deleteMemory(projectId: number, id: string): boolean {
    return this.memoryManager.deleteMemory({ projectId, id })
  }

  async flushPostRunRecords(): Promise<void> {
    while (this.postRunRecordTasks.size > 0) {
      await Promise.allSettled([...this.postRunRecordTasks])
    }
  }

  private startRunExecution(runId: string): void {
    const controller = new AbortController()
    this.runControllers.set(runId, controller)
    void this.executeRun(runId, controller.signal).finally(() => {
      if (this.runControllers.get(runId) === controller) {
        this.runControllers.delete(runId)
      }
      this.runCatalogSnapshots.delete(runId)
      this.syncTaskFromRun(runId)
    })
  }

  private async executeRun(runId: string, signal?: AbortSignal): Promise<void> {
    const run = this.store.getRun(runId)
    if (!run) return
    if (run.status === 'cancelled') return
    this.throwIfRunCancelled(runId, signal)
    let catalogSnapshot = this.getRunCatalogSnapshot(runId)

    const runStartedAt = Date.now()
    run.status = 'in_progress'
    run.startedAt = isoNow()
    run.updatedAt = run.startedAt
    const setupRound = buildRunRound(0, 'Setup', 'setup')
    this.recordTraceEvent(run, {
      kind: 'run',
      title: 'Run started',
      summary: `Thread ${run.threadId} entered the agentic loop.`,
      status: 'started',
      round: setupRound,
      data: { policy: run.policy, manifestId: run.agentManifest?.id, sandboxMode: run.policy.sandboxMode === true },
    })
    if (run.planId && run.taskId) {
      this.recordTraceEvent(run, {
        kind: 'task',
        title: 'Task heartbeat',
        summary: 'Worker task execution heartbeat.',
        status: 'info',
        round: setupRound,
        data: {
          eventType: 'heartbeat',
          planId: run.planId,
          taskId: run.taskId,
          runId: run.id,
          runStatus: run.status,
        },
      })
    }
    this.store.updateRun(run)
    this.updateThreadRunStatus(run.threadId, run.status, run.id)
    this.emitRunSnapshot(run)

    try {
      this.throwIfRunCancelled(run.id, signal)
      const thread = this.requireThread(run.threadId)
      const initialUserMessageId = typeof run.metadata?.initialUserMessageId === 'string' ? run.metadata.initialUserMessageId : undefined
      const lastUser = initialUserMessageId
        ? thread.messages.find((m) => m.id === initialUserMessageId && m.role === 'user')
        : [...thread.messages].reverse().find((m) => m.role === 'user')
      if (!lastUser) throw new Error('run requires at least one user message')
      const command = parseAgentCommand(lastUser.content)
      const clientInput = normalizeClientInput(run.metadata?.clientInput ?? thread.metadata?.lastClientInput)

      this.recordTraceEvent(run, {
        kind: 'message',
        title: 'User message loaded',
        summary: lastUser.content.slice(0, 180),
        status: 'completed',
        round: setupRound,
        data: { messageId: lastUser.id, hasClientInput: Boolean(clientInput), attachmentCount: clientInput?.attachments.length ?? 0 },
      })
      this.store.updateRun(run)

      this.throwIfRunCancelled(run.id, signal)
      let contextResult: JSONValue
      let contextError: string | undefined
      const contextStartedAt = Date.now()
      try {
        await this.mcpClient.initialize({ signal })
        contextResult = await this.mcpClient.callTool('movscript_get_focus', {}, { signal })
      } catch (error) {
        contextError = error instanceof Error ? error.message : String(error)
        const contextDurationMs = Date.now() - contextStartedAt
        this.recordTraceEvent(run, {
          kind: 'context',
          title: 'Focus failed',
          summary: `${contextError} (${contextDurationMs}ms)`,
          status: isLocalDiagnosticCommand(command.name) ? 'blocked' : 'failed',
          round: setupRound,
          data: {
            source: 'mcp_focus',
            endpoint: 'movscript_get_focus',
            error: contextError,
            durationMs: contextDurationMs,
            startedAt: new Date(contextStartedAt).toISOString(),
            completedAt: isoNow(),
            fallback: isLocalDiagnosticCommand(command.name) ? 'client_input_snapshot' : 'none',
          },
        })
        this.store.updateRun(run)
        if (!isLocalDiagnosticCommand(command.name)) throw error
        contextResult = buildLocalDiagnosticFallbackContextResult(clientInput, contextError)
      }
      const context = extractAgentContext(contextResult)
      const focusTimings = extractFocusTimings(contextResult)
      const contextDurationMs = Date.now() - contextStartedAt
      if (typeof context.currentProjectId === 'number') {
        thread.projectId = context.currentProjectId
        this.store.updateThread(thread)
      }
      const memoryStartedAt = Date.now()
      const relevantMemories = this.memoryManager.loadRelevantMemories({
        projectId: context.currentProjectId,
        query: lastUser.content,
      })
      const memories = buildPromptMemoryIndex(relevantMemories)
      const memoryLoadedAt = Date.now()
      this.recordTraceEvent(run, {
        kind: 'memory',
        title: 'Relevant memories loaded',
        summary: `${memories.length} memory item(s) matched this run. (${memoryLoadedAt - memoryStartedAt}ms)`,
        status: 'completed',
        round: setupRound,
        data: {
          memoryIds: memories.map((m) => m.id),
          kinds: Array.from(new Set(memories.map((m) => m.kind))),
          durationMs: memoryLoadedAt - memoryStartedAt,
          startedAt: new Date(memoryStartedAt).toISOString(),
          completedAt: new Date(memoryLoadedAt).toISOString(),
        },
      })

      const agentManifest = run.agentManifest ?? catalogSnapshot.defaultAgentManifest
      const contextWarnings = contextError ? [`Focus unavailable: ${contextError}`] : []
      const baseDebugContext = buildDebugContext(contextResult, memories, clientInput)
      if (typeof context.currentProductionId === 'number') {
        baseDebugContext.productionId = context.currentProductionId
      }
      const shouldUseLayeredRuntime = run.metadata?.manifestSource === 'default' && catalogSnapshot.layeredRegistry.profiles.size > 0
      const layers = shouldUseLayeredRuntime
        ? resolveRuntimeLayers({
          registry: catalogSnapshot.layeredRegistry,
          baseManifest: agentManifest,
          message: lastUser.content,
          debugContext: baseDebugContext,
          ...(clientInput ? { clientInput } : {}),
          history: thread.messages,
        })
        : undefined
      const activeManifest = layers?.manifest ?? agentManifest
      run.agentManifest = activeManifest
      const runtimeContract = this.contractResolver.find(activeManifest)
      const skills = layers?.skills ?? []
      const capabilityStartedAt = Date.now()
      const capabilities = await resolveAgentCapabilities({
        mcpClient: this.mcpClient,
        manifest: activeManifest,
        currentProjectId: context.currentProjectId,
        registry: catalogSnapshot.toolRegistry,
        pluginCatalog: catalogSnapshot.pluginCatalogInfo,
        warnings: [...catalogSnapshot.pluginWarnings, ...contextWarnings, ...(layers?.warnings ?? [])],
        updates: this.updateState,
        ...(layers ? { activeSkills: skills } : {}),
        userMessage: lastUser.content,
        runRole: run.role,
      })
      const capabilityDurationMs = Date.now() - capabilityStartedAt
      const setup = buildRunSetupMetadata({
        run,
        agentManifest: activeManifest,
        skills,
        capabilities,
        contextResult,
        context,
        memories,
        command,
        ...(clientInput ? { clientInput } : {}),
        authMetadata: this.getRunAuth(run.id),
      })
      const debugContext = this.withRunPlanContext(setup.debugContext, run)

      this.recordTraceEvent(run, {
        kind: 'context',
        title: contextError ? 'Runtime context resolved from fallback' : 'Runtime context resolved',
        summary: debugContext.project
          ? `Project #${debugContext.project.id} ${debugContext.project.name ?? ''} (${contextDurationMs}ms)`.trim()
          : contextError ? `MCP context unavailable; using client input snapshot. (${contextDurationMs}ms)` : `No project selected. (${contextDurationMs}ms)`,
        status: contextError ? 'blocked' : 'completed',
        round: setupRound,
        data: {
          route: debugContext.route,
          project: debugContext.project,
          selection: debugContext.selection,
          ...(debugContext.agentPlan ? { agentPlan: debugContext.agentPlan as unknown as JSONValue } : {}),
          recentResourceCount: debugContext.recentResources.length,
          attachmentCount: debugContext.attachments.length,
          durationMs: contextDurationMs,
          startedAt: new Date(contextStartedAt).toISOString(),
          completedAt: new Date(Date.now()).toISOString(),
          ...(focusTimings ? { focusTimings } : {}),
          ...(contextError ? { fallback: true, error: contextError } : {}),
        },
      })
      this.recordTraceEvent(run, {
        kind: 'manifest',
        title: 'Agent manifest resolved',
        summary: `${agentManifest.name} (${agentManifest.id}@${agentManifest.version})`,
        status: 'completed',
        round: setupRound,
        data: {
          eventType: 'profile.resolved',
          id: layers?.trace.profileId ?? activeManifest.id,
          version: layers?.trace.profileVersion ?? activeManifest.version,
          ...(layers?.trace.personaId ? { personaId: layers.trace.personaId } : {}),
          ...(layers ? { policyIds: layers.trace.policyIds, workflowIds: layers.trace.workflowIds, profileLayers: layers.trace.profileLayers } : {}),
          permissions: Array.from(new Set(activeManifest.tools
            .filter((grant) => grant.mode !== 'deny')
            .flatMap((grant) => {
              const tool = catalogSnapshot.toolRegistry.get(grant.name)
              return tool ? [tool.permission] : []
            }))),
          toolGrants: activeManifest.tools.map((t) => ({ name: t.name, mode: t.mode, approval: t.approval })),
        },
      })
      this.recordTraceEvent(run, {
        kind: 'skill',
        title: 'Skills activated',
        summary: skills.length > 0 ? skills.map((s) => s.name).join(', ') : 'No skills activated.',
        status: 'completed',
        round: setupRound,
        data: {
          eventType: 'trigger.evaluated',
          skills: skills.map((s) => ({ id: s.id, name: s.name, activationReason: s.activationReason, priority: s.resolvedPriority, warnings: s.warnings })),
        },
      })
      this.recordTraceEvent(run, {
        kind: 'tool_catalog',
        title: 'Tool catalog resolved',
        summary: `${capabilities.resolvedTools.available.length} available, ${capabilities.resolvedTools.blocked.length} blocked. (${capabilityDurationMs}ms)`,
        status: 'completed',
        round: setupRound,
        data: {
          availableToolNames: capabilities.resolvedTools.available.map((t) => t.name),
          blockedTools: capabilities.resolvedTools.blocked.map((t) => ({ name: t.name, reason: t.unavailableReason })),
          warnings: capabilities.warnings,
          durationMs: capabilityDurationMs,
          startedAt: new Date(capabilityStartedAt).toISOString(),
          completedAt: isoNow(),
        },
      })

      run.metadata = setup.metadata
      run.metadata = {
        ...(run.metadata ?? {}),
        userRequest: lastUser.content,
        ...(clientInput ? { clientInput: clientInput as unknown as JSONValue } : {}),
      }
      this.store.updateRun(run)
      this.throwIfRunCancelled(run.id, signal)

      if (isLocalDiagnosticCommand(command.name) && !run.metadata?.forcedToolCall) {
        const localRound = buildRunRound(1, 'Runtime command', 'runtime_rule')
        this.recordTraceEvent(run, {
          kind: 'policy',
          title: 'Command handled locally',
          summary: `${command.rawName ?? `/${command.name}`} returns deterministic runtime diagnostics without calling the model gateway.`,
          status: 'completed',
          round: localRound,
          data: {
            command,
            modelGatewayCalled: false,
            reason: `${command.name} is a deterministic runtime diagnostic command`,
          },
        })

        const finalRound = buildRunRound(999, 'Final response', 'final')
        const localDiagnostic = buildLocalDiagnosticCommand({
          command,
          run,
          manifest: activeManifest,
          skills,
          context: debugContext,
          tools: capabilities.resolvedTools,
          policy: run.policy,
          memories,
          warnings: [...capabilities.warnings],
          history: thread.messages,
          userMessage: lastUser.content,
          memoryStorePath: this.getMemoryStorePath(),
          contractResolver: this.contractResolver,
        })
        const finalContent = localDiagnostic.content
        const assistant = this.createMessage(thread.id, 'assistant', finalContent || '（无内容）', run.id)
        thread.messages.push(assistant)
        thread.updatedAt = assistant.createdAt

        const step = this.createStep(run, 'message', finalRound)
        step.status = 'completed'
        step.result = {
          messageId: assistant.id,
          localCommand: command.name,
          ...(localDiagnostic.metadata ? { diagnostic: localDiagnostic.metadata } : {}),
        }
        step.completedAt = isoNow()
        this.recordTraceEvent(run, {
          kind: 'assistant',
          title: 'Assistant message created',
          summary: assistant.content.slice(0, 180),
          status: 'completed',
          round: finalRound,
          stepId: step.id,
          data: { messageId: assistant.id, chars: assistant.content.length, source: 'runtime_rule' },
        })

        run.assistantMessageId = assistant.id
        run.warnings = capabilities.warnings.length > 0 ? [...capabilities.warnings] : undefined
        run.metadata = {
          ...(run.metadata ?? {}),
          memoryIds: memories.map((m) => m.id),
          writtenMemoryIds: [],
        }
        run.status = run.warnings && run.warnings.length > 0 ? 'completed_with_warnings' : 'completed'
        run.completedAt = isoNow()
        run.updatedAt = run.completedAt
        this.recordTraceEvent(run, {
          kind: 'run',
          title: 'Run finished',
          summary: `Run ${run.status}; no model gateway call was needed.`,
          status: run.warnings && run.warnings.length > 0 ? 'info' : 'completed',
          round: finalRound,
          data: { status: run.status, warningCount: run.warnings?.length ?? 0, modelGatewayCalled: false },
        })
        this.applyThreadRunProjection(thread, run)
        thread.updatedAt = run.updatedAt
        this.store.updateThread(thread)
        this.store.updateRun(run)
        this.emitAssistantMessage(run, assistant)
        this.emitRunSnapshot(run, { done: true })
        return
      }

      if ((command.name === 'image' || command.name === 'video') && !run.metadata?.forcedToolCall) {
        const generationCommand = parseGenerationDebugCommand(command)
        if (!generationCommand) throw new Error('generation command could not be parsed')
        const localRound = buildRunRound(1, 'Runtime command', 'runtime_rule')
        this.recordTraceEvent(run, {
          kind: 'policy',
          title: `${command.name === 'image' ? 'Image' : 'Video'} command handled locally`,
          summary: `${command.rawName ?? `/${command.name}`} forces a generation tool call for chain debugging.`,
          status: 'completed',
          round: localRound,
          data: {
            command,
            modelGatewayCalled: false,
            reason: `${command.name} is a deterministic generation debug command`,
            generation: generationCommand,
          },
        })

        const finalRound = buildRunRound(999, 'Final response', 'final')
        const toolArgs = {
          prompt: generationCommand.prompt,
          output_type: generationCommand.outputType,
          job_type: generationCommand.jobType,
          ...(generationCommand.aspectRatio ? { aspect_ratio: generationCommand.aspectRatio } : {}),
          ...(generationCommand.duration !== undefined ? { duration: generationCommand.duration } : {}),
          feature_key: generationCommand.featureKey,
          timeout_ms: generationCommand.timeoutMs,
          wait: true,
          ...(generationCommand.referenceResourceIds.length > 0
            ? { input_resource_ids: generationCommand.referenceResourceIds }
            : {}),
          ...(Object.keys(generationCommand.extraParams).length > 0
            ? { extra_params: generationCommand.extraParams }
            : {}),
        }
        const forcedCall = { name: 'movscript_create_generation_job', args: toolArgs }
        run.metadata = {
          ...(run.metadata ?? {}),
          forcedToolCall: forcedCall as unknown as JSONValue,
        }
        this.store.updateRun(run)

        const toolStep = this.createStep(run, 'tool_call', localRound, 'movscript_create_generation_job')
        const startedAt = Date.now()
        let execResult
        try {
          execResult = await executeTool({
            name: 'movscript_create_generation_job',
            args: toolArgs as Record<string, JSONValue>,
          }, {
            run,
            mcpClient: this.mcpClient,
            draftStore: this.draftStore,
            backendApplyClient: this.backendApplyClient,
            registry: catalogSnapshot.toolRegistry,
            memoryManager: this.memoryManager,
            catalogManager: this,
            sandboxMode: run.policy.sandboxMode === true,
            signal,
          })
        } catch (error) {
          const errorData = generationBackendErrorData(error)
          execResult = {
            call: { name: 'movscript_create_generation_job', args: toolArgs as Record<string, JSONValue> },
            error: error instanceof Error ? error.message : String(error),
            ...(errorData !== undefined ? { errorData } : {}),
            source: 'mcp' as const,
          }
        }
        const durationMs = Date.now() - startedAt
        toolStep.status = execResult.error ? 'failed' : 'completed'
        toolStep.result = execResult.result
        toolStep.error = execResult.error
        toolStep.errorData = execResult.errorData
        toolStep.completedAt = isoNow()
        toolStep.durationMs = durationMs
        this.store.updateRun(run)
        this.recordTraceEvent(run, {
          kind: 'tool_call',
          title: execResult.error ? 'Tool call failed: movscript_create_generation_job' : 'Tool completed: movscript_create_generation_job',
          summary: `${execResult.error ?? 'generation job finished'} (${durationMs}ms)`,
          status: execResult.error ? 'failed' : 'completed',
          round: localRound,
          stepId: toolStep.id,
          toolName: 'movscript_create_generation_job',
          data: { source: execResult.source, result: execResult.result, error: execResult.error, errorData: execResult.errorData, sandboxed: execResult.sandboxed, durationMs },
          durationMs,
        })
        const generationEvent = buildGenerationEvent({ name: 'movscript_create_generation_job', args: toolArgs as Record<string, JSONValue> }, execResult.result)
        if (generationEvent) {
          this.recordTraceEvent(run, {
            kind: 'tool_call',
            title: `Generation ${generationEvent.stage}: ${generationEvent.jobId !== undefined ? `Job #${generationEvent.jobId}` : generationEvent.toolName}`,
            summary: generationEvent.message,
            status: generationEvent.stage === 'failed' ? 'failed' : generationEvent.terminal ? 'completed' : 'info',
            round: localRound,
            stepId: toolStep.id,
            toolName: 'movscript_create_generation_job',
            data: { generation: generationEvent },
          })
        }
        const assistantContent = this.formatFinalAssistantContent(lastUser.content, '', [{
          call: { name: 'movscript_create_generation_job', args: toolArgs as Record<string, JSONValue> },
          ...(execResult.error ? { error: execResult.error } : { result: execResult.result }),
        }], capabilities.warnings, memories, run)
        const assistant = this.createMessage(thread.id, 'assistant', assistantContent || '（无内容）', run.id)
        thread.messages.push(assistant)
        thread.updatedAt = assistant.createdAt

        const step = this.createStep(run, 'message', finalRound)
        step.status = 'completed'
        step.result = { messageId: assistant.id, localCommand: command.name }
        step.completedAt = isoNow()
        this.recordTraceEvent(run, {
          kind: 'assistant',
          title: 'Assistant message created',
          summary: assistant.content.slice(0, 180),
          status: 'completed',
          round: finalRound,
          stepId: step.id,
          data: { messageId: assistant.id, chars: assistant.content.length, source: 'runtime_rule' },
        })

        run.assistantMessageId = assistant.id
        run.warnings = capabilities.warnings.length > 0 ? [...capabilities.warnings] : undefined
        run.metadata = {
          ...(run.metadata ?? {}),
          memoryIds: memories.map((m) => m.id),
          writtenMemoryIds: [],
        }
        run.status = run.warnings && run.warnings.length > 0 ? 'completed_with_warnings' : 'completed'
        run.completedAt = isoNow()
        run.updatedAt = run.completedAt
        this.recordTraceEvent(run, {
          kind: 'run',
          title: 'Run finished',
          summary: `Run ${run.status} after forced video generation.`,
          status: run.warnings && run.warnings.length > 0 ? 'info' : 'completed',
          round: finalRound,
          data: { status: run.status, warningCount: run.warnings?.length ?? 0, modelGatewayCalled: false, toolResultCount: 1 },
        })
        this.applyThreadRunProjection(thread, run)
        thread.updatedAt = run.updatedAt
        this.store.updateThread(thread)
        this.store.updateRun(run)
        this.emitAssistantMessage(run, assistant)
        this.emitRunSnapshot(run, { done: true })
        return
      }

      const setupCompletedAt = Date.now()
      this.recordTraceEvent(run, {
        kind: 'model_call',
        title: 'Pre-model setup complete',
        summary: `Context, memory, and tool setup finished in ${setupCompletedAt - runStartedAt}ms before the first model request.`,
        status: 'info',
        round: setupRound,
        data: {
          durationMs: setupCompletedAt - runStartedAt,
          contextMs: contextDurationMs,
          memoryMs: memoryLoadedAt - memoryStartedAt,
          capabilityMs: capabilityDurationMs,
          ...(focusTimings ? { focusTimings } : {}),
        },
      })

      // Resolve model config
      const { resolveRuntimeChatModelConfig } = await import('../model/modelConfig.js')
      const modelConfig = resolveRuntimeChatModelConfig()
      if (!modelConfig) throw new Error('no model config found — configure a backend model config first')

      const loopResult = await runAgentGraph({
        run,
        threadMessages: thread.messages,
        manifest: activeManifest,
        capabilities: capabilities.resolvedTools,
        skills,
        context: debugContext,
        memories,
        warnings: [...capabilities.warnings],
        command,
        ...(typeof run.metadata?.initialUserMessageId === 'string' ? { rootUserMessageId: run.metadata.initialUserMessageId } : {}),
        config: modelConfig,
        auth: this.getRunAuth(run.id),
        policy: run.policy,
        mcpClient: this.mcpClient,
        draftStore: this.draftStore,
        backendApplyClient: this.backendApplyClient,
        registry: catalogSnapshot.toolRegistry,
        contractResolver: this.contractResolver,
        memoryManager: this.memoryManager,
        catalogManager: this,
        onCatalogRefresh: async () => {
          catalogSnapshot = this.captureRunCatalogSnapshot(run.id)
          const refreshedBaseManifest = run.metadata?.manifestSource === 'default'
            ? catalogSnapshot.defaultAgentManifest
            : run.agentManifest ?? catalogSnapshot.defaultAgentManifest
          const refreshedLayers = run.metadata?.manifestSource === 'default' && catalogSnapshot.layeredRegistry.profiles.size > 0
            ? resolveRuntimeLayers({
              registry: catalogSnapshot.layeredRegistry,
              baseManifest: refreshedBaseManifest,
              message: lastUser.content,
              debugContext,
              ...(clientInput ? { clientInput } : {}),
              history: thread.messages,
            })
            : undefined
          const refreshedManifest = refreshedLayers?.manifest ?? refreshedBaseManifest
          run.agentManifest = refreshedManifest
          const refreshedSkills = refreshedLayers?.skills ?? []
          const refreshedCapabilities = await resolveAgentCapabilities({
            mcpClient: this.mcpClient,
            manifest: refreshedManifest,
            currentProjectId: context.currentProjectId,
            registry: catalogSnapshot.toolRegistry,
            pluginCatalog: catalogSnapshot.pluginCatalogInfo,
            warnings: [...catalogSnapshot.pluginWarnings, ...(refreshedLayers?.warnings ?? [])],
            updates: this.updateState,
            ...(refreshedLayers ? { activeSkills: refreshedSkills } : {}),
            userMessage: lastUser.content,
            runRole: run.role,
          })
          return {
            manifest: refreshedManifest,
            capabilities: refreshedCapabilities.resolvedTools,
            skills: refreshedSkills,
            registry: catalogSnapshot.toolRegistry,
            warnings: refreshedCapabilities.warnings,
          }
        },
        signal,
        ...(runtimeContract?.commandOverride
          ? { command: runtimeContract.commandOverride({ userMessage: lastUser.content, manifest: activeManifest }) }
          : {}),
        ...(run.metadata?.forcedToolCall ? { forcedToolCalls: [normalizeToolCall(run.metadata.forcedToolCall) as ToolCall] } : {}),
        ...(getApprovedToolNames(run).length > 0 ? { approvedToolNames: getApprovedToolNames(run) } : {}),
        onTrace: (traceInput) => {
          if (traceInput.volatile) {
            this.emitVolatileTraceEvent(run, traceInput)
            return
          }
          this.recordTraceEvent(run, {
            kind: traceInput.kind,
            title: traceInput.title,
            summary: traceInput.summary,
            status: traceInput.status,
            round: { roundId: `round_${traceInput.roundIndex}`, roundIndex: traceInput.roundIndex, roundLabel: traceInput.roundLabel, roundSource: traceInput.roundSource },
            stepId: traceInput.stepId,
            toolName: traceInput.toolName,
            data: traceInput.data,
            durationMs: traceInput.durationMs,
          })
          this.store.updateRun(run)
        },
        onGenerationEvent: (event, trace) => {
          this.recordTraceEvent(run, {
            kind: 'tool_call',
            title: `Generation ${event.stage}: ${event.jobId !== undefined ? `Job #${event.jobId}` : event.toolName}`,
            summary: event.message,
            status: event.stage === 'failed' ? 'failed' : event.terminal ? 'completed' : 'info',
            round: { roundId: `round_${trace.roundIndex}`, roundIndex: trace.roundIndex, roundLabel: trace.roundLabel, roundSource: trace.roundSource },
            stepId: trace.stepId,
            toolName: trace.toolName,
            data: {
              generation: event,
            },
          })
          this.store.updateRun(run)
        },
        onStepCreate: (type, roundIndex, roundLabel, roundSource, toolName) => {
          const step = this.createStep(run, type, { roundId: `round_${roundIndex}`, roundIndex, roundLabel, roundSource }, toolName)
          return step.id
        },
        onStepComplete: (stepId, result, error, sandboxed) => {
          const step = run.steps.find((s) => s.id === stepId)
          if (!step) return
          step.status = error ? 'failed' : 'completed'
          if (result !== undefined) step.result = result
          if (error) step.error = error
          if (sandboxed) step.sandboxed = sandboxed
          step.completedAt = isoNow()
          step.durationMs = durationBetweenMs(step.createdAt, step.completedAt)
          run.updatedAt = step.completedAt
          this.store.updateRun(run)
          this.emitRunSnapshot(run)
        },
      })
      this.throwIfRunCancelled(run.id, signal)

      if (loopResult.status === 'requires_action') {
        const now = isoNow()
        run.pendingApprovals = mergePendingApprovals(run.pendingApprovals ?? [], loopResult.pendingApprovals, now)
        run.pendingInputRequests = mergePendingInputRequests(run.pendingInputRequests ?? [], loopResult.pendingInputRequests ?? [], now)
        run.warnings = loopResult.warnings.length > 0 ? loopResult.warnings : undefined
        run.status = 'requires_action'
        run.updatedAt = now
        const pendingInputCount = (run.pendingInputRequests ?? []).filter((request) => request.status === 'pending').length
        this.recordTraceEvent(run, {
          kind: pendingInputCount > 0 && loopResult.pendingApprovals.length === 0 ? 'input' : 'approval',
          title: pendingInputCount > 0 && loopResult.pendingApprovals.length === 0 ? 'User input required' : 'Approval required',
          summary: pendingInputCount > 0 && loopResult.pendingApprovals.length === 0
            ? `${pendingInputCount} user input request(s) paused the run.`
            : `${loopResult.pendingApprovals.length} tool action(s) paused the run.`,
          status: 'blocked',
          data: { approvals: loopResult.pendingApprovals, inputRequests: run.pendingInputRequests },
        })
        this.store.updateRun(run)
        this.updateThreadRunStatus(run.threadId, run.status, run.id)
        this.emitRunSnapshot(run, { done: true })
        return
      }

      if (loopResult.status === 'cancelled') {
        this.markRunCancelled(run, loopResult.reason)
        return
      }

      if (loopResult.status === 'failed') {
        throw new Error(loopResult.error)
      }

      // completed
      const finalRound = buildRunRound(999, 'Final response', 'final')
      const finalContent = this.formatFinalAssistantContent(lastUser.content, loopResult.finalContent, loopResult.toolOutcomes, loopResult.warnings, memories, run)
      const assistant = this.createMessage(thread.id, 'assistant', finalContent || '（无内容）', run.id)
      thread.messages.push(assistant)
      thread.updatedAt = assistant.createdAt

      const step = this.createStep(run, 'message', finalRound)
      step.status = 'completed'
      step.result = { messageId: assistant.id }
      step.completedAt = isoNow()
      this.recordTraceEvent(run, {
        kind: 'assistant',
        title: 'Assistant message created',
        summary: assistant.content.slice(0, 180),
        status: 'completed',
        round: finalRound,
        stepId: step.id,
        data: { messageId: assistant.id, chars: assistant.content.length },
      })

      run.assistantMessageId = assistant.id
      run.warnings = loopResult.warnings.length > 0 ? loopResult.warnings : undefined
      run.metadata = {
        ...(run.metadata ?? {}),
        memoryIds: memories.map((m) => m.id),
        ...buildRollbackMetadata(loopResult.toolOutcomes),
      }

      run.status = loopResult.warnings.length > 0 ? 'completed_with_warnings' : 'completed'
      run.completedAt = isoNow()
      run.updatedAt = run.completedAt
      this.recordTraceEvent(run, {
        kind: 'run',
        title: 'Run finished',
        summary: `Run ${run.status} with ${run.steps.length} step(s).`,
        status: loopResult.warnings.length > 0 ? 'info' : 'completed',
        round: finalRound,
        data: { status: run.status, warningCount: loopResult.warnings.length, stepCount: run.steps.length, toolResultCount: loopResult.toolOutcomes.length },
      })
      this.applyThreadRunProjection(thread, run)
      thread.updatedAt = run.updatedAt
      this.store.updateThread(thread)
      this.store.updateRun(run)
      this.emitAssistantMessage(run, assistant)
      this.emitRunSnapshot(run, { done: true })
      this.deferPostRunRecords(run.id, {
        round: finalRound,
        userMessage: lastUser,
        projectId: context.currentProjectId,
        toolOutcomes: loopResult.toolOutcomes,
        warnings: loopResult.warnings,
      })
    } catch (error) {
      if (this.isAbortError(error) || this.isRunCancelled(runId)) {
        this.markRunCancelled(this.store.getRun(runId) ?? run)
        return
      }
      run.status = 'failed'
      run.error = error instanceof Error ? error.message : String(error)
      run.failedAt = isoNow()
      run.updatedAt = run.failedAt
      this.recordTraceEvent(run, {
        kind: 'error',
        title: 'Run failed',
        summary: run.error,
        status: 'failed',
        data: { error: run.error },
      })
      this.updateThreadRunStatus(run.threadId, run.status, run.id)
      const thread = this.store.getThread(run.threadId)
      if (thread) {
        const assistant = this.createMessage(thread.id, 'assistant', `运行失败：${run.error}`, run.id)
        thread.messages.push(assistant)
        thread.updatedAt = assistant.createdAt
        this.applyThreadRunProjection(thread, run)
        run.assistantMessageId = assistant.id
        const step = this.createStep(run, 'message')
        step.status = 'completed'
        step.result = { messageId: assistant.id }
        step.completedAt = isoNow()
        this.store.updateThread(thread)
        this.store.updateRun(run)
        this.emitAssistantMessage(run, assistant)
      }
      this.emitRunSnapshot(run, { done: true })
    }
  }

  private resolveAgentManifest(
    inputManifest: unknown,
    clientInput?: ReturnType<typeof normalizeClientInput>,
    catalogSnapshot: AgentRuntimeCatalogSnapshot = this.catalogSnapshot,
  ): AgentManifest {
    void clientInput
    return normalizeAgentManifest(inputManifest ?? catalogSnapshot.defaultAgentManifest)
  }

  private rememberRunAuth(runId: string, value: unknown): void {
    const record = isRecord(value) ? value : {}
    const token = normalizeBackendAuthToken(record.backendAuthToken ?? value).backendAuthToken
    const backendAPIBaseURL = normalizeBackendAPIBaseURL(record.backendAPIBaseURL).backendAPIBaseURL
    const current = this.runAuth.get(runId) ?? {}
    const next = {
      ...current,
      ...(token ? { backendAuthToken: token } : {}),
      ...(backendAPIBaseURL ? { backendAPIBaseURL } : {}),
    }
    if (Object.keys(next).length > 0) this.runAuth.set(runId, next)
  }

  private getRunAuth(runId: string): { backendAuthToken?: string; backendAPIBaseURL?: string } {
    return this.runAuth.get(runId) ?? {}
  }

  private createStep(run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string): AgentRunStep {
    const step = buildRunStep({
      id: makeId('step'),
      runId: run.id,
      type,
      createdAt: isoNow(),
      ...(round ? { round } : {}),
      ...(toolName ? { toolName } : {}),
    })
    run.steps.push(step)
    run.updatedAt = step.createdAt
    this.store.updateRun(run)
    this.emitRunSnapshot(run)
    return step
  }

  private recordTraceEvent(
    run: AgentRun,
    input: {
      kind: AgentTraceEventKind
      title: string
      summary?: string
      status: AgentTraceEvent['status']
      round?: AgentRunRoundInfo
      agentId?: string
      parentAgentId?: string
      stepId?: string
      toolName?: string
      data?: unknown
      durationMs?: number
      completedAt?: string
    },
  ): AgentTraceEvent {
    const event = appendTraceEvent({
      id: makeId('trace'),
      run,
      now: isoNow(),
      kind: input.kind,
      title: input.title,
      status: input.status,
      ...(input.round ? { round: input.round } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.parentAgentId ? { parentAgentId: input.parentAgentId } : {}),
      ...(input.stepId ? { stepId: input.stepId } : {}),
      ...(input.toolName ? { toolName: input.toolName } : {}),
      ...(input.data !== undefined ? { data: input.data } : {}),
      ...(typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) ? { durationMs: input.durationMs } : {}),
      ...(input.completedAt ? { completedAt: input.completedAt } : {}),
    })
    this.store.appendTraceEvent(event)
    this.emitRunStreamEvent(run.id, { type: 'trace', runId: run.id, event })
    const assistantDelta = assistantDeltaFromTraceEvent(event)
    if (assistantDelta) {
      this.emitRunStreamEvent(run.id, { ...assistantDelta, runId: run.id, traceEventId: event.id, createdAt: event.createdAt })
    }
    const assistantMessage = assistantMessageFromTraceEvent(this.store.getThread(run.threadId) ?? undefined, event)
    if (assistantMessage) {
      this.emitRunStreamEvent(run.id, { type: 'assistant_message', runId: run.id, message: assistantMessage, run: toStreamRun(run) })
    }
    return event
  }

  private emitVolatileTraceEvent(run: AgentRun, input: {
    kind: AgentTraceEventKind
    title: string
    status: AgentTraceEvent['status']
    roundIndex: number
    roundLabel: string
    roundSource: AgentTraceEvent['roundSource']
    summary?: string
    data?: unknown
    volatileKey?: string
  }): void {
    const event: AgentTraceEvent = {
      id: input.volatileKey ? `trace_live_${input.volatileKey}` : makeId('trace'),
      runId: run.id,
      kind: input.kind,
      title: input.title,
      status: input.status,
      roundId: `round_${input.roundIndex}`,
      roundIndex: input.roundIndex,
      roundLabel: input.roundLabel,
      roundSource: input.roundSource,
      createdAt: isoNow(),
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.data !== undefined ? { data: input.data as JSONValue } : {}),
    }
    if (input.kind === 'tool_call') {
      this.emitRunStreamEvent(run.id, { type: 'trace', runId: run.id, event })
    }
    const assistantDelta = assistantDeltaFromTraceEvent(event)
    if (assistantDelta) {
      this.emitRunStreamEvent(run.id, {
        ...assistantDelta,
        runId: run.id,
        traceEventId: event.id,
        createdAt: event.createdAt,
      })
    }
  }

  private replayRunStream(run: AgentRun, listener: (event: AgentRunStreamEvent) => void): void {
    const streamRun = toStreamRun(run)
    listener({ type: 'run', run: streamRun })
    const traceEvents = this.store.listRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    for (const event of traceEvents) {
      listener({ type: 'trace', runId: run.id, event })
      const assistantDelta = assistantDeltaFromTraceEvent(event)
      if (assistantDelta) {
        listener({ ...assistantDelta, runId: run.id, traceEventId: event.id, createdAt: event.createdAt })
      }
    }
    const assistantMessage = assistantMessageForRun(this.store.getThread(run.threadId), run)
    if (assistantMessage) listener({ type: 'assistant_message', runId: run.id, message: assistantMessage, run: streamRun })
    if (isTerminalRunStatus(run.status)) listener({ type: 'done', run: streamRun })
  }

  private emitRunStreamEvent(runId: string, event: AgentRunStreamEvent): void {
    const subscribers = this.runStreamSubscribers.get(runId)
    if (subscribers && subscribers.size > 0) {
      for (const subscriber of [...subscribers]) {
        try {
          subscriber(event)
        } catch {
          subscribers.delete(subscriber)
        }
      }
      if (event.type === 'done') this.runStreamSubscribers.delete(runId)
    }
    this.emitPlanRunStreamEvent(event)
  }

  private emitRunSnapshot(run: AgentRun, options: { done?: boolean } = {}): void {
    const streamRun = toStreamRun(run)
    this.emitRunStreamEvent(run.id, { type: 'run', run: streamRun })
    if (options.done) {
      this.emitRunStreamEvent(run.id, { type: 'done', run: streamRun })
    }
  }

  private emitAssistantMessage(run: AgentRun, message: AgentMessage): void {
    this.emitRunStreamEvent(run.id, {
      type: 'assistant_message',
      runId: run.id,
      message,
      run: toStreamRun(run),
    })
  }

  private replayPlanStream(planId: string, listener: (event: AgentPlanStreamEvent) => void): void {
    const snapshot = this.getPlanSnapshot(planId)
    listener({ type: 'snapshot', snapshot })
    if (isTerminalPlanStatus(snapshot.plan.status)) listener({ type: 'done', snapshot })
  }

  private emitPlanRunStreamEvent(event: AgentRunStreamEvent): void {
    const run = event.type === 'run' || event.type === 'done'
      ? event.run
      : 'run' in event && event.run
        ? event.run
        : event.type === 'trace' || event.type === 'assistant_delta' || event.type === 'assistant_message'
          ? this.store.getRun(event.runId)
          : undefined
    if (!run?.planId) return
    const planId = run.planId
    if (!this.planStreamSubscribers.has(planId)) return
    if (event.type === 'trace') {
      this.emitPlanStreamEvent(planId, {
        type: 'trace',
        planId,
        runId: event.runId,
        event: event.event,
        snapshot: this.getPlanSnapshot(planId),
      })
      return
    }
    if (event.type === 'run' || event.type === 'done') {
      this.emitPlanStreamEvent(planId, {
        type: 'run',
        planId,
        run: toStreamRun(run),
        snapshot: this.getPlanSnapshot(planId),
      })
    }
  }

  private emitPlanTaskEvent(planId: string, task: AgentTask): void {
    if (!this.planStreamSubscribers.has(planId)) return
    this.emitPlanStreamEvent(planId, {
      type: 'task',
      planId,
      task,
      snapshot: this.getPlanSnapshot(planId),
    })
  }

  private recordTaskProtocolEvents(task: AgentTask, previous?: AgentTask): void {
    const run = this.resolveTaskProtocolRun(task)
    if (!run) return
    const baseData = {
      planId: task.planId,
      taskId: task.id,
      taskStatus: task.status,
      progress: task.progress,
      ...(task.ownerRunId ? { ownerRunId: task.ownerRunId } : {}),
      ...(task.blockedReason ? { blockedReason: task.blockedReason } : {}),
    }
    const emitTaskTrace = (eventType: string, title: string, status: AgentTraceEvent['status'], summary?: string, data?: Record<string, unknown>) => {
      this.recordTraceEvent(run, {
        kind: 'task',
        title,
        ...(summary ? { summary } : {}),
        status,
        data: {
          ...baseData,
          eventType,
          ...(data ?? {}),
        },
      })
    }

    if (!previous) {
      emitTaskTrace('task_created', 'Task created', 'info', task.title)
      return
    }
    if (previous.status !== task.status) {
      const event = taskStatusProtocolEvent(task)
      emitTaskTrace(event.eventType, event.title, event.status, task.blockedReason ?? task.title)
    }
    if (previous.progress !== task.progress) {
      emitTaskTrace('progress_update', 'Task progress updated', 'info', `${Math.round(task.progress * 100)}%`, {
        previousProgress: previous.progress,
      })
    }
    for (const artifact of task.artifacts) {
      if (previous.artifacts.some((item) => item.id === artifact.id)) continue
      emitTaskTrace('artifact_created', 'Task artifact created', 'completed', artifact.title ?? artifact.uri ?? artifact.type, {
        artifact,
      })
    }
  }

  private resolveTaskProtocolRun(task: AgentTask): AgentRun | undefined {
    if (task.ownerRunId) {
      const ownerRun = this.store.getRun(task.ownerRunId)
      if (ownerRun) return ownerRun
    }
    const plan = this.store.getPlan(task.planId)
    return plan?.rootRunId ? this.store.getRun(plan.rootRunId) : undefined
  }

  private recordRollbackTraceEvents(run: AgentRun, outcomes: ToolCallOutcome[], round: AgentRunRoundInfo): void {
    const records = outcomes.flatMap((outcome) => outcome.rollback ? [{ call: outcome.call, rollback: outcome.rollback }] : [])
    if (records.length === 0) return
    this.recordTraceEvent(run, {
      kind: 'task',
      title: 'Rollback policy recorded',
      summary: `${records.length} side effect rollback record(s).`,
      status: records.some((record) => record.rollback.policy === 'manual_compensation') ? 'blocked' : 'info',
      round,
      data: {
        eventType: 'rollback_policy',
        rollbackRecords: records,
      },
    })
  }

  private deferPostRunRecords(runId: string, input: {
    round: AgentRunRoundInfo
    userMessage: AgentMessage
    projectId?: number
    toolOutcomes: ToolCallOutcome[]
    warnings: string[]
  }): void {
    const runSnapshot = this.store.getRun(runId)
    if (!runSnapshot) return
    let resolveTask: () => void
    const task = new Promise<void>((resolve) => {
      resolveTask = resolve
    })
    this.postRunRecordTasks.add(task)
    setTimeout(() => {
      try {
        const run = this.store.getRun(runId)
        if (!run || (run.status !== 'completed' && run.status !== 'completed_with_warnings')) return
        const writtenMemories = this.memoryManager.extractAndWriteMemories({
          run,
          userMessage: input.userMessage,
          projectId: input.projectId,
          toolResults: input.toolOutcomes,
          warnings: input.warnings,
        })
        run.metadata = {
          ...(run.metadata ?? {}),
          writtenMemoryIds: writtenMemories.map((memory) => memory.id),
        }
        this.recordTraceEvent(run, {
          kind: 'memory',
          title: 'Memories written',
          summary: `${writtenMemories.length} memory item(s) written after the run.`,
          status: 'completed',
          round: input.round,
          data: {
            async: true,
            writtenMemoryIds: writtenMemories.map((memory) => memory.id),
            kinds: Array.from(new Set(writtenMemories.map((memory) => memory.kind))),
          },
        })
        this.recordRollbackTraceEvents(run, input.toolOutcomes, input.round)
        this.store.updateRun(run)
      } catch (error) {
        const run = this.store.getRun(runId)
        if (!run) return
        this.recordTraceEvent(run, {
          kind: 'memory',
          title: 'Deferred post-run records failed',
          summary: error instanceof Error ? error.message : String(error),
          status: 'failed',
          round: input.round,
          data: { async: true },
        })
        this.store.updateRun(run)
      }
      finally {
        this.postRunRecordTasks.delete(task)
        resolveTask()
      }
    }, 0)
  }

  private emitPlanStreamEvent(planId: string, event: AgentPlanStreamEvent): void {
    const subscribers = this.planStreamSubscribers.get(planId)
    if (!subscribers || subscribers.size === 0) return
    for (const subscriber of [...subscribers]) {
      try {
        subscriber(event)
      } catch {
        subscribers.delete(subscriber)
      }
    }
    if (event.type === 'done' || isTerminalPlanStatus(event.snapshot.plan.status)) {
      const snapshot = event.snapshot
      for (const subscriber of [...subscribers]) {
        try {
          subscriber({ type: 'done', snapshot })
        } catch {
          subscribers.delete(subscriber)
        }
      }
      this.planStreamSubscribers.delete(planId)
    }
  }

  private createMessage(threadId: string, role: AgentMessageRole, content: string, runId?: string): AgentMessage {
    return { id: makeId('msg'), threadId, role, content, runId, createdAt: isoNow() }
  }

  private requireThread(id: string): AgentThread {
    const thread = this.store.getThread(id)
    if (!thread) throw new Error(`thread not found: ${id}`)
    return thread
  }

  private requireRun(id: string): AgentRun {
    const run = this.store.getRun(id)
    if (!run) throw new Error(`run not found: ${id}`)
    return run
  }

  private requirePlannerRun(id: string): AgentRun {
    const run = this.requireRun(id)
    if (run.role !== 'planner') throw new Error(`run ${id} is not a planner run`)
    return run
  }

  private requirePlan(id: string): AgentPlan {
    const plan = this.store.getPlan(id)
    if (!plan) throw new Error(`plan not found: ${id}`)
    return plan
  }

  private findThreadPlan(threadId: string): AgentPlan | undefined {
    return this.store.listPlans().find((plan) => plan.threadId === threadId)
  }

  private attachPlannerRunToPlan(runId: string, planId: string, source: string): AgentRun {
    const run = this.requirePlannerRun(runId)
    const plan = this.requirePlan(planId)
    if (run.threadId !== plan.threadId) throw new Error(`planner run ${run.id} cannot attach to plan ${plan.id}`)
    if (run.planId && run.planId !== plan.id) throw new Error(`planner run ${run.id} is already attached to plan ${run.planId}`)
    run.planId = plan.id
    run.progress = 0
    run.updatedAt = isoNow()
    run.metadata = {
      ...(run.metadata ?? {}),
      attachedPlanByTool: source,
    }
    this.store.updateRun(run)

    if (!plan.rootRunId) {
      plan.rootRunId = run.id
      plan.updatedAt = isoNow()
      this.store.updatePlan(plan)
    } else if (plan.rootRunId !== run.id) {
      const rootRun = this.store.getRun(plan.rootRunId)
      if (!rootRun || rootRun.threadId !== run.threadId) {
        plan.rootRunId = run.id
        plan.updatedAt = isoNow()
        this.store.updatePlan(plan)
      }
    }
    return run
  }

  private resolvePlannerRunPlanId(plannerRun: AgentRun, inputPlanId: unknown, source: string, action: string): string {
    const planId = normalizeNonEmptyString(inputPlanId)
      ?? plannerRun.planId
      ?? this.findThreadPlan(plannerRun.threadId)?.id
    if (!planId) throw new Error(`${toolNameFromSource(source)} requires planId or a planner run plan`)
    if (plannerRun.planId && plannerRun.planId !== planId) throw new Error(`planner run ${plannerRun.id} cannot ${action} plan ${planId}`)
    const plan = this.requirePlan(planId)
    if (plan.threadId !== plannerRun.threadId) throw new Error(`planner run ${plannerRun.id} cannot ${action} plan ${planId}`)
    if (!plannerRun.planId) this.attachPlannerRunToPlan(plannerRun.id, planId, source)
    return planId
  }

  private requireTask(id: string): AgentTask {
    const task = this.store.getTask(id)
    if (!task) throw new Error(`task not found: ${id}`)
    return task
  }

  private requireTaskOwnerRunId(planId: string, taskIdInput: unknown): string | undefined {
    const taskId = normalizeNonEmptyString(taskIdInput)
    if (!taskId) return undefined
    const task = this.requireTask(taskId)
    if (task.planId !== planId) throw new Error(`task ${taskId} does not belong to plan ${planId}`)
    return task.ownerRunId
  }

  private resolveSubagentNameInput(planId: string, input: Record<string, JSONValue>): Record<string, JSONValue> {
    const subagentName = normalizeNonEmptyString(input.subagentName)
    if (!subagentName) return input
    const task = this.requireTaskBySubagentName(planId, subagentName)
    return {
      ...input,
      taskId: task.id,
      ...(task.ownerRunId ? { runId: task.ownerRunId } : {}),
    }
  }

  private requireTaskBySubagentName(planId: string, subagentName: string): AgentTask {
    const matches = this.store.listTasks(planId).filter((task) => subagentNameFromTask(task) === subagentName)
    if (matches.length === 0) throw new Error(`subagent not found by name: ${subagentName}`)
    if (matches.length > 1) {
      throw new Error(`subagent name is ambiguous in plan ${planId}: ${subagentName}`)
    }
    return matches[0]!
  }

  private collectSubagentNames(planId: string): Set<string> {
    const names = new Set<string>()
    for (const task of this.store.listTasks(planId)) {
      const name = subagentNameFromTask(task)
      if (name) names.add(name)
    }
    for (const run of this.store.listRuns({ planId })) {
      const name = subagentNameFromRun(run)
      if (name) names.add(name)
    }
    return names
  }

  private assertUniqueSubagentNameForTask(planId: string, taskId: string, subagentName: string, requestedNames: Map<string, string>): void {
    for (const [otherTaskId, otherName] of requestedNames.entries()) {
      if (otherTaskId !== taskId && otherName === subagentName) {
        throw new Error(`subagent name already exists in plan ${planId}: ${subagentName}`)
      }
    }
    for (const task of this.store.listTasks(planId)) {
      if (task.id !== taskId && subagentNameFromTask(task) === subagentName) {
        throw new Error(`subagent name already exists in plan ${planId}: ${subagentName}`)
      }
    }
    for (const run of this.store.listRuns({ planId })) {
      if (run.taskId !== taskId && subagentNameFromRun(run) === subagentName) {
        throw new Error(`subagent name already exists in plan ${planId}: ${subagentName}`)
      }
    }
  }

  private assertSubagentNamesUniqueForTaskMap(planId: string, tasksById: Map<string, AgentTask>): void {
    const taskIdsByName = new Map<string, string[]>()
    for (const task of tasksById.values()) {
      const subagentName = subagentNameFromTask(task)
      if (!subagentName) continue
      taskIdsByName.set(subagentName, [...(taskIdsByName.get(subagentName) ?? []), task.id])
    }
    for (const [subagentName, taskIds] of taskIdsByName.entries()) {
      if (taskIds.length > 1) throw new Error(`subagent name already exists in plan ${planId}: ${subagentName}`)
    }
    for (const run of this.store.listRuns({ planId })) {
      const subagentName = subagentNameFromRun(run)
      if (!subagentName) continue
      const taskIds = taskIdsByName.get(subagentName) ?? []
      if (taskIds.some((taskId) => taskId !== run.taskId)) throw new Error(`subagent name already exists in plan ${planId}: ${subagentName}`)
    }
  }

  private withRunPlanContext(context: AgentDebugContextPanel, run: AgentRun): AgentDebugContextPanel {
    if (!run.planId) return context
    const plan = this.store.getPlan(run.planId)
    if (!plan) return context
    const tasks = this.store.listTasks(plan.id)
    const tasksById = new Map(tasks.map((task) => [task.id, task]))
    const nameConflicts = subagentNameConflicts(tasks)
    const runs = this.store.listRuns({ planId: plan.id })
    const workers = runs
      .filter((item) => item.role === 'worker')
      .map((item) => ({
        id: item.id,
        status: item.status,
        ...(subagentNameFromRun(item) ? { subagentName: subagentNameFromRun(item) } : {}),
        ...(item.taskId ? { taskId: item.taskId } : {}),
        ...(item.parentRunId ? { parentRunId: item.parentRunId } : {}),
        ...(typeof item.progress === 'number' ? { progress: item.progress } : {}),
        ...(item.blockedReason ? { blockedReason: item.blockedReason } : {}),
      }))
    const artifacts = taskArtifactReferences(tasks, tasksById)
    return {
      ...context,
      agentPlan: {
        id: plan.id,
        title: plan.title,
        status: plan.status,
        progress: plan.progress,
        ...(run.role ? { role: run.role } : {}),
        ...(run.taskId ? { currentTaskId: run.taskId } : {}),
        ...(plan.rootRunId ? { rootRunId: plan.rootRunId } : {}),
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          progress: task.progress,
          deps: task.deps,
          ...(subagentNameFromTask(task) ? { subagentName: subagentNameFromTask(task) } : {}),
          ...(task.ownerRunId ? { ownerRunId: task.ownerRunId } : {}),
            ...(task.blockedReason ? { blockedReason: task.blockedReason } : {}),
          })),
        workers,
        ...(nameConflicts.length > 0 ? { nameConflicts } : {}),
        artifacts,
        summary: agentPlanSummary(tasks, workers, artifacts, nameConflicts),
      },
    }
  }

  private subagentSnapshot(planId: string, plannerRunId: string): Record<string, JSONValue> {
    const snapshot = this.getPlanSnapshot(planId)
    const nameConflicts = subagentNameConflicts(snapshot.tasks)
    const workers = snapshot.runs
      .filter((run) => run.parentRunId === plannerRunId || (run.role === 'worker' && run.planId === planId))
      .map((run) => this.toSubagentRunSummaryForPlan(run))
    const artifacts = taskArtifactReferences(snapshot.tasks)
    return {
      plan: snapshot.plan as unknown as JSONValue,
      tasks: snapshot.tasks as unknown as JSONValue,
      workers: workers as unknown as JSONValue,
      ...(nameConflicts.length > 0 ? { nameConflicts: nameConflicts as unknown as JSONValue } : {}),
      artifacts: artifacts as unknown as JSONValue,
      summary: agentPlanSummary(snapshot.tasks, workers, artifacts, nameConflicts) as unknown as JSONValue,
    }
  }

  private resolveSubagentWaitTarget(planId: string, input: Record<string, JSONValue>): {
    done: boolean
    status: 'completed' | 'failed' | 'cancelled' | 'blocked' | 'needs_review' | 'pending'
    target: Record<string, JSONValue>
  } {
    const runId = normalizeNonEmptyString(input.runId)
    const taskId = normalizeNonEmptyString(input.taskId)
    if (runId) {
      const run = this.requireRun(runId)
      if (run.planId !== planId) throw new Error(`run ${runId} does not belong to plan ${planId}`)
      return {
        done: isTerminalRunStatus(run.status),
        status: waitStatusFromRunStatus(run.status),
        target: { kind: 'run', run: this.toSubagentRunSummaryForPlan(run) as unknown as JSONValue },
      }
    }
    if (taskId) {
      const task = this.requireTask(taskId)
      if (task.planId !== planId) throw new Error(`task ${taskId} does not belong to plan ${planId}`)
      return {
        done: task.status === 'done' || task.status === 'failed' || task.status === 'cancelled' || task.status === 'blocked',
        status: waitStatusFromTaskStatus(task.status),
        target: {
          kind: 'task',
          task: {
            ...task,
            ...(subagentNameFromTask(task) ? { subagentName: subagentNameFromTask(task) } : {}),
          } as unknown as JSONValue,
        },
      }
    }
    const plan = this.requirePlan(planId)
    return {
      done: isTerminalPlanStatus(plan.status),
      status: waitStatusFromPlanStatus(plan.status),
      target: { kind: 'plan', plan: plan as unknown as JSONValue },
    }
  }

  private toSubagentRunSummaryForPlan(run: AgentRun): Record<string, JSONValue> {
    const summary = toSubagentRunSummary(run)
    if (summary.subagentName || !run.taskId) return summary
    const task = this.store.getTask(run.taskId)
    const subagentName = task ? subagentNameFromTask(task) : undefined
    return subagentName ? { ...summary, subagentName } : summary
  }

  private isRunCancelled(runId: string): boolean {
    return this.store.getRun(runId)?.status === 'cancelled'
  }

  private throwIfRunCancelled(runId: string, signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : createAbortError(typeof signal.reason === 'string' ? signal.reason : undefined)
    }
    if (this.isRunCancelled(runId)) {
      throw createAbortError('Run was cancelled.')
    }
  }

  private markRunCancelled(run: AgentRun, reason?: string): AgentRun {
    const current = this.store.getRun(run.id) ?? run
    if (current.status === 'cancelled') return current
    const now = isoNow()
    current.pendingApprovals = (current.pendingApprovals ?? []).map((approval) => (
      approval.status === 'pending'
        ? { ...approval, status: 'rejected', rejectedAt: now, updatedAt: now }
        : approval
    ))
    current.pendingInputRequests = (current.pendingInputRequests ?? []).map((request) => (
      request.status === 'pending'
        ? { ...request, status: 'cancelled', updatedAt: now }
        : request
    ))
    current.status = 'cancelled'
    current.cancelledAt = now
    current.completedAt = now
    current.updatedAt = now
    current.warnings = Array.from(new Set([...(current.warnings ?? []), reason ?? '用户停止了当前会话。']))
    this.recordTraceEvent(current, {
      kind: 'run',
      title: 'Run cancelled',
      summary: reason ?? '用户停止了当前会话。',
      status: 'info',
      data: { reason: reason ?? '用户停止了当前会话。' },
    })
    const thread = this.store.getThread(current.threadId)
    if (thread && !current.assistantMessageId) {
      const assistant = this.createMessage(thread.id, 'assistant', `已停止当前会话。\n\n${reason ?? '用户停止了当前会话。'}`, current.id)
      thread.messages.push(assistant)
      thread.updatedAt = assistant.createdAt
      this.applyThreadRunProjection(thread, current)
      current.assistantMessageId = assistant.id
      const step = this.createStep(current, 'message')
      step.status = 'completed'
      step.result = { messageId: assistant.id, cancelled: true }
      step.completedAt = now
      this.store.updateThread(thread)
    }
    this.store.updateRun(current)
    this.updateThreadRunStatus(current.threadId, current.status, current.id)
    this.emitRunSnapshot(current, { done: true })
    return current
  }

  private collectSubtreeRunIds(rootRunId: string): string[] {
    const result: string[] = []
    const visit = (runId: string) => {
      result.push(runId)
      for (const child of this.store.listChildRuns(runId)) visit(child.id)
    }
    visit(rootRunId)
    return result
  }

  private syncTaskFromRun(runId: string): void {
    const run = this.store.getRun(runId)
    if (!run?.planId || !run.taskId) return
    const task = this.store.getTask(run.taskId)
    if (!task) return
    const previousTask = { ...task, deps: [...task.deps], artifacts: [...task.artifacts] }
    const now = isoNow()
    if (run.status === 'completed' || run.status === 'completed_with_warnings') {
      task.status = 'done'
      task.progress = 1
      task.completedAt = run.completedAt ?? now
      task.artifacts = appendUniqueTaskArtifact(task.artifacts, {
        id: `artifact_${run.id}`,
        type: 'run',
        title: run.status === 'completed_with_warnings' ? 'Worker run completed with warnings' : 'Worker run completed',
        uri: `agent-run:${run.id}`,
        metadata: artifactProvenanceFromRun(run, 'worker_completion'),
        createdAt: run.completedAt ?? now,
      })
      for (const artifact of rollbackArtifactsFromRun(run, now)) {
        task.artifacts = appendUniqueTaskArtifact(task.artifacts, artifact)
      }
    } else if (run.status === 'requires_action') {
      const needsInput = run.pendingInputRequests?.some((request) => request.status === 'pending') === true
      task.status = 'blocked'
      task.progress = typeof run.progress === 'number' ? run.progress : Math.max(task.progress, 0.5)
      task.blockedReason = needsInput
        ? 'Worker run needs user input.'
        : 'Worker run needs approval.'
      task.metadata = {
        ...(task.metadata ?? {}),
        blockedKind: needsInput ? 'needs_input' : 'approval',
      }
    } else if (run.status === 'failed') {
      task.status = 'failed'
      task.blockedReason = run.error ?? 'Worker run failed.'
      task.failedAt = run.failedAt ?? now
    } else if (run.status === 'cancelled') {
      task.status = 'cancelled'
      task.blockedReason = run.warnings?.at(-1) ?? 'Worker run was cancelled.'
      task.cancelledAt = run.cancelledAt ?? now
    } else {
      return
    }
    task.updatedAt = now
    this.store.updateTask(task)
    this.recomputePlanStatus(run.planId)
    this.recordTaskProtocolEvents(task, previousTask)
    this.emitPlanTaskEvent(run.planId, task)
  }

  private cancelTimedOutPlanWorkers(planId: string, defaultTimeoutMs?: number): string[] {
    const nowMs = Date.now()
    const timedOutRunIds: string[] = []
    for (const run of this.store.listRuns({ planId, role: 'worker' })) {
      if (run.status !== 'queued' && run.status !== 'in_progress') continue
      const task = run.taskId ? this.store.getTask(run.taskId) : undefined
      const timeoutMs = taskExecutionWorkerTimeoutMs(task, defaultTimeoutMs)
      if (!timeoutMs) continue
      const startedAt = new Date(run.startedAt ?? run.createdAt).getTime()
      if (!Number.isFinite(startedAt) || nowMs - startedAt < timeoutMs) continue
      this.cancelRun(run.id, { reason: `Worker run timed out after ${timeoutMs}ms.` })
      this.syncTaskFromRun(run.id)
      const updatedTask = run.taskId ? this.store.getTask(run.taskId) : undefined
      if (updatedTask) {
        updatedTask.metadata = {
          ...(updatedTask.metadata ?? {}),
          timedOutRunId: run.id,
          workerTimeoutMs: timeoutMs,
          previousOwnerRunId: run.id,
          previousStatus: 'running',
        }
        updatedTask.updatedAt = isoNow()
        this.store.updateTask(updatedTask)
        this.emitPlanTaskEvent(planId, updatedTask)
      }
      timedOutRunIds.push(run.id)
    }
    return timedOutRunIds
  }

  private resetRetryablePlanTasks(planId: string, maxTaskAttempts: number): string[] {
    const retriedTaskIds: string[] = []
    const now = isoNow()
    for (const task of this.store.listTasks(planId)) {
      if (task.status !== 'failed' && task.status !== 'cancelled') continue
      const attempts = this.store.listRuns({ planId, taskId: task.id, role: 'worker' }).length
      const taskMaxAttempts = taskExecutionMaxTaskAttempts(task, maxTaskAttempts)
      if (attempts >= taskMaxAttempts) continue
      const previousTask = { ...task, deps: [...task.deps], artifacts: [...task.artifacts] }
      task.status = 'pending'
      task.progress = 0
      task.metadata = {
        ...(task.metadata ?? {}),
        retryAttempt: attempts + 1,
        maxTaskAttempts: taskMaxAttempts,
        previousOwnerRunId: task.ownerRunId ?? null,
      }
      delete task.ownerRunId
      delete task.blockedReason
      task.updatedAt = now
      this.store.updateTask(task)
      this.recordTaskProtocolEvents(task, previousTask)
      this.emitPlanTaskEvent(planId, task)
      retriedTaskIds.push(task.id)
    }
    if (retriedTaskIds.length > 0) this.recomputePlanStatus(planId)
    return retriedTaskIds
  }

  private resetPlanTasksForReplan(planId: string, input: ReplanRunInput): string[] {
    const explicitTaskIds = new Set(normalizeStringList(input.resetTaskIds))
    const resetBlocked = input.resetBlocked === true
    const resetNeedsReview = input.resetNeedsReview === true
    const resetFailed = input.resetFailed === true
    const resetCancelled = input.resetCancelled === true
    const resetTaskIds: string[] = []
    if (explicitTaskIds.size === 0 && !resetBlocked && !resetNeedsReview && !resetFailed && !resetCancelled) return resetTaskIds

    const now = isoNow()
    for (const task of this.store.listTasks(planId)) {
      const shouldReset = explicitTaskIds.has(task.id)
        || (resetBlocked && task.status === 'blocked')
        || (resetNeedsReview && task.status === 'needs_review')
        || (resetFailed && task.status === 'failed')
        || (resetCancelled && task.status === 'cancelled')
      if (!shouldReset) continue
      if (task.status !== 'blocked' && task.status !== 'needs_review' && task.status !== 'failed' && task.status !== 'cancelled' && !explicitTaskIds.has(task.id)) continue
      const previousStatus = task.status
      const previousTask = { ...task, deps: [...task.deps], artifacts: [...task.artifacts] }
      task.status = 'pending'
      task.progress = 0
      task.metadata = {
        ...(task.metadata ?? {}),
        replannedAt: now,
        previousOwnerRunId: task.ownerRunId ?? null,
        previousStatus,
      }
      delete task.ownerRunId
      delete task.blockedReason
      delete task.startedAt
      delete task.completedAt
      delete task.failedAt
      delete task.cancelledAt
      task.updatedAt = now
      this.store.updateTask(task)
      this.recordTaskProtocolEvents(task, previousTask)
      this.emitPlanTaskEvent(planId, task)
      resetTaskIds.push(task.id)
    }
    return resetTaskIds
  }

  private normalizeReplanTaskInputsForPlan(planId: string, tasks: unknown, addTasks: unknown): {
    creates: CreatePlanTaskInput[]
    updates: UpdatePlanTaskInput[]
  } {
    const creates: CreatePlanTaskInput[] = [...normalizePlanTaskInputs(addTasks)]
    const updates: UpdatePlanTaskInput[] = []
    for (const item of normalizePlanTaskInputs(tasks)) {
      const taskId = normalizeNonEmptyString(item.id)
      const existing = taskId ? this.store.getTask(taskId) : undefined
      if (existing) {
        if (existing.planId !== planId) throw new Error(`task ${taskId} does not belong to plan ${planId}`)
        updates.push(item)
      } else {
        creates.push(item)
      }
    }
    return { creates, updates }
  }

  private buildReplanTasksToCreate(planId: string, inputs: CreatePlanTaskInput[], now: string): AgentTask[] {
    const tasksToCreate: AgentTask[] = []
    const requestedNames = new Map<string, string>()
    for (const input of inputs) {
      const subagentName = normalizeNonEmptyString(input.subagentName)
        ?? normalizeNonEmptyString(isRecord(input.metadata) ? input.metadata.subagentName : undefined)
      const task = buildAgentTask(planId, input, now)
      if (this.store.getTask(task.id)) throw new Error(`task already exists: ${task.id}`)
      if (tasksToCreate.some((item) => item.id === task.id)) throw new Error(`task already exists: ${task.id}`)
      if (subagentName) {
        requestedNames.set(task.id, subagentName)
        this.assertUniqueSubagentNameForTask(planId, task.id, subagentName, requestedNames)
      }
      tasksToCreate.push(task)
    }
    this.assertTaskGraphReferencesForCreate(planId, tasksToCreate)
    this.assertTaskParentHierarchyAcyclic(planId, new Map(tasksToCreate.map((task) => [task.id, task.parentId])))
    this.assertTaskGraphAcyclic(planId, new Map(tasksToCreate.map((task) => [task.id, task.deps])))
    return tasksToCreate
  }

  private normalizeAndValidateReplanTaskUpdates(
    planId: string,
    updates: UpdatePlanTaskInput[],
    tasksToCreate: AgentTask[],
  ): Array<{ taskId: string; update: UpdatePlanTaskInput }> {
    const tasksById = new Map<string, AgentTask>()
    for (const task of this.store.listTasks(planId)) tasksById.set(task.id, cloneTaskForValidation(task))
    for (const task of tasksToCreate) tasksById.set(task.id, cloneTaskForValidation(task))

    const normalized: Array<{ taskId: string; update: UpdatePlanTaskInput }> = []
    for (const update of updates) {
      const taskId = normalizeNonEmptyString(update.id)
      if (!taskId) throw new Error('task update id is required')
      const task = tasksById.get(taskId)
      if (!task) {
        const existing = this.store.getTask(taskId)
        if (existing && existing.planId !== planId) throw new Error(`task ${taskId} does not belong to plan ${planId}`)
        throw new Error(`task not found: ${taskId}`)
      }

      const ownerRunId = typeof update.ownerRunId === 'string' && update.ownerRunId.trim() ? update.ownerRunId.trim() : undefined
      if (ownerRunId) {
        const ownerRun = this.requireRun(ownerRunId)
        if (ownerRun.planId !== planId) throw new Error(`owner run ${ownerRunId} does not belong to plan ${planId}`)
        if (ownerRun.taskId && ownerRun.taskId !== task.id) throw new Error(`owner run ${ownerRunId} is attached to task ${ownerRun.taskId}, not task ${task.id}`)
      }

      const parentId = normalizeNonEmptyString(update.parentId)
      if (parentId) {
        this.assertTaskReferenceInTaskMap(planId, tasksById, parentId, 'parent task')
        if (parentId === task.id) throw new Error(`task ${task.id} cannot use itself as parent`)
        task.parentId = parentId
      } else if ('parentId' in update) {
        delete task.parentId
      }

      if (Array.isArray(update.deps)) {
        const deps = normalizeStringList(update.deps)
        for (const depId of deps) {
          this.assertTaskReferenceInTaskMap(planId, tasksById, depId, 'dependency task')
          if (depId === task.id) throw new Error(`task ${task.id} cannot depend on itself`)
        }
        task.deps = deps
      }

      if (isJSONRecord(update.metadata)) {
        task.metadata = { ...(task.metadata ?? {}), ...update.metadata }
      }

      normalized.push({ taskId, update })
    }

    this.assertSubagentNamesUniqueForTaskMap(planId, tasksById)
    this.assertTaskParentHierarchyAcyclic(planId, new Map(Array.from(tasksById.values()).map((task) => [task.id, task.parentId])))
    this.assertTaskGraphAcyclic(planId, new Map(Array.from(tasksById.values()).map((task) => [task.id, task.deps])))
    return normalized
  }

  private assertTaskGraphReferencesForCreate(planId: string, tasksToCreate: AgentTask[]): void {
    const createdIds = new Set(tasksToCreate.map((task) => task.id))
    for (const task of tasksToCreate) {
      const references = [
        ...(task.parentId ? [{ id: task.parentId, label: 'parent task' }] : []),
        ...task.deps.map((id) => ({ id, label: 'dependency task' })),
      ]
      for (const reference of references) {
        if (reference.id === task.id) {
          throw new Error(reference.label === 'parent task'
            ? `task ${task.id} cannot use itself as parent`
            : `task ${task.id} cannot depend on itself`)
        }
        if (createdIds.has(reference.id)) continue
        this.assertTaskReferenceInPlan(planId, reference.id, reference.label)
      }
    }
  }

  private assertTaskGraphAcyclic(planId: string, overrides: Map<string, string[]>): void {
    const depsByTaskId = new Map<string, string[]>()
    for (const task of this.store.listTasks(planId)) depsByTaskId.set(task.id, [...task.deps])
    for (const [taskId, deps] of overrides.entries()) depsByTaskId.set(taskId, [...deps])

    const visiting = new Set<string>()
    const visited = new Set<string>()
    const path: string[] = []
    const visit = (taskId: string): void => {
      if (visited.has(taskId)) return
      if (visiting.has(taskId)) {
        const start = path.indexOf(taskId)
        const cycle = [...path.slice(start >= 0 ? start : 0), taskId]
        throw new Error(`task dependency cycle detected: ${cycle.join(' -> ')}`)
      }
      visiting.add(taskId)
      path.push(taskId)
      for (const depId of depsByTaskId.get(taskId) ?? []) {
        if (depsByTaskId.has(depId)) visit(depId)
      }
      path.pop()
      visiting.delete(taskId)
      visited.add(taskId)
    }
    for (const taskId of depsByTaskId.keys()) visit(taskId)
  }

  private assertTaskParentHierarchyAcyclic(planId: string, overrides: Map<string, string | undefined>): void {
    const parentByTaskId = new Map<string, string | undefined>()
    for (const task of this.store.listTasks(planId)) parentByTaskId.set(task.id, task.parentId)
    for (const [taskId, parentId] of overrides.entries()) parentByTaskId.set(taskId, parentId)

    const visiting = new Set<string>()
    const visited = new Set<string>()
    const path: string[] = []
    const visit = (taskId: string): void => {
      if (visited.has(taskId)) return
      if (visiting.has(taskId)) {
        const start = path.indexOf(taskId)
        const cycle = [...path.slice(start >= 0 ? start : 0), taskId]
        throw new Error(`task parent cycle detected: ${cycle.join(' -> ')}`)
      }
      visiting.add(taskId)
      path.push(taskId)
      const parentId = parentByTaskId.get(taskId)
      if (parentId && parentByTaskId.has(parentId)) visit(parentId)
      path.pop()
      visiting.delete(taskId)
      visited.add(taskId)
    }
    for (const taskId of parentByTaskId.keys()) visit(taskId)
  }

  private recomputePlanStatus(planId: string): void {
    const plan = this.store.getPlan(planId)
    if (!plan) return
    const tasks = this.store.listTasks(planId)
    const now = isoNow()
    const previousStatus = plan.status
    const progress = tasks.length === 0
      ? plan.progress
      : tasks.reduce((sum, task) => sum + normalizeProgress(task.progress)!, 0) / tasks.length
    const statuses = new Set(tasks.map((task) => task.status))
    const nextStatus: AgentPlan['status'] =
      statuses.has('failed') ? 'failed'
        : statuses.has('cancelled') && tasks.every((task) => task.status === 'cancelled') ? 'cancelled'
          : statuses.has('blocked') ? 'blocked'
            : statuses.has('needs_review') ? 'needs_review'
              : tasks.length > 0 && tasks.every((task) => task.status === 'done') ? 'done'
                : statuses.has('running') ? 'running'
                  : tasks.length > 0 && tasks.every((task) => task.status === 'pending') ? 'pending'
                    : tasks.length > 0 ? 'running'
                      : plan.status
    plan.progress = Math.max(0, Math.min(1, progress))
    plan.status = nextStatus
    plan.updatedAt = now
    if (nextStatus === 'done' && !plan.completedAt) plan.completedAt = now
    if (nextStatus === 'failed' && !plan.failedAt) plan.failedAt = now
    if (nextStatus === 'cancelled' && !plan.cancelledAt) plan.cancelledAt = now
    const firstBlocked = tasks.find((task) => task.status === 'blocked' && task.blockedReason)
    if (firstBlocked?.blockedReason) plan.blockedReason = firstBlocked.blockedReason
    else delete plan.blockedReason
    this.store.updatePlan(plan)
    if (previousStatus !== 'done' && nextStatus === 'done') this.recordPlanCompletion(plan, tasks)
  }

  private recordPlanCompletion(plan: AgentPlan, tasks: AgentTask[]): void {
    const run = plan.rootRunId ? this.store.getRun(plan.rootRunId) : this.store.listRuns({ planId: plan.id, role: 'planner' })[0]
    if (!run) return
    this.recordTraceEvent(run, {
      kind: 'plan',
      title: 'Plan completed',
      summary: `${tasks.length} task(s) completed.`,
      status: 'completed',
      data: {
        eventType: 'plan_completed',
        planId: plan.id,
        taskCount: tasks.length,
        artifactCount: tasks.reduce((sum, task) => sum + task.artifacts.length, 0),
        completedTaskIds: tasks.map((task) => task.id),
      },
    })
  }

  private updateThreadRunStatus(threadId: string, status: AgentRun['status'], runId?: string): void {
    const thread = this.store.getThread(threadId)
    if (!thread) return
    if (runId) {
      thread.lastRunId = runId
      if (isActiveRunStatus(status)) thread.activeRunId = runId
      else if (thread.activeRunId === runId) delete thread.activeRunId
    }
    thread.lastRunStatus = status
    thread.status = threadStatusFromRunStatus(status)
    thread.updatedAt = isoNow()
    this.store.updateThread(thread)
  }

  private applyThreadRunProjection(thread: AgentThread, run: AgentRun): void {
    thread.lastRunId = run.id
    thread.lastRunStatus = run.status
    thread.status = threadStatusFromRunStatus(run.status)
    if (isActiveRunStatus(run.status)) thread.activeRunId = run.id
    else if (thread.activeRunId === run.id) delete thread.activeRunId
  }

  private formatFinalAssistantContent(
    userMessage: string,
    modelContent: string,
    toolResults: ToolCallOutcome[],
    warnings: string[],
    memories: AgentMemory[],
    run: AgentRun,
  ): string {
    const command = parseAgentCommand(userMessage)
    return renderLocalFinalAssistantContent({
      command,
      run,
      context: isRecord(run.metadata?.context) ? run.metadata.context : undefined,
      warnings,
      memories,
      toolResults,
      memoryStorePath: this.getMemoryStorePath(),
      modelContent,
    })
  }

  private getMemoryStorePath(): string | undefined {
    const store = this.memoryStore as { filePath?: unknown }
    return typeof store.filePath === 'string' ? store.filePath : undefined
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError'
  }
}

function normalizeDraftSource(value: unknown): Record<string, JSONValue> | undefined {
  if (!isJSONRecord(value)) return undefined
  const source: Record<string, JSONValue> = {
    ...(typeof value.entityType === 'string' ? { entityType: value.entityType } : {}),
    ...(typeof value.entityId === 'number' || typeof value.entityId === 'string' ? { entityId: value.entityId } : {}),
    ...(typeof value.pipelineNodeId === 'number' || typeof value.pipelineNodeId === 'string' ? { pipelineNodeId: value.pipelineNodeId } : {}),
    ...(typeof value.runId === 'string' ? { runId: value.runId } : {}),
    ...(typeof value.threadId === 'string' ? { threadId: value.threadId } : {}),
    ...(typeof value.userId === 'number' || typeof value.userId === 'string' ? { userId: value.userId } : {}),
    ...(typeof value.pageKey === 'string' ? { pageKey: value.pageKey } : {}),
    ...(typeof value.pageType === 'string' ? { pageType: value.pageType } : {}),
    ...(typeof value.pageRoute === 'string' ? { pageRoute: value.pageRoute } : {}),
    ...(typeof value.pageEntityType === 'string' ? { pageEntityType: value.pageEntityType } : {}),
    ...(typeof value.pageEntityId === 'number' || typeof value.pageEntityId === 'string' ? { pageEntityId: value.pageEntityId } : {}),
  }
  return Object.keys(source).length > 0 ? source : undefined
}

function isMessageRole(value: unknown): value is AgentMessageRole {
  return value === 'system' || value === 'user' || value === 'assistant'
}

function taskStatusProtocolEvent(task: AgentTask): {
  eventType: string
  title: string
  status: AgentTraceEvent['status']
} {
  const status = task.status
  if (status === 'running') return { eventType: 'task_started', title: 'Task started', status: 'started' }
  if (status === 'blocked') {
    const blockedKind = isRecord(task.metadata) && task.metadata.blockedKind === 'needs_input' ? 'needs_input' : 'blocked'
    return {
      eventType: blockedKind,
      title: blockedKind === 'needs_input' ? 'Task needs input' : 'Task blocked',
      status: 'blocked',
    }
  }
  if (status === 'needs_review') return { eventType: 'needs_review', title: 'Task needs review', status: 'blocked' }
  if (status === 'done') return { eventType: 'task_completed', title: 'Task completed', status: 'completed' }
  if (status === 'failed') return { eventType: 'task_failed', title: 'Task failed', status: 'failed' }
  if (status === 'cancelled') return { eventType: 'task_cancelled', title: 'Task cancelled', status: 'failed' }
  return { eventType: 'task_pending', title: 'Task pending', status: 'info' }
}

function buildRollbackMetadata(outcomes: ToolCallOutcome[]): { rollbackRecords?: JSONValue } {
  const rollbackRecords = outcomes.flatMap((outcome) => outcome.rollback ? [{
    call: outcome.call,
    rollback: outcome.rollback,
  }] : [])
  return rollbackRecords.length > 0 ? { rollbackRecords: rollbackRecords as unknown as JSONValue } : {}
}

function buildRequestedSubagentNameMap(input: Record<string, JSONValue>, taskIds: string[]): Map<string, string> {
  const result = new Map<string, string>()
  const singleTaskId = normalizeNonEmptyString(input.taskId)
  const singleName = normalizeNonEmptyString(input.subagentName)
  if (singleTaskId && singleName) result.set(singleTaskId, singleName)
  if (singleName && taskIds.length === 1) result.set(taskIds[0]!, singleName)
  if (isRecord(input.subagentNames)) {
    for (const [taskId, value] of Object.entries(input.subagentNames)) {
      const name = normalizeNonEmptyString(value)
      if (name) result.set(taskId, name)
    }
  }
  const names = normalizeStringList(input.subagentNames)
  taskIds.forEach((taskId, index) => {
    const name = names[index]
    if (name) result.set(taskId, name)
  })
  return result
}

function normalizeSubagentNameAt(value: unknown, index: number): string | undefined {
  return normalizeStringList(value)[index]
}

const DEFAULT_SUBAGENT_NAMES = [
  '爱因斯坦',
  '霍金',
  '图灵',
  '居里',
  '费曼',
  '冯诺依曼',
  '达尔文',
  '牛顿',
  '伽利略',
  '开普勒',
] as const

function nextSubagentName(used: Set<string>): string {
  for (const name of DEFAULT_SUBAGENT_NAMES) {
    if (!used.has(name)) return name
  }
  let index = DEFAULT_SUBAGENT_NAMES.length + 1
  while (used.has(`子代理${index}`)) index += 1
  return `子代理${index}`
}

function subagentNameFromTask(task: AgentTask): string | undefined {
  const metadata = isRecord(task.metadata) ? task.metadata : undefined
  return normalizeNonEmptyString(metadata?.subagentName)
}

function subagentNameFromRun(run: AgentRun): string | undefined {
  const metadata = isRecord(run.metadata) ? run.metadata : undefined
  return normalizeNonEmptyString(metadata?.subagentName)
}

function subagentNameConflicts(tasks: AgentTask[]): Array<{ subagentName: string; taskIds: string[] }> {
  const byName = new Map<string, string[]>()
  for (const task of tasks) {
    const subagentName = subagentNameFromTask(task)
    if (!subagentName) continue
    byName.set(subagentName, [...(byName.get(subagentName) ?? []), task.id])
  }
  return Array.from(byName.entries())
    .filter(([, taskIds]) => taskIds.length > 1)
    .map(([subagentName, taskIds]) => ({ subagentName, taskIds }))
    .sort((a, b) => a.subagentName.localeCompare(b.subagentName))
}

function cloneTaskForValidation(task: AgentTask): AgentTask {
  return {
    ...task,
    deps: [...task.deps],
    artifacts: [...task.artifacts],
    ...(task.metadata ? { metadata: { ...task.metadata } } : {}),
  }
}

type AgentPlanArtifactReference = NonNullable<AgentDebugContextPanel['agentPlan']>['artifacts'][number]
type AgentPlanContextSummary = AgentPlanSummary

function taskArtifactReferences(tasks: AgentTask[], tasksById = new Map(tasks.map((task) => [task.id, task]))): AgentPlanArtifactReference[] {
  return tasks.flatMap((task) => task.artifacts.map((artifact) => {
    const metadata = isRecord(artifact.metadata) ? artifact.metadata : undefined
    const sourceTaskId = typeof metadata?.sourceTaskId === 'string' ? metadata.sourceTaskId : undefined
    const sourceTask = sourceTaskId ? tasksById.get(sourceTaskId) : undefined
    return {
      id: artifact.id,
      type: artifact.type,
      taskId: task.id,
      ...(artifact.title ? { title: artifact.title } : {}),
      ...(artifact.uri ? { uri: artifact.uri } : {}),
      ...(subagentNameFromTask(task) ? { subagentName: subagentNameFromTask(task) } : {}),
      ...(typeof metadata?.sourceRunId === 'string' ? { sourceRunId: metadata.sourceRunId } : {}),
      ...(sourceTaskId ? { sourceTaskId } : {}),
      ...(sourceTask?.title ? { sourceTaskTitle: sourceTask.title } : {}),
      ...(sourceTask?.status ? { sourceTaskStatus: sourceTask.status } : {}),
      ...(sourceTask?.ownerRunId ? { sourceTaskOwnerRunId: sourceTask.ownerRunId } : {}),
      ...(typeof metadata?.toolName === 'string' ? { toolName: metadata.toolName } : {}),
      ...(typeof metadata?.policy === 'string' ? { policy: metadata.policy } : {}),
    }
  }))
}

function agentPlanSummary(
  tasks: AgentTask[],
  workers: Array<{ status?: AgentRun['status'] }>,
  artifacts: AgentPlanArtifactReference[],
  nameConflicts: Array<{ subagentName: string; taskIds: string[] }>,
): AgentPlanContextSummary {
  const taskStatusCounts = {
    pending: 0,
    running: 0,
    blocked: 0,
    needs_review: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
  } satisfies Record<AgentTask['status'], number>
  for (const task of tasks) taskStatusCounts[task.status] += 1
  const activeWorkerCount = workers.filter((worker) => worker.status && isActiveRunStatus(worker.status)).length
  const blockedTaskIds = tasks.filter((task) => task.status === 'blocked').map((task) => task.id)
  const needsReviewTaskIds = tasks.filter((task) => task.status === 'needs_review').map((task) => task.id)
  const failedTaskIds = tasks.filter((task) => task.status === 'failed').map((task) => task.id)
  return {
    taskCount: tasks.length,
    taskStatusCounts,
    workerCount: workers.length,
    activeWorkerCount,
    artifactCount: artifacts.length,
    nameConflictCount: nameConflicts.length,
    blockedTaskIds,
    needsReviewTaskIds,
    failedTaskIds,
  }
}

function toSubagentRunSummary(run: AgentRun): Record<string, JSONValue> {
  const subagentName = subagentNameFromRun(run)
  return {
    id: run.id,
    ...(subagentName ? { subagentName } : {}),
    threadId: run.threadId,
    status: run.status,
    ...(run.role ? { role: run.role } : {}),
    ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
    ...(run.planId ? { planId: run.planId } : {}),
    ...(run.taskId ? { taskId: run.taskId } : {}),
    ...(typeof run.progress === 'number' ? { progress: run.progress } : {}),
    ...(run.blockedReason ? { blockedReason: run.blockedReason } : {}),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.failedAt ? { failedAt: run.failedAt } : {}),
    ...(run.cancelledAt ? { cancelledAt: run.cancelledAt } : {}),
    ...(run.error ? { error: run.error } : {}),
    ...(run.warnings?.length ? { warnings: run.warnings } : {}),
    stepCount: run.steps.length,
    pendingApprovalCount: (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending').length,
    pendingInputCount: (run.pendingInputRequests ?? []).filter((request) => request.status === 'pending').length,
  }
}

function rollbackArtifactsFromRun(run: AgentRun, now: string): AgentTaskArtifact[] {
  const metadata = isRecord(run.metadata) ? run.metadata : undefined
  const records = Array.isArray(metadata?.rollbackRecords) ? metadata.rollbackRecords : []
  return records.flatMap((record, index) => {
    if (!isRecord(record)) return []
    const rollback = isRecord(record.rollback) ? record.rollback : undefined
    if (!rollback) return []
    const policy = typeof rollback?.policy === 'string' ? rollback.policy : undefined
    if (!policy || policy === 'not_applicable') return []
    return [{
      id: `rollback_${run.id}_${index}`,
      type: 'rollback-policy',
      title: policy === 'manual_compensation' ? 'Manual rollback required' : 'Rollback policy recorded',
      uri: typeof rollback.artifactUri === 'string' ? rollback.artifactUri : `agent-run:${run.id}#rollback-${index}`,
      metadata: {
        ...artifactProvenanceFromRun(run, 'rollback_policy'),
        policy,
        ...(typeof rollback.reason === 'string' ? { reason: rollback.reason } : {}),
        ...(isRecord(record.call) && typeof record.call.name === 'string' ? { toolName: record.call.name } : {}),
      },
      createdAt: now,
    }]
  })
}

function artifactProvenanceFromRun(run: AgentRun, createdFrom: string): Record<string, JSONValue> {
  const subagentName = subagentNameFromRun(run)
  return {
    createdFrom,
    sourceRunId: run.id,
    threadId: run.threadId,
    runStatus: run.status,
    ...(run.role ? { sourceRunRole: run.role } : {}),
    ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
    ...(run.planId ? { planId: run.planId } : {}),
    ...(run.taskId ? { sourceTaskId: run.taskId } : {}),
    ...(subagentName ? { subagentName } : {}),
  }
}

function assistantDeltaFromTraceEvent(event: AgentTraceEvent): Omit<Extract<AgentRunStreamEvent, { type: 'assistant_delta' }>, 'runId' | 'traceEventId' | 'createdAt' | 'run'> | undefined {
  const data = isRecord(event.data) ? event.data : undefined
  const stream = isRecord(data?.stream) ? data.stream : undefined
  if (stream?.kind !== 'content') return undefined
  const delta = typeof stream.delta === 'string' ? stream.delta : ''
  if (!delta) return undefined
  const accumulated = typeof stream.accumulated === 'string' ? stream.accumulated : delta
  return {
    type: 'assistant_delta',
    delta,
    accumulated,
    ...(typeof event.roundIndex === 'number' ? { roundIndex: event.roundIndex } : {}),
    ...(typeof event.roundLabel === 'string' ? { roundLabel: event.roundLabel } : {}),
  }
}

function assistantMessageFromTraceEvent(thread: AgentThread | undefined, event: AgentTraceEvent): AgentMessage | undefined {
  if (!thread || event.kind !== 'assistant') return undefined
  const data = isRecord(event.data) ? event.data : undefined
  const messageId = typeof data?.messageId === 'string' ? data.messageId : undefined
  if (!messageId) return undefined
  return thread.messages.find((message) => message.id === messageId && message.role === 'assistant')
}

function assistantMessageForRun(thread: AgentThread | undefined, run: AgentRun): AgentMessage | undefined {
  if (!thread) return undefined
  if (run.assistantMessageId) {
    const message = thread.messages.find((item) => item.id === run.assistantMessageId && item.role === 'assistant')
    if (message) return message
  }
  return [...thread.messages].reverse().find((message) => message.role === 'assistant' && message.runId === run.id)
}

function isTerminalRunStatus(status: AgentRun['status']): boolean {
  return status === 'completed' || status === 'completed_with_warnings' || status === 'requires_action' || status === 'failed' || status === 'cancelled'
}

function isTerminalPlanStatus(status: AgentPlan['status']): boolean {
  return status === 'done' || status === 'failed' || status === 'cancelled'
}

function waitStatusFromRunStatus(status: AgentRun['status']): 'completed' | 'failed' | 'cancelled' | 'blocked' | 'pending' {
  if (status === 'completed' || status === 'completed_with_warnings') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'requires_action') return 'blocked'
  return 'pending'
}

function waitStatusFromTaskStatus(status: AgentTask['status']): 'completed' | 'failed' | 'cancelled' | 'blocked' | 'needs_review' | 'pending' {
  if (status === 'done') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'blocked') return 'blocked'
  if (status === 'needs_review') return 'needs_review'
  return 'pending'
}

function waitStatusFromPlanStatus(status: AgentPlan['status']): 'completed' | 'failed' | 'cancelled' | 'blocked' | 'needs_review' | 'pending' {
  if (status === 'done') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'blocked') return 'blocked'
  if (status === 'needs_review') return 'needs_review'
  return 'pending'
}

function extractFocusTimings(value: unknown): { totalMs?: number; focusMs?: number } | undefined {
  const parsed = parseToolResult(value as JSONValue)
  if (!isRecord(parsed) || !isRecord(parsed.timings)) return undefined
  const timings = parsed.timings
  const result: { totalMs?: number; focusMs?: number } = {}
  if (typeof timings.totalMs === 'number' && Number.isFinite(timings.totalMs)) result.totalMs = timings.totalMs
  if (typeof timings.focusMs === 'number' && Number.isFinite(timings.focusMs)) {
    result.focusMs = timings.focusMs
  } else if (typeof timings.totalMs === 'number' && Number.isFinite(timings.totalMs)) {
    result.focusMs = timings.totalMs
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function isFinishedRunStatus(status: AgentRun['status']): boolean {
  return status === 'completed' || status === 'completed_with_warnings' || status === 'failed'
}

function isFinishedOrCancelledRunStatus(status: AgentRun['status']): boolean {
  return isFinishedRunStatus(status) || status === 'cancelled'
}

function isActiveRunStatus(status: AgentRun['status']): boolean {
  return status === 'queued' || status === 'in_progress' || status === 'requires_action'
}

function threadStatusFromRunStatus(status: AgentRun['status']): AgentThread['status'] {
  if (status === 'queued' || status === 'in_progress') return 'running'
  if (status === 'requires_action') return 'requires_action'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  return 'completed'
}

function toStreamRun(run: AgentRun): AgentRunStreamRun {
  return {
    id: run.id,
    threadId: run.threadId,
    status: run.status,
    ...(run.role ? { role: run.role } : {}),
    ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
    ...(run.planId ? { planId: run.planId } : {}),
    ...(run.taskId ? { taskId: run.taskId } : {}),
    ...(typeof run.progress === 'number' ? { progress: run.progress } : {}),
    ...(run.blockedReason ? { blockedReason: run.blockedReason } : {}),
    agentManifest: run.agentManifest,
    policy: run.policy,
    ...(run.pendingApprovals ? { pendingApprovals: run.pendingApprovals } : {}),
    ...(run.pendingInputRequests ? { pendingInputRequests: run.pendingInputRequests } : {}),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.failedAt ? { failedAt: run.failedAt } : {}),
    ...(run.cancelledAt ? { cancelledAt: run.cancelledAt } : {}),
    ...(run.error ? { error: run.error } : {}),
    ...(run.warnings ? { warnings: run.warnings } : {}),
    ...(run.assistantMessageId ? { assistantMessageId: run.assistantMessageId } : {}),
    steps: run.steps.map((step) => ({
      id: step.id,
      runId: step.runId,
      type: step.type,
      status: step.status,
      ...(step.roundId ? { roundId: step.roundId } : {}),
      ...(step.roundIndex !== undefined ? { roundIndex: step.roundIndex } : {}),
      ...(step.roundLabel ? { roundLabel: step.roundLabel } : {}),
      ...(step.roundSource ? { roundSource: step.roundSource } : {}),
      ...(step.title ? { title: step.title } : {}),
    ...(step.toolName ? { toolName: step.toolName } : {}),
    ...(step.error ? { error: step.error } : {}),
    ...(step.errorData !== undefined ? { errorData: step.errorData } : {}),
    ...(step.sandboxed ? { sandboxed: step.sandboxed } : {}),
    ...(typeof step.durationMs === 'number' ? { durationMs: step.durationMs } : {}),
    createdAt: step.createdAt,
    ...(step.completedAt ? { completedAt: step.completedAt } : {}),
  })),
    traceEvents: [],
    streamPartial: true,
  }
}

function toProductRun(run: AgentRun): AgentRun {
  return {
    ...run,
    traceEvents: [],
  }
}

function normalizeRunHierarchyInput(input: {
  role?: unknown
  parentRunId?: unknown
  planId?: unknown
  taskId?: unknown
  progress?: unknown
  blockedReason?: unknown
}, options: { defaultRole?: AgentRunRole } = {}): {
  role?: AgentRunRole
  parentRunId?: string
  planId?: string
  taskId?: string
  progress?: number
  blockedReason?: string
} {
  const role = normalizeRunRole(input.role) ?? options.defaultRole
  const parentRunId = normalizeNonEmptyString(input.parentRunId)
  const planId = normalizeNonEmptyString(input.planId)
  const taskId = normalizeNonEmptyString(input.taskId)
  const progress = normalizeProgress(input.progress)
  const blockedReason = normalizeNonEmptyString(input.blockedReason)
  return {
    ...(role ? { role } : {}),
    ...(parentRunId ? { parentRunId } : {}),
    ...(planId ? { planId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(progress !== undefined ? { progress } : {}),
    ...(blockedReason ? { blockedReason } : {}),
  }
}

function normalizeRunRole(value: unknown): AgentRunRole | undefined {
  return value === 'planner' || value === 'worker' ? value : undefined
}

function normalizeTaskStatus(value: unknown): AgentTask['status'] | undefined {
  return value === 'pending'
    || value === 'running'
    || value === 'blocked'
    || value === 'needs_review'
    || value === 'done'
    || value === 'failed'
    || value === 'cancelled'
    ? value
    : undefined
}

function normalizeProgress(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return undefined
  return Math.max(0, Math.min(1, number))
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return undefined
  return Math.max(1, Math.floor(number))
}

function taskExecutionOverrideMetadata(input: CreatePlanTaskInput): Record<string, JSONValue> {
  const maxTaskAttempts = normalizePositiveInteger(input.maxTaskAttempts)
  const workerTimeoutMs = normalizePositiveInteger(input.workerTimeoutMs)
  return {
    ...(maxTaskAttempts ? { maxTaskAttempts } : {}),
    ...(workerTimeoutMs ? { workerTimeoutMs } : {}),
  }
}

function taskExecutionMaxTaskAttempts(task: AgentTask, defaultMaxTaskAttempts: number): number {
  return normalizePositiveInteger(task.metadata?.maxTaskAttempts) ?? defaultMaxTaskAttempts
}

function taskExecutionWorkerTimeoutMs(task: AgentTask | undefined, defaultTimeoutMs?: number): number | undefined {
  return normalizePositiveInteger(task?.metadata?.workerTimeoutMs) ?? defaultTimeoutMs
}

function formatWorkerTaskMessage(plan: AgentPlan, task: AgentTask): string {
  return [
    `Plan: ${plan.title}`,
    subagentNameFromTask(task) ? `Subagent name: ${subagentNameFromTask(task)}` : undefined,
    `Task: ${task.title}`,
    task.description ? `Description: ${task.description}` : undefined,
    task.deps.length > 0 ? `Dependencies: ${task.deps.join(', ')}` : undefined,
    '',
    'Execute this worker task and report durable artifacts, blockers, and completion status.',
  ].filter((line): line is string => line !== undefined).join('\n')
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : [])
}

function normalizePlanTaskInputs(value: unknown): CreatePlanTaskInput[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => isRecord(item) ? [item] : [])
}

function selectPlannerInlineTask(tasks: AgentTask[]): AgentTask | undefined {
  if (tasks.length !== 1) return undefined
  const task = tasks[0]
  if (!task || task.deps.length > 0 || task.parentId) return undefined
  const metadata = isRecord(task.metadata) ? task.metadata : undefined
  if (metadata?.executionMode === 'worker') return undefined
  return task
}

function normalizePlanTaskUpdateInputs(value: unknown): UpdatePlanTaskInput[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => isRecord(item) ? [item] : [])
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}

function buildAgentTask(planId: string, input: CreatePlanTaskInput, now: string): AgentTask {
  const title = normalizeNonEmptyString(input.title)
  if (!title) throw new Error('task title is required')
  const metadata = {
    ...(isJSONRecord(input.metadata) ? input.metadata : {}),
    ...taskExecutionOverrideMetadata(input),
  }
  return {
    id: normalizeNonEmptyString(input.id) ?? makeId('task'),
    planId,
    ...(normalizeNonEmptyString(input.parentId) ? { parentId: normalizeNonEmptyString(input.parentId) } : {}),
    deps: normalizeStringList(input.deps),
    title,
    ...(normalizeNonEmptyString(input.description) ? { description: normalizeNonEmptyString(input.description) } : {}),
    status: 'pending',
    progress: 0,
    artifacts: [],
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeTaskArtifacts(value: unknown, now: string): AgentTaskArtifact[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const type = normalizeNonEmptyString(item.type)
    if (!type) return []
    return [{
      id: normalizeNonEmptyString(item.id) ?? makeId('artifact'),
      type,
      ...(normalizeNonEmptyString(item.title) ? { title: normalizeNonEmptyString(item.title) } : {}),
      ...(normalizeNonEmptyString(item.uri) ? { uri: normalizeNonEmptyString(item.uri) } : {}),
      ...(isJSONRecord(item.metadata) ? { metadata: item.metadata } : {}),
      createdAt: normalizeNonEmptyString(item.createdAt) ?? now,
    }]
  })
}

function appendUniqueTaskArtifact(artifacts: AgentTaskArtifact[], artifact: AgentTaskArtifact): AgentTaskArtifact[] {
  if (artifacts.some((item) => item.id === artifact.id)) return artifacts
  return [...artifacts, artifact]
}

function isBlockingCatalogIssue(issue: { level: string; code: string; resourceId?: string }): boolean {
  if (issue.level !== 'error') return false
  if (issue.resourceId === 'movscript.profile.default') return false
  return true
}

function normalizeCatalogInspectView(value: unknown): 'summary' | 'pack' | 'skill' | 'tool' | 'profile' {
  if (value === 'pack' || value === 'skill' || value === 'tool' || value === 'profile') return value
  return 'summary'
}

function activeSkillIdsFromRun(run: AgentRun): string[] {
  const event = [...(run.traceEvents ?? [])].reverse().find((item) => item.title === 'Runtime context resolved' || item.title === 'Runtime context resolved from fallback')
  const data = isRecord(event?.data) ? event.data : undefined
  const raw = Array.isArray(data?.skills) ? data.skills : []
  return raw.flatMap((item) => isRecord(item) && typeof item.id === 'string' ? [item.id] : [])
}

function collectCatalogPackClosure(ids: string[], packs: Map<string, CapabilityPack>): string[] {
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visited.has(id)) return
    visited.add(id)
    const pack = packs.get(id)
    if (!pack) return
    for (const required of Object.keys(pack.requires?.packs ?? {})) visit(required)
  }
  for (const id of ids) visit(id)
  return Array.from(visited)
}

function summarizeCatalogProfile(profile: AgentProfile): JSONValue {
  return {
    id: profile.id,
    version: profile.version,
    name: profile.name,
    ...(profile.description ? { description: profile.description } : {}),
    enabledPacks: profile.enabledPacks,
    persona: profile.persona,
    enabledPolicies: profile.enabledPolicies,
    enabledWorkflows: profile.enabledWorkflows,
    toolGrants: profile.toolGrants.map((grant) => ({
      name: grant.name,
      mode: grant.mode,
      ...(grant.approval ? { approval: grant.approval } : {}),
    })),
    ...(profile.limits ? { limits: profile.limits as unknown as JSONValue } : {}),
  }
}

function summarizeCatalogPack(pack: CapabilityPack): JSONValue {
  return {
    id: pack.id,
    version: pack.version,
    name: pack.name,
    ...(pack.description ? { description: pack.description } : {}),
    source: pack.source,
    skills: pack.skills,
    tools: pack.tools,
    schemas: pack.schemas,
    ...(pack.requires ? { requires: pack.requires as unknown as JSONValue } : {}),
    ...(pack.conflicts ? { conflicts: pack.conflicts } : {}),
  }
}

function summarizeCatalogSkill(skill: SkillDefinition, includeInstruction: boolean): JSONValue {
  return {
    id: skill.id,
    kind: skill.kind,
    version: skill.version,
    name: skill.name,
    description: skill.description,
    priority: skill.priority,
    enabled: skill.enabled,
    ...(skill.kind === 'workflow' ? {
      triggers: skill.triggers as unknown as JSONValue,
      toolRefs: skill.toolRefs,
      ...(skill.toolScope ? { toolScope: skill.toolScope } : {}),
    } : {}),
    ...(skill.kind !== 'workflow' && skill.toolRefs ? { toolRefs: skill.toolRefs } : {}),
    ...(skill.schemaRefs ? { schemaRefs: skill.schemaRefs } : {}),
    ...(skill.outputContract ? { outputContract: skill.outputContract } : {}),
    ...(includeInstruction ? { instructionTemplate: skill.instructionTemplate } : {}),
  }
}

function summarizeCatalogTool(tool: ToolDefinition, includeSchema: boolean): JSONValue {
  return {
    name: tool.name,
    description: tool.description,
    permission: tool.permission,
    risk: tool.risk,
    projectScoped: tool.projectScoped,
    defaults: tool.defaults,
    source: tool.source,
    ...(tool.capability ? { capability: tool.capability } : {}),
    ...(tool.errorCodes ? { errorCodes: tool.errorCodes } : {}),
    ...(tool.allowedRunRoles ? { allowedRunRoles: tool.allowedRunRoles } : {}),
    ...(tool.availability ? { availability: tool.availability as unknown as JSONValue } : {}),
    ...(includeSchema ? { inputSchema: tool.inputSchema as unknown as JSONValue } : {}),
    ...(includeSchema && tool.outputSchema ? { outputSchema: tool.outputSchema as unknown as JSONValue } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isJSONRecord(value: unknown): value is Record<string, JSONValue> {
  if (!isRecord(value)) return false
  return Object.values(value).every(isJSONValue)
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  return isJSONRecord(value)
}

function generationBackendErrorData(error: unknown): JSONValue | undefined {
  if (!(error instanceof MCPError)) return undefined
  const data = error.data
  if (!isJSONRecord(data)) return undefined
  if (data.type !== 'backend_http_error' || data.status !== 400 || typeof data.code !== 'string') return undefined
  return data
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function isoNow(): string {
  return new Date().toISOString()
}

function durationBetweenMs(start: string, end: string): number | undefined {
  const startedAt = new Date(start).getTime()
  const completedAt = new Date(end).getTime()
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) return undefined
  const durationMs = completedAt - startedAt
  return durationMs >= 0 && Number.isFinite(durationMs) ? durationMs : undefined
}

function createAbortError(message = 'Run was cancelled.'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}
