import {
  displayEntityId,
  entityPathSlug,
  semanticEntityId,
} from '../layout/index.js'
import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptProductionWorkspaceSnapshot {
  production?: MovScriptProductionWorkspaceNode
  segments: MovScriptProductionWorkspaceSegmentNode[]
}

export interface MovScriptProductionWorkspaceNode {
  title?: string
  transition?: MovScriptProductionWorkspaceTransitionNode
}

export interface MovScriptProductionWorkspaceSegmentNode {
  id?: string | number
  client_id?: string
  title?: string
  kind?: string
  summary?: string
  order?: number
  transition?: MovScriptProductionWorkspaceTransitionNode
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
  transition?: MovScriptProductionWorkspaceTransitionNode
  script_block_id?: string | number | null
  settings?: MovScriptProductionWorkspaceSettingRefNode[]
  keyframes?: MovScriptProductionWorkspaceKeyframeNode[]
  storyboards?: MovScriptProductionWorkspaceStoryboardNode[]
  expression_units?: MovScriptProductionWorkspaceExpressionUnitNode[]
  audio_cues?: MovScriptProductionWorkspaceAudioCueNode[]
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceStoryboardNode {
  id?: string | number
  client_id?: string
  title?: string
  order?: number
  slot?: string
  asset_kind?: string
  transition?: MovScriptProductionWorkspaceTransitionNode
  timeline?: MovScriptProductionWorkspaceTimelineNode
  graph?: Record<string, unknown>
  gap_after_sec?: number
  caption?: string
  duration_sec?: number
  settings?: MovScriptProductionWorkspaceSettingRefNode[]
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceKeyframeNode {
  id?: string | number
  client_id?: string
  title?: string
  role?: string
  visual_intent?: string
  timing?: Record<string, unknown>
  composition?: Record<string, unknown>
  continuity?: Record<string, unknown>
  reference_asset_refs?: unknown[]
  reference_keyframe_refs?: unknown[]
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceAudioCueNode {
  id?: string | number
  client_id?: string
  title?: string
  cue_kind?: string
  kind?: string
  order?: number
  storyboard_id?: string | number
  storyboard_ref?: string
  expression_unit_ref?: string | number
  timing?: Record<string, unknown>
  prompt_hint?: string
  asset_refs?: unknown[]
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceTransitionNode {
  in?: string
  out?: string
  notes?: string
}

export interface MovScriptProductionWorkspaceTimelineNode {
  gap_after_sec?: number
  caption?: string
  duration_sec?: number
}

export interface MovScriptProductionWorkspaceSettingRefNode {
  id?: string | number
  client_id?: string
  setting_state_id?: string | number
  setting_state_ref?: string | number
  kind?: string
  role?: string
  source_label?: string
  state?: Record<string, unknown>
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceExpressionUnitNode {
  id?: string | number
  client_id?: string
  title?: string
  modality?: string
  role?: string
  kind?: string
  visual_kind?: string
  speaker?: string
  speaker_ref?: string
  source_expression_ref?: string
  text?: string
  note?: string
  intent?: string
  content?: Record<string, unknown>
  timing_intent?: Record<string, unknown>
  voice_profile_ref?: string
  order?: number
  span?: Record<string, unknown>
  script_block_id?: string | number | null
  keyframes?: MovScriptProductionWorkspaceKeyframeNode[]
  storyboards?: MovScriptProductionWorkspaceStoryboardNode[]
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceSnapshotWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
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
  const productionSlug = slugId(productionId, 'production')
  const productionPath = `productions/${productionSlug}/production.json`
  const writtenPaths: string[] = []
  const production = await readOptionalRecord(input.fileRepository, productionPath)
  await writeRecord(input.fileRepository, productionPath, pruneUndefined({
    ...stripWorkspacePrivateFields(production),
    schema: 'movscript.production.v1',
    kind: 'production',
    id: productionId,
    title: stringValue(input.snapshot.production?.title ?? production.title) ?? `Production ${displayId(productionId, 'production')}`,
    transition: normalizeTransition(input.snapshot.production?.transition ?? production.transition),
    updated_at: (input.now ?? new Date()).toISOString(),
  }))
  writtenPaths.push(productionPath)

  for (const segment of input.snapshot.segments) {
    const segmentId = stableId(segment.id ?? segment.client_id ?? writtenPaths.length + 1, 'segment')
    const segmentSlug = slugId(segmentId, 'segment')
    const segmentPath = `productions/${productionSlug}/segments/${segmentSlug}/segment.json`
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
      transition: normalizeTransition(segment.transition ?? existingSegment.transition),
      script_block_id: nullableRef(segment.script_block_id ?? existingSegment.script_block_id, 'script_block'),
      ...(segment.__delete === true ? { __delete: true } : {}),
    }))
    writtenPaths.push(segmentPath)

    for (const moment of segment.scene_moments ?? []) {
      const momentId = stableId(moment.id ?? moment.client_id ?? `${segmentId}_${writtenPaths.length + 1}`, 'scene_moment')
      const momentSlug = slugId(momentId, 'scene_moment')
      const momentDir = `productions/${productionSlug}/segments/${segmentSlug}/scene_moments/${momentSlug}`
      const momentPath = `${momentDir}/scene_moment.json`
      const existingMoment = await readOptionalRecord(input.fileRepository, momentPath)
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
        transition: normalizeTransition(moment.transition ?? existingMoment.transition),
        script_block_id: nullableRef(moment.script_block_id ?? existingMoment.script_block_id, 'script_block'),
        setting_refs: normalizeSettingRefs(moment.settings, existingMoment.setting_refs),
        ...(moment.__delete === true ? { __delete: true } : {}),
      }))
      writtenPaths.push(momentPath)

      await writeKeyframeNodes({
        fileRepository: input.fileRepository,
        writtenPaths,
        ownerDir: momentDir,
        ownerKind: 'scene_moment',
        sceneMomentDir: momentDir,
        ownerTitle: stringValue(moment.title ?? existingMoment.title) ?? displayId(momentId, 'scene_moment'),
        nodes: moment.keyframes ?? [],
      })

      await writeStoryboardNodes({
        fileRepository: input.fileRepository,
        writtenPaths,
        ownerDir: momentDir,
        ownerKind: 'scene_moment',
        sceneMomentDir: momentDir,
        ownerTitle: stringValue(moment.title ?? existingMoment.title) ?? displayId(momentId, 'scene_moment'),
        nodes: moment.storyboards ?? [],
        settings: moment.settings,
      })

      for (const audioCue of moment.audio_cues ?? []) {
        const audioCueId = stableId(audioCue.id ?? audioCue.client_id ?? `${momentId}_${writtenPaths.length + 1}`, 'audio_cue')
        const audioCuePath = `${momentDir}/audio_cues/${slugId(audioCueId, 'audio_cue')}/audio_cue.json`
        const existingAudioCue = await readOptionalRecord(input.fileRepository, audioCuePath)
        await writeRecord(input.fileRepository, audioCuePath, pruneUndefined({
          ...stripWorkspacePrivateFields(existingAudioCue),
          schema: 'movscript.audio_cue.v1',
          kind: 'audio_cue',
          id: audioCueId,
          title: stringValue(audioCue.title ?? existingAudioCue.title) ?? `Audio Cue ${displayId(audioCueId, 'audio_cue')}`,
          cue_kind: normalizeAudioCueKind(audioCue.cue_kind ?? audioCue.kind ?? existingAudioCue.cue_kind),
          order: finiteNumber(audioCue.order) ?? finiteNumber(existingAudioCue.order),
          scope_ref: momentDir,
          expression_unit_ref: stringValue(audioCue.expression_unit_ref ?? existingAudioCue.expression_unit_ref),
          storyboard_ref: normalizeStoryboardRef(audioCue.storyboard_ref ?? audioCue.storyboard_id ?? existingAudioCue.storyboard_ref),
          timing: isRecord(audioCue.timing) ? audioCue.timing : (isRecord(existingAudioCue.timing) ? existingAudioCue.timing : undefined),
          prompt_hint: stringValue(audioCue.prompt_hint ?? existingAudioCue.prompt_hint),
          asset_refs: Array.isArray(audioCue.asset_refs) ? audioCue.asset_refs.filter(isString) : existingAudioCue.asset_refs,
          ...(audioCue.__delete === true ? { __delete: true } : {}),
        }))
        writtenPaths.push(audioCuePath)
      }

      for (const expression of moment.expression_units ?? []) {
        const expressionId = stableId(expression.id ?? expression.client_id ?? `${momentId}_${writtenPaths.length + 1}`, 'expression_unit')
        const expressionPath = `${momentDir}/expression_units/${slugId(expressionId, 'expression_unit')}/expression_unit.json`
        const existingExpression = await readOptionalRecord(input.fileRepository, expressionPath)
        await writeRecord(input.fileRepository, expressionPath, pruneUndefined({
          ...stripWorkspacePrivateFields(existingExpression),
          schema: 'movscript.expression_unit.v1',
          kind: 'expression_unit',
          id: expressionId,
          title: stringValue(expression.title ?? existingExpression.title) ?? stringValue(expression.text) ?? `Expression Unit ${displayId(expressionId, 'expression_unit')}`,
          modality: stringValue(expression.modality ?? existingExpression.modality),
          role: stringValue(expression.role ?? existingExpression.role),
          expression_kind: normalizeExpressionKind(expression.kind ?? existingExpression.expression_kind),
          visual_kind: stringValue(expression.visual_kind ?? existingExpression.visual_kind),
          speaker: stringValue(expression.speaker ?? existingExpression.speaker),
          speaker_ref: stringValue(expression.speaker_ref ?? existingExpression.speaker_ref),
          source_expression_ref: stringValue(expression.source_expression_ref ?? existingExpression.source_expression_ref),
          text: stringValue(expression.text ?? existingExpression.text) ?? '',
          note: stringValue(expression.note ?? existingExpression.note),
          intent: stringValue(expression.intent ?? existingExpression.intent),
          content: isRecord(expression.content) ? expression.content : (isRecord(existingExpression.content) ? existingExpression.content : undefined),
          timing_intent: isRecord(expression.timing_intent) ? expression.timing_intent : (isRecord(existingExpression.timing_intent) ? existingExpression.timing_intent : undefined),
          voice_profile_ref: stringValue(expression.voice_profile_ref ?? existingExpression.voice_profile_ref),
          order: finiteNumber(expression.order) ?? finiteNumber(existingExpression.order),
          span: isRecord(expression.span) ? expression.span : (isRecord(existingExpression.span) ? existingExpression.span : undefined),
          script_block_id: nullableRef(expression.script_block_id ?? existingExpression.script_block_id, 'script_block'),
          ...(expression.__delete === true ? { __delete: true } : {}),
        }))
        writtenPaths.push(expressionPath)
        await writeKeyframeNodes({
          fileRepository: input.fileRepository,
          writtenPaths,
          ownerDir: `${momentDir}/expression_units/${slugId(expressionId, 'expression_unit')}`,
          ownerKind: 'expression_unit',
          sceneMomentDir: momentDir,
          ownerTitle: stringValue(expression.title ?? existingExpression.title) ?? displayId(expressionId, 'expression_unit'),
          nodes: expression.keyframes ?? [],
        })
        await writeStoryboardNodes({
          fileRepository: input.fileRepository,
          writtenPaths,
          ownerDir: `${momentDir}/expression_units/${slugId(expressionId, 'expression_unit')}`,
          ownerKind: 'expression_unit',
          sceneMomentDir: momentDir,
          ownerTitle: stringValue(expression.title ?? existingExpression.title) ?? displayId(expressionId, 'expression_unit'),
          nodes: expression.storyboards ?? [],
          settings: moment.settings,
        })
      }
    }
  }

  return { productionPath, snapshot: input.snapshot, writtenPaths }
}

