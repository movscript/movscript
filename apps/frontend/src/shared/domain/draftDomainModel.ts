import { getActiveSchemaForKind, getDraftSchemaEntry, type JSONSchema7 } from '@movscript/drafts'
import type { AgentDraftKind } from '@/shared/contracts/agentDraft'

export type DraftSeedMode = 'empty' | 'snapshot' | 'editable_snapshot'

export interface DraftDomainModel {
  kind: AgentDraftKind
  title: string
  targetEntityType: string
  contentSchemaId?: string
  contentSchema?: JSONSchema7
  seed: {
    defaultMode: DraftSeedMode
    allowedModes: DraftSeedMode[]
    include: string[]
    maxDepth?: number
    conflictKeys: string[]
  }
  fieldGuide: {
    owns: string[]
    references: string[]
    forbids: string[]
  }
  applyBoundary: {
    backendApply: 'project_standards_proposal' | 'setting_proposal' | 'asset_proposal' | 'production_proposal' | 'draft_only'
    writableEntityTypes: string[]
  }
  routes: {
    fallback: string
    reviewTemplate: string
  }
}

export const DRAFT_DOMAIN_MODELS: Partial<Record<AgentDraftKind, DraftDomainModel>> = {
  setting_proposal: {
    kind: 'setting_proposal',
    title: 'Setting proposal',
    targetEntityType: 'project',
    contentSchemaId: 'movscript.setting_proposal.v1',
    seed: {
      defaultMode: 'editable_snapshot',
      allowedModes: ['empty', 'snapshot', 'editable_snapshot'],
      include: ['project', 'creative_references'],
      maxDepth: 2,
      conflictKeys: ['project.updatedAt', 'creative_references[].updatedAt'],
    },
    fieldGuide: {
      owns: ['creative_references', 'reuse_candidates', 'merge_candidates'],
      references: ['project'],
      forbids: ['asset_slots', 'asset_candidate_plans', 'media_generation_jobs', 'generated_resource_bindings', 'production_segments', 'scene_moments', 'content_units'],
    },
    applyBoundary: {
      backendApply: 'setting_proposal',
      writableEntityTypes: ['creative_reference'],
    },
    routes: {
      fallback: '/project/pre-production',
      reviewTemplate: '/project/pre-production?view=review&draftId=:draftId',
    },
  },
  asset_proposal: {
    kind: 'asset_proposal',
    title: 'Asset proposal',
    targetEntityType: 'project',
    contentSchemaId: 'movscript.asset_proposal.v1',
    seed: {
      defaultMode: 'editable_snapshot',
      allowedModes: ['empty', 'snapshot', 'editable_snapshot'],
      include: ['project', 'creative_references', 'asset_slots', 'asset_slot_ownership', 'asset_slot', 'asset_need', 'reference_resources'],
      maxDepth: 2,
      conflictKeys: ['project.updatedAt', 'creative_references[].updatedAt', 'asset_slots[].updatedAt', 'asset_slot.updatedAt', 'reference_resources[].UpdatedAt'],
    },
    fieldGuide: {
      owns: ['asset_slots', 'asset_slot_ownership', 'candidate_taskGraph', 'acceptance_criteria', 'risks'],
      references: ['project', 'creative_references', 'asset_slot', 'reference_resources'],
      forbids: ['creative_reference_edits', 'media_generation_jobs', 'generated_resource_bindings', 'resource_binding_apply'],
    },
    applyBoundary: {
      backendApply: 'asset_proposal',
      writableEntityTypes: ['asset_slot'],
    },
    routes: {
      fallback: '/project/pre-production',
      reviewTemplate: '/project/pre-production?view=review&draftId=:draftId',
    },
  },
  project_standards_proposal: {
    kind: 'project_standards_proposal',
    title: 'Project standards proposal',
    targetEntityType: 'project',
    contentSchemaId: 'movscript.project_standards_proposal.v1',
    seed: {
      defaultMode: 'editable_snapshot',
      allowedModes: ['empty', 'snapshot', 'editable_snapshot'],
      include: ['project'],
      maxDepth: 2,
      conflictKeys: ['project.updatedAt'],
    },
    fieldGuide: {
      owns: ['project_style', 'shot_size_system', 'aspect_ratio', 'camera_language', 'visual_style', 'lighting_style', 'color_palette', 'pacing_rules', 'negative_rules', 'custom_rules'],
      references: ['project'],
      forbids: ['creative_reference_lists', 'asset_requirement_lists', 'asset_candidate_plans', 'production_segments', 'scene_moments', 'content_units', 'media_generation_jobs', 'generated_resource_bindings'],
    },
    applyBoundary: {
      backendApply: 'project_standards_proposal',
      writableEntityTypes: ['project'],
    },
    routes: {
      fallback: '/project/standards',
      reviewTemplate: '/project/standards?draftId=:draftId',
    },
  },
  production_proposal: {
    kind: 'production_proposal',
    title: 'Production proposal',
    targetEntityType: 'production',
    contentSchemaId: 'movscript.production_proposal.v1',
    seed: {
      defaultMode: 'editable_snapshot',
      allowedModes: ['empty', 'snapshot', 'editable_snapshot'],
      include: [
        'production',
        'production_script_brief',
        'project_scripts',
        'creative_references',
        'segments',
        'scene_moments',
        'writing_expressions',
        'creative_reference_usages',
        'unresolved_requirements',
      ],
      maxDepth: 3,
      conflictKeys: ['production.updatedAt', 'production_script_brief.scriptVersionUpdatedAt', 'project_scripts[].UpdatedAt', 'creative_references[].updatedAt', 'segments[].updatedAt', 'scene_moments[].updatedAt', 'writing_expressions[].updatedAt'],
    },
    fieldGuide: {
      owns: ['snapshot.proposal.segments', 'snapshot.proposal.segments[].scene_moments', 'snapshot.proposal.segments[].scene_moments[].writing_expressions'],
      references: ['project', 'creative_references', 'creative_reference_usages'],
      forbids: ['action_patch_payloads', 'new_project_level_creative_references', 'new_project_level_asset_slots', 'content_units', 'keyframes', 'asset_slots', 'final_media_generation_jobs'],
    },
    applyBoundary: {
      backendApply: 'production_proposal',
      writableEntityTypes: ['segment', 'scene_moment', 'writing_expression', 'creative_reference_usage'],
    },
    routes: {
      fallback: '/project/production/orchestration',
      reviewTemplate: '/project/production/orchestration?productionId=:targetEntityId&draftId=:draftId',
    },
  },
  content_unit_proposal: {
    kind: 'content_unit_proposal',
    title: 'Production item proposal',
    targetEntityType: 'scene_moment',
    contentSchemaId: 'movscript.content_unit_proposal.v1',
    seed: {
      defaultMode: 'snapshot',
      allowedModes: ['empty', 'snapshot'],
      include: ['production', 'segments', 'scene_moments', 'content_units'],
      maxDepth: 3,
      conflictKeys: ['production.updatedAt', 'segments[].updatedAt', 'scene_moments[].updatedAt', 'content_units[].updatedAt'],
    },
    fieldGuide: {
      owns: ['content_units', 'content_units[].visual_taskGraph', 'content_units[].storyboard_brief'],
      references: ['production', 'segments', 'scene_moments', 'creative_references', 'asset_slots'],
      forbids: ['operation_fields', 'media_generation_jobs', 'generated_resource_bindings', 'project_level_creative_references', 'project_level_asset_slots'],
    },
    applyBoundary: {
      backendApply: 'draft_only',
      writableEntityTypes: ['content_unit'],
    },
    routes: {
      fallback: '/project/content-units/workbench',
      reviewTemplate: '/project/content-units/workbench?view=review&scene_moment_id=:targetEntityId&draftId=:draftId',
    },
  },
}

export function getDraftDomainModel(kind: AgentDraftKind): DraftDomainModel | null {
  const model = DRAFT_DOMAIN_MODELS[kind]
  if (!model) return null
  const schema = resolveDraftContentSchema(kind, model.contentSchemaId)
  return {
    ...model,
    ...(schema ? { contentSchema: schema } : {}),
  }
}

function resolveDraftContentSchema(kind: AgentDraftKind, schemaId?: string): JSONSchema7 | undefined {
  const direct = schemaId ? getDraftSchemaEntry(schemaId)?.jsonSchema : undefined
  if (direct) return direct
  try {
    return getActiveSchemaForKind(kind).jsonSchema
  } catch {
    return undefined
  }
}
