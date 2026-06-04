import type { AgentManifest } from '../../../../catalog/manifest/agentManifest.js'
import type { AgentCommandRuntime } from '../../../../context/command/commandRouter.js'
import type { ToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import type { AgentRuntimeContractResolver } from '../../../../contracts/runtime/runtimeContract.js'
import type { SkillDiscoverySummary } from '../../../../context/prompt/registry/promptCandidateParts.js'
import type { ConfiguredRuntimeModelConfig } from '../../../../model/config/modelConfig.js'
import type { ModelCallInput, ModelCallResult } from '../../../../model/client/modelClient.js'
import type {
  AgentApprovalRequest,
  AgentDebugContextPanel,
  AgentMessage,
  AgentRuntimeLimits,
  JSONValue,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
  ToolCall,
} from '../../../../state/shared/types.js'
import { resolveRuntimeChatModelConfig } from '../../../../model/config/modelConfig.js'
import { applyToolPermissions } from '../../../../tools/permissions/evaluation/toolPermissions.js'
import { callModel } from '../../../../model/client/modelClient.js'
import { modelTurnContext } from '../../../../context/prompt/turn/modelTurnContext.js'

export interface PreviewToolPlanInput {
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  skillDiscovery?: SkillDiscoverySummary
  context: AgentDebugContextPanel
  tools: ResolvedToolCatalog
  runtimeLimits: AgentRuntimeLimits
  warnings: string[]
  history: AgentMessage[]
  userMessage: string
  command: AgentCommandRuntime
  currentProjectId?: number
  registry: ToolRegistry
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
  if (!modelConfig) return emptyPreviewToolTaskGraph()

  const composedTurnContext = modelTurnContext.composeModelTurn({
    manifest: input.manifest,
    skills: input.skills,
    ...(input.skillDiscovery ? { skillDiscovery: input.skillDiscovery } : {}),
    context: input.context,
    tools: input.tools,
    runtimeLimits: input.runtimeLimits,
    warnings: input.warnings,
    history: input.history,
    userMessage: input.userMessage,
    command: input.command,
    contractResolver: input.contractResolver,
  })
  const callPreviewModel = input.callModel ?? callModel
  const modelResult = await callPreviewModel({
    messages: composedTurnContext.messages,
    tools: composedTurnContext.tools,
    toolChoice: composedTurnContext.tools.length > 0 ? 'auto' : undefined,
    config: modelConfig,
    auth: {},
  })
  if (modelResult.tool_calls.length === 0) return emptyPreviewToolTaskGraph()

  const requestedCalls = modelResult.tool_calls.map((toolCall) => ({
    id: toolCall.id,
    name: toolCall.function.name,
    args: parseToolArguments(toolCall.function.arguments),
  }))
  const permissionResult = applyToolPermissions(requestedCalls, {
    currentProjectId: input.currentProjectId,
    manifest: input.manifest,
    catalog: input.tools,
    registry: input.registry,
    approvalMode: input.runtimeLimits.approvalMode,
    sandboxMode: false,
  })

  return {
    toolCalls: permissionResult.toolCalls,
    pendingApprovals: permissionResult.blockedToolCalls
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

function emptyPreviewToolTaskGraph(): PreviewToolPlanResult {
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