export function movScriptProductionWorkspacePath(productionId: string | number): string {
  return `productions/${slugId(productionId, 'production')}/production.json`
}

async function writeKeyframeNodes({
  fileRepository,
  writtenPaths,
  ownerDir,
  ownerKind,
  sceneMomentDir,
  ownerTitle,
  nodes,
}: {
  fileRepository: MovScriptWorkspaceFileRepository
  writtenPaths: string[]
  ownerDir: string
  ownerKind: 'scene_moment' | 'expression_unit'
  sceneMomentDir: string
  ownerTitle: string
  nodes: MovScriptProductionWorkspaceKeyframeNode[]
}) {
  for (const keyframe of nodes) {
    const keyframeId = stableId(keyframe.id ?? keyframe.client_id ?? `${ownerTitle}_${writtenPaths.length + 1}`, 'keyframe')
    const keyframePath = `${ownerDir}/keyframes/${slugId(keyframeId, 'keyframe')}/keyframe.json`
    const existingKeyframe = await readOptionalRecord(fileRepository, keyframePath)
    await writeRecord(fileRepository, keyframePath, pruneUndefined({
      ...stripWorkspacePrivateFields(existingKeyframe),
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: keyframeId,
      title: stringValue(keyframe.title ?? existingKeyframe.title) ?? `Keyframe ${displayId(keyframeId, 'keyframe')}`,
      scene_moment_ref: sceneMomentDir,
      ...(ownerKind === 'expression_unit' ? { expression_unit_ref: ownerDir } : {}),
      role: stringValue(keyframe.role ?? existingKeyframe.role),
      visual_intent: stringValue(keyframe.visual_intent ?? existingKeyframe.visual_intent),
      timing: isRecord(keyframe.timing) ? keyframe.timing : (isRecord(existingKeyframe.timing) ? existingKeyframe.timing : undefined),
      composition: isRecord(keyframe.composition) ? keyframe.composition : (isRecord(existingKeyframe.composition) ? existingKeyframe.composition : undefined),
      continuity: isRecord(keyframe.continuity) ? keyframe.continuity : (isRecord(existingKeyframe.continuity) ? existingKeyframe.continuity : undefined),
      reference_asset_refs: Array.isArray(keyframe.reference_asset_refs) ? keyframe.reference_asset_refs.filter(isString) : existingKeyframe.reference_asset_refs,
      reference_keyframe_refs: Array.isArray(keyframe.reference_keyframe_refs) ? keyframe.reference_keyframe_refs.filter(isString) : existingKeyframe.reference_keyframe_refs,
      ...(keyframe.__delete === true ? { __delete: true } : {}),
    }))
    writtenPaths.push(keyframePath)
  }
}

