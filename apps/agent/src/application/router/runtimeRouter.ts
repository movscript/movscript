import type { MCPClient } from '../../adapters/mcp/client/mcpClient.js'
import type { JSONValue } from '../../shared/protocol/types.js'
import type { AgentManifest } from '../../catalog/manifest/agentManifest.js'
import {
  InMemoryAgentCatalogStateStore,
  type AgentCatalogStateStore,
} from '../../catalog/registry/state/catalogState.js'
import { loadAgentPluginCatalog, type AgentPluginCatalog } from '../../catalog/loading/core/loader.js'
import { MemoryManager } from '../../memory/manager/memoryManager.js'
import { InMemoryAgentMemoryStore, type AgentMemoryStore } from '../../memory/store/in-memory/memoryStore.js'
import type { AgentMemory, MemoryQuery } from '../../memory/shared/types.js'
import { ReferenceManager, loadAgentReferenceStore } from '../../reference/index.js'
import type { AgentTraceQuery } from '@movscript/protocol'
import { InMemoryAgentStore, type AgentStore, type AgentThreadClearResult, type AgentThreadDeletionResult } from '../../state/store/core/store.js'
import type { ToolRegistry } from '../../tools/registry/core/toolRegistry.js'
import {
  InMemoryAgentDraftStore,
  type AgentDraft,
  type AgentDraftStore,
} from '../../drafts/store/draftStore.js'
import { type ApplyDraftInput } from '../../drafts/apply/draftApply.js'
import { BackendApplyClient } from '../../drafts/adapters/backend/backendApplyClient.js'
import { MCPBackendApplyClient } from '../../drafts/adapters/mcp/mcpBackendApplyClient.js'
import { createBackendRuntimeDraftApplyPort } from '../../adapters/draft/backend/backendRuntimeDraftApplyAdapter.js'
import { generatePlanTasks } from '../../orchestration/model/planning/generation/planGenerator.js'
import {
  EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
  type AgentRuntimeContractResolver,
} from '../../contracts/runtime/runtimeContract.js'
import { RuntimeRunControllerRegistry } from '../run/lifecycle/runLifecycleControl.js'
import { RuntimeRunAuthRegistry } from '../run/auth/runAuth.js'
import {
  createRuntimeTaskGraphCreationBridge,
  type RuntimeTaskGraphCreationBridge,
} from '../taskgraph/creation/bridge/runtimePlanCreationBridge.js'
import {
  createRuntimeTaskGraphStatusBridge,
  type RuntimeTaskGraphStatusBridge,
} from '../taskgraph/read/status/bridge/runtimePlanStatusBridge.js'
import {
  createRuntimeEntityReadBridge,
  type RuntimeEntityReadBridge,
} from '../read/entity/runtimeEntityReadBridge.js'
import {
  createRuntimeThreadOperationsBridge,
  type RuntimeThreadOperationsBridge,
} from '../thread/operations/runtimeThreadOperationsBridge.js'
import {
  createRuntimeTaskRunSyncBridge,
  type RuntimeTaskRunSyncBridge,
} from '../taskgraph/task/sync/bridge/runtimeTaskRunSyncBridge.js'
import {
  createRuntimeTaskUpdateBridge,
  type RuntimeTaskUpdateBridge,
} from '../taskgraph/task/update/bridge/runtimeTaskUpdateBridge.js'
import { resolveRuntimeAgentManifest } from '../catalog/manifest/runtimeManifest.js'
import { RuntimeCatalogSnapshotRegistry } from '../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import {
  createRuntimeCatalogSnapshotBridge,
  type RuntimeCatalogSnapshotBridge,
} from '../catalog/snapshot/bridge/runtimeCatalogSnapshotBridge.js'
import { resolveRuntimeCatalogInitialization } from '../catalog/operations/initialization/runtimeCatalogInitialization.js'
import {
  createRuntimeCatalogOperationsBridge,
  type RuntimeCatalogOperationsBridge,
} from '../catalog/operations/bridge/runtimeCatalogOperationsBridge.js'
import {
  applyCatalogStateToActiveManifest,
  applyCatalogStateToLayeredRegistry,
  createRuntimeCatalogSettingsBridge,
  type RuntimeCatalogSettingsBridge,
} from '../catalog/settings/runtimeCatalogSettingsBridge.js'
import type { RuntimeWorksBridge } from '../work/bridge/runtimeWorksBridge.js'
import {
  createRuntimeTaskGraphDispatchBridge,
  type RuntimeTaskGraphDispatchBridge,
} from '../taskgraph/dispatch/bridge/runtimePlanDispatchBridge.js'
import {
  createRuntimePlanToolsBridge,
  type RuntimePlanToolsBridge,
} from '../taskgraph/tools/bridge/runtimePlanToolsBridge.js'
import {
  createRuntimeReplanBridge,
  type RuntimeReplanBridge,
} from '../taskgraph/replan/bridge/runtimeReplanBridge.js'
import {
  createRuntimeTreeCancellationBridge,
  type RuntimeTreeCancellationBridge,
} from '../taskgraph/cancellation/bridge/runtimeTreeCancellationBridge.js'
import {
  createRuntimeRunControlBridge,
  type RuntimeRunControlBridge,
} from '../run/control/bridge/runtimeRunControlBridge.js'
import {
  createRuntimeRunCancellationBridge,
  type RuntimeRunCancellationBridge,
} from '../run/control/cancellation/bridge/runtimeRunCancellationBridge.js'
import {
  createRuntimeRunCancellationGuard,
  type RuntimeRunCancellationGuard,
} from '../run/control/guard/runtimeRunCancellationGuard.js'
import {
  createRuntimeRunCreationBridge,
  type RuntimeRunCreationBridge,
} from '../run/creation/bridge/runtimeRunCreationBridge.js'
import {
  createRuntimeRunStepBridge,
  type RuntimeRunStepBridge,
} from '../run/steps/bridge/runtimeRunStepBridge.js'
import {
  createRuntimeRunExecutionSchedulerBridge,
  type RuntimeRunExecutionSchedulerBridge,
} from '../run/execution/scheduler/bridge/runtimeRunExecutionSchedulerBridge.js'
import {
  createRuntimeRecoveryBridge,
  type RuntimeRecoveryBridge,
} from '../recovery/runtimeRecoveryBridge.js'
import {
  createRuntimeRunExecutionBridge,
  type RuntimeRunExecutionBridge,
} from '../run/execution/bridge/runtimeRunExecutionBridge.js'
import {
  createRuntimeRunPreviewBridge,
  type RuntimeRunPreviewBridge,
} from '../run/preview/bridge/runtimeRunPreviewBridge.js'
import { RuntimeDeferredTaskRegistry } from '../work/tasks/runtimeDeferredTasks.js'
import {
  createRuntimePostRunRecordsBridge,
  type RuntimePostRunRecordsBridge,
} from '../read/post-run/bridge/runtimePostRunRecordsBridge.js'
import {
  createRuntimeTaskEventBridge,
  type RuntimeTaskEventBridge,
} from '../taskgraph/task/events/bridge/runtimeTaskEventBridge.js'
import {
  createRuntimeStreamBridge,
  type RuntimeStreamBridge,
} from '../stream/bridge/runtimeStreamBridge.js'
import {
  createRuntimeStreamSubscriptionBridge,
  type RuntimeStreamSubscriptionBridge,
} from '../stream/subscription/runtimeStreamSubscriptionBridge.js'
import {
  createRuntimeDraftOperationsBridge,
  type RuntimeDraftOperationsBridge,
} from '../draft/bridge/runtimeDraftOperationsBridge.js'
import {
  createRuntimeMemoryOperationsBridge,
  type RuntimeMemoryOperationsBridge,
} from '../memory/bridge/runtimeMemoryOperationsBridge.js'
import {
  createRuntimeTraceReadBridge,
  type RuntimeDebugEvidenceRefQuery,
  type RuntimeTraceReadBridge,
} from '../read/trace/runtimeTraceReadBridge.js'
import {
  createRuntimeSnapshotBridge,
  type RuntimeSnapshotBridge,
  type RuntimeSessionSnapshotV1,
  type RuntimeThreadSnapshotV2,
} from '../read/snapshot/runtimeSnapshotBridge.js'
import {
  createRuntimeWorkCoordinatorBridge,
  type RuntimeWorkCoordinatorBridge,
} from '../work/coordinator/runtimeWorkCoordinatorBridge.js'
import {
  createDefaultDraftApplyPort,
  createDefaultDraftApplyPreviewPort,
  createDefaultExternalToolGatewayPort,
  createDefaultProposalSnapshotHydrationPort,
  createDefaultProjectStandardsPort,
  createDefaultResourceFilePort,
  createDefaultImageProcessingPort,
  createDefaultVideoFrameExtractionPort,
  createDefaultRuntimeToolHandlerRegistry,
} from '../shared/tools/runtimeToolHandlers.js'
import type { DraftApplyPort } from '../../ports/draft/apply/draftApplyPort.js'
import type { DraftApplyPreviewPort } from '../../ports/draft/preview/draftApplyPreviewPort.js'
import type { DraftProposalSnapshotHydrationPort } from '../../ports/draft/hydration/proposalSnapshotHydrationPort.js'
import type { CoreResourceFilePort } from '../../ports/files/resourceFilePort.js'
import type { CoreImageProcessingPort } from '../../ports/media/imageProcessingPort.js'
import type { CoreVideoFrameExtractionPort } from '../../ports/media/videoFrameExtractionPort.js'
import type { ProjectStandardsPort } from '../../ports/project/projectStandardsPort.js'
import type { RuntimeToolHandlerRegistry } from '../../ports/runtime/runtimeToolHandlerPort.js'
import type { ExternalToolGatewayPort } from '../../ports/tools/externalToolGatewayPort.js'
import { InMemoryAgentToolResultStore, type AgentToolResultStore } from '../../state/store/tool-results/toolResultStore.js'
import { RuntimeScheduler } from '../work/scheduler/runtimeScheduler.js'
import type { RuntimeInteractionApprovalResult } from '../run/interactions/records/runtimeInteractions.js'
import { RuntimeEventSubscriberRegistry } from '../stream/subscribers/runtimeEventSubscribers.js'
import { isoNow, makeId } from '../../shared/runtime/runtimeIdentity.js'
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
  AgentRuntimeLimits,
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
} from '../../state/shared/types.js'

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
  AgentRuntimeLimits,
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
} from '../../state/shared/types.js'
export type { AgentMemory, AgentMemoryKind, MemoryQuery } from '../../memory/shared/types.js'
export type { RuntimeThreadSnapshotV2 } from '../read/snapshot/runtimeSnapshotBridge.js'
export type { AgentManifest, AgentToolGrant } from '../../catalog/manifest/agentManifest.js'
export type { AgentPluginCatalog } from '../../catalog/loading/core/loader.js'
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
} from '../../updates/policy/updatePolicy.js'
export { DEFAULT_AGENT_MANIFEST, normalizeAgentManifest } from '../../catalog/manifest/agentManifest.js'
export {
  DEFAULT_AGENT_UPDATE_POLICY,
  buildAgentUpdateState,
  evaluateAgentUpdateCandidate,
  normalizeAgentUpdateCandidate,
  normalizeAgentUpdatePolicy,
} from '../../updates/policy/updatePolicy.js'
export { InMemoryAgentMemoryStore } from '../../memory/store/in-memory/memoryStore.js'
export { InMemoryAgentStore } from '../../state/store/core/store.js'
export {
  FileAgentToolResultStore,
  InMemoryAgentToolResultStore,
  resolveAgentToolResultPath,
} from '../../state/store/tool-results/toolResultStore.js'
export {
  FileAgentDraftStore,
  InMemoryAgentDraftStore,
  normalizeDraftStatus,
  resolveAgentDraftPath,
} from '../../drafts/store/draftStore.js'
export { DEFAULT_TOOL_REGISTRY, StaticToolRegistry } from '../../tools/registry/core/toolRegistry.js'
export {
  loadAgentPluginCatalog,
  resolveAgentSkillsDir,
  resolveAgentToolsDir,
  resolveBuiltinAgentSkillsDir,
  resolveBuiltinAgentToolsDir,
} from '../../catalog/loading/core/loader.js'
export {
  FileAgentCatalogStateStore,
  InMemoryAgentCatalogStateStore,
  resolveAgentCatalogStatePath,
  type AgentCatalogState,
  type AgentCatalogStateStore,
} from '../../catalog/registry/state/catalogState.js'

