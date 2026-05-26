import { getDraftDomainModel } from '../../../src/shared/domain/draftDomainModel'
import { getRequiredString } from './utils'
import { hydrateDraftSeedData } from './seedHydration'
import {
  buildDraftModelReviewRoute,
  normalizeDraftModelInclude,
  normalizeDraftModelKind,
  normalizeDraftModelTarget,
  normalizeDraftSeedMode,
} from './target'

export async function getDraftModelContract(args: Record<string, unknown>): Promise<unknown> {
  const kind = normalizeDraftModelKind(getRequiredString(args, 'kind'))
  const model = getDraftDomainModel(kind)
  if (!model) throw new Error(`Unsupported draft model kind: ${kind}`)
  const target = normalizeDraftModelTarget(model.targetEntityType, args.target)
  const mode = normalizeDraftSeedMode(args.seedMode, model.seed.defaultMode)
  if (!model.seed.allowedModes.includes(mode)) {
    throw new Error(`seedMode ${mode} is not allowed for ${kind}`)
  }
  const include = normalizeDraftModelInclude(args.include, model.seed.include)
  const shouldHydrate = args.hydrate === undefined ? mode !== 'empty' : args.hydrate === true
  const seedData = shouldHydrate && mode !== 'empty'
    ? await hydrateDraftSeedData(kind, target, include)
    : undefined
  const reviewRoute = buildDraftModelReviewRoute(model.routes.reviewTemplate, target)
  const modelRef = `frontend:DraftDomainModel:${kind}:v1`
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
