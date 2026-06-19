import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  AGENT_CLIENT_TELEMETRY_SCHEMA,
  AGENT_PROTOCOL_VERSION,
  PROVIDER_SESSION_EVENT_V2_SCHEMA,
  activeRunInputDisplayDeliveryStatus,
  buildPendingActiveRunInputQueueItems,
  createAgentTelemetryLogSample,
  createAgentTelemetryMetricSample,
  activeRunInputIsWaitingForDelivery,
  isAgentRunStoppableStatus,
  isAgentRunStreamSettledStatus,
  isAgentRunTerminalStatus,
  isAgentTelemetryReportableMetricName,
  providerSessionInputRef,
  providerSessionMessageRef,
  sanitizeAgentTelemetryLabels,
} from '../dist/agent/protocol.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('core agent protocol exports provider-session schemas and pure status helpers', () => {
  assert.equal(AGENT_PROTOCOL_VERSION, 'movscript.agent.protocol.v1')
  assert.equal(PROVIDER_SESSION_EVENT_V2_SCHEMA, 'movscript.agent.provider-session-event.v2')
  assert.equal(AGENT_CLIENT_TELEMETRY_SCHEMA, 'movscript.agent.client-telemetry.v1')

  assert.equal(isAgentRunTerminalStatus('completed'), true)
  assert.equal(isAgentRunTerminalStatus('requires_action'), false)
  assert.equal(isAgentRunStreamSettledStatus('requires_action'), true)
  assert.equal(isAgentRunStreamSettledStatus('in_progress'), false)
  assert.equal(isAgentRunStoppableStatus('queued'), true)
  assert.equal(isAgentRunStoppableStatus('in_progress'), true)
  assert.equal(isAgentRunStoppableStatus('requires_action'), true)
  assert.equal(isAgentRunStoppableStatus('completed'), false)
})

