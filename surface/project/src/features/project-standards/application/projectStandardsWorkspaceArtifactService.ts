import {
  getSurfaceWorkspaceArtifact,
  isSurfaceWorkspaceArtifactNotFoundError,
  listSurfaceWorkspaceArtifacts,
  updateSurfaceWorkspaceArtifact,
  type SurfaceWorkspaceArtifactUpdateInput,
  type WorkspaceArtifact,
} from '@movscript/shared'

export type ProjectStandardsWorkspaceArtifact = WorkspaceArtifact
export type ProjectStandardsWorkspaceArtifactUpdateInput = SurfaceWorkspaceArtifactUpdateInput

export async function listProjectStandardsWorkspaceArtifacts(input: {
  projectId: number
  pageKey: string
  workspaceId?: string
}): Promise<ProjectStandardsWorkspaceArtifact[]> {
  try {
    if (input.workspaceId?.trim()) {
      const workspace = await getSurfaceWorkspaceArtifact(input.workspaceId.trim())
      return workspace.kind === 'project_standards_workspace' ? [workspace] : []
    }
    const { workspaces } = await listSurfaceWorkspaceArtifacts({
      projectId: input.projectId,
      kind: 'project_standards_workspace',
      pageKey: input.pageKey,
      limit: 20,
    })
    return workspaces
  } catch (error) {
    if (isSurfaceWorkspaceArtifactNotFoundError(error)) return []
    throw error
  }
}

export function updateProjectStandardsWorkspaceArtifact(
  workspaceId: string,
  input: ProjectStandardsWorkspaceArtifactUpdateInput,
): Promise<ProjectStandardsWorkspaceArtifact> {
  return updateSurfaceWorkspaceArtifact(workspaceId, input)
}
