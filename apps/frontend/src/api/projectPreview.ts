import { api } from '@/lib/api'

const projectPreviewPath = (projectId: number | string) => `/projects/${projectId}/project-preview`

export type ProjectPreviewSourceType = 'brief' | 'script' | 'storyboard_script'
export type ProjectPreviewStoryboardStatus = '待确认' | '需补素材' | '可预演'

export type ProjectPreviewDraftPayload = {
  source_text: string
  script_version_id?: number | null
  script_version: {
    draft_id: string | null
    title: string
    source_type: ProjectPreviewSourceType
  }
  storyboard_rows: ProjectPreviewStoryboardRow[]
  preview_timeline: ProjectPreviewTimelineInput[]
  preview_status?: string
  confirmed_at?: string
  analysis_candidates?: ProjectPreviewAnalysisCandidates
  preview_candidates?: ProjectPreviewCandidateData
}

export type ProjectPreviewStoryboardRow = {
  client_id: string
  order: number
  title: string
  body: string
  duration_seconds: number
  status: ProjectPreviewStoryboardStatus
}

export type ProjectPreviewTimelineInput = {
  client_id: string
  order: number
  start_seconds: number
  end_seconds: number
  duration_seconds: number
}

export type SaveProjectPreviewDraftResponse = {
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
    script_version: ProjectPreviewDraftPayload['script_version']
    storyboard_rows: ProjectPreviewStoryboardRow[]
    preview_timeline: ProjectPreviewTimelineInput[]
    preview_status?: string
    confirmed_at?: string
    analysis_candidates?: ProjectPreviewAnalysisCandidates
    preview_candidates?: ProjectPreviewCandidateData
  }
}

export type GetLatestProjectPreviewDraftResponse = {
  found: boolean
  draft?: SaveProjectPreviewDraftResponse
}

export type AnalyzeProjectPreviewResponse = {
  draft_id: string
  generated_at: string
  segments: Array<{
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
    source_segment_id: string
    order: number
    title: string
    body: string
    duration_seconds: number
    status: ProjectPreviewStoryboardStatus
    adoption_intent: string
    adoption_status?: 'pending' | 'accepted' | 'rejected' | string
  }>
  status: string
}

export type ProjectPreviewAnalysisCandidates = {
  generated_at: string
  segments: AnalyzeProjectPreviewResponse['segments']
  confirm_questions: string[]
  storyboard_suggestions: AnalyzeProjectPreviewResponse['storyboard_suggestions']
  status: string
}

