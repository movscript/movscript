import {
  entityPathSlug,
  semanticEntityId,
} from '../layout/index.js'
import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptContentUnitWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  unit: Record<string, unknown>
}

export interface MovScriptContentUnitWriteResult {
  contentUnitPath: string
  record: Record<string, unknown>
}

export async function upsertMovScriptContentUnit(
  input: MovScriptContentUnitWriteInput,
): Promise<MovScriptContentUnitWriteResult> {
  const contentUnitId = stableEntityId(input.unit.ID ?? input.unit.id ?? input.unit.client_id, 'content_unit')
  const contentUnitPath = movScriptContentUnitPath(input.unit)
  const current = await readOptionalRecord(input.fileRepository, contentUnitPath)
  const record = normalizeContentUnitRecord(input.unit, current, contentUnitId)
  await writeRecord(input.fileRepository, contentUnitPath, record)

  return { contentUnitPath, record }
}

export function movScriptContentUnitPath(unit: Record<string, unknown>): string {
  const id = stableEntityId(unit.ID ?? unit.id ?? unit.client_id, 'content_unit')
  return `${contentUnitDirectory(id)}/content_unit.json`
}

export function movScriptContentUnitKeyframePath(input: {
  contentUnitId: string | number
  keyframeId: string | number
}): string {
  const contentUnitId = stableEntityId(input.contentUnitId, 'content_unit')
  const keyframeId = stableEntityId(input.keyframeId, 'keyframe')
  return `${contentUnitDirectory(contentUnitId)}/keyframes/${entityPathSlug(keyframeId, 'keyframe')}/keyframe.json`
}

export function movScriptContentUnitsSceneAggregatePath(input: { scene_moment_id?: unknown }): string {
  const sceneMomentId = stableEntityId(input.scene_moment_id, 'scene_moment')
  return `content_units/by_scene_moment/${sceneMomentId}.json`
}

function normalizeContentUnitRecord(
  unit: Record<string, unknown>,
  current: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  const contentUnitType = stringValue(unit.content_unit_type ?? unit.contentUnitType ?? current.content_unit_type)
    ?? 'storyboard_ref'
  const outputKind = stringValue(unit.output_kind ?? unit.outputKind ?? current.output_kind)
    ?? defaultOutputKind(contentUnitType)

  return pruneUndefined({
    ...stripWorkspacePrivateFields(current),
    schema: 'movscript.content_unit.v1',
    kind: 'content_unit',
    id,
    title: stringValue(unit.title ?? current.title) ?? 'Untitled content unit',
    content_unit_type: contentUnitType,
    output_kind: outputKind,
    order: finiteNumber(unit.order) ?? finiteNumber(current.order),
    description: stringValue(unit.description ?? current.description) ?? '',
    edit_prompt: normalizeEditPrompt(unit.edit_prompt ?? unit.editPrompt ?? unit.prompt ?? current.edit_prompt),
    model_intent: isRecord(unit.model_intent ?? unit.modelIntent) ? unit.model_intent ?? unit.modelIntent : current.model_intent,
    ...(unit.__delete === true ? { __delete: true } : {}),
  })
}

function contentUnitDirectory(id: string): string {
  return `content_units/${entityPathSlug(id, 'content_unit')}`
}

function defaultOutputKind(contentUnitType: string): string {
  switch (contentUnitType) {
    case 'asset_ref':
    case 'keyframe_ref':
    case 'storyboard_ref':
      return 'image'
    case 'shot_ref':
      return 'video'
    default:
      return 'metadata'
  }
}

function stableEntityId(value: unknown, prefix: string): string {
  return semanticEntityId(value, prefix)
}

async function readOptionalRecord(fileRepository: MovScriptWorkspaceFileRepository, path: string): Promise<Record<string, unknown>> {
  return fileRepository.read({ path }).then((file) => {
    const parsed = JSON.parse(file.content) as unknown
    return isRecord(parsed) ? parsed : {}
  }).catch(() => ({}))
}

async function writeRecord(
  fileRepository: MovScriptWorkspaceFileRepository,
  path: string,
  record: Record<string, unknown>,
): Promise<void> {
  await fileRepository.write({ path, content: `${JSON.stringify(record, null, 2)}\n` })
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

function finiteNumber(value: unknown): number | undefined {
  const next = Number(value)
  return Number.isFinite(next) ? next : undefined
}

function positiveNumberOrNull(value: unknown): number | null | undefined {
  if (value === null) return null
  const next = Number(value)
  return Number.isFinite(next) && next > 0 ? next : undefined
}

function normalizeEditPrompt(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') return { text: value }
  if (isRecord(value)) return value
  return undefined
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
