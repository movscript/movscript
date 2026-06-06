import {
  createSemanticEntity,
  deleteSemanticEntity,
  listSemanticEntities,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityPayload,
} from '@/shared/infrastructure/api/semanticEntities'
import type { RawResource } from '@/types'

export type DeliveryStatus = 'workspace' | 'checking' | 'approved' | 'exported' | 'archived'
export type DeliveryTimelineItemStatus = 'workspace' | 'confirmed' | 'needs_asset' | 'missing' | 'locked' | 'approved'
export type ExportRecordStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface DeliveryVersion {
  ID: number
  project_id: number
  production_id?: number | null
  preview_timeline_id?: number | null
  name: string
  description?: string
  status: DeliveryStatus | string
  is_primary: boolean
  duration_sec: number
  metadata_json?: string
  CreatedAt?: string
  UpdatedAt?: string
}

export interface DeliveryTimelineItem {
  ID: number
  project_id: number
  delivery_version_id: number
  content_unit_id?: number | null
  asset_slot_id?: number | null
  resource_id?: number | null
  segment_id?: number | null
  scene_moment_id?: number | null
  keyframe_id?: number | null
  kind: 'video' | 'image' | 'audio' | 'caption' | 'gap' | 'note' | string
  order: number
  start_sec: number
  duration_sec: number
  label?: string
  status: DeliveryTimelineItemStatus | string
  metadata_json?: string
  CreatedAt?: string
  UpdatedAt?: string
}

export interface ExportRecord {
  ID: number
  project_id: number
  delivery_version_id: number
  resource_id?: number | null
  status: ExportRecordStatus | string
  format?: string
  preset?: string
  error?: string
  metadata_json?: string
  CreatedAt?: string
  UpdatedAt?: string
}

export interface PreviewTimeline {
  ID: number
  project_id: number
  production_id?: number | null
  script_version_id?: number | null
  name: string
  duration_sec: number
  is_primary: boolean
  status: string
}

export interface PreviewTimelineItem {
  ID: number
  project_id: number
  preview_timeline_id: number
  content_unit_id?: number | null
  segment_id?: number | null
  scene_moment_id?: number | null
  keyframe_id?: number | null
  kind: 'video' | 'image' | 'audio' | 'caption' | 'gap' | 'note' | string
  order: number
  start_sec: number
  duration_sec: number
  label?: string
  status: string
  metadata_json?: string
  CreatedAt?: string
  UpdatedAt?: string
}

export interface ContentUnit {
  ID: number
  project_id: number
  production_id?: number | null
  title: string
  kind: string
  order: number
  duration_sec: number
  shot_size?: string
  camera_angle?: string
  camera_height?: string
  camera_motion?: string
  motion_intensity?: string
  camera_speed?: string
  lens?: string
  focal_length?: string
  focus_subject?: string
  composition_start?: string
  composition_end?: string
  stabilization?: string
  camera_params_json?: string
  camera_notes?: string
  status: string
}

export type DeliveryVersionPayload = Partial<Pick<
  DeliveryVersion,
  'production_id' | 'preview_timeline_id' | 'name' | 'description' | 'status' | 'is_primary' | 'duration_sec' | 'metadata_json'
>>

export type DeliveryTimelineItemPayload = Partial<Pick<
  DeliveryTimelineItem,
  'content_unit_id' | 'asset_slot_id' | 'resource_id' | 'segment_id' | 'scene_moment_id' | 'keyframe_id' | 'kind' | 'order' | 'start_sec' | 'duration_sec' | 'label' | 'status' | 'metadata_json'
>> & {
  delivery_version_id: number
}

export type ExportRecordPayload = Partial<Pick<ExportRecord, 'resource_id' | 'status' | 'format' | 'preset' | 'error' | 'metadata_json'>> & {
  delivery_version_id: number
}

export function resourceFromId(id: number, type: RawResource['type'] = 'video', name = `Resource #${id}`): RawResource {
  return {
    ID: id,
    owner_id: 0,
    type,
    name,
    url: `/resources/${id}/file`,
    size: 0,
    mime_type: type === 'video' ? 'video/mp4' : type === 'image' ? 'image/png' : '',
  }
}

