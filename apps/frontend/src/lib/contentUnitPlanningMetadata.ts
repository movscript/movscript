export interface ContentUnitPlanningRecord {
  ID?: number
  kind?: unknown
  title?: unknown
  name?: unknown
  label?: unknown
  description?: unknown
  prompt?: unknown
  metadata_json?: unknown
}

export function parseMetadataJSON(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function mergeMetadataJSON(value: unknown, patch: Record<string, unknown>) {
  if (typeof value !== 'string' || !value.trim()) return patch
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...parsed as Record<string, unknown>, ...patch }
      : patch
  } catch {
    return patch
  }
}

export function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function textListFromMetadata(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => firstText(item)).filter(Boolean).join('\n')
  return firstText(value)
}

export function metadataListFromText(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function hasStructuredText(...values: string[]) {
  return values.some((value) => Boolean(value.trim()))
}

export function contentUnitVisualPlanPromptText(unit: ContentUnitPlanningRecord) {
  const visualPlan = metadataObject(parseMetadataJSON(unit.metadata_json).visual_plan)
  return [
    firstText(visualPlan.space) ? `空间关系：${firstText(visualPlan.space)}` : '',
    firstText(visualPlan.blocking) ? `人物走位：${firstText(visualPlan.blocking)}` : '',
    firstText(visualPlan.camera_path) ? `摄影机路径：${firstText(visualPlan.camera_path)}` : '',
    textListFromMetadata(visualPlan.beats) ? `停点/节奏：${textListFromMetadata(visualPlan.beats).replace(/\n/g, '；')}` : '',
    textListFromMetadata(visualPlan.props) ? `道具位置：${textListFromMetadata(visualPlan.props).replace(/\n/g, '；')}` : '',
    firstText(visualPlan.lighting) ? `光线意图：${firstText(visualPlan.lighting)}` : '',
    textListFromMetadata(visualPlan.risks) ? `风险备注：${textListFromMetadata(visualPlan.risks).replace(/\n/g, '；')}` : '',
  ].filter(Boolean).join('\n')
}

export function contentUnitStoryboardBriefPromptText(unit: ContentUnitPlanningRecord) {
  const storyboardBrief = metadataObject(parseMetadataJSON(unit.metadata_json).storyboard_brief)
  return [
    firstText(storyboardBrief.purpose) ? `画面目的：${firstText(storyboardBrief.purpose)}` : '',
    firstText(storyboardBrief.subject) ? `主体：${firstText(storyboardBrief.subject)}` : '',
    firstText(storyboardBrief.composition) ? `构图：${firstText(storyboardBrief.composition)}` : '',
    firstText(storyboardBrief.action_moment) ? `动作瞬间：${firstText(storyboardBrief.action_moment)}` : '',
    firstText(storyboardBrief.emotion) ? `情绪状态：${firstText(storyboardBrief.emotion)}` : '',
    textListFromMetadata(storyboardBrief.keyframe_suggestions) ? `建议关键帧：${textListFromMetadata(storyboardBrief.keyframe_suggestions).replace(/\n/g, '；')}` : '',
  ].filter(Boolean).join('\n')
}

export function contentUnitGenerationCanvasDescription(unit: ContentUnitPlanningRecord) {
  const visualPlan = contentUnitVisualPlanPromptText(unit)
  const storyboardBrief = contentUnitStoryboardBriefPromptText(unit)
  return [
    `内容单元：${contentUnitPlanningTitle(unit)}`,
    firstText(unit.description, unit.prompt) ? `生成目标：${firstText(unit.description, unit.prompt)}` : '',
    visualPlan ? `视觉调度：\n${visualPlan}` : '',
    storyboardBrief ? `故事板简述：\n${storyboardBrief}` : '',
  ].filter(Boolean).join('\n\n')
}

function contentUnitPlanningTitle(unit: ContentUnitPlanningRecord) {
  return firstText(unit.title, unit.name, unit.label, `${unit.kind || '记录'} #${unit.ID ?? ''}`)
}

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}
