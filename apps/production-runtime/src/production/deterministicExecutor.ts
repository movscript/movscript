import type { JSONValue } from '../types.js'
import type {
  ProductionAction,
  ProductionCandidate,
  ProductionRun,
  ProductionRunStep,
} from './types.js'

export function executeDeterministicProductionAction(action: ProductionAction): ProductionRun {
  const now = isoNow()
  const run: ProductionRun = {
    id: makeId('production_run'),
    actionId: action.id,
    actionType: action.type,
    status: 'running',
    projectId: action.projectId,
    steps: [],
    candidates: [],
    warnings: [],
    createdAt: now,
    startedAt: now,
  }

  try {
    completeStep(run, 'read_context', summarizeContext(action.inputContext))

    if (action.type === 'AnalyzeScriptToSegments') {
      completeStep(run, 'analyze', 'Split source text into segment candidates.')
      const candidates = buildSegmentCandidates(action, run.id)
      if (candidates.length === 0) {
        throw new Error('AnalyzeScriptToSegments requires inputContext.source_text or inputContext.sourceText')
      }
      completeStep(run, 'validate', `Validated ${candidates.length} segment candidate(s).`)
      for (const candidate of candidates) run.candidates.push(candidate)
      completeStep(run, 'write_candidate', `Created ${candidates.length} runtime candidate(s); no V2 data action was called.`)
      completeStep(run, 'request_approval', 'Candidates require explicit user acceptance before becoming facts.')
    } else if (action.type === 'ExtractSceneMoments') {
      completeStep(run, 'analyze', 'Extract deterministic scene moment candidates from segments, storyboard rows, or source text.')
      const candidates = buildSceneMomentCandidates(action, run.id)
      if (candidates.length === 0) {
        throw new Error('ExtractSceneMoments requires inputContext.segments, inputContext.storyboard_rows, or inputContext.source_text')
      }
      completeStep(run, 'validate', `Validated ${candidates.length} scene moment candidate(s).`)
      for (const candidate of candidates) run.candidates.push(candidate)
      completeStep(run, 'write_candidate', `Created ${candidates.length} runtime candidate(s); no V2 data action was called.`)
      completeStep(run, 'request_approval', 'Scene moment candidates require explicit user acceptance before becoming facts.')
    } else if (action.type === 'GenerateStoryboardScript') {
      completeStep(run, 'generate', 'Generate deterministic storyboard script candidates from Segments and SceneMoments.')
      const candidates = buildStoryboardScriptCandidates(action, run.id)
      if (candidates.length === 0) {
        throw new Error('GenerateStoryboardScript requires inputContext.segments or inputContext.scene_moments')
      }
      completeStep(run, 'validate', `Validated ${candidates.length} storyboard script candidate(s).`)
      for (const candidate of candidates) run.candidates.push(candidate)
      completeStep(run, 'write_candidate', `Created ${candidates.length} runtime candidate(s); no V2 data action was called.`)
      completeStep(run, 'request_approval', 'Storyboard script candidates require explicit user acceptance before becoming facts.')
    } else if (action.type === 'GenerateKeyframeCandidates') {
      completeStep(run, 'generate', 'Generate deterministic keyframe candidates from storyboard rows or content units.')
      const candidates = buildKeyframeCandidates(action, run.id)
      if (candidates.length === 0) {
        throw new Error('GenerateKeyframeCandidates requires inputContext.storyboard_rows or inputContext.content_units')
      }
      completeStep(run, 'validate', `Validated ${candidates.length} keyframe candidate(s).`)
      for (const candidate of candidates) run.candidates.push(candidate)
      completeStep(run, 'write_candidate', `Created ${candidates.length} runtime candidate(s); no V2 data action was called.`)
      completeStep(run, 'request_approval', 'Candidates require explicit user acceptance before becoming facts.')
    } else {
      run.warnings.push(`${action.type} is registered but does not have a deterministic executor yet.`)
      completeStep(run, 'validate', 'No deterministic executor available for this action type.')
    }

    run.status = run.candidates.length > 0 ? 'waiting_approval' : 'succeeded'
    run.finishedAt = isoNow()
    return run
  } catch (error) {
    run.status = 'failed'
    run.error = error instanceof Error ? error.message : String(error)
    run.finishedAt = isoNow()
    return run
  }
}

