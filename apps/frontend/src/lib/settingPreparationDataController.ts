import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import { api } from '@/lib/api'
import type { Script } from '@/types'

export type SettingPreparationRecord = SemanticEntityRecord & Record<string, any>

export interface SettingPreparationData {
  productions: SettingPreparationRecord[]
  scripts: Script[]
  scriptVersions: SettingPreparationRecord[]
  segments: SettingPreparationRecord[]
  sceneMoments: SettingPreparationRecord[]
  creativeReferences: SettingPreparationRecord[]
  creativeReferenceStates: SettingPreparationRecord[]
  creativeReferenceUsages: SettingPreparationRecord[]
  creativeRelationships: SettingPreparationRecord[]
  assetSlots: SettingPreparationRecord[]
  contentUnits: SettingPreparationRecord[]
}

export function settingPreparationWorkbenchQueryKey(projectId?: number) {
  return ['workbench', 'creative', projectId] as const
}

async function safeSettingPreparationList(
  projectId: number,
  kind: Parameters<typeof semanticEntityConfig>[0],
): Promise<SettingPreparationRecord[]> {
  try {
    return await listSemanticEntities(projectId, semanticEntityConfig(kind)) as SettingPreparationRecord[]
  } catch (error) {
    console.warn(`Failed to load workbench entity: ${kind}`, error)
    return []
  }
}

export async function loadSettingPreparationData(projectId: number): Promise<SettingPreparationData> {
  const [
    productions,
    scripts,
    scriptVersions,
    segments,
    sceneMoments,
    creativeReferences,
    creativeReferenceStates,
    creativeReferenceUsages,
    creativeRelationships,
    assetSlots,
    contentUnits,
  ] = await Promise.all([
    safeSettingPreparationList(projectId, 'productions'),
    api.get<Script[]>(`/projects/${projectId}/scripts`).then((response) => response.data).catch(() => []),
    safeSettingPreparationList(projectId, 'scriptVersions'),
    safeSettingPreparationList(projectId, 'segments'),
    safeSettingPreparationList(projectId, 'sceneMoments'),
    safeSettingPreparationList(projectId, 'creativeReferences'),
    safeSettingPreparationList(projectId, 'creativeReferenceStates'),
    safeSettingPreparationList(projectId, 'creativeReferenceUsages'),
    safeSettingPreparationList(projectId, 'creativeRelationships'),
    safeSettingPreparationList(projectId, 'assetSlots'),
    safeSettingPreparationList(projectId, 'contentUnits'),
  ])

  return {
    productions,
    scripts,
    scriptVersions,
    segments,
    sceneMoments,
    creativeReferences,
    creativeReferenceStates,
    creativeReferenceUsages,
    creativeRelationships,
    assetSlots,
    contentUnits,
  }
}
