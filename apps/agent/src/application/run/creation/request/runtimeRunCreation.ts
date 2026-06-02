import type { AgentRuntimeContractResolver } from '../../../../contracts/runtime/runtimeContract.js'
import type { NormalizedClientInput } from '../../../../context/input/client/normalizeClientInput.js'
import type { AgentMessage, AgentRun, AgentThread, CreateRunInput, CreateToolRunInput, ToolCall } from '../../../../state/shared/types.js'
import type { JSONValue } from '../../../../shared/protocol/types.js'
import { buildAgentRun, buildRunCreationMetadata } from '../../../../state/run/core/creation/runFactory.js'
import { projectRunOntoThread } from '../../../../state/run/projection/thread/runProjection.js'
import {
  buildAgentRunInputSnapshot,
  normalizeAgentRunInputTask,
} from '../../../../state/run/input/snapshot/runInput.js'
import { normalizeRunHierarchyInput } from '../../../../state/run/core/hierarchy/runHierarchy.js'
import { defaultRuntimeLimits } from '../../../../state/run/core/limits/runtimeLimits.js'
import { normalizeApprovedToolNames } from '../../../../tools/calls/input/toolCallInput.js'
import { resolveRunCreationUserInput } from '../../input/execution/runExecutionInput.js'
import { buildRunConfigurationSnapshot, type AgentRuntimeCatalogSnapshot } from '../../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import { resolveRuntimeAgentManifest } from '../../../catalog/manifest/runtimeManifest.js'
import { runtimeLimitDefaultsFromConfigFile } from '../../shared/configFileRuntimeLimits.js'

export interface RuntimeRunCreationApplicationResult {
  run: AgentRun
  thread: AgentThread
}

export function buildRuntimeCreateRun(input: {
  runInput: CreateRunInput
  thread: AgentThread
  clientInput?: NormalizedClientInput
  catalogSnapshot: AgentRuntimeCatalogSnapshot
  contractResolver: AgentRuntimeContractResolver
  runId: string
  now: string
}): AgentRun {
  const { runInput, thread, clientInput, catalogSnapshot, contractResolver, runId, now } = input
  const hasExplicitAgentManifest = runInput.agentManifest !== undefined
  const agentManifest = resolveRuntimeAgentManifest({
    inputManifest: runInput.agentManifest,
    activeAgentManifest: catalogSnapshot.activeAgentManifest,
  })
  const runtimeContract = contractResolver.find(agentManifest)
  const approvedToolNames = normalizeApprovedToolNames(runInput.approvedToolNames)
  const configRuntimeLimitDefaults = runtimeLimitDefaultsFromConfigFile(catalogSnapshot, agentManifest)
  const runtimeLimits = defaultRuntimeLimits({ sandboxMode: runInput.sandboxMode === true, ...configRuntimeLimitDefaults, override: runInput.runtimeLimits })
  const runUserInput = resolveRunCreationUserInput({
    userMessage: runInput.userMessage,
    sourceMessageId: runInput.sourceMessageId,
    thread,
  })
  const hierarchy = normalizeRunHierarchyInput(runInput, { defaultRole: 'planner' })
  const taskSnapshot = normalizeAgentRunInputTask(runInput.task)
  const clientInputValue = clientInput ? clientInput as unknown as JSONValue : undefined
  const frozenInput = buildAgentRunInputSnapshot({
    now,
    ...(runUserInput.sourceUser ? { sourceMessage: runUserInput.sourceUser } : {}),
    ...(runUserInput.explicitUserMessage ? { userMessage: runUserInput.explicitUserMessage } : {}),
    ...(clientInputValue ? { clientInput: clientInputValue } : {}),
    ...(taskSnapshot ? { task: taskSnapshot } : {}),
    ...hierarchy,
  })
  const run = buildAgentRun({
    id: runId,
    sessionId: thread.sessionId,
    threadId: thread.id,
    agentManifest,
    runtimeLimits,
    now,
    runtimeContract,
    ...(approvedToolNames.length > 0 ? { approvedToolNames } : {}),
    ...(clientInputValue ? { clientInput: clientInputValue } : {}),
    ...(runUserInput.sourceUser ? { initialUserMessageId: runUserInput.sourceUser.id } : {}),
    runInput: frozenInput,
    ...hierarchy,
  })
  run.metadata = buildRunCreationMetadata({
    existing: run.metadata,
    inputMetadata: runInput.metadata,
    hasExplicitAgentManifest,
    catalogSnapshot,
    configurationSnapshot: buildRunConfigurationSnapshot({ snapshot: catalogSnapshot, capturedAt: now, runtimeLimits }) as unknown as JSONValue,
  })
  return run
}