function buildStoryboardScriptCandidates(action: ProductionAction, runId: string): ProductionCandidate[] {
  const segments = getRecordArray(action.inputContext, 'segments') ?? []
  const sceneMoments = getRecordArray(action.inputContext, 'scene_moments') ?? getRecordArray(action.inputContext, 'sceneMoments') ?? []
  const storyboardRows = getRecordArray(action.inputContext, 'storyboard_rows') ?? getRecordArray(action.inputContext, 'storyboardRows') ?? []
  const sources = segments.length > 0 ? segments.slice(0, 24) : sceneMoments.slice(0, 24)
  if (sources.length === 0) return []

  const durationTarget = getNumber(action.inputContext, 'duration_target') ?? getNumber(action.inputContext, 'durationTarget')
  const targetDuration = durationTarget && durationTarget > 0 ? Math.max(3, Math.round(durationTarget / sources.length)) : undefined

  return sources.map((source, index) => {
    const sourceSegmentId = inferSourceSegmentId(source)
    const matchedSceneMoment = findMatchingSceneMoment(sceneMoments, source, index)
    const sceneMomentId = matchedSceneMoment ? inferSceneMomentId(matchedSceneMoment) : undefined
    const existingStoryboardRow = findMatchingStoryboardRow(storyboardRows, sourceSegmentId, index)
    const title = getRowString(source, ['title', 'name', 'heading']) ?? getRowString(matchedSceneMoment ?? {}, ['title', 'name']) ?? `Storyboard ${index + 1}`
    const summary = getRowString(source, ['summary', 'description', 'content', 'body', 'text'])
      ?? getRowString(matchedSceneMoment ?? {}, ['summary', 'description', 'content', 'body', 'text'])
      ?? title
    const location = getRowString(matchedSceneMoment ?? source, ['location', 'location_text', 'locationText', 'where'])
    const timeOfDay = getRowString(matchedSceneMoment ?? source, ['time_of_day', 'timeOfDay', 'time_text', 'timeText', 'when'])
    const durationSeconds = targetDuration ?? getRowNumber(source, ['duration_seconds', 'durationSeconds', 'duration']) ?? getRowNumber(matchedSceneMoment ?? {}, ['duration_seconds', 'durationSeconds', 'duration']) ?? 8
    const adoptionIntent = existingStoryboardRow ? 'revise_existing_storyboard_row' : 'append_storyboard_row'

    return {
      id: makeId('production_candidate'),
      type: 'storyboard_script',
      projectId: action.projectId,
      sourceActionId: action.id,
      sourceRunId: runId,
      targetObject: action.sourceObject,
      status: 'candidate',
      payload: {
        client_id: `storyboard-script-${index + 1}`,
        order: index + 1,
        title,
        body: buildStoryboardBody(summary, location, timeOfDay),
        duration_seconds: durationSeconds,
        status: '待确认',
        adoption_intent: adoptionIntent,
        ...(sourceSegmentId ? { source_segment_id: sourceSegmentId } : {}),
        ...(sceneMomentId ? { scene_moment_id: sceneMomentId } : {}),
        source_ref: {
          type: segments.length > 0 ? 'segment' : 'scene_moment',
          value: normalizeJSON(source),
          ...(matchedSceneMoment ? { scene_moment: normalizeJSON(matchedSceneMoment) } : {}),
          ...(existingStoryboardRow ? { existing_storyboard_row: normalizeJSON(existingStoryboardRow) } : {}),
        },
        confirm_question: '是否采用这个分镜脚本候选？',
      },
      confidence: existingStoryboardRow ? 0.58 : 0.62,
      evidence: [
        `${segments.length > 0 ? 'segment' : 'scene_moment'}:${sourceSegmentId ?? sceneMomentId ?? index + 1}`,
        ...(existingStoryboardRow ? [`existing_storyboard_row:${getRowString(existingStoryboardRow, ['client_id', 'id']) ?? index + 1}`] : []),
      ],
      createdAt: isoNow(),
    } satisfies ProductionCandidate
  })
}

function inferSourceSegmentId(row: Record<string, JSONValue>): string | undefined {
  return getRowString(row, ['source_segment_id', 'sourceSegmentId', 'segment_id', 'segmentId', 'client_id', 'clientId', 'id'])
}

function inferSceneMomentId(row: Record<string, JSONValue>): string | undefined {
  return getRowString(row, ['scene_moment_id', 'sceneMomentId', 'client_id', 'clientId', 'id'])
}

function findMatchingSceneMoment(
  sceneMoments: Array<Record<string, JSONValue>>,
  segment: Record<string, JSONValue>,
  index: number,
): Record<string, JSONValue> | undefined {
  if (sceneMoments.length === 0) return undefined
  const sourceSegmentId = inferSourceSegmentId(segment)
  const segmentOrder = getRowNumber(segment, ['order'])
  return sceneMoments.find((sceneMoment) => {
    const sceneMomentSourceSegmentId = getRowString(sceneMoment, ['source_segment_id', 'sourceSegmentId', 'segment_id', 'segmentId'])
    if (sourceSegmentId && sceneMomentSourceSegmentId === sourceSegmentId) return true
    const sceneMomentOrder = getRowNumber(sceneMoment, ['order'])
    return segmentOrder !== undefined && sceneMomentOrder === segmentOrder
  }) ?? sceneMoments[index]
}

