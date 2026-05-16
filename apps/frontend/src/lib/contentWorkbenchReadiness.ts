export type ContentWorkbenchReadinessTone = 'blocked' | 'warning' | 'ready'

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
  tone: ContentWorkbenchReadinessTone
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
      tone: 'blocked',
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
      tone: 'ready',
      title: '生成准备完成',
      detail: `${passed}/${total} 项检查已通过，可以进入生成计划。`,
    }
  }

  const tone: ContentWorkbenchReadinessTone = percent >= 60 ? 'warning' : 'blocked'
  return {
    total,
    passed,
    blocked,
    percent,
    tone,
    title: tone === 'warning' ? '接近可生成' : '生成仍被阻塞',
    detail: `${blocked} 项检查未通过，优先处理：${firstBlocker?.label ?? '未命名阻塞项'}。`,
    primaryBlocker: firstBlocker ? `${firstBlocker.label}：${firstBlocker.detail}` : undefined,
  }
}
