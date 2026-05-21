import type { SemanticEntityPayload } from '@/api/semanticEntities'
import type { Job } from '@/types'
import {
  mergeMetadataJSON,
  metadataListFromText,
  metadataObject,
  parseMetadataJSON,
  textListFromMetadata,
} from './contentUnitPlanningMetadata.ts'

export type KeyframeFrameRole = 'first' | 'middle' | 'last'

export type ContentUnitEditDraft = {
  title: string
  duration_sec: string
  description: string
  prompt: string
  shot_size: string
  camera_angle: string
  camera_motion: string
  status: string
  metadata_json: string
  visual_plan_space: string
  visual_plan_blocking: string
  visual_plan_camera_path: string
  visual_plan_beats: string
  visual_plan_props: string
  visual_plan_lighting: string
  visual_plan_risks: string
  storyboard_purpose: string
  storyboard_subject: string
  storyboard_composition: string
  storyboard_action_moment: string
  storyboard_emotion: string
  storyboard_keyframe_suggestions: string
}

export type KeyframeEditDraft = {
  frame_role: string
  title: string
  order: string
  description: string
  prompt: string
  status: string
  metadata_json: string
}

export type ContentWorkbenchEditRecord = {
  ID: number
  title?: unknown
  name?: unknown
  kind?: unknown
  order?: unknown
  metadata_json?: unknown
  duration_sec?: unknown
  description?: unknown
  prompt?: unknown
  shot_size?: unknown
  camera_angle?: unknown
  camera_motion?: unknown
  status?: unknown
  resource_id?: unknown
}

export type ContentWorkbenchKeyframePromptRow = {
  title: string
  moment: ContentWorkbenchEditRecord & {
    action_text?: unknown
    description?: unknown
    location_text?: unknown
    time_text?: unknown
  }
}

export type ContentUnitInputDrawerTab = 'generation' | 'keyframes' | 'storyboard' | 'blocking'

export const keyframeFrameRoleOptions: Array<{ value: KeyframeFrameRole; label: string; detail: string }> = [
  { value: 'first', label: '首帧', detail: '约束视频开头的构图、人物状态和主要视觉信息。' },
  { value: 'middle', label: '中间帧', detail: '约束动作变化、情绪转折或关键过程状态。' },
  { value: 'last', label: '尾帧', detail: '约束视频结尾的落点、画面收束和连续性。' },
]

export const contentUnitEditShotSizeOptions = [
  { value: '', label: '未指定' },
  { value: 'extreme_wide', label: '大远景' },
  { value: 'wide', label: '远景' },
  { value: 'full', label: '全景' },
  { value: 'medium', label: '中景' },
  { value: 'medium_close', label: '中近景' },
  { value: 'close_up', label: '近景' },
  { value: 'extreme_close_up', label: '特写' },
  { value: 'detail', label: '细节' },
]

export const contentUnitEditCameraAngleOptions = [
  { value: '', label: '未指定' },
  { value: 'eye_level', label: '平视' },
  { value: 'high_angle', label: '俯拍' },
  { value: 'low_angle', label: '仰拍' },
  { value: 'top_down', label: '顶拍' },
  { value: 'dutch_angle', label: '倾斜角' },
  { value: 'over_shoulder', label: '过肩' },
  { value: 'pov', label: '主观视角' },
]

export const contentUnitEditCameraMotionOptions = [
  { value: '', label: '未指定' },
  { value: 'static', label: '固定镜头' },
  { value: 'pan', label: '摇镜' },
  { value: 'tilt', label: '俯仰' },
  { value: 'dolly_in', label: '推进' },
  { value: 'dolly_out', label: '拉远' },
  { value: 'truck_left', label: '左移' },
  { value: 'truck_right', label: '右移' },
  { value: 'tracking', label: '跟拍' },
  { value: 'orbit', label: '环绕' },
  { value: 'crane', label: '升降' },
  { value: 'handheld', label: '手持' },
  { value: 'zoom', label: '变焦' },
]

export const contentUnitEditStatusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'candidate', label: '候选' },
  { value: 'confirmed', label: '已确认' },
  { value: 'in_production', label: '生产中' },
  { value: 'locked', label: '已锁定' },
]

export const keyframeEditStatusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'candidate', label: '候选' },
  { value: 'generated', label: '已生成' },
  { value: 'attached', label: '已挂载' },
  { value: 'accepted', label: '已采纳' },
  { value: 'rejected', label: '已拒绝' },
]

