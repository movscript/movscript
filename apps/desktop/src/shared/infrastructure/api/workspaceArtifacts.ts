import { configureSurfaceWorkspaceArtifactClient } from '@movscript/shared'
import { isProviderSessionNotFoundError, providerSessionClient } from '@/shared/infrastructure/providerSessionClient'

configureSurfaceWorkspaceArtifactClient({
  getWorkspaceArtifact: (workspaceId) => providerSessionClient.getWorkspaceArtifact(workspaceId),
  listWorkspaceArtifacts: (query) => providerSessionClient.listWorkspaceArtifacts(query),
  updateWorkspaceArtifact: (workspaceId, input) => providerSessionClient.updateWorkspaceArtifact(workspaceId, input),
  isNotFoundError: isProviderSessionNotFoundError,
})
