export type ProductionEntityRecordLike = {
  ID: number
  [key: string]: unknown
}

export type ProductionOrchestrationEntityFilter =
  | 'all'
  | 'segments'
  | 'sceneMoments'
  | 'writingExpressions'
  | 'settings'
  | 'assetSlots'
  | 'contentUnits'

export type ProductionOrchestrationCreateDefaults = Record<string, string | number | boolean | null>

export type ProductionOrchestrationOwnerRecord = ProductionEntityRecordLike & {
  owner_type?: unknown
  owner_id?: unknown
  setting_id?: unknown
}

export interface ProductionOrchestrationLookup<
  TSegment extends ProductionEntityRecordLike,
  TSceneMoment extends ProductionEntityRecordLike,
  TSetting extends ProductionEntityRecordLike,
  TUsage extends ProductionOrchestrationOwnerRecord,
  TAssetSlot extends ProductionOrchestrationOwnerRecord,
  TContentUnit extends ProductionEntityRecordLike,
> {
  scriptText: string
  scriptVersionTitle: string
  segmentById: Map<number, TSegment>
  sceneMomentById: Map<number, TSceneMoment>
  contentUnitById: Map<number, TContentUnit>
  settingById: Map<number, TSetting>
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
  if (type === 'assetSlots') return { production_id: productionId || 0, owner_type: segmentId ? 'segment' : '', owner_id: segmentId ?? null }
  if (type === 'contentUnits') return { production_id: productionId || 0, segment_id: segmentId ?? null, scene_moment_id: sceneMomentId ?? null }
  if (type === 'segments') return { kind: 'emotional_function', production_id: productionId || 0 }
  if (type === 'sceneMoments') return { production_id: productionId || 0, segment_id: segmentId ?? null }
  if (type === 'writingExpressions') return { scene_moment_id: sceneMomentId ?? null, kind: 'dialogue', order: 1 }
  if (type === 'settings') return { importance: 'main' }
  return {}
}

export function buildProductionOrchestrationLookup<
  TSegment extends ProductionEntityRecordLike,
  TSceneMoment extends ProductionEntityRecordLike,
  TSetting extends ProductionEntityRecordLike,
  TUsage extends ProductionOrchestrationOwnerRecord,
  TAssetSlot extends ProductionOrchestrationOwnerRecord,
  TContentUnit extends ProductionEntityRecordLike,
>(input: {
  scriptText: string
  scriptVersionTitle: string
  segments: TSegment[]
  sceneMoments: TSceneMoment[]
  settings: TSetting[]
  settingUsages: TUsage[]
  assetSlots: TAssetSlot[]
  contentUnits: TContentUnit[]
}): ProductionOrchestrationLookup<TSegment, TSceneMoment, TSetting, TUsage, TAssetSlot, TContentUnit> {
  const usagesByOwnerKey = new Map<string, TUsage[]>()
  const usagesByReferenceId = new Map<number, TUsage[]>()
  const assetSlotsByOwnerKey = new Map<string, TAssetSlot[]>()
  const assetSlotsByReferenceId = new Map<number, TAssetSlot[]>()

  for (const usage of input.settingUsages) {
    if (usage.owner_type && usage.owner_id) {
      pushGroupedRecord(usagesByOwnerKey, productionOrchestrationOwnerKey(String(usage.owner_type), Number(usage.owner_id)), usage)
    }
    if (usage.setting_id) {
      pushGroupedRecord(usagesByReferenceId, Number(usage.setting_id), usage)
    }
  }

  for (const slot of input.assetSlots) {
    if (slot.owner_type && slot.owner_id) {
      pushGroupedRecord(assetSlotsByOwnerKey, productionOrchestrationOwnerKey(String(slot.owner_type), Number(slot.owner_id)), slot)
    }
    if (slot.setting_id) {
      pushGroupedRecord(assetSlotsByReferenceId, Number(slot.setting_id), slot)
    }
  }

  return {
    scriptText: input.scriptText,
    scriptVersionTitle: input.scriptVersionTitle,
    segmentById: new Map(input.segments.map((item) => [item.ID, item])),
    sceneMomentById: new Map(input.sceneMoments.map((item) => [item.ID, item])),
    contentUnitById: new Map(input.contentUnits.map((item) => [item.ID, item])),
    settingById: new Map(input.settings.map((item) => [item.ID, item])),
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