export function frameRoleLabel(index: number, total: number) {
  if (total <= 1) return '关键画面'
  if (index <= 0) return '开头帧'
  if (index >= total - 1) return '结尾帧'
  if (total === 3) return '中间帧'
  return `中间帧 ${index}`
}

export function keyframeFrameRoleLabel(value: unknown) {
  return keyframeFrameRoleOptions.find((option) => option.value === value)?.label ?? '关键帧'
}

export function normalizeKeyframeFrameRole(value: unknown, fallback: KeyframeFrameRole): KeyframeFrameRole {
  return value === 'first' || value === 'middle' || value === 'last' ? value : fallback
}

export function keyframeFrameRoleFromRecord(record?: ContentWorkbenchEditRecord | null): KeyframeFrameRole {
  const metadata = parseMetadataJSON(record?.metadata_json)
  const role = normalizeNullableKeyframeFrameRole(metadata.frame_role)
  if (role) return role
  const order = numberOf(record?.order)
  if (order <= 1) return 'first'
  if (order >= 3) return 'last'
  return 'middle'
}

export function nextKeyframeFrameRole(keyframes: ContentWorkbenchEditRecord[]): KeyframeFrameRole {
  if (!keyframes.some((keyframe) => keyframeFrameRoleFromRecord(keyframe) === 'first')) return 'first'
  if (!keyframes.some((keyframe) => keyframeFrameRoleFromRecord(keyframe) === 'last')) return 'last'
  return 'middle'
}

export function keyframeOrderForRole(role: KeyframeFrameRole, keyframes: ContentWorkbenchEditRecord[]) {
  const roleBaseOrder: Record<KeyframeFrameRole, number> = { first: 1, middle: 2, last: 3 }
  const baseOrder = roleBaseOrder[role]
  const usedOrders = new Set(keyframes.map((keyframe) => numberOf(keyframe.order)).filter((order) => order > 0))
  if (!usedOrders.has(baseOrder)) return baseOrder
  return Math.max(baseOrder, ...usedOrders) + 1
}

export function keyframeTitleForRole(role: KeyframeFrameRole, unit: ContentWorkbenchEditRecord, title?: string) {
  return firstText(title, `${keyframeFrameRoleLabel(role)} · ${recordTitle(unit)}`)
}

export function keyframeDisplayTitle(keyframe: ContentWorkbenchEditRecord) {
  const roleLabel = keyframeFrameRoleLabel(keyframeFrameRoleFromRecord(keyframe))
  const title = recordTitle(keyframe)
  return title.startsWith(roleLabel) ? title : `${roleLabel} · ${title}`
}

export function contentUnitEditDraftFromRecord(unit?: ContentWorkbenchEditRecord | null): ContentUnitEditDraft {
  const metadata = parseMetadataJSON(unit?.metadata_json)
  const visualPlan = metadataObject(metadata.visual_plan)
  const storyboardBrief = metadataObject(metadata.storyboard_brief)
  return {
    title: firstText(unit?.title),
    duration_sec: unit?.duration_sec === undefined || unit?.duration_sec === null ? '' : String(unit.duration_sec),
    description: firstText(unit?.description),
    prompt: firstText(unit?.prompt),
    shot_size: firstText(unit?.shot_size),
    camera_angle: firstText(unit?.camera_angle),
    camera_motion: firstText(unit?.camera_motion),
    status: firstText(unit?.status, 'candidate'),
    metadata_json: firstText(unit?.metadata_json),
    visual_plan_space: firstText(visualPlan.space),
    visual_plan_blocking: firstText(visualPlan.blocking),
    visual_plan_camera_path: firstText(visualPlan.camera_path),
    visual_plan_beats: textListFromMetadata(visualPlan.beats),
    visual_plan_props: textListFromMetadata(visualPlan.props),
    visual_plan_lighting: firstText(visualPlan.lighting),
    visual_plan_risks: textListFromMetadata(visualPlan.risks),
    storyboard_purpose: firstText(storyboardBrief.purpose),
    storyboard_subject: firstText(storyboardBrief.subject),
    storyboard_composition: firstText(storyboardBrief.composition),
    storyboard_action_moment: firstText(storyboardBrief.action_moment),
    storyboard_emotion: firstText(storyboardBrief.emotion),
    storyboard_keyframe_suggestions: textListFromMetadata(storyboardBrief.keyframe_suggestions),
  }
}

