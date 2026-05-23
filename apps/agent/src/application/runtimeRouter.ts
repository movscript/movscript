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
import type { AgentTraceQuery } from '@movscript/protocol'
import { InMemoryAgentStore, type AgentStore, type AgentThreadClearResult, type AgentThreadDeletionResult } from '../state/store.js'
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
import { defaultRunPolicy } from '../state/runPolicy.js'
import { isExecutingRunStatus } from '../state/runStatus.js'
import { RuntimeRunControllerRegistry } from './runLifecycleControl.js'
import { numberField } from './runtimeScalarInput.js'
import { RuntimeRunAuthRegistry } from './runAuth.js'
import { updateRuntimePlan } from './runtimePlanTools.js'
import {
  requireRuntimeTask,
  requireRuntimeThread,
} from './runtimeStoreLookup.js'
import { updateRuntimeThreadRunStatus } from './runtimeThreadProjection.js'
import {
  createRuntimeTaskGraphCreationBridge,
  type RuntimeTaskGraphCreationBridge,
} from './runtimePlanCreationBridge.js'
import {
  createRuntimeTaskGraphStatusBridge,
  type RuntimeTaskGraphStatusBridge,
} from './runtimePlanStatusBridge.js'
import {
  createRuntimeEntityReadBridge,
  type RuntimeEntityReadBridge,
} from './runtimeEntityReadBridge.js'
import {
  createRuntimeThreadOperationsBridge,
  type RuntimeThreadOperationsBridge,
} from './runtimeThreadOperationsBridge.js'
import {
  createRuntimeTaskRunSyncBridge,
  type RuntimeTaskRunSyncBridge,
} from './runtimeTaskRunSyncBridge.js'
import {
  createRuntimeTaskUpdateBridge,
  type RuntimeTaskUpdateBridge,
} from './runtimeTaskUpdateBridge.js'
import { resolveRuntimeAgentManifest } from './runtimeManifest.js'
import { RuntimeCatalogSnapshotRegistry } from './runtimeCatalogSnapshot.js'
import {
  createRuntimeCatalogSnapshotBridge,
  type RuntimeCatalogSnapshotBridge,
} from './runtimeCatalogSnapshotBridge.js'
import { resolveRuntimeCatalogInitialization } from './runtimeCatalogInitialization.js'
import {
  createRuntimeCatalogOperationsBridge,
  type RuntimeCatalogOperationsBridge,
} from './runtimeCatalogOperationsBridge.js'
import {
  applyCatalogStateToDefaultManifest,
  applyCatalogStateToLayeredRegistry,
  createRuntimeCatalogSettingsBridge,
  type RuntimeCatalogSettingsBridge,
} from './runtimeCatalogSettingsBridge.js'
import {
  createRuntimeWorksBridge,
  type RuntimeWorksBridge,
} from './runtimeWorksBridge.js'
import { RuntimeWorkManager } from '../runtimeWork/runtimeWorkManager.js'
import { GenerationJobWorkProvider } from '../runtimeWork/providers/generationJobWorkProvider.js'
import { SubagentRunWorkProvider } from '../runtimeWork/providers/subagentRunWorkProvider.js'
import { AgentStoreRuntimeWorkStore } from '../runtimeWork/runtimeWorkStore.js'
import { isTerminalRuntimeWorkStatus, type RuntimeWork } from '../runtimeWork/runtimeWork.js'
import {
  createRuntimeTaskGraphDispatchBridge,
  type RuntimeTaskGraphDispatchBridge,
} from './runtimePlanDispatchBridge.js'
import {
  createRuntimeReplanBridge,
  type RuntimeReplanBridge,
} from './runtimeReplanBridge.js'
import {
  createRuntimeTreeCancellationBridge,
  type RuntimeTreeCancellationBridge,
} from './runtimeTreeCancellationBridge.js'
import {
  createRuntimeRunControlBridge,
  type RuntimeRunControlBridge,
} from './runtimeRunControlBridge.js'
import {
  createRuntimeRunCancellationBridge,
  type RuntimeRunCancellationBridge,
} from './runtimeRunCancellationBridge.js'
import {
  createRuntimeRunCancellationGuard,
  type RuntimeRunCancellationGuard,
} from './runtimeRunCancellationGuard.js'
import {
  createRuntimeRunCreationBridge,
  type RuntimeRunCreationBridge,
} from './runtimeRunCreationBridge.js'
import {
  createRuntimeRunStepBridge,
  type RuntimeRunStepBridge,
} from './runtimeRunStepBridge.js'
import {
  createRuntimeRunExecutionSchedulerBridge,
  type RuntimeRunExecutionSchedulerBridge,
} from './runtimeRunExecutionSchedulerBridge.js'
import {
  createRuntimeRecoveryBridge,
  type RuntimeRecoveryBridge,
} from './runtimeRecoveryBridge.js'
import {
  createRuntimeRunExecutionBridge,
  type RuntimeRunExecutionBridge,
} from './runtimeRunExecutionBridge.js'
import {
  createRuntimeRunPreviewBridge,
  type RuntimeRunPreviewBridge,
} from './runtimeRunPreviewBridge.js'
import { RuntimeDeferredTaskRegistry } from './runtimeDeferredTasks.js'
import {
  createRuntimePostRunRecordsBridge,
  type RuntimePostRunRecordsBridge,
} from './runtimePostRunRecordsBridge.js'
import {
  createRuntimeTaskEventBridge,
  type RuntimeTaskEventBridge,
} from './runtimeTaskEventBridge.js'
import {
  createRuntimeStreamBridge,
  type RuntimeStreamBridge,
} from './runtimeStreamBridge.js'
import {
  createRuntimeStreamSubscriptionBridge,
  type RuntimeStreamSubscriptionBridge,
} from './runtimeStreamSubscriptionBridge.js'
import {
  createRuntimeDraftOperationsBridge,
  type RuntimeDraftOperationsBridge,
} from './runtimeDraftOperationsBridge.js'
import {
  createRuntimeMemoryOperationsBridge,
  type RuntimeMemoryOperationsBridge,
} from './runtimeMemoryOperationsBridge.js'
import {
  createRuntimeTraceReadBridge,
  type RuntimeTraceReadBridge,
} from './runtimeTraceReadBridge.js'
import {
  buildRuntimeSessionSnapshotV1,
  buildRuntimeThreadSnapshotV2,
  type RuntimeSessionSnapshotV1,
  type RuntimeThreadSnapshotV2,
} from './runtimeThreadSnapshot.js'
import { RuntimeScheduler } from './runtimeScheduler.js'
import { RuntimeWakeCoordinator } from './runtimeWakeCoordinator.js'
import type { RuntimeInteractionApprovalResult } from './runtimeInteractions.js'
import { RuntimeEventSubscriberRegistry } from './runtimeEventSubscribers.js'
import { isoNow, makeId } from './runtimeIdentity.js'
import type {
  AgentApprovalRequest,
  AgentSession,
  AgentSessionSummary,
  AgentTaskGraph,
  AgentTaskGraphSnapshot,
  AgentTaskGraphStreamEvent,
  AgentRunRole,
  AgentTask,
  AgentInputRequest,
  AgentMessage,
  AgentMessageRole,
  AgentRunPreview,
  AgentRun,
  AgentTraceEvent,
  AgentInternalRunSignal,
  AgentInternalThreadSignal,
  AgentRunStep,
  AgentRuntimeRouterOptions,
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentRunPolicy,
  AgentThread,
  AgentThreadSummary,
  CancelRunInput,
  AnswerRunInputRequestInput,
  CreateMessageInput,
  CreateTaskGraphInput,
  CreateTaskGraphTaskInput,
  CreateRunInput,
  CreateToolRunInput,
  CreateThreadInput,
  DispatchTaskGraphInput,
  DispatchTaskGraphResult,
  PreviewRunInput,
  UpdateTaskGraphInput,
  UpdateTaskGraphResult,
  ToolCallOutcome,
  UpdateTaskGraphTaskInput,
  UpdateThreadInput,
} from '../state/types.js'

