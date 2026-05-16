export type AdminFeatureGroupTarget = {
  is_internal: boolean
}

export function groupAdminFeatures<T extends AdminFeatureGroupTarget>(features: T[]): {
  toolFeatures: T[]
  systemFeatures: T[]
} {
  const toolFeatures: T[] = []
  const systemFeatures: T[] = []
  for (const feature of features) {
    if (feature.is_internal) {
      systemFeatures.push(feature)
    } else {
      toolFeatures.push(feature)
    }
  }
  return { toolFeatures, systemFeatures }
}
