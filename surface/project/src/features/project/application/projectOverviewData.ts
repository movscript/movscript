import {
  listSurfaceSemanticEntities as listSemanticEntities,
  semanticEntityConfig,
  type SurfaceSemanticEntityKind,
  type SemanticEntityRecord,
} from '@movscript/shared/semantic-entities'
import { readSurfaceHostApi } from '@movscript/shared'
import {
  buildContentSourceWorkspaceProjectTimelineStatus,
  type ContentSourceWorkspaceSnapshot,
} from '@movscript/core/content'

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
  projectTimelineStatus?: Record<string, unknown>
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

export interface ProjectOverviewLoadContext {
  projectDir?: string
  userId?: string | number
  orgId?: string | number
}

export async function loadProjectOverviewData(
  projectId: number,
  context: ProjectOverviewLoadContext = {},
): Promise<ProjectOverviewData> {
  const [
    scriptVersions,
    segments,
    sceneMoments,
    productions,
    settings,
    assetSlots,
    contentUnits,
    keyframes,
    projectTimelineStatus,
  ] = await Promise.all([
    safeList(projectId, 'scriptVersions'),
    safeList(projectId, 'segments'),
    safeList(projectId, 'sceneMoments'),
    safeList(projectId, 'productions'),
    safeList(projectId, 'settings'),
    safeList(projectId, 'assetSlots'),
    safeList(projectId, 'contentUnits'),
    safeList(projectId, 'keyframes'),
    safeProjectTimelineStatus(projectId, context),
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
    ...(projectTimelineStatus ? { projectTimelineStatus } : {}),
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

async function safeProjectTimelineStatus(
  projectId: number,
  context: ProjectOverviewLoadContext,
): Promise<Record<string, unknown> | undefined> {
  const loadSnapshot = readSurfaceHostApi()?.loadMovScriptEngineContentWorkspaceSnapshot
  if (!loadSnapshot) return undefined
  try {
    const snapshot = await loadSnapshot({
      ...context,
      projectId,
    }) as ContentSourceWorkspaceSnapshot
    return buildContentSourceWorkspaceProjectTimelineStatus(snapshot)
  } catch (error) {
    console.warn('[project-home] failed to load project timeline status', error)
    return undefined
  }
}
