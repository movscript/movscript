import { isProviderSessionNotFoundError, providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import type { WorkspaceArtifact } from '@/shared/contracts/workspaceArtifact'

export type ProjectStandardsWorkspaceArtifact = WorkspaceArtifact
export type ProjectStandardsWorkspaceArtifactUpdateInput = Parameters<typeof providerSessionClient.updateWorkspaceArtifact>[1]

export async function listProjectStandardsWorkspaceArtifacts(input: {
  projectId: number
  pageKey: string
  workspaceId?: string
}): Promise<ProjectStandardsWorkspaceArtifact[]> {
  try {
    if (input.workspaceId?.trim()) {
      const workspace = await providerSessionClient.getWorkspaceArtifact(input.workspaceId.trim())
      return workspace.kind === 'project_standards_workspace' ? [workspace] : []
    }
    const { workspaces } = await providerSessionClient.listWorkspaceArtifacts({
      projectId: input.projectId,
      kind: 'project_standards_workspace',
      pageKey: input.pageKey,
      limit: 20,
    })
    return workspaces
  } catch (error) {
    if (isProviderSessionNotFoundError(error)) return []
    throw error
  }
}

export function updateProjectStandardsWorkspaceArtifact(
  workspaceId: string,
  input: ProjectStandardsWorkspaceArtifactUpdateInput,
): Promise<ProjectStandardsWorkspaceArtifact> {
  return providerSessionClient.updateWorkspaceArtifact(workspaceId, input)
}