export class AgentRuntimeRouter {
  private readonly mcpClient: Pick<MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  private readonly store: AgentStore
  private readonly toolResultStore: AgentToolResultStore
  private readonly draftStore: AgentDraftStore
  private readonly backendApplyClient: BackendApplyClient
  private readonly externalToolGatewayPort: ExternalToolGatewayPort
  private readonly draftApplyPort: DraftApplyPort
  private readonly draftApplyPreviewPort: DraftApplyPreviewPort
  private readonly proposalSnapshotHydrationPort: DraftProposalSnapshotHydrationPort
  private readonly resourceFilePort: CoreResourceFilePort
  private readonly imageProcessingPort: CoreImageProcessingPort
  private readonly videoFrameExtractionPort: CoreVideoFrameExtractionPort
  private readonly projectStandardsPort: ProjectStandardsPort
  private readonly runtimeToolHandlers: RuntimeToolHandlerRegistry
  private readonly memoryStore: AgentMemoryStore
  private readonly memoryManager: MemoryManager
  private readonly referenceManager: ReferenceManager
  private activeAgentManifest: AgentManifest
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
  private readonly runCreation: RuntimeRunCreationBridge
  private readonly runPreview: RuntimeRunPreviewBridge
  private readonly taskEvents: RuntimeTaskEventBridge
  private readonly taskUpdate: RuntimeTaskUpdateBridge
  private readonly planCreation: RuntimeTaskGraphCreationBridge
  private readonly planDispatch: RuntimeTaskGraphDispatchBridge
  private readonly planTools: RuntimePlanToolsBridge
  private readonly updateTaskGraph: RuntimeReplanBridge
  private readonly treeCancellation: RuntimeTreeCancellationBridge
  private readonly workCoordinator: RuntimeWorkCoordinatorBridge
  private readonly runtimeWorks: RuntimeWorksBridge
  private readonly memories: RuntimeMemoryOperationsBridge
  private readonly traceReads: RuntimeTraceReadBridge
  private readonly runtimeSnapshots: RuntimeSnapshotBridge

