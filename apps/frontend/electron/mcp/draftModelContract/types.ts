export interface DraftSeedTargetIds {
  entityId?: number
  productionId?: number
  segmentId?: number
  sceneMomentId?: number
  contentUnitId?: number
}

export interface DraftSeedData {
  data: Record<string, unknown>
  sourceVersions: Record<string, unknown>
  warnings: string[]
}