export type {
  AgentMessage,
  AgentMessageRole,
  AgentSession,
  AgentSessionSummary,
  AgentTaskGraph,
  AgentTaskGraphSnapshot,
  AgentTaskGraphStreamEvent,
  AgentRun,
  AgentRunRole,
  AgentRunPreview,
  AgentRunStatus,
  AgentInternalRunSignal,
  AgentRunStep,
  AgentRuntimeRouterOptions,
  AgentApprovalRequest,
  AgentInputRequest,
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentRunDebugTrace,
  AgentRunPolicy,
  AgentStepStatus,
  AgentThread,
  AgentThreadSummary,
  CancelRunInput,
  AnswerRunInputRequestInput,
  CreateMessageInput,
  CreateTaskGraphInput,
  CreateTaskGraphTaskInput,
  CreateRunInput,
  CreateToolRunInput,
  CreateThreadInput,
  DispatchTaskGraphInput,
  DispatchTaskGraphResult,
  PreviewRunInput,
  UpdateThreadInput,
  ToolCall,
  ToolCallOutcome,
  UpdateTaskGraphTaskInput,
} from '../state/types.js'
export type { AgentMemory, AgentMemoryKind, MemoryQuery } from '../memory/types.js'
export type { RuntimeThreadSnapshotV2 } from './runtimeThreadSnapshot.js'
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