  constructor(options: AgentRuntimeRouterOptions) {
    this.mcpClient = options.mcpClient
    this.store = options.store ?? new InMemoryAgentStore()
    this.toolResultStore = options.toolResultStore ?? new InMemoryAgentToolResultStore()
    this.draftStore = options.draftStore ?? new InMemoryAgentDraftStore()
    this.backendApplyClient = options.backendApplyClient ?? new MCPBackendApplyClient(this.mcpClient)
    this.externalToolGatewayPort = options.externalToolGatewayPort ?? createDefaultExternalToolGatewayPort(this.mcpClient)
    this.draftApplyPort = options.draftApplyPort ?? createDefaultDraftApplyPort(this.backendApplyClient)
    this.draftApplyPreviewPort = options.draftApplyPreviewPort ?? createDefaultDraftApplyPreviewPort(this.backendApplyClient)
    this.proposalSnapshotHydrationPort = options.proposalSnapshotHydrationPort ?? createDefaultProposalSnapshotHydrationPort(this.mcpClient)
    this.resourceFilePort = options.resourceFilePort ?? createDefaultResourceFilePort(this.mcpClient)
    this.imageProcessingPort = options.imageProcessingPort ?? createDefaultImageProcessingPort(this.backendApplyClient)
    this.videoFrameExtractionPort = options.videoFrameExtractionPort ?? createDefaultVideoFrameExtractionPort(this.backendApplyClient)
    this.projectStandardsPort = options.projectStandardsPort ?? createDefaultProjectStandardsPort(this.backendApplyClient)
    this.runtimeToolHandlers = options.runtimeToolHandlers ?? createDefaultRuntimeToolHandlerRegistry()
    this.drafts = createRuntimeDraftOperationsBridge({
      draftStore: this.draftStore,
      backendApplyPort: createBackendRuntimeDraftApplyPort(this.backendApplyClient),
    })
    this.memoryStore = options.memoryStore ?? new InMemoryAgentMemoryStore()
    this.memoryManager = new MemoryManager(this.memoryStore)
    this.memories = createRuntimeMemoryOperationsBridge({
      memoryStore: this.memoryStore,
      memoryManager: this.memoryManager,
    })
    this.referenceManager = new ReferenceManager(loadAgentReferenceStore(), { backendClient: this.backendApplyClient })
    const catalogInitialization = resolveRuntimeCatalogInitialization({
      activeAgentManifest: options.activeAgentManifest,
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
    this.activeAgentManifest = applyCatalogStateToActiveManifest(
      catalogInitialization.activeAgentManifest,
      catalogState,
      this.layeredRegistry,
    )
    this.toolRegistry = catalogInitialization.toolRegistry
    this.contractResolver = options.contractResolver ?? EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER
    this.pluginCatalogInfo = catalogInitialization.pluginCatalogInfo
    this.pluginWarnings = catalogInitialization.pluginWarnings
    this.catalogSnapshotBridge = createRuntimeCatalogSnapshotBridge({
      getCatalogState: () => ({
        activeAgentManifest: this.activeAgentManifest,
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
        activeAgentManifest: this.activeAgentManifest,
        toolRegistry: this.toolRegistry,
        layeredRegistry: this.layeredRegistry,
        pluginCatalogInfo: this.pluginCatalogInfo,
        pluginWarnings: this.pluginWarnings,
      }),
      commitReload: (catalog) => {
        const catalogState = this.catalogStateStore.load()
        const layeredRegistry = applyCatalogStateToLayeredRegistry(catalog.layeredRegistry, catalogState)
        this.activeAgentManifest = applyCatalogStateToActiveManifest(
          catalog.activeAgentManifest,
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
        activeAgentManifest: this.activeAgentManifest,
        layeredRegistry: this.layeredRegistry,
      }),
      setActiveAgentManifest: (manifest) => {
        this.activeAgentManifest = manifest
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
    this.traceReads = createRuntimeTraceReadBridge({ store: this.store, toolResultStore: this.toolResultStore })
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
      externalToolGatewayPort: this.externalToolGatewayPort,
      draftApplyPort: this.draftApplyPort,
      draftApplyPreviewPort: this.draftApplyPreviewPort,
      proposalSnapshotHydrationPort: this.proposalSnapshotHydrationPort,
      resourceFilePort: this.resourceFilePort,
      imageProcessingPort: this.imageProcessingPort,
      videoFrameExtractionPort: this.videoFrameExtractionPort,
      projectStandardsPort: this.projectStandardsPort,
      memoryStore: this.memoryStore,
      memoryManager: this.memoryManager,
      referenceManager: this.referenceManager,
      contractResolver: this.contractResolver,
      catalogManager: this,
      toolResultStore: this.toolResultStore,
      runtimeToolHandlers: this.runtimeToolHandlers,
      updateState: this.updateState,
    })
    this.runExecutionScheduler = createRuntimeRunExecutionSchedulerBridge({
      controllers: this.runControllers,
      executeRun: (runId, signal) => this.runExecution.executeRun(runId, signal),
      deleteCatalogSnapshot: (runId) => this.catalogSnapshots.deleteRun(runId),
      syncTaskFromRun: (runId) => this.taskRunSync.syncTaskFromRun(runId),
      onRunSettled: (runId) => {
        void this.workCoordinator.runSettled(runId)
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
    this.planTools = createRuntimePlanToolsBridge({
      store: this.store,
      emitAssistantMessage: (run, message) => this.streams.emitAssistantMessage(run, message),
      now: () => isoNow(),
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
    this.workCoordinator = createRuntimeWorkCoordinatorBridge({
      store: this.store,
      mcpClient: this.mcpClient,
      scheduler: this.runtimeScheduler,
      createThread: (threadInput) => this.createThread(threadInput),
      createRun: (runInput) => this.createRun(runInput),
      cancelSubtree: (runId, cancelInput) => this.treeCancellation.cancelSubtree(runId, cancelInput),
      recordTrace: (targetRun, trace) => this.streams.recordTraceEvent(targetRun, trace),
      now: () => isoNow(),
    })
    this.runtimeWorks = this.workCoordinator.works
    this.runtimeSnapshots = createRuntimeSnapshotBridge({
      store: this.store,
      reconcileThread: async (threadId) => {
        await this.workCoordinator.threadOpened(threadId)
      },
      getTaskGraphSnapshot: (taskGraphId) => this.getTaskGraphSnapshot(taskGraphId),
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

  listPackCatalog(): ReturnType<RuntimeCatalogOperationsBridge['listPackCatalog']> {
    return this.catalogOperations.listPackCatalog()
  }

  listConfigFileCatalog(): ReturnType<RuntimeCatalogOperationsBridge['listConfigFileCatalog']> {
    return this.catalogOperations.listConfigFileCatalog()
  }

  setActiveAgentConfigFile(input: { configFileId?: unknown } = {}): AgentManifest {
    return this.catalogSettings.setActiveAgentConfigFile(input)
  }

  saveAgentConfigFile(input: { configFile?: unknown; activate?: unknown } = {}): ReturnType<RuntimeCatalogSettingsBridge['saveAgentConfigFile']> {
    return this.catalogSettings.saveAgentConfigFile(input)
  }

  deleteAgentConfigFile(input: { configFileId?: unknown } = {}): ReturnType<RuntimeCatalogSettingsBridge['deleteAgentConfigFile']> {
    return this.catalogSettings.deleteAgentConfigFile(input)
  }

  saveConfigFileToolPermissions(input: { configFileId?: unknown; toolGrants?: unknown } = {}): AgentManifest {
    return this.catalogSettings.saveConfigFileToolPermissions(input)
  }

  saveSkillInstructions(input: { skills?: unknown } = {}): ReturnType<RuntimeCatalogSettingsBridge['saveSkillInstructions']> {
    return this.catalogSettings.saveSkillInstructions(input)
  }

  getActiveAgentManifest(): AgentManifest {
    return this.catalogOperations.getActiveAgentManifest()
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
    return this.planTools.updatePlan(run, input)
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
    return await this.runtimeSnapshots.getThreadRuntimeSnapshot(threadId)
  }

  async getSessionRuntimeSnapshot(sessionId: string): Promise<RuntimeSessionSnapshotV1 | undefined> {
    return await this.runtimeSnapshots.getSessionRuntimeSnapshot(sessionId)
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
    const deletion = this.threads.deleteThread(id)
    if (deletion.deletedRunIds.length > 0) {
      this.toolResultStore.deleteToolResultsForRuns(deletion.deletedRunIds)
    }
    return deletion
  }

  deleteAllThreads(): AgentThreadClearResult {
    const deletion = this.threads.deleteAllThreads()
    if (deletion.deletedRunIds.length > 0) {
      this.toolResultStore.deleteToolResultsForRuns(deletion.deletedRunIds)
    }
    return deletion
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

  findRunDebugEvidenceRefs(runId: string, query: RuntimeDebugEvidenceRefQuery): ReturnType<RuntimeTraceReadBridge['findRunDebugEvidenceRefs']> { return this.traceReads.findRunDebugEvidenceRefs(runId, query) }

  getRunDebugEvidence(runId: string, evidenceId: string): ReturnType<RuntimeTraceReadBridge['getRunDebugEvidence']> { return this.traceReads.getRunDebugEvidence(runId, evidenceId) }

  getRunToolResult(runId: string, refKey: string): ReturnType<RuntimeTraceReadBridge['getRunToolResult']> { return this.traceReads.getRunToolResult(runId, refKey) }

  findRunToolResults(runId: string, query?: Parameters<RuntimeTraceReadBridge['findRunToolResults']>[1]): ReturnType<RuntimeTraceReadBridge['findRunToolResults']> { return this.traceReads.findRunToolResults(runId, query) }

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
