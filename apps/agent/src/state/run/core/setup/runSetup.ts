import type { JSONValue } from '../../../shared/types.js'
import type { AgentManifest } from '../../../../catalog/manifest/agentManifest.js'
import type { ConfigFileLimits } from '../../../../catalog/registry/shared/types.js'
import type { AgentCommandRuntime } from '../../../../context/command/commandRouter.js'
import type { NormalizedClientInput } from '../../../../context/input/client/normalizeClientInput.js'
import type { AgentContext } from '../../../../context/runtime/runtimeContext.js'
import type { AgentCapabilitiesResponse, AgentRun, ResolvedAgentSkill } from '../../../shared/types.js'
import type { AgentMemory } from '../../../../memory/shared/types.js'
import { buildDebugContext, buildDebugTrace } from '../../../../context/diagnostics/debug/debugContext.js'
import { modelTurnContext } from '../../../../context/prompt/turn/modelTurnContext.js'
import { cloneJSONValue } from '../../../../shared/json/jsonValue.js'

export interface BuildRunSetupMetadataInput {
  run: AgentRun
  agentManifest: AgentManifest
  skills: ResolvedAgentSkill[]
  capabilities: AgentCapabilitiesResponse
  contextResult: JSONValue
  context: AgentContext
  memories: AgentMemory[]
  command: AgentCommandRuntime
  clientInput?: NormalizedClientInput
  authMetadata?: Record<string, JSONValue>
  catalogSnapshot?: {
    id: string
    version?: string | null
  }
  limits?: ConfigFileLimits
}

export interface BuiltRunSetupMetadata {
  debugContext: ReturnType<typeof buildDebugContext>
  metadata: Record<string, JSONValue>
}

export function buildRunSetupMetadata(input: BuildRunSetupMetadataInput): BuiltRunSetupMetadata {
  const debugContext = buildDebugContext(input.contextResult, input.memories, input.clientInput)
  const visibleToolNames = input.capabilities.resolvedTools.available.map((tool) => tool.name)
  const activeSkillIds = input.skills.map((skill) => skill.id)
  const contextLedger = modelTurnContext.createRunLedger({
    runId: input.run.id,
    threadId: input.run.threadId,
    catalogSnapshotId: input.catalogSnapshot?.id ?? 'unknown',
    catalogSnapshotVersion: input.catalogSnapshot?.version,
    activeSkillIds,
    visibleToolNames,
    now: input.run.createdAt,
  })
  return {
    debugContext,
    metadata: {
      ...(input.run.metadata ? cloneJSONValue(input.run.metadata) : {}),
      catalogSnapshot: {
        id: input.catalogSnapshot?.id ?? 'unknown',
        ...(input.catalogSnapshot?.version ? { version: input.catalogSnapshot.version } : {}),
      },
      activeSkillIds,
      visibleToolNames,
      ...(input.limits ? { limits: cloneJSONValue(input.limits as unknown as JSONValue) } : {}),
      contextLedger: contextLedger as unknown as JSONValue,
      debugTrace: buildDebugTrace(input.agentManifest, input.skills, input.capabilities.resolvedTools, []) as unknown as JSONValue,
      skills: input.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        activationReason: skill.activationReason,
        resolvedPriority: skill.resolvedPriority,
        instruction: skill.compiledInstruction ?? skill.instruction,
      })) as unknown as JSONValue,
      context: debugContext as unknown as JSONValue,
      command: cloneJSONValue(input.command as unknown as JSONValue),
      ...(input.authMetadata ? cloneJSONValue(input.authMetadata) : {}),
    },
  }
}
