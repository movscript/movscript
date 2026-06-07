import { safeWorkspacePathToken } from '../layout/index.js'
import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptProductionWorkspaceSnapshot {
  segments: MovScriptProductionWorkspaceSegmentNode[]
}

export interface MovScriptProductionWorkspaceSegmentNode {
  id?: string | number
  client_id?: string
  title?: string
  kind?: string
  summary?: string
  order?: number
  script_block_id?: string | number | null
  scene_moments?: MovScriptProductionWorkspaceSceneMomentNode[]
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceSceneMomentNode {
  id?: string | number
  client_id?: string
  title?: string
  time_text?: string
  scene_code?: string
  location_text?: string
  condition_text?: string
  action_text?: string
  mood?: string
  description?: string
  order?: number
  script_block_id?: string | number | null
  settings?: MovScriptProductionWorkspaceSettingRefNode[]
  writing_expressions?: MovScriptProductionWorkspaceWritingExpressionNode[]
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceSettingRefNode {
  id?: string | number
  client_id?: string
  name?: string
  kind?: string
  role?: string
  source_label?: string
  state?: Record<string, unknown>
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceWritingExpressionNode {
  id?: string | number
  client_id?: string
  kind?: string
  speaker?: string
  text?: string
  note?: string
  intent?: string
  order?: number
  script_block_id?: string | number | null
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceSnapshotWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  projectId?: string | number
  productionId: string | number
  snapshot: MovScriptProductionWorkspaceSnapshot
  now?: Date
}

export interface MovScriptProductionWorkspaceSnapshotWriteResult {
  productionPath: string
  snapshot: MovScriptProductionWorkspaceSnapshot
  writtenPaths: string[]
}

export async function saveMovScriptProductionWorkspaceSnapshot(
  input: MovScriptProductionWorkspaceSnapshotWriteInput,
): Promise<MovScriptProductionWorkspaceSnapshotWriteResult> {
  const productionId = stableId(input.productionId, 'production')
  const productionPath = `productions/${productionId}/production.json`
  const writtenPaths: string[] = []
  const production = await readOptionalRecord(input.fileRepository, productionPath)
  await writeRecord(input.fileRepository, productionPath, pruneUndefined({
    ...stripWorkspacePrivateFields(production),
    schema: 'movscript.production.v1',
    kind: 'production',
    id: productionId,
    project_id: input.projectId ?? production.project_id,
    title: stringValue(production.title) ?? `Production ${displayId(productionId, 'production')}`,
    updated_at: (input.now ?? new Date()).toISOString(),
  }))
  writtenPaths.push(productionPath)

  for (const segment of input.snapshot.segments) {
    const segmentId = stableId(segment.id ?? segment.client_id ?? writtenPaths.length + 1, 'segment')
    const segmentPath = `productions/${productionId}/segments/${segmentId}/segment.json`
    const existingSegment = await readOptionalRecord(input.fileRepository, segmentPath)
    await writeRecord(input.fileRepository, segmentPath, pruneUndefined({
      ...stripWorkspacePrivateFields(existingSegment),
      schema: 'movscript.segment.v1',
      kind: 'segment',
      id: segmentId,
      title: stringValue(segment.title) ?? stringValue(existingSegment.title) ?? `Segment ${displayId(segmentId, 'segment')}`,
      segment_kind: stringValue(segment.kind ?? existingSegment.segment_kind),
      summary: stringValue(segment.summary ?? existingSegment.summary),
      order: finiteNumber(segment.order) ?? finiteNumber(existingSegment.order),
      script_block_id: nullableRef(segment.script_block_id ?? existingSegment.script_block_id, 'script_block'),
      ...(segment.__delete === true ? { __delete: true } : {}),
    }))
    writtenPaths.push(segmentPath)

    for (const moment of segment.scene_moments ?? []) {
      const momentId = stableId(moment.id ?? moment.client_id ?? `${segmentId}_${writtenPaths.length + 1}`, 'scene_moment')
      const momentDir = `productions/${productionId}/segments/${segmentId}/scene_moments/${momentId}`
      const momentPath = `${momentDir}/scene_moment.json`
      const existingMoment = await readOptionalRecord(input.fileRepository, momentPath)
      const storyboardId = stringValue(existingMoment.active_storyboard_id) ?? 'storyboard_main'
      await writeRecord(input.fileRepository, momentPath, pruneUndefined({
        ...stripWorkspacePrivateFields(existingMoment),
        schema: 'movscript.scene_moment.v1',
        kind: 'scene_moment',
        id: momentId,
        title: stringValue(moment.title) ?? stringValue(existingMoment.title) ?? `Scene Moment ${displayId(momentId, 'scene_moment')}`,
        scene_code: stringValue(moment.scene_code ?? existingMoment.scene_code),
        when: stringValue(moment.time_text ?? existingMoment.when),
        where: stringValue(moment.location_text ?? existingMoment.where),
        condition_text: stringValue(moment.condition_text ?? existingMoment.condition_text),
        action: stringValue(moment.action_text ?? existingMoment.action),
        emotion: stringValue(moment.mood ?? existingMoment.emotion),
        description: stringValue(moment.description ?? existingMoment.description),
        order: finiteNumber(moment.order) ?? finiteNumber(existingMoment.order),
        script_block_id: nullableRef(moment.script_block_id ?? existingMoment.script_block_id, 'script_block'),
        active_storyboard_id: storyboardId,
        storyboard_timing: isRecord(existingMoment.storyboard_timing)
          ? existingMoment.storyboard_timing
          : { items: [{ storyboard_id: storyboardId, order: 1 }] },
        ...(moment.__delete === true ? { __delete: true } : {}),
      }))
      writtenPaths.push(momentPath)

      const storyboardPath = `${momentDir}/storyboards/${storyboardId}/storyboard.json`
      const existingStoryboard = await readOptionalRecord(input.fileRepository, storyboardPath)
      await writeRecord(input.fileRepository, storyboardPath, pruneUndefined({
        ...stripWorkspacePrivateFields(existingStoryboard),
        schema: 'movscript.storyboard.v1',
        kind: 'storyboard',
        id: storyboardId,
        title: stringValue(existingStoryboard.title) ?? `${stringValue(moment.title) ?? displayId(momentId, 'scene_moment')} storyboard`,
        setting_refs: normalizeSettingRefs(moment.settings, existingStoryboard.setting_refs),
      }))
      writtenPaths.push(storyboardPath)

      for (const expression of moment.writing_expressions ?? []) {
        const expressionId = stableId(expression.id ?? expression.client_id ?? `${momentId}_${writtenPaths.length + 1}`, 'writing_expression')
        const expressionPath = `${momentDir}/storyboards/${storyboardId}/writing_expressions/${expressionId}/writing_expression.json`
        const existingExpression = await readOptionalRecord(input.fileRepository, expressionPath)
        await writeRecord(input.fileRepository, expressionPath, pruneUndefined({
          ...stripWorkspacePrivateFields(existingExpression),
          schema: 'movscript.writing_expression.v1',
          kind: 'writing_expression',
          id: expressionId,
          title: stringValue(existingExpression.title) ?? stringValue(expression.text) ?? `Writing Expression ${displayId(expressionId, 'writing_expression')}`,
          expression_kind: normalizeExpressionKind(expression.kind ?? existingExpression.expression_kind),
          speaker: stringValue(expression.speaker ?? existingExpression.speaker),
          text: stringValue(expression.text ?? existingExpression.text) ?? '',
          note: stringValue(expression.note ?? existingExpression.note),
          intent: stringValue(expression.intent ?? existingExpression.intent),
          order: finiteNumber(expression.order) ?? finiteNumber(existingExpression.order),
          target_ref: momentPath,
          script_block_id: nullableRef(expression.script_block_id ?? existingExpression.script_block_id, 'script_block'),
          ...(expression.__delete === true ? { __delete: true } : {}),
        }))
        writtenPaths.push(expressionPath)
      }
    }
  }

  return { productionPath, snapshot: input.snapshot, writtenPaths }
}

export function movScriptProductionWorkspacePath(productionId: string | number): string {
  return `productions/${stableId(productionId, 'production')}/production.json`
}

function normalizeSettingRefs(
  refs: MovScriptProductionWorkspaceSettingRefNode[] | undefined,
  fallback: unknown,
): Record<string, unknown>[] | undefined {
  if (!refs) return Array.isArray(fallback) ? fallback.filter(isRecord) : undefined
  return refs.map((ref) => pruneUndefined({
    setting_id: stableId(ref.id ?? ref.client_id ?? ref.name ?? 'unassigned', 'setting'),
    role: stringValue(ref.role),
    notes: stringValue(ref.source_label),
    name: stringValue(ref.name),
    setting_kind: stringValue(ref.kind),
    state: isRecord(ref.state) ? ref.state : undefined,
    ...(ref.__delete === true ? { __delete: true } : {}),
  }))
}

function normalizeExpressionKind(value: unknown): string {
  const kind = stringValue(value)
  if (kind === 'dialogue' || kind === 'narration' || kind === 'subtitle' || kind === 'caption' || kind === 'action') return kind
  if (kind === 'visual' || kind === 'visual_note') return 'visual_note'
  return 'dialogue'
}

async function readRecord(fileRepository: MovScriptWorkspaceFileRepository, path: string): Promise<Record<string, unknown>> {
  const file = await fileRepository.read({ path })
  const parsed = JSON.parse(file.content) as unknown
  return isRecord(parsed) ? parsed : {}
}

async function readOptionalRecord(fileRepository: MovScriptWorkspaceFileRepository, path: string): Promise<Record<string, unknown>> {
  return readRecord(fileRepository, path).catch(() => ({}))
}

async function writeRecord(
  fileRepository: MovScriptWorkspaceFileRepository,
  path: string,
  record: Record<string, unknown>,
): Promise<void> {
  await fileRepository.write({ path, content: `${JSON.stringify(record, null, 2)}\n` })
}

function stableId(value: unknown, prefix: string): string {
  const raw = value === undefined || value === null || String(value).trim() === '' ? 'local' : String(value)
  const token = safeWorkspacePathToken(raw)
  return token.startsWith(`${prefix}_`) ? token : `${prefix}_${token}`
}

function nullableRef(value: unknown, prefix: string): string | null | undefined {
  if (value === null) return null
  if (value === undefined || String(value).trim() === '') return undefined
  return stableId(value, prefix)
}

function displayId(value: string, prefix: string): string {
  return value.startsWith(`${prefix}_`) ? value.slice(prefix.length + 1) : value
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stripWorkspacePrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('__workspace_')) continue
    output[key] = value
  }
  return output
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== '') output[key] = item
  }
  return output as T
}