export function contentUnitEditDraftEqualsRecord(draft: ContentUnitEditDraft, unit: ContentWorkbenchEditRecord) {
  const original = contentUnitEditDraftFromRecord(unit)
  return Object.keys(original).every((key) => {
    const field = key as keyof ContentUnitEditDraft
    return firstText(original[field]) === firstText(draft[field])
  })
}

export function contentUnitEditPayload(draft: ContentUnitEditDraft): SemanticEntityPayload {
  const duration = Number(draft.duration_sec)
  const visualPlan = {
    space: draft.visual_plan_space.trim(),
    blocking: draft.visual_plan_blocking.trim(),
    camera_path: draft.visual_plan_camera_path.trim(),
    beats: metadataListFromText(draft.visual_plan_beats),
    props: metadataListFromText(draft.visual_plan_props),
    lighting: draft.visual_plan_lighting.trim(),
    risks: metadataListFromText(draft.visual_plan_risks),
  }
  const storyboardBrief = {
    purpose: draft.storyboard_purpose.trim(),
    subject: draft.storyboard_subject.trim(),
    composition: draft.storyboard_composition.trim(),
    action_moment: draft.storyboard_action_moment.trim(),
    emotion: draft.storyboard_emotion.trim(),
    keyframe_suggestions: metadataListFromText(draft.storyboard_keyframe_suggestions),
  }
  return {
    title: firstText(draft.title, '未命名制作项'),
    duration_sec: Number.isFinite(duration) && duration > 0 ? duration : null,
    description: draft.description,
    prompt: draft.prompt,
    shot_size: draft.shot_size,
    camera_angle: draft.camera_angle,
    camera_motion: draft.camera_motion,
    status: firstText(draft.status, 'candidate'),
    metadata_json: JSON.stringify(mergeMetadataJSON(draft.metadata_json, {
      visual_plan: visualPlan,
      storyboard_brief: storyboardBrief,
    })),
  }
}

export function keyframeEditDraftFromRecord(keyframe?: ContentWorkbenchEditRecord | null): KeyframeEditDraft {
  return {
    frame_role: keyframeFrameRoleFromRecord(keyframe),
    title: firstText(keyframe?.title),
    order: keyframe?.order === undefined || keyframe?.order === null ? '' : String(keyframe.order),
    description: firstText(keyframe?.description),
    prompt: firstText(keyframe?.prompt),
    status: firstText(keyframe?.status, 'candidate'),
    metadata_json: firstText(keyframe?.metadata_json),
  }
}

export function keyframeEditDraftEqualsRecord(draft: KeyframeEditDraft, keyframe: ContentWorkbenchEditRecord) {
  const original = keyframeEditDraftFromRecord(keyframe)
  return Object.keys(original).every((key) => {
    const field = key as keyof KeyframeEditDraft
    return firstText(original[field]) === firstText(draft[field])
  })
}

export function keyframeEditPayload(draft: KeyframeEditDraft): SemanticEntityPayload {
  const order = Number(draft.order)
  const role = normalizeKeyframeFrameRole(draft.frame_role, 'middle')
  return {
    title: firstText(draft.title, keyframeFrameRoleLabel(role)),
    order: Number.isFinite(order) && order > 0 ? order : null,
    description: draft.description,
    prompt: draft.prompt,
    status: firstText(draft.status, 'candidate'),
    metadata_json: JSON.stringify(mergeMetadataJSON(draft.metadata_json, {
      frame_role: role,
      frame_role_label: keyframeFrameRoleLabel(role),
    })),
  }
}

