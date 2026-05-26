export type ContentWorkbenchReadinessState = 'uninitialized' | 'blocked' | 'almost_ready' | 'ready'

export interface ContentWorkbenchGateLike {
  label: string
  detail: string
  done: boolean
}

export interface ContentWorkbenchReadinessSummary {
  total: number
  passed: number
  blocked: number
  percent: number
  state: ContentWorkbenchReadinessState
  title: string
  detail: string
  primaryBlocker?: string
}

export function buildContentWorkbenchReadinessSummary(gates: ContentWorkbenchGateLike[]): ContentWorkbenchReadinessSummary {
  const total = gates.length
  const passed = gates.filter((gate) => gate.done).length
  const blocked = Math.max(0, total - passed)
  const percent = total > 0 ? Math.round((passed / total) * 100) : 0
  const firstBlocker = gates.find((gate) => !gate.done)

  if (total === 0) {
    return {
      total,
      passed,
      blocked,
      percent,
      state: 'uninitialized',
      title: '尚未建立生成检查',
      detail: '选择制作项后，系统会检查提示、剧本来源、设定引用、素材和画面锚点。',
    }
  }

  if (blocked === 0) {
    return {
      total,
      passed,
      blocked,
      percent,
      state: 'ready',
      title: '生成准备完成',
      detail: `${passed}/${total} 项检查已通过，可以进入生成计划。`,
    }
  }

  const state: ContentWorkbenchReadinessState = percent >= 60 ? 'almost_ready' : 'blocked'
  return {
    total,
    passed,
    blocked,
    percent,
    state,
    title: state === 'almost_ready' ? '接近可生成' : '下一步：补齐生成条件',
    detail: `${blocked} 项检查未通过，优先处理：${firstBlocker?.label ?? '未命名检查项'}。`,
    primaryBlocker: firstBlocker ? `${firstBlocker.label}：${firstBlocker.detail}` : undefined,
  }
}
