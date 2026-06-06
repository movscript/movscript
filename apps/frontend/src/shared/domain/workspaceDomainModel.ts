import { getActiveSchemaForKind, getWorkspaceSchemaEntry, type JSONSchema7 } from '@movscript/workspaces'
import type { MovScriptWorkspaceKind } from '@/shared/contracts/movscriptWorkspace'

export type WorkspaceSeedMode = 'empty' | 'snapshot' | 'editable_snapshot'

export interface WorkspaceDomainModel {
  kind: MovScriptWorkspaceKind
  title: string
  targetEntityType: string
  contentSchemaId?: string
  contentSchema?: JSONSchema7
  seed: {
    defaultMode: WorkspaceSeedMode
    allowedModes: WorkspaceSeedMode[]
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
    backendApply: 'project_standards_workspace' | 'setting_workspace' | 'asset_workspace' | 'production_workspace' | 'workspace_only'
    writableEntityTypes: string[]
  }
  routes: {
    fallback: string
    reviewTemplate: string
  }
}

export const WORKSPACE_DOMAIN_MODELS: Partial<Record<MovScriptWorkspaceKind, WorkspaceDomainModel>> = {
  setting_workspace: {
    kind: 'setting_workspace',
    title: 'Setting workspace',
    targetEntityType: 'project',
    contentSchemaId: 'movscript.setting_workspace.v1',
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
      backendApply: 'setting_workspace',
      writableEntityTypes: ['creative_reference'],
    },
    routes: {
      fallback: '/project/pre-production',
      reviewTemplate: '/project/pre-production?view=review&workspaceId=:workspaceId',
    },
  },
  asset_workspace: {
    kind: 'asset_workspace',
    title: 'Asset workspace',
    targetEntityType: 'project',
    contentSchemaId: 'movscript.asset_workspace.v1',
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
      backendApply: 'asset_workspace',
      writableEntityTypes: ['asset_slot'],
    },
    routes: {
      fallback: '/project/pre-production',
      reviewTemplate: '/project/pre-production?view=review&workspaceId=:workspaceId',
    },
  },
  project_standards_workspace: {
    kind: 'project_standards_workspace',
    title: 'Project standards workspace',
    targetEntityType: 'project',
    contentSchemaId: 'movscript.project_standards_workspace.v1',
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
      backendApply: 'project_standards_workspace',
      writableEntityTypes: ['project'],
    },
    routes: {
      fallback: '/project/standards',
      reviewTemplate: '/project/standards?workspaceId=:workspaceId',
    },
  },
  production_workspace: {
    kind: 'production_workspace',
    title: 'Production workspace',
    targetEntityType: 'production',
    contentSchemaId: 'movscript.production_workspace.v1',
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
      owns: ['snapshot.workspace.segments', 'snapshot.workspace.segments[].scene_moments', 'snapshot.workspace.segments[].scene_moments[].writing_expressions'],
      references: ['project', 'creative_references', 'creative_reference_usages'],
      forbids: ['action_patch_payloads', 'new_project_level_creative_references', 'new_project_level_asset_slots', 'content_units', 'keyframes', 'asset_slots', 'final_media_generation_jobs'],
    },
    applyBoundary: {
      backendApply: 'production_workspace',
      writableEntityTypes: ['segment', 'scene_moment', 'writing_expression', 'creative_reference_usage'],
    },
    routes: {
      fallback: '/project/production/orchestration',
      reviewTemplate: '/project/production/orchestration?productionId=:targetEntityId&workspaceId=:workspaceId',
    },
  },
  content_unit_workspace: {
    kind: 'content_unit_workspace',
    title: 'Production item workspace',
    targetEntityType: 'scene_moment',
    contentSchemaId: 'movscript.content_unit_workspace.v1',
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
      backendApply: 'workspace_only',
      writableEntityTypes: ['content_unit'],
    },
    routes: {
      fallback: '/project/content-units/workbench',
      reviewTemplate: '/project/content-units/workbench?view=review&scene_moment_id=:targetEntityId&workspaceId=:workspaceId',
    },
  },
}

export function getWorkspaceDomainModel(kind: MovScriptWorkspaceKind): WorkspaceDomainModel | null {
  const model = WORKSPACE_DOMAIN_MODELS[kind]
  if (!model) return null
  const schema = resolveWorkspaceContentSchema(kind, model.contentSchemaId)
  return {
    ...model,
    ...(schema ? { contentSchema: schema } : {}),
  }
}

function resolveWorkspaceContentSchema(kind: MovScriptWorkspaceKind, schemaId?: string): JSONSchema7 | undefined {
  const direct = schemaId ? getWorkspaceSchemaEntry(schemaId)?.jsonSchema : undefined
  if (direct) return direct
  try {
    return getActiveSchemaForKind(kind).jsonSchema
  } catch {
    return undefined
  }
}
