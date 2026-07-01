export type MovScriptEditPlanTrackType = 'video' | 'voice' | 'subtitle' | 'audio' | 'image' | 'metadata'
export type MovScriptEditPlanOutputKind = 'image' | 'video' | 'audio' | 'text' | 'metadata'

export interface MovScriptEditPlanTrackItem {
  id: string
  content_unit_id: string | number
  content_unit_ref: string
  output_kind: MovScriptEditPlanOutputKind
  target_kind: 'scene_moment' | 'expression_unit' | 'content_unit' | string
  target_ref: string
  expression_unit_ref?: string
  expression_modality?: string
  expression_role?: string
  candidate_id?: string | number
  resource_id?: number
  selected: boolean
  stale: boolean
  timing_intent?: Record<string, unknown>
  generation_role?: string
  order: number
}

export interface MovScriptEditPlanTrack {
  type: MovScriptEditPlanTrackType
  items: MovScriptEditPlanTrackItem[]
}

export interface MovScriptEditPlanArtifact {
  schema: 'movscript.edit_plan.v1'
  target_kind?: 'scene_moment' | string
  productionId: string | number
  productionPath: string
  sceneMomentId: string | number
  sceneMomentPath: string
  target_ref: string
  scope_kind?: string
  scope_ref?: string | number
  legacy_target_kind?: string
  legacy_target_ref?: string | number
  status: 'ready_to_compose' | 'missing_selection'
  tracks: MovScriptEditPlanTrack[]
  compose_inputs: Array<{
    content_unit_id: string | number
    resource_id: number
    output_kind: MovScriptEditPlanOutputKind
    track_type: MovScriptEditPlanTrackType
  }>
  blockers?: Array<{
    code: 'selection_missing' | 'selection_stale' | 'resource_missing'
    content_unit_id: string | number
    message: string
  }>
}
