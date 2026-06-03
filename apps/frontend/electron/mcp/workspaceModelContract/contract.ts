import { getWorkspaceDomainModel } from '../../../src/shared/domain/workspaceDomainModel'
import { getRequiredString } from './utils'
import { hydrateWorkspaceSeedData } from './seedHydration'
import {
  buildWorkspaceModelReviewRoute,
  normalizeWorkspaceModelInclude,
  normalizeWorkspaceModelKind,
  normalizeWorkspaceModelTarget,
  normalizeWorkspaceSeedMode,
} from './target'

export async function getWorkspaceModelContract(args: Record<string, unknown>): Promise<unknown> {
  const kind = normalizeWorkspaceModelKind(getRequiredString(args, 'kind'))
  const model = getWorkspaceDomainModel(kind)
  if (!model) throw new Error(`Unsupported workspace model kind: ${kind}`)
  const target = normalizeWorkspaceModelTarget(model.targetEntityType, args.target)
  const mode = normalizeWorkspaceSeedMode(args.seedMode, model.seed.defaultMode)
  if (!model.seed.allowedModes.includes(mode)) {
    throw new Error(`seedMode ${mode} is not allowed for ${kind}`)
  }
  const include = normalizeWorkspaceModelInclude(args.include, model.seed.include)
  const shouldHydrate = args.hydrate === undefined ? mode !== 'empty' : args.hydrate === true
  const seedData = shouldHydrate && mode !== 'empty'
    ? await hydrateWorkspaceSeedData(kind, target, include)
    : undefined
  const reviewRoute = buildWorkspaceModelReviewRoute(model.routes.reviewTemplate, target)
  const modelRef = `frontend:WorkspaceModel:${kind}:v1`
  return {
    contractVersion: 1,
    kind,
    title: model.title,
    targetEntityType: model.targetEntityType,
    target,
    seedPolicy: {
      mode,
      defaultMode: model.seed.defaultMode,
      allowedModes: model.seed.allowedModes,
      include,
      allowedInclude: model.seed.include,
      ...(model.seed.maxDepth !== undefined ? { maxDepth: model.seed.maxDepth } : {}),
      conflictKeys: model.seed.conflictKeys,
    },
    seed: {
      mode,
      include,
      hydrated: !!seedData,
      hydratedAt: new Date().toISOString(),
      modelRef,
      ...(seedData ? { data: seedData.data, sourceVersions: seedData.sourceVersions } : {}),
      ...(seedData?.warnings && seedData.warnings.length > 0 ? { warnings: seedData.warnings } : {}),
    },
    workspaceProtocol: {
      owner: 'frontend',
      open: {
        contentRequired: false,
        initialContentSource: 'mcp.initialContent',
      },
      validation: {
        effectsRequiredBeforeSave: true,
      },
      save: {
        boundary: model.applyBoundary.backendApply,
      },
    },
    initialContent: buildInitialWorkspaceContent(kind, target, seedData?.data),
    ...(model.contentSchemaId ? { contentSchemaId: model.contentSchemaId } : {}),
    ...(model.contentSchema ? { contentSchema: model.contentSchema } : {}),
    fieldGuide: model.fieldGuide,
    applyBoundary: model.applyBoundary,
    reviewRouteTemplate: model.routes.reviewTemplate,
    reviewRoute,
    modelRef,
  }
}

function buildInitialWorkspaceContent(
  kind: ReturnType<typeof normalizeWorkspaceModelKind>,
  target: ReturnType<typeof normalizeWorkspaceModelTarget>,
  seedData: unknown,
): Record<string, unknown> {
  const data = isRecord(seedData) ? seedData : {}
  if (kind === 'setting_workspace') {
    return {
      schema: 'movscript.setting_workspace.v1',
      scope: 'setting_workspace',
      mode: 'snapshot',
      workspace: {
        creative_references: Array.isArray(data.creative_references) ? data.creative_references : [],
      },
      summary: '',
    }
  }
  if (kind === 'asset_workspace') {
    return {
      schema: 'movscript.asset_workspace.v1',
      scope: 'asset_workspace',
      mode: 'snapshot',
      workspace: {
        creative_references: [],
        asset_slots: Array.isArray(data.asset_slots) ? data.asset_slots : [],
        candidate_plans: [],
      },
      summary: '',
    }
  }
  if (kind === 'project_standards_workspace') {
    return {
      schema: 'movscript.project_standards_workspace.v1',
      scope: 'project_standards_workspace',
      mode: 'snapshot',
      workspace: {
        project_style: projectStyleSeed(data),
      },
      impact_notes: [],
      summary: '',
    }
  }
  if (kind === 'production_workspace') {
    return {
      schema: 'movscript.production_workspace.v1',
      scope: 'production_workspace',
      mode: 'snapshot',
      productionId: numericId(target.entityId) ?? numericId(data.production_id) ?? numericId(data.productionId) ?? 0,
      workspaceScope: 'production',
      workspace: {
        segments: Array.isArray(data.segments) ? data.segments : [],
      },
      impact_notes: [],
      summary: '',
    }
  }
  return {
    schema: 'movscript.content_unit_workspace.v1',
    scope: 'content_unit_workspace',
    productionId: numericId(data.production_id) ?? numericId(data.productionId) ?? 0,
    ...(numericId(data.segment_id) !== undefined ? { segmentId: numericId(data.segment_id) } : {}),
    ...(numericId(target.entityId) !== undefined ? { sceneMomentId: numericId(target.entityId) } : {}),
    workspace: {
      units: Array.isArray(data.content_units) ? data.content_units : [],
    },
    summary: '',
  }
}

function projectStyleSeed(data: Record<string, unknown>): Record<string, unknown> {
  const project = isRecord(data.project) ? data.project : data
  const style = project.project_style ?? project.projectStyle ?? project.style
  return isRecord(style) ? style : {}
}

function numericId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
