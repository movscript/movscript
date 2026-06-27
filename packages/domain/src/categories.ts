import type {
  MovScriptDomainNodeCategory,
  MovScriptNamespaceCategory,
  MovScriptSystemPrimitiveKind,
} from './types.js'

export const MOVSCRIPT_TIMELINE_NAMESPACE_ENTITY_KINDS = ['production', 'segment'] as const
export const MOVSCRIPT_SETTING_NAMESPACE_ENTITY_KINDS = ['setting', 'setting_state', 'state'] as const
export const MOVSCRIPT_SYSTEM_PRIMITIVE_KINDS = [
  'scene_moment',
  'expression_unit',
  'storyboard',
  'keyframe',
  'audio_cue',
  'asset',
  'timeline_assembly',
] as const satisfies readonly MovScriptSystemPrimitiveKind[]

const TIMELINE_NAMESPACE_KINDS = new Set<string>(MOVSCRIPT_TIMELINE_NAMESPACE_ENTITY_KINDS)
const SETTING_NAMESPACE_KINDS = new Set<string>(MOVSCRIPT_SETTING_NAMESPACE_ENTITY_KINDS)
const SYSTEM_PRIMITIVE_KINDS = new Set<string>(MOVSCRIPT_SYSTEM_PRIMITIVE_KINDS)

export function classifyMovScriptEntityKind(kind: string): MovScriptDomainNodeCategory | undefined {
  if (TIMELINE_NAMESPACE_KINDS.has(kind)) return 'timeline_namespace'
  if (SETTING_NAMESPACE_KINDS.has(kind)) return 'setting_namespace'
  if (SYSTEM_PRIMITIVE_KINDS.has(kind)) return 'system_primitive'
  if (kind === 'content_unit') return 'content_unit'
  if (kind === 'candidate' || kind === 'selection' || kind === 'raw_resource' || kind === 'resource') return 'resource_state'
  return undefined
}

export function projectMovScriptDomainNodeKind(
  entityKind: string,
  record: Record<string, unknown> = {},
): string {
  const category = classifyMovScriptEntityKind(entityKind)
  if (category === 'timeline_namespace') {
    return stringField(record.namespace_kind)
      ?? stringField(record.timeline_namespace_kind)
      ?? stringField(record.timelineNamespaceKind)
      ?? stringField(record.kind)
      ?? entityKind
  }
  if (category === 'setting_namespace') {
    return stringField(record.namespace_kind)
      ?? stringField(record.setting_namespace_kind)
      ?? stringField(record.settingNamespaceKind)
      ?? stringField(record.setting_kind)
      ?? stringField(record.settingKind)
      ?? stringField(record.kind)
      ?? entityKind
  }
  return entityKind
}

export function isMovScriptNamespaceCategory(category: string | undefined): category is MovScriptNamespaceCategory {
  return category === 'timeline_namespace' || category === 'setting_namespace'
}

export function isMovScriptSystemPrimitiveKind(kind: string | undefined): kind is MovScriptSystemPrimitiveKind {
  return kind !== undefined && SYSTEM_PRIMITIVE_KINDS.has(kind)
}

export function isMovScriptTimelineNamespaceKind(kind: string | undefined): boolean {
  return kind !== undefined && TIMELINE_NAMESPACE_KINDS.has(kind)
}

export function isMovScriptSettingNamespaceKind(kind: string | undefined): boolean {
  return kind !== undefined && SETTING_NAMESPACE_KINDS.has(kind)
}

export function isMovScriptNamespaceKind(kind: string | undefined): boolean {
  if (kind === 'timeline_namespace' || kind === 'setting_namespace') return true
  return isMovScriptTimelineNamespaceKind(kind) || isMovScriptSettingNamespaceKind(kind)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
