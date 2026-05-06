import type { JSONValue } from '../types.js'
import type { AgentManifest } from '../manifest/agentManifest.js'
import type { AgentCommandRuntime } from '../runtime/commands/commandRouter.js'
import type { NormalizedClientInput } from '../runtime/input/normalizeClientInput.js'
import type { AgentContext } from '../runtime/context.js'
import type { AgentCapabilitiesResponse, AgentRun, ResolvedAgentSkill } from './types.js'
import type { AgentMemory } from '../memory/types.js'
import { buildDebugContext, buildDebugTrace } from '../runtime/debug/debugContext.js'

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
  return {
    debugContext,
    metadata: {
      ...(input.run.metadata ?? {}),
      debugTrace: buildDebugTrace(input.agentManifest, input.skills, input.capabilities.resolvedTools, []) as unknown as JSONValue,
      context: debugContext as unknown as JSONValue,
      command: input.command as unknown as JSONValue,
      ...(input.authMetadata ?? {}),
    },
  }
}
