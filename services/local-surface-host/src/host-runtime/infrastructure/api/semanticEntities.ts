import { configureSurfaceSemanticEntityClient } from '@movscript/shared/semantic-entities'
import type { Project } from '@movscript/shared'
import { createElectronMovScriptWorkspaceService } from '../workspaceDomainRepository'
import { useProjectStore } from '../session/projectStore'

export interface SemanticEntityConfig {
  kind: string
}

export type SemanticEntityPayload = Record<string, unknown>
export type SemanticEntityRecord = Record<string, unknown> & { ID?: number }

export function semanticEntityConfig(kind: string): SemanticEntityConfig {
  return { kind }
}

export async function listSemanticEntities(
  projectId: number,
  config: SemanticEntityConfig,
): Promise<SemanticEntityRecord[]> {
  const service = createElectronMovScriptWorkspaceService(projectContext(projectId))
  if (config.kind === 'settings') {
    return (await service.querySettings({})).map((entity: WorkspaceEntity) => semanticRecordFromWorkspaceEntity(entity, projectId))
  }
  if (config.kind === 'assetSlots') {
    const result = await service.queryAssets({})
    return arrayValue(result?.assets).map((entity) => semanticRecordFromWorkspaceEntity(entity as WorkspaceEntity, projectId))
  }

  const entityKind = semanticEntityType(config.kind)
  if (!entityKind) return []
  return (await service.queryEntities({ entityKind })).map((entity: WorkspaceEntity) => semanticRecordFromWorkspaceEntity(entity, projectId))
}

export async function createSemanticEntity(
  _projectId: number,
  _config: SemanticEntityConfig,
  payload: SemanticEntityPayload,
): Promise<SemanticEntityRecord> {
  return {
    ID: Date.now(),
    ...payload,
  }
}

export async function getProject(projectId: number): Promise<Project> {
  const now = new Date().toISOString()
  return {
    ID: projectId,
    name: `Project ${projectId}`,
    description: '',
    owner_id: 0,
    CreatedAt: now,
    UpdatedAt: now,
  }
}

configureSurfaceSemanticEntityClient({
  getProject,
  listSemanticEntities,
  createSemanticEntity: (projectId, config, payload) =>
    createSemanticEntity(projectId, config, payload as SemanticEntityPayload),
})

type WorkspaceEntity = {
  id?: string | number
  entityKind?: string
  record?: Record<string, unknown>
  path?: string
}

function projectContext(projectId: number): { projectId: number; projectDir?: string } {
  const project = useProjectStore.getState().current
  const projectDir = stringValue(project?.workspace_path ?? project?.project_path)
  return {
    projectId,
    ...(projectDir ? { projectDir } : {}),
  }
}

function semanticEntityType(kind: string): string | undefined {
  return {
    scriptVersions: 'script_version',
    scriptBlocks: 'script_block',
    segments: 'segment',
    productionTextBlocks: 'production_text_block',
    sceneMoments: 'scene_moment',
    expressionUnits: 'expression_unit',
    productions: 'production',
    storyboardScripts: 'storyboard_script',
    storyboardVersions: 'storyboard_version',
    contentUnits: 'content_unit',
    keyframes: 'keyframe',
    previewTimelines: 'preview_timeline',
    previewTimelineItems: 'preview_timeline_item',
    settingStates: 'setting_state',
    settingUsages: 'setting_usage',
    creativeRelationships: 'creative_relationship',
    assetSlotCandidates: 'asset_slot_candidate',
    candidateDecisions: 'candidate_decision',
    reviewEvents: 'review_event',
    canvasOutputs: 'canvas_output',
  }[kind]
}

function semanticRecordFromWorkspaceEntity(entity: WorkspaceEntity, projectId: number): SemanticEntityRecord {
  const record = { ...(entity.record ?? {}) } as SemanticEntityRecord
  const numericId = numberValue(record.ID ?? record.id ?? entity.id)
  if (numericId !== undefined) record.ID = numericId
  else if (entity.id !== undefined) record.id = entity.id
  if (record.project_id === undefined) record.project_id = projectId
  if (entity.entityKind !== undefined) record.__workspace_entity_type = entity.entityKind
  if (entity.path !== undefined) record.__workspace_path = entity.path
  return record
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
