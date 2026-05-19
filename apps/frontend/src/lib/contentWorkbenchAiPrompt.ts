export interface ContentWorkbenchAiPromptUnit {
  title?: string
  kind?: string
  status?: string
  prompt?: string
  description?: string
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
      const kind = firstText(unit.kind, 'shot')
      const status = firstText(unit.status, 'unknown')
      const detail = firstText(unit.prompt, unit.description, '暂无描述')
      return `${index + 1}. ${title} / ${kind} / ${status} / ${detail}`
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
    '- 如果需要表达节奏或局部落位，只能写进单条 unit.timing，例如 local_start_sec、rhythm_role、transition_in、transition_out；不要在 content_unit_proposal 里创建 production 级 preview_timeline 或 timeline_items。',
    '- 不要输出 action、operation、patch 等操作字段或增量指令。',
    '- 审阅时会用完整草案快照和当前快照做对比；请让每条制作项都能独立判断创作目标和生成约束。',
  ].filter(Boolean).join('\n')
}

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}