export class AgentRuntimeRouter {
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
  private readonly catalogOperations: RuntimeCatalogOperationsBridge
  private readonly catalogSettings: RuntimeCatalogSettingsBridge
  private readonly entityReads: RuntimeEntityReadBridge
  private readonly catalogStateStore: AgentCatalogStateStore
  private readonly pluginCatalogLoader?: NonNullable<AgentRuntimeRouterOptions['pluginCatalogLoader']>
  private readonly updateState?: AgentCapabilitiesResponse['updates']
  private readonly runControllers = new RuntimeRunControllerRegistry()
  private readonly runAuth = new RuntimeRunAuthRegistry()
  private readonly runStreamSubscribers = new RuntimeEventSubscriberRegistry<AgentInternalRunSignal>()
  private readonly sessionStreamSubscribers = new RuntimeEventSubscriberRegistry<AgentInternalThreadSignal>()
  private readonly threadStreamSubscribers = new RuntimeEventSubscriberRegistry<AgentInternalThreadSignal>()
  private readonly planStreamSubscribers = new RuntimeEventSubscriberRegistry<AgentTaskGraphStreamEvent>()
  private readonly postRunRecordTasks = new RuntimeDeferredTaskRegistry()
  private readonly streams: RuntimeStreamBridge
  private readonly streamSubscriptions: RuntimeStreamSubscriptionBridge
  private readonly threads: RuntimeThreadOperationsBridge
  private readonly drafts: RuntimeDraftOperationsBridge
  private readonly runSteps: RuntimeRunStepBridge
  private readonly planStatus: RuntimeTaskGraphStatusBridge
  private readonly postRunRecords: RuntimePostRunRecordsBridge
  private readonly runCancellation: RuntimeRunCancellationBridge
  private readonly taskRunSync: RuntimeTaskRunSyncBridge
  private readonly runExecution: RuntimeRunExecutionBridge
  private readonly runExecutionScheduler: RuntimeRunExecutionSchedulerBridge
  private readonly recovery: RuntimeRecoveryBridge
  private readonly runCancellationGuard: RuntimeRunCancellationGuard
  private readonly runControl: RuntimeRunControlBridge
  private readonly runtimeScheduler: RuntimeScheduler
  private readonly runtimeWake: RuntimeWakeCoordinator
  private readonly runCreation: RuntimeRunCreationBridge
  private readonly runPreview: RuntimeRunPreviewBridge
  private readonly taskEvents: RuntimeTaskEventBridge
  private readonly taskUpdate: RuntimeTaskUpdateBridge
  private readonly planCreation: RuntimeTaskGraphCreationBridge
  private readonly planDispatch: RuntimeTaskGraphDispatchBridge
  private readonly updateTaskGraph: RuntimeReplanBridge
  private readonly treeCancellation: RuntimeTreeCancellationBridge
  private readonly workManager: RuntimeWorkManager
  private readonly runtimeWorks: RuntimeWorksBridge
  private readonly memories: RuntimeMemoryOperationsBridge
  private readonly traceReads: RuntimeTraceReadBridge