function findMatchingStoryboardRow(
  rows: Array<Record<string, JSONValue>>,
  sourceSegmentId: string | undefined,
  index: number,
): Record<string, JSONValue> | undefined {
  if (rows.length === 0) return undefined
  const matchedBySegment = sourceSegmentId
    ? rows.find((row) => getRowString(row, ['source_segment_id', 'sourceSegmentId', 'segment_id', 'segmentId']) === sourceSegmentId)
    : undefined
  return matchedBySegment ?? rows.find((row) => getRowNumber(row, ['order']) === index + 1)
}

function buildStoryboardBody(summary: string, location: string | undefined, timeOfDay: string | undefined): string {
  const context = [location, timeOfDay].filter(Boolean).join(' / ')
  return context ? `${summary}\n场景：${context}` : summary
}

function buildSegmentCandidates(action: ProductionAction, runId: string): ProductionCandidate[] {
  const sourceText = getString(action.inputContext, 'source_text') ?? getString(action.inputContext, 'sourceText')
  if (!sourceText?.trim()) return []

  const segments = splitIntoSegments(sourceText)
  return segments.map((segment, index) => ({
    id: makeId('production_candidate'),
    type: 'segment',
    projectId: action.projectId,
    sourceActionId: action.id,
    sourceRunId: runId,
    targetObject: action.sourceObject,
    status: 'candidate',
    payload: {
      client_id: `segment-${index + 1}`,
      order: index + 1,
      title: segment.title,
      summary: segment.summary,
      source_range: {
        start: segment.start,
        end: segment.end,
      },
      confidence: segment.confidence,
      confirm_question: '是否采用这个片段拆分？',
    },
    confidence: segment.confidence,
    evidence: [`source_text:${segment.start}-${segment.end}`],
    createdAt: isoNow(),
  }))
}

function buildSceneMomentCandidates(action: ProductionAction, runId: string): ProductionCandidate[] {
  const segments = getRecordArray(action.inputContext, 'segments')
  if (segments && segments.length > 0) {
    return segments.slice(0, 24).map((segment, index) => buildSceneMomentCandidateFromRecord(action, runId, segment, index, 'segment'))
  }

  const storyboardRows = getRecordArray(action.inputContext, 'storyboard_rows') ?? getRecordArray(action.inputContext, 'storyboardRows')
  if (storyboardRows && storyboardRows.length > 0) {
    return storyboardRows.slice(0, 24).map((row, index) => buildSceneMomentCandidateFromRecord(action, runId, row, index, 'storyboard_row'))
  }

  const sourceText = getString(action.inputContext, 'source_text') ?? getString(action.inputContext, 'sourceText')
  if (!sourceText?.trim()) return []

  return splitIntoSegments(sourceText).slice(0, 24).map((segment, index) => ({
    id: makeId('production_candidate'),
    type: 'scene_moment',
    projectId: action.projectId,
    sourceActionId: action.id,
    sourceRunId: runId,
    targetObject: action.sourceObject,
    status: 'candidate',
    payload: {
      client_id: `scene-moment-${index + 1}`,
      order: index + 1,
      title: segment.title,
      summary: segment.summary,
      source_ref: {
        type: 'source_text',
        source_range: {
          start: segment.start,
          end: segment.end,
        },
      },
      confirm_question: '是否采用这个情节候选？',
    },
    confidence: 0.58,
    evidence: [`source_text:${segment.start}-${segment.end}`],
    createdAt: isoNow(),
  }))
}

function buildSceneMomentCandidateFromRecord(
  action: ProductionAction,
  runId: string,
  row: Record<string, JSONValue>,
  index: number,
  sourceType: 'segment' | 'storyboard_row',
): ProductionCandidate {
  const summary = getRowString(row, ['summary', 'description', 'content', 'body', 'text', 'visual_prompt', 'visualPrompt'])
  const title = getRowString(row, ['title', 'name', 'heading', 'shot']) ?? inferSegmentTitle(summary ?? '', index)
  const location = getRowString(row, ['location', 'location_text', 'locationText', 'where'])
  const timeOfDay = getRowString(row, ['time_of_day', 'timeOfDay', 'time_text', 'timeText', 'when'])
  const characters = getStringArray(row, 'characters') ?? splitList(getRowString(row, ['character_names', 'characterNames', 'participants']))

  return {
    id: makeId('production_candidate'),
    type: 'scene_moment',
    projectId: action.projectId,
    sourceActionId: action.id,
    sourceRunId: runId,
    targetObject: action.sourceObject,
    status: 'candidate',
    payload: {
      client_id: `scene-moment-${index + 1}`,
      order: index + 1,
      title,
      summary: summary ?? title,
      ...(location ? { location } : {}),
      ...(timeOfDay ? { time_of_day: timeOfDay } : {}),
      ...(characters && characters.length > 0 ? { characters } : {}),
      source_ref: {
        type: sourceType,
        value: normalizeJSON(row),
      },
      confirm_question: '是否采用这个情节候选？',
    },
    confidence: sourceType === 'segment' ? 0.64 : 0.6,
    evidence: [`${sourceType}:${getRowString(row, ['client_id', 'id']) ?? index + 1}`],
    createdAt: isoNow(),
  }
}

