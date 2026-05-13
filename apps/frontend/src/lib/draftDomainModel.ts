import { getActiveSchemaForKind, type JSONSchema7 } from '@movscript/draft-schemas'
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

export const DRAFT_DOMAIN_MODELS: Partial<Record<AgentDraftKind, DraftDomainModel>> = {
  project_proposal: {
    kind: 'project_proposal',
    title: 'Project proposal',
    targetEntityType: 'project',
    contentSchemaId: 'movscript.project_proposal.v1',
    seed: {
      defaultMode: 'editable_snapshot',
      allowedModes: ['empty', 'snapshot', 'editable_snapshot'],
      include: ['project', 'creative_references', 'asset_slots', 'asset_slot_ownership'],
      maxDepth: 2,
      conflictKeys: ['project.updatedAt', 'creative_references[].updatedAt', 'asset_slots[].updatedAt'],
    },
    fieldGuide: {
      owns: ['creative_references', 'asset_slots', 'asset_slot_ownership', 'reuse_candidates', 'merge_candidates'],
      references: ['project'],
      forbids: ['production_segments', 'scene_moments', 'content_units', 'media_generation_jobs', 'generated_resource_bindings'],
    },
    applyBoundary: {
      backendApply: 'project_proposal',
      writableEntityTypes: ['creative_reference', 'asset_slot'],
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
        'creative_reference_usages',
        'asset_slot_usages',
        'unresolved_requirements',
      ],
      maxDepth: 3,
      conflictKeys: ['production.updatedAt', 'production_script_brief.scriptVersionUpdatedAt', 'project_scripts[].UpdatedAt', 'segments[].updatedAt', 'scene_moments[].updatedAt'],
    },
    fieldGuide: {
      owns: ['segments', 'scene_moments', 'production_local_requirements'],
      references: ['project', 'creative_references', 'asset_slots', 'creative_reference_usages', 'asset_slot_usages'],
      forbids: ['new_project_level_creative_references', 'new_project_level_asset_slots', 'final_media_generation_jobs'],
    },
    applyBoundary: {
      backendApply: 'production_proposal',
      writableEntityTypes: ['segment', 'scene_moment', 'creative_reference_usage', 'asset_slot_usage'],
    },
    routes: {
      fallback: '/production-orchestrate',
      reviewTemplate: '/production-orchestrate?productionId=:targetEntityId&draftId=:draftId',
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
  asset_proposal: {
    kind: 'asset_proposal',
    title: 'Asset proposal',
    targetEntityType: 'asset_slot',
    contentSchemaId: 'movscript.asset_proposal.v1',
    seed: {
      defaultMode: 'editable_snapshot',
      allowedModes: ['empty', 'snapshot', 'editable_snapshot'],
      include: ['asset_slot', 'asset_need', 'reference_resources'],
      maxDepth: 2,
      conflictKeys: ['asset_slot.updatedAt', 'reference_resources[].UpdatedAt'],
    },
    fieldGuide: {
      owns: ['candidate_plan', 'acceptance_criteria', 'risks'],
      references: ['asset_slot', 'reference_resources'],
      forbids: ['generation_job_submission', 'resource_binding_apply'],
    },
    applyBoundary: {
      backendApply: 'draft_only',
      writableEntityTypes: ['asset_slot'],
    },
    routes: {
      fallback: '/asset-slots',
      reviewTemplate: '/asset-slots?draftId=:draftId&asset_slot_id=:targetEntityId',
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

  if (draft.kind === 'project_proposal' || sourceEntityType === 'project' || targetEntityType === 'project') {
    return `/project-workspace?draftId=${encodeURIComponent(draft.id)}`
  }

  if (draft.kind === 'asset_proposal' || sourceEntityType === 'asset_slot' || targetEntityType === 'asset_slot') {
    const assetSlotId = sourceEntityId ?? targetEntityId
    const params = new URLSearchParams({ draftId: draft.id })
    if (assetSlotId !== undefined) params.set('asset_slot_id', String(assetSlotId))
    return `/asset-slots?${params.toString()}`
  }

  const productionId = sourceEntityId ?? targetEntityId
  if (
    productionId !== undefined
    && (
      draft.kind === 'production_proposal'
      || sourceEntityType === 'production'
      || targetEntityType === 'production'
      || productionRelatedKinds.includes(draft.kind)
    )
  ) {
    return `/production-orchestrate?productionId=${productionId}&draftId=${encodeURIComponent(draft.id)}`
  }

  return null
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
