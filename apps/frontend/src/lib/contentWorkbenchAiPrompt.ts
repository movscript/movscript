export interface ContentWorkbenchAiPromptUnit {
  id?: number
  unit_code?: string
  title?: string
  kind?: string
  status?: string
  prompt?: string
  description?: string
  visualPlan?: string
  storyboardBrief?: string
}

export interface ContentWorkbenchAiPromptInput {
  momentTitle: string
  sceneMomentId?: number
  momentScope?: string
  existingUnits?: ContentWorkbenchAiPromptUnit[]
}

export function buildContentWorkbenchAiSuggestPrompt(input: ContentWorkbenchAiPromptInput): string {
  const units = input.existingUnits ?? []
  const sceneMomentId = typeof input.sceneMomentId === 'number' && Number.isFinite(input.sceneMomentId) && input.sceneMomentId > 0
    ? String(input.sceneMomentId)
    : '当前情节 ID'
  const unitLines = units.length > 0
    ? units.slice(0, 8).map((unit, index) => {
      const title = firstText(unit.title, `制作项 ${index + 1}`)
      const code = firstText(unit.unit_code)
      const kind = firstText(unit.kind, 'shot')
      const status = firstText(unit.status, 'unknown')
      const detail = firstText(unit.prompt, unit.description, '暂无描述')
      return `${index + 1}. ${[code, title, kind, status, detail].filter(Boolean).join(' / ')}`
    }).join('\n')
    : '当前情节还没有制作项。'

  return [
    '请基于当前情节生成 content_unit_proposal snapshot 草案。',
    '',
    `当前情节：${input.momentTitle}`,
    input.sceneMomentId ? `情节 ID：${input.sceneMomentId}` : null,
    input.momentScope ? `情节上下文：${input.momentScope}` : null,
    '',
    '已有制作项：',
    unitLines,
    '',
    '输出要求：',
    '- 输出 3-6 条完整制作项快照。',
    '- 草案 kind 必须是 content_unit_proposal，schema 必须是 movscript.content_unit_proposal.v1。',
    `- 使用 JSON 包络：{"scene_moment_id": ${sceneMomentId}, "proposal": {"units": [...]}}。`,
    '- 每条包含 title、kind、description、prompt、duration_sec、story_purpose、emotional_intent、shot、performance、lighting、blocking、sound、transition 等可判断字段。',
    '- 如果已有制作项带 unit_code，保留原 unit_code；新增制作项不要自己编 unit_code，留给后端自动分配。',
    '- 如果需要表达节奏或局部落位，只能写进单条 unit.timing，例如 local_start_sec、rhythm_role、transition_in、transition_out；不要在 content_unit_proposal 里创建 production 级 preview_timeline 或 timeline_items。',
    '- 不要输出 action、operation、patch 等操作字段或增量指令。',
    '- 审阅时会用完整草案快照和当前快照做对比；请让每条制作项都能独立判断创作目标和生成约束。',
  ].filter(Boolean).join('\n')
}

export interface ContentWorkbenchVisualPlanPromptInput extends ContentWorkbenchAiPromptInput {
  selectedUnitId?: number
  selectedUnitTitle?: string
}

export function buildContentWorkbenchVisualPlanPrompt(input: ContentWorkbenchVisualPlanPromptInput): string {
  const units = input.existingUnits ?? []
  const sceneMomentId = typeof input.sceneMomentId === 'number' && Number.isFinite(input.sceneMomentId) && input.sceneMomentId > 0
    ? String(input.sceneMomentId)
    : '当前情节 ID'
  const selectedTitle = firstText(input.selectedUnitTitle, units.find((unit) => unit.id === input.selectedUnitId)?.title, '当前制作项')
  const unitLines = units.length > 0
    ? units.slice(0, 12).map((unit, index) => {
      const title = firstText(unit.title, `制作项 ${index + 1}`)
      const code = firstText(unit.unit_code)
      const selected = unit.id === input.selectedUnitId || title === selectedTitle
      const base = [code, title, firstText(unit.kind, 'shot'), firstText(unit.status, 'unknown'), firstText(unit.prompt, unit.description, '暂无描述')].filter(Boolean).join(' / ')
      const visualPlan = firstText(unit.visualPlan) ? `视觉调度：${unit.visualPlan}` : ''
      const storyboardBrief = firstText(unit.storyboardBrief) ? `故事板简述：${unit.storyboardBrief}` : ''
      return `${index + 1}. ${selected ? '[SELECTED] ' : ''}${[base, visualPlan, storyboardBrief].filter(Boolean).join(' / ')}`
    }).join('\n')
    : '当前情节还没有制作项。'

  return [
    '请基于当前情节和当前制作项生成 visual plan / storyboard brief 草案。',
    '',
    `当前情节：${input.momentTitle}`,
    input.sceneMomentId ? `情节 ID：${input.sceneMomentId}` : null,
    input.momentScope ? `情节上下文：${input.momentScope}` : null,
    `当前制作项：${selectedTitle}`,
    '',
    '已有制作项快照：',
    unitLines,
    '',
    '输出要求：',
    '- 仍然输出 content_unit_proposal snapshot 草案，schema 必须是 movscript.content_unit_proposal.v1。',
    `- 使用 JSON 包络：{"scene_moment_id": ${sceneMomentId}, "proposal": {"units": [...]}}。`,
    '- proposal.units 必须包含当前情节的完整制作项快照，不要只输出 selected unit，避免审阅时误判删除其他制作项。',
    '- 只强化当前选中的制作项；其他制作项应保持现有 title、kind、description、prompt、duration_sec 和镜头参数。',
    '- 在当前制作项内写入 visual_plan 和 storyboard_brief 字段。',
    '- visual_plan 包含 space、blocking、camera_path、beats、props、lighting、risks。',
    '- storyboard_brief 包含 purpose、subject、composition、action_moment、emotion、keyframe_suggestions。',
    '- beats、props、risks、keyframe_suggestions 使用字符串数组；其他字段使用具体中文短段落。',
    '- 不要创建真实媒体、关键帧资源、asset candidate 或 generation job。',
    '- 不要输出 action、operation、patch 等操作字段或增量指令。',
  ].filter(Boolean).join('\n')
}

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}