async function writeStoryboardNodes({
  fileRepository,
  writtenPaths,
  ownerDir,
  ownerKind,
  sceneMomentDir,
  ownerTitle,
  nodes,
  settings,
}: {
  fileRepository: MovScriptWorkspaceFileRepository
  writtenPaths: string[]
  ownerDir: string
  ownerKind: 'scene_moment' | 'expression_unit'
  sceneMomentDir: string
  ownerTitle: string
  nodes: MovScriptProductionWorkspaceStoryboardNode[]
  settings?: MovScriptProductionWorkspaceSettingRefNode[]
}) {
  for (const [storyboardIndex, storyboard] of nodes.entries()) {
    const storyboardId = stableId(storyboard.id ?? storyboard.client_id ?? 'main', 'storyboard')
    const storyboardPath = `${ownerDir}/storyboards/${slugId(storyboardId, 'storyboard')}/storyboard.json`
    const existingStoryboard = await readOptionalRecord(fileRepository, storyboardPath)
    await writeRecord(fileRepository, storyboardPath, pruneUndefined({
      ...stripWorkspacePrivateFields(existingStoryboard),
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: storyboardId,
      title: stringValue(storyboard.title ?? existingStoryboard.title) ?? `${ownerTitle} storyboard`,
      order: finiteNumber(storyboard.order) ?? finiteNumber(existingStoryboard.order) ?? storyboardIndex + 1,
      slot: stringValue(storyboard.slot ?? existingStoryboard.slot) ?? String(storyboardId),
      asset_kind: stringValue(storyboard.asset_kind ?? existingStoryboard.asset_kind),
      scene_moment_ref: sceneMomentDir,
      ...(ownerKind === 'expression_unit' ? { expression_unit_ref: ownerDir } : {}),
      transition: normalizeTransition(storyboard.transition ?? existingStoryboard.transition),
      timeline: normalizeTimeline(storyboard.timeline ?? {
        gap_after_sec: storyboard.gap_after_sec,
        caption: storyboard.caption,
        duration_sec: storyboard.duration_sec,
      }, existingStoryboard.timeline),
      graph: isRecord(storyboard.graph) ? storyboard.graph : (isRecord(existingStoryboard.graph) ? existingStoryboard.graph : undefined),
      setting_refs: normalizeSettingRefs(storyboard.settings ?? settings, existingStoryboard.setting_refs),
      ...(storyboard.__delete === true ? { __delete: true } : {}),
    }))
    writtenPaths.push(storyboardPath)
  }
}

