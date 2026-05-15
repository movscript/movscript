import { getActiveSchemaForKind, type JSONSchema7 } from '@movscript/draft-schemas'
import type { AgentTaskArtifactRef } from '@/lib/agentArtifacts'
import type { AgentDraft, AgentDraftKind } from '@/lib/localAgentClient'

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
    backendApply: 'project_proposal' | 'production_proposal' | 'draft_only'
    writableEntityTypes: string[]
  }
  routes: {
    fallback: string
    reviewTemplate: string
  }
}

const productionRelatedKinds: AgentDraftKind[] = [
  'production_proposal',
  'pipeline',
  'segment',
  'scene_moment',
  'content_unit',
  'asset_slot',
  'storyboard_line',
]

const contentUnitRelatedKinds: AgentDraftKind[] = [
  'content_unit_proposal',
  'content_unit_media_proposal',
  'content_unit',
]

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
      backendApply: 'project_proposal',
      writableEntityTypes: ['creative_reference'],
    },
    routes: {
      fallback: '/pre-production',
      reviewTemplate: '/pre-production?view=review&draftId=:draftId',
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
      owns: ['asset_slots', 'asset_slot_ownership', 'candidate_plan', 'acceptance_criteria', 'risks'],
      references: ['project', 'creative_references', 'asset_slot', 'reference_resources'],
      forbids: ['creative_reference_edits', 'media_generation_jobs', 'generated_resource_bindings', 'resource_binding_apply'],
    },
    applyBoundary: {
      backendApply: 'project_proposal',
      writableEntityTypes: ['asset_slot'],
    },
    routes: {
      fallback: '/pre-production',
      reviewTemplate: '/pre-production?view=review&draftId=:draftId',
    },
  },
  project_proposal: {
    kind: 'project_proposal',
    title: 'Project standards proposal',
    targetEntityType: 'project',
    contentSchemaId: 'movscript.project_proposal.v1',
    seed: {
      defaultMode: 'editable_snapshot',
      allowedModes: ['empty', 'snapshot', 'editable_snapshot'],
      include: ['project'],
      maxDepth: 2,
      conflictKeys: ['project.updatedAt'],
    },
    fieldGuide: {
      owns: ['project_style', 'shot_size_system', 'aspect_ratio', 'camera_language', 'visual_style', 'lighting_style', 'color_palette', 'pacing_rules', 'negative_rules'],
      references: ['project'],
      forbids: ['creative_reference_lists', 'asset_requirement_lists', 'asset_candidate_plans', 'production_segments', 'scene_moments', 'content_units', 'media_generation_jobs', 'generated_resource_bindings'],
    },
    applyBoundary: {
      backendApply: 'project_proposal',
      writableEntityTypes: ['project'],
    },
    routes: {
      fallback: '/project-workspace',
      reviewTemplate: '/project-workspace?draftId=:draftId',
    },
  },
  production_proposal: {
    kind: 'production_proposal',
    title: 'Production proposal',
    targetEntityType: 'production',
    contentSchemaId: 'movscript.production_proposal.v1',
    seed: {
      defaultMode: 'snapshot',
      allowedModes: ['empty', 'snapshot'],
      include: [
        'production',
        'production_script_brief',
        'project_scripts',
        'segments',
        'scene_moments',
        'content_units',
        'keyframes',
        'creative_reference_usages',
        'asset_slot_usages',
        'unresolved_requirements',
      ],
      maxDepth: 3,
      conflictKeys: ['production.updatedAt', 'production_script_brief.scriptVersionUpdatedAt', 'project_scripts[].UpdatedAt', 'segments[].updatedAt', 'scene_moments[].updatedAt', 'content_units[].updatedAt', 'keyframes[].updatedAt'],
    },
    fieldGuide: {
      owns: ['snapshot.proposal.segments', 'snapshot.proposal.segments[].scene_moments', 'snapshot.proposal.segments[].scene_moments[].content_units', 'snapshot.proposal.segments[].scene_moments[].keyframes', 'production_local_requirements'],
      references: ['project', 'creative_references', 'asset_slots', 'creative_reference_usages', 'asset_slot_usages'],
      forbids: ['action_patch_payloads', 'new_project_level_creative_references', 'new_project_level_asset_slots', 'final_media_generation_jobs'],
    },
    applyBoundary: {
      backendApply: 'production_proposal',
      writableEntityTypes: ['segment', 'scene_moment', 'content_unit', 'keyframe', 'creative_reference_usage', 'asset_slot_usage'],
    },
    routes: {
      fallback: '/production-orchestrate',
      reviewTemplate: '/production-orchestrate?productionId=:targetEntityId&draftId=:draftId',
    },
  },
  content_unit_proposal: {
    kind: 'content_unit_proposal',
    title: 'Content unit proposal',
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
      owns: ['content_units'],
      references: ['production', 'segments', 'scene_moments', 'creative_references', 'asset_slots'],
      forbids: ['operation_fields', 'media_generation_jobs', 'generated_resource_bindings', 'project_level_creative_references', 'project_level_asset_slots'],
    },
    applyBoundary: {
      backendApply: 'draft_only',
      writableEntityTypes: ['content_unit'],
    },
    routes: {
      fallback: '/content-unit-orchestrate',
      reviewTemplate: '/content-unit-orchestrate?scene_moment_id=:targetEntityId&draftId=:draftId',
    },
  },
  content_unit_media_proposal: {
    kind: 'content_unit_media_proposal',
    title: 'Content unit media proposal',
    targetEntityType: 'content_unit',
    contentSchemaId: 'movscript.content_unit_media_proposal.v1',
    seed: {
      defaultMode: 'snapshot',
      allowedModes: ['empty', 'snapshot'],
      include: ['content_unit', 'scene_moments', 'asset_slots', 'reference_resources'],
      maxDepth: 2,
      conflictKeys: ['content_unit.updatedAt', 'scene_moments[].updatedAt', 'asset_slots[].updatedAt', 'reference_resources[].UpdatedAt'],
    },
    fieldGuide: {
      owns: ['media_plans', 'acceptance_criteria'],
      references: ['content_unit', 'scene_moments', 'asset_slots', 'reference_resources'],
      forbids: ['generation_job_submission', 'resource_binding_apply', 'final_media_generation_jobs'],
    },
    applyBoundary: {
      backendApply: 'draft_only',
      writableEntityTypes: ['keyframe', 'preview_timeline'],
    },
    routes: {
      fallback: '/contents',
      reviewTemplate: '/contents?content_unit_id=:targetEntityId&draftId=:draftId',
    },
  },
  script_split_proposal: {
    kind: 'script_split_proposal',
    title: 'Script split proposal',
    targetEntityType: 'script_source',
    contentSchemaId: 'movscript.script_split_proposal.v1',
    seed: {
      defaultMode: 'editable_snapshot',
      allowedModes: ['empty', 'snapshot', 'editable_snapshot'],
      include: ['source_script', 'project_scripts', 'productions'],
      maxDepth: 2,
      conflictKeys: ['source_script.hash', 'project_scripts[].UpdatedAt'],
    },
    fieldGuide: {
      owns: ['episode_drafts', 'script_split_plan'],
      references: ['source_script', 'project_scripts', 'productions'],
      forbids: ['raw_script_body_copy', 'production_entity_apply_without_review'],
    },
    applyBoundary: {
      backendApply: 'draft_only',
      writableEntityTypes: ['script', 'production'],
    },
    routes: {
      fallback: '/workbench/script',
      reviewTemplate: '/workbench/script?draftId=:draftId',
    },
  },
}

