import type { SemanticEntityPayload } from '@/api/semanticEntities'
import { assetKindLabel, type AssetKind, type AssetSlotRecord, type AssetSlotViewModel } from '@/lib/preProductionAssetRows'
import type { RawResource } from '@/types'

export type PreProductionCandidateGenerationKind = 'image' | 'video'
export type PreProductionResourceTypeFilter = 'all' | RawResource['type']

export interface PreProductionAssetSlotCreateInput {
  kindFilter: AssetKind
  selectedId?: number | null
  selectedReferenceId?: number | null
  slots: AssetSlotRecord[]
}

export interface PreProductionResourcePageInput {
  data?: { total?: number; items?: RawResource[] } | RawResource[]
  pageSize?: number
}

export interface PreProductionResourceLibraryState {
  open: boolean
  search: string
  type: PreProductionResourceTypeFilter
  page: number
  selectedResource: RawResource | null
}

export const initialPreProductionResourceLibraryState: PreProductionResourceLibraryState = {
  open: false,
  search: '',
  type: 'all',
  page: 1,
  selectedResource: null,
}

export function buildPreProductionAssetSlotCreatePayload({
  kindFilter,
  selectedId,
  selectedReferenceId,
  slots,
}: PreProductionAssetSlotCreateInput): SemanticEntityPayload {
  const kind = kindFilter === 'all' ? 'image' : kindFilter
  const selectedSlotRecord = selectedId ? slots.find((slot) => slot.ID === selectedId) : undefined
  const referenceId = selectedReferenceId ?? selectedSlotRecord?.creative_reference_id
  return {
    kind,
    name: `未命名${assetKindLabel(kind)}素材`,
    status: 'missing',
    priority: 'normal',
    ...(referenceId ? { creative_reference_id: referenceId, owner_type: 'creative_reference', owner_id: referenceId } : {}),
  }
}

export function buildPreProductionLibraryCandidatePayload(row: AssetSlotViewModel, resource: RawResource): SemanticEntityPayload {
  return {
    asset_slot_id: row.slot.ID,
    resource_id: resource.ID,
    source_type: 'manual',
    source_id: resource.ID,
    score: 0.7,
    status: 'candidate',
    note: `从资源库选择：${resource.name}`,
  }
}

export function buildPreProductionUploadCandidatePayload(row: AssetSlotViewModel, resource: RawResource): SemanticEntityPayload {
  return {
    asset_slot_id: row.slot.ID,
    resource_id: resource.ID,
    source_type: 'upload',
    source_id: resource.ID,
    score: 0.75,
    status: 'candidate',
    note: `手动上传候选：${resource.name}`,
  }
}

export function buildPreProductionGeneratedCandidatePayload(
  row: AssetSlotViewModel,
  resourceId: number,
  kind: PreProductionCandidateGenerationKind,
  jobId?: number,
): SemanticEntityPayload {
  return {
    asset_slot_id: row.slot.ID,
    resource_id: resourceId,
    source_type: 'ai_agent',
    source_id: jobId ?? resourceId,
    status: 'candidate',
    score: 0.8,
    note: `AI 生成${kind === 'video' ? '视频' : '图片'}候选：resource #${resourceId}`,
  }
}

export function preProductionResourceLibraryTypeParam(type: PreProductionResourceTypeFilter) {
  return type === 'all' ? 'image,video,audio,text,file' : type
}

export function preProductionResourceLibraryPageCount({ data, pageSize = 18 }: PreProductionResourcePageInput) {
  const total = Array.isArray(data) ? data.length : data?.total ?? 0
  return Math.max(1, Math.ceil(total / pageSize))
}

export function preProductionResourceLibraryTotal(data?: PreProductionResourcePageInput['data']) {
  return Array.isArray(data) ? data.length : data?.total ?? 0
}

export function defaultPreProductionResourceTypeForAssetKind(kind: Exclude<AssetKind, 'all'>): PreProductionResourceTypeFilter {
  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'text') return kind
  return 'all'
}

export function openPreProductionResourceLibraryState(kind: Exclude<AssetKind, 'all'>): PreProductionResourceLibraryState {
  return {
    open: true,
    search: '',
    type: defaultPreProductionResourceTypeForAssetKind(kind),
    page: 1,
    selectedResource: null,
  }
}

export function setPreProductionResourceLibraryOpen(state: PreProductionResourceLibraryState, open: boolean): PreProductionResourceLibraryState {
  return {
    ...state,
    open,
    ...(open ? {} : { selectedResource: null }),
  }
}

export function setPreProductionResourceLibrarySearch(state: PreProductionResourceLibraryState, search: string): PreProductionResourceLibraryState {
  return {
    ...state,
    search,
    page: 1,
  }
}

export function setPreProductionResourceLibraryType(state: PreProductionResourceLibraryState, type: PreProductionResourceTypeFilter): PreProductionResourceLibraryState {
  return {
    ...state,
    type,
    page: 1,
    selectedResource: null,
  }
}

export function setPreProductionResourceLibraryPage(state: PreProductionResourceLibraryState, page: number): PreProductionResourceLibraryState {
  return {
    ...state,
    page: Math.max(1, Math.round(Number(page) || 1)),
  }
}

export function setPreProductionResourceLibrarySelection(state: PreProductionResourceLibraryState, selectedResource: RawResource | null): PreProductionResourceLibraryState {
  return {
    ...state,
    selectedResource,
  }
}
