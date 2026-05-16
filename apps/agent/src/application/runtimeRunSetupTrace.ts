import type { RuntimeLayerResolution } from '../skills/runtimeLayerResolver.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type {
  AgentCapabilitiesResponse,
  AgentDebugContextPanel,
  AgentRun,
  AgentTraceEvent,
  AgentTraceEventKind,
  JSONValue,
  ResolvedAgentSkill,
} from '../state/types.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentMemory } from '../memory/types.js'

export interface RuntimeRunSetupTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  data?: unknown
}

export function recordRuntimeRunSetupTraces(input: {
  run: AgentRun
  setupRound: AgentRunRoundInfo
  debugContext: AgentDebugContextPanel
  contextError?: string
  contextDurationMs: number
  contextStartedAt: number
  contextCompletedAt: number
  focusTimings?: unknown
  agentManifest: AgentManifest
  activeManifest: AgentManifest
  layers?: RuntimeLayerResolution
  toolRegistry: ToolRegistry
  skills: ResolvedAgentSkill[]
  capabilities: AgentCapabilitiesResponse
  capabilityStartedAt: number
  capabilityDurationMs: number
  memories: AgentMemory[]
  catalogSnapshotId: string
  catalogSnapshotVersion: string | null
  pluginWarningCount: number
  contextWarningCount: number
  now: () => string
  recordTrace: (run: AgentRun, trace: RuntimeRunSetupTraceInput) => void
}): void {
  input.recordTrace(input.run, {
    kind: 'context',
    title: input.contextError ? 'Runtime context resolved from fallback' : 'Runtime context resolved',
    summary: runtimeContextSummary(input.debugContext, input.contextError, input.contextDurationMs),
    status: input.contextError ? 'blocked' : 'completed',
    round: input.setupRound,
    data: {
      route: input.debugContext.route,
      project: input.debugContext.project,
      selection: input.debugContext.selection,
      ...(input.debugContext.agentPlan ? { agentPlan: input.debugContext.agentPlan as unknown as JSONValue } : {}),
      recentResourceCount: input.debugContext.recentResources.length,
      attachmentCount: input.debugContext.attachments.length,
      durationMs: input.contextDurationMs,
      startedAt: new Date(input.contextStartedAt).toISOString(),
      completedAt: new Date(input.contextCompletedAt).toISOString(),
      ...(input.focusTimings ? { focusTimings: input.focusTimings } : {}),
      ...(input.contextError ? { fallback: true, error: input.contextError } : {}),
    },
  })
  input.recordTrace(input.run, {
    kind: 'manifest',
    title: 'Agent manifest resolved',
    summary: `${input.agentManifest.name} (${input.agentManifest.id}@${input.agentManifest.version})`,
    status: 'completed',
    round: input.setupRound,
    data: {
      eventType: 'profile.resolved',
      id: input.layers?.trace.profileId ?? input.activeManifest.id,
      version: input.layers?.trace.profileVersion ?? input.activeManifest.version,
      ...(input.layers?.trace.personaId ? { personaId: input.layers.trace.personaId } : {}),
      ...(input.layers ? { policyIds: input.layers.trace.policyIds, workflowIds: input.layers.trace.workflowIds, profileLayers: input.layers.trace.profileLayers } : {}),
      permissions: Array.from(new Set(input.activeManifest.tools
        .filter((grant) => grant.mode !== 'deny')
        .flatMap((grant) => {
          const tool = input.toolRegistry.get(grant.name)
          return tool ? [tool.permission] : []
        }))),
      toolGrants: input.activeManifest.tools.map((tool) => ({ name: tool.name, mode: tool.mode, approval: tool.approval })),
    },
  })
  input.recordTrace(input.run, {
    kind: 'skill',
    title: 'Skills activated',
    summary: input.skills.length > 0 ? input.skills.map((skill) => skill.name).join(', ') : 'No skills activated.',
    status: 'completed',
    round: input.setupRound,
    data: {
      eventType: 'trigger.evaluated',
      skills: input.skills.map((skill) => ({ id: skill.id, name: skill.name, activationReason: skill.activationReason, priority: skill.resolvedPriority, warnings: skill.warnings })),
    },
  })
  input.recordTrace(input.run, {
    kind: 'tool_catalog',
    title: 'Tool catalog resolved',
    summary: `${input.capabilities.resolvedTools.available.length} available, ${input.capabilities.resolvedTools.blocked.length} blocked. (${input.capabilityDurationMs}ms)`,
    status: 'completed',
    round: input.setupRound,
    data: {
      availableToolNames: input.capabilities.resolvedTools.available.map((tool) => tool.name),
      blockedTools: input.capabilities.resolvedTools.blocked.map((tool) => ({ name: tool.name, reason: tool.unavailableReason })),
      warnings: input.capabilities.warnings,
      durationMs: input.capabilityDurationMs,
      startedAt: new Date(input.capabilityStartedAt).toISOString(),
      completedAt: input.now(),
    },
  })
  input.recordTrace(input.run, {
    kind: 'context',
    title: 'Run context built',
    summary: `${input.skills.length} active skill(s), ${input.capabilities.resolvedTools.available.length} visible tool(s), ${input.memories.length} memory ref(s).`,
    status: 'completed',
    round: input.setupRound,
    data: {
      eventType: 'context.run_built',
      runId: input.run.id,
      threadId: input.run.threadId,
      catalogSnapshotId: input.catalogSnapshotId,
      catalogSnapshotVersion: input.catalogSnapshotVersion,
      profileId: input.layers?.trace.profileId,
      activeSkillIds: input.skills.map((skill) => skill.id),
      visibleToolNames: input.capabilities.resolvedTools.available.map((tool) => tool.name),
      blockedToolCount: input.capabilities.resolvedTools.blocked.length,
      memoryRefCount: input.memories.length,
      warningCount: input.pluginWarningCount + input.contextWarningCount + (input.layers?.warnings.length ?? 0) + input.capabilities.warnings.length,
      focus: {
        route: input.debugContext.route,
        project: input.debugContext.project,
        selection: input.debugContext.selection,
        productionId: input.debugContext.productionId,
      } as unknown as JSONValue,
    },
  })
}

function runtimeContextSummary(debugContext: AgentDebugContextPanel, contextError: string | undefined, durationMs: number): string {
  if (debugContext.project) {
    return `Project #${debugContext.project.id} ${debugContext.project.name ?? ''} (${durationMs}ms)`.trim()
  }
  return contextError ? `MCP context unavailable; using client input snapshot. (${durationMs}ms)` : `No project selected. (${durationMs}ms)`
}
