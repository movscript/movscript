export interface WorkspaceSeedTargetIds {
  entityId?: number
  productionId?: number
  segmentId?: number
  sceneMomentId?: number
  contentUnitId?: number
}

export interface WorkspaceSeedData {
  data: Record<string, unknown>
  sourceVersions: Record<string, unknown>
  warnings: string[]
}
