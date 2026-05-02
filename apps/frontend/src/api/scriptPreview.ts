import { api } from '@/lib/api'

const productionManagementPath = (projectId: number | string) => `/projects/${projectId}/production-management`

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

type AnalyzeScriptPreviewPayload = Pick<ScriptPreviewDraftPayload, 'source_text' | 'storyboard_rows'> & {
  draft_id: string
  generated_at?: string
  sections?: AnalyzeScriptPreviewResponse['sections']
  confirm_questions?: string[]
  storyboard_suggestions?: AnalyzeScriptPreviewResponse['storyboard_suggestions']
  status?: string
}

type GenerateScriptPreviewPayload = {
  draft_id: string
  storyboard_rows: ScriptPreviewStoryboardRow[]
  generated_at?: string
  keyframe_candidates?: GenerateScriptPreviewResponse['keyframe_candidates']
  preview_timeline?: GenerateScriptPreviewResponse['preview_timeline']
  asset_gaps?: GenerateScriptPreviewResponse['asset_gaps']
  status?: string
}

export async function saveScriptPreviewDraft(projectId: number, payload: ScriptPreviewDraftPayload) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`${productionManagementPath(projectId)}/draft`, payload)
  return res.data
}

export async function getLatestScriptPreviewDraft(projectId: number) {
  const res = await api.get<GetLatestScriptPreviewDraftResponse>(`${productionManagementPath(projectId)}/draft`)
  return res.data
}

export async function analyzeScriptPreview(
  projectId: number,
  payload: AnalyzeScriptPreviewPayload,
) {
  const res = await api.post<AnalyzeScriptPreviewResponse>(
    `${productionManagementPath(projectId)}/analyze`,
    buildAnalysisCandidatePayload(payload),
  )
  return res.data
}

export async function generateScriptPreview(
  projectId: number,
  payload: GenerateScriptPreviewPayload,
) {
  const res = await api.post<GenerateScriptPreviewResponse>(
    `${productionManagementPath(projectId)}/generate-preview`,
    buildPreviewCandidatePayload(payload),
  )
  return res.data
}

function buildAnalysisCandidatePayload(
  payload: AnalyzeScriptPreviewPayload,
) {
  if ((payload.sections?.length ?? 0) > 0 || (payload.storyboard_suggestions?.length ?? 0) > 0) {
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

  const sections: AnalyzeScriptPreviewResponse['sections'] = []
  const storyboardSuggestions: AnalyzeScriptPreviewResponse['storyboard_suggestions'] = []
  const confirmQuestions: string[] = []

  sourceLines.forEach((line, index) => {
    const order = index + 1
    const sectionId = `section-${String(order).padStart(3, '0')}`
    const title = summarizeTitle(line, order)
    const question = `第 ${order} 段的情绪转折是否需要用户确认？`
    sections.push({
      client_id: sectionId,
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
      source_section_id: sectionId,
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
    sections,
    confirm_questions: confirmQuestions,
    storyboard_suggestions: storyboardSuggestions,
    status: 'succeeded',
  }
}

function buildPreviewCandidatePayload(payload: GenerateScriptPreviewPayload) {
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
  const keyframeCandidates: GenerateScriptPreviewResponse['keyframe_candidates'] = []
  const previewTimeline: GenerateScriptPreviewResponse['preview_timeline'] = []
  const assetGaps: GenerateScriptPreviewResponse['asset_gaps'] = []
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
  return trimmed ? [...trimmed].slice(0, 14).join('') : `剧本节 ${order}`
}

function normalizeStoryboardRows(rows: ScriptPreviewStoryboardRow[]) {
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

function buildKeyframePrompt(row: ScriptPreviewStoryboardRow) {
  const body = row.body || row.title
  return `为「${row.title || '未命名片段'}」生成预演关键帧：${body}`
}

function previewStatus(rowStatus: string) {
  if (rowStatus === '需补素材') return 'needs_asset'
  if (rowStatus === '可预演') return 'playable'
  return 'draft'
}

export async function confirmScriptPreview(
  projectId: number,
  payload: { draft_id: string },
) {
  const res = await api.post<ConfirmScriptPreviewResponse>(`${productionManagementPath(projectId)}/confirm-preview`, payload)
  return res.data
}

export async function acceptStoryboardSuggestion(
  projectId: number,
  payload: { draft_id: string; suggestion_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`${productionManagementPath(projectId)}/storyboard-suggestions/accept`, payload)
  return res.data
}

export async function rejectStoryboardSuggestion(
  projectId: number,
  payload: { draft_id: string; suggestion_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`${productionManagementPath(projectId)}/storyboard-suggestions/reject`, payload)
  return res.data
}

export async function acceptKeyframeCandidate(
  projectId: number,
  payload: { draft_id: string; keyframe_candidate_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`${productionManagementPath(projectId)}/keyframe-candidates/accept`, payload)
  return res.data
}

export async function rejectKeyframeCandidate(
  projectId: number,
  payload: { draft_id: string; keyframe_candidate_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`${productionManagementPath(projectId)}/keyframe-candidates/reject`, payload)
  return res.data
}

export async function acceptAssetGap(
  projectId: number,
  payload: { draft_id: string; asset_gap_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`${productionManagementPath(projectId)}/asset-gaps/accept`, payload)
  return res.data
}

export async function resolveAssetGap(
  projectId: number,
  payload: { draft_id: string; asset_gap_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`${productionManagementPath(projectId)}/asset-gaps/resolve`, payload)
  return res.data
}

export async function rejectAssetGap(
  projectId: number,
  payload: { draft_id: string; asset_gap_client_id: string },
) {
  const res = await api.post<SaveScriptPreviewDraftResponse>(`${productionManagementPath(projectId)}/asset-gaps/reject`, payload)
  return res.data
}
