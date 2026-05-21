import type { ScriptVersion } from '@/api/scriptVersions'
import type { ProposalSegmentNode } from '@/lib/productionProposalReviewModel'

export interface ProductionDraftSeedEntity {
  ID: number
  UpdatedAt?: string
  [key: string]: unknown
}

export function buildProductionDraftSeedMetadata(input: {
  projectId: number
  production?: (ProductionDraftSeedEntity & { script_version_id?: number; name?: string }) | null
  productionSnapshot?: { segments: ProposalSegmentNode[] }
  scriptVersion?: ScriptVersion | null
  projectScripts: ScriptVersion[]
  modelRef: string
}) {
  const body = (input.scriptVersion?.content || input.scriptVersion?.raw_source || '').trim()
  return {
    mode: 'snapshot',
    include: ['production', 'production_script_brief', 'project_scripts'],
    hydrated: true,
    hydratedAt: new Date().toISOString(),
    modelRef: input.modelRef,
    data: {
      production: input.production ? summarizeDraftSeedEntity(input.production) : null,
      production_snapshot: input.productionSnapshot ?? { segments: [] },
      production_script_brief: {
        productionId: input.production?.ID,
        scriptVersionId: input.scriptVersion?.ID,
        scriptVersionTitle: input.scriptVersion?.title,
        scriptVersionUpdatedAt: input.scriptVersion?.UpdatedAt,
        brief: String(input.production?.description || input.scriptVersion?.summary || ''),
        body_length: body.length,
      },
      project_scripts: input.projectScripts.map((script) => ({
        ID: script.ID,
        project_id: script.project_id,
        script_id: script.script_id,
        title: script.title,
        source_type: script.source_type,
        summary: script.summary,
        status: script.status,
        UpdatedAt: script.UpdatedAt,
      })),
    },
    sourceVersions: {
      production: input.production ? { id: input.production.ID, updatedAt: input.production.UpdatedAt } : null,
      production_snapshot: {
        segmentCount: input.productionSnapshot?.segments.length ?? 0,
        sceneMomentCount: input.productionSnapshot?.segments.reduce((sum, segment) => sum + (segment.scene_moments?.length ?? 0), 0) ?? 0,
      },
      production_script_brief: input.scriptVersion ? { id: input.scriptVersion.ID, updatedAt: input.scriptVersion.UpdatedAt } : null,
      project_scripts: input.projectScripts.map((script) => ({ id: script.ID, updatedAt: script.UpdatedAt })),
    },
    target: {
      projectId: input.projectId,
      entityType: 'production',
      entityId: input.production?.ID,
    },
  }
}

function summarizeDraftSeedEntity(record: ProductionDraftSeedEntity): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of ['ID', 'project_id', 'script_version_id', 'name', 'title', 'description', 'status', 'source_type', 'UpdatedAt']) {
    if (record[key] !== undefined) out[key] = record[key]
  }
  return out
}