function buildKeyframeCandidates(action: ProductionAction, runId: string): ProductionCandidate[] {
  const sourceRows = getRecordArray(action.inputContext, 'storyboard_rows') ?? getRecordArray(action.inputContext, 'storyboardRows') ?? getRecordArray(action.inputContext, 'content_units') ?? getRecordArray(action.inputContext, 'contentUnits') ?? []
  return sourceRows.slice(0, 12).map((row, index) => {
    const title = getRowString(row, ['title', 'shot', 'summary', 'description']) ?? `Keyframe ${index + 1}`
    const prompt = getRowString(row, ['visual_prompt', 'visualPrompt', 'description', 'summary']) ?? title
    return {
      id: makeId('production_candidate'),
      type: 'keyframe',
      projectId: action.projectId,
      sourceActionId: action.id,
      sourceRunId: runId,
      targetObject: action.sourceObject,
      status: 'candidate',
      payload: {
        client_id: `keyframe-${index + 1}`,
        order: index + 1,
        title,
        visual_prompt: prompt,
        source_ref: normalizeJSON(row),
        confidence: 0.62,
      },
      confidence: 0.62,
      evidence: [`input_row:${index + 1}`],
      createdAt: isoNow(),
    } satisfies ProductionCandidate
  })
}

function splitIntoSegments(sourceText: string): Array<{ title: string; summary: string; start: number; end: number; confidence: number }> {
  const paragraphs = sourceText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  const chunks = paragraphs.length > 1 ? paragraphs : chunkBySentence(sourceText)
  let cursor = 0
  return chunks.map((chunk, index) => {
    const start = sourceText.indexOf(chunk, cursor)
    const safeStart = start >= 0 ? start : cursor
    const end = safeStart + chunk.length
    cursor = end
    return {
      title: inferSegmentTitle(chunk, index),
      summary: truncate(cleanWhitespace(chunk), 140),
      start: safeStart,
      end,
      confidence: 0.66,
    }
  })
}

function chunkBySentence(sourceText: string): string[] {
  const sentences = sourceText
    .split(/(?<=[。！？.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  if (sentences.length <= 1) return sourceText.trim() ? [sourceText.trim()] : []

  const chunks: string[] = []
  for (let index = 0; index < sentences.length; index += 3) {
    chunks.push(sentences.slice(index, index + 3).join(' '))
  }
  return chunks
}

function completeStep(run: ProductionRun, type: ProductionRunStep['type'], outputSummary: string): void {
  const now = isoNow()
  run.steps.push({
    id: makeId('production_step'),
    runId: run.id,
    type,
    status: 'succeeded',
    startedAt: now,
    finishedAt: now,
    outputSummary,
  })
}

function summarizeContext(inputContext: Record<string, JSONValue>): string {
  const keys = Object.keys(inputContext)
  return keys.length > 0 ? `Context keys: ${keys.join(', ')}` : 'No input context keys provided.'
}

function inferSegmentTitle(chunk: string, index: number): string {
  const line = cleanWhitespace(chunk).split(/[。！？.!?]/)[0]?.trim()
  return line ? truncate(line, 32) : `Segment ${index + 1}`
}

function cleanWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value
}

function getString(record: Record<string, JSONValue>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function getNumber(record: Record<string, JSONValue>, key: string): number | undefined {
  const value = record[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function getRecordArray(record: Record<string, JSONValue>, key: string): Array<Record<string, JSONValue>> | undefined {
  const value = record[key]
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is Record<string, JSONValue> => !!item && typeof item === 'object' && !Array.isArray(item))
}

function getRowString(row: Record<string, JSONValue>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function getRowNumber(row: Record<string, JSONValue>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function getStringArray(row: Record<string, JSONValue>, key: string): string[] | undefined {
  const value = row[key]
  if (!Array.isArray(value)) return undefined
  const strings = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
  return strings.length > 0 ? strings : undefined
}

function splitList(value: string | undefined): string[] | undefined {
  if (!value) return undefined
  const items = value
    .split(/[、,，/]/)
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length > 0 ? items : undefined
}

function normalizeJSON(value: JSONValue): JSONValue {
  return JSON.parse(JSON.stringify(value)) as JSONValue
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function isoNow(): string {
  return new Date().toISOString()
}