  constructor(options: AgentRuntimeRouterOptions) {
    this.mcpClient = options.mcpClient
    this.store = options.store ?? new InMemoryAgentStore()
    this.draftStore = options.draftStore ?? new InMemoryAgentDraftStore()
    this.backendApplyClient = options.backendApplyClient ?? new MCPBackendApplyClient(this.mcpClient)
    this.drafts = createRuntimeDraftOperationsBridge({
      draftStore: this.draftStore,
      backendApplyClient: this.backendApplyClient,
    })
    this.memoryStore = options.memoryStore ?? new InMemoryAgentMemoryStore()
    this.memoryManager = new MemoryManager(this.memoryStore)
    this.memories = createRuntimeMemoryOperationsBridge({
      memoryStore: this.memoryStore,
      memoryManager: this.memoryManager,
    })
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
    this.catalogStateStore = options.catalogStateStore ?? new InMemoryAgentCatalogStateStore()
    const catalogState = this.catalogStateStore.load()
    this.layeredRegistry = applyCatalogStateToLayeredRegistry(catalogInitialization.layeredRegistry, catalogState)
    this.defaultAgentManifest = applyCatalogStateToDefaultManifest(
      catalogInitialization.defaultAgentManifest,
      catalogState,
      this.layeredRegistry,
    )
    this.toolRegistry = catalogInitialization.toolRegistry
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
    this.pluginCatalogLoader = options.pluginCatalogLoader
    this.updateState = options.updateState
    this.catalogOperations = createRuntimeCatalogOperationsBridge({
      mcpClient: this.mcpClient,
      catalogSnapshots: this.catalogSnapshots,
      catalogSnapshotBridge: this.catalogSnapshotBridge,
      load: this.pluginCatalogLoader,
      updateState: this.updateState,
      getState: () => ({
        defaultAgentManifest: this.defaultAgentManifest,
        toolRegistry: this.toolRegistry,
        layeredRegistry: this.layeredRegistry,
        pluginCatalogInfo: this.pluginCatalogInfo,
        pluginWarnings: this.pluginWarnings,
      }),
      commitReload: (catalog) => {
        const catalogState = this.catalogStateStore.load()
        const layeredRegistry = applyCatalogStateToLayeredRegistry(catalog.layeredRegistry, catalogState)
        this.defaultAgentManifest = applyCatalogStateToDefaultManifest(
          catalog.defaultAgentManifest,
          catalogState,
          layeredRegistry,
        )
        this.toolRegistry = catalog.toolRegistry
        this.layeredRegistry = layeredRegistry
        this.pluginCatalogInfo = catalog.pluginCatalogInfo
        this.pluginWarnings = catalog.pluginWarnings
      },
    })
    this.catalogSettings = createRuntimeCatalogSettingsBridge({
      getState: () => ({
        defaultAgentManifest: this.defaultAgentManifest,
        layeredRegistry: this.layeredRegistry,
      }),
      setDefaultAgentManifest: (manifest) => {
        this.defaultAgentManifest = manifest
      },
      setLayeredRegistry: (registry) => {
        this.layeredRegistry = registry
      },
      catalogStateStore: this.catalogStateStore,
      catalogSnapshots: this.catalogSnapshots,
      catalogSnapshotBridge: this.catalogSnapshotBridge,
      now: () => isoNow(),
    })
    this.entityReads = createRuntimeEntityReadBridge({ store: this.store })
    this.traceReads = createRuntimeTraceReadBridge({ store: this.store })
    this.streams = createRuntimeStreamBridge({
      store: this.store,
      runSubscribers: this.runStreamSubscribers,
      sessionSubscribers: this.sessionStreamSubscribers,
      threadSubscribers: this.threadStreamSubscribers,
      planSubscribers: this.planStreamSubscribers,
      getTaskGraphSnapshot: (taskGraphId) => this.getTaskGraphSnapshot(taskGraphId),
      createTraceId: () => makeId('trace'),
      now: () => isoNow(),
      ...(options.telemetry ? { telemetry: options.telemetry } : {}),
    })
    this.streamSubscriptions = createRuntimeStreamSubscriptionBridge({
      store: this.store,
      streams: this.streams,
    })
    this.threads = createRuntimeThreadOperationsBridge({ store: this.store })
    this.runSteps = createRuntimeRunStepBridge({
      store: this.store,
      createStepId: () => makeId('step'),
      now: () => isoNow(),
      emitRunSnapshot: (run) => this.streams.emitRunSnapshot(run),
    })
    this.planStatus = createRuntimeTaskGraphStatusBridge({
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
      recomputePlanStatus: (taskGraphId) => this.planStatus.recomputePlanStatus(taskGraphId),
      recordTrace: (run, trace) => this.streams.recordTraceEvent(run, trace),
      emitPlanTaskEvent: (taskGraphId, task) => this.streams.emitPlanTaskEvent(taskGraphId, task),
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
      onRunSettled: (runId) => {
        void this.handleRuntimeRunSettled(runId)
      },
    })
    this.recovery = createRuntimeRecoveryBridge({
      store: this.store,
      streams: this.streams,
      runExecutionScheduler: this.runExecutionScheduler,
    })
    this.runControl = createRuntimeRunControlBridge({
      store: this.store,
      controllers: this.runControllers,
      runAuth: this.runAuth,
      streams: this.streams,
      runSteps: this.runSteps,
      runExecutionScheduler: this.runExecutionScheduler,
    })
    this.runtimeScheduler = new RuntimeScheduler({
      store: this.store,
      runControl: this.runControl,
      continueRun: (runInput) => this.createRun(runInput),
      getRunAuth: (runId) => this.runAuth.get(runId),
      now: () => isoNow(),
    })
    this.runCreation = createRuntimeRunCreationBridge({
      store: this.store,
      catalogSnapshots: this.catalogSnapshots,
      contractResolver: this.contractResolver,
      runAuth: this.runAuth,
      runExecutionScheduler: this.runExecutionScheduler,
      createThread: (threadInput) => this.createThread(threadInput),
    })
    this.runPreview = createRuntimeRunPreviewBridge({
      store: this.store,
      mcpClient: this.mcpClient,
      memoryManager: this.memoryManager,
      draftStore: this.draftStore,
      catalogSnapshots: this.catalogSnapshots,
      contractResolver: this.contractResolver,
      updateState: this.updateState,
    })
    this.taskEvents = createRuntimeTaskEventBridge({
      store: this.store,
      recordTrace: (targetRun, trace) => this.streams.recordTraceEvent(targetRun, trace),
      emitPlanTaskEvent: (taskGraphId, task) => this.streams.emitPlanTaskEvent(taskGraphId, task),
    })
    this.taskUpdate = createRuntimeTaskUpdateBridge({
      store: this.store,
      now: () => isoNow(),
      recomputePlanStatus: (taskGraphId) => this.planStatus.recomputePlanStatus(taskGraphId),
      recordTrace: (targetRun, trace) => this.streams.recordTraceEvent(targetRun, trace),
      emitPlanTaskEvent: (taskGraphId, task) => this.streams.emitPlanTaskEvent(taskGraphId, task),
    })
    this.planCreation = createRuntimeTaskGraphCreationBridge({
      store: this.store,
      generatePlanTasks,
      runCreation: this.runCreation,
      taskEvents: this.taskEvents,
      getTaskGraphSnapshot: (taskGraphId) => this.getTaskGraphSnapshot(taskGraphId),
    })
    this.planDispatch = createRuntimeTaskGraphDispatchBridge({
      store: this.store,
      taskUpdate: this.taskUpdate,
      runCreation: this.runCreation,
      runControl: this.runControl,
      taskRunSync: this.taskRunSync,
      planStatus: this.planStatus,
      streams: this.streams,
      taskEvents: this.taskEvents,
      createThread: (threadInput) => this.createThread(threadInput),
    })
    this.updateTaskGraph = createRuntimeReplanBridge({
      store: this.store,
      taskUpdate: this.taskUpdate,
      planStatus: this.planStatus,
      planDispatch: this.planDispatch,
      taskEvents: this.taskEvents,
    })
    this.treeCancellation = createRuntimeTreeCancellationBridge({
      store: this.store,
      cancelRun: (runId, cancelInput) => this.cancelRun(runId, cancelInput),
    })
    this.workManager = new RuntimeWorkManager({
      store: new AgentStoreRuntimeWorkStore(this.store),
      providers: [
        new GenerationJobWorkProvider(this.mcpClient),
        new SubagentRunWorkProvider({
          createThread: (threadInput) => this.createThread(threadInput),
          createRun: (runInput) => this.createRun(runInput),
          getRun: (runId) => this.store.getRun(runId),
          listRuns: (query) => this.store.listRuns(query),
          cancelSubtree: (runId, cancelInput) => this.treeCancellation.cancelSubtree(runId, cancelInput),
        }),
      ],
    })
    this.runtimeWake = new RuntimeWakeCoordinator({
      store: this.store,
      scheduler: this.runtimeScheduler,
      observeWork: (work) => this.observeRuntimeWorkForOpen(work),
      now: () => isoNow(),
    })
    void this.runtimeWake.drainQueued()
    this.runtimeWorks = createRuntimeWorksBridge({
      workManager: this.workManager,
      wake: this.runtimeWake,
      recordTrace: (targetRun, trace) => this.streams.recordTraceEvent(targetRun, trace),
    })
    if (catalogInitialization.shouldReloadCatalog) this.reloadAgentCatalog()
  }

