import type {
  ElectronMovScriptWorkspaceFileEntry,
  ElectronMovScriptWorkspaceFileReadResult,
  ElectronMovScriptWorkspaceFilesInput,
  ElectronMovScriptWorkspaceFilesListResult,
  ElectronMovScriptWorkspaceRootResult,
} from '@/shared/contracts/electronApi'
import type { Script } from '@/types'

export interface ScriptWorkspaceFilesAPI {
  root(input?: { workspaceDir?: string }): Promise<ElectronMovScriptWorkspaceRootResult>
  list(input?: ElectronMovScriptWorkspaceFilesInput): Promise<ElectronMovScriptWorkspaceFilesListResult>
  read(input: ElectronMovScriptWorkspaceFilesInput): Promise<ElectronMovScriptWorkspaceFileReadResult>
  write(input: ElectronMovScriptWorkspaceFilesInput & { content: string }): Promise<ElectronMovScriptWorkspaceFileReadResult>
}

export function requireScriptWorkspaceAPI(): ScriptWorkspaceFilesAPI {
  const api = window.api
  if (
    !api?.getMovScriptWorkspaceRoot
    || !api.listMovScriptWorkspaceFiles
    || !api.readMovScriptWorkspaceFile
    || !api.writeMovScriptWorkspaceFile
  ) {
    throw new Error('当前窗口没有 MovScript 工作区文件能力')
  }
  return {
    root: api.getMovScriptWorkspaceRoot,
    list: api.listMovScriptWorkspaceFiles,
    read: api.readMovScriptWorkspaceFile,
    write: api.writeMovScriptWorkspaceFile,
  }
}

export async function listWorkspaceScripts(projectId: number): Promise<Script[]> {
  const api = requireScriptWorkspaceAPI()
  const projectPath = await resolveScriptWorkspaceProjectPath(api, projectId)
  let listed: ElectronMovScriptWorkspaceFilesListResult
  try {
    listed = await api.list({ path: `${projectPath}/scripts` })
  } catch {
    return []
  }
  const scriptDirs = listed.entries.filter((entry) => entry.kind === 'directory')
  const scripts = await Promise.all(scriptDirs.map((entry) => readWorkspaceScript(api, projectId, entry)))
  return scripts.filter((script): script is Script => Boolean(script))
}

export async function saveWorkspaceScript(projectId: number, scriptId: number, workspace: Partial<Script>): Promise<Script> {
  const api = requireScriptWorkspaceAPI()
  const projectPath = await resolveScriptWorkspaceProjectPath(api, projectId)
  const scriptDir = `${projectPath}/scripts/script_${scriptId}`
  const existing = await readWorkspaceScriptFromDir(api, projectId, scriptDir, scriptId)
  const script = normalizeScript({
    ...existing,
    ...workspace,
    ID: scriptId,
    id: scriptId,
    project_id: projectId,
    content: scriptWorkspaceSourceText(workspace, existing),
    raw_source: scriptWorkspaceSourceText(workspace, existing),
    UpdatedAt: new Date().toISOString(),
  }, projectId, scriptId)
  await api.write({ path: `${scriptDir}/script.md`, content: script.raw_source ?? script.content ?? '' })
  await api.write({ path: `${scriptDir}/script.meta.json`, content: `${JSON.stringify(scriptMetadata(script), null, 2)}\n` })
  return script
}

export function scriptWorkspaceProjectPath(_userId: string | number, _projectId: string | number): string {
  return 'edit'
}

async function readWorkspaceScript(
  api: ScriptWorkspaceFilesAPI,
  projectId: number,
  entry: ElectronMovScriptWorkspaceFileEntry,
): Promise<Script | null> {
  const scriptId = Number(entry.name.replace(/^script_/, ''))
  if (!scriptId) return null
  return readWorkspaceScriptFromDir(api, projectId, entry.path, scriptId)
}

async function readWorkspaceScriptFromDir(
  api: ScriptWorkspaceFilesAPI,
  projectId: number,
  scriptDir: string,
  scriptId: number,
): Promise<Script> {
  const [body, meta] = await Promise.all([
    readTextFile(api, `${scriptDir}/script.md`),
    readJsonRecord(api, `${scriptDir}/script.meta.json`),
  ])
  return normalizeScript({
    ...meta,
    ID: meta.ID ?? meta.id ?? meta.script_id ?? scriptId,
    id: meta.id ?? meta.ID ?? meta.script_id ?? scriptId,
    project_id: meta.project_id ?? projectId,
    content: body,
    raw_source: body,
  }, projectId, scriptId)
}

async function resolveScriptWorkspaceProjectPath(api: ScriptWorkspaceFilesAPI, projectId: number): Promise<string> {
  await api.root()
  return scriptWorkspaceProjectPath('local', projectId)
}

async function readTextFile(api: ScriptWorkspaceFilesAPI, path: string): Promise<string> {
  try {
    return (await api.read({ path })).content
  } catch {
    return ''
  }
}

async function readJsonRecord(api: ScriptWorkspaceFilesAPI, path: string): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse((await api.read({ path })).content) as unknown
    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

function normalizeScript(value: Record<string, unknown>, projectId: number, scriptId: number): Script {
  const body = stringValue(value.content) ?? stringValue(value.raw_source) ?? ''
  return {
    ID: numberValue(value.ID) ?? numberValue(value.id) ?? numberValue(value.script_id) ?? scriptId,
    project_id: numberValue(value.project_id) ?? projectId,
    title: stringValue(value.title) ?? `剧本 #${scriptId}`,
    description: stringValue(value.description) ?? '',
    content: body,
    raw_source: body,
    script_type: stringValue(value.script_type) ?? 'uncategorized',
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
    CreatedAt: stringValue(value.CreatedAt) ?? stringValue(value.created_at) ?? '',
    UpdatedAt: stringValue(value.UpdatedAt) ?? stringValue(value.updated_at) ?? '',
  }
}

function scriptMetadata(script: Script): Record<string, unknown> {
  const { content, raw_source, ...metadata } = script
  return metadata
}

function scriptWorkspaceSourceText(workspace: Partial<Script>, fallback?: Script): string {
  return String(workspace.content ?? workspace.raw_source ?? fallback?.content ?? fallback?.raw_source ?? '')
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return undefined
}

function scriptSourceType(value: unknown): Script['source_type'] {
  return value === 'raw' || value === 'adapted' || value === 'revised' ? value : 'raw'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
