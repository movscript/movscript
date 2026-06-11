import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptProjectStandardsWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  record?: Record<string, unknown> | null
  projectStyle: Record<string, unknown>
  now?: Date
}

export interface MovScriptProjectStandardsWriteResult {
  path: string
  record: Record<string, unknown>
}

export async function upsertMovScriptProjectStandards(
  input: MovScriptProjectStandardsWriteInput,
): Promise<MovScriptProjectStandardsWriteResult> {
  const current = stripWorkspacePrivateFields(input.record ?? {})
  const projectStyle = {
    ...parseProjectStyle(current.project_style),
    ...input.projectStyle,
  }
  const record = pruneUndefined({
    ...current,
    schema: 'movscript.project_standards.v1',
    kind: 'project_standards',
    id: 'project_standards',
    title: stringValue(current.title) ?? 'Project standards',
    aspect_ratio: stringValue(projectStyle.aspect_ratio ?? current.aspect_ratio),
    visual_style: stringValue(projectStyle.visual_style ?? current.visual_style),
    project_style: JSON.stringify(projectStyle),
    updated_at: (input.now ?? new Date()).toISOString(),
  })
  const path = 'project_standards.json'
  await input.fileRepository.write({ path, content: `${JSON.stringify(record, null, 2)}\n` })
  return { path, record }
}

function parseProjectStyle(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function stripWorkspacePrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('__workspace_')) continue
    output[key] = value
  }
  return output
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== '') output[key] = item
  }
  return output as T
}
