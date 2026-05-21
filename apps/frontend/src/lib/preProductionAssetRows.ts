import type { SemanticEntityRecord } from '@/api/semanticEntities'
import type { RawResource } from '@/types'

export type SlotStatus = 'missing' | 'candidate' | 'locked' | 'waived'
export type AssetKind = 'all' | 'image' | 'video' | 'audio' | 'text' | 'brand_pack' | 'reference' | 'other'

export type AssetSlotRecord = SemanticEntityRecord & {
  owner_type?: string
  owner_id?: number
  production_id?: number
  creative_reference_id?: number
  creative_reference_state_id?: number
  kind?: string
  name?: string
  description?: string
  slot_key?: string
  prompt_hint?: string
  priority?: string
  status?: string
  resource_id?: number
  resource?: RawResource
  locked_asset_slot_id?: number
  locked_asset_slot?: AssetSlotRecord
}

export type AssetSlotCandidateRecord = SemanticEntityRecord & {
  asset_slot_id?: number
  candidate_asset_slot_id?: number
  candidate_asset_slot?: AssetSlotRecord
  source_type?: string
  source_id?: number
  score?: number
  status?: string
  note?: string
}

export type CreativeReferenceRecord = SemanticEntityRecord & {
  kind?: string
  name?: string
  alias?: string
  description?: string
  content?: string
  importance?: string
  status?: string
}

export interface AssetSlotViewModel {
  slot: AssetSlotRecord
  candidates: AssetSlotCandidateRecord[]
  lockedSlot?: AssetSlotRecord
  searchText: string
  kind: Exclude<AssetKind, 'all'>
  hasResource: boolean
}

export interface ReferenceAssetCluster {
  reference: CreativeReferenceRecord | null
  rows: AssetSlotViewModel[]
  missing: number
  candidate: number
  locked: number
  searchText: string
}

const assetKindLabels: Record<Exclude<AssetKind, 'all'>, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  text: '文本',
  brand_pack: '品牌包',
  reference: '参考',
  other: '其他',
}

const ownerTypeLabels: Record<string, string> = {
  scene: '分场',
  storyboard: '分镜',
  storyboard_script: '分镜脚本',
  segment: '编排段',
  scene_moment: '场景时刻',
  content_unit: '制作项',
  script: '剧本',
  script_version: '剧本版本',
  keyframe: '画面锚点',
  delivery_version: '交付版本',
  canvas: '画布',
  asset_slot: '素材需求',
}

export function buildPreProductionAssetRows(
  slots: AssetSlotRecord[],
  candidates: AssetSlotCandidateRecord[],
  slotById: Map<number, AssetSlotRecord>,
): AssetSlotViewModel[] {
  return slots.map((slot) => {
    const kind = normalizeAssetKind(slot.kind)
    const slotCandidates = candidates
      .filter((candidate) => candidate.asset_slot_id === slot.ID && candidate.status !== 'rejected')
      .map((candidate) => ({
        ...candidate,
        candidate_asset_slot: candidate.candidate_asset_slot ?? (candidate.candidate_asset_slot_id ? slotById.get(candidate.candidate_asset_slot_id) : undefined),
      }))
    const lockedSlot = slot.locked_asset_slot ?? (slot.locked_asset_slot_id ? slotById.get(slot.locked_asset_slot_id) : undefined)
    const searchText = [
      slot.name,
      assetKindLabel(kind),
      slot.kind,
      slot.status,
      slot.description,
      slot.prompt_hint,
      slotScopeLabel(slot),
      lockedSlot?.name,
    ].filter(Boolean).join(' ').toLowerCase()
    return { slot, candidates: slotCandidates, lockedSlot, searchText, kind, hasResource: Boolean(slot.resource_id || slot.resource) }
  })
}

