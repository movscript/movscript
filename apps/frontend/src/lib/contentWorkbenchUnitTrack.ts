export type ContentWorkbenchUnitTrackTone = 'blocked' | 'review' | 'ready' | 'running'

export interface ContentWorkbenchUnitTrackInput {
  id: string | number
  title: string
  kind?: string
  durationSec?: number
  startSec?: number
  status?: string
  summary?: string
  sceneMomentTitle?: string
  segmentTitle?: string
  scriptCue?: string
  soundCue?: string
  keyframeTitles?: string[]
  missingAssetTitles?: string[]
  requiresKeyframe?: boolean
  timeSource?: 'preview' | 'estimated'
  hasPrompt: boolean
  assetSlotCount: number
  missingSlotCount: number
  keyframeCount: number
  selected?: boolean
}

export interface ContentWorkbenchUnitTrackItem {
  id: string
  order: number
  title: string
  kind: string
  durationSec: number
  startSec: number
  endSec: number
  timeSource: 'preview' | 'estimated'
  readiness: number
  tone: ContentWorkbenchUnitTrackTone
  selected: boolean
  summary: string
  sceneMomentTitle: string
  segmentTitle: string
  scriptCue: string
  soundCue: string
  keyframeTitles: string[]
  missingAssetTitles: string[]
  requiresKeyframe: boolean
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
  let cursorSec = 0
  const items = inputs.map((input, index) => {
    const item = buildTrackItem(input, index + 1, cursorSec)
    cursorSec = item.endSec
    return item
  })
  const total = items.length
  const durationSec = items.reduce((max, item) => Math.max(max, item.endSec), 0)
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
      title: '暂无内容单元',
      detail: '先创建或让 AI 规划内容单元，这里会显示每个生成目标。',
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
      title: '内容单元',
      detail: `${total} 个内容单元按当前情节顺序排列。`,
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
    title: '内容单元',
    detail: `${total} 个内容单元按当前情节顺序排列。`,
    items,
  }
}

function buildTrackItem(input: ContentWorkbenchUnitTrackInput, order: number, fallbackStartSec: number): ContentWorkbenchUnitTrackItem {
  const kind = input.kind || '制作项'
  const durationSec = Math.max(0, Number(input.durationSec) || 0)
  const explicitStartSec = Number(input.startSec)
  const hasExplicitStartSec = Number.isFinite(explicitStartSec) && explicitStartSec >= 0
  const startSec = hasExplicitStartSec ? explicitStartSec : fallbackStartSec
  const missingSlotCount = Math.max(0, Number(input.missingSlotCount) || 0)
  const keyframeCount = Math.max(0, Number(input.keyframeCount) || 0)
  const status = String(input.status ?? '').trim().toLowerCase()
  const summary = String(input.summary ?? '').trim()
  const requiresKeyframe = input.requiresKeyframe ?? contentWorkbenchUnitRequiresKeyframe(kind)
  const blockers = [
    input.hasPrompt ? '' : '缺提示',
    missingSlotCount > 0 ? '缺素材' : '',
    requiresKeyframe && keyframeCount === 0 ? '缺关键帧' : '',
  ].filter(Boolean)
  const tone: ContentWorkbenchUnitTrackTone = missingSlotCount > 0 || !input.hasPrompt || (requiresKeyframe && keyframeCount === 0)
    ? 'blocked'
    : status === 'in_production'
      ? 'running'
      : status === 'confirmed' || status === 'locked'
        ? 'ready'
        : 'review'

  return {
    id: String(input.id),
    order,
    title: input.title,
    kind,
    durationSec,
    startSec,
    endSec: startSec + durationSec,
    timeSource: input.timeSource ?? (hasExplicitStartSec ? 'preview' : 'estimated'),
    readiness: unitReadiness(input.hasPrompt, missingSlotCount, keyframeCount, requiresKeyframe, status),
    tone,
    selected: Boolean(input.selected),
    summary,
    sceneMomentTitle: String(input.sceneMomentTitle ?? '').trim(),
    segmentTitle: String(input.segmentTitle ?? '').trim(),
    scriptCue: String(input.scriptCue ?? '').trim(),
    soundCue: String(input.soundCue ?? '').trim(),
    keyframeTitles: normalizeLabels(input.keyframeTitles),
    missingAssetTitles: normalizeLabels(input.missingAssetTitles),
    requiresKeyframe,
    labels: [
      durationSec > 0 ? `${Math.round(durationSec)}s` : '未设时长',
      `${Math.max(0, Number(input.assetSlotCount) || 0)} 素材`,
      requiresKeyframe ? `${keyframeCount} 帧` : '无需关键帧',
    ],
    blockers,
  }
}

function normalizeLabels(values?: string[]) {
  return (values ?? [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
}

export function contentWorkbenchUnitRequiresKeyframe(kind?: string) {
  return kind === 'shot'
}

function unitReadiness(hasPrompt: boolean, missingSlotCount: number, keyframeCount: number, requiresKeyframe: boolean, status: string) {
  let score = 20
  if (hasPrompt) score += 25
  if (missingSlotCount === 0) score += 25
  if (!requiresKeyframe || keyframeCount > 0) score += 20
  if (status === 'confirmed' || status === 'locked') score += 10
  return Math.max(0, Math.min(100, score))
}
