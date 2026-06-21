import {
  createSemanticEntity,
  listSemanticEntities,
  semanticEntityConfig,
  type SemanticEntityPayload,
} from '@/shared/infrastructure/api/semanticEntities'

export type ScriptVersionSourceType = 'raw' | 'adapted' | 'revised' | 'ai'

export type ScriptVersion = {
  ID: number
  project_id: number
  script_id: number
  parent_version_id?: number | null
  version_number: number
  title: string
  source_type: ScriptVersionSourceType | string
  content: string
  raw_source: string
  summary: string
  created_by_id?: number | null
  CreatedAt: string
  UpdatedAt: string
}

export type ScriptVersionLine = {
  line_number: number
  content: string
  start_char: number
  end_char: number
}

export type CreateScriptVersionPayload = {
  script_id: number
  parent_version_id?: number | null
  title?: string
  source_type?: ScriptVersionSourceType | string
  content?: string
  raw_source?: string
  summary?: string
}

export async function listScriptVersions(projectId: number, params: { scriptId?: number } = {}) {
  const versions = await listSemanticEntities(projectId, semanticEntityConfig('scriptVersions')) as unknown as ScriptVersion[]
  return versions.filter((version) => {
    if (params.scriptId && !sameId(version.script_id, params.scriptId)) return false
    return true
  })
}

export async function createScriptVersion(projectId: number, payload: CreateScriptVersionPayload) {
  const existing = await listScriptVersions(projectId, { scriptId: payload.script_id })
  const versionNumber = nextScriptVersionNumber(existing)
  const now = new Date().toISOString()
  return await createSemanticEntity(projectId, semanticEntityConfig('scriptVersions'), {
    ...payload,
    version_number: versionNumber,
    title: payload.title ?? `手记版本 ${versionNumber}`,
    source_type: payload.source_type ?? 'raw',
    content: payload.content ?? payload.raw_source ?? '',
    raw_source: payload.raw_source ?? payload.content ?? '',
    summary: payload.summary ?? '',
    CreatedAt: now,
    UpdatedAt: now,
  } as SemanticEntityPayload) as unknown as ScriptVersion
}

export async function listScriptVersionLines(projectId: number, versionId: number) {
  const versions = await listScriptVersions(projectId)
  const version = versions.find((item) => sameId(item.ID, versionId) || sameId(recordIdAlias(item), versionId))
  if (!version) return []
  return scriptVersionLines(scriptVersionText(version))
}

function nextScriptVersionNumber(versions: ScriptVersion[]): number {
  return versions.reduce((max, version) => Math.max(max, Number(version.version_number) || 0), 0) + 1
}

function scriptVersionText(version: ScriptVersion): string {
  return String(version.content ?? version.raw_source ?? '')
}

function scriptVersionLines(content: string): ScriptVersionLine[] {
  if (!content) return []
  const lines = content.split(/\r?\n/)
  let cursor = 0
  return lines.map((line, index) => {
    const start = cursor
    const end = start + line.length
    cursor = end + 1
    return {
      line_number: index + 1,
      content: line,
      start_char: start,
      end_char: end,
    }
  })
}

function sameId(left: unknown, right: unknown) {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber
}

function recordIdAlias(value: ScriptVersion): unknown {
  return (value as unknown as { id?: unknown }).id
}
