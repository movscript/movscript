import { api } from '@/lib/api'

export type ScriptPreviewSourceType = 'brief' | 'script' | 'storyboard_script'
export type ScriptPreviewStoryboardStatus = '待确认' | '需补素材' | '可预演'

export type ScriptPreviewDraftPayload = {
  source_text: string
  script_version_id?: number | null
  script_version: {
    draft_id: string | null
    title: string
    source_type: ScriptPreviewSourceType
  }
  storyboard_rows: ScriptPreviewStoryboardRow[]
  preview_timeline: ScriptPreviewTimelineInput[]
  preview_status?: string
  confirmed_at?: string
  analysis_candidates?: ScriptPreviewAnalysisCandidates
  preview_candidates?: ScriptPreviewCandidateData
}

export type ScriptPreviewStoryboardRow = {
  client_id: string
  order: number
  title: string
  body: string
  duration_seconds: number
  status: ScriptPreviewStoryboardStatus
}

export type ScriptPreviewTimelineInput = {
  client_id: string
  order: number
  start_seconds: number
  end_seconds: number
  duration_seconds: number
}

export type SaveScriptPreviewDraftResponse = {
  draft_id: string
  script_version_id?: number | null
  storyboard_revision_id: string
  preview_timeline_id: string
  saved_at: string
  status: string
  next_actions: string[]
  draft: {
    project_id: number
    source_text: string
    script_version_id?: number | null
    script_version: ScriptPreviewDraftPayload['script_version']
    storyboard_rows: ScriptPreviewStoryboardRow[]
    preview_timeline: ScriptPreviewTimelineInput[]
    preview_status?: string
    confirmed_at?: string
    analysis_candidates?: ScriptPreviewAnalysisCandidates
    preview_candidates?: ScriptPreviewCandidateData
  }
}

export type GetLatestScriptPreviewDraftResponse = {
  found: boolean
  draft?: SaveScriptPreviewDraftResponse
}

export type AnalyzeScriptPreviewResponse = {
  draft_id: string
  generated_at: string
  sections: Array<{
    client_id: string
    order: number
    title: string
    summary: string
    source_range: string
    confidence: number
    confirm_question: string
  }>
  confirm_questions: string[]
  storyboard_suggestions: Array<{
    client_id: string
    source_section_id: string
    order: number
    title: string
    body: string
    duration_seconds: number
    status: ScriptPreviewStoryboardStatus
    adoption_intent: string
    adoption_status?: 'pending' | 'accepted' | 'rejected' | string
  }>
  status: string
}

export type ScriptPreviewAnalysisCandidates = {
  generated_at: string
  sections: AnalyzeScriptPreviewResponse['sections']
  confirm_questions: string[]
  storyboard_suggestions: AnalyzeScriptPreviewResponse['storyboard_suggestions']
  status: string
}

export type GenerateScriptPreviewResponse = {
  draft_id: string
  generated_at: string
  keyframe_candidates: Array<{
    client_id: string
    storyboard_row_client_id: string
    prompt: string
    visual_anchor: string
    status: '候选' | '待补素材' | string
    decision_status?: 'pending' | 'accepted' | 'rejected' | string
  }>
  preview_timeline: Array<{
    client_id: string
    storyboard_row_client_id: string
    keyframe_candidate_client_id?: string
    order: number
    start_seconds: number
    duration_seconds: number
    end_seconds: number
    label: string
    status: string
    confirmation_status?: 'pending' | 'accepted' | 'rejected' | string
  }>
  asset_gaps: Array<{
    client_id: string
    storyboard_row_client_id: string
    name: string
    description: string
    priority: string
    status: 'missing' | 'accepted' | 'resolved' | 'rejected' | string
  }>
  status: string
}

export type ConfirmScriptPreviewResponse = SaveScriptPreviewDraftResponse

export type ScriptPreviewCandidateData = {
  generated_at: string
  keyframe_candidates: GenerateScriptPreviewResponse['keyframe_candidates']
  preview_timeline: GenerateScriptPreviewResponse['preview_timeline']
  asset_gaps: GenerateScriptPreviewResponse['asset_gaps']
  status: string
}

export async function saveScriptPreviewDraft(projectId: number, payload: ScriptPreviewDraftPayload) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`/projects/${projectId}/script-preview/draft`, payload)
  return res.data
}

export async function getLatestScriptPreviewDraft(projectId: number) {
  const res = await api.get<GetLatestScriptPreviewDraftResponse>(`/projects/${projectId}/script-preview/draft`)
  return res.data
}

export async function analyzeScriptPreview(
  projectId: number,
  payload: Pick<ScriptPreviewDraftPayload, 'source_text' | 'storyboard_rows'> & { draft_id: string },
) {
  const res = await api.post<AnalyzeScriptPreviewResponse>(`/projects/${projectId}/script-preview/analyze`, payload)
  return res.data
}

export async function generateScriptPreview(
  projectId: number,
  payload: { draft_id: string; storyboard_rows: ScriptPreviewStoryboardRow[] },
) {
  const res = await api.post<GenerateScriptPreviewResponse>(`/projects/${projectId}/script-preview/generate-preview`, payload)
  return res.data
}

export async function confirmScriptPreview(
  projectId: number,
  payload: { draft_id: string },
) {
  const res = await api.post<ConfirmScriptPreviewResponse>(`/projects/${projectId}/script-preview/confirm-preview`, payload)
  return res.data
}

export async function acceptStoryboardSuggestion(
  projectId: number,
  payload: { draft_id: string; suggestion_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`/projects/${projectId}/script-preview/storyboard-suggestions/accept`, payload)
  return res.data
}

export async function rejectStoryboardSuggestion(
  projectId: number,
  payload: { draft_id: string; suggestion_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`/projects/${projectId}/script-preview/storyboard-suggestions/reject`, payload)
  return res.data
}

export async function acceptKeyframeCandidate(
  projectId: number,
  payload: { draft_id: string; keyframe_candidate_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`/projects/${projectId}/script-preview/keyframe-candidates/accept`, payload)
  return res.data
}

export async function rejectKeyframeCandidate(
  projectId: number,
  payload: { draft_id: string; keyframe_candidate_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`/projects/${projectId}/script-preview/keyframe-candidates/reject`, payload)
  return res.data
}

export async function acceptAssetGap(
  projectId: number,
  payload: { draft_id: string; asset_gap_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`/projects/${projectId}/script-preview/asset-gaps/accept`, payload)
  return res.data
}

export async function resolveAssetGap(
  projectId: number,
  payload: { draft_id: string; asset_gap_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`/projects/${projectId}/script-preview/asset-gaps/resolve`, payload)
  return res.data
}

export async function rejectAssetGap(
  projectId: number,
  payload: { draft_id: string; asset_gap_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`/projects/${projectId}/script-preview/asset-gaps/reject`, payload)
  return res.data
}
