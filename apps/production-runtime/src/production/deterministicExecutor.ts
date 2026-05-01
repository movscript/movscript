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

    if (action.type === 'AnalyzeScriptToSections') {
      completeStep(run, 'analyze', 'Split source text into script section candidates.')
      const candidates = buildScriptSectionCandidates(action, run.id)
      if (candidates.length === 0) {
        throw new Error('AnalyzeScriptToSections requires inputContext.source_text or inputContext.sourceText')
      }
      completeStep(run, 'validate', `Validated ${candidates.length} script section candidate(s).`)
      for (const candidate of candidates) run.candidates.push(candidate)
      completeStep(run, 'write_candidate', `Created ${candidates.length} runtime candidate(s); no V2 data action was called.`)
      completeStep(run, 'request_approval', 'Candidates require explicit user acceptance before becoming facts.')
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

function buildScriptSectionCandidates(action: ProductionAction, runId: string): ProductionCandidate[] {
  const sourceText = getString(action.inputContext, 'source_text') ?? getString(action.inputContext, 'sourceText')
  if (!sourceText?.trim()) return []

  const sections = splitIntoSections(sourceText)
  return sections.map((section, index) => ({
    id: makeId('production_candidate'),
    type: 'script_section',
    projectId: action.projectId,
    sourceActionId: action.id,
    sourceRunId: runId,
    targetObject: action.sourceObject,
    status: 'candidate',
    payload: {
      client_id: `section-${index + 1}`,
      order: index + 1,
      title: section.title,
      summary: section.summary,
      source_range: {
        start: section.start,
        end: section.end,
      },
      confidence: section.confidence,
      confirm_question: '是否采用这个剧本节拆分？',
    },
    confidence: section.confidence,
    evidence: [`source_text:${section.start}-${section.end}`],
    createdAt: isoNow(),
  }))
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

function splitIntoSections(sourceText: string): Array<{ title: string; summary: string; start: number; end: number; confidence: number }> {
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
      title: inferSectionTitle(chunk, index),
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

function inferSectionTitle(chunk: string, index: number): string {
  const line = cleanWhitespace(chunk).split(/[。！？.!?]/)[0]?.trim()
  return line ? truncate(line, 32) : `Section ${index + 1}`
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

function getRecordArray(record: Record<string, JSONValue>, key: string): Array<Record<string, JSONValue>> | undefined {
  const value = record[key]
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is Record<string, JSONValue> => !!item && typeof item === 'object' && !Array.isArray(item))
}

function getRowString(row: Record<string, JSONValue>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
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
