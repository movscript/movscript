export type MovScriptSemanticChangeKind =
  | 'metadata_changed'
  | 'semantic_input_changed'
  | 'reference_changed'
  | 'selection_changed'

export type MovScriptBusinessSemanticKind =
  | 'metadata_changed'
  | 'semantic_input_changed'
  | 'reference_changed'
  | 'selection_changed'
  | 'sequence_reordered'
  | 'shot_changed'
  | 'storyboard_changed'
  | 'keyframe_changed'
  | 'content_unit_changed'
  | 'project_context_changed'
  | 'production_structure_changed'
  | 'domain_entity_changed'

export type MovScriptSemanticPropagation =
  | 'none'
  | 'self'
  | 'downstream_reference'

export interface MovScriptEntityRef {
  kind: string
  id?: string | number
}

export interface MovScriptSemanticFieldChange {
  field: string
  operation: 'added' | 'modified' | 'deleted' | 'unchanged'
  jsonOperation?: 'added' | 'removed' | 'replaced' | 'moved' | 'reordered'
}

export interface MovScriptEntityChangeInput {
  entityKind: string
  path: string
  id?: string | number
  state: 'added' | 'modified' | 'deleted' | 'unchanged'
  fieldChanges?: readonly MovScriptSemanticFieldChange[]
}

export interface MovScriptSemanticChange {
  entity: MovScriptEntityRef
  kind: MovScriptSemanticChangeKind
  businessKind: MovScriptBusinessSemanticKind
  propagation: MovScriptSemanticPropagation
  fields: string[]
  sourceChange: {
    operation: 'added' | 'modified' | 'deleted' | 'unchanged'
    path?: string
  }
}

interface FieldSemanticRule {
  matches(entity: MovScriptEntityChangeInput, fieldChange: MovScriptSemanticFieldChange): boolean
  semanticKind: MovScriptSemanticChangeKind
  businessKind: MovScriptBusinessSemanticKind
  propagation: MovScriptSemanticPropagation
}

const FIELD_SEMANTIC_RULES: readonly FieldSemanticRule[] = [
  {
    matches: (entity, fieldChange) => entity.entityKind === 'shot' && isShotSemanticInputField(fieldChange.field),
    semanticKind: 'semantic_input_changed',
    businessKind: 'shot_changed',
    propagation: 'self',
  },
  {
    matches: (_entity, fieldChange) => isSelectionField(fieldChange.field),
    semanticKind: 'selection_changed',
    businessKind: 'selection_changed',
    propagation: 'downstream_reference',
  },
  {
    matches: (_entity, fieldChange) => isReferenceField(fieldChange.field),
    semanticKind: 'reference_changed',
    businessKind: 'reference_changed',
    propagation: 'downstream_reference',
  },
  {
    matches: (_entity, fieldChange) => isMetadataField(fieldChange.field),
    semanticKind: 'metadata_changed',
    businessKind: 'metadata_changed',
    propagation: 'none',
  },
]

export function semanticChangesFromEntityChanges(
  changedEntities: readonly MovScriptEntityChangeInput[],
): MovScriptSemanticChange[] {
  return changedEntities.flatMap((entity) => {
    const fieldChanges = entity.fieldChanges?.length
      ? entity.fieldChanges
      : [{ field: '*', operation: entity.state }]
    const grouped = new Map<string, {
      kind: MovScriptSemanticChangeKind
      businessKind: MovScriptBusinessSemanticKind
      propagation: MovScriptSemanticPropagation
      fields: string[]
    }>()
    for (const fieldChange of fieldChanges) {
      const semantic = semanticForFieldChange(entity, fieldChange)
      const key = `${semantic.kind}:${semantic.businessKind}:${semantic.propagation}`
      const group = grouped.get(key) ?? {
        kind: semantic.kind,
        businessKind: semantic.businessKind,
        propagation: semantic.propagation,
        fields: [],
      }
      if (!group.fields.includes(fieldChange.field)) group.fields.push(fieldChange.field)
      grouped.set(key, group)
    }
    return [...grouped.values()].map((group) => ({
      entity: {
        kind: entity.entityKind,
        ...(entity.id !== undefined ? { id: entity.id } : {}),
      },
      kind: group.kind,
      businessKind: group.businessKind,
      propagation: group.propagation,
      fields: group.fields.sort(),
      sourceChange: {
        operation: entity.state,
        path: entity.path,
      },
    }))
  })
}

