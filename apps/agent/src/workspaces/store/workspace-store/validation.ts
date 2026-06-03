import type {
  AgentWorkspace,
  AgentWorkspaceValidationIssue,
  AgentWorkspaceValidationResult,
} from '../workspaceStore.js'

export function validateWorkspace(workspace: AgentWorkspace): AgentWorkspaceValidationResult {
  const issues: AgentWorkspaceValidationIssue[] = []
  if (!workspace.title.trim()) {
    issues.push({ path: '/title', message: 'Workspace title is required.', severity: 'error' })
  }
  if (!workspace.kind.trim()) {
    issues.push({ path: '/kind', message: 'Workspace kind is required.', severity: 'error' })
  }
  if (!workspace.content.trim()) {
    issues.push({ path: '/content', message: 'Workspace content is required.', severity: 'error' })
  }
  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    workspaceId: workspace.id,
    kind: workspace.kind,
    issues,
  }
}
