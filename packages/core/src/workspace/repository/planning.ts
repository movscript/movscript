import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptStoryboardTimingItem {
  storyboard_id: string
  order: number
  gap_after_sec?: number
  caption?: string
}

export interface MovScriptStoryboardTimingAudio {
  note?: string
  music?: string
  sound_effects?: string[]
}

export interface MovScriptStoryboardTimingTransition {
  in?: string
  out?: string
  notes?: string
}

export interface MovScriptStoryboardTimingUpdateInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  items: MovScriptStoryboardTimingItem[]
  audio?: MovScriptStoryboardTimingAudio
  transition?: MovScriptStoryboardTimingTransition
  activeStoryboardId?: string
}

export interface MovScriptStoryboardTimingUpdateResult {
  path: string
  record: Record<string, unknown>
}

export interface MovScriptShotPlanUpdateInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  shotPlans: Array<Record<string, unknown>>
}

export interface MovScriptShotPlanUpdateResult {
  path: string
  record: Record<string, unknown>
}

export async function updateMovScriptSceneMomentStoryboardTiming(
  input: MovScriptStoryboardTimingUpdateInput,
): Promise<MovScriptStoryboardTimingUpdateResult> {
  const targetPath = normalizeWorkspacePath(input.targetPath)
  const current = await readWorkspaceRecord(input.fileRepository, targetPath, 'scene_moment')
  const items = input.items.map((item, index) => normalizeStoryboardTimingItem(item, index))
  const storyboard_timing = pruneUndefined({
    items,
    audio: normalizeTimingAudio(input.audio),
    transition: normalizeTimingTransition(input.transition),
  })
  const record = pruneUndefined({
    ...current,
    active_storyboard_id: input.activeStoryboardId ?? current.active_storyboard_id,
    storyboard_timing,
  })
  await input.fileRepository.write({ path: targetPath, content: serializeWorkspaceRecord(record) })
  return { path: targetPath, record }
}

export async function updateMovScriptStoryboardShotPlans(
  input: MovScriptShotPlanUpdateInput,
): Promise<MovScriptShotPlanUpdateResult> {
  const targetPath = normalizeWorkspacePath(input.targetPath)
  const current = await readWorkspaceRecord(input.fileRepository, targetPath, 'storyboard')
  const shot_plans = input.shotPlans.map((item, index) => normalizeShotPlan(item, index))
  const record = {
    ...current,
    shot_plans,
  }
  await input.fileRepository.write({ path: targetPath, content: serializeWorkspaceRecord(record) })
  return { path: targetPath, record }
}

async function readWorkspaceRecord(
  fileRepository: MovScriptWorkspaceFileRepository,
  targetPath: string,
  expectedKind: string,
): Promise<Record<string, unknown>> {
  const file = await fileRepository.read({ path: targetPath })
  const parsed = JSON.parse(file.content) as unknown
  if (!isRecord(parsed)) throw new Error(`target JSON must be an object: ${targetPath}`)
  const schemaKind = typeof parsed.schema === 'string'
    ? parsed.schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
    : undefined
  if (parsed.kind !== expectedKind && schemaKind !== expectedKind) {
    throw new Error(`target kind mismatch: expected ${expectedKind}`)
  }
  return parsed
}

function normalizeStoryboardTimingItem(item: MovScriptStoryboardTimingItem, index: number): Record<string, unknown> {
  const storyboardId = stringValue(item.storyboard_id)
  if (!storyboardId) throw new Error(`storyboard_timing.items[${index}].storyboard_id required`)
  if (!Number.isFinite(item.order)) throw new Error(`storyboard_timing.items[${index}].order required`)
  return pruneUndefined({
    storyboard_id: storyboardId,
    order: item.order,
    gap_after_sec: finiteNumber(item.gap_after_sec),
    caption: stringValue(item.caption),
  })
}

function normalizeTimingAudio(audio: MovScriptStoryboardTimingAudio | undefined): Record<string, unknown> | undefined {
  if (!audio) return undefined
  return pruneUndefined({
    note: stringValue(audio.note),
    music: stringValue(audio.music),
    sound_effects: Array.isArray(audio.sound_effects) ? audio.sound_effects.filter(isString) : undefined,
  })
}

function normalizeTimingTransition(transition: MovScriptStoryboardTimingTransition | undefined): Record<string, unknown> | undefined {
  if (!transition) return undefined
  return pruneUndefined({
    in: stringValue(transition.in),
    out: stringValue(transition.out),
    notes: stringValue(transition.notes),
  })
}

function normalizeShotPlan(item: Record<string, unknown>, index: number): Record<string, unknown> {
  const id = stringValue(item.id)
  const order = typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : undefined
  if (!id) throw new Error(`shot_plans[${index}].id required`)
  if (order === undefined) throw new Error(`shot_plans[${index}].order required`)
  return pruneUndefined({
    ...item,
    id,
    order,
    shot_size: stringValue(item.shot_size),
    camera: isRecord(item.camera) ? item.camera : undefined,
    blocking: isRecord(item.blocking) ? item.blocking : undefined,
    lighting: isRecord(item.lighting) ? item.lighting : undefined,
    performance: Array.isArray(item.performance) ? item.performance.filter(isRecord) : undefined,
    reference_image_refs: Array.isArray(item.reference_image_refs) ? item.reference_image_refs.filter(isString) : undefined,
  })
}

function serializeWorkspaceRecord(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function normalizeWorkspacePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
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
