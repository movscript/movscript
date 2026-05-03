import { api } from '@/lib/api'
import type { RawResource } from '@/types'

export type DeliveryStatus = 'draft' | 'checking' | 'approved' | 'exported' | 'archived'
export type DeliveryTimelineItemStatus = 'draft' | 'confirmed' | 'needs_asset' | 'missing' | 'locked' | 'approved'
export type ExportRecordStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface DeliveryVersion {
  ID: number
  project_id: number
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
  script_version_id?: number | null
  name: string
  duration_sec: number
  is_primary: boolean
  status: string
}

export interface ContentUnit {
  ID: number
  project_id: number
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
  'preview_timeline_id' | 'name' | 'description' | 'status' | 'is_primary' | 'duration_sec' | 'metadata_json'
>>

export type DeliveryTimelineItemPayload = Partial<Pick<
  DeliveryTimelineItem,
  'content_unit_id' | 'asset_slot_id' | 'resource_id' | 'kind' | 'order' | 'start_sec' | 'duration_sec' | 'label' | 'status' | 'metadata_json'
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

export async function listDeliveryVersions(projectId: number) {
  const { data } = await api.get<DeliveryVersion[]>(`/projects/${projectId}/entities/delivery-versions`)
  return data
}

export async function createDeliveryVersion(projectId: number, payload: DeliveryVersionPayload) {
  const { data } = await api.post<DeliveryVersion>(`/projects/${projectId}/entities/delivery-versions`, payload)
  return data
}

export async function updateDeliveryVersion(projectId: number, id: number, payload: DeliveryVersionPayload) {
  const { data } = await api.patch<DeliveryVersion>(`/projects/${projectId}/entities/delivery-versions/${id}`, payload)
  return data
}

export async function listDeliveryTimelineItems(projectId: number, deliveryVersionId?: number | null) {
  const { data } = await api.get<DeliveryTimelineItem[]>(`/projects/${projectId}/entities/delivery-timeline-items`, {
    params: deliveryVersionId ? { delivery_version_id: deliveryVersionId } : undefined,
  })
  return data
}

export async function createDeliveryTimelineItem(projectId: number, payload: DeliveryTimelineItemPayload) {
  const { data } = await api.post<DeliveryTimelineItem>(`/projects/${projectId}/entities/delivery-timeline-items`, payload)
  return data
}

export async function updateDeliveryTimelineItem(projectId: number, id: number, payload: DeliveryTimelineItemPayload) {
  const { data } = await api.patch<DeliveryTimelineItem>(`/projects/${projectId}/entities/delivery-timeline-items/${id}`, payload)
  return data
}

export async function deleteDeliveryTimelineItem(projectId: number, id: number) {
  await api.delete(`/projects/${projectId}/entities/delivery-timeline-items/${id}`)
}

export async function listExportRecords(projectId: number, deliveryVersionId?: number | null) {
  const { data } = await api.get<ExportRecord[]>(`/projects/${projectId}/entities/export-records`, {
    params: deliveryVersionId ? { delivery_version_id: deliveryVersionId } : undefined,
  })
  return data
}

export async function createExportRecord(projectId: number, payload: ExportRecordPayload) {
  const { data } = await api.post<ExportRecord>(`/projects/${projectId}/entities/export-records`, payload)
  return data
}

export async function listPreviewTimelines(projectId: number) {
  const { data } = await api.get<PreviewTimeline[]>(`/projects/${projectId}/entities/preview-timelines`)
  return data
}

export async function listContentUnits(projectId: number) {
  const { data } = await api.get<ContentUnit[]>(`/projects/${projectId}/entities/content-units`)
  return data
}
