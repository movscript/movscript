import { createSurfaceWorkspaceDomainService, type SurfaceWorkspaceDomainService } from '@movscript/shared'
import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'
import type { Script } from '@movscript/shared'

export interface ScriptWorkspaceRepositoryContext {
  projectDir?: string
  projectUid?: string
  projectServiceBaseURL?: string
  userId?: string | number
  orgId?: string | number
}

export async function listWorkspaceScripts(projectId: number, context: ScriptWorkspaceRepositoryContext = {}): Promise<Script[]> {
  const projectServiceScripts = await listProjectResourceScripts(projectId, context)
  if (projectServiceScripts) return projectServiceScripts

  const service = createSurfaceWorkspaceDomainService({ ...context, projectId })
  const scripts = workspaceEntityArray(await service.queryEntities({ entityKind: 'script' }))
  return Promise.all(scripts.map((entity: MovScriptWorkspaceIndexedEntity) => scriptFromWorkspaceEntity(projectId, service, entity)))
}

export async function createWorkspaceScript(projectId: number, workspace: Partial<Script>, context: ScriptWorkspaceRepositoryContext = {}): Promise<Script> {
  const scripts = await listWorkspaceScripts(projectId, context)
  const scriptId = nextWorkspaceScriptId(scripts)
  return saveWorkspaceScript(projectId, scriptId, {
    ...workspace,
    ID: scriptId,
    project_id: projectId,
    CreatedAt: new Date().toISOString(),
    UpdatedAt: new Date().toISOString(),
  }, context)
}

export async function saveWorkspaceScript(projectId: number, scriptId: number, workspace: Partial<Script>, context: ScriptWorkspaceRepositoryContext = {}): Promise<Script> {
  const service = createSurfaceWorkspaceDomainService({ ...context, projectId })
  const existing = workspaceEntityArray(await service.queryEntities({ entityKind: 'script' }))
    .find((entity: MovScriptWorkspaceIndexedEntity) => workspaceScriptNumericId(entity) === scriptId)
  const sourceText = scriptWorkspaceSourceText(workspace, existing?.record)
  const result = await service.upsertScript({
    scriptId,
    record: existing?.record,
    sourceText,
    metadata: workspace as Record<string, unknown>,
  })
  return scriptFromWorkspaceRecord(projectId, result.record, result.sourceText)
}

async function scriptFromWorkspaceEntity(
  projectId: number,
  service: SurfaceWorkspaceDomainService,
  entity: MovScriptWorkspaceIndexedEntity,
): Promise<Script> {
  const body = await service.readScriptSource({ record: entity.record, entity })
  return scriptFromWorkspaceRecord(projectId, entity.record, body)
}

function scriptFromWorkspaceRecord(
  projectId: number,
  value: Record<string, unknown>,
  body: string,
): Script {
  const scriptId = workspaceScriptNumericId({ record: value } as MovScriptWorkspaceIndexedEntity)
  return {
    ID: scriptId,
    project_id: numberValue(value.project_id) ?? projectId,
    title: stringValue(value.title) ?? `手记 #${scriptId}`,
    description: stringValue(value.description) ?? '',
    content: body,
    raw_source: body,
    script_type: stringValue(value.script_type ?? value.script_kind) ?? 'uncategorized',
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
    CreatedAt: stringValue(value.CreatedAt ?? value.created_at) ?? '',
    UpdatedAt: stringValue(value.UpdatedAt ?? value.updated_at) ?? '',
  }
}

async function listProjectResourceScripts(
  projectId: number,
  context: ScriptWorkspaceRepositoryContext,
): Promise<Script[] | undefined> {
  if (!context.projectDir || typeof window === 'undefined') return undefined
  const endpoint = projectResourceScriptsEndpoint(context)
  if (!endpoint) return undefined
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectDir: context.projectDir,
        kind: 'scripts',
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(projectResourceScriptsErrorMessage(payload, response.status))
    return workspaceRecordArray(payload, ['items', 'records', 'scripts', 'data']).map((record) => {
      const sourceText = stringValue(record.source ?? record.content ?? record.raw_source) ?? ''
      return scriptFromWorkspaceRecord(projectId, record, sourceText)
    })
  } catch (error) {
    console.warn('[project-home] failed to load scripts from Project Service', error)
    return undefined
  }
}

function projectResourceScriptsEndpoint(context: ScriptWorkspaceRepositoryContext): string | undefined {
  const base = normalizeProjectServiceBaseURL(context.projectServiceBaseURL)
  if (base) return `${base}/v1/project/resources/view`
  return '/local-api/project/resources/view'
}

function normalizeProjectServiceBaseURL(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\/+$/, '')
  if (!normalized) return undefined
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) return undefined
  return normalized
}

function projectResourceScriptsErrorMessage(payload: unknown, status: number): string {
  const record = isRecord(payload) ? payload : {}
  return stringValue(record.message) ?? stringValue(record.error) ?? `Project scripts request failed: ${status}`
}

function workspaceScriptNumericId(entity: MovScriptWorkspaceIndexedEntity): number {
  return numberValue(entity.record.ID ?? entity.record.id ?? entity.id)
    ?? numericSuffix(entity.record.id ?? entity.id)
    ?? numericSuffix(entity.record.client_id)
    ?? -stablePositiveHash(String(entity.record.client_id ?? entity.record.title ?? entity.record.id ?? 'script'))
}

function scriptWorkspaceSourceText(workspace: Partial<Script>, fallback?: Record<string, unknown>): string {
  return String(workspace.content ?? workspace.raw_source ?? fallback?.content ?? '')
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return undefined
}

function numericSuffix(value: unknown): number | undefined {
  const text = typeof value === 'string' ? value : undefined
  const match = text?.match(/(\d+)(?!.*\d)/)
  return match ? numberValue(match[1]) : undefined
}

function scriptSourceType(value: unknown): Script['source_type'] {
  return value === 'raw' || value === 'adapted' || value === 'revised' ? value : 'raw'
}

function workspaceEntityArray(value: unknown): MovScriptWorkspaceIndexedEntity[] {
  return workspaceRecordArray(value, ['result', 'items', 'records', 'entities', 'data', 'scripts']) as unknown as MovScriptWorkspaceIndexedEntity[]
}

function workspaceRecordArray(value: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  if (!isRecord(value)) return []
  for (const key of keys) {
    const candidate = value[key]
    if (Array.isArray(candidate)) return candidate.filter(isRecord)
  }
  return []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nextWorkspaceScriptId(scripts: Script[]): number {
  const maxId = scripts.reduce((max, script) => Math.max(max, script.ID), 0)
  return maxId + 1
}

function stablePositiveHash(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) >>> 0
  }
  return (hash % 2_000_000_000) + 1
}
