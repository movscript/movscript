import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'

export function workspaceDeveloperInstructionsParams(context: MovScriptWorkspaceContext | undefined): { developerInstructions?: string } {
  const instructions = workspaceDeveloperInstructions(context)
  return instructions ? { developerInstructions: instructions } : {}
}

export function workspaceDeveloperInstructions(context: MovScriptWorkspaceContext | undefined): string | undefined {
  if (!context) return undefined
  const scope = context.scope ?? (context.productionId !== undefined ? 'production' : context.projectId !== undefined ? 'project' : 'global')
  const projectId = idText(context.projectId)
  const productionId = idText(context.productionId)
  const lines = [
    'MovScript workspace boundary:',
    scope === 'global'
      ? '- This is a global MovScript workspace session. You may inspect multiple projects, but every project-scoped MovScript MCP domain/generation/workspace tool call must include the intended projectId/project_id explicitly.'
      : projectId
        ? `- This session is scoped to MovScript project ${projectId}. Only edit files and call project-scoped MovScript MCP tools for projectId/project_id ${projectId}.`
        : '- This session is scoped to a MovScript project workspace. Only edit the current project workspace; project-scoped MovScript MCP tools still require an explicit projectId/project_id.',
    '- Do not pass userId/user_id/orgId/org_id to MovScript MCP tools; MovScript app/frontend state and the MCP service own user and organization identity.',
    '- Do not rely on cwd, route, focus, or session state as a project argument for MCP tools; include projectId/project_id on every project-scoped call.',
  ]
  if (scope === 'production' && productionId) {
    lines.splice(2, 0, `- Active production scope: ${productionId}. Keep production edits inside project ${projectId ?? 'the current project'} unless the user explicitly changes scope.`)
  }
  return lines.join('\n')
}

function idText(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined
  const text = String(value).trim()
  return text || undefined
}