function normalizeSettingRefs(
  refs: MovScriptProductionWorkspaceSettingRefNode[] | undefined,
  fallback: unknown,
): Record<string, unknown>[] | undefined {
  if (!refs) return Array.isArray(fallback) ? fallback.filter(isRecord) : undefined
  return refs.map((ref) => pruneUndefined({
    setting_id: stableId(ref.id ?? ref.client_id ?? 'unassigned', 'setting'),
    setting_state_id: ref.setting_state_id ?? ref.setting_state_ref,
    role: stringValue(ref.role),
    notes: stringValue(ref.source_label),
    setting_kind: stringValue(ref.kind),
    state: isRecord(ref.state) ? ref.state : undefined,
    ...(ref.__delete === true ? { __delete: true } : {}),
  }))
}

function normalizeExpressionKind(value: unknown): string {
  const kind = stringValue(value)
  if (kind === 'shot') return 'shot'
  if (kind === 'dialogue' || kind === 'narration' || kind === 'subtitle' || kind === 'caption' || kind === 'action' || kind === 'shot') return kind
  if (kind === 'visual' || kind === 'visual_note') return 'visual_note'
  return 'dialogue'
}

function normalizeTransition(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  return pruneUndefined({
    in: stringValue(value.in),
    out: stringValue(value.out),
    notes: stringValue(value.notes),
  })
}