export function buildKeyframeGenerationPrompt({
  row,
  unit,
  keyframe,
  sequence,
  visualPlan,
  storyboardBrief,
}: {
  row: ContentWorkbenchKeyframePromptRow
  unit: ContentWorkbenchEditRecord
  keyframe: ContentWorkbenchEditRecord
  sequence: ContentWorkbenchEditRecord[]
  visualPlan?: string
  storyboardBrief?: string
}) {
  const index = Math.max(0, sequence.findIndex((item) => item.ID === keyframe.ID))
  const prev = sequence[index - 1]
  const next = sequence[index + 1]
  return [
    `生成影视关键帧：${recordTitle(keyframe)}。`,
    `所属制作项：${recordTitle(unit)}。${firstText(unit.prompt, unit.description)}`,
    `当前情节：${row.title}。${firstText(row.moment.action_text, row.moment.description, row.moment.location_text, row.moment.time_text)}`,
    `关键帧要求：${firstText(keyframe.prompt, keyframe.description, recordTitle(keyframe))}`,
    visualPlan ? `当前制作项视觉调度：\n${visualPlan}` : '',
    storyboardBrief ? `当前制作项故事板简述：\n${storyboardBrief}` : '',
    prev ? `前一帧连续性：${recordTitle(prev)}，${firstText(prev.prompt, prev.description)}` : '',
    next ? `后一帧连续性：${recordTitle(next)}，${firstText(next.prompt, next.description)}` : '',
    firstText(unit.shot_size, unit.camera_angle, unit.camera_motion) ? `镜头参数：${[unit.shot_size, unit.camera_angle, unit.camera_motion].filter(Boolean).join(' / ')}` : '',
    '保持同一场景、同一人物状态、同一服装和道具连续性；只输出单张画面，不要字幕、水印或拼贴。',
  ].filter(Boolean).join('\n')
}

export function latestKeyframeGenerationJob(jobs: Job[], keyframe: ContentWorkbenchEditRecord) {
  return jobs
    .filter((job) => jobReferencesKeyframe(job, keyframe.ID))
    .slice()
    .sort((a, b) => Date.parse(b.UpdatedAt ?? b.CreatedAt ?? '') - Date.parse(a.UpdatedAt ?? a.CreatedAt ?? ''))[0] ?? null
}

export function keyframeOutputResourceId(keyframe: ContentWorkbenchEditRecord, jobs: Job[]) {
  const direct = numberOf(keyframe.resource_id)
  if (direct > 0) return direct
  const latest = latestKeyframeGenerationJob(jobs, keyframe)
  if (!latest || latest.status !== 'succeeded') return 0
  const output = numberOf(latest.output_resource_id)
  if (output > 0) return output
  const outputs = Array.isArray(latest.output_resource_ids) ? latest.output_resource_ids : []
  return numberOf(outputs[0])
}

export function keyframeHasOutput(keyframe: ContentWorkbenchEditRecord, jobs: Job[]) {
  return keyframeOutputResourceId(keyframe, jobs) > 0
}

export function keyframeHasRunningJob(keyframe: ContentWorkbenchEditRecord, jobs: Job[]) {
  return jobs.some((job) => jobReferencesKeyframe(job, keyframe.ID) && (job.status === 'pending' || job.status === 'running'))
}

export function keyframeGenerationStatusLabel(keyframe: ContentWorkbenchEditRecord, jobs: Job[]) {
  const latest = latestKeyframeGenerationJob(jobs, keyframe)
  const output = keyframeOutputResourceId(keyframe, jobs)
  if (output > 0) return `已有生成结果 #${output}`
  if (!latest) return '还没有生成任务'
  if (latest.status === 'pending' || latest.status === 'running') return `任务 #${latest.ID} ${latest.status === 'pending' ? '排队中' : '生成中'}`
  if (latest.status === 'failed') return `任务 #${latest.ID} 失败：${firstText(latest.error_msg, '可重新生成')}`
  if (latest.status === 'cancelled') return `任务 #${latest.ID} 已取消`
  return `任务 #${latest.ID} ${latest.status}`
}

function normalizeNullableKeyframeFrameRole(value: unknown): KeyframeFrameRole | null {
  return value === 'first' || value === 'middle' || value === 'last' ? value : null
}

function jobReferencesKeyframe(job: Job, keyframeId: number) {
  return [job.extra_params, job.request_context].some((value) => jsonRecordReferencesKeyframe(parseJsonRecord(value), keyframeId))
}

function jsonRecordReferencesKeyframe(value: unknown, keyframeId: number): boolean {
  if (Array.isArray(value)) return value.some((item) => jsonRecordReferencesKeyframe(item, keyframeId))
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (numberOf(record.keyframeId ?? record.keyframe_id ?? record.targetKeyframeId ?? record.target_keyframe_id) === keyframeId) return true
  return Object.values(record).some((item) => jsonRecordReferencesKeyframe(item, keyframeId))
}

function parseJsonRecord(value: unknown) {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function recordTitle(record?: ContentWorkbenchEditRecord | null) {
  return firstText(record?.title, record?.name, record?.kind ? `${record.kind} #${record.ID}` : `记录 #${record?.ID ?? '-'}`)
}

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function numberOf(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}