function semanticForFieldChange(
  entity: MovScriptEntityChangeInput,
  fieldChange: MovScriptSemanticFieldChange,
): { kind: MovScriptSemanticChangeKind; businessKind: MovScriptBusinessSemanticKind; propagation: MovScriptSemanticPropagation } {
  if (entity.state === 'added' || entity.state === 'deleted') {
    return {
      kind: 'semantic_input_changed',
      businessKind: businessKindForEntityChange(entity.entityKind),
      propagation: entity.entityKind === 'content_unit' ? 'self' : 'downstream_reference',
    }
  }
  if (fieldChange.jsonOperation === 'reordered' || fieldChange.jsonOperation === 'moved') {
    const base = semanticCategoryForFieldChange(entity, fieldChange)
    return {
      kind: base.kind,
      businessKind: 'sequence_reordered',
      propagation: base.propagation,
    }
  }
  const rule = FIELD_SEMANTIC_RULES.find((item) => item.matches(entity, fieldChange))
  if (rule) {
    return {
      kind: rule.semanticKind,
      businessKind: rule.businessKind,
      propagation: rule.propagation,
    }
  }
  return semanticCategoryForFieldChange(entity, fieldChange)
}

function semanticCategoryForFieldChange(
  entity: MovScriptEntityChangeInput,
  fieldChange: MovScriptSemanticFieldChange,
): { kind: MovScriptSemanticChangeKind; businessKind: MovScriptBusinessSemanticKind; propagation: MovScriptSemanticPropagation } {
  const rule = FIELD_SEMANTIC_RULES.find((item) => item.matches(entity, fieldChange))
  if (rule) {
    return {
      kind: rule.semanticKind,
      businessKind: rule.businessKind,
      propagation: rule.propagation,
    }
  }
  return {
    kind: 'semantic_input_changed',
    businessKind: businessKindForEntityChange(entity.entityKind),
    propagation: entity.entityKind === 'content_unit' ? 'self' : 'downstream_reference',
  }
}

function businessKindForEntityChange(entityKind: string): MovScriptBusinessSemanticKind {
  switch (entityKind) {
    case 'shot':
      return 'shot_changed'
    case 'storyboard':
      return 'storyboard_changed'
    case 'keyframe':
      return 'keyframe_changed'
    case 'content_unit':
      return 'content_unit_changed'
    case 'project':
    case 'project_standards':
    case 'script':
    case 'script_version':
    case 'script_block':
      return 'project_context_changed'
    case 'production':
    case 'segment':
    case 'scene_moment':
      return 'production_structure_changed'
    default:
      return 'domain_entity_changed'
  }
}

function isShotSemanticInputField(field: string): boolean {
  return field === '*'
    || field === 'angle'
    || field.startsWith('angle.')
    || field === 'lens'
    || field.startsWith('lens.')
    || field === 'camera'
    || field.startsWith('camera.')
    || field === 'movement'
    || field.startsWith('movement.')
    || field === 'blocking'
    || field.startsWith('blocking.')
    || field === 'lighting'
    || field.startsWith('lighting.')
    || field === 'sound'
    || field.startsWith('sound.')
    || field === 'performance'
    || field.startsWith('performance.')
    || field === 'duration'
    || field.startsWith('duration.')
    || field === 'intent'
    || field.startsWith('intent.')
    || field === 'visual_intent'
    || field.startsWith('visual_intent.')
    || field === 'narrative_intent'
    || field.startsWith('narrative_intent.')
}

function isMetadataField(field: string): boolean {
  return /(^|\.)metadata(\.|$)/.test(field)
    || /(^|\.)notes?$/.test(field)
    || /(^|\.)title$/.test(field)
    || /(^|\.)description$/.test(field)
    || /(^|\.)created_at$/.test(field)
    || /(^|\.)updated_at$/.test(field)
    || /(^|\.)selected_at$/.test(field)
    || /(^|\.)selected_by$/.test(field)
}

function isReferenceField(field: string): boolean {
  return /(^|_|\.)refs?(\.|$)/.test(field)
    || field.endsWith('_ref')
    || field.includes('_ref.')
    || field.endsWith('_refs')
    || field.includes('_refs.')
}

function isSelectionField(field: string): boolean {
  return field === 'lock'
    || field.startsWith('lock.')
    || field === 'selection'
    || field.startsWith('selection.')
    || field === 'stale_policy'
    || field.endsWith('.candidate_id')
    || field.endsWith('.resource_id')
}
