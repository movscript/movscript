import type { MCPClient } from '../mcpClient.js'
import type { JSONValue } from '../types.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import {
  InMemoryAgentCatalogStateStore,
  type AgentCatalogStateStore,
} from '../catalog/state.js'
import { loadAgentPluginCatalog, type AgentPluginCatalog } from '../catalog/loader.js'
import { MemoryManager } from '../memory/memoryManager.js'
import { InMemoryAgentMemoryStore, type AgentMemoryStore } from '../memory/memoryStore.js'
import type { AgentMemory, MemoryQuery } from '../memory/types.js'
import { KnowledgeManager, loadAgentKnowledgeStore } from '../knowledge/index.js'
import { InMemoryAgentStore, type AgentStore, type AgentTraceQuery } from '../state/store.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import {
  InMemoryAgentDraftStore,
  type AgentDraft,
  type AgentDraftStore,
} from '../drafts/draftStore.js'
import { type ApplyDraftInput } from '../drafts/draftApply.js'
import { BackendApplyClient } from '../drafts/backendApplyClient.js'
import { MCPBackendApplyClient } from '../drafts/mcpBackendApplyClient.js'
import { generatePlanTasks } from '../orchestration/planGenerator.js'
import {
  applyRuntimeThreadContextSummary,
} from '../context/runtimeThreadContextSummary.js'
import {
  EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
  type AgentRuntimeContractResolver,
} from '../contracts/runtimeContract.js'
import {
  isActiveRunStatus,
} from '../state/runProjection.js'
import { defaultRunPolicy } from '../state/runPolicy.js'
import { buildRunRound, type AgentRunRoundInfo } from '../state/runRound.js'
import {
  subagentNameFromRun,
} from '../state/subagentIdentity.js'
import { RuntimeRunControllerRegistry } from './runLifecycleControl.js'
import { numberField } from './runtimeScalarInput.js'
import { RuntimeRunAuthRegistry } from './runAuth.js'
import {
  applyRuntimeAgentPlanCreationToolFlow,
  applyRuntimeAgentReplanToolFlow,
  getRuntimeAgentPlan,
} from './runtimeAgentPlanTools.js'
import {
  requireRuntimePlan,
  requireRuntimeRun,
  requireRuntimeTask,
  requireRuntimeThread,
} from './runtimeStoreLookup.js'
import {
  applyRuntimeSubagentCancellationFlow,
} from './runtimeSubagentTaskCancellation.js'
import { updateRuntimeThreadRunStatus } from './runtimeThreadProjection.js'
import {
  applyRuntimePlanCreationRequest,
} from './runtimePlanCreation.js'
import {
  createRuntimePlanStatusBridge,
  type RuntimePlanStatusBridge,
} from './runtimePlanStatusBridge.js'
import {
  getRuntimePlan,
  getRuntimeTaskTree,
  listRuntimePlans,
} from './runtimePlanRead.js'
import { getRuntimePlanSnapshot } from './runtimePlanSnapshot.js'
import {
  getRuntimeChildRuns,
  getRuntimeRun,
  listRuntimeRuns,
  listRuntimeRunsByParent,
} from './runtimeRunProjection.js'
import {
  addRuntimeThreadMessage,
  createRuntimeThread,
  updateRuntimeThread,
} from './runtimeThreadLifecycle.js'
import {
  getRuntimeThread,
  listRuntimeThreads,
  listRuntimeThreadSummaries,
} from './runtimeThreadRead.js'
import {
  createRuntimeTaskRunSyncBridge,
  type RuntimeTaskRunSyncBridge,
} from './runtimeTaskRunSyncBridge.js'
import { applyRuntimeTaskUpdateRequest } from './runtimeTaskUpdate.js'
import { resolveRuntimeAgentManifest } from './runtimeManifest.js'
import { RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'
import {
  createRuntimeCatalogSnapshotBridge,
  type RuntimeCatalogSnapshotBridge,
} from './runtimeCatalogSnapshotBridge.js'
import { resolveRuntimeCatalogInitialization } from './runtimeCatalogInitialization.js'
import {
  getRuntimeDefaultAgentManifest,
  inspectRuntimeAgentCatalog,
  listRuntimeRegisteredTools,
  listRuntimeSkillCatalog,
} from './runtimeCatalogRead.js'
import { applyRuntimeAgentCatalogReload } from './runtimeCatalogReload.js'
import { resolveRuntimeCapabilities } from './runtimeCapabilities.js'
import {
  applyRuntimeRunApprovalRequest,
  applyRuntimeRunInputAnswerRequest,
  applyRuntimeRunRejectionRequest,
} from './runtimeRunInteraction.js'
import {
  listRuntimeSubagents,
  waitRuntimeSubagent,
} from './runtimeSubagentRead.js'
import {
  applyRuntimeSubagentSpawnFlow,
  prepareRuntimeSubagentSpawn,
} from './runtimeSubagentSpawn.js'
import {
  applyRuntimePlanDispatchRequest,
} from './runtimePlanDispatch.js'
import { applyRuntimePlanTreeCancellationRequest } from './runtimePlanTreeCancellation.js'
import {
  applyRuntimeReplanRunRequest,
} from './runtimeReplanPreparation.js'
import {
  applyRuntimeRunCancellationRequest,
  applyRuntimeSubtreeCancellationRequest,
} from './runtimeRunCancellation.js'
import {
  createRuntimeRunCancellationBridge,
  type RuntimeRunCancellationBridge,
} from './runtimeRunCancellationBridge.js'
import {
  createRuntimeRunCancellationGuard,
  type RuntimeRunCancellationGuard,
} from './runtimeRunCancellationGuard.js'
import {
  applyRuntimeCreateRunRequest,
  applyRuntimeCreateToolRunRequest,
} from './runtimeRunCreation.js'
import { prepareRuntimeRunThread } from './runtimeRunThread.js'
import { prepareRuntimeToolRunThread } from './runtimeToolRunThread.js'
import {
  createRuntimeRunStepBridge,
  type RuntimeRunStepBridge,
} from './runtimeRunStepBridge.js'
import {
  createRuntimeRunExecutionSchedulerBridge,
  type RuntimeRunExecutionSchedulerBridge,
} from './runtimeRunExecutionSchedulerBridge.js'
import {
  createRuntimeRunExecutionBridge,
  type RuntimeRunExecutionBridge,
} from './runtimeRunExecutionBridge.js'
import { buildRuntimeRunPreview } from './runtimeRunPreview.js'
import { RuntimeDeferredTaskRegistry } from './runtimeDeferredTasks.js'
import {
  createRuntimePostRunRecordsBridge,
  type RuntimePostRunRecordsBridge,
} from './runtimePostRunRecordsBridge.js'
import { createRuntimeTaskEventBridge } from './runtimeTaskEventBridge.js'
import {
  createRuntimeStreamBridge,
  type RuntimeStreamBridge,
} from './runtimeStreamBridge.js'
import {
  applyRuntimeDraftFromUI,
  createRuntimeLocalDraft,
  getRuntimeDraft,
  listRuntimeDrafts,
  patchRuntimeDraft,
  previewRuntimeDraftApply,
  rejectRuntimeDraft,
  simulateRuntimeDraftApply,
  updateRuntimeDraft,
  validateRuntimeDraft,
} from './runtimeDraftOperations.js'
import {
  createRuntimeMemory,
  deleteRuntimeMemory,
  getRuntimeMemory,
  listRuntimeMemories,
  listRuntimeMemorySummaries,
} from './runtimeMemoryOperations.js'
import { RuntimeEventSubscriberRegistry } from './runtimeEventSubscribers.js'
import { isoNow, makeId } from './runtimeIdentity.js'
import { buildRunTracePage, normalizeTracePageLimit } from '../state/runTrace.js'
import type {
  AgentApprovalRequest,
  AgentPlan,
  AgentPlanSnapshot,
  AgentPlanStreamEvent,
  AgentRunRole,
  AgentTask,
  AgentInputRequest,
  AgentMessage,
  AgentMessageRole,
  AgentRunPreview,
  AgentRun,
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
  UpdatePlanTaskInput,
  UpdateThreadInput,
} from '../state/types.js'
import { callModel } from '../model/modelClient.js'

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

export class AgentRuntime {
  private readonly mcpClient: Pick<MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  private readonly store: AgentStore
  private readonly draftStore: AgentDraftStore
  private readonly backendApplyClient: BackendApplyClient
  private readonly memoryStore: AgentMemoryStore
  private readonly memoryManager: MemoryManager
  private readonly knowledgeManager: KnowledgeManager
  private defaultAgentManifest: AgentManifest
  private toolRegistry: ToolRegistry
  private layeredRegistry: AgentPluginCatalog['layeredRegistry']
  private readonly contractResolver: AgentRuntimeContractResolver
  private pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  private pluginWarnings: string[]
  private readonly catalogSnapshotBridge: RuntimeCatalogSnapshotBridge
  private readonly catalogSnapshots: RuntimeCatalogSnapshotRegistry
  private readonly catalogStateStore: AgentCatalogStateStore
  private readonly pluginCatalogLoader?: NonNullable<AgentRuntimeOptions['pluginCatalogLoader']>
  private readonly updateState?: AgentCapabilitiesResponse['updates']
  private readonly runControllers = new RuntimeRunControllerRegistry()
  private readonly runAuth = new RuntimeRunAuthRegistry()
  private readonly runStreamSubscribers = new RuntimeEventSubscriberRegistry<AgentRunStreamEvent>()
  private readonly planStreamSubscribers = new RuntimeEventSubscriberRegistry<AgentPlanStreamEvent>()
  private readonly postRunRecordTasks = new RuntimeDeferredTaskRegistry()
  private readonly streams: RuntimeStreamBridge
  private readonly runSteps: RuntimeRunStepBridge
  private readonly planStatus: RuntimePlanStatusBridge
  private readonly postRunRecords: RuntimePostRunRecordsBridge
  private readonly runCancellation: RuntimeRunCancellationBridge
  private readonly taskRunSync: RuntimeTaskRunSyncBridge
  private readonly runExecution: RuntimeRunExecutionBridge
  private readonly runExecutionScheduler: RuntimeRunExecutionSchedulerBridge
  private readonly runCancellationGuard: RuntimeRunCancellationGuard

  constructor(options: AgentRuntimeOptions) {
    this.mcpClient = options.mcpClient
    this.store = options.store ?? new InMemoryAgentStore()
    this.draftStore = options.draftStore ?? new InMemoryAgentDraftStore()
    this.backendApplyClient = options.backendApplyClient ?? new MCPBackendApplyClient(this.mcpClient)
    this.memoryStore = options.memoryStore ?? new InMemoryAgentMemoryStore()
    this.memoryManager = new MemoryManager(this.memoryStore)
    this.knowledgeManager = new KnowledgeManager(loadAgentKnowledgeStore())
    const catalogInitialization = resolveRuntimeCatalogInitialization({
      defaultAgentManifest: options.defaultAgentManifest,
      toolRegistry: options.toolRegistry,
      pluginCatalog: options.pluginCatalog,
      pluginCatalogLoader: options.pluginCatalogLoader,
      pluginCatalogInfo: options.pluginCatalogInfo,
      pluginWarnings: options.pluginWarnings,
      loadCatalogSnapshot: loadAgentPluginCatalog,
    })
    this.defaultAgentManifest = catalogInitialization.defaultAgentManifest
    this.toolRegistry = catalogInitialization.toolRegistry
    this.layeredRegistry = catalogInitialization.layeredRegistry
    this.contractResolver = options.contractResolver ?? EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER
    this.pluginCatalogInfo = catalogInitialization.pluginCatalogInfo
    this.pluginWarnings = catalogInitialization.pluginWarnings
    this.catalogSnapshotBridge = createRuntimeCatalogSnapshotBridge({
      getCatalogState: () => ({
        defaultAgentManifest: this.defaultAgentManifest,
        toolRegistry: this.toolRegistry,
        layeredRegistry: this.layeredRegistry,
        pluginCatalogInfo: this.pluginCatalogInfo,
        pluginWarnings: this.pluginWarnings,
      }),
    })
    this.catalogSnapshots = new RuntimeCatalogSnapshotRegistry(this.catalogSnapshotBridge.createSnapshot())
    this.catalogStateStore = options.catalogStateStore ?? new InMemoryAgentCatalogStateStore()
    this.pluginCatalogLoader = options.pluginCatalogLoader
    this.updateState = options.updateState
    this.streams = createRuntimeStreamBridge({
      store: this.store,
      runSubscribers: this.runStreamSubscribers,
      planSubscribers: this.planStreamSubscribers,
      getPlanSnapshot: (planId) => this.getPlanSnapshot(planId),
      createTraceId: () => makeId('trace'),
      now: () => isoNow(),
    })
    this.runSteps = createRuntimeRunStepBridge({
      store: this.store,
      createStepId: () => makeId('step'),
      now: () => isoNow(),
      emitRunSnapshot: (run) => this.streams.emitRunSnapshot(run),
    })
    this.planStatus = createRuntimePlanStatusBridge({
      store: this.store,
      now: () => isoNow(),
      recordTrace: (run, trace) => this.streams.recordTraceEvent(run, trace),
    })
    this.postRunRecords = createRuntimePostRunRecordsBridge({
      store: this.store,
      memoryManager: this.memoryManager,
      tasks: this.postRunRecordTasks,
      recordTrace: (run, trace) => this.streams.recordTraceEvent(run, trace),
    })
    this.runCancellation = createRuntimeRunCancellationBridge({
      store: this.store,
      messageId: () => makeId('msg'),
      now: () => isoNow(),
      recordTrace: (run, trace) => this.streams.recordTraceEvent(run, trace),
      createStep: (run, type, round, toolName) => this.runSteps.createStep(run, type, round, toolName),
      emitRunSnapshot: (run, options) => this.streams.emitRunSnapshot(run, options),
    })
    this.taskRunSync = createRuntimeTaskRunSyncBridge({
      store: this.store,
      now: () => isoNow(),
      recomputePlanStatus: (planId) => this.planStatus.recomputePlanStatus(planId),
      recordTrace: (run, trace) => this.streams.recordTraceEvent(run, trace),
      emitPlanTaskEvent: (planId, task) => this.streams.emitPlanTaskEvent(planId, task),
    })
    this.runCancellationGuard = createRuntimeRunCancellationGuard({ store: this.store })
    this.runExecution = createRuntimeRunExecutionBridge({
      store: this.store,
      catalogSnapshots: this.catalogSnapshots,
      runAuth: this.runAuth,
      runCancellationGuard: this.runCancellationGuard,
      runCancellation: this.runCancellation,
      streams: this.streams,
      runSteps: this.runSteps,
      postRunRecords: this.postRunRecords,
      mcpClient: this.mcpClient,
      draftStore: this.draftStore,
      backendApplyClient: this.backendApplyClient,
      memoryStore: this.memoryStore,
      memoryManager: this.memoryManager,
      knowledgeManager: this.knowledgeManager,
      contractResolver: this.contractResolver,
      catalogManager: this,
      updateState: this.updateState,
    })
    this.runExecutionScheduler = createRuntimeRunExecutionSchedulerBridge({
      controllers: this.runControllers,
      executeRun: (runId, signal) => this.runExecution.executeRun(runId, signal),
      deleteCatalogSnapshot: (runId) => this.catalogSnapshots.deleteRun(runId),
      syncTaskFromRun: (runId) => this.taskRunSync.syncTaskFromRun(runId),
    })
    if (catalogInitialization.shouldReloadCatalog) this.reloadAgentCatalog()
  }

  async getCapabilities(input: {
    agentManifest?: unknown
    currentProjectId?: number
    includeResources?: boolean
    runRole?: AgentRunRole
  } = {}): Promise<AgentCapabilitiesResponse> {
    return resolveRuntimeCapabilities({
      mcpClient: this.mcpClient,
      defaultAgentManifest: this.defaultAgentManifest,
      toolRegistry: this.toolRegistry,
      pluginCatalogInfo: this.pluginCatalogInfo,
      pluginWarnings: this.pluginWarnings,
      updateState: this.updateState,
      request: input,
    })
  }

  listRegisteredTools(): ReturnType<ToolRegistry['list']> {
    return listRuntimeRegisteredTools(this.toolRegistry)
  }

  listSkillCatalog(): ReturnType<typeof listRuntimeSkillCatalog> {
    return listRuntimeSkillCatalog(this.layeredRegistry)
  }

  getDefaultAgentManifest(): AgentManifest {
    return getRuntimeDefaultAgentManifest(this.defaultAgentManifest)
  }

  reloadAgentCatalog(): JSONValue {
    return applyRuntimeAgentCatalogReload({
      load: this.pluginCatalogLoader,
      current: {
        catalogVersion: this.pluginCatalogInfo?.metadata?.catalogVersion as string | null | undefined ?? null,
        skillCount: this.layeredRegistry.skills.size,
        toolCount: this.layeredRegistry.tools.size,
      },
      commit: (reload) => {
        const catalog = reload.catalog
        this.defaultAgentManifest = catalog.manifest
        this.toolRegistry = catalog.registry
        this.layeredRegistry = catalog.layeredRegistry
        this.pluginWarnings = catalog.warnings
        this.pluginCatalogInfo = reload.pluginCatalogInfo
        this.catalogSnapshots.replaceCurrent(this.catalogSnapshotBridge.createSnapshot())
      },
    })
  }

  inspectAgentCatalog(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    return inspectRuntimeAgentCatalog({
      catalogSnapshots: this.catalogSnapshots,
      run,
      request: input,
    })
  }

  async createAgentPlan(run: AgentRun, input: Record<string, JSONValue> = {}): Promise<JSONValue> {
    return applyRuntimeAgentPlanCreationToolFlow({
      store: this.store,
      plannerRunId: run.id,
      request: input,
      now: isoNow,
      createPlan: (planInput) => this.createPlan(planInput),
      getPlanSnapshot: (planId) => this.getPlanSnapshot(planId),
    })
  }

  getAgentPlan(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    return getRuntimeAgentPlan({
      store: this.store,
      plannerRunId: run.id,
      request: input,
      getPlanSnapshot: (planId) => this.getPlanSnapshot(planId),
    })
  }

  replanAgentPlan(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    return applyRuntimeAgentReplanToolFlow({
      store: this.store,
      plannerRunId: run.id,
      request: input,
      now: isoNow,
      replanRun: (runId, replanInput) => this.replanRun(runId, replanInput),
      getPlanSnapshot: (planId) => this.getPlanSnapshot(planId),
    })
  }

  spawnSubagent(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    const spawn = prepareRuntimeSubagentSpawn({
      store: this.store,
      plannerRunId: run.id,
      request: input,
      now: isoNow(),
    })
    const taskEvents = createRuntimeTaskEventBridge({
      store: this.store,
      recordTrace: (targetRun, trace) => this.streams.recordTraceEvent(targetRun, trace),
      emitPlanTaskEvent: (planId, task) => this.streams.emitPlanTaskEvent(planId, task),
    })
    return applyRuntimeSubagentSpawnFlow({
      store: this.store,
      spawn,
      request: input,
      updateTask: (taskId, update) => this.updateTask(taskId, update),
      dispatchPlan: (dispatchInput) => this.dispatchPlan(dispatchInput),
      getPlanSnapshot: (planId) => this.getPlanSnapshot(planId),
      onTaskCreated: taskEvents.recordTaskProtocolAndPlanEvent,
    })
  }

  listSubagents(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    return listRuntimeSubagents({
      store: this.store,
      plannerRunId: run.id,
      request: input,
      now: isoNow(),
      getPlanSnapshot: (planId) => this.getPlanSnapshot(planId),
    }) as unknown as JSONValue
  }

  async waitSubagent(run: AgentRun, input: Record<string, JSONValue> = {}): Promise<JSONValue> {
    return await waitRuntimeSubagent({
      store: this.store,
      plannerRunId: run.id,
      request: input,
      now: isoNow(),
      getPlanSnapshot: (planId) => this.getPlanSnapshot(planId),
    }) as unknown as JSONValue
  }

  cancelSubagent(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    return applyRuntimeSubagentCancellationFlow({
      store: this.store,
      plannerRunId: run.id,
      request: input,
      updateTask: (targetTaskId, update) => this.updateTask(targetTaskId, update),
      cancelSubtree: (runId, cancelInput) => this.cancelSubtree(runId, cancelInput),
      getPlanSnapshot: (planId) => this.getPlanSnapshot(planId),
    })
  }

  createThread(input: CreateThreadInput = {}): AgentThread {
    return createRuntimeThread({
      store: this.store,
      threadId: makeId('thread'),
      messageId: () => makeId('msg'),
      now: () => isoNow(),
      threadInput: input,
    }).thread
  }

  listThreads(): AgentThread[] {
    return listRuntimeThreads({ store: this.store })
  }

  listThreadSummaries(): AgentThreadSummary[] {
    return listRuntimeThreadSummaries({ store: this.store })
  }

  getThread(id: string): AgentThread | undefined {
    return getRuntimeThread({ store: this.store, threadId: id })
  }

  updateThread(id: string, input: UpdateThreadInput): AgentThread {
    return updateRuntimeThread({ store: this.store, threadId: id, update: input, now: isoNow() })
  }

  addMessage(threadId: string, input: CreateMessageInput): AgentMessage {
    return addRuntimeThreadMessage({
      store: this.store,
      threadId,
      messageId: makeId('msg'),
      now: isoNow(),
      messageInput: input,
    })
  }

  createRun(input: CreateRunInput): AgentRun {
    const { thread, clientInput } = prepareRuntimeRunThread({
      store: this.store,
      runInput: input,
    })
    const now = isoNow()
    const catalogSnapshot = this.catalogSnapshots.current
    return applyRuntimeCreateRunRequest({
      runInput: input,
      thread,
      ...(clientInput ? { clientInput } : {}),
      catalogSnapshot,
      contractResolver: this.contractResolver,
      runId: makeId('run'),
      now,
      rememberCatalogRun: (runId, snapshot) => this.catalogSnapshots.rememberRun(runId, snapshot),
      rememberRunAuth: (runId, runInput) => this.runAuth.remember(runId, runInput),
      createRun: (targetRun) => this.store.createRun(targetRun),
      updateThread: (targetThread) => this.store.updateThread(targetThread),
      startRunExecution: (runId) => this.runExecutionScheduler.startRunExecution(runId),
    })
  }

  createToolRun(input: CreateToolRunInput): AgentRun {
    const {
      thread,
      userMessage,
      clientInput,
      toolCall,
    } = prepareRuntimeToolRunThread({
      store: this.store,
      toolRunInput: input,
      createThread: (threadInput) => this.createThread(threadInput),
    })
    const now = isoNow()
    const catalogSnapshot = this.catalogSnapshots.current
    return applyRuntimeCreateToolRunRequest({
      runInput: input,
      thread,
      userMessage,
      toolCall,
      ...(clientInput ? { clientInput } : {}),
      catalogSnapshot,
      contractResolver: this.contractResolver,
      runId: makeId('run'),
      now,
      rememberCatalogRun: (runId, snapshot) => this.catalogSnapshots.rememberRun(runId, snapshot),
      rememberRunAuth: (runId, runInput) => this.runAuth.remember(runId, runInput),
      createRun: (targetRun) => this.store.createRun(targetRun),
      updateThread: (targetThread) => this.store.updateThread(targetThread),
      startRunExecution: (runId) => this.runExecutionScheduler.startRunExecution(runId),
    })
  }

  async previewRun(input: PreviewRunInput): Promise<AgentRunPreview> {
    return buildRuntimeRunPreview({
      store: this.store,
      mcpClient: this.mcpClient,
      memoryManager: this.memoryManager,
      draftStore: this.draftStore,
      catalogSnapshot: this.catalogSnapshots.current,
      contractResolver: this.contractResolver,
      updateState: this.updateState,
      previewInput: input,
      makePreviewId: () => makeId('preview'),
      makeApprovalId: () => makeId('approval'),
      now: isoNow,
    })
  }

  listRuns(): AgentRun[] {
    return listRuntimeRuns({ store: this.store })
  }

  listRunsByParent(parentRunId: string): AgentRun[] {
    return listRuntimeRunsByParent({ store: this.store, parentRunId })
  }

  getRun(id: string): AgentRun | undefined {
    return getRuntimeRun({ store: this.store, runId: id })
  }

  getChildRuns(parentRunId: string): AgentRun[] {
    return getRuntimeChildRuns({ store: this.store, parentRunId })
  }

  async createPlan(input: CreatePlanInput): Promise<AgentPlanSnapshot> {
    const taskEvents = createRuntimeTaskEventBridge({
      store: this.store,
      recordTrace: (targetRun, trace) => this.streams.recordTraceEvent(targetRun, trace),
      emitPlanTaskEvent: (planId, task) => this.streams.emitPlanTaskEvent(planId, task),
    })
    return applyRuntimePlanCreationRequest({
      store: this.store,
      planInput: input,
      planId: makeId('plan'),
      now: isoNow(),
      generatePlanTasks,
      createRun: (runInput) => this.createRun(runInput),
      getPlanSnapshot: (planId) => this.getPlanSnapshot(planId),
      onTaskCreated: taskEvents.recordTaskProtocolEvents,
      onInlineTaskAssigned: taskEvents.recordTaskProtocolAndPlanEvent,
    })
  }

  listPlans(): AgentPlan[] {
    return listRuntimePlans({ store: this.store })
  }

  getPlan(id: string): AgentPlan | undefined {
    return getRuntimePlan({ store: this.store, planId: id })
  }

  getPlanSnapshot(planId: string): AgentPlanSnapshot {
    return getRuntimePlanSnapshot({ store: this.store, planId })
  }

  getTaskTree(planId: string): AgentTask[] {
    return getRuntimeTaskTree({ store: this.store, planId })
  }

  updateTask(taskId: string, input: UpdatePlanTaskInput): AgentTask {
    const { task } = applyRuntimeTaskUpdateRequest({
      store: this.store,
      taskId,
      update: input,
      now: isoNow(),
      recomputePlanStatus: (planId) => this.planStatus.recomputePlanStatus(planId),
      recordTrace: (targetRun, trace) => this.streams.recordTraceEvent(targetRun, trace),
      emitPlanTaskEvent: (planId, task) => this.streams.emitPlanTaskEvent(planId, task),
    })
    return task
  }

  cancelSubtree(runId: string, input: CancelRunInput = {}): { cancelledRunIds: string[] } {
    return applyRuntimeSubtreeCancellationRequest({
      store: this.store,
      runId,
      reason: input.reason,
      cancelRun: (targetRunId, reason) => this.cancelRun(targetRunId, { reason }),
    })
  }

  cancelPlanTree(runId: string, input: CancelRunInput = {}): { cancelledRunIds: string[] } {
    return applyRuntimePlanTreeCancellationRequest({
      store: this.store,
      runId,
      cancelSubtree: (rootRunId) => this.cancelSubtree(rootRunId, input),
    })
  }

  dispatchPlan(input: DispatchPlanInput): DispatchPlanResult {
    const taskEvents = createRuntimeTaskEventBridge({
      store: this.store,
      recordTrace: (targetRun, trace) => this.streams.recordTraceEvent(targetRun, trace),
      emitPlanTaskEvent: (planId, task) => this.streams.emitPlanTaskEvent(planId, task),
    })
    return applyRuntimePlanDispatchRequest({
      store: this.store,
      dispatchInput: input,
      now: isoNow(),
      nowMs: Date.now(),
      updateTask: (taskId, update) => this.updateTask(taskId, update),
      createRun: (runInput) => this.createRun(runInput),
      cancelRun: (runId, reason) => this.cancelRun(runId, { reason }),
      syncTaskFromRun: (runId) => this.taskRunSync.syncTaskFromRun(runId),
      recomputePlan: (targetPlanId) => this.planStatus.recomputePlanStatus(targetPlanId),
      onTaskTimedOut: (task) => this.streams.emitPlanTaskEvent(task.planId, task),
      onTaskRetryReset: taskEvents.recordTaskProtocolAndPlanEvent,
      onTaskBlocked: (task) => this.streams.emitPlanTaskEvent(task.planId, task),
      onTaskDispatched: taskEvents.recordTaskProtocolAndPlanEvent,
    })
  }

  replanRun(runId: string, input: ReplanRunInput = {}): ReplanRunResult {
    const taskEvents = createRuntimeTaskEventBridge({
      store: this.store,
      recordTrace: (targetRun, trace) => this.streams.recordTraceEvent(targetRun, trace),
      emitPlanTaskEvent: (planId, task) => this.streams.emitPlanTaskEvent(planId, task),
    })
    return applyRuntimeReplanRunRequest({
      store: this.store,
      runId,
      replanInput: input,
      now: isoNow(),
      resetNow: isoNow(),
      updateTask: (taskId, update) => this.updateTask(taskId, update),
      recomputePlan: (targetPlanId) => this.planStatus.recomputePlanStatus(targetPlanId),
      dispatchPlan: (dispatchInput) => this.dispatchPlan(dispatchInput),
      onTaskCreated: taskEvents.recordTaskProtocolAndPlanEvent,
      onTaskReset: taskEvents.recordTaskProtocolAndPlanEvent,
    })
  }

  getRunTraceEvents(runId: string, query: AgentTraceQuery = {}): AgentTraceEvent[] {
    requireRuntimeRun(this.store, runId)
    return this.store.listRunTraceEvents(runId, query)
  }

  getRunTracePage(runId: string, query: AgentTraceQuery = {}): {
    runId: string
    events: AgentTraceEvent[]
    total: number
    hasMore: boolean
    nextCursor?: string
  } {
    requireRuntimeRun(this.store, runId)
    const limit = normalizeTracePageLimit(query.limit)
    const eventsPlusOne = this.store.listRunTraceEvents(runId, { ...query, limit: limit + 1 })
    return buildRunTracePage({
      runId,
      eventsPlusOne,
      limit,
      total: this.store.countRunTraceEvents(runId, { kind: query.kind }),
    })
  }

  getRunTraceSummary(runId: string): {
    runId: string
    total: number
    byKind: Partial<Record<AgentTraceEventKind, number>>
    latestEvent?: AgentTraceEvent
  } {
    requireRuntimeRun(this.store, runId)
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
    const run = requireRuntimeRun(this.store, runId)
    return this.streams.subscribeRunStream(run, listener)
  }

  subscribePlanStream(planId: string, listener: (event: AgentPlanStreamEvent) => void): () => void {
    requireRuntimePlan(this.store, planId)
    return this.streams.subscribePlanStream(planId, listener)
  }

  approveRun(runId: string, input: ApproveRunInput = {}): AgentRun {
    return applyRuntimeRunApprovalRequest({
      store: this.store,
      runId,
      approvalInput: input,
      now: isoNow,
      recordTrace: (targetRun, trace) => this.streams.recordTraceEvent(targetRun, trace),
      emitRunSnapshot: (targetRun) => this.streams.emitRunSnapshot(targetRun),
      rememberRunAuth: (targetRunId, value) => this.runAuth.remember(targetRunId, value),
      startRunExecution: (targetRunId) => this.runExecutionScheduler.startRunExecution(targetRunId),
    })
  }

  rejectRun(runId: string, input: RejectRunInput = {}): AgentRun {
    return applyRuntimeRunRejectionRequest({
      store: this.store,
      runId,
      rejectionInput: input,
      messageId: makeId('msg'),
      now: isoNow,
      recordTrace: (targetRun, trace) => this.streams.recordTraceEvent(targetRun, trace),
      createStep: (targetRun, type, round, toolName) => this.runSteps.createStep(targetRun, type, round, toolName),
      emitRunSnapshot: (targetRun, options) => this.streams.emitRunSnapshot(targetRun, options),
    })
  }

  cancelRun(runId: string, input: CancelRunInput = {}): AgentRun {
    const controller = this.runControllers.get(runId)
    return applyRuntimeRunCancellationRequest({
      store: this.store,
      runId,
      cancelInput: input,
      messageId: makeId('msg'),
      now: isoNow,
      abortRun: (_targetRunId, error) => controller?.abort(error),
      recordTrace: (targetRun, trace) => this.streams.recordTraceEvent(targetRun, trace),
      createStep: (targetRun, type, round, toolName) => this.runSteps.createStep(targetRun, type, round, toolName),
      emitRunSnapshot: (targetRun, options) => this.streams.emitRunSnapshot(targetRun, options),
    })
  }

  answerRunInputRequest(runId: string, input: AnswerRunInputRequestInput = {}): AgentRun {
    return applyRuntimeRunInputAnswerRequest({
      store: this.store,
      runId,
      answerInput: input,
      messageId: makeId('msg'),
      now: isoNow,
      recordTrace: (targetRun, trace) => this.streams.recordTraceEvent(targetRun, trace),
      emitRunSnapshot: (targetRun) => this.streams.emitRunSnapshot(targetRun),
      rememberRunAuth: (targetRunId, value) => this.runAuth.remember(targetRunId, value),
      startRunExecution: (targetRunId) => this.runExecutionScheduler.startRunExecution(targetRunId),
    })
  }

  listMemories(query: MemoryQuery): AgentMemory[] {
    return listRuntimeMemories({ memoryStore: this.memoryStore, query })
  }

  listMemorySummaries(query: Parameters<MemoryManager['listMemorySummaries']>[0]): ReturnType<MemoryManager['listMemorySummaries']> {
    return listRuntimeMemorySummaries({ memoryManager: this.memoryManager, query })
  }

  getMemory(projectId: number, id: string): AgentMemory | undefined {
    return getRuntimeMemory({ memoryManager: this.memoryManager, projectId, id })
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
    return listRuntimeDrafts({ draftStore: this.draftStore, query })
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
    return createRuntimeLocalDraft({ draftStore: this.draftStore, draftInput: input })
  }

  getDraft(id: string): AgentDraft | undefined {
    return getRuntimeDraft({ draftStore: this.draftStore, draftId: id })
  }

  updateDraft(input: {
    draftId?: unknown
    status?: unknown
    title?: unknown
    content?: unknown
    target?: unknown
    metadata?: unknown
  }): AgentDraft {
    return updateRuntimeDraft({ draftStore: this.draftStore, draftInput: input })
  }

  patchDraft(input: {
    draftId?: unknown
    ops?: unknown
    expectedUpdatedAt?: unknown
    metadata?: unknown
  }): JSONValue {
    return patchRuntimeDraft({ draftStore: this.draftStore, patchInput: input })
  }

  validateDraft(input: { draftId?: unknown }): JSONValue {
    return validateRuntimeDraft({ draftStore: this.draftStore, draftId: input.draftId })
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
    return previewRuntimeDraftApply({ draftStore: this.draftStore, applyInput: input })
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
    return simulateRuntimeDraftApply({
      draftStore: this.draftStore,
      backendApplyClient: this.backendApplyClient,
      applyInput: input,
    })
  }

  async applyDraftFromUI(input: ApplyDraftInput & { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }): Promise<JSONValue> {
    return applyRuntimeDraftFromUI({
      draftStore: this.draftStore,
      backendApplyClient: this.backendApplyClient,
      applyInput: input,
      now: isoNow,
    })
  }

  rejectDraft(input: { draftId?: unknown; reason?: unknown }): AgentDraft {
    return rejectRuntimeDraft({ draftStore: this.draftStore, draftId: input.draftId, reason: input.reason })
  }

  createMemory(input: Parameters<AgentMemoryStore['createMemory']>[0]): AgentMemory {
    return createRuntimeMemory({ memoryManager: this.memoryManager, memoryInput: input })
  }

  deleteMemory(projectId: number, id: string): boolean {
    return deleteRuntimeMemory({ memoryManager: this.memoryManager, projectId, id })
  }

  async flushPostRunRecords(): Promise<void> {
    await this.postRunRecords.flush()
  }

}
