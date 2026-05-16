import type { MCPClient } from '../mcpClient.js'
import type { JSONValue } from '../types.js'
import { isJSONRecord, isRecord } from '../jsonValue.js'
import { DEFAULT_AGENT_MANIFEST, type AgentManifest } from '../catalog/agentManifest.js'
import {
  InMemoryAgentCatalogStateStore,
  type AgentCatalogStateStore,
} from '../catalog/state.js'
import { loadAgentPluginCatalog as loadCatalogSnapshot, type AgentPluginCatalog } from '../catalog/loader.js'
import { extractAgentContext, extractFocusTimings } from '../context/runtimeContext.js'
import { resolveAgentCapabilities } from '../tools/capabilityResolver.js'
import { MemoryManager } from '../memory/memoryManager.js'
import { InMemoryAgentMemoryStore, memoryStorePath, type AgentMemoryStore } from '../memory/memoryStore.js'
import type { AgentMemory, MemoryQuery } from '../memory/types.js'
import { KnowledgeManager, loadAgentKnowledgeStore } from '../knowledge/index.js'
import { InMemoryAgentStore, type AgentStore, type AgentTraceQuery } from '../state/store.js'
import { DEFAULT_TOOL_REGISTRY, type ToolRegistry } from '../tools/toolRegistry.js'
import {
  InMemoryAgentDraftStore,
  validateDraft,
  type AgentDraft,
  type AgentDraftStore,
} from '../drafts/draftStore.js'
import { buildApplyDraftPreview, markDraftApplied, rejectDraft, type ApplyDraftInput } from '../drafts/draftApply.js'
import { BackendApplyClient, BackendApplyHTTPError, type BackendApplyResult } from '../drafts/backendApplyClient.js'
import { MCPBackendApplyClient } from '../drafts/mcpBackendApplyClient.js'
import {
  assetProposalContainsAssetSlots,
  canonicalizeProjectProposalDraftContent,
} from '../drafts/draftRuntimeContent.js'
import {
  buildRuntimeCreateDraftInput,
  buildRuntimeDraftBackendAuth,
  buildRuntimePatchDraftInput,
  buildRuntimeUpdateDraftInput,
  requireRuntimeDraftId,
} from '../drafts/draftRuntimeInput.js'
import { generationBackendErrorData } from '../generation/generationBackendError.js'
import { runAgentGraph } from '../orchestration/agentGraph.js'
import { planSupervisorDispatch } from '../orchestration/supervisorGraph.js'
import { generatePlanTasks } from '../orchestration/planGenerator.js'
import { buildPromptMemoryIndex } from '../context/promptHygiene.js'
import {
  applyRuntimeThreadContextSummary,
  attachRuntimeThreadContextSummaryToRun,
} from '../context/runtimeThreadContextSummary.js'
import { resolveRuntimeLayers } from '../skills/runtimeLayerResolver.js'
import {
  EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
  type AgentRuntimeContractResolver,
} from '../contracts/runtimeContract.js'
import { buildAgentRun, buildRunCreationMetadata } from '../state/runFactory.js'
import {
  buildAgentRunInputSnapshot,
  normalizeAgentRunInputTask,
} from '../state/runInput.js'
import { normalizeRunHierarchyInput } from '../state/runHierarchy.js'
import {
  buildCreatePlanPlannerRunInput,
  createPlanGoal,
  normalizeCreatePlanThreadId,
} from '../state/planFactory.js'
import {
  assertDispatchPlannerRunForPlan,
  assertDispatchRequestedTasks,
  buildDispatchWorkerRunInput,
  normalizeDispatchPlanControls,
  normalizeDispatchPlanId,
} from '../state/planDispatchInput.js'
import {
  isActiveRunStatus,
  projectRunOntoThread,
} from '../state/runProjection.js'
import {
  applyRunCancellation,
  applyRunCompletion,
  applyRunExecutionStart,
  applyRunFailure,
  DEFAULT_RUN_CANCEL_REASON,
  isFinishedOrCancelledRunStatus,
  isFinishedRunStatus,
} from '../state/runStatus.js'
import { snapshotTaskForProtocolEvent, taskStatusProtocolEvent } from '../state/taskProtocolEvent.js'
import { buildSubagentSnapshotView } from '../state/planContextView.js'
import {
  assertPlannerRunCanUsePlan,
  selectReplanPlannerRunId,
} from '../state/planRunBinding.js'
import {
  applyRequiredRunAction,
  getApprovedToolNames,
} from '../state/runInteractionState.js'
import { defaultRunPolicy } from '../state/runPolicy.js'
import { buildRunRound, type AgentRunRoundInfo } from '../state/runRound.js'
import {
  buildAgentTask,
  normalizePlanTaskInputs,
  normalizePositiveInteger,
  normalizeStringList,
  selectPlannerInlineTask,
  taskExecutionOverrideMetadata,
} from '../state/planTaskInput.js'
import { assertRunCanOwnTask } from '../state/planTaskOwner.js'
import {
  timedOutWorkerRun,
} from '../state/planWorkerMaintenance.js'
import {
  buildRequestedSubagentNameMap,
  nextSubagentName,
  normalizeSubagentNameAt,
  subagentNameFromRun,
  subagentNameFromTask,
} from '../state/subagentIdentity.js'
import {
  assertSubagentNamesUniqueForTaskMap as assertSubagentNamesUniqueForTaskMapState,
  assertUniqueSubagentNameForTask as assertUniqueSubagentNameForTaskState,
  collectSubagentNames as collectSubagentNamesState,
} from '../state/subagentNameValidation.js'
import {
  isTerminalPlanStatus,
  isTerminalRunStatus,
  toSubagentRunSummary,
} from '../state/subagentRunView.js'
import {
  assistantDeltaFromTraceEvent,
  assistantMessageForRun,
  assistantMessageFromTraceEvent,
  toStreamRun,
} from '../state/runStreamView.js'
import {
  applyThreadTitleGenerationFallback,
  applyThreadTitleGenerationResult,
  markThreadTitleGenerationPending,
  shouldGenerateThreadTitle,
} from '../state/threadTitle.js'
import {
  normalizeAndValidateReplanTaskUpdates,
  normalizeReplanTaskInputsForPlan,
  normalizeReplanTaskUpdateInputs,
} from '../state/replanTaskValidation.js'
import {
  resolvePreviewRunMessageInput,
  resolveRunCreationUserInput,
  resolveRunExecutionInput,
  resolveRunTitleUser,
  resolveToolRunThreadTitle,
  resolveToolRunUserMessage,
} from './runExecutionInput.js'
import {
  assertRunExecutionNotCancelled,
  collectRunSubtreeIds,
  createAbortError,
  durationBetweenMs,
  isAbortError,
  normalizeCancelReason,
  normalizeOptionalCancelReason,
  RuntimeRunControllerRegistry,
} from './runLifecycleControl.js'
import { normalizeNonEmptyString, numberField, uniqueStrings } from './runtimeScalarInput.js'
import {
  normalizeBackendAPIBaseURL,
  normalizeBackendAuthToken,
  runBackendAuthMetadata,
  RuntimeRunAuthRegistry,
} from './runAuth.js'
import {
  attachPlannerRunToRuntimePlan,
  findRuntimeThreadPlan,
  requireRuntimePlannerRun,
  resolveRuntimePlannerRunPlanId,
} from './runtimePlanBinding.js'
import {
  requireRuntimePlan,
  requireRuntimeRun,
  requireRuntimeTask,
  requireRuntimeThread,
} from './runtimeStoreLookup.js'
import { assignRuntimeTaskToPlannerRun } from './runtimeTaskAssignment.js'
import {
  buildRuntimeSubagentRunCancellationResult,
  cancelPendingRuntimeSubagentTask,
  resolveRuntimeSubagentCancellationTarget,
} from './runtimeSubagentTaskCancellation.js'
import { createRuntimeMessage } from './runtimeMessageFactory.js'
import { attachRuntimePlanDebugContext } from './runtimePlanContext.js'
import { updateRuntimeThreadRunStatus } from './runtimeThreadProjection.js'
import { buildRuntimeReplanTasksToCreate } from './runtimeReplanTaskCreation.js'
import { createRuntimePlanWithTasks } from './runtimePlanCreation.js'
import { recomputeRuntimePlanStatus } from './runtimePlanProjection.js'
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
  resetRetryableRuntimePlanTasks,
  resetRuntimePlanTasksForReplan,
} from './runtimePlanTaskMaintenance.js'
import { syncRuntimeTaskFromRun } from './runtimeTaskRunSync.js'
import { updateRuntimeTask } from './runtimeTaskUpdate.js'
import {
  markRuntimeTaskDispatchBlocked,
  markRuntimeTaskDispatchedToWorker,
} from './runtimeTaskDispatch.js'
import { markRuntimeTimedOutWorkerTask } from './runtimeWorkerTimeout.js'
import { resolveRuntimeAgentManifest } from './runtimeManifest.js'
import {
  buildRuntimeCatalogSnapshot,
  type AgentRuntimeCatalogSnapshot,
  RuntimeCatalogSnapshotRegistry,
} from './runtimeCatalogSnapshot.js'
import {
  getRuntimeDefaultAgentManifest,
  inspectRuntimeAgentCatalog,
  listRuntimeRegisteredTools,
  listRuntimeSkillCatalog,
} from './runtimeCatalogRead.js'
import { reloadRuntimeAgentCatalog } from './runtimeCatalogReload.js'
import { resolveRuntimeCapabilities } from './runtimeCapabilities.js'
import {
  answerRuntimeRunInputRequest,
  approveRuntimeRunInteraction,
  rejectRuntimeRunInteraction,
} from './runtimeRunInteraction.js'
import {
  listRuntimeSubagents,
  waitRuntimeSubagent,
} from './runtimeSubagentRead.js'
import { RuntimeDeferredTaskRegistry } from './runtimeDeferredTasks.js'
import { RuntimeEventSubscriberRegistry } from './runtimeEventSubscribers.js'
import { isoNow, makeId } from './runtimeIdentity.js'
import { appendRunStep, appendTraceEvent, buildRunTracePage, completeRunStep, normalizeTracePageLimit } from '../state/runTrace.js'
import { buildRunSetupMetadata } from '../state/runSetup.js'
import { contextManager } from '../contextManager/contextManager.js'
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
  ToolCall,
  UpdatePlanTaskInput,
  UpdateThreadInput,
} from '../state/types.js'
import { normalizeClientInput } from '../context/normalizeClientInput.js'
import {
  normalizeDraftQuery,
} from '../context/normalizeRunInput.js'
import { normalizeApprovedToolNames, normalizeToolCall } from '../tools/toolCallInput.js'
import { buildRollbackMetadata, buildToolRollbackRecords } from '../tools/toolRollbackRecords.js'
import { buildDebugContext, buildDebugTrace } from '../context/debugContext.js'
import { parseAgentCommand } from '../context/commandRouter.js'
import { planPreviewToolRequests } from '../orchestration/previewPlanner.js'
import {
  buildLocalDiagnosticCommand,
  buildLocalDiagnosticFallbackContextResult,
  isLocalDiagnosticCommand,
  parseGenerationDebugCommand,
} from '../context/localDiagnosticCommands.js'
import { executeTool } from '../orchestration/toolExecutor.js'
import { buildFinalAssistantContent, combineAssistantTurnContents } from './assistantMessage.js'
import {
  appendThreadMessage,
  recordThreadClientInput,
} from './threadLifecycle.js'
import { buildGenerationEvent } from '../generation/generationEvents.js'
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
  private readonly catalogSnapshots: RuntimeCatalogSnapshotRegistry
  private readonly catalogStateStore: AgentCatalogStateStore
  private readonly pluginCatalogLoader?: NonNullable<AgentRuntimeOptions['pluginCatalogLoader']>
  private readonly updateState?: AgentCapabilitiesResponse['updates']
  private readonly runControllers = new RuntimeRunControllerRegistry()
  private readonly runAuth = new RuntimeRunAuthRegistry()
  private readonly runStreamSubscribers = new RuntimeEventSubscriberRegistry<AgentRunStreamEvent>()
  private readonly planStreamSubscribers = new RuntimeEventSubscriberRegistry<AgentPlanStreamEvent>()
  private readonly postRunRecordTasks = new RuntimeDeferredTaskRegistry()

  constructor(options: AgentRuntimeOptions) {
    this.mcpClient = options.mcpClient
    this.store = options.store ?? new InMemoryAgentStore()
    this.draftStore = options.draftStore ?? new InMemoryAgentDraftStore()
    this.backendApplyClient = options.backendApplyClient ?? new MCPBackendApplyClient(this.mcpClient)
    this.memoryStore = options.memoryStore ?? new InMemoryAgentMemoryStore()
    this.memoryManager = new MemoryManager(this.memoryStore)
    this.knowledgeManager = new KnowledgeManager(loadAgentKnowledgeStore())
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
    this.catalogSnapshots = new RuntimeCatalogSnapshotRegistry(this.createCatalogSnapshot())
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

  private createCatalogSnapshot(): AgentRuntimeCatalogSnapshot {
    return buildRuntimeCatalogSnapshot({
      id: makeId('catalog'),
      defaultAgentManifest: this.defaultAgentManifest,
      toolRegistry: this.toolRegistry,
      layeredRegistry: this.layeredRegistry,
      pluginCatalogInfo: this.pluginCatalogInfo,
      pluginWarnings: this.pluginWarnings,
    })
  }

  reloadAgentCatalog(): JSONValue {
    const reload = reloadRuntimeAgentCatalog({
      load: this.pluginCatalogLoader,
      current: {
        catalogVersion: this.pluginCatalogInfo?.metadata?.catalogVersion as string | null | undefined ?? null,
        skillCount: this.layeredRegistry.skills.size,
        toolCount: this.layeredRegistry.tools.size,
      },
    })
    if (reload.status !== 'reloaded') return reload.response

    const catalog = reload.catalog
    this.defaultAgentManifest = catalog.manifest
    this.toolRegistry = catalog.registry
    this.layeredRegistry = catalog.layeredRegistry
    this.pluginWarnings = catalog.warnings
    this.pluginCatalogInfo = reload.pluginCatalogInfo
    this.catalogSnapshots.replaceCurrent(this.createCatalogSnapshot())
    return reload.response
  }

  inspectAgentCatalog(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    return inspectRuntimeAgentCatalog({
      catalogSnapshots: this.catalogSnapshots,
      run,
      request: input,
    })
  }

  async createAgentPlan(run: AgentRun, input: Record<string, JSONValue> = {}): Promise<JSONValue> {
    const plannerRun = requireRuntimePlannerRun(this.store, run.id)
    if (plannerRun.planId) {
      return {
        status: 'exists',
        planId: plannerRun.planId,
        plannerRunId: plannerRun.id,
        snapshot: this.getPlanSnapshot(plannerRun.planId),
      } as unknown as JSONValue
    }
    const existingPlan = findRuntimeThreadPlan(this.store, plannerRun.threadId)
    if (existingPlan) {
      attachPlannerRunToRuntimePlan({
        store: this.store,
        runId: plannerRun.id,
        planId: existingPlan.id,
        source: 'movscript_create_plan',
        now: isoNow(),
      })
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
    attachPlannerRunToRuntimePlan({
      store: this.store,
      runId: plannerRun.id,
      planId: snapshot.plan.id,
      source: 'movscript_create_plan',
      now: isoNow(),
    })
    const plan = requireRuntimePlan(this.store, snapshot.plan.id)
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
    const plannerRun = requireRuntimePlannerRun(this.store, run.id)
    const planId = normalizeNonEmptyString(input.planId) ?? plannerRun.planId ?? findRuntimeThreadPlan(this.store, plannerRun.threadId)?.id
    if (!planId) throw new Error('get_plan requires planId or a planner run plan')
    const plan = requireRuntimePlan(this.store, planId)
    if (plan.threadId !== plannerRun.threadId) throw new Error(`planner run ${plannerRun.id} cannot inspect plan ${planId}`)
    return {
      status: 'ok',
      planId,
      plannerRunId: plannerRun.id,
      snapshot: this.getPlanSnapshot(planId),
    } as unknown as JSONValue
  }

  replanAgentPlan(run: AgentRun, input: Record<string, JSONValue> = {}): JSONValue {
    const plannerRun = requireRuntimePlannerRun(this.store, run.id)
    const planId = resolveRuntimePlannerRunPlanId({
      store: this.store,
      plannerRun,
      inputPlanId: input.planId,
      source: 'movscript_replan',
      action: 'replan',
      now: isoNow(),
    })
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
    const plannerRun = requireRuntimePlannerRun(this.store, run.id)
    const planId = plannerRun.planId
    if (!planId) {
      throw new Error('spawn_subagent requires the planner run to be attached to the session plan. Call movscript_create_plan first with the task list or goal, then call movscript_spawn_subagent using taskIds or tasks and explicit English human subagentName values such as Einstein or Turing.')
    }
    const createdTaskIds: string[] = []
    const taskInputs = normalizePlanTaskInputs(input.tasks)
    const usedSubagentNames = collectSubagentNamesState(this.store.listTasks(planId), this.store.listRuns({ planId }))
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
        const task = taskToCreateById.get(taskId) ?? requireRuntimeTask(this.store, taskId)
        if (task.planId !== planId) throw new Error(`task ${taskId} does not belong to plan ${planId}`)
        const existingName = subagentNameFromTask(task)
        const name = existingName ?? nextSubagentName(usedSubagentNames)
        subagentNameByTaskId.set(taskId, name)
        usedSubagentNames.add(name)
      }
    }
    for (const taskId of requestedTaskIds) {
      const task = taskToCreateById.get(taskId) ?? requireRuntimeTask(this.store, taskId)
      if (task.planId !== planId) throw new Error(`task ${taskId} does not belong to plan ${planId}`)
      const subagentName = subagentNameByTaskId.get(taskId)
      if (subagentName) {
        assertUniqueSubagentNameForTaskState({
          planId,
          taskId,
          subagentName,
          requestedNames: subagentNameByTaskId,
          tasks: this.store.listTasks(planId),
          runs: this.store.listRuns({ planId }),
        })
      }
    }
    for (const task of tasksToCreate) {
      this.store.createTask(task)
      this.recordTaskProtocolEvents(task)
      this.emitPlanTaskEvent(planId, task)
      createdTaskIds.push(task.id)
    }

    for (const taskId of requestedTaskIds) {
      const task = requireRuntimeTask(this.store, taskId)
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
      spawnedRuns: dispatch.spawnedRuns.map((run) => toSubagentRunSummary(run)),
      blockedTaskIds: dispatch.blockedTaskIds,
      retriedTaskIds: dispatch.retriedTaskIds,
      timedOutRunIds: dispatch.timedOutRunIds,
      snapshot: buildSubagentSnapshotView({ snapshot: this.getPlanSnapshot(planId), plannerRunId: plannerRun.id }),
    } as unknown as JSONValue
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
    const plannerRun = requireRuntimePlannerRun(this.store, run.id)
    const target = resolveRuntimeSubagentCancellationTarget({
      store: this.store,
      plannerRun,
      request: input,
    })
    if (target.kind === 'pending_task') {
      const result = cancelPendingRuntimeSubagentTask({
        store: this.store,
        plannerRun,
        taskId: target.taskId,
        reason: input.reason,
        updateTask: (targetTaskId, update) => this.updateTask(targetTaskId, update),
      })
      return {
        ...result,
        snapshot: buildSubagentSnapshotView({ snapshot: this.getPlanSnapshot(target.planId), plannerRunId: plannerRun.id }),
      } as unknown as JSONValue
    }

    const result = this.cancelSubtree(target.runId, { reason: input.reason })
    return buildRuntimeSubagentRunCancellationResult({
      store: this.store,
      plannerRun,
      runId: target.runId,
      cancelledRunIds: result.cancelledRunIds,
      getPlanSnapshot: (planId) => this.getPlanSnapshot(planId),
    }) as unknown as JSONValue
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
    if (typeof input.threadId !== 'string' || !input.threadId) throw new Error('threadId is required')
    const thread = requireRuntimeThread(this.store, input.threadId)
    const clientInput = normalizeClientInput(input.clientInput)
    if (clientInput) {
      recordThreadClientInput(thread, clientInput)
      this.store.updateThread(thread)
    }
    const now = isoNow()
    const catalogSnapshot = this.catalogSnapshots.current
    const hasExplicitAgentManifest = input.agentManifest !== undefined
    const agentManifest = resolveRuntimeAgentManifest({
      inputManifest: input.agentManifest,
      defaultAgentManifest: catalogSnapshot.defaultAgentManifest,
    })
    const runtimeContract = this.contractResolver.find(agentManifest)
    const approvedToolNames = normalizeApprovedToolNames(input.approvedToolNames)
    const policy = defaultRunPolicy({ sandboxMode: input.sandboxMode === true, policy: input.policy })
    const runUserInput = resolveRunCreationUserInput({ userMessage: input.userMessage, thread })
    const hierarchy = normalizeRunHierarchyInput(input, { defaultRole: 'planner' })
    const taskSnapshot = normalizeAgentRunInputTask(input.task)
    const runInput = buildAgentRunInputSnapshot({
      now,
      ...(runUserInput.sourceUser ? { sourceMessage: runUserInput.sourceUser } : {}),
      ...(runUserInput.explicitUserMessage ? { userMessage: runUserInput.explicitUserMessage } : {}),
      ...(clientInput ? { clientInput: clientInput as unknown as JSONValue } : {}),
      ...(taskSnapshot ? { task: taskSnapshot } : {}),
      ...hierarchy,
    })
    const run = buildAgentRun({
      id: makeId('run'),
      threadId: input.threadId,
      agentManifest,
      policy,
      now,
      runtimeContract,
      ...(approvedToolNames.length > 0 ? { approvedToolNames } : {}),
      ...(clientInput ? { clientInput: clientInput as unknown as JSONValue } : {}),
      ...(runUserInput.sourceUser ? { initialUserMessageId: runUserInput.sourceUser.id } : {}),
      runInput,
      ...hierarchy,
    })
    this.catalogSnapshots.rememberRun(run.id, catalogSnapshot)
    run.metadata = buildRunCreationMetadata({
      existing: run.metadata,
      inputMetadata: input.metadata,
      hasExplicitAgentManifest,
      catalogSnapshot,
    })
    this.runAuth.remember(run.id, input)
    this.store.createRun(run)
    projectRunOntoThread(thread, run)
    thread.updatedAt = now
    this.store.updateThread(thread)
    this.startRunExecution(run.id)
    return run
  }

  createToolRun(input: CreateToolRunInput): AgentRun {
    const toolCall = normalizeToolCall(input.toolCall)
    if (!toolCall) throw new Error('toolCall is required')
    const thread = typeof input.threadId === 'string' && input.threadId
      ? requireRuntimeThread(this.store, input.threadId)
      : this.createThread({
        title: resolveToolRunThreadTitle({ title: input.title, toolName: toolCall.name }),
      })
    const clientInput = normalizeClientInput(input.clientInput)
    const message = resolveToolRunUserMessage({ clientInput, message: input.message, toolName: toolCall.name })
    const userMessage = createRuntimeMessage({ threadId: thread.id, role: 'user', content: message })
    appendThreadMessage({ thread, message: userMessage, clientInput })
    this.store.updateThread(thread)
    const now = isoNow()
    const approvedToolNames = normalizeApprovedToolNames(input.approvedToolNames)
    const catalogSnapshot = this.catalogSnapshots.current
    const hasExplicitAgentManifest = input.agentManifest !== undefined
    const agentManifest = resolveRuntimeAgentManifest({
      inputManifest: input.agentManifest,
      defaultAgentManifest: catalogSnapshot.defaultAgentManifest,
    })
    const runtimeContract = this.contractResolver.find(agentManifest)
    const policy = defaultRunPolicy({ sandboxMode: input.sandboxMode === true, policy: input.policy })
    const hierarchy = normalizeRunHierarchyInput(input, { defaultRole: 'worker' })
    const runInput = buildAgentRunInputSnapshot({
      now,
      sourceMessage: userMessage,
      ...(clientInput ? { clientInput: clientInput as unknown as JSONValue } : {}),
      forcedToolCall: toolCall,
      ...hierarchy,
    })
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
      runInput,
      ...hierarchy,
    })
    this.catalogSnapshots.rememberRun(run.id, catalogSnapshot)
    run.metadata = buildRunCreationMetadata({
      existing: run.metadata,
      hasExplicitAgentManifest,
      catalogSnapshot,
    })
    this.runAuth.remember(run.id, input)
    this.store.createRun(run)
    projectRunOntoThread(thread, run)
    thread.updatedAt = now
    this.store.updateThread(thread)
    this.startRunExecution(run.id)
    return run
  }

  async previewRun(input: PreviewRunInput): Promise<AgentRunPreview> {
    const thread = typeof input.threadId === 'string' && input.threadId
      ? requireRuntimeThread(this.store, input.threadId)
      : undefined
    const clientInput = normalizeClientInput(input.clientInput)
    const { message } = resolvePreviewRunMessageInput({ clientInput, message: input.message, thread })
    const command = parseAgentCommand(message)

    const now = isoNow()
    const catalogSnapshot = this.catalogSnapshots.current
    const hasExplicitAgentManifest = input.agentManifest !== undefined
    const agentManifest = resolveRuntimeAgentManifest({
      inputManifest: input.agentManifest,
      defaultAgentManifest: catalogSnapshot.defaultAgentManifest,
    })
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
      contractResolver: this.contractResolver,
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
    const threadId = normalizeCreatePlanThreadId(input.threadId)
    if (!threadId) throw new Error('threadId is required')
    const thread = requireRuntimeThread(this.store, threadId)
    const existingPlan = findRuntimeThreadPlan(this.store, thread.id)
    if (existingPlan) throw new Error(`thread ${thread.id} already has plan ${existingPlan.id}`)
    const now = isoNow()
    let tasksInput = normalizePlanTaskInputs(input.tasks)
    const planGoal = createPlanGoal(input)
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
    const { plan, tasks: createdTasks } = createRuntimePlanWithTasks({
      store: this.store,
      planId: makeId('plan'),
      thread,
      planInput: input,
      taskInputs: tasksInput,
      now,
      ...(planGoal ? { goal: planGoal } : {}),
      ...(plannerSource ? { plannerSource } : {}),
      ...(plannerWarnings.length > 0 ? { plannerWarnings } : {}),
    })
    for (const task of createdTasks) {
      this.recordTaskProtocolEvents(task)
    }

    let rootRun: AgentRun | undefined
    const inlinePlannerTask = selectPlannerInlineTask(createdTasks)
    if (input.createPlannerRun !== false) {
      rootRun = this.createRun(buildCreatePlanPlannerRunInput({
        plan,
        thread,
        planInput: input,
        ...(inlinePlannerTask ? { inlinePlannerTask } : {}),
      }))
      plan.rootRunId = rootRun.id
      plan.status = 'running'
      plan.updatedAt = isoNow()
      this.store.updatePlan(plan)
      if (inlinePlannerTask) {
        const { task, previousTask } = assignRuntimeTaskToPlannerRun({
          store: this.store,
          taskId: inlinePlannerTask.id,
          runId: rootRun.id,
          now: isoNow(),
        })
        this.recordTaskProtocolEvents(task, previousTask)
        this.emitPlanTaskEvent(task.planId, task)
      }
    }

    return this.getPlanSnapshot(plan.id)
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
    const { task, previousTask } = updateRuntimeTask({
      store: this.store,
      taskId,
      update: input,
      now: isoNow(),
    })
    this.recomputePlanStatus(task.planId)
    this.recordTaskProtocolEvents(task, previousTask)
    this.emitPlanTaskEvent(task.planId, task)
    return task
  }

  cancelSubtree(runId: string, input: CancelRunInput = {}): { cancelledRunIds: string[] } {
    requireRuntimeRun(this.store, runId)
    const reason = normalizeCancelReason(input.reason)
    const runIds = collectRunSubtreeIds(runId, (id) => this.store.listChildRuns(id))
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
    const run = requireRuntimePlannerRun(this.store, runId)
    if (!run.planId) throw new Error(`planner run ${runId} is not attached to a plan`)
    const plan = requireRuntimePlan(this.store, run.planId)
    if (plan.rootRunId && plan.rootRunId !== run.id) {
      throw new Error(`planner run ${run.id} is not the root planner for plan ${plan.id}`)
    }
    return this.cancelSubtree(run.id, input)
  }

  dispatchPlan(input: DispatchPlanInput): DispatchPlanResult {
    const planId = normalizeDispatchPlanId(input.planId)
    const plan = requireRuntimePlan(this.store, planId)
    const dispatch = normalizeDispatchPlanControls(input, plan)
    const plannerRun = requireRuntimePlannerRun(this.store, dispatch.plannerRunId)
    assertDispatchPlannerRunForPlan(plannerRun, plan)
    const timedOutRunIds = this.cancelTimedOutPlanWorkers(plan.id, dispatch.workerTimeoutMs)
    const retriedTaskIds = dispatch.retryFailed ? this.resetRetryablePlanTasks(plan.id, dispatch.maxTaskAttempts) : []
    const requestedTaskIds = dispatch.requestedTaskIds
    assertDispatchRequestedTasks({
      planId: plan.id,
      taskIds: requestedTaskIds,
      getTask: (taskId) => this.store.getTask(taskId),
    })
    const tasks = this.store.listTasks(plan.id)
    const runs = this.store.listRuns({ planId: plan.id })
    const decision = planSupervisorDispatch({
      plan,
      tasks,
      runs,
      maxWorkers: dispatch.maxWorkers,
      ...(requestedTaskIds.length > 0 ? { taskIds: requestedTaskIds } : {}),
    })
    const now = isoNow()
    for (const blocked of decision.blockedTasks) {
      const task = markRuntimeTaskDispatchBlocked({
        store: this.store,
        taskId: blocked.task.id,
        blockedReason: blocked.blockedReason,
        now,
      })
      if (task) this.emitPlanTaskEvent(plan.id, task)
    }

    const spawnedRuns: AgentRun[] = []
    const usedSubagentNames = collectSubagentNamesState(this.store.listTasks(plan.id), this.store.listRuns({ planId: plan.id }))
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
      const run = this.createRun(buildDispatchWorkerRunInput({
        plan,
        plannerRun,
        task: workerTask,
        subagentName,
        dispatchInput: input,
      }))
      const dispatchedRun = run
      const { task: dispatchedTask, previousTask } = markRuntimeTaskDispatchedToWorker({
        store: this.store,
        taskId: task.id,
        workerRunId: run.id,
        now,
      })
      this.recordTaskProtocolEvents(dispatchedTask, previousTask)
      this.emitPlanTaskEvent(plan.id, dispatchedTask)
      spawnedRuns.push(dispatchedRun)
    }
    this.recomputePlanStatus(plan.id)
    return {
      plan: requireRuntimePlan(this.store, plan.id),
      spawnedRuns,
      blockedTaskIds: decision.blockedTasks.map((item) => item.task.id),
      retriedTaskIds,
      timedOutRunIds,
    }
  }

  replanRun(runId: string, input: ReplanRunInput = {}): ReplanRunResult {
    const run = requireRuntimeRun(this.store, runId)
    if (!run.planId) throw new Error(`run ${runId} is not attached to a plan`)
    const plan = requireRuntimePlan(this.store, run.planId)
    const plannerRunId = selectReplanPlannerRunId({ run, plan, inputPlannerRunId: input.plannerRunId })
    const plannerRun = requireRuntimePlannerRun(this.store, plannerRunId)
    assertPlannerRunCanUsePlan({ plannerRun, plan, action: 'replan' })

    const now = isoNow()
    const taskInputs = normalizeReplanTaskInputsForPlan({
      planId: plan.id,
      tasks: input.tasks,
      addTasks: input.addTasks,
      getTask: (taskId) => this.store.getTask(taskId),
    })
    const tasksToCreate = buildRuntimeReplanTasksToCreate({
      store: this.store,
      planId: plan.id,
      inputs: taskInputs.creates,
      now,
    })
    const updatesToApply = normalizeAndValidateReplanTaskUpdates({
      planId: plan.id,
      existingTasks: this.store.listTasks(plan.id),
      tasksToCreate,
      updates: [
        ...taskInputs.updates,
        ...normalizeReplanTaskUpdateInputs(input),
      ],
      getTask: (taskId) => this.store.getTask(taskId),
      validateOwnerRun: (ownerRunId, task) => {
        assertRunCanOwnTask(requireRuntimeRun(this.store, ownerRunId), task)
      },
      validateTaskNames: (tasksById) => assertSubagentNamesUniqueForTaskMapState({
        planId: plan.id,
        tasksById,
        runs: this.store.listRuns({ planId: plan.id }),
      }),
    })
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
      plan: requireRuntimePlan(this.store, plan.id),
      createdTaskIds,
      updatedTaskIds: uniqueStrings(updatedTaskIds),
      resetTaskIds,
      ...(dispatch ? { dispatch } : {}),
    }
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
    return this.runStreamSubscribers.subscribe(runId, listener, (target) => this.replayRunStream(run, target))
  }

  subscribePlanStream(planId: string, listener: (event: AgentPlanStreamEvent) => void): () => void {
    requireRuntimePlan(this.store, planId)
    return this.planStreamSubscribers.subscribe(planId, listener, (target) => this.replayPlanStream(planId, target))
  }

  approveRun(runId: string, input: ApproveRunInput = {}): AgentRun {
    const now = isoNow()
    const { run } = approveRuntimeRunInteraction({
      store: this.store,
      runId,
      approvalInput: input,
      now,
      projectionNow: isoNow(),
      beforePersist: (targetRun, approval) => {
        this.recordTraceEvent(targetRun, {
          kind: 'approval',
          title: 'Approval granted',
          summary: approval.approvingAll ? 'Approved all pending tool calls.' : `Approved ${approval.selectedApprovalIds.length + approval.selectedToolNames.length} pending action(s).`,
          status: 'completed',
          data: {
            eventType: 'approval.resolved',
            outcome: 'approved',
            approvalIds: approval.selectedApprovalIds,
            toolNames: approval.selectedToolNames,
            approvedToolNames: approval.approvedToolNames,
          },
        })
      },
    })
    this.emitRunSnapshot(run)
    this.runAuth.remember(run.id, input)
    this.startRunExecution(run.id)
    return run
  }

  rejectRun(runId: string, input: RejectRunInput = {}): AgentRun {
    const now = isoNow()
    const { run } = rejectRuntimeRunInteraction({
      store: this.store,
      runId,
      rejectionInput: input,
      messageId: makeId('msg'),
      now,
      summaryNow: isoNow(),
      beforeMessage: (targetRun, rejection, warning) => {
        this.recordTraceEvent(targetRun, {
          kind: 'approval',
          title: 'Approval rejected',
          summary: warning,
          status: 'blocked',
          data: {
            eventType: 'approval.resolved',
            outcome: 'denied',
            rejectedToolNames: rejection.rejectedToolNames,
          },
        })
      },
      beforePersist: (targetRun, rejection, message) => {
        const step = this.createStep(targetRun, 'message')
        completeRunStep(step, {
          completedAt: now,
          result: { messageId: message.id, rejectedToolNames: rejection.rejectedToolNames },
        })
      },
    })
    this.emitRunSnapshot(run, { done: true })
    return run
  }

  cancelRun(runId: string, input: CancelRunInput = {}): AgentRun {
    const run = requireRuntimeRun(this.store, runId)
    if (run.status === 'cancelled') return run
    if (isFinishedRunStatus(run.status)) return run
    const controller = this.runControllers.get(runId)
    const reason = normalizeOptionalCancelReason(input.reason)
    controller?.abort(createAbortError(reason ?? 'Run was cancelled.'))
    return this.markRunCancelled(run, reason)
  }

  answerRunInputRequest(runId: string, input: AnswerRunInputRequestInput = {}): AgentRun {
    const now = isoNow()
    const { run } = answerRuntimeRunInputRequest({
      store: this.store,
      runId,
      answerInput: input,
      messageId: makeId('msg'),
      now,
      beforePersist: (targetRun, answer) => {
        this.recordTraceEvent(targetRun, {
          kind: 'input',
          title: 'User input received',
          summary: answer.request.title,
          status: 'completed',
          data: {
            requestId: answer.request.id,
            choiceIds: answer.choiceIds,
            ...(answer.text ? { text: answer.text } : {}),
          },
        })
      },
    })
    this.emitRunSnapshot(run)
    this.runAuth.remember(run.id, input)
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
    return this.draftStore.createDraft(buildRuntimeCreateDraftInput(input))
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
    const { draftId, update } = buildRuntimeUpdateDraftInput(input)
    return this.draftStore.updateDraft(draftId, update)
  }

  patchDraft(input: {
    draftId?: unknown
    ops?: unknown
    expectedUpdatedAt?: unknown
    metadata?: unknown
  }): JSONValue {
    const { draftId, patch } = buildRuntimePatchDraftInput(input)
    const result = this.draftStore.patchDraft(draftId, patch)
    return {
      status: 'patched',
      ...result,
      validation: validateDraft(result.draft),
    } as unknown as JSONValue
  }

  validateDraft(input: { draftId?: unknown }): JSONValue {
    const draftId = requireRuntimeDraftId(input.draftId, 'validate draft')
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
    if (preview.draft.kind === 'asset_proposal' && !assetProposalContainsAssetSlots(preview.draft.content)) {
      return {
        ok: true,
        stage: 'local_validation',
        draftId: preview.draft.id,
        validation,
        message: 'Asset proposal draft is locally valid. It is a planning artifact; backend apply is intentionally not performed.',
      } as unknown as JSONValue
    }
    try {
      const backendApply = await this.backendApplyClient.previewApplyReview(preview.review, buildRuntimeDraftBackendAuth(input))
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
    if (preview.draft.kind === 'asset_proposal' && !assetProposalContainsAssetSlots(preview.draft.content)) {
      const finalDraft = markDraftApplied(this.draftStore, preview.draft, preview.review, input, {
        appliedBy: 'movscript-ui',
        backendWritePerformed: false,
        backendApplySkippedReason: 'asset proposal contains candidate plans only; project snapshot apply was skipped',
      })
      return {
        status: 'applied',
        review: preview.review,
        draft: finalDraft,
        message: 'Asset candidate planning draft marked applied locally. Backend project snapshot apply was skipped.',
        backendApply: { performed: false, skippedReason: 'asset proposal contains candidate plans only' },
      } as unknown as JSONValue
    }
    let backendApply: BackendApplyResult
    try {
      backendApply = await this.backendApplyClient.applyReview(preview.review, buildRuntimeDraftBackendAuth(input, {
        includeAppliedByUserId: true,
      }))
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
    const rebasedContent = canonicalizeProjectProposalDraftContent(preview.draft, backendApply)
    const rebasedDraft = rebasedContent
      ? this.draftStore.updateDraft(preview.draft.id, {
          content: rebasedContent,
          metadata: {
            canonicalizedAfterApply: true,
            canonicalizedAt: isoNow(),
          },
        })
      : preview.draft
    const finalDraft = markDraftApplied(this.draftStore, rebasedDraft, preview.review, input, {
      appliedBy: 'movscript-ui',
      backendWritePerformed: backendApply.performed,
      backendApply: backendApply as unknown as JSONValue,
      ...(rebasedContent ? { canonicalizedAfterApply: true } : {}),
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
    await this.postRunRecordTasks.flush()
  }

  private startRunExecution(runId: string): void {
    const controller = this.runControllers.create(runId)
    void this.executeRun(runId, controller.signal).finally(() => {
      this.runControllers.release(runId, controller)
      this.catalogSnapshots.deleteRun(runId)
      this.syncTaskFromRun(runId)
    })
  }

  private async ensureThreadTitle(
    thread: AgentThread,
    userMessage: AgentMessage | undefined,
    input: { backendAuthToken?: unknown; backendAPIBaseURL?: unknown },
    signal?: AbortSignal,
    runId?: string,
  ): Promise<void> {
    if (!shouldGenerateThreadTitle(thread, userMessage)) return
    if (!userMessage) return
    markThreadTitleGenerationPending(thread, isoNow())
    this.store.updateThread(thread)

    try {
      const { resolveRuntimeChatModelConfig } = await import('../model/modelConfig.js')
      const modelConfig = resolveRuntimeChatModelConfig()
      if (!modelConfig) throw new Error('no model config found')
      const result = await callModel({
        config: modelConfig,
        auth: {
          ...normalizeBackendAuthToken(input.backendAuthToken),
          ...normalizeBackendAPIBaseURL(input.backendAPIBaseURL),
        },
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: [
              'You generate short chat thread titles.',
              'Return only the title text.',
              'Use the same language as the user message.',
              'Keep it under 12 Chinese characters or 6 English words.',
              'Do not add quotes, punctuation, or explanations.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: userMessage.content.slice(0, 1200),
          },
        ],
        signal,
        retry: { maxAttempts: 1 },
      })
      applyThreadTitleGenerationResult({
        thread,
        userMessage,
        modelTitle: result.content,
        now: isoNow(),
      })
    } catch (error) {
      applyThreadTitleGenerationFallback({
        thread,
        userMessage,
        error,
        now: isoNow(),
      })
    }
    thread.updatedAt = isoNow()
    this.store.updateThread(thread)
    if (runId && thread.title?.trim()) {
      this.emitRunStreamEvent(runId, {
        type: 'thread_title',
        runId,
        threadId: thread.id,
        title: thread.title.trim(),
        updatedAt: thread.updatedAt,
      })
    }
  }

  private async executeRun(runId: string, signal?: AbortSignal): Promise<void> {
    const run = this.store.getRun(runId)
    if (!run) return
    if (run.status === 'cancelled') return
    this.throwIfRunCancelled(runId, signal)
    const initialThread = requireRuntimeThread(this.store, run.threadId)
    const initialUser = resolveRunTitleUser(run, initialThread)
    await this.ensureThreadTitle(initialThread, initialUser, this.runAuth.get(run.id), signal, run.id)
    let catalogSnapshot = this.catalogSnapshots.getForRun(runId)

    const runStartedAt = Date.now()
    applyRunExecutionStart(run, isoNow())
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
    updateRuntimeThreadRunStatus({ store: this.store, threadId: run.threadId, status: run.status, runId: run.id, now: isoNow() })
    this.emitRunSnapshot(run)

    try {
      this.throwIfRunCancelled(run.id, signal)
      const thread = requireRuntimeThread(this.store, run.threadId)
      const executionInput = resolveRunExecutionInput(run, thread)
      const executionUserMessage = executionInput.userMessage
      const lastUser = executionInput.sourceUser
        ? { ...executionInput.sourceUser, content: executionUserMessage }
        : createRuntimeMessage({ threadId: thread.id, role: 'user', content: executionUserMessage })
      const command = parseAgentCommand(executionUserMessage)
      const clientInput = normalizeClientInput(run.metadata?.clientInput ?? thread.metadata?.lastClientInput)
      attachRuntimeThreadContextSummaryToRun({ thread, run })

      this.recordTraceEvent(run, {
        kind: 'message',
        title: 'User message loaded',
        summary: executionUserMessage.slice(0, 180),
        status: 'completed',
        round: setupRound,
        data: {
          messageId: lastUser.id,
          runInputFrozen: Boolean(run.input),
          hasClientInput: Boolean(clientInput),
          attachmentCount: clientInput?.attachments.length ?? 0,
        },
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
        query: executionUserMessage,
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
          message: executionUserMessage,
          debugContext: baseDebugContext,
          ...(clientInput ? { clientInput } : {}),
          history: thread.messages,
        })
        : undefined
      const activeManifest = layers?.manifest ?? agentManifest
      run.agentManifest = activeManifest
      const profileLimits = layers?.ctx.profile.limits
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
        userMessage: executionUserMessage,
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
        authMetadata: runBackendAuthMetadata(this.runAuth.get(run.id)),
        catalogSnapshot: {
          id: catalogSnapshot.id,
          version: catalogSnapshot.catalogVersion,
        },
        ...(profileLimits ? { limits: profileLimits } : {}),
      })
      const debugContext = attachRuntimePlanDebugContext({ store: this.store, context: setup.debugContext, run })

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
      this.recordTraceEvent(run, {
        kind: 'context',
        title: 'Run context built',
        summary: `${skills.length} active skill(s), ${capabilities.resolvedTools.available.length} visible tool(s), ${memories.length} memory ref(s).`,
        status: 'completed',
        round: setupRound,
        data: {
          eventType: 'context.run_built',
          runId: run.id,
          threadId: run.threadId,
          catalogSnapshotId: catalogSnapshot.id,
          catalogSnapshotVersion: catalogSnapshot.catalogVersion,
          profileId: layers?.trace.profileId,
          activeSkillIds: skills.map((skill) => skill.id),
          visibleToolNames: capabilities.resolvedTools.available.map((tool) => tool.name),
          blockedToolCount: capabilities.resolvedTools.blocked.length,
          memoryRefCount: memories.length,
          warningCount: [...catalogSnapshot.pluginWarnings, ...contextWarnings, ...(layers?.warnings ?? []), ...capabilities.warnings].length,
          focus: {
            route: debugContext.route,
            project: debugContext.project,
            selection: debugContext.selection,
            productionId: debugContext.productionId,
          } as unknown as JSONValue,
        },
      })

      run.metadata = setup.metadata
      run.metadata = {
        ...(run.metadata ?? {}),
        userRequest: executionUserMessage,
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
          ...(layers?.skillDiscovery ? { skillDiscovery: layers.skillDiscovery } : {}),
          context: debugContext,
          tools: capabilities.resolvedTools,
          policy: run.policy,
          memories,
          warnings: [...capabilities.warnings],
          history: thread.messages,
          userMessage: executionUserMessage,
          memoryStorePath: memoryStorePath(this.memoryStore),
          contractResolver: this.contractResolver,
        })
        const finalContent = localDiagnostic.content
        const assistant = createRuntimeMessage({
          threadId: thread.id,
          role: 'assistant',
          content: finalContent || '（无内容）',
          runId: run.id,
        })
        appendThreadMessage({ thread, message: assistant })

        const step = this.createStep(run, 'message', finalRound)
        completeRunStep(step, {
          completedAt: isoNow(),
          result: {
            messageId: assistant.id,
            localCommand: command.name,
            ...(localDiagnostic.metadata ? { diagnostic: localDiagnostic.metadata } : {}),
          },
        })
        this.recordTraceEvent(run, {
          kind: 'assistant',
          title: 'Assistant message created',
          summary: assistant.content.slice(0, 180),
          status: 'completed',
          round: finalRound,
          stepId: step.id,
          data: { messageId: assistant.id, chars: assistant.content.length, content: assistant.content, source: 'runtime_rule' },
        })

        applyRunCompletion(run, {
          now: isoNow(),
          assistantMessageId: assistant.id,
          warnings: capabilities.warnings,
          metadataPatch: {
            memoryIds: memories.map((m) => m.id),
            writtenMemoryIds: [],
          },
        })
        this.recordTraceEvent(run, {
          kind: 'run',
          title: 'Run finished',
          summary: `Run ${run.status}; no model gateway call was needed.`,
          status: run.warnings && run.warnings.length > 0 ? 'info' : 'completed',
          round: finalRound,
          data: { status: run.status, warningCount: run.warnings?.length ?? 0, modelGatewayCalled: false },
        })
        projectRunOntoThread(thread, run)
        thread.updatedAt = run.updatedAt
        applyRuntimeThreadContextSummary({ thread, run, now: isoNow() })
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
            knowledgeManager: this.knowledgeManager,
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
        completeRunStep(toolStep, {
          completedAt: isoNow(),
          status: execResult.error ? 'failed' : 'completed',
          result: execResult.result,
          ...(execResult.error ? { error: execResult.error } : {}),
          ...(execResult.errorData !== undefined ? { errorData: execResult.errorData } : {}),
          durationMs,
        })
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
        const assistantContent = buildFinalAssistantContent({
          userMessage: executionUserMessage,
          modelContent: '',
          toolResults: [{
            call: { name: 'movscript_create_generation_job', args: toolArgs as Record<string, JSONValue> },
            ...(execResult.error ? { error: execResult.error } : { result: execResult.result }),
          }],
          warnings: capabilities.warnings,
          memories,
          run,
          memoryStorePath: memoryStorePath(this.memoryStore),
        })
        const assistant = createRuntimeMessage({
          threadId: thread.id,
          role: 'assistant',
          content: assistantContent || '（无内容）',
          runId: run.id,
        })
        appendThreadMessage({ thread, message: assistant })

        const step = this.createStep(run, 'message', finalRound)
        completeRunStep(step, {
          completedAt: isoNow(),
          result: { messageId: assistant.id, localCommand: command.name },
        })
        this.recordTraceEvent(run, {
          kind: 'assistant',
          title: 'Assistant message created',
          summary: assistant.content.slice(0, 180),
          status: 'completed',
          round: finalRound,
          stepId: step.id,
          data: { messageId: assistant.id, chars: assistant.content.length, content: assistant.content, source: 'runtime_rule' },
        })

        applyRunCompletion(run, {
          now: isoNow(),
          assistantMessageId: assistant.id,
          warnings: capabilities.warnings,
          metadataPatch: {
            memoryIds: memories.map((m) => m.id),
            writtenMemoryIds: [],
          },
        })
        this.recordTraceEvent(run, {
          kind: 'run',
          title: 'Run finished',
          summary: `Run ${run.status} after forced video generation.`,
          status: run.warnings && run.warnings.length > 0 ? 'info' : 'completed',
          round: finalRound,
          data: { status: run.status, warningCount: run.warnings?.length ?? 0, modelGatewayCalled: false, toolResultCount: 1 },
        })
        projectRunOntoThread(thread, run)
        thread.updatedAt = run.updatedAt
        applyRuntimeThreadContextSummary({ thread, run, now: isoNow() })
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
        ...(layers?.skillDiscovery ? { skillDiscovery: layers.skillDiscovery } : {}),
        context: debugContext,
        memories,
        warnings: [...capabilities.warnings],
        command,
        userMessage: executionUserMessage,
        ...(executionInput.sourceMessageId ? { rootUserMessageId: executionInput.sourceMessageId } : {}),
        config: modelConfig,
        auth: this.runAuth.get(run.id),
        policy: run.policy,
        mcpClient: this.mcpClient,
        draftStore: this.draftStore,
        backendApplyClient: this.backendApplyClient,
        registry: catalogSnapshot.toolRegistry,
        contractResolver: this.contractResolver,
        memoryManager: this.memoryManager,
        knowledgeManager: this.knowledgeManager,
        catalogManager: this,
        onCatalogRefresh: async () => {
          catalogSnapshot = this.catalogSnapshots.captureRun(run.id)
          const refreshedBaseManifest = run.metadata?.manifestSource === 'default'
            ? catalogSnapshot.defaultAgentManifest
            : run.agentManifest ?? catalogSnapshot.defaultAgentManifest
          const refreshedLayers = run.metadata?.manifestSource === 'default' && catalogSnapshot.layeredRegistry.profiles.size > 0
            ? resolveRuntimeLayers({
              registry: catalogSnapshot.layeredRegistry,
              baseManifest: refreshedBaseManifest,
              message: executionUserMessage,
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
            userMessage: executionUserMessage,
            runRole: run.role,
          })
          return {
            manifest: refreshedManifest,
            capabilities: refreshedCapabilities.resolvedTools,
            skills: refreshedSkills,
            ...(refreshedLayers?.skillDiscovery ? { skillDiscovery: refreshedLayers.skillDiscovery } : {}),
            registry: catalogSnapshot.toolRegistry,
            warnings: refreshedCapabilities.warnings,
          }
        },
        signal,
        ...(runtimeContract?.commandOverride
          ? { command: runtimeContract.commandOverride({ userMessage: executionUserMessage, manifest: activeManifest }) }
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
          const completedAt = isoNow()
          completeRunStep(step, {
            completedAt,
            status: error ? 'failed' : 'completed',
            ...(result !== undefined ? { result } : {}),
            ...(error ? { error } : {}),
            ...(sandboxed ? { sandboxed } : {}),
            durationMs: durationBetweenMs(step.createdAt, completedAt),
          })
          run.updatedAt = completedAt
          this.store.updateRun(run)
          this.emitRunSnapshot(run)
        },
      })
      this.throwIfRunCancelled(run.id, signal)

      if (loopResult.status === 'requires_action') {
        const now = isoNow()
        const requiredAction = applyRequiredRunAction(run, {
          pendingApprovals: loopResult.pendingApprovals,
          pendingInputRequests: loopResult.pendingInputRequests,
          warnings: loopResult.warnings,
          now,
        })
        this.recordTraceEvent(run, {
          kind: requiredAction.pendingInputCount > 0 && loopResult.pendingApprovals.length === 0 ? 'input' : 'approval',
          title: requiredAction.pendingInputCount > 0 && loopResult.pendingApprovals.length === 0 ? 'User input required' : 'Approval required',
          summary: requiredAction.pendingInputCount > 0 && loopResult.pendingApprovals.length === 0
            ? `${requiredAction.pendingInputCount} user input request(s) paused the run.`
            : `${loopResult.pendingApprovals.length} tool action(s) paused the run.`,
          status: 'blocked',
          data: { approvals: loopResult.pendingApprovals, inputRequests: run.pendingInputRequests },
        })
        this.store.updateRun(run)
        updateRuntimeThreadRunStatus({ store: this.store, threadId: run.threadId, status: run.status, runId: run.id, now: isoNow() })
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
      const visibleModelContent = combineAssistantTurnContents(loopResult.assistantContents, loopResult.finalContent)
      const finalContent = buildFinalAssistantContent({
        userMessage: executionUserMessage,
        modelContent: visibleModelContent,
        toolResults: loopResult.toolOutcomes,
        warnings: loopResult.warnings,
        memories,
        run,
        memoryStorePath: memoryStorePath(this.memoryStore),
      })
      const assistant = createRuntimeMessage({
        threadId: thread.id,
        role: 'assistant',
        content: finalContent || '（无内容）',
        runId: run.id,
      })
      appendThreadMessage({ thread, message: assistant })

      const step = this.createStep(run, 'message', finalRound)
      completeRunStep(step, {
        completedAt: isoNow(),
        result: { messageId: assistant.id },
      })
      this.recordTraceEvent(run, {
        kind: 'assistant',
        title: 'Assistant message created',
        summary: assistant.content.slice(0, 180),
        status: 'completed',
        round: finalRound,
        stepId: step.id,
        data: { messageId: assistant.id, chars: assistant.content.length, content: assistant.content },
      })

      applyRunCompletion(run, {
        now: isoNow(),
        assistantMessageId: assistant.id,
        warnings: loopResult.warnings,
        metadataPatch: {
          memoryIds: memories.map((m) => m.id),
          ...(loopResult.assistantContents.length > 1 ? { assistantContentTurns: loopResult.assistantContents as unknown as JSONValue } : {}),
          ...buildRollbackMetadata(loopResult.toolOutcomes),
        },
      })
      this.recordTraceEvent(run, {
        kind: 'run',
        title: 'Run finished',
        summary: `Run ${run.status} with ${run.steps.length} step(s).`,
        status: loopResult.warnings.length > 0 ? 'info' : 'completed',
        round: finalRound,
        data: { status: run.status, warningCount: loopResult.warnings.length, stepCount: run.steps.length, toolResultCount: loopResult.toolOutcomes.length },
      })
      projectRunOntoThread(thread, run)
      thread.updatedAt = run.updatedAt
      applyRuntimeThreadContextSummary({ thread, run, now: isoNow() })
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
      if (isAbortError(error) || this.store.getRun(runId)?.status === 'cancelled') {
        this.markRunCancelled(this.store.getRun(runId) ?? run)
        return
      }
      applyRunFailure(run, isoNow(), error instanceof Error ? error.message : String(error))
      this.recordTraceEvent(run, {
        kind: 'error',
        title: 'Run failed',
        summary: run.error,
        status: 'failed',
        data: { error: run.error },
      })
      updateRuntimeThreadRunStatus({ store: this.store, threadId: run.threadId, status: run.status, runId: run.id, now: isoNow() })
      const thread = this.store.getThread(run.threadId)
      if (thread) {
        const assistant = createRuntimeMessage({
          threadId: thread.id,
          role: 'assistant',
          content: `运行失败：${run.error}`,
          runId: run.id,
        })
        appendThreadMessage({ thread, message: assistant })
        projectRunOntoThread(thread, run)
        run.assistantMessageId = assistant.id
        const step = this.createStep(run, 'message')
        completeRunStep(step, {
          completedAt: isoNow(),
          result: { messageId: assistant.id },
        })
        this.store.updateThread(thread)
        this.store.updateRun(run)
        this.emitAssistantMessage(run, assistant)
      }
      this.emitRunSnapshot(run, { done: true })
    }
  }

  private createStep(run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string): AgentRunStep {
    const step = appendRunStep({
      id: makeId('step'),
      run,
      runId: run.id,
      type,
      createdAt: isoNow(),
      ...(round ? { round } : {}),
      ...(toolName ? { toolName } : {}),
    })
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
    const thread = this.store.getThread(run.threadId)
    if (thread?.title?.trim()) {
      listener({
        type: 'thread_title',
        runId: run.id,
        threadId: thread.id,
        title: thread.title.trim(),
        updatedAt: thread.updatedAt,
      })
    }
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
    this.runStreamSubscribers.emit(runId, event)
    if (event.type === 'done') this.runStreamSubscribers.close(runId)
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
        : event.type === 'trace' || event.type === 'assistant_delta' || event.type === 'assistant_message' || event.type === 'thread_title'
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
    const records = buildToolRollbackRecords(outcomes)
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
    this.postRunRecordTasks.track(new Promise<void>((resolveTask) => {
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
          resolveTask()
        }
      }, 0)
    }))
  }

  private emitPlanStreamEvent(planId: string, event: AgentPlanStreamEvent): void {
    if (!this.planStreamSubscribers.emit(planId, event)) return
    if (event.type === 'done' || isTerminalPlanStatus(event.snapshot.plan.status)) {
      const snapshot = event.snapshot
      this.planStreamSubscribers.emit(planId, { type: 'done', snapshot })
      this.planStreamSubscribers.close(planId)
    }
  }

  private throwIfRunCancelled(runId: string, signal?: AbortSignal): void {
    assertRunExecutionNotCancelled({
      runId,
      signal,
      getRunStatus: (targetRunId) => this.store.getRun(targetRunId)?.status,
    })
  }

  private markRunCancelled(run: AgentRun, reason?: string): AgentRun {
    const current = this.store.getRun(run.id) ?? run
    if (current.status === 'cancelled') return current
    const now = isoNow()
    const cancelReason = reason ?? DEFAULT_RUN_CANCEL_REASON
    applyRunCancellation(current, now, reason)
    this.recordTraceEvent(current, {
      kind: 'run',
      title: 'Run cancelled',
      summary: cancelReason,
      status: 'info',
      data: { reason: cancelReason },
    })
    const thread = this.store.getThread(current.threadId)
    if (thread && !current.assistantMessageId) {
      const assistant = createRuntimeMessage({
        threadId: thread.id,
        role: 'assistant',
        content: `已停止当前会话。\n\n${cancelReason}`,
        runId: current.id,
      })
      appendThreadMessage({ thread, message: assistant })
      projectRunOntoThread(thread, current)
      current.assistantMessageId = assistant.id
      const step = this.createStep(current, 'message')
      completeRunStep(step, {
        completedAt: now,
        result: { messageId: assistant.id, cancelled: true },
      })
      this.store.updateThread(thread)
    }
    this.store.updateRun(current)
    updateRuntimeThreadRunStatus({ store: this.store, threadId: current.threadId, status: current.status, runId: current.id, now: isoNow() })
    this.emitRunSnapshot(current, { done: true })
    return current
  }

  private syncTaskFromRun(runId: string): void {
    const result = syncRuntimeTaskFromRun({ store: this.store, runId, now: isoNow() })
    if (!result) return
    this.recomputePlanStatus(result.planId)
    this.recordTaskProtocolEvents(result.task, result.previousTask)
    this.emitPlanTaskEvent(result.planId, result.task)
  }

  private cancelTimedOutPlanWorkers(planId: string, defaultTimeoutMs?: number): string[] {
    const nowMs = Date.now()
    const timedOutRunIds: string[] = []
    for (const run of this.store.listRuns({ planId, role: 'worker' })) {
      const task = run.taskId ? this.store.getTask(run.taskId) : undefined
      const timeout = timedOutWorkerRun({ run, task, defaultTimeoutMs, nowMs })
      if (!timeout) continue
      this.cancelRun(run.id, { reason: `Worker run timed out after ${timeout.timeoutMs}ms.` })
      this.syncTaskFromRun(run.id)
      const updatedTask = run.taskId ? markRuntimeTimedOutWorkerTask({
        store: this.store,
        taskId: run.taskId,
        workerRunId: run.id,
        timeoutMs: timeout.timeoutMs,
        now: isoNow(),
      }) : undefined
      if (updatedTask) {
        this.emitPlanTaskEvent(planId, updatedTask)
      }
      timedOutRunIds.push(run.id)
    }
    return timedOutRunIds
  }

  private resetRetryablePlanTasks(planId: string, maxTaskAttempts: number): string[] {
    const result = resetRetryableRuntimePlanTasks({
      store: this.store,
      planId,
      maxTaskAttempts,
      now: isoNow(),
    })
    for (const { task, previousTask } of result.changes) {
      this.recordTaskProtocolEvents(task, previousTask)
      this.emitPlanTaskEvent(planId, task)
    }
    if (result.retriedTaskIds.length > 0) this.recomputePlanStatus(planId)
    return result.retriedTaskIds
  }

  private resetPlanTasksForReplan(planId: string, input: ReplanRunInput): string[] {
    const result = resetRuntimePlanTasksForReplan({
      store: this.store,
      planId,
      resetTaskIds: input.resetTaskIds,
      resetBlocked: input.resetBlocked,
      resetNeedsReview: input.resetNeedsReview,
      resetFailed: input.resetFailed,
      resetCancelled: input.resetCancelled,
      now: isoNow(),
    })
    for (const { task, previousTask } of result.changes) {
      this.recordTaskProtocolEvents(task, previousTask)
      this.emitPlanTaskEvent(planId, task)
    }
    return result.resetTaskIds
  }

  private recomputePlanStatus(planId: string): void {
    const result = recomputeRuntimePlanStatus({ store: this.store, planId, now: isoNow() })
    if (result?.projection.completedNow) this.recordPlanCompletion(result.plan, result.tasks)
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

}
