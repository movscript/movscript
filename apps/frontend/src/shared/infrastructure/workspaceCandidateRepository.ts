import {
  createMovScriptWorkspaceAssetSlotCandidate,
  createMovScriptWorkspaceKeyframeCandidate,
  workspaceCandidateSemanticRecord,
} from '@movscript/core/workspace'
import {
  createElectronMovScriptWorkspaceFileRepository,
  resolveMovScriptWorkspaceProjectPath,
} from '@/shared/infrastructure/workspaceDomainRepository'
import type { SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'

type WorkspaceCandidatePayload = object

export async function createWorkspaceAssetSlotCandidate(
  projectId: number,
  payload: WorkspaceCandidatePayload,
  targetRecord?: SemanticEntityRecord,
): Promise<SemanticEntityRecord> {
  const workspaceApi = requireWorkspaceAPI()
  const projectPath = await resolveMovScriptWorkspaceProjectPath(workspaceApi, projectId)
  const result = await createMovScriptWorkspaceAssetSlotCandidate({
    fileRepository: createElectronMovScriptWorkspaceFileRepository(workspaceApi),
    projectPath,
    projectId,
    payload: payload as Record<string, unknown>,
    targetRecord: targetRecord as Record<string, unknown> | undefined,
  })
  return workspaceCandidateSemanticRecord(result) as SemanticEntityRecord
}

export async function createWorkspaceKeyframeCandidate(
  projectId: number,
  payload: WorkspaceCandidatePayload,
): Promise<SemanticEntityRecord> {
  const workspaceApi = requireWorkspaceAPI()
  const projectPath = await resolveMovScriptWorkspaceProjectPath(workspaceApi, projectId)
  const result = await createMovScriptWorkspaceKeyframeCandidate({
    fileRepository: createElectronMovScriptWorkspaceFileRepository(workspaceApi),
    projectPath,
    projectId,
    payload: payload as Record<string, unknown>,
  })
  return workspaceCandidateSemanticRecord(result) as SemanticEntityRecord
}

function requireWorkspaceAPI() {
  const workspaceApi = window.api
  if (!workspaceApi) throw new Error('当前窗口没有 MovScript 工作区能力')
  return workspaceApi
}
