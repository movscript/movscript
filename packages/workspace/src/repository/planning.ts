import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptTransitionBoundary {
  in?: string
  out?: string
  notes?: string
}

export interface MovScriptEntityTransitionUpdateInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  transition?: MovScriptTransitionBoundary
}

export interface MovScriptEntityTransitionUpdateResult {
  path: string
  record: Record<string, unknown>
}

export interface MovScriptStoryboardTimelineUpdateInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  timeline?: MovScriptStoryboardTimeline
}

export interface MovScriptStoryboardTimeline {
  gap_after_sec?: number
  caption?: string
  duration_sec?: number
}

export interface MovScriptStoryboardTimelineUpdateResult {
  path: string
  record: Record<string, unknown>
}

export interface MovScriptSourceRecordUpsertInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  record: Record<string, unknown>
  payload?: Record<string, unknown>
}

export interface MovScriptSourceRecordUpsertResult {
  path: string
  record: Record<string, unknown>
}

export async function upsertMovScriptSourceRecord(
  input: MovScriptSourceRecordUpsertInput,
): Promise<MovScriptSourceRecordUpsertResult> {
  const targetPath = normalizeWorkspacePath(input.targetPath)
  const current = await readOptionalWorkspaceRecord(input.fileRepository, targetPath)
  const incoming = stripWorkspacePrivateFields({
    ...input.record,
    ...(input.payload ?? {}),
  })
  const expectedKind = stringValue(incoming.kind)
  if (expectedKind !== undefined) assertRecordKind(current, expectedKind, targetPath)
  const record = pruneUndefined({
    ...current,
    ...incoming,
  })
  await input.fileRepository.write({ path: targetPath, content: serializeWorkspaceRecord(record) })
  return { path: targetPath, record }
}

export async function updateMovScriptEntityTransition(
  input: MovScriptEntityTransitionUpdateInput,
): Promise<MovScriptEntityTransitionUpdateResult> {
  const targetPath = normalizeWorkspacePath(input.targetPath)
  const current = await readWorkspaceRecord(input.fileRepository, targetPath)
  const record = pruneUndefined({
    ...current,
    transition: normalizeTransition(input.transition),
  })
  await input.fileRepository.write({ path: targetPath, content: serializeWorkspaceRecord(record) })
  return { path: targetPath, record }
}

export async function updateMovScriptStoryboardTimeline(
  input: MovScriptStoryboardTimelineUpdateInput,
): Promise<MovScriptStoryboardTimelineUpdateResult> {
  const targetPath = normalizeWorkspacePath(input.targetPath)
  const current = await readWorkspaceRecord(input.fileRepository, targetPath, 'storyboard')
  const record = pruneUndefined({
    ...current,
    timeline: normalizeTimeline(input.timeline),
  })
  await input.fileRepository.write({ path: targetPath, content: serializeWorkspaceRecord(record) })
  return { path: targetPath, record }
}

async function readWorkspaceRecord(
  fileRepository: MovScriptWorkspaceFileRepository,
  targetPath: string,
  expectedKind?: string,
): Promise<Record<string, unknown>> {
  const file = await fileRepository.read({ path: targetPath })
  const parsed = JSON.parse(file.content) as unknown
  if (!isRecord(parsed)) throw new Error(`target JSON must be an object: ${targetPath}`)
  const schemaKind = typeof parsed.schema === 'string'
    ? parsed.schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
    : undefined
  if (expectedKind !== undefined && parsed.kind !== expectedKind && schemaKind !== expectedKind) {
    throw new Error(`target kind mismatch: expected ${expectedKind}`)
  }
  return parsed
}

async function readOptionalWorkspaceRecord(
  fileRepository: MovScriptWorkspaceFileRepository,
  targetPath: string,
): Promise<Record<string, unknown>> {
  const file = await fileRepository.read({ path: targetPath }).catch(() => undefined)
  if (!file) return {}
  const parsed = JSON.parse(file.content) as unknown
  if (!isRecord(parsed)) throw new Error(`target JSON must be an object: ${targetPath}`)
  return parsed
}

function assertRecordKind(
  current: Record<string, unknown>,
  expectedKind: string,
  targetPath: string,
): void {
  const currentKind = typeof current.kind === 'string'
    ? current.kind
    : typeof current.schema === 'string'
      ? current.schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
      : undefined
  if (currentKind !== undefined && currentKind !== expectedKind) {
    throw new Error(`target kind mismatch: expected ${expectedKind} at ${targetPath}`)
  }
}

function normalizeTransition(transition: MovScriptTransitionBoundary | undefined): Record<string, unknown> | undefined {
  if (!transition) return undefined
  return pruneUndefined({
    in: stringValue(transition.in),
    out: stringValue(transition.out),
    notes: stringValue(transition.notes),
  })
}

function normalizeTimeline(timeline: MovScriptStoryboardTimeline | undefined): Record<string, unknown> | undefined {
  if (!timeline) return undefined
  return pruneUndefined({
    gap_after_sec: finiteNumber(timeline.gap_after_sec),
    caption: stringValue(timeline.caption),
    duration_sec: finiteNumber(timeline.duration_sec),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stripWorkspacePrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !key.startsWith('__workspace_')),
  )
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output as T
}
