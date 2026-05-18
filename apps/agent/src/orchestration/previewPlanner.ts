import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { SkillDiscoverySummary } from '../contextManager/modelContextBuilder.js'
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
import { applyToolPolicy } from '../tools/toolPolicy.js'
import { callModel } from '../model/modelClient.js'
import { contextManager } from '../contextManager/contextManager.js'

export interface PreviewToolPlanInput {
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  skillDiscovery?: SkillDiscoverySummary
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

  const modelTurnContext = contextManager.composeModelTurn({
    manifest: input.manifest,
    skills: input.skills,
    ...(input.skillDiscovery ? { skillDiscovery: input.skillDiscovery } : {}),
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
  const callPreviewModel = input.callModel ?? callModel
  const modelResult = await callPreviewModel({
    messages: modelTurnContext.messages,
    tools: modelTurnContext.tools,
    toolChoice: modelTurnContext.tools.length > 0 ? 'auto' : undefined,
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
    approvalMode: input.policy.approvalMode,
    sandboxMode: false,
  })

  return {
    toolCalls: policyResult.toolCalls,
    pendingApprovals: policyResult.blockedToolCalls
      .filter((blocked) => blocked.reason === 'approval_required')
      .map((blocked): AgentApprovalRequest => {
        const now = input.now()
        return {
          id: input.makeApprovalId(),
          runId: 'preview',
          toolName: blocked.call.name,
          ...(blocked.call.args ? { args: blocked.call.args } : {}),
          reason: blocked.message,
          ...(blocked.tool?.risk ? { risk: blocked.tool.risk } : {}),
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
