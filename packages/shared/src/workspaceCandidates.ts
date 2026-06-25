import type { SemanticEntityRecord } from './surfaceSemanticEntities.js'

export type SurfaceWorkspaceCandidatePayload = object

export interface SurfaceWorkspaceCandidateClient {
  createAssetSlotCandidate(
    projectId: number,
    payload: SurfaceWorkspaceCandidatePayload,
    targetRecord?: SemanticEntityRecord,
  ): Promise<SemanticEntityRecord>
  createKeyframeCandidate(
    projectId: number,
    payload: SurfaceWorkspaceCandidatePayload,
  ): Promise<SemanticEntityRecord>
}

let workspaceCandidateClient: SurfaceWorkspaceCandidateClient | undefined

export function configureSurfaceWorkspaceCandidateClient(client: SurfaceWorkspaceCandidateClient): void {
  workspaceCandidateClient = client
}

export function readSurfaceWorkspaceCandidateClient(): SurfaceWorkspaceCandidateClient {
  if (!workspaceCandidateClient) throw new Error('Surface workspace candidate client is not configured.')
  return workspaceCandidateClient
}

export function createSurfaceWorkspaceAssetSlotCandidate(
  projectId: number,
  payload: SurfaceWorkspaceCandidatePayload,
  targetRecord?: SemanticEntityRecord,
): Promise<SemanticEntityRecord> {
  return readSurfaceWorkspaceCandidateClient().createAssetSlotCandidate(projectId, payload, targetRecord)
}

export function createSurfaceWorkspaceKeyframeCandidate(
  projectId: number,
  payload: SurfaceWorkspaceCandidatePayload,
): Promise<SemanticEntityRecord> {
  return readSurfaceWorkspaceCandidateClient().createKeyframeCandidate(projectId, payload)
}
