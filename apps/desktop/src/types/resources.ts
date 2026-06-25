export interface ResourceFolder {
  ID: number
  owner_id: number
  owner?: { ID: number; username: string }
  name: string
  parent_id?: number
  storage_backend: string // "" = system default, "local", "tos", …
  resource_count: number
  CreatedAt: string
  UpdatedAt: string
}

export interface RawResource {
  ID: number
  owner_id: number
  org_id?: number
  blob_id?: number
  folder_id?: number
  type: 'image' | 'video' | 'audio' | 'text' | 'file'
  name: string
  url: string
  size: number
  mime_type: string
  storage_backend?: string
  storage_key?: string
  direct_url?: string // presigned URL for cloud-stored resources
  owner?: { ID: number; username: string }
  verification_status?: string
  verification_provider?: string
  verified_at?: string
  verification_error?: string
  provider_asset_certifications?: Record<string, Record<string, unknown>>
  provider_generated_artifact?: Record<string, unknown>
}

export interface ExternalResourceSource {
  ID: number
  owner_id: number
  org_id?: number
  name: string
  provider_key: 'pexels' | 'pixabay' | string
  priority: number
  is_enabled: boolean
  masked_config?: string
  CreatedAt: string
  UpdatedAt: string
}

export interface ExternalResourceItem {
  provider_key: string
  external_id: string
  media_type: 'image' | 'video' | string
  title?: string
  description?: string
  thumbnail_url: string
  preview_url?: string
  source_url: string
  width?: number
  height?: number
  duration_seconds?: number
  author_name?: string
  author_url?: string
  attribution_text?: string
  license_label?: string
}

export interface ExternalResourceSearchResult {
  total: number
  items: ExternalResourceItem[]
  page: number
  page_size: number
  provider: string
  next_page?: string
  source_name?: string
}

export type ResourceBindingOwnerType =
  | 'project'
  | 'script'
  | 'asset_slot'
  | 'script_version'
  | 'segment'
  | 'scene_moment'
  | 'storyboard_script'
  | 'content_unit'
  | 'keyframe'
  | 'canvas'

export type ResourceBindingRole =
  | 'reference'
  | 'input'
  | 'output'
  | 'workspace'
  | 'final'
  | 'thumbnail'
  | 'attachment'
  | 'source'

export type ResourceBindingStatus = 'workspace' | 'selected' | 'rejected' | 'approved' | 'archived'
export type ResourceBindingSourceType = 'upload' | 'job' | 'canvas' | 'import' | 'manual' | 'legacy'

export interface ResourceBinding {
  ID: number
  project_id: number
  resource_id: number
  resource?: RawResource
  owner_type: ResourceBindingOwnerType
  owner_id: number
  role: ResourceBindingRole
  slot: string
  sort_order: number
  version: number
  is_primary: boolean
  status: ResourceBindingStatus
  source_type: ResourceBindingSourceType
  source_id?: number
  metadata_json: string
  created_by_id?: number
  CreatedAt: string
  UpdatedAt: string
}
