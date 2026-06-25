import { workspaceCandidateSemanticRecord } from '@movscript/workspace'
import { configureSurfaceWorkspaceCandidateClient } from '@movscript/shared'
import { createElectronMovScriptWorkspaceService } from '../workspaceDomainRepository'

configureSurfaceWorkspaceCandidateClient({
  async createAssetSlotCandidate(projectId, payload, targetRecord) {
    const result = await createElectronMovScriptWorkspaceService({ projectId }).createAssetSlotCandidate({
      payload: payload as Record<string, unknown>,
      targetRecord: targetRecord as Record<string, unknown> | undefined,
    })
    return workspaceCandidateSemanticRecord(result)
  },
  async createKeyframeCandidate(projectId, payload) {
    const result = await createElectronMovScriptWorkspaceService({ projectId }).createKeyframeCandidate({
      payload: payload as Record<string, unknown>,
    })
    return workspaceCandidateSemanticRecord(result)
  },
})
