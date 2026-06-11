export type ContentWorkbenchUnitTrackState = 'blocked' | 'review' | 'ready' | 'running'

export type ContentWorkbenchUnitTrackBlockerKey = 'asset' | 'keyframe' | 'prompt'

export interface ContentWorkbenchUnitTrackInput {
  id: string | number
  title: string
  kind?: string
  durationSec?: number
  startSec?: number
  status?: string
  summary?: string
  identifier?: string
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

export interface CoreContentWorkbenchUnitTrackItem {
  id: string
  order: number
  title: string
  kind: string
  durationSec: number
  startSec: number
  endSec: number
  timeSource: 'preview' | 'estimated'
  readiness: number
  state: ContentWorkbenchUnitTrackState
  selected: boolean
  summary: string
  identifier: string
  sceneMomentTitle: string
  segmentTitle: string
  scriptCue: string
  soundCue: string
  keyframeTitles: string[]
  missingAssetTitles: string[]
  requiresKeyframe: boolean
  assetSlotCount: number
  missingSlotCount: number
  keyframeCount: number
  blockerKeys: ContentWorkbenchUnitTrackBlockerKey[]
}

export interface CoreContentWorkbenchUnitTrackSummary {
  total: number
  durationSec: number
  readyCount: number
  blockedCount: number
  needsPromptCount: number
  missingAssetCount: number
  keyframeCount: number
  selectedId?: string
  items: CoreContentWorkbenchUnitTrackItem[]
}

export function buildContentWorkbenchUnitTrackState(
  inputs: ContentWorkbenchUnitTrackInput[],
): CoreContentWorkbenchUnitTrackSummary {
  let cursorSec = 0
  const items = inputs.map((input, index) => {
    const item = buildTrackItem(input, index + 1, cursorSec)
    cursorSec = item.endSec
    return item
  })
  const total = items.length
  const durationSec = items.reduce((max, item) => Math.max(max, item.endSec), 0)
  const readyCount = items.filter((item) => item.state === 'ready').length
  const blockedCount = items.filter((item) => item.state === 'blocked').length
  const needsPromptCount = items.filter((item) => item.blockerKeys.includes('prompt')).length
  const missingAssetCount = items.reduce((sum, item) => sum + item.missingSlotCount, 0)
  const keyframeCount = items.reduce((sum, item) => sum + item.keyframeCount, 0)
  const selectedId = items.find((item) => item.selected)?.id

  return {
    total,
    durationSec,
    readyCount,
    blockedCount,
    needsPromptCount,
    missingAssetCount,
    keyframeCount,
    selectedId,
    items,
  }
}

function buildTrackItem(
  input: ContentWorkbenchUnitTrackInput,
  order: number,
  fallbackStartSec: number,
): CoreContentWorkbenchUnitTrackItem {
  const kind = firstText(input.kind)
  const durationSec = Math.max(0, Number(input.durationSec) || 0)
  const explicitStartSec = Number(input.startSec)
  const hasExplicitStartSec = Number.isFinite(explicitStartSec) && explicitStartSec >= 0
  const startSec = hasExplicitStartSec ? explicitStartSec : fallbackStartSec
  const assetSlotCount = Math.max(0, Number(input.assetSlotCount) || 0)
  const missingSlotCount = Math.max(0, Number(input.missingSlotCount) || 0)
  const keyframeCount = Math.max(0, Number(input.keyframeCount) || 0)
  const status = firstText(input.status).toLowerCase()
  const requiresKeyframe = input.requiresKeyframe ?? contentWorkbenchUnitRequiresKeyframe(kind)
  const blockerKeys = unitBlockerKeys(input.hasPrompt, missingSlotCount, keyframeCount, requiresKeyframe)
  const state = unitTrackState(blockerKeys, status)

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
    state,
    selected: Boolean(input.selected),
    summary: firstText(input.summary),
    identifier: firstText(input.identifier),
    sceneMomentTitle: firstText(input.sceneMomentTitle),
    segmentTitle: firstText(input.segmentTitle),
    scriptCue: firstText(input.scriptCue),
    soundCue: firstText(input.soundCue),
    keyframeTitles: normalizeTextList(input.keyframeTitles),
    missingAssetTitles: normalizeTextList(input.missingAssetTitles),
    requiresKeyframe,
    assetSlotCount,
    missingSlotCount,
    keyframeCount,
    blockerKeys,
  }
}

function unitBlockerKeys(
  hasPrompt: boolean,
  missingSlotCount: number,
  keyframeCount: number,
  requiresKeyframe: boolean,
): ContentWorkbenchUnitTrackBlockerKey[] {
  return [
    hasPrompt ? undefined : 'prompt',
    missingSlotCount > 0 ? 'asset' : undefined,
    requiresKeyframe && keyframeCount === 0 ? 'keyframe' : undefined,
  ].filter((key): key is ContentWorkbenchUnitTrackBlockerKey => Boolean(key))
}

function unitTrackState(
  blockerKeys: ContentWorkbenchUnitTrackBlockerKey[],
  status: string,
): ContentWorkbenchUnitTrackState {
  if (blockerKeys.length > 0) return 'blocked'
  if (status === 'in_production') return 'running'
  if (status === 'confirmed' || status === 'locked') return 'ready'
  return 'review'
}

function normalizeTextList(values?: string[]) {
  return (values ?? [])
    .map((value) => firstText(value))
    .filter(Boolean)
}

function firstText(value?: string) {
  return String(value ?? '').trim()
}

export function contentWorkbenchUnitRequiresKeyframe(kind?: string) {
  return kind === 'shot'
}

function unitReadiness(
  hasPrompt: boolean,
  missingSlotCount: number,
  keyframeCount: number,
  requiresKeyframe: boolean,
  status: string,
) {
  let score = 20
  if (hasPrompt) score += 25
  if (missingSlotCount === 0) score += 25
  if (!requiresKeyframe || keyframeCount > 0) score += 20
  if (status === 'confirmed' || status === 'locked') score += 10
  return Math.max(0, Math.min(100, score))
}
