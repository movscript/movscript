import type { JSONValue } from '../types.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import type { ProfileLimits } from '../catalog/types.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import type { NormalizedClientInput } from '../context/normalizeClientInput.js'
import type { AgentContext } from '../context/runtimeContext.js'
import type { AgentCapabilitiesResponse, AgentRun, ResolvedAgentSkill } from './types.js'
import type { AgentMemory } from '../memory/types.js'
import { buildDebugContext, buildDebugTrace } from '../context/debugContext.js'
import { contextManager } from '../contextManager/contextManager.js'

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
  limits?: ProfileLimits
}

export interface BuiltRunSetupMetadata {
  debugContext: ReturnType<typeof buildDebugContext>
  metadata: Record<string, JSONValue>
}

export function buildRunSetupMetadata(input: BuildRunSetupMetadataInput): BuiltRunSetupMetadata {
  const debugContext = buildDebugContext(input.contextResult, input.memories, input.clientInput)
  if (typeof input.context.currentProductionId === 'number') {
    debugContext.productionId = input.context.currentProductionId
  }
  const visibleToolNames = input.capabilities.resolvedTools.available.map((tool) => tool.name)
  const activeSkillIds = input.skills.map((skill) => skill.id)
  const contextLedger = contextManager.createRunLedger({
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
      ...(input.run.metadata ?? {}),
      catalogSnapshot: {
        id: input.catalogSnapshot?.id ?? 'unknown',
        ...(input.catalogSnapshot?.version ? { version: input.catalogSnapshot.version } : {}),
      },
      activeSkillIds,
      visibleToolNames,
      ...(input.limits ? { limits: input.limits as unknown as JSONValue } : {}),
      contextLedger: contextLedger as unknown as JSONValue,
      debugTrace: buildDebugTrace(input.agentManifest, input.skills, input.capabilities.resolvedTools, []) as unknown as JSONValue,
      skills: input.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        category: skill.category,
        activationReason: skill.activationReason,
        resolvedPriority: skill.resolvedPriority,
        instruction: skill.compiledInstruction ?? skill.instruction,
      })) as unknown as JSONValue,
      context: debugContext as unknown as JSONValue,
      command: input.command as unknown as JSONValue,
      ...(input.authMetadata ?? {}),
    },
  }
}
