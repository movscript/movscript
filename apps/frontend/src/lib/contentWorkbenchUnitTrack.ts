export type ContentWorkbenchUnitTrackTone = 'blocked' | 'review' | 'ready' | 'running'

export interface ContentWorkbenchUnitTrackInput {
  id: string | number
  title: string
  kind?: string
  durationSec?: number
  status?: string
  hasPrompt: boolean
  assetSlotCount: number
  missingSlotCount: number
  keyframeCount: number
  selected?: boolean
}

export interface ContentWorkbenchUnitTrackItem {
  id: string
  title: string
  kind: string
  durationSec: number
  readiness: number
  tone: ContentWorkbenchUnitTrackTone
  selected: boolean
  labels: string[]
  blockers: string[]
}

export interface ContentWorkbenchUnitTrackSummary {
  total: number
  durationSec: number
  readyCount: number
  blockedCount: number
  needsPromptCount: number
  missingAssetCount: number
  keyframeCount: number
  selectedId?: string
  title: string
  detail: string
  items: ContentWorkbenchUnitTrackItem[]
}

export function buildContentWorkbenchUnitTrack(inputs: ContentWorkbenchUnitTrackInput[]): ContentWorkbenchUnitTrackSummary {
  const items = inputs.map(buildTrackItem)
  const total = items.length
  const durationSec = items.reduce((sum, item) => sum + item.durationSec, 0)
  const readyCount = items.filter((item) => item.tone === 'ready').length
  const blockedCount = items.filter((item) => item.tone === 'blocked').length
  const needsPromptCount = items.filter((item) => item.blockers.some((blocker) => blocker === '缺提示')).length
  const missingAssetCount = inputs.reduce((sum, item) => sum + Math.max(0, Number(item.missingSlotCount) || 0), 0)
  const keyframeCount = inputs.reduce((sum, item) => sum + Math.max(0, Number(item.keyframeCount) || 0), 0)
  const selectedId = items.find((item) => item.selected)?.id

  if (total === 0) {
    return {
      total,
      durationSec,
      readyCount,
      blockedCount,
      needsPromptCount,
      missingAssetCount,
      keyframeCount,
      selectedId,
      title: '暂无制作项轨道',
      detail: '先创建或让 AI 规划制作项，轨道会显示每个生成目标的准备度。',
      items,
    }
  }

  if (blockedCount > 0) {
    return {
      total,
      durationSec,
      readyCount,
      blockedCount,
      needsPromptCount,
      missingAssetCount,
      keyframeCount,
      selectedId,
      title: '制作轨道存在阻塞',
      detail: `${blockedCount} 个制作项仍被提示、素材或画面锚点阻塞。`,
      items,
    }
  }

  if (readyCount === total) {
    return {
      total,
      durationSec,
      readyCount,
      blockedCount,
      needsPromptCount,
      missingAssetCount,
      keyframeCount,
      selectedId,
      title: '制作轨道可执行',
      detail: `${total} 个制作项都具备生成前基础输入。`,
      items,
    }
  }

  return {
    total,
    durationSec,
    readyCount,
    blockedCount,
    needsPromptCount,
    missingAssetCount,
    keyframeCount,
    selectedId,
    title: '制作轨道待确认',
    detail: `${total - readyCount} 个制作项还需要人工确认或补充信息。`,
    items,
  }
}

function buildTrackItem(input: ContentWorkbenchUnitTrackInput): ContentWorkbenchUnitTrackItem {
  const durationSec = Math.max(0, Number(input.durationSec) || 0)
  const missingSlotCount = Math.max(0, Number(input.missingSlotCount) || 0)
  const keyframeCount = Math.max(0, Number(input.keyframeCount) || 0)
  const status = String(input.status ?? '').trim().toLowerCase()
  const blockers = [
    input.hasPrompt ? '' : '缺提示',
    missingSlotCount > 0 ? '缺素材' : '',
    keyframeCount > 0 ? '' : '缺关键帧',
  ].filter(Boolean)
  const tone: ContentWorkbenchUnitTrackTone = missingSlotCount > 0 || !input.hasPrompt || keyframeCount === 0
    ? 'blocked'
    : status === 'in_production'
      ? 'running'
      : status === 'confirmed' || status === 'locked'
        ? 'ready'
        : 'review'

  return {
    id: String(input.id),
    title: input.title,
    kind: input.kind || '制作项',
    durationSec,
    readiness: unitReadiness(input.hasPrompt, missingSlotCount, keyframeCount, status),
    tone,
    selected: Boolean(input.selected),
    labels: [
      durationSec > 0 ? `${Math.round(durationSec)}s` : '未设时长',
      `${Math.max(0, Number(input.assetSlotCount) || 0)} 素材`,
      `${keyframeCount} 帧`,
    ],
    blockers,
  }
}

function unitReadiness(hasPrompt: boolean, missingSlotCount: number, keyframeCount: number, status: string) {
  let score = 20
  if (hasPrompt) score += 25
  if (missingSlotCount === 0) score += 25
  if (keyframeCount > 0) score += 20
  if (status === 'confirmed' || status === 'locked') score += 10
  return Math.max(0, Math.min(100, score))
}