test('core agent protocol resolves provider-session message and input refs from current and legacy metadata', () => {
  assert.deepEqual(providerSessionMessageRef({
    meta: {
      providerSessionMessage: { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1' },
      runtimeMessage: { threadId: 'thread_legacy', messageId: 'message_legacy', runId: 'run_legacy' },
    },
  }), { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1' })

  assert.deepEqual(providerSessionMessageRef({
    meta: {
      runtimeMessage: { threadId: 'thread_legacy', messageId: 'message_legacy', runId: 'run_legacy' },
    },
  }), { threadId: 'thread_legacy', messageId: 'message_legacy', runId: 'run_legacy' })

  assert.deepEqual(providerSessionInputRef({
    meta: {
      providerSessionInput: { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1', deliveryStatus: 'failed', error: 'failed' },
      runtimeInput: { threadId: 'thread_legacy', messageId: 'message_legacy', runId: 'run_legacy', deliveryStatus: 'delivered' },
    },
  }), { threadId: 'thread_1', messageId: 'message_1', runId: 'run_1', deliveryStatus: 'failed', error: 'failed' })

  assert.equal(providerSessionInputRef({ meta: {} }), undefined)
})

test('core agent protocol builds pending active-run input queue items', () => {
  const messages = [
    agentMessage({
      id: 'pending',
      content: 'Add this once the run accepts it',
      meta: {
        runtimeInput: { threadId: 'thread_1', runId: 'run_1', deliveryStatus: 'pending' },
      },
    }),
  ]

  assert.deepEqual(buildPendingActiveRunInputQueueItems(messages).map((item) => ({
    id: item.id,
    runId: item.runId,
    content: item.content,
  })), [{
    id: 'pending',
    runId: 'run_1',
    content: 'Add this once the run accepts it',
  }])
  assert.equal(activeRunInputIsWaitingForDelivery(messages[0]), true)
})

test('core agent protocol treats pending active-run inputs with message ids as accepted', () => {
  const message = agentMessage({
    id: 'supplement',
    content: 'Use this extra constraint',
    meta: {
      runtimeMessage: { threadId: 'thread_1', messageId: 'runtime_msg_1', runId: 'run_1' },
      runtimeInput: { threadId: 'thread_1', messageId: 'runtime_msg_1', runId: 'run_1', deliveryStatus: 'pending' },
    },
  })

  assert.equal(activeRunInputDisplayDeliveryStatus(message), 'accepted')
  assert.equal(activeRunInputIsWaitingForDelivery(message), false)
  assert.deepEqual(buildPendingActiveRunInputQueueItems([message]), [])
})

test('core agent protocol keeps new trigger messages pending until provider session accepts them', () => {
  const message = agentMessage({
    id: 'local_trigger',
    content: 'Start work',
    meta: {
      runtimeInput: { deliveryStatus: 'pending' },
    },
  })

  assert.deepEqual(buildPendingActiveRunInputQueueItems([message]).map((item) => ({
    id: item.id,
    runId: item.runId,
    content: item.content,
  })), [{
    id: 'local_trigger',
    runId: undefined,
    content: 'Start work',
  }])
})

test('core agent protocol sanitizes telemetry metric and log payloads', () => {
  assert.equal(isAgentTelemetryReportableMetricName('frontend_agent_timeline_page_duration_ms'), true)
  assert.equal(isAgentTelemetryReportableMetricName('unknown_metric'), false)
  assert.deepEqual(sanitizeAgentTelemetryLabels({
    area: ' agent ',
    status: 200,
    ignored: 'nope',
  }), {
    area: 'agent',
    status: '200',
  })
  assert.deepEqual(createAgentTelemetryMetricSample({
    name: 'frontend_agent_timeline_page_duration_ms',
    unit: 'ms',
    value: -1,
    labels: { area: 'timeline' },
  }), {
    name: 'frontend_agent_timeline_page_duration_ms',
    unit: 'ms',
    value: 0,
    labels: { area: 'timeline' },
  })
  assert.deepEqual(createAgentTelemetryLogSample({
    level: 'warning',
    area: '',
    kind: undefined,
  }), {
    level: 'warning',
    area: 'agent_frontend',
    kind: 'unknown',
  })
})

test('core agent protocol keeps provider, conversation, timeline, generation, and interaction contracts in focused modules', () => {
  const protocolSource = readFileSync(packagePath('src/agent/protocol.ts'), 'utf8')
  const attachmentSource = readFileSync(packagePath('src/agent/agentAttachmentProtocol.ts'), 'utf8')
  const attachmentInputsSource = readFileSync(packagePath('src/agent/attachmentInputs.ts'), 'utf8')
  const conversationSource = readFileSync(packagePath('src/agent/agentConversationProtocol.ts'), 'utf8')
  const generationSource = readFileSync(packagePath('src/agent/agentGenerationProtocol.ts'), 'utf8')
  const planSource = readFileSync(packagePath('src/agent/agentPlanProtocol.ts'), 'utf8')
  const protocolVersionSource = readFileSync(packagePath('src/agent/agentProtocolVersion.ts'), 'utf8')
  const promptDebugSource = readFileSync(packagePath('src/agent/agentPromptDebugProtocol.ts'), 'utf8')
  const runSource = readFileSync(packagePath('src/agent/agentRunProtocol.ts'), 'utf8')
  const statusSource = readFileSync(packagePath('src/agent/agentStatusProtocol.ts'), 'utf8')
  const taskGraphSource = readFileSync(packagePath('src/agent/agentTaskGraphProtocol.ts'), 'utf8')
  const threadSource = readFileSync(packagePath('src/agent/agentThreadProtocol.ts'), 'utf8')
  const timelineSource = readFileSync(packagePath('src/agent/agentTimelineProtocol.ts'), 'utf8')
  const toolSource = readFileSync(packagePath('src/agent/agentToolProtocol.ts'), 'utf8')
  const traceSource = readFileSync(packagePath('src/agent/agentTraceProtocol.ts'), 'utf8')
  const providerCatalogSource = readFileSync(packagePath('src/agent/providerCatalog.ts'), 'utf8')
  const providerInteractionSource = readFileSync(packagePath('src/agent/providerInteractionProtocol.ts'), 'utf8')
  const providerModelSource = readFileSync(packagePath('src/agent/providerModelProtocol.ts'), 'utf8')
  const providerSessionSource = readFileSync(packagePath('src/agent/providerSessionProtocol.ts'), 'utf8')
  const modelCatalogSource = readFileSync(packagePath('src/agent/modelCatalog.ts'), 'utf8')

  assert.match(protocolSource, /export \* from '\.\/agentAttachmentProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/agentConversationProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/agentGenerationProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/agentPlanProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/agentProtocolVersion\.js'/)
  assert.match(protocolSource, /export \* from '\.\/agentPromptDebugProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/agentRunProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/agentStatusProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/agentTaskGraphProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/agentThreadProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/agentTimelineProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/agentToolProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/agentTraceProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/providerCatalog\.js'/)
  assert.match(protocolSource, /export \* from '\.\/providerInteractionProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/providerModelProtocol\.js'/)
  assert.match(protocolSource, /export \* from '\.\/providerSessionProtocol\.js'/)
  assert.doesNotMatch(protocolSource, /export interface AgentGenerationJob/)
  assert.doesNotMatch(protocolSource, /export interface AgentGenerationParamAudit/)
  assert.doesNotMatch(protocolSource, /export interface AgentAttachment/)
  assert.doesNotMatch(protocolSource, /export type AgentAttachmentSource/)
  assert.doesNotMatch(protocolSource, /export interface ProviderSessionClientInput/)
  assert.doesNotMatch(protocolSource, /export const AGENT_PROTOCOL_VERSION/)
  assert.doesNotMatch(protocolSource, /export type AgentRunStatus/)
  assert.doesNotMatch(protocolSource, /export const AGENT_RUN_TERMINAL_STATUSES/)
  assert.doesNotMatch(protocolSource, /export function isAgentRunTerminalStatus/)
  assert.doesNotMatch(protocolSource, /export interface AgentMessage/)
  assert.doesNotMatch(protocolSource, /export interface AgentThread/)
  assert.doesNotMatch(protocolSource, /export interface AgentSession/)
  assert.doesNotMatch(protocolSource, /export interface AgentPlan/)
  assert.doesNotMatch(protocolSource, /export interface AgentRun/)
  assert.doesNotMatch(protocolSource, /export interface AgentRunInput/)
  assert.doesNotMatch(protocolSource, /export interface ProviderSessionLimits/)
  assert.doesNotMatch(protocolSource, /export interface AgentChatMessage/)
  assert.doesNotMatch(protocolSource, /export interface AgentConversation/)
  assert.doesNotMatch(protocolSource, /export interface AgentChatMessageMeta/)
  assert.doesNotMatch(protocolSource, /export function activeRunInputDisplayDeliveryStatus/)
  assert.doesNotMatch(protocolSource, /export type ProviderSessionStatusMessage/)
  assert.doesNotMatch(protocolSource, /export interface ProviderContextPanel/)
  assert.doesNotMatch(protocolSource, /export interface CompiledPromptPreview/)
  assert.doesNotMatch(protocolSource, /export interface AgentRunPreview/)
  assert.doesNotMatch(protocolSource, /export interface AgentContextDiagnostic\s*\{/)
  assert.doesNotMatch(protocolSource, /export type AgentTaskGraphStatus/)
  assert.doesNotMatch(protocolSource, /export type AgentTaskStatus/)
  assert.doesNotMatch(protocolSource, /export interface AgentTaskGraphSnapshot/)
  assert.doesNotMatch(protocolSource, /export interface DispatchTaskGraphResult/)
  assert.doesNotMatch(protocolSource, /export interface AgentTimelineItem/)
  assert.doesNotMatch(protocolSource, /export interface AgentTimelineActivity/)
  assert.doesNotMatch(protocolSource, /export function agentTimelineStatusFromRunStatus/)
  assert.doesNotMatch(protocolSource, /export interface ToolCall/)
  assert.doesNotMatch(protocolSource, /export interface AgentToolCallOrigin/)
  assert.doesNotMatch(protocolSource, /export const AGENT_TRACE_EVENT_KINDS/)
  assert.doesNotMatch(protocolSource, /export interface AgentTraceEvent/)
  assert.doesNotMatch(protocolSource, /export interface ProviderManifest/)
  assert.doesNotMatch(protocolSource, /export interface ProviderCatalogConfigFile/)
  assert.doesNotMatch(protocolSource, /export interface AgentApprovalRequest/)
  assert.doesNotMatch(protocolSource, /export interface ProviderInteraction/)
  assert.doesNotMatch(protocolSource, /export interface ProviderWork/)
  assert.doesNotMatch(protocolSource, /export interface ProviderSessionSnapshotV2/)
  assert.doesNotMatch(protocolSource, /export interface ProviderSessionEventV2/)
  assert.doesNotMatch(protocolSource, /export const PROVIDER_MODEL_API_KINDS/)
  assert.match(attachmentSource, /export interface AgentAttachment/)
  assert.match(attachmentSource, /export type AgentAttachmentSource/)
  assert.match(attachmentSource, /export interface ProviderSessionClientInput/)
  assert.match(conversationSource, /export interface AgentChatMessage/)
  assert.match(conversationSource, /export interface AgentConversation/)
  assert.match(conversationSource, /export interface AgentChatMessageMeta/)
  assert.match(conversationSource, /export function activeRunInputDisplayDeliveryStatus/)
  assert.match(conversationSource, /export type ProviderSessionStatusMessage/)
  assert.match(generationSource, /export interface AgentGenerationJob/)
  assert.match(generationSource, /export interface AgentGenerationParamAudit/)
  assert.match(generationSource, /export interface AgentGenerationValidationError/)
  assert.match(planSource, /export interface AgentPlan/)
  assert.match(planSource, /export interface AgentPlanRevision/)
  assert.match(protocolVersionSource, /export const AGENT_PROTOCOL_VERSION/)
  assert.match(promptDebugSource, /export interface ProviderContextPanel/)
  assert.match(promptDebugSource, /export interface CompiledPromptPreview/)
  assert.match(promptDebugSource, /export interface AgentRunPreview/)
  assert.match(promptDebugSource, /export interface AgentContextDiagnostic/)
  assert.match(promptDebugSource, /from '\.\/providerCatalog\.js'/)
  assert.match(promptDebugSource, /from '\.\/providerInteractionProtocol\.js'/)
  assert.match(promptDebugSource, /from '\.\/agentTaskGraphProtocol\.js'/)
  assert.match(runSource, /export interface AgentRun/)
  assert.match(runSource, /export interface AgentRunInput/)
  assert.match(runSource, /export interface ProviderSessionLimits/)
  assert.match(statusSource, /export type AgentRunStatus/)
  assert.match(statusSource, /export function isAgentRunTerminalStatus/)
  assert.match(taskGraphSource, /export type AgentTaskGraphStatus/)
  assert.match(taskGraphSource, /export interface AgentTaskGraphSnapshot/)
  assert.match(taskGraphSource, /export interface DispatchTaskGraphResult/)
  assert.match(taskGraphSource, /from '\.\/agentRunProtocol\.js'/)
  assert.match(threadSource, /export interface AgentMessage/)
  assert.match(threadSource, /export interface AgentThread/)
  assert.match(threadSource, /export interface AgentSession/)
  assert.match(threadSource, /from '\.\/agentPlanProtocol\.js'/)
  assert.match(timelineSource, /export interface AgentTimelineItem/)
  assert.match(timelineSource, /export interface AgentTimelineActivity/)
  assert.match(timelineSource, /export function agentTimelineStatusFromRunStatus/)
  assert.match(toolSource, /export interface ToolCall/)
  assert.match(toolSource, /export interface AgentToolCallOrigin/)
  assert.match(traceSource, /export const AGENT_TRACE_EVENT_KINDS/)
  assert.match(traceSource, /export interface AgentTraceEvent/)
  assert.match(traceSource, /export interface AgentRunTracePage/)
  assert.match(providerCatalogSource, /export interface ProviderManifest/)
  assert.match(providerCatalogSource, /export interface ProviderCatalogConfigFile/)
  assert.match(providerCatalogSource, /export interface ProviderSessionCapabilitiesResponse/)
  assert.match(providerInteractionSource, /export interface AgentApprovalRequest/)
  assert.match(providerInteractionSource, /export interface ProviderInteraction/)
  assert.match(providerInteractionSource, /export interface ProviderWork/)
  assert.match(providerInteractionSource, /export interface ProviderContinuation/)
  assert.match(providerModelSource, /export const PROVIDER_MODEL_API_KINDS/)
  assert.match(providerModelSource, /export interface ProviderModelConfigPublic/)
  assert.match(providerSessionSource, /export interface ProviderSessionSnapshotV2/)
  assert.match(providerSessionSource, /export interface ProviderSessionEventV2/)
  assert.match(providerSessionSource, /export const PROVIDER_SESSION_EVENT_V2_SCHEMA/)
  assert.match(providerSessionSource, /from '\.\/agentProtocolVersion\.js'/)
  assert.match(providerSessionSource, /from '\.\/agentPlanProtocol\.js'/)
  assert.match(providerSessionSource, /from '\.\/agentRunProtocol\.js'/)
  assert.match(providerSessionSource, /from '\.\/agentThreadProtocol\.js'/)
  assert.match(providerSessionSource, /from '\.\/providerInteractionProtocol\.js'/)
  assert.match(providerSessionSource, /from '\.\/agentTaskGraphProtocol\.js'/)
  assert.match(providerSessionSource, /from '\.\/agentTraceProtocol\.js'/)
  assert.match(timelineSource, /from '\.\/providerInteractionProtocol\.js'/)
  assert.match(timelineSource, /from '\.\/agentTraceProtocol\.js'/)
  assert.match(timelineSource, /from '\.\/agentAttachmentProtocol\.js'/)
  assert.match(timelineSource, /from '\.\/agentConversationProtocol\.js'/)
  assert.match(timelineSource, /from '\.\/agentPromptDebugProtocol\.js'/)
  assert.match(attachmentInputsSource, /from '\.\/agentAttachmentProtocol\.js'/)
  assert.doesNotMatch(attachmentInputsSource, /from '\.\/protocol\.js'/)
  assert.doesNotMatch(protocolSource, /interface /)
  assert.doesNotMatch(protocolSource, /type Agent/)
  assert.doesNotMatch(protocolSource, /function isAgent/)
  assert.match(modelCatalogSource, /from '\.\/providerModelProtocol\.js'/)
  assert.doesNotMatch(modelCatalogSource, /from '\.\/protocol\.js'/)
})

function agentMessage(patch = {}) {
  return {
    id: 'message_1',
    role: 'user',
    content: '',
    timestamp: 1,
    ...patch,
  }
}

test('core package metadata publishes agent protocol as a first-class subpath', () => {
  const packageJson = JSON.parse(readFileSync(packagePath('package.json'), 'utf8'))
  assert.deepEqual(packageJson.exports?.['./agent/protocol'], {
    types: './dist/agent/protocol.d.ts',
    import: './dist/agent/protocol.js',
    require: './dist/agent/protocol.cjs',
  })
})

function packagePath(path) {
  return resolve(packageRoot, path)
}