  async getCapabilities(input: {
    agentManifest?: unknown
    currentProjectId?: number
    includeResources?: boolean
    runRole?: AgentRunRole
  } = {}): Promise<AgentCapabilitiesResponse> {
    return await this.catalogOperations.getCapabilities(input)
  }

  listRegisteredTools(): ReturnType<ToolRegistry['list']> {
    return this.catalogOperations.listRegisteredTools()
  }

  listSkillCatalog(): ReturnType<RuntimeCatalogOperationsBridge['listSkillCatalog']> {
    return this.catalogOperations.listSkillCatalog()
  }

  listProfileCatalog(): ReturnType<RuntimeCatalogOperationsBridge['listProfileCatalog']> {
    return this.catalogOperations.listProfileCatalog()
  }

  setDefaultAgentProfile(input: { profileId?: unknown } = {}): AgentManifest {
    return this.catalogSettings.setDefaultAgentProfile(input)
  }

  setDefaultToolPolicy(input: { toolGrants?: unknown } = {}): AgentManifest {
    return this.catalogSettings.setDefaultToolPolicy(input)
  }

  setDefaultSkillPolicy(input: { skills?: unknown } = {}): ReturnType<RuntimeCatalogSettingsBridge['setDefaultSkillPolicy']> {
    return this.catalogSettings.setDefaultSkillPolicy(input)
  }

  getDefaultAgentManifest(): AgentManifest {
    return this.catalogOperations.getDefaultAgentManifest()
  }

  reloadAgentCatalog(): JSONValue {
    return this.catalogOperations.reloadAgentCatalog()
  }

  inspectAgentCatalog(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    return this.catalogOperations.inspectAgentCatalog(run, input)
  }

  updateActiveSkills(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    return this.catalogOperations.updateActiveSkills(run, input)
  }

  updatePlan(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    const result = updateRuntimePlan({
      store: this.store,
      run,
      request: input,
      now: isoNow(),
    })
    if (result.message) this.streams.emitAssistantMessage(run, result.message)
    return result as unknown as JSONValue
  }
  async startWork(run: AgentRun, input: Record<string, JSONValue> = {}, options: { signal?: AbortSignal } = {}): Promise<JSONValue> { return await this.runtimeWorks.startWork(run, input, options) }

