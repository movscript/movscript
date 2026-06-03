import {
  fallbackUserAgentWorkspaceDir,
  listAgentSessionRuntimeSummaries,
  type AgentSessionRuntimeSummary,
} from '@movscript/agent-runtime'

interface AgentSessionsOptions {
  workspace?: string
  json?: boolean
}

export async function cmdAgentSessions(options: AgentSessionsOptions) {
  const workspaceDir = resolveCliAgentWorkspaceDir(options.workspace)
  const sessions = listAgentSessionRuntimeSummaries(workspaceDir)
  if (options.json) {
    console.log(JSON.stringify({ workspaceDir, sessions }, null, 2))
    return
  }
  if (sessions.length === 0) {
    console.log(`No agent sessions found in ${workspaceDir}`)
    return
  }
  console.log(`Agent workspace: ${workspaceDir}`)
  console.log([
    'session'.padEnd(30),
    'state'.padEnd(12),
    'runtime'.padEnd(10),
    'updated'.padEnd(24),
    'thread',
  ].join('  '))
  for (const summary of sessions) {
    console.log(formatSessionSummary(summary))
  }
}

function resolveCliAgentWorkspaceDir(input?: string): string {
  return input?.trim()
    || process.env.MOVSCRIPT_AGENT_WORKSPACE_DIR
    || process.env.MOVSCRIPT_WORKSPACE_DIR
    || fallbackUserAgentWorkspaceDir()
}

function formatSessionSummary(summary: AgentSessionRuntimeSummary): string {
  const runtime = summary.running
    ? 'running'
    : summary.stale ? 'stale' : 'stopped'
  const state = summary.state?.status ?? 'unknown'
  const threadId = summary.state?.interactiveThreadId
    ?? summary.state?.rootThreadId
    ?? summary.state?.activeThreadId
    ?? '-'
  return [
    summary.session.id.padEnd(30),
    state.padEnd(12),
    runtime.padEnd(10),
    summary.session.updatedAt.padEnd(24),
    threadId,
  ].join('  ')
}
