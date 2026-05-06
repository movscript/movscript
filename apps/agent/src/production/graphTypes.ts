import type { JSONValue } from '../types.js'

export type CreativeSourceType =
  | 'script'
  | 'brief'
  | 'outline'
  | 'treatment'
  | 'shot_list'
  | 'reference_board'
  | 'product_spec'
  | 'interview_transcript'
  | 'footage'
  | 'prompt_seed'
  | 'mixed'
  | 'unknown'

export type SourceGraphObjectType =
  | 'creative_source'
  | 'source_version'
  | 'segment'
  | 'scene_moment'
  | 'beat'
  | 'action'
  | 'dialogue'
  | 'intent'

export type ScriptGraphObjectType =
  | 'script'
  | 'script_version'
  | 'production_text_block'
  | 'segment'
  | 'scene_moment'
  | 'story_beat'
  | 'dialogue'
  | 'action'

export type ProductionGraphObjectType =
  | 'production'
  | 'storyboard_script'
  | 'storyboard_line'
  | 'content_unit'
  | 'asset_slot'
  | 'keyframe'
  | 'preview_timeline'
  | 'preview_timeline_item'
  | 'delivery_version'
  | 'generation_task'

export type ProductionGraphRelationType =
  | 'derived_from'
  | 'references'
  | 'contains'
  | 'uses'
  | 'requires'
  | 'binds'
  | 'constrains'
  | 'delivers'
  | 'supersedes'

export type IntentKind =
  | 'source_intent'
  | 'story_intent'
  | 'directing_intent'
  | 'generation_intent'
  | 'continuity_intent'

export interface GraphObjectRef {
  objectType: string
  objectId?: string | number
  versionId?: string | number
  clientId?: string
}

export interface EvidenceRange {
  sourceRef?: GraphObjectRef
  start?: number
  end?: number
  quote?: string
  note?: string
}

export interface GraphRelation {
  type: string
  from: GraphObjectRef
  to: GraphObjectRef
  confidence?: number
  evidence?: EvidenceRange[]
  metadata?: Record<string, JSONValue>
}

export interface SourceGraphNode {
  id: string
  objectType: SourceGraphObjectType
  sourceType?: CreativeSourceType
  ref?: GraphObjectRef
  title?: string
  summary?: string
  evidence?: EvidenceRange[]
  metadata?: Record<string, JSONValue>
}

export interface ScriptGraphNode {
  id: string
  objectType: ScriptGraphObjectType
  ref?: GraphObjectRef
  title?: string
  summary?: string
  order?: number
  evidence?: EvidenceRange[]
  metadata?: Record<string, JSONValue>
}

export interface ProductionGraphNode {
  id: string
  objectType: ProductionGraphObjectType
  ref?: GraphObjectRef
  title?: string
  summary?: string
  order?: number
  status?: string
  metadata?: Record<string, JSONValue>
}

export interface IntentRecord {
  id: string
  kind: IntentKind
  text: string
  owner?: GraphObjectRef
  evidence?: EvidenceRange[]
  confidence?: number
  metadata?: Record<string, JSONValue>
}

export interface ContinuityConstraint {
  id: string
  owner?: GraphObjectRef
  subject?: GraphObjectRef
  scope?: GraphObjectRef
  text: string
  state?: Record<string, JSONValue>
  evidence?: EvidenceRange[]
  metadata?: Record<string, JSONValue>
}

export interface SourceGraph {
  nodes: SourceGraphNode[]
  relations: GraphRelation[]
}

export interface ScriptGraph {
  nodes: ScriptGraphNode[]
  relations: GraphRelation[]
}

export interface StoryIntentGraph {
  intents: IntentRecord[]
  continuityConstraints: ContinuityConstraint[]
  relations: GraphRelation[]
}

export interface ProductionGraph {
  nodes: ProductionGraphNode[]
  relations: GraphRelation[]
}

export interface MovscriptProductionKnowledgeGraph {
  schema: 'movscript.production_knowledge_graph.v1'
  projectId?: number
  productionId?: number
  sourceGraph: SourceGraph
  scriptGraph: ScriptGraph
  storyIntentGraph: StoryIntentGraph
  productionGraph: ProductionGraph
  metadata?: Record<string, JSONValue>
}
