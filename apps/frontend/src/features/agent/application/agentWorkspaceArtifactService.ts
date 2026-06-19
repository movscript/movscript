import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import type { WorkspaceArtifact } from '@/shared/contracts/workspaceArtifact'

export type AgentWorkspaceArtifact = WorkspaceArtifact

export async function getAgentWorkspaceArtifact(workspaceId: string): Promise<AgentWorkspaceArtifact> {
  return providerSessionClient.getWorkspaceArtifact(workspaceId)
}

export async function listAgentMessageWorkspaceArtifacts(workspaceIds: readonly string[]): Promise<Array<AgentWorkspaceArtifact | null>> {
  return Promise.all(workspaceIds.map(async (workspaceId) => {
    try {
      return await getAgentWorkspaceArtifact(workspaceId)
    } catch {
      return null
    }
  }))
}
