import { getMCPContextSnapshot } from './context/store'
import { backendList } from './backendList'
import { clampNumber, getOptionalNumeric, getOptionalString } from './paramValues'
import { readonlyScriptFileURI } from './scriptLocate/scriptFileResources'
import { isRecord } from './valueUtils'

export async function listScripts(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getOptionalNumeric(args, 'projectId') ?? getOptionalNumeric(args, 'project_id') ?? getMCPContextSnapshot().project?.id
  if (!projectId) throw new Error('projectId is required when no current project is selected')

  const scriptId = getOptionalNumeric(args, 'scriptId') ?? getOptionalNumeric(args, 'script_id')
  const status = getOptionalString(args, 'status')
  const query = getOptionalString(args, 'query') ?? getOptionalString(args, 'q')
  const includeContent = booleanParam(args.include_content) ?? booleanParam(args.includeContent) ?? false
  const contentLimit = Math.floor(clampNumber(getOptionalNumeric(args, 'contentLimit') ?? getOptionalNumeric(args, 'content_limit') ?? 500, 1, 5000))
  const limit = Math.floor(clampNumber(getOptionalNumeric(args, 'limit') ?? 100, 1, 500))

  const scripts = (await backendList(`/projects/${projectId}/scripts`))
    .filter((item) => matchesScriptFilter(item, { scriptId, query }))
    .slice(0, limit)
    .map((item) => summarizeScript(projectId, item, { includeContent, contentLimit }))

  const versionParams = new URLSearchParams()
  if (scriptId) versionParams.set('script_id', String(scriptId))
  if (status) versionParams.set('status', status)
  const versionPath = `/projects/${projectId}/entities/script-versions${versionParams.size > 0 ? `?${versionParams.toString()}` : ''}`
  const scriptVersions = (await backendList(versionPath))
    .filter((item) => matchesVersionFilter(item, { query }))
    .slice(0, limit)
    .map((item) => summarizeScriptVersion(projectId, item, { includeContent, contentLimit }))

  return {
    projectId,
    ...(scriptId ? { scriptId } : {}),
    ...(status ? { status } : {}),
    ...(query ? { query } : {}),
    count: {
      scripts: scripts.length,
      scriptVersions: scriptVersions.length,
    },
    scripts,
    scriptVersions,
    usage: 'Use scriptVersions[].scriptVersionId or scriptVersions[].ref with movscript_script_locate/read flows when you need passages or full text. Set include_content=true only when short previews are needed.',
  }
}

function summarizeScript(projectId: number, item: unknown, options: { includeContent: boolean; contentLimit: number }): Record<string, unknown> {
  if (!isRecord(item)) return { value: String(item) }
  const id = numericField(item, 'ID') ?? numericField(item, 'id')
  return {
    ...(id ? { scriptId: id, id } : {}),
    projectId,
    ...(textField(item, 'title') ? { title: textField(item, 'title') } : {}),
    ...(textField(item, 'description') ? { description: truncateText(textField(item, 'description'), 1200) } : {}),
    ...(textField(item, 'script_type') ? { scriptType: textField(item, 'script_type') } : {}),
    ...(textField(item, 'source_type') ? { sourceType: textField(item, 'source_type') } : {}),
    ...(numericField(item, 'version') ? { version: numericField(item, 'version') } : {}),
    ...(textField(item, 'analysis_status') ? { analysisStatus: textField(item, 'analysis_status') } : {}),
    ...(textField(item, 'summary') ? { summary: truncateText(textField(item, 'summary'), 1200) } : {}),
    ...(numericField(item, 'planned_scene_count') ? { plannedSceneCount: numericField(item, 'planned_scene_count') } : {}),
    ...(numericField(item, 'planned_character_count') ? { plannedCharacterCount: numericField(item, 'planned_character_count') } : {}),
    ...(textField(item, 'CreatedAt') ? { CreatedAt: textField(item, 'CreatedAt') } : {}),
    ...(textField(item, 'UpdatedAt') ? { UpdatedAt: textField(item, 'UpdatedAt') } : {}),
    ...(options.includeContent ? previewFields(item, options.contentLimit) : {}),
  }
}

function summarizeScriptVersion(projectId: number, item: unknown, options: { includeContent: boolean; contentLimit: number }): Record<string, unknown> {
  if (!isRecord(item)) return { value: String(item) }
  const scriptVersionId = numericField(item, 'ID') ?? numericField(item, 'id')
  const scriptId = numericField(item, 'script_id') ?? numericField(item, 'scriptId')
  const uri = scriptVersionId ? readonlyScriptFileURI(projectId, scriptVersionId) : undefined
  return {
    ...(scriptVersionId ? { scriptVersionId, id: scriptVersionId } : {}),
    ...(scriptId ? { scriptId } : {}),
    projectId,
    ...(uri ? { uri, ref: uri } : {}),
    ...(numericField(item, 'parent_version_id') ? { parentVersionId: numericField(item, 'parent_version_id') } : {}),
    ...(numericField(item, 'version_number') ? { versionNumber: numericField(item, 'version_number') } : {}),
    ...(textField(item, 'title') ? { title: textField(item, 'title') } : {}),
    ...(textField(item, 'source_type') ? { sourceType: textField(item, 'source_type') } : {}),
    ...(textField(item, 'status') ? { status: textField(item, 'status') } : {}),
    ...(textField(item, 'summary') ? { summary: truncateText(textField(item, 'summary'), 1200) } : {}),
    ...(numericField(item, 'created_by_id') ? { createdById: numericField(item, 'created_by_id') } : {}),
    ...(textField(item, 'CreatedAt') ? { CreatedAt: textField(item, 'CreatedAt') } : {}),
    ...(textField(item, 'UpdatedAt') ? { UpdatedAt: textField(item, 'UpdatedAt') } : {}),
    ...(options.includeContent ? previewFields(item, options.contentLimit) : {}),
  }
}

function previewFields(item: Record<string, unknown>, limit: number): Record<string, unknown> {
  return {
    ...(textField(item, 'content') ? { contentPreview: truncateText(textField(item, 'content'), limit) } : {}),
    ...(textField(item, 'raw_source') ? { rawSourcePreview: truncateText(textField(item, 'raw_source'), limit) } : {}),
  }
}

function matchesScriptFilter(item: unknown, filter: { scriptId?: number; query?: string }): boolean {
  if (!isRecord(item)) return false
  if (filter.scriptId && (numericField(item, 'ID') ?? numericField(item, 'id')) !== filter.scriptId) return false
  return matchesQuery(item, filter.query)
}

function matchesVersionFilter(item: unknown, filter: { query?: string }): boolean {
  return isRecord(item) && matchesQuery(item, filter.query)
}

function matchesQuery(item: Record<string, unknown>, query?: string): boolean {
  if (!query) return true
  const expected = query.trim().toLowerCase()
  if (!expected) return true
  return [
    'title',
    'description',
    'summary',
    'script_type',
    'source_type',
    'status',
  ].some((key) => String(item[key] ?? '').toLowerCase().includes(expected))
}

function numericField(item: Record<string, unknown>, key: string): number | undefined {
  const value = item[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function textField(item: Record<string, unknown>, key: string): string | undefined {
  const value = item[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function truncateText(value: string | undefined, limit: number): string | undefined {
  if (!value) return undefined
  return value.length > limit ? `${value.slice(0, limit)}...` : value
}

function booleanParam(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}
