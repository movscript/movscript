export interface DraftReviewApplyRequest {
  method: 'PATCH' | 'POST'
  path: string
  payload: Record<string, unknown>
}