export function buildRuntimeCreateToolRun(input: {
  runInput: CreateToolRunInput
  thread: AgentThread
  userMessage: AgentMessage
  toolCall: ToolCall
  clientInput?: NormalizedClientInput
  catalogSnapshot: AgentRuntimeCatalogSnapshot
  contractResolver: AgentRuntimeContractResolver
  runId: string
  now: string
}): AgentRun {
  const { runInput, thread, userMessage, toolCall, clientInput, catalogSnapshot, contractResolver, runId, now } = input
  const hasExplicitAgentManifest = runInput.agentManifest !== undefined
  const agentManifest = resolveRuntimeAgentManifest({
    inputManifest: runInput.agentManifest,
    activeAgentManifest: catalogSnapshot.activeAgentManifest,
  })
  const runtimeContract = contractResolver.find(agentManifest)
  const approvedToolNames = normalizeApprovedToolNames(runInput.approvedToolNames)
  const configRuntimeLimitDefaults = runtimeLimitDefaultsFromConfigFile(catalogSnapshot, agentManifest)
  const runtimeLimits = defaultRuntimeLimits({ sandboxMode: runInput.sandboxMode === true, ...configRuntimeLimitDefaults, override: runInput.runtimeLimits })
  const hierarchy = normalizeRunHierarchyInput(runInput, { defaultRole: 'worker' })
  const clientInputValue = clientInput ? clientInput as unknown as JSONValue : undefined
  const frozenInput = buildAgentRunInputSnapshot({
    now,
    sourceMessage: userMessage,
    ...(clientInputValue ? { clientInput: clientInputValue } : {}),
    forcedToolCall: toolCall,
    ...hierarchy,
  })
  const run = buildAgentRun({
    id: runId,
    sessionId: thread.sessionId,
    threadId: thread.id,
    agentManifest,
    runtimeLimits,
    now,
    forcedToolCall: toolCall,
    initialUserMessageId: userMessage.id,
    runtimeContract,
    ...(approvedToolNames.length > 0 ? { approvedToolNames } : {}),
    ...(clientInputValue ? { clientInput: clientInputValue } : {}),
    runInput: frozenInput,
    ...hierarchy,
  })
  run.metadata = buildRunCreationMetadata({
    existing: run.metadata,
    hasExplicitAgentManifest,
    catalogSnapshot,
    configurationSnapshot: buildRunConfigurationSnapshot({ snapshot: catalogSnapshot, capturedAt: now, runtimeLimits }) as unknown as JSONValue,
  })
  return run
}

export function applyRuntimeRunCreation(input: {
  run: AgentRun
  thread: AgentThread
  catalogSnapshot: AgentRuntimeCatalogSnapshot
  runInput: CreateRunInput | CreateToolRunInput
  now: string
  rememberCatalogRun: (runId: string, catalogSnapshot: AgentRuntimeCatalogSnapshot) => void
  rememberRunAuth: (runId: string, runInput: CreateRunInput | CreateToolRunInput) => void
  createRun: (run: AgentRun) => void
  updateThread: (thread: AgentThread) => void
  startRunExecution: (runId: string) => void
}): RuntimeRunCreationApplicationResult {
  input.rememberCatalogRun(input.run.id, input.catalogSnapshot)
  input.rememberRunAuth(input.run.id, input.runInput)
  input.createRun(input.run)
  projectRunOntoThread(input.thread, input.run)
  input.thread.updatedAt = input.now
  input.updateThread(input.thread)
  input.startRunExecution(input.run.id)
  return {
    run: input.run,
    thread: input.thread,
  }
}

export function applyRuntimeCreateRunRequest(input: {
  runInput: CreateRunInput
  thread: AgentThread
  clientInput?: NormalizedClientInput
  catalogSnapshot: AgentRuntimeCatalogSnapshot
  contractResolver: AgentRuntimeContractResolver
  runId: string
  now: string
  rememberCatalogRun: (runId: string, catalogSnapshot: AgentRuntimeCatalogSnapshot) => void
  rememberRunAuth: (runId: string, runInput: CreateRunInput) => void
  createRun: (run: AgentRun) => void
  updateThread: (thread: AgentThread) => void
  startRunExecution: (runId: string) => void
}): AgentRun {
  const run = buildRuntimeCreateRun({
    runInput: input.runInput,
    thread: input.thread,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    catalogSnapshot: input.catalogSnapshot,
    contractResolver: input.contractResolver,
    runId: input.runId,
    now: input.now,
  })
  applyRuntimeRunCreation({
    run,
    thread: input.thread,
    catalogSnapshot: input.catalogSnapshot,
    runInput: input.runInput,
    now: input.now,
    rememberCatalogRun: input.rememberCatalogRun,
    rememberRunAuth: input.rememberRunAuth,
    createRun: input.createRun,
    updateThread: input.updateThread,
    startRunExecution: input.startRunExecution,
  })
  return run
}

export function applyRuntimeCreateToolRunRequest(input: {
  runInput: CreateToolRunInput
  thread: AgentThread
  userMessage: AgentMessage
  toolCall: ToolCall
  clientInput?: NormalizedClientInput
  catalogSnapshot: AgentRuntimeCatalogSnapshot
  contractResolver: AgentRuntimeContractResolver
  runId: string
  now: string
  rememberCatalogRun: (runId: string, catalogSnapshot: AgentRuntimeCatalogSnapshot) => void
  rememberRunAuth: (runId: string, runInput: CreateToolRunInput) => void
  createRun: (run: AgentRun) => void
  updateThread: (thread: AgentThread) => void
  startRunExecution: (runId: string) => void
}): AgentRun {
  const run = buildRuntimeCreateToolRun({
    runInput: input.runInput,
    thread: input.thread,
    userMessage: input.userMessage,
    toolCall: input.toolCall,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    catalogSnapshot: input.catalogSnapshot,
    contractResolver: input.contractResolver,
    runId: input.runId,
    now: input.now,
  })
  applyRuntimeRunCreation({
    run,
    thread: input.thread,
    catalogSnapshot: input.catalogSnapshot,
    runInput: input.runInput,
    now: input.now,
    rememberCatalogRun: input.rememberCatalogRun,
    rememberRunAuth: input.rememberRunAuth,
    createRun: input.createRun,
    updateThread: input.updateThread,
    startRunExecution: input.startRunExecution,
  })
  return run
}
