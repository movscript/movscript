import type { Project, Script } from '@/types'
import { currentWorkspaceProjectDir } from '@/shared/infrastructure/session/workspaceOwnerContext'
import {
  getAPIBaseURL,
  getRuntimeConfigSnapshot,
  refreshRuntimeConfigSnapshot,
} from '@/shared/infrastructure/config'

const PROJECT_HOME_READ_MODEL_ENDPOINT = '/v1/project/home/read-model'

export interface ProjectHomeReadModelRecord extends Record<string, unknown> {
  ID?: number
  id?: string | number
}

export interface ProjectHomeReadModel {
  schema: 'movscript.project-home-read-model.v1'
  generatedAt?: string
  projectDir?: string
  project?: ProjectHomeReadModelRecord
  scripts: ProjectHomeReadModelRecord[]
  settings: ProjectHomeReadModelRecord[]
  assets: ProjectHomeReadModelRecord[]
  productions: ProjectHomeReadModelRecord[]
  sceneMoments: ProjectHomeReadModelRecord[]
  contentUnits: ProjectHomeReadModelRecord[]
  counts?: Record<string, number>
}

export interface ProjectHomeReadModelContext {
  userId?: string | number
  orgId?: string | number
}

export async function loadProjectHomeReadModel(
  project: Project,
  context: ProjectHomeReadModelContext = {},
): Promise<ProjectHomeReadModel> {
  const projectDir = project.workspace_path?.trim()
    || project.project_path?.trim()
    || currentWorkspaceProjectDir()
  if (!projectDir) throw new Error('Project directory is required to load project home.')
  const runtimeConfig = await refreshRuntimeConfigSnapshot().catch(() => null)
  const snapshot = runtimeConfig ?? getRuntimeConfigSnapshot()
  const baseURL = snapshot?.runtimeConnection.gatewayBaseURL
    ?? snapshot?.runtime.gateway.baseURL
    ?? snapshot?.gatewayBaseURL
    ?? snapshot?.apiBaseURL
    ?? getAPIBaseURL()
  const response = await fetch(`${baseURL.replace(/\/+$/, '')}${PROJECT_HOME_READ_MODEL_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectDir,
      projectId: project.ID,
      ...(project.project_uid ? { projectUid: project.project_uid } : {}),
      ...(snapshot?.movScriptHomeDir ? { movScriptHomeDir: snapshot.movScriptHomeDir } : {}),
      ...(context.userId !== undefined ? { userId: context.userId, scopeKind: 'user', scopeId: context.userId } : {}),
      ...(context.orgId !== undefined ? { orgId: context.orgId, scopeKind: 'org', scopeId: context.orgId } : {}),
    }),
  })
  const payload = await response.json().catch(() => undefined)
  if (!response.ok) {
    const record = isRecord(payload) ? payload : {}
    throw new Error(stringValue(record.message) ?? stringValue(record.error) ?? `Project home request failed: ${response.status}`)
  }
  const model = isRecord(payload) && isRecord(payload.projectHomeReadModel)
    ? payload.projectHomeReadModel
    : payload
  return normalizeProjectHomeReadModel(model)
}

export function projectHomeScriptsFromReadModel(
  model: ProjectHomeReadModel | undefined,
  projectId: number,
): Script[] {
  return (model?.scripts ?? []).map((record) => scriptFromProjectHomeRecord(record, projectId))
}

function normalizeProjectHomeReadModel(value: unknown): ProjectHomeReadModel {
  const record = isRecord(value) ? value : {}
  return {
    schema: 'movscript.project-home-read-model.v1',
    generatedAt: stringValue(record.generatedAt ?? record.generated_at),
    projectDir: stringValue(record.projectDir ?? record.project_dir),
    project: recordField(record.project),
    scripts: recordArray(record.scripts),
    settings: recordArray(record.settings),
    assets: recordArray(record.assets),
    productions: recordArray(record.productions),
    sceneMoments: recordArray(record.sceneMoments ?? record.scene_moments),
    contentUnits: recordArray(record.contentUnits ?? record.content_units),
    counts: numberRecord(record.counts),
  }
}

function scriptFromProjectHomeRecord(value: ProjectHomeReadModelRecord, projectId: number): Script {
  const scriptId = numberValue(value.ID ?? value.id) ?? stablePositiveHash(String(value.id ?? value.title ?? 'script'))
  const createdAt = stringValue(value.CreatedAt ?? value.created_at) ?? ''
  const updatedAt = stringValue(value.UpdatedAt ?? value.updated_at) ?? ''
  return {
    ID: scriptId,
    project_id: numberValue(value.project_id) ?? projectId,
    title: stringValue(value.title ?? value.name) ?? `手记 #${scriptId}`,
    description: stringValue(value.description) ?? '',
    content: '',
    raw_source: '',
    script_type: stringValue(value.script_type ?? value.script_kind ?? value.kind) ?? 'uncategorized',
    source_type: scriptSourceType(value.source_type),
    version: numberValue(value.version),
    parent_script_id: numberValue(value.parent_script_id),
    assignee_id: numberValue(value.assignee_id),
    author_id: numberValue(value.author_id) ?? 0,
    order: numberValue(value.order) ?? 0,
    summary: stringValue(value.summary) ?? '',
    characters: stringValue(value.characters) ?? '',
    character_profiles: stringValue(value.character_profiles),
    character_relationships: stringValue(value.character_relationships),
    core_settings: stringValue(value.core_settings) ?? '',
    background: stringValue(value.background) ?? '',
    scenes_desc: stringValue(value.scenes_desc) ?? '',
    hook: stringValue(value.hook) ?? '',
    plot_summary: stringValue(value.plot_summary) ?? '',
    script_points: stringValue(value.script_points),
    planned_scene_count: numberValue(value.planned_scene_count),
    planned_character_count: numberValue(value.planned_character_count),
    time_text: stringValue(value.time_text),
    location_text: stringValue(value.location_text),
    structured_characters: stringValue(value.structured_characters),
    plot_beats: stringValue(value.plot_beats),
    atmosphere: stringValue(value.atmosphere),
    structure_json: stringValue(value.structure_json),
    entity_candidates: stringValue(value.entity_candidates),
    relationship_candidates: stringValue(value.relationship_candidates),
    CreatedAt: createdAt,
    UpdatedAt: updatedAt,
  }
}

function scriptSourceType(value: unknown): Script['source_type'] {
  return value === 'raw' || value === 'adapted' || value === 'revised' ? value : 'raw'
}

function recordArray(value: unknown): ProjectHomeReadModelRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function recordField(value: unknown): ProjectHomeReadModelRecord | undefined {
  return isRecord(value) ? value : undefined
}

function numberRecord(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value)
    .map(([key, item]) => [key, numberValue(item)] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] !== undefined)
  return Object.fromEntries(entries)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return undefined
}

function stablePositiveHash(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) >>> 0
  }
  return (hash % 2_000_000_000) + 1
}

function isRecord(value: unknown): value is ProjectHomeReadModelRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