export interface Production {
  ID: number
  project_id: number
  script_version_id?: number | null
  preview_timeline_id?: number | null
  name: string
  description?: string
  status: string
  source_type?: string
  owner_label?: string
  progress?: number
  CreatedAt?: string
  UpdatedAt?: string
}

export async function listProductions(projectId: number) {
  return listTypedEntities<Production>(projectId, 'productions')
}

export async function listDeliveryVersions(projectId: number, productionId?: number | null) {
  return listTypedEntities<DeliveryVersion>(projectId, 'deliveryVersions', productionId ? { production_id: productionId } : {})
}

export async function createDeliveryVersion(projectId: number, payload: DeliveryVersionPayload) {
  return createTypedEntity<DeliveryVersion>(projectId, 'deliveryVersions', payload)
}

export async function updateDeliveryVersion(projectId: number, id: number, payload: DeliveryVersionPayload) {
  return updateTypedEntity<DeliveryVersion>(projectId, 'deliveryVersions', id, payload)
}

export async function listDeliveryTimelineItems(projectId: number, deliveryVersionId?: number | null) {
  const items = await listTypedEntities<DeliveryTimelineItem>(projectId, 'deliveryTimelineItems')
  return deliveryVersionId ? items.filter((item) => sameId(item.delivery_version_id, deliveryVersionId)) : items
}

export async function createDeliveryTimelineItem(projectId: number, payload: DeliveryTimelineItemPayload) {
  return createTypedEntity<DeliveryTimelineItem>(projectId, 'deliveryTimelineItems', payload)
}

export async function updateDeliveryTimelineItem(projectId: number, id: number, payload: DeliveryTimelineItemPayload) {
  return updateTypedEntity<DeliveryTimelineItem>(projectId, 'deliveryTimelineItems', id, payload)
}

export async function deleteDeliveryTimelineItem(projectId: number, id: number) {
  await deleteSemanticEntity(projectId, semanticEntityConfig('deliveryTimelineItems'), id)
}

export async function listExportRecords(projectId: number, deliveryVersionId?: number | null) {
  const items = await listTypedEntities<ExportRecord>(projectId, 'exportRecords')
  return deliveryVersionId ? items.filter((item) => sameId(item.delivery_version_id, deliveryVersionId)) : items
}

export async function createExportRecord(projectId: number, payload: ExportRecordPayload) {
  return createTypedEntity<ExportRecord>(projectId, 'exportRecords', payload)
}

export async function listPreviewTimelines(projectId: number, productionId?: number | null) {
  return listTypedEntities<PreviewTimeline>(projectId, 'previewTimelines', productionId ? { production_id: productionId } : {})
}

export async function listPreviewTimelineItems(projectId: number, previewTimelineId?: number | null) {
  const items = await listTypedEntities<PreviewTimelineItem>(projectId, 'previewTimelineItems')
  return previewTimelineId ? items.filter((item) => sameId(item.preview_timeline_id, previewTimelineId)) : items
}

export async function listContentUnits(projectId: number, productionId?: number | null) {
  return listTypedEntities<ContentUnit>(projectId, 'contentUnits', productionId ? { production_id: productionId } : {})
}

async function listTypedEntities<T>(
  projectId: number,
  kind: Parameters<typeof semanticEntityConfig>[0],
  params: Record<string, string | number | boolean | null | undefined> = {},
): Promise<T[]> {
  return await listSemanticEntities(projectId, semanticEntityConfig(kind), params) as unknown as T[]
}

async function createTypedEntity<T>(
  projectId: number,
  kind: Parameters<typeof semanticEntityConfig>[0],
  payload: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  return await createSemanticEntity(projectId, semanticEntityConfig(kind), payload as SemanticEntityPayload) as unknown as T
}

async function updateTypedEntity<T>(
  projectId: number,
  kind: Parameters<typeof semanticEntityConfig>[0],
  id: number,
  payload: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  return await updateSemanticEntity(projectId, semanticEntityConfig(kind), id, payload as SemanticEntityPayload) as unknown as T
}

function sameId(left: unknown, right: unknown) {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber
}
