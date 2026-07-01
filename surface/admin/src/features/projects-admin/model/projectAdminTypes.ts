import type { Project, User } from '@admin/types'

export interface AdminProjectMember {
  ID: number
  user_id: number
  role: string
  CreatedAt?: string
  user?: User
}

export interface AdminProject extends Project {
  members?: AdminProjectMember[]
}

export interface AdminProjectDetail {
  project: AdminProject
  member_count: number
  script_count: number
  content_unit_count: number
  asset_slot_count: number
  resource_count: number
  usage: {
    calls: number
    cost: number
    input_tokens: number
    output_tokens: number
    images: number
    duration_sec: number
  }
  audit: {
    records: number
    last_action?: string
    last_at?: string
  }
}