export type GenerateProjectPreviewResponse = {
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

export type ConfirmProjectPreviewResponse = SaveProjectPreviewDraftResponse

export type ProjectPreviewCandidateData = {
  generated_at: string
  keyframe_candidates: GenerateProjectPreviewResponse['keyframe_candidates']
  preview_timeline: GenerateProjectPreviewResponse['preview_timeline']
  asset_gaps: GenerateProjectPreviewResponse['asset_gaps']
  status: string
}

type AnalyzeProjectPreviewPayload = Pick<ProjectPreviewDraftPayload, 'source_text' | 'storyboard_rows'> & {
  draft_id: string
  generated_at?: string
  segments?: AnalyzeProjectPreviewResponse['segments']
  confirm_questions?: string[]
  storyboard_suggestions?: AnalyzeProjectPreviewResponse['storyboard_suggestions']
  status?: string
}

type GenerateProjectPreviewPayload = {
  draft_id: string
  storyboard_rows: ProjectPreviewStoryboardRow[]
  generated_at?: string
  keyframe_candidates?: GenerateProjectPreviewResponse['keyframe_candidates']
  preview_timeline?: GenerateProjectPreviewResponse['preview_timeline']
  asset_gaps?: GenerateProjectPreviewResponse['asset_gaps']
  status?: string
}

export async function saveProjectPreviewDraft(projectId: number, payload: ProjectPreviewDraftPayload) {
  const res = await api.post<SaveProjectPreviewDraftResponse>(`${projectPreviewPath(projectId)}/draft`, payload)
  return res.data
}

export async function getLatestProjectPreviewDraft(projectId: number) {
  const res = await api.get<GetLatestProjectPreviewDraftResponse>(`${projectPreviewPath(projectId)}/draft`)
  return res.data
}

export async function analyzeProjectPreview(
  projectId: number,
  payload: AnalyzeProjectPreviewPayload,
) {
  const res = await api.post<AnalyzeProjectPreviewResponse>(
    `${projectPreviewPath(projectId)}/analyze`,
    buildAnalysisCandidatePayload(payload),
  )
  return res.data
}

export async function generateProjectPreview(
  projectId: number,
  payload: GenerateProjectPreviewPayload,
) {
  const res = await api.post<GenerateProjectPreviewResponse>(
    `${projectPreviewPath(projectId)}/generate-preview`,
    buildPreviewCandidatePayload(payload),
  )
  return res.data
}

function buildAnalysisCandidatePayload(
  payload: AnalyzeProjectPreviewPayload,
) {
  if ((payload.segments?.length ?? 0) > 0 || (payload.storyboard_suggestions?.length ?? 0) > 0) {
    return {
      ...payload,
      generated_at: payload.generated_at || new Date().toISOString(),
      confirm_questions: payload.confirm_questions ?? [],
      status: payload.status || 'succeeded',
    }
  }

  const sourceLines = meaningfulLines(payload.source_text)
  if (sourceLines.length === 0) {
    for (const row of payload.storyboard_rows ?? []) {
      const text = row.body.trim()
      if (text) sourceLines.push(text)
    }
  }

  const segments: AnalyzeProjectPreviewResponse['segments'] = []
  const storyboardSuggestions: AnalyzeProjectPreviewResponse['storyboard_suggestions'] = []
  const confirmQuestions: string[] = []

  sourceLines.forEach((line, index) => {
    const order = index + 1
    const segmentId = `segment-${String(order).padStart(3, '0')}`
    const title = summarizeTitle(line, order)
    const question = `第 ${order} 段的情绪转折是否需要用户确认？`
    segments.push({
      client_id: segmentId,
      order,
      title,
      summary: line,
      source_range: `line:${order}`,
      confidence: 0.78,
      confirm_question: question,
    })
    confirmQuestions.push(question)
    storyboardSuggestions.push({
      client_id: `suggestion-${String(order).padStart(3, '0')}`,
      source_segment_id: segmentId,
      order,
      title,
      body: line,
      duration_seconds: 6 + (order % 3) * 2,
      status: '待确认',
      adoption_intent: 'append_storyboard_row',
      adoption_status: 'pending',
    })
  })

  return {
    ...payload,
    generated_at: new Date().toISOString(),
    segments,
    confirm_questions: confirmQuestions,
    storyboard_suggestions: storyboardSuggestions,
    status: 'succeeded',
  }
}

function buildPreviewCandidatePayload(payload: GenerateProjectPreviewPayload) {
  if (
    (payload.keyframe_candidates?.length ?? 0) > 0 ||
    (payload.preview_timeline?.length ?? 0) > 0 ||
    (payload.asset_gaps?.length ?? 0) > 0
  ) {
    return {
      ...payload,
      generated_at: payload.generated_at || new Date().toISOString(),
      status: payload.status || 'succeeded',
    }
  }

  const rows = normalizeStoryboardRows(payload.storyboard_rows)
  const keyframeCandidates: GenerateProjectPreviewResponse['keyframe_candidates'] = []
  const previewTimeline: GenerateProjectPreviewResponse['preview_timeline'] = []
  const assetGaps: GenerateProjectPreviewResponse['asset_gaps'] = []
  let cursor = 0

  rows.forEach((row, index) => {
    const order = index + 1
    const candidateId = `keyframe-${String(order).padStart(3, '0')}`
    const needsAsset = row.status === '需补素材'
    if (needsAsset) {
      assetGaps.push({
        client_id: `asset-gap-${String(order).padStart(3, '0')}`,
        storyboard_row_client_id: row.client_id,
        name: `第 ${order} 段参考素材`,
        description: row.title || '未命名片段',
        priority: 'normal',
        status: 'missing',
      })
    }
    keyframeCandidates.push({
      client_id: candidateId,
      storyboard_row_client_id: row.client_id,
      prompt: buildKeyframePrompt(row),
      visual_anchor: `${row.title || '片段'}的关键画面`,
      status: needsAsset ? '待补素材' : '候选',
      decision_status: 'pending',
    })
    previewTimeline.push({
      client_id: `timeline-${String(order).padStart(3, '0')}`,
      storyboard_row_client_id: row.client_id,
      keyframe_candidate_client_id: candidateId,
      order,
      start_seconds: cursor,
      duration_seconds: row.duration_seconds,
      end_seconds: cursor + row.duration_seconds,
      label: row.title || `片段 ${order}`,
      status: previewStatus(row.status),
      confirmation_status: 'pending',
    })
    cursor += row.duration_seconds
  })

  return {
    ...payload,
    storyboard_rows: rows,
    generated_at: new Date().toISOString(),
    keyframe_candidates: keyframeCandidates,
    preview_timeline: previewTimeline,
    asset_gaps: assetGaps,
    status: 'succeeded',
  }
}

function meaningfulLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function summarizeTitle(text: string, order: number) {
  const trimmed = text.trim()
  return trimmed ? [...trimmed].slice(0, 14).join('') : `片段 ${order}`
}

function normalizeStoryboardRows(rows: ProjectPreviewStoryboardRow[]) {
  return rows.map((row, index) => ({
    ...row,
    client_id: row.client_id || String(index + 1).padStart(2, '0'),
    order: row.order > 0 ? row.order : index + 1,
    title: row.title.trim(),
    body: row.body.trim(),
    status: row.status || '待确认',
    duration_seconds: row.duration_seconds > 0 ? row.duration_seconds : 6,
  }))
}

function buildKeyframePrompt(row: ProjectPreviewStoryboardRow) {
  const body = row.body || row.title
  return `为「${row.title || '未命名片段'}」生成预演关键帧：${body}`
}

function previewStatus(rowStatus: string) {
  if (rowStatus === '需补素材') return 'needs_asset'
  if (rowStatus === '可预演') return 'playable'
  return 'draft'
}

export async function confirmProjectPreview(
  projectId: number,
  payload: { draft_id: string },
) {
  const res = await api.post<ConfirmProjectPreviewResponse>(`${projectPreviewPath(projectId)}/confirm-preview`, payload)
  return res.data
}

export async function acceptStoryboardSuggestion(
  projectId: number,
  payload: { draft_id: string; suggestion_client_id: string },
) {
  const res = await api.post<SaveProjectPreviewDraftResponse>(`${projectPreviewPath(projectId)}/storyboard-suggestions/accept`, payload)
  return res.data
}

export async function rejectStoryboardSuggestion(
  projectId: number,
  payload: { draft_id: string; suggestion_client_id: string },
) {
  const res = await api.post<SaveProjectPreviewDraftResponse>(`${projectPreviewPath(projectId)}/storyboard-suggestions/reject`, payload)
  return res.data
}

export async function acceptKeyframeCandidate(
  projectId: number,
  payload: { draft_id: string; keyframe_candidate_client_id: string },
) {
  const res = await api.post<SaveProjectPreviewDraftResponse>(`${projectPreviewPath(projectId)}/keyframe-candidates/accept`, payload)
  return res.data
}

export async function rejectKeyframeCandidate(
  projectId: number,
  payload: { draft_id: string; keyframe_candidate_client_id: string },
) {
  const res = await api.post<SaveProjectPreviewDraftResponse>(`${projectPreviewPath(projectId)}/keyframe-candidates/reject`, payload)
  return res.data
}

export async function acceptAssetGap(
  projectId: number,
  payload: { draft_id: string; asset_gap_client_id: string },
) {
  const res = await api.post<SaveProjectPreviewDraftResponse>(`${projectPreviewPath(projectId)}/asset-gaps/accept`, payload)
  return res.data
}

export async function resolveAssetGap(
  projectId: number,
  payload: { draft_id: string; asset_gap_client_id: string },
) {
  const res = await api.post<SaveProjectPreviewDraftResponse>(`${projectPreviewPath(projectId)}/asset-gaps/resolve`, payload)
  return res.data
}

export async function rejectAssetGap(
  projectId: number,
  payload: { draft_id: string; asset_gap_client_id: string },
) {
  const res = await api.post<SaveProjectPreviewDraftResponse>(`${projectPreviewPath(projectId)}/asset-gaps/reject`, payload)
  return res.data
}