export function buildAssetCandidatePatchPayload(assetSlotId: number, candidate: AssetSlotCandidateRecord, status: 'selected' | 'rejected') {
  return {
    asset_slot_id: candidate.asset_slot_id ?? assetSlotId,
    candidate_asset_slot_id: candidate.candidate_asset_slot_id ?? 0,
    score: candidate.score ?? 0,
    status,
    ...(candidate.source_type ? { source_type: candidate.source_type } : {}),
    ...(candidate.source_id !== undefined ? { source_id: candidate.source_id } : {}),
    ...(candidate.note ? { note: candidate.note } : {}),
  }
}

export function buildReferenceAssetClusters(references: CreativeReferenceRecord[], rows: AssetSlotViewModel[]): ReferenceAssetCluster[] {
  const clusters = new Map<number, ReferenceAssetCluster>()
  for (const reference of references) {
    clusters.set(reference.ID, {
      reference,
      rows: [],
      missing: 0,
      candidate: 0,
      locked: 0,
      searchText: [reference.name, reference.alias, reference.kind, reference.status, reference.description, reference.content].filter(Boolean).join(' ').toLowerCase(),
    })
  }
  const unbound: ReferenceAssetCluster = {
    reference: null,
    rows: [],
    missing: 0,
    candidate: 0,
    locked: 0,
    searchText: '未绑定 项目素材需求 unbound project assets',
  }
  for (const row of rows) {
    const cluster = row.slot.creative_reference_id ? clusters.get(row.slot.creative_reference_id) ?? unbound : unbound
    cluster.rows.push(row)
    const status = normalizeSlotStatus(row.slot.status)
    if (status === 'missing') cluster.missing += 1
    if (rowHasActiveAssetCandidates(row)) cluster.candidate += 1
    if (status === 'locked') cluster.locked += 1
    cluster.searchText = `${cluster.searchText} ${row.searchText}`
  }
  const output = [...clusters.values(), ...(unbound.rows.length > 0 ? [unbound] : [])]
  return output
    .filter((cluster) => cluster.rows.length > 0 || cluster.reference)
    .sort((a, b) => b.rows.length - a.rows.length)
}

export function rowHasActiveAssetCandidates(row: AssetSlotViewModel) {
  return row.candidates.some((candidate) => candidate.status !== 'selected')
}

export function assetSlotHasLoadedResource(slot?: AssetSlotRecord) {
  return Boolean(slot?.resource?.ID)
}

export function candidateReferenceResourceIds(row: AssetSlotViewModel) {
  const ids: number[] = []
  const add = (id?: number) => {
    if (id && Number.isFinite(id) && !ids.includes(id)) ids.push(id)
  }
  add(row.lockedSlot?.resource?.ID ?? row.lockedSlot?.resource_id)
  add(row.slot.resource?.ID ?? row.slot.resource_id)
  for (const candidate of row.candidates) {
    add(candidate.candidate_asset_slot?.resource?.ID ?? candidate.candidate_asset_slot?.resource_id)
    if (ids.length >= 3) break
  }
  return ids
}

export function assetKindLabel(kind: Exclude<AssetKind, 'all'>) {
  return assetKindLabels[kind]
}

export function normalizeAssetKind(kind?: string): Exclude<AssetKind, 'all'> {
  const normalized = String(kind ?? '').toLowerCase()
  if (normalized === 'image' || normalized === 'video' || normalized === 'audio' || normalized === 'text' || normalized === 'brand_pack' || normalized === 'reference') {
    return normalized
  }
  return 'other'
}

export function normalizeSlotStatus(status?: string): SlotStatus {
  if (status === 'candidate' || status === 'locked' || status === 'waived') return status
  return 'missing'
}

export function slotScopeLabel(slot: AssetSlotRecord) {
  if (slot.owner_type && slot.owner_id) {
    const label = ownerTypeLabels[slot.owner_type] ?? slot.owner_type
    return `${label} #${slot.owner_id}`
  }
  if (slot.creative_reference_id) return `设定资料 #${slot.creative_reference_id}`
  if (slot.resource_id) return `资源 #${slot.resource_id}`
  return '项目素材需求'
}
