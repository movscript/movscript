import type { ScriptWorkspaceRepositoryContext } from './scriptWorkspaceRepository'

export const scriptKeys = {
  projectScripts: (projectId: number | undefined, context: ScriptWorkspaceRepositoryContext) => [
    'scripts',
    projectId,
    context.userId ?? 'local',
    context.orgId ?? 'personal',
  ] as const,
  projectScriptScope: (projectId: number | undefined) => ['scripts', projectId] as const,
  versions: (projectId: number | undefined) => ['semantic-script-versions', projectId] as const,
  artifactRefs: (projectId: number | undefined) => ['artifact-refs', projectId] as const,
}
