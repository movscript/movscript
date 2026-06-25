import type {
  AbandonContentUnitResult,
  AbandonSceneMomentResult,
  AbandonSegmentResult,
  EntityRelation,
  EntityRelationFilters,
  GenerationContext,
  Project,
  ScriptBlockUsages,
  SemanticEntityConfig,
  SemanticEntityListParams,
  SemanticEntityPayload,
  SemanticEntityRecord,
  SourceLockStatus,
} from './semanticEntityTypes'
import { semanticEntityConfig, semanticEntityConfigs } from './semanticEntityConfigs'
import { configureSurfaceSemanticEntityClient } from '@movscript/shared/semantic-entities'
import {
  deleteWorkspaceSemanticEntity,
  getWorkspaceProject,
  listWorkspaceEntityRelations,
  listWorkspaceSemanticEntities,
  unsupportedWorkspaceSemanticRead,
  unsupportedWorkspaceSemanticWrite,
  workspaceWritableEntityKind,
  writeWorkspaceSemanticEntity,
} from './semanticEntityWorkspace'

export type * from './semanticEntityTypes'
export { semanticEntityConfig, semanticEntityConfigs } from './semanticEntityConfigs'

export async function listSemanticEntities(
  projectId: number,
  config: SemanticEntityConfig,
  params: SemanticEntityListParams = {},
): Promise<SemanticEntityRecord[]> {
  return await listWorkspaceSemanticEntities(projectId, config.kind, params)
}

export async function getProject(projectId: number): Promise<Project> {
  return getWorkspaceProject(projectId)
}
export async function createSemanticEntity(
  projectId: number,
  config: SemanticEntityConfig,
  payload: SemanticEntityPayload,
): Promise<SemanticEntityRecord> {
  if (workspaceWritableEntityKind(config.kind)) {
    return writeWorkspaceSemanticEntity(projectId, config.kind, undefined, payload)
  }
  throw unsupportedWorkspaceSemanticWrite(config.kind)
}

export async function updateSemanticEntity(
  projectId: number,
  config: SemanticEntityConfig,
  id: number,
  payload: SemanticEntityPayload,
): Promise<SemanticEntityRecord> {
  if (workspaceWritableEntityKind(config.kind)) {
    const current = (await listWorkspaceSemanticEntities(projectId, config.kind, {})).find((record) => record.ID === id)
    return writeWorkspaceSemanticEntity(projectId, config.kind, current ?? ({ ID: id } as SemanticEntityRecord), payload)
  }
  throw unsupportedWorkspaceSemanticWrite(config.kind)
}

export async function deleteSemanticEntity(
  projectId: number,
  config: SemanticEntityConfig,
  id: number,
): Promise<void> {
  return deleteWorkspaceSemanticEntity(projectId, config.kind, id)
}

export async function getSourceLockStatus(
  _projectId: number,
  config: SemanticEntityConfig,
  id: number,
): Promise<SourceLockStatus> {
  return {
    entity_kind: config.path,
    entity_id: id,
    locked: false,
    locked_fields: [],
    reasons: [],
  }
}

export async function listEntityRelations(projectId: number, _filters: EntityRelationFilters = {}): Promise<EntityRelation[]> {
  return listWorkspaceEntityRelations(projectId)
}
export async function listScriptBlockUsages(_projectId: number, _scriptBlockId: number): Promise<ScriptBlockUsages> {
  throw unsupportedWorkspaceSemanticRead('listScriptBlockUsages')
}

export async function listScriptBlockUsageMap(_projectId: number, _scriptVersionId: number): Promise<Record<string, ScriptBlockUsages>> {
  throw unsupportedWorkspaceSemanticRead('listScriptBlockUsageMap')
}

export async function deriveContentUnitGenerationContext(
  _projectId: number,
  _contentUnitId: number,
  _intent: 'keyframe' | 'video' = 'video',
): Promise<GenerationContext> {
  throw unsupportedWorkspaceSemanticRead('deriveContentUnitGenerationContext')
}

export async function abandonSegment(_projectId: number, _id: number): Promise<AbandonSegmentResult> {
  throw unsupportedWorkspaceSemanticRead('abandonSegment')
}

export async function abandonSceneMoment(_projectId: number, _id: number): Promise<AbandonSceneMomentResult> {
  throw unsupportedWorkspaceSemanticRead('abandonSceneMoment')
}

export async function abandonContentUnit(_projectId: number, _id: number): Promise<AbandonContentUnitResult> {
  throw unsupportedWorkspaceSemanticRead('abandonContentUnit')
}

configureSurfaceSemanticEntityClient({
  getProject,
  listSemanticEntities: (projectId, config, params = {}) =>
    listSemanticEntities(projectId, config as SemanticEntityConfig, params as SemanticEntityListParams),
  createSemanticEntity: (projectId, config, payload) =>
    createSemanticEntity(projectId, config as SemanticEntityConfig, payload as SemanticEntityPayload),
})
