export interface Script {
  ID: number
  id?: string
  project_id: number
  title: string
  description?: string
  content?: string
  raw_source?: string
  script_type?: string
  script_kind?: string
  source_type?: 'raw' | 'adapted' | 'revised'
  version?: number
  parent_script_id?: number
  assignee_id?: number
  author_id?: number
  order?: number
  summary?: string
  characters?: string
  character_profiles?: string
  character_relationships?: string
  core_settings?: string
  background?: string
  scenes_desc?: string
  hook?: string
  plot_summary?: string
  script_points?: string
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
  CreatedAt?: string
  UpdatedAt?: string
  record?: Record<string, unknown>
}

export interface ScriptVersion {
  ID: number
  id?: string
  script_id: number
  version_number?: number
  version_label?: string
  title?: string
  source_type?: string
  content?: string
  raw_source?: string
  summary?: string
  CreatedAt?: string
  UpdatedAt?: string
  record?: Record<string, unknown>
}
