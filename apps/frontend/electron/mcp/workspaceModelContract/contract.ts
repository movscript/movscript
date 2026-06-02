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
    ...(model.contentSchemaId ? { contentSchemaId: model.contentSchemaId } : {}),
    ...(model.contentSchema ? { contentSchema: model.contentSchema } : {}),
    fieldGuide: model.fieldGuide,
    applyBoundary: model.applyBoundary,
    reviewRouteTemplate: model.routes.reviewTemplate,
    reviewRoute,
    modelRef,
  }
}
