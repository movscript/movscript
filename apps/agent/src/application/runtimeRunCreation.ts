import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { NormalizedClientInput } from '../context/normalizeClientInput.js'
import type { AgentMessage, AgentRun, AgentThread, CreateRunInput, CreateToolRunInput, ToolCall } from '../state/types.js'
import type { JSONValue } from '../types.js'
import { buildAgentRun, buildRunCreationMetadata } from '../state/runFactory.js'
import { projectRunOntoThread } from '../state/runProjection.js'
import {
  buildAgentRunInputSnapshot,
  normalizeAgentRunInputTask,
} from '../state/runInput.js'
import { normalizeRunHierarchyInput } from '../state/runHierarchy.js'
import { defaultRunPolicy } from '../state/runPolicy.js'
import { normalizeApprovedToolNames } from '../tools/toolCallInput.js'
import { resolveRunCreationUserInput } from './runExecutionInput.js'
import type { AgentRuntimeCatalogSnapshot } from './runtimeCatalogSnapshot.js'
import { resolveRuntimeAgentManifest } from './runtimeManifest.js'

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
    defaultAgentManifest: catalogSnapshot.defaultAgentManifest,
  })
  const runtimeContract = contractResolver.find(agentManifest)
  const approvedToolNames = normalizeApprovedToolNames(runInput.approvedToolNames)
  const policy = defaultRunPolicy({ sandboxMode: runInput.sandboxMode === true, policy: runInput.policy })
  const runUserInput = resolveRunCreationUserInput({ userMessage: runInput.userMessage, thread })
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
    threadId: thread.id,
    agentManifest,
    policy,
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
    defaultAgentManifest: catalogSnapshot.defaultAgentManifest,
  })
  const runtimeContract = contractResolver.find(agentManifest)
  const approvedToolNames = normalizeApprovedToolNames(runInput.approvedToolNames)
  const policy = defaultRunPolicy({ sandboxMode: runInput.sandboxMode === true, policy: runInput.policy })
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
    threadId: thread.id,
    agentManifest,
    policy,
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
