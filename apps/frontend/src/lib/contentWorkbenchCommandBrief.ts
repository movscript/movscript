import type { ContentWorkbenchReadinessSummary } from './contentWorkbenchReadiness'

export type ContentWorkbenchCommandBriefKey = 'focus' | 'blocker'

export interface ContentWorkbenchCommandBriefInput {
  selectedMomentTitle?: string
  selectedUnitTitle?: string
  selectedUnitDetail?: string
  readiness: ContentWorkbenchReadinessSummary
}

export interface ContentWorkbenchCommandBriefRow {
  key: ContentWorkbenchCommandBriefKey
  label: string
  value: string
  detail: string
  tone: 'default' | 'warning'
}

export function buildContentWorkbenchCommandBrief(input: ContentWorkbenchCommandBriefInput): ContentWorkbenchCommandBriefRow[] {
  return [
    {
      key: 'focus',
      label: '当前焦点',
      value: firstText(input.selectedUnitTitle, input.selectedMomentTitle ? '待选择制作项' : '', '待选择情节'),
      detail: firstText(input.selectedUnitDetail, input.selectedMomentTitle, '先选择情节入口'),
      tone: input.selectedUnitTitle ? 'default' : 'warning',
    },
    {
      key: 'blocker',
      label: '主要阻塞',
      value: input.readiness.tone === 'ready' ? '生成准备完成' : firstText(input.readiness.primaryBlocker, input.readiness.title),
      detail: input.readiness.detail,
      tone: input.readiness.tone === 'ready' ? 'default' : 'warning',
    },
  ]
}

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}