export function getDraftDomainModel(kind: AgentDraftKind): DraftDomainModel | null {
  const model = DRAFT_DOMAIN_MODELS[kind]
  if (!model) return null
  return {
    ...model,
    ...(model.contentSchemaId ? { contentSchema: getActiveSchemaForKind(kind).jsonSchema } : {}),
  }
}

export function buildDraftReviewPath(draft: AgentDraft): string | null {
  const source = isRecord(draft.source) ? draft.source : undefined
  const target = isRecord(draft.target) ? draft.target : undefined
  const sourceEntityType = stringValue(source?.entityType)
  const targetEntityType = stringValue(target?.entityType)
  const sourceEntityId = numberValue(source?.entityId)
  const targetEntityId = numberValue(target?.entityId)

  if (draft.kind === 'script_split_proposal') {
    return `/workbench/script?draftId=${encodeURIComponent(draft.id)}`
  }

  if (draft.kind === 'setting_proposal') {
    return `/pre-production?view=review&draftId=${encodeURIComponent(draft.id)}`
  }

  if (draft.kind === 'asset_proposal') {
    const assetSlotId = sourceEntityId ?? targetEntityId
    const params = new URLSearchParams({ view: 'review', draftId: draft.id })
    if (assetSlotId !== undefined) params.set('asset_slot_id', String(assetSlotId))
    return `/pre-production?${params.toString()}`
  }

  if (sourceEntityType === 'asset_slot' || targetEntityType === 'asset_slot') {
    const assetSlotId = sourceEntityId ?? targetEntityId
    const params = new URLSearchParams({ draftId: draft.id })
    if (assetSlotId !== undefined) params.set('asset_slot_id', String(assetSlotId))
    return `/pre-production?${params.toString()}`
  }

  if (draft.kind === 'project_proposal' || sourceEntityType === 'project' || targetEntityType === 'project') {
    return `/project-workspace?draftId=${encodeURIComponent(draft.id)}`
  }

  if (draft.kind === 'content_unit_media_proposal' || targetEntityType === 'content_unit' || sourceEntityType === 'content_unit') {
    const contentUnitId = sourceEntityId ?? targetEntityId
    const params = new URLSearchParams({ draftId: draft.id })
    if (contentUnitId !== undefined) params.set('content_unit_id', String(contentUnitId))
    return `/contents?${params.toString()}`
  }

  if (draft.kind === 'content_unit_proposal') {
    const sceneMomentId = sourceEntityId ?? targetEntityId
    const params = new URLSearchParams({ draftId: draft.id })
    if ((sourceEntityType === 'scene_moment' || targetEntityType === 'scene_moment') && sceneMomentId !== undefined) {
      params.set('scene_moment_id', String(sceneMomentId))
    } else if ((sourceEntityType === 'production' || targetEntityType === 'production') && sceneMomentId !== undefined) {
      params.set('productionId', String(sceneMomentId))
    }
    return `/content-unit-orchestrate?${params.toString()}`
  }

  const productionId = sourceEntityId ?? targetEntityId
  if (
    productionId !== undefined
    && (
      draft.kind === 'production_proposal'
      || sourceEntityType === 'production'
      || targetEntityType === 'production'
      || productionRelatedKinds.includes(draft.kind)
      || contentUnitRelatedKinds.includes(draft.kind)
    )
  ) {
    return `/production-orchestrate?productionId=${productionId}&draftId=${encodeURIComponent(draft.id)}`
  }

  return null
}

export function buildDraftArtifactReviewPath(artifact: AgentTaskArtifactRef): string | null {
  if (!artifact.draftKind) return null
  return buildDraftReviewPath({
    id: artifact.draftId,
    ...(artifact.projectId !== undefined ? { projectId: artifact.projectId } : {}),
    kind: artifact.draftKind,
    title: artifact.title ?? artifact.draftId,
    content: '',
    status: 'draft',
    ...(artifact.source ? { source: artifact.source } : {}),
    ...(artifact.target ? { target: artifact.target } : {}),
    ...(artifact.metadata ? { metadata: artifact.metadata } : {}),
    createdAt: artifact.updatedAt ?? '',
    updatedAt: artifact.updatedAt ?? '',
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}