function normalizeTimeline(
  value: unknown,
  fallback: unknown,
): Record<string, unknown> | undefined {
  const source = isRecord(value) ? value : (isRecord(fallback) ? fallback : {})
  const timeline = pruneUndefined({
    gap_after_sec: finiteNumber(source.gap_after_sec),
    caption: stringValue(source.caption),
    duration_sec: finiteNumber(source.duration_sec),
  })
  return Object.keys(timeline).length ? timeline : undefined
}

function normalizeAudioCueKind(value: unknown): string {
  const kind = stringValue(value)
  if (kind === 'sound_effect' || kind === 'music' || kind === 'ambience' || kind === 'dialogue' || kind === 'foley' || kind === 'other') return kind
  if (kind === 'sound') return 'sound_effect'
  if (kind === 'music_beat') return 'music'
  return 'sound_effect'
}

function normalizeStoryboardRef(value: unknown): string | undefined {
  return stringValue(value)
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
  return semanticEntityId(value, prefix)
}

function slugId(value: unknown, prefix: string): string {
  return entityPathSlug(value, prefix)
}

function nullableRef(value: unknown, prefix: string): string | null | undefined {
  if (value === null) return null
  if (value === undefined || String(value).trim() === '') return undefined
  return stableId(value, prefix)
}

function displayId(value: string, prefix: string): string {
  return displayEntityId(value, prefix)
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

function isString(value: unknown): value is string {
  return typeof value === 'string'
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