  getWork(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue { return this.runtimeWorks.getWork(run, input) }

  listWork(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue { return this.runtimeWorks.listWork(run, input) }

  async waitWork(run: AgentRun, input: Record<string, JSONValue> = {}, options: { signal?: AbortSignal } = {}): Promise<JSONValue> { return await this.runtimeWorks.waitWork(run, input, options) }

  async cancelWork(run: AgentRun, input: Record<string, JSONValue> = {}, options: { signal?: AbortSignal } = {}): Promise<JSONValue> { return await this.runtimeWorks.cancelWork(run, input, options) }

  createThread(input: CreateThreadInput = {}): AgentThread {
    return this.threads.createThread(input)
  }

  listSessions(): AgentSession[] {
    return this.threads.listSessions()
  }

  listSessionSummaries(): AgentSessionSummary[] {
    return this.threads.listSessionSummaries()
  }

  getSession(id: string): AgentSession | undefined {
    return this.threads.getSession(id)
  }

  listThreads(): AgentThread[] {
    return this.threads.listThreads()
  }

  listThreadSummaries(): AgentThreadSummary[] {
    return this.threads.listThreadSummaries()
  }

  getThread(id: string): AgentThread | undefined {
    return this.threads.getThread(id)
  }

  async getThreadRuntimeSnapshot(threadId: string): Promise<RuntimeThreadSnapshotV2 | undefined> {
    if (!this.getThread(threadId)) return undefined
    await this.reconcileRuntimeWorksForOpenedThread(threadId)
    const thread = this.getThread(threadId)
    if (!thread) return undefined
    const runs = this.runtimeSnapshotRunsForThread(thread)
    const runIds = new Set(runs.map((run) => run.id))
    return buildRuntimeThreadSnapshotV2({
      thread,
      runs,
      works: this.store.listRuntimeWorks()
        .filter((work) => work.threadId === threadId || runIds.has(work.runId)),
      interactions: this.store.listRuntimeInteractions()
        .filter((interaction) => interaction.threadId === threadId
          || interaction.displayThreadId === threadId
          || interaction.displayAnchor?.threadId === threadId),
      continuations: this.store.listRuntimeContinuations()
        .filter((continuation) => continuation.threadId === threadId || runIds.has(continuation.runId)),
      wakeEvents: this.store.listRuntimeWakeEvents()
        .filter((event) => event.threadId === threadId || (event.runId ? runIds.has(event.runId) : false)),
    })
  }

  private runtimeSnapshotRunsForThread(thread: AgentThread): AgentRun[] {
    const candidates = thread.sessionId
      ? this.store.listRuns({ sessionId: thread.sessionId })
      : this.store.listRuns({ threadId: thread.id })
    const visible = candidates.filter((run) => run.threadId === thread.id || runtimeRunDisplaysOnThread(run, thread.id))
    return uniqueRuntimeRunsById(visible)
  }

  async getSessionRuntimeSnapshot(sessionId: string): Promise<RuntimeSessionSnapshotV1 | undefined> {
    const session = this.getSession(sessionId)
    if (!session) return undefined
    const threads = this.store.listThreads().filter((thread) => thread.sessionId === sessionId)
    for (const thread of threads) await this.reconcileRuntimeWorksForOpenedThread(thread.id)
    const refreshedThreads = this.store.listThreads().filter((thread) => thread.sessionId === sessionId)
    const threadIds = new Set(refreshedThreads.map((thread) => thread.id))
    const taskGraphSnapshots = this.store.listTaskGraphs()
      .filter((taskGraph) => taskGraph.sessionId === sessionId || threadIds.has(taskGraph.threadId))
      .map((taskGraph) => this.getTaskGraphSnapshot(taskGraph.id))
    const runs = this.store.listRuns({ sessionId })
    const runIds = new Set(runs.map((run) => run.id))
    const works = this.store.listRuntimeWorks({ sessionId })
    const interactions = this.store.listRuntimeInteractions()
      .filter((interaction) => threadIds.has(interaction.threadId) || runIds.has(interaction.runId))
    const continuations = this.store.listRuntimeContinuations()
      .filter((continuation) => threadIds.has(continuation.threadId) || runIds.has(continuation.runId))
    const wakeEvents = this.store.listRuntimeWakeEvents()
      .filter((event) => threadIds.has(event.threadId) || (event.runId ? runIds.has(event.runId) : false))
    return buildRuntimeSessionSnapshotV1({
      session,
      threads: refreshedThreads,
      taskGraphSnapshots,
      runs,
      works,
      interactions,
      continuations,
      wakeEvents,
    })
  }

  private async reconcileRuntimeWorksForOpenedThread(threadId: string): Promise<void> {
    await this.runtimeWake.threadOpened(threadId)
  }

  private async handleRuntimeRunSettled(runId: string): Promise<void> {
    await this.runtimeWake.runSettled(runId)
  }

  private async observeRuntimeWorkForOpen(work: RuntimeWork): Promise<RuntimeWork | undefined> {
    if (isTerminalRuntimeWorkStatus(work.status)) return work
    try {
      return await this.workManager.observe(work.id)
    } catch (error) {
      const run = this.store.getRun(work.runId)
      if (run) {
        this.streams.recordTraceEvent(run, {
          kind: 'tool_call',
          title: `Runtime work observe failed: ${work.kind}`,
          summary: error instanceof Error ? error.message : String(error),
          status: 'failed',
          toolName: 'core_work_wait',
          data: { runtimeWorkId: work.id },
        })
      }
      return undefined
    }
  }

  approveInteraction(interactionId: string): RuntimeInteractionApprovalResult {
    return this.runtimeScheduler.approveInteraction(interactionId)
  }

  rejectInteraction(interactionId: string): RuntimeInteractionApprovalResult {
    return this.runtimeScheduler.rejectInteraction(interactionId)
  }

  updateThread(id: string, input: UpdateThreadInput): AgentThread {
    return this.threads.updateThread(id, input)
  }

  deleteThread(id: string): AgentThreadDeletionResult {
    const activeRun = this.store.listRuns({ threadId: id }).find((run) => isExecutingRunStatus(run.status))
    if (activeRun) throw new Error(`thread has active run: ${activeRun.id}`)
    return this.threads.deleteThread(id)
  }

  deleteAllThreads(): AgentThreadClearResult {
    const activeRun = this.store.listRuns().find((run) => isExecutingRunStatus(run.status))
    if (activeRun) throw new Error(`thread has active run: ${activeRun.id}`)
    return this.threads.deleteAllThreads()
  }

  addMessage(threadId: string, input: CreateMessageInput): AgentMessage {
    return this.threads.addMessage(threadId, input)
  }

  createRun(input: CreateRunInput): AgentRun {
    return this.runCreation.createRun(input)
  }

  createToolRun(input: CreateToolRunInput): AgentRun {
    return this.runCreation.createToolRun(input)
  }

  async previewRun(input: PreviewRunInput): Promise<AgentRunPreview> {
    return await this.runPreview.previewRun(input)
  }

  listRuns(): AgentRun[] {
    return this.entityReads.listRuns()
  }

  listRunsByParent(parentRunId: string): AgentRun[] {
    return this.entityReads.listRunsByParent(parentRunId)
  }

  listRunsByThread(threadId: string): AgentRun[] {
    return this.entityReads.listRunsByThread(threadId)
  }

  getRun(id: string): AgentRun | undefined {
    return this.entityReads.getRun(id)
  }

  getChildRuns(parentRunId: string): AgentRun[] {
    return this.entityReads.getChildRuns(parentRunId)
  }

  async createTaskGraph(input: CreateTaskGraphInput): Promise<AgentTaskGraphSnapshot> {
    return await this.planCreation.createTaskGraph(input)
  }

  listTaskGraphs(): AgentTaskGraph[] {
    return this.entityReads.listTaskGraphs()
  }

  getTaskGraph(id: string): AgentTaskGraph | undefined {
    return this.entityReads.getTaskGraph(id)
  }

  getTaskGraphSnapshot(taskGraphId: string): AgentTaskGraphSnapshot {
    return this.entityReads.getTaskGraphSnapshot(taskGraphId)
  }

  getTaskTree(taskGraphId: string): AgentTask[] {
    return this.entityReads.getTaskTree(taskGraphId)
  }

  updateTask(taskId: string, input: UpdateTaskGraphTaskInput): AgentTask {
    return this.taskUpdate.updateTask(taskId, input)
  }

  cancelSubtree(runId: string, input: CancelRunInput = {}): { cancelledRunIds: string[] } {
    return this.treeCancellation.cancelSubtree(runId, input)
  }

  cancelPlanTree(runId: string, input: CancelRunInput = {}): { cancelledRunIds: string[] } {
    return this.treeCancellation.cancelPlanTree(runId, input)
  }

  dispatchTaskGraph(input: DispatchTaskGraphInput): DispatchTaskGraphResult {
    return this.planDispatch.dispatchTaskGraph(input)
  }

  replanRun(runId: string, input: UpdateTaskGraphInput = {}): UpdateTaskGraphResult {
    return this.updateTaskGraph.replanRun(runId, input)
  }

  getRunTraceEvents(runId: string, query: AgentTraceQuery = {}): AgentTraceEvent[] {
    return this.traceReads.getRunTraceEvents(runId, query)
  }

  getRunTracePage(runId: string, query: AgentTraceQuery = {}): ReturnType<RuntimeTraceReadBridge['getRunTracePage']> {
    return this.traceReads.getRunTracePage(runId, query)
  }

  getRunTraceEventData(runId: string, eventId: string): ReturnType<RuntimeTraceReadBridge['getRunTraceEventData']> { return this.traceReads.getRunTraceEventData(runId, eventId) }

  getRunTraceSummary(runId: string): ReturnType<RuntimeTraceReadBridge['getRunTraceSummary']> {
    return this.traceReads.getRunTraceSummary(runId)
  }

  getRunTraceDebugView(runId: string): ReturnType<RuntimeTraceReadBridge['getRunTraceDebugView']> { return this.traceReads.getRunTraceDebugView(runId) }

  getRunDebugLedger(runId: string): ReturnType<RuntimeTraceReadBridge['getRunDebugLedger']> { return this.traceReads.getRunDebugLedger(runId) }

  getRunDebugEvidence(runId: string, evidenceId: string): ReturnType<RuntimeTraceReadBridge['getRunDebugEvidence']> { return this.traceReads.getRunDebugEvidence(runId, evidenceId) }

  getRunGenerationView(runId: string): ReturnType<RuntimeTraceReadBridge['getRunGenerationView']> { return this.traceReads.getRunGenerationView(runId) }

  subscribeRunStream(runId: string, listener: (event: AgentInternalRunSignal) => void): () => void {
    return this.streamSubscriptions.subscribeRunStream(runId, listener)
  }

  subscribeSessionStream(sessionId: string, listener: (event: AgentInternalThreadSignal) => void): () => void {
    return this.streamSubscriptions.subscribeSessionStream(sessionId, listener)
  }

  subscribeThreadStream(threadId: string, listener: (event: AgentInternalThreadSignal) => void): () => void {
    return this.streamSubscriptions.subscribeThreadStream(threadId, listener)
  }

  subscribePlanStream(taskGraphId: string, listener: (event: AgentTaskGraphStreamEvent) => void): () => void {
    return this.streamSubscriptions.subscribePlanStream(taskGraphId, listener)
  }

  cancelRun(runId: string, input: CancelRunInput = {}): AgentRun {
    return this.runControl.cancelRun(runId, input)
  }

  answerRunInputRequest(runId: string, input: AnswerRunInputRequestInput = {}): AgentRun {
    return this.runControl.answerRunInputRequest(runId, input)
  }

  reconcileRuntimeThreads(): ReturnType<RuntimeRecoveryBridge['reconcileRuntimeThreads']> {
    return this.recovery.reconcileRuntimeThreads()
  }

  resumeInterruptedRun(runId: string): AgentRun {
    return this.recovery.resumeInterruptedRun(runId)
  }

  listMemories(query: MemoryQuery): AgentMemory[] {
    return this.memories.listMemories(query)
  }

  listMemorySummaries(query: Parameters<MemoryManager['listMemorySummaries']>[0]): ReturnType<MemoryManager['listMemorySummaries']> {
    return this.memories.listMemorySummaries(query)
  }

  getMemory(projectId: number, id: string): AgentMemory | undefined {
    return this.memories.getMemory(projectId, id)
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
    return this.drafts.listDrafts(query)
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
    return this.drafts.createLocalDraft(input)
  }

  getDraft(id: string): AgentDraft | undefined {
    return this.drafts.getDraft(id)
  }

  updateDraft(input: {
    draftId?: unknown
    status?: unknown
    title?: unknown
    content?: unknown
    target?: unknown
    metadata?: unknown
  }): AgentDraft {
    return this.drafts.updateDraft(input)
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
    return this.drafts.previewApplyDraft(input)
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
    return await this.drafts.simulateApplyDraft(input)
  }

  async applyDraftFromUI(input: ApplyDraftInput & { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }): Promise<JSONValue> {
    return await this.drafts.applyDraftFromUI(input)
  }

  rejectDraft(input: { draftId?: unknown; reason?: unknown }): AgentDraft {
    return this.drafts.rejectDraft(input)
  }

  createMemory(input: Parameters<AgentMemoryStore['createMemory']>[0]): AgentMemory {
    return this.memories.createMemory(input)
  }

  deleteMemory(projectId: number, id: string): boolean {
    return this.memories.deleteMemory(projectId, id)
  }

  async flushPostRunRecords(): Promise<void> {
    await this.postRunRecords.flush()
  }

}

function uniqueRuntimeRunsById(runs: AgentRun[]): AgentRun[] {
  const byId = new Map<string, AgentRun>()
  for (const run of runs) byId.set(run.id, run)
  return Array.from(byId.values())
}

function runtimeRunDisplaysOnThread(run: AgentRun, threadId: string): boolean {
  return runtimeRunInteractionDisplaysOnThread(run.pendingApprovals, threadId)
    || runtimeRunInteractionDisplaysOnThread(run.pendingInputRequests, threadId)
}

function runtimeRunInteractionDisplaysOnThread(
  interactions: Array<Pick<AgentApprovalRequest | AgentInputRequest, 'displayThreadId' | 'displayAnchor'>> | undefined,
  threadId: string,
): boolean {
  return (interactions ?? []).some((interaction) =>
    interaction.displayThreadId === threadId || interaction.displayAnchor?.threadId === threadId)
}
