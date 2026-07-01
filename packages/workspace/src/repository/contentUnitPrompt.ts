import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptContentUnitEditPrompt {
  text?: string
  negative_text?: string
  notes?: string
  structured?: Record<string, unknown>
}

export interface MovScriptContentUnitGenerationReference {
  id?: string
  kind?: string
  ref?: string | number
  raw?: string
  resource_id?: number
  media_type?: string
  role?: string
  source_ref?: string
  label?: string
  source?: string
}

export interface MovScriptContentUnitReferenceAsset {
  role?: string
  media_type?: string
  resource_id?: number
  source_ref?: string
}

export interface MovScriptContentUnitEditPromptUpdateInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  editPrompt: MovScriptContentUnitEditPrompt
  generationReferences?: MovScriptContentUnitGenerationReference[]
  generation_references?: MovScriptContentUnitGenerationReference[]
  referenceAssets?: MovScriptContentUnitReferenceAsset[]
  reference_assets?: MovScriptContentUnitReferenceAsset[]
  modelIntent?: Record<string, unknown>
  model_intent?: Record<string, unknown>
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
    ...(input.generationReferences !== undefined || input.generation_references !== undefined
      ? { generation_references: normalizeGenerationReferences(input.generationReferences ?? input.generation_references) }
      : {}),
    ...(input.referenceAssets !== undefined || input.reference_assets !== undefined
      ? { reference_assets: normalizeReferenceAssets(input.referenceAssets ?? input.reference_assets) }
      : {}),
    ...(input.modelIntent !== undefined || input.model_intent !== undefined
      ? { model_intent: normalizeModelIntent(input.modelIntent ?? input.model_intent) }
      : {}),
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

function positiveNumberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return undefined
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

function normalizeGenerationReferences(value: unknown): MovScriptContentUnitGenerationReference[] | undefined {
  if (!Array.isArray(value)) return undefined
  const refs = value.flatMap((item): MovScriptContentUnitGenerationReference[] => {
    if (!isRecord(item)) return []
    const ref = pruneUndefined({
      id: stringValue(item.id),
      kind: stringValue(item.kind ?? item.ref_kind ?? item.refKind ?? item.type),
      ref: stringValue(item.ref ?? item.target_ref ?? item.targetRef ?? item.source_ref ?? item.sourceRef) ?? positiveNumberValue(item.ref),
      raw: stringValue(item.raw),
      resource_id: positiveNumberValue(item.resource_id ?? item.resourceId),
      media_type: stringValue(item.media_type ?? item.mediaType),
      role: stringValue(item.role),
      source_ref: stringValue(item.source_ref ?? item.sourceRef),
      label: stringValue(item.label ?? item.title),
      source: stringValue(item.source),
    })
    return Object.keys(ref).length > 0 ? [ref] : []
  })
  return refs.length > 0 ? refs : undefined
}

function normalizeReferenceAssets(value: unknown): MovScriptContentUnitReferenceAsset[] | undefined {
  if (!Array.isArray(value)) return undefined
  const refs = value.flatMap((item): MovScriptContentUnitReferenceAsset[] => {
    if (!isRecord(item)) return []
    const ref = pruneUndefined({
      role: stringValue(item.role),
      media_type: stringValue(item.media_type ?? item.mediaType),
      resource_id: positiveNumberValue(item.resource_id ?? item.resourceId),
      source_ref: stringValue(item.source_ref ?? item.sourceRef),
    })
    return ref.role && ref.media_type && ref.resource_id ? [ref] : []
  })
  return refs.length > 0 ? refs : undefined
}

function normalizeModelIntent(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  const out = pruneUndefined({ ...value })
  return Object.keys(out).length > 0 ? out : undefined
}
