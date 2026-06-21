import type { RawResource } from './resources'

export interface Project {
  ID: number
  name: string
  description: string
  owner_id: number
  owner?: User
  workspace_path?: string
  project_path?: string
  local?: boolean
  total_episodes?: number
  aspect_ratio?: string
  visual_style?: string
  project_style?: string
  CreatedAt: string
  UpdatedAt: string
}

export interface ProjectMember {
  ID: number
  project_id: number
  user_id: number
  user?: User
  role: string
}

export type ReviewStatus = 'workspace' | 'under_review' | 'approved' | 'revision'

export interface Script {
  ID: number
  project_id: number
  title: string
  description: string
  content: string // full script body text
  raw_source?: string
  script_type: string // user-defined category tag
  source_type?: 'raw' | 'adapted' | 'revised'
  version?: number
  parent_script_id?: number
  episode_id?: number
  assignee_id?: number
  assignee?: User
  author_id: number
  order: number // sort order
  // content management fields (内容管理)
  summary: string
  characters: string
  character_profiles?: string
  character_relationships?: string
  core_settings: string
  background: string
  scenes_desc: string
  hook: string        // 钩子
  plot_summary: string // 剧情推演总结
  script_points?: string // JSON array of structured script points
  planned_scene_count?: number
  planned_character_count?: number
  time_text?: string
  location_text?: string
  structured_characters?: string
  plot_beats?: string
  atmosphere?: string
  structure_json?: string
  entity_candidates?: string
  relationship_candidates?: string
  CreatedAt: string
  UpdatedAt: string
}

export interface AssetSlot {
  ID: number
  project_id: number
  production_id?: number | null
  owner_type?: string
  owner_id?: number | null
  setting_id?: number | null
  setting_state_id?: number | null
  kind?: 'image' | 'video' | 'audio' | 'text' | 'brand_pack' | 'reference' | string
  name: string
  slot_key?: string
  description?: string
  prompt_hint?: string
  priority?: 'low' | 'normal' | 'high' | 'critical' | string
  resource_id?: number | null
  resource?: RawResource
  locked_asset_slot_id?: number | null
  locked_asset_slot?: AssetSlot
  status?: 'missing' | 'candidate' | 'locked' | 'waived' | string
  metadata_json?: string
  CreatedAt: string
  UpdatedAt: string
}

export interface AssetSlotCandidate {
  ID: number
  project_id: number
  asset_slot_id: number
  asset_slot?: AssetSlot
  candidate_asset_slot_id: number
  candidate_asset_slot?: AssetSlot
  source_type?: 'manual' | 'upload' | 'job' | 'canvas' | 'import' | string
  source_id?: number | null
  score?: number
  status?: 'candidate' | 'selected' | 'rejected' | string
  note?: string
  CreatedAt: string
  UpdatedAt: string
}

export type ArtifactKind = 'script' | 'asset_slot'

export interface ArtifactEntityContext {
  asset_slot_id?: number | null
}

export interface ArtifactRef {
  kind: ArtifactKind
  id: number
  title: string
  subtitle?: string
  status?: string
  entity_context: ArtifactEntityContext
  resource?: RawResource
  created_at: string
  updated_at: string
}

export interface User {
  ID: number
  username: string
  system_role: 'super_admin' | 'user'
}

export interface Organization {
  ID: number
  name: string
  slug: string
  join_code?: string
  is_personal: boolean
  created_by: number
  CreatedAt: string
  UpdatedAt: string
}

export interface OrganizationMember {
  ID: number
  org_id: number
  user_id: number
  role: 'owner' | 'admin' | 'member' | 'viewer'
  user?: User
  CreatedAt: string
}

export interface OrgMembership {
  org_id: number
  org_name: string
  org_slug: string
  is_personal: boolean
  taskGraph?: 'personal' | 'team' | string
  status?: 'active' | 'suspended' | string
  role: 'owner' | 'admin' | 'member' | 'viewer'
}

export interface OrgInvitation {
  ID: number
  org_id: number
  token: string
  role: string
  note?: string
  created_by: number
  used_by?: number
  expires_at: string
  used_at?: string
  CreatedAt: string
}

export interface UserGroup {
  ID: number
  org_id: number
  name: string
  members?: UserGroupMember[]
}

export interface UserGroupMember {
  ID: number
  group_id: number
  user_id: number
  user?: User
}

export interface Progress {
  scripts: number
  asset_slots: number
  members: number
}
