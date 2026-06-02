export interface WorkspaceReviewApplyRequest {
  method: 'PATCH' | 'POST'
  path: string
  payload: Record<string, unknown>
}
