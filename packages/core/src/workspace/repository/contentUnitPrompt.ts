import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptContentUnitEditablePrompt {
  prompt?: string
  negative_prompt?: string
  notes?: string
}

export interface MovScriptContentUnitEditablePromptUpdateInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  editablePrompt: MovScriptContentUnitEditablePrompt
}

export interface MovScriptContentUnitEditablePromptUpdateResult {
  path: string
  record: Record<string, unknown>
}

export async function updateMovScriptContentUnitEditablePrompt(
  input: MovScriptContentUnitEditablePromptUpdateInput,
): Promise<MovScriptContentUnitEditablePromptUpdateResult> {
  const targetPath = normalizeWorkspacePath(input.targetPath)
  const current = await readContentUnitRecord(input.fileRepository, targetPath)
  const editablePrompt = pruneUndefined({
    prompt: stringValue(input.editablePrompt.prompt),
    negative_prompt: stringValue(input.editablePrompt.negative_prompt),
    notes: stringValue(input.editablePrompt.notes),
  })
  const record = {
    ...current,
    editable_prompt: editablePrompt,
  }
  await input.fileRepository.write({ path: targetPath, content: serializeWorkspaceRecord(record) })
  return { path: targetPath, record }
}

function readContentUnitRecord(
  fileRepository: MovScriptWorkspaceFileRepository,
  targetPath: string,
): Promise<Record<string, unknown>> {
  return fileRepository.read({ path: targetPath }).then((file) => {
    const parsed = JSON.parse(file.content) as unknown
    if (!isRecord(parsed)) throw new Error(`target JSON must be an object: ${targetPath}`)
    const schemaKind = typeof parsed.schema === 'string'
      ? parsed.schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
      : undefined
    if (parsed.kind !== 'content_unit' && schemaKind !== 'content_unit') {
      throw new Error('target kind mismatch: expected content_unit')
    }
    return parsed
  })
}

function normalizeWorkspacePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}

function serializeWorkspaceRecord(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output as T
}
