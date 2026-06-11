import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptContentUnitEditPrompt {
  text?: string
  negative_text?: string
  notes?: string
  structured?: Record<string, unknown>
}

export interface MovScriptContentUnitEditPromptUpdateInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  editPrompt: MovScriptContentUnitEditPrompt
}

export interface MovScriptContentUnitEditPromptUpdateResult {
  path: string
  record: Record<string, unknown>
}

export async function updateMovScriptContentUnitEditPrompt(
  input: MovScriptContentUnitEditPromptUpdateInput,
): Promise<MovScriptContentUnitEditPromptUpdateResult> {
  const targetPath = normalizeWorkspacePath(input.targetPath)
  const current = await readContentUnitRecord(input.fileRepository, targetPath)
  const editPrompt = pruneUndefined({
    text: stringValue(input.editPrompt.text),
    negative_text: stringValue(input.editPrompt.negative_text),
    notes: stringValue(input.editPrompt.notes),
    structured: isRecord(input.editPrompt.structured) ? input.editPrompt.structured : undefined,
  })
  const record = {
    ...current,
    edit_prompt: editPrompt,
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
