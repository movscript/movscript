import type { AgentRun } from '@/lib/localAgentClient'

const AGENT_CATALOG_TOOL_NAMES = new Set(['movscript_enable_agent_bundle'])

export function runTouchesAgentCatalog(run: AgentRun | null | undefined): boolean {
  if (!run) return false
  if (run.streamPartial) return false
  return run.steps.some((step) => step.type === 'tool_call' && step.toolName && AGENT_CATALOG_TOOL_NAMES.has(step.toolName))
}
