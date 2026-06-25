import {
  listSurfaceSemanticEntities as listSemanticEntities,
  semanticEntityConfig,
  type SurfaceSemanticEntityKind,
  type SemanticEntityRecord,
} from '@movscript/shared/semantic-entities'

export type ProjectOverviewRecord = SemanticEntityRecord & {
  description?: string
  summary?: string
  progress?: number
}

export interface ProjectOverviewData {
  scriptVersions: ProjectOverviewRecord[]
  segments: ProjectOverviewRecord[]
  sceneMoments: ProjectOverviewRecord[]
  productions: ProjectOverviewRecord[]
  settings: ProjectOverviewRecord[]
  assetSlots: ProjectOverviewRecord[]
  contentUnits: ProjectOverviewRecord[]
  keyframes: ProjectOverviewRecord[]
}

export const emptyProjectOverviewData: ProjectOverviewData = {
  scriptVersions: [],
  segments: [],
  sceneMoments: [],
  productions: [],
  settings: [],
  assetSlots: [],
  contentUnits: [],
  keyframes: [],
}

export async function loadProjectOverviewData(projectId: number): Promise<ProjectOverviewData> {
  const [
    scriptVersions,
    segments,
    sceneMoments,
    productions,
    settings,
    assetSlots,
    contentUnits,
    keyframes,
  ] = await Promise.all([
    safeList(projectId, 'scriptVersions'),
    safeList(projectId, 'segments'),
    safeList(projectId, 'sceneMoments'),
    safeList(projectId, 'productions'),
    safeList(projectId, 'settings'),
    safeList(projectId, 'assetSlots'),
    safeList(projectId, 'contentUnits'),
    safeList(projectId, 'keyframes'),
  ])

  return {
    scriptVersions,
    segments,
    sceneMoments,
    productions,
    settings,
    assetSlots,
    contentUnits,
    keyframes,
  }
}

async function safeList(projectId: number, kind: SurfaceSemanticEntityKind): Promise<ProjectOverviewRecord[]> {
  try {
    return await listSemanticEntities(projectId, semanticEntityConfig(kind)) as ProjectOverviewRecord[]
  } catch (error) {
    console.warn(`[project-home] failed to load ${kind}`, error)
    return []
  }
}
