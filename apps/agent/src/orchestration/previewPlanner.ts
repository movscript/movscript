import type { AgentManifest } from '../manifest/agentManifest.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { AgentMemory } from '../memory/types.js'
import type { ConfiguredRuntimeModelConfig } from '../model/modelConfig.js'
import type { ModelCallInput, ModelCallResult } from '../model/modelClient.js'
import type {
  AgentApprovalRequest,
  AgentDebugContextPanel,
  AgentMessage,
  AgentRunPolicy,
  JSONValue,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
  ToolCall,
} from '../state/types.js'
import { resolveRuntimeChatModelConfig } from '../model/modelConfig.js'
import { buildApplyDraftPreview } from '../drafts/draftApply.js'
import { applyToolPolicy } from '../tools/toolPolicy.js'
import { buildContext, buildOpenAIChatTools } from './contextBuilder.js'
import { callModel } from '../model/modelClient.js'

export interface PreviewToolPlanInput {
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  context: AgentDebugContextPanel
  tools: ResolvedToolCatalog
  policy: AgentRunPolicy
  memories: AgentMemory[]
  warnings: string[]
  history: AgentMessage[]
  userMessage: string
  command: AgentCommandRuntime
  currentProjectId?: number
  registry: ToolRegistry
  draftStore: AgentDraftStore
  contractResolver: AgentRuntimeContractResolver
  makeApprovalId: () => string
  now: () => string
  modelConfig?: ConfiguredRuntimeModelConfig | null
  callModel?: (input: ModelCallInput) => Promise<ModelCallResult>
}

export interface PreviewToolPlanResult {
  toolCalls: ToolCall[]
  pendingApprovals: AgentApprovalRequest[]
}

export async function planPreviewToolRequests(input: PreviewToolPlanInput): Promise<PreviewToolPlanResult> {
  const modelConfig = input.modelConfig === undefined ? resolveRuntimeChatModelConfig() : input.modelConfig
  if (!modelConfig) return emptyPreviewToolPlan()

  const { messages } = buildContext({
    manifest: input.manifest,
    skills: input.skills,
    context: input.context,
    tools: input.tools,
    policy: input.policy,
    memories: input.memories,
    warnings: input.warnings,
    history: input.history,
    userMessage: input.userMessage,
    command: input.command,
    contractResolver: input.contractResolver,
  })
  const modelTools = buildOpenAIChatTools(input.tools, input.contractResolver.find(input.manifest))
  const callPreviewModel = input.callModel ?? callModel
  const modelResult = await callPreviewModel({
    messages,
    tools: modelTools,
    toolChoice: modelTools.length > 0 ? 'auto' : undefined,
    config: modelConfig,
    auth: {},
  })
  if (modelResult.tool_calls.length === 0) return emptyPreviewToolPlan()

  const requestedCalls = modelResult.tool_calls.map((toolCall) => ({
    id: toolCall.id,
    name: toolCall.function.name,
    args: parseToolArguments(toolCall.function.arguments),
  }))
  const policyResult = applyToolPolicy(requestedCalls, {
    currentProjectId: input.currentProjectId,
    manifest: input.manifest,
    catalog: input.tools,
    registry: input.registry,
    sandboxMode: false,
  })

  return {
    toolCalls: policyResult.toolCalls,
    pendingApprovals: policyResult.blockedToolCalls
      .filter((blocked) => blocked.reason === 'approval_required')
      .map((blocked): AgentApprovalRequest => {
        const now = input.now()
        const preview = buildApprovalPreview(input.draftStore, blocked.call)
        return {
          id: input.makeApprovalId(),
          runId: 'preview',
          toolName: blocked.call.name,
          ...(blocked.call.args ? { args: blocked.call.args } : {}),
          reason: blocked.message,
          ...(blocked.tool?.risk ? { risk: blocked.tool.risk } : {}),
          ...(preview !== undefined ? { preview } : {}),
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        }
      }),
  }
}

function emptyPreviewToolPlan(): PreviewToolPlanResult {
  return { toolCalls: [], pendingApprovals: [] }
}

function parseToolArguments(value: string): Record<string, JSONValue> {
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, JSONValue>
  } catch {
    // Ignore malformed preview arguments; policy will see an empty argument object.
  }
  return {}
}

function buildApprovalPreview(draftStore: AgentDraftStore, call: ToolCall): JSONValue | undefined {
  if (call.name !== 'movscript_apply_draft') return undefined
  try {
    return buildApplyDraftPreview(draftStore, call.args ?? {}) as unknown as JSONValue
  } catch {
    return undefined
  }
}
