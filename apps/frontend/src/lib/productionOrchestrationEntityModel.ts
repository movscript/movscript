import type { SemanticEntityRecord } from '@/api/semanticEntities'

export type ProductionOrchestrationEntityFilter =
  | 'all'
  | 'segments'
  | 'sceneMoments'
  | 'writingExpressions'
  | 'creativeReferences'
  | 'assetSlots'
  | 'contentUnits'

export type ProductionOrchestrationCreateDefaults = Record<string, string | number | boolean | null>

export type ProductionOrchestrationOwnerRecord = SemanticEntityRecord & {
  owner_type?: unknown
  owner_id?: unknown
  creative_reference_id?: unknown
}

export interface ProductionOrchestrationLookup<
  TSegment extends SemanticEntityRecord,
  TSceneMoment extends SemanticEntityRecord,
  TCreativeReference extends SemanticEntityRecord,
  TUsage extends ProductionOrchestrationOwnerRecord,
  TAssetSlot extends ProductionOrchestrationOwnerRecord,
  TContentUnit extends SemanticEntityRecord,
> {
  scriptText: string
  scriptVersionTitle: string
  segmentById: Map<number, TSegment>
  sceneMomentById: Map<number, TSceneMoment>
  contentUnitById: Map<number, TContentUnit>
  creativeReferenceById: Map<number, TCreativeReference>
  usagesByOwnerKey: Map<string, TUsage[]>
  usagesByReferenceId: Map<number, TUsage[]>
  assetSlotsByOwnerKey: Map<string, TAssetSlot[]>
  assetSlotsByReferenceId: Map<number, TAssetSlot[]>
}

export function createProductionOrchestrationDefaultsForType(
  type: ProductionOrchestrationEntityFilter,
  productionId: number,
  segmentId?: number,
  sceneMomentId?: number,
): ProductionOrchestrationCreateDefaults {
  if (type === 'assetSlots') return { status: 'missing', production_id: productionId || 0, owner_type: segmentId ? 'segment' : '', owner_id: segmentId ?? null }
  if (type === 'contentUnits') return { status: 'draft', production_id: productionId || 0, segment_id: segmentId ?? null, scene_moment_id: sceneMomentId ?? null }
  if (type === 'segments') return { status: 'draft', kind: 'emotional_function', production_id: productionId || 0 }
  if (type === 'sceneMoments') return { status: 'draft', segment_id: segmentId ?? null }
  if (type === 'writingExpressions') return { scene_moment_id: sceneMomentId ?? null, kind: 'dialogue', order: 1 }
  if (type === 'creativeReferences') return { status: 'draft', importance: 'main' }
  return {}
}

export function buildProductionOrchestrationLookup<
  TSegment extends SemanticEntityRecord,
  TSceneMoment extends SemanticEntityRecord,
  TCreativeReference extends SemanticEntityRecord,
  TUsage extends ProductionOrchestrationOwnerRecord,
  TAssetSlot extends ProductionOrchestrationOwnerRecord,
  TContentUnit extends SemanticEntityRecord,
>(input: {
  scriptText: string
  scriptVersionTitle: string
  segments: TSegment[]
  sceneMoments: TSceneMoment[]
  creativeReferences: TCreativeReference[]
  creativeReferenceUsages: TUsage[]
  assetSlots: TAssetSlot[]
  contentUnits: TContentUnit[]
}): ProductionOrchestrationLookup<TSegment, TSceneMoment, TCreativeReference, TUsage, TAssetSlot, TContentUnit> {
  const usagesByOwnerKey = new Map<string, TUsage[]>()
  const usagesByReferenceId = new Map<number, TUsage[]>()
  const assetSlotsByOwnerKey = new Map<string, TAssetSlot[]>()
  const assetSlotsByReferenceId = new Map<number, TAssetSlot[]>()

  for (const usage of input.creativeReferenceUsages) {
    if (usage.owner_type && usage.owner_id) {
      pushGroupedRecord(usagesByOwnerKey, productionOrchestrationOwnerKey(String(usage.owner_type), Number(usage.owner_id)), usage)
    }
    if (usage.creative_reference_id) {
      pushGroupedRecord(usagesByReferenceId, Number(usage.creative_reference_id), usage)
    }
  }

  for (const slot of input.assetSlots) {
    if (slot.owner_type && slot.owner_id) {
      pushGroupedRecord(assetSlotsByOwnerKey, productionOrchestrationOwnerKey(String(slot.owner_type), Number(slot.owner_id)), slot)
    }
    if (slot.creative_reference_id) {
      pushGroupedRecord(assetSlotsByReferenceId, Number(slot.creative_reference_id), slot)
    }
  }

  return {
    scriptText: input.scriptText,
    scriptVersionTitle: input.scriptVersionTitle,
    segmentById: new Map(input.segments.map((item) => [item.ID, item])),
    sceneMomentById: new Map(input.sceneMoments.map((item) => [item.ID, item])),
    contentUnitById: new Map(input.contentUnits.map((item) => [item.ID, item])),
    creativeReferenceById: new Map(input.creativeReferences.map((item) => [item.ID, item])),
    usagesByOwnerKey,
    usagesByReferenceId,
    assetSlotsByOwnerKey,
    assetSlotsByReferenceId,
  }
}

export function productionOrchestrationOwnerKey(ownerType: string, ownerId: number) {
  return `${ownerType}:${ownerId}`
}

function pushGroupedRecord<T>(map: Map<string | number, T[]>, key: string | number, value: T) {
  const list = map.get(key) ?? []
  list.push(value)
  map.set(key, list)
}
