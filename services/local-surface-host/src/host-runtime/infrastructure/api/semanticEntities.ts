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
  const context = projectContext(projectId)
  const namespaceResourceKind = semanticNamespaceResourceKind(config.kind)
  if (namespaceResourceKind && context.projectDir) {
    const items = await listProjectResourceItems(context, namespaceResourceKind)
    return items
      .filter((item) => semanticNamespaceResourceItemMatchesKind(item, config.kind))
      .map((item) => semanticRecordFromProjectResourceItem(item, projectId, namespaceResourceKind))
  }

  const service = createElectronMovScriptWorkspaceService(context)
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

function semanticNamespaceResourceKind(kind: string): 'timeline-namespaces' | 'setting-namespaces' | undefined {
  if (kind === 'productions' || kind === 'segments') return 'timeline-namespaces'
  if (kind === 'settings' || kind === 'settingStates') return 'setting-namespaces'
  return undefined
}

async function listProjectResourceItems(
  context: { projectId: number; projectDir?: string },
  kind: 'timeline-namespaces' | 'setting-namespaces',
): Promise<Record<string, unknown>[]> {
  if (!context.projectDir) return []
  const response = await fetch(projectResourceViewEndpoint(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectDir: context.projectDir, kind }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const record = recordValue(payload)
    const message = stringValue(record.message) ?? stringValue(record.error) ?? `Project resource view request failed: ${response.status}`
    throw new Error(message)
  }
  const items = recordValue(payload).items
  return Array.isArray(items) ? items.filter(isRecord) : []
}

function projectResourceViewEndpoint(): string {
  return '/v1/project/resources/view'
}

function semanticNamespaceResourceItemMatchesKind(item: Record<string, unknown>, kind: string): boolean {
  const entityKind = projectResourceItemEntityKind(item)
  if (kind === 'productions') return entityKind === 'production'
  if (kind === 'segments') return entityKind === 'segment'
  if (kind === 'settings') return entityKind === 'setting'
  if (kind === 'settingStates') return entityKind === 'setting_state'
  return false
}

function semanticRecordFromProjectResourceItem(
  item: Record<string, unknown>,
  projectId: number,
  preferredResourceKind: 'timeline-namespaces' | 'setting-namespaces',
): SemanticEntityRecord {
  const record = { ...item } as SemanticEntityRecord
  const numericId = numberValue(record.ID ?? record.id)
  if (numericId !== undefined) record.ID = numericId
  if (record.project_id === undefined) record.project_id = projectId
  const entityKind = projectResourceItemEntityKind(item)
  if (entityKind) record.__workspace_entity_type = entityKind
  const path = stringValue(item.path)
  if (path) record.__workspace_path = path
  record.domainCategory = stringValue(item.domainCategory ?? item.domain_category ?? item.category)
  record.domainKind = stringValue(item.domainKind ?? item.domain_kind ?? item.kind)
  record.legacyAlias = true
  record.preferredResourceKind = preferredResourceKind
  return record
}

function projectResourceItemEntityKind(item: Record<string, unknown>): string | undefined {
  const metadata = recordValue(item.metadata)
  const domainNode = recordValue(item.domainNode ?? item.domain_node)
  return stringValue(item.entityKind ?? item.entity_kind ?? metadata.entityKind ?? metadata.entity_kind ?? domainNode.entityKind ?? domainNode.entity_kind)
    ?? entityKindFromPath(stringValue(item.path))
}

function entityKindFromPath(path: string | undefined): string | undefined {
  if (!path) return undefined
  if (path.endsWith('/production.json')) return 'production'
  if (path.endsWith('/segment.json')) return 'segment'
  if (path.endsWith('/setting.json')) return 'setting'
  if (path.endsWith('/setting_state.json')) return 'setting_state'
  return undefined
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

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
