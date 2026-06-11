import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backendGet, backendGetBinary, backendPost } from '../../../../backend/node/client.js'
import { clampNumber, getOptionalNumeric, getOptionalString } from '../../../tools/shared/params.js'
import { isRecord } from '../../../tools/shared/record.js'
import { resolveFFmpegPath } from '../resource-media/ffmpegPath.js'

interface ShotLibraryPageRequest {
  query?: string
  page?: number
  pageSize?: number
  groupId?: number
}

type ShotCutSegment = { startSec: number; endSec: number }

const DEFAULT_SCENE_THRESHOLD = 0.28
const DEFAULT_MIN_SHOT_DURATION_SEC = 1.2
const DEFAULT_MAX_SHOT_DURATION_SEC = 12
const DEFAULT_TARGET_SHOT_DURATION_SEC = 6
const DEFAULT_MAX_VIDEO_BYTES = 200 * 1024 * 1024
const ABSOLUTE_MAX_VIDEO_BYTES = 1024 * 1024 * 1024

export async function queryShotLibrary(args: Record<string, unknown>): Promise<unknown> {
  const id = getOptionalNumeric(args, 'shot_reference_id')
    ?? getOptionalNumeric(args, 'shotReferenceId')
    ?? getOptionalNumeric(args, 'id')
  const includeFull = booleanParam(args.include_full) ?? booleanParam(args.includeFull) ?? false
  const query = getOptionalString(args, 'query') ?? getOptionalString(args, 'q') ?? ''
  const groupId = positiveIntegerParam(args, 'group_id') ?? positiveIntegerParam(args, 'groupId')
  const page = Math.floor(clampNumber(getOptionalNumeric(args, 'page') ?? 1, 1, 10000))
  const pageSize = Math.floor(clampNumber(
    getOptionalNumeric(args, 'page_size')
      ?? getOptionalNumeric(args, 'pageSize')
      ?? getOptionalNumeric(args, 'limit')
      ?? getOptionalNumeric(args, 'topK')
      ?? 20,
    1,
    100,
  ))
  const pageData = await fetchShotLibraryPage({ query, page, pageSize, groupId })
  const items = Array.isArray(pageData.items) ? pageData.items : []
  const summarized = items.map(item => summarizeShotReference(item, { includeFull }))
  const filtered = id === undefined ? summarized : summarized.filter(item => shotReferenceId(item) === id)

  return {
    query,
    page: numberField(pageData, 'page') ?? page,
    pageSize: numberField(pageData, 'page_size') ?? pageSize,
    total: numberField(pageData, 'total') ?? filtered.length,
    count: filtered.length,
    items: filtered,
    ...(id !== undefined && filtered.length === 0 ? { warning: `shot_reference_id ${id} was not found on the requested page` } : {}),
  }
}

export async function createShotGroup(args: Record<string, unknown>): Promise<unknown> {
  const resourceId = requiredPositiveInteger(args, ['resource_id', 'resourceId'], 'resource_id')
  const body: Record<string, unknown> = {
    resource_id: resourceId,
  }
  const title = getOptionalString(args, 'title')
  const summary = getOptionalString(args, 'summary')
  const cutStrategy = getOptionalString(args, 'cut_strategy') ?? getOptionalString(args, 'cutStrategy')
  if (title) body.title = title
  if (summary) body.summary = summary
  if (cutStrategy) body.cut_strategy = cutStrategy
  const group = await backendPost('/shot-reference-groups', body)
  const groupId = idField(group)
  if (groupId === undefined) throw new Error('shot group create response did not include a valid group ID')
  return {
    status: 'created',
    group_id: groupId,
    group,
    message: `Shot group #${groupId} created for resource #${resourceId}.`,
  }
}

export async function getShotGroup(args: Record<string, unknown>): Promise<unknown> {
  const groupId = requiredPositiveInteger(args, ['group_id', 'groupId', 'id'], 'group_id')
  const detail = await backendGet(`/shot-reference-groups/${encodeURIComponent(String(groupId))}`)
  const group = isRecord(detail) && isRecord(detail.group) ? detail.group : {}
  const shots = isRecord(detail) && Array.isArray(detail.shots) ? detail.shots : []
  return {
    status: 'loaded',
    group_id: groupId,
    group,
    count: shots.length,
    shots: shots.map((shot) => summarizeShotReference(shot, { includeFull: true })),
  }
}

export async function addShotsToGroup(args: Record<string, unknown>): Promise<unknown> {
  const groupId = requiredPositiveInteger(args, ['group_id', 'groupId'], 'group_id')
  const rawShots = Array.isArray(args.shots) ? args.shots : []
  if (rawShots.length === 0) throw new Error('shots must contain at least one shot range or metadata object')
  const groupDetail = await backendGet(`/shot-reference-groups/${encodeURIComponent(String(groupId))}`)
  const group = isRecord(groupDetail) && isRecord(groupDetail.group) ? groupDetail.group : {}
  const groupResourceId = positiveIntegerValue(group.source_resource_id) ?? positiveIntegerValue(group.sourceResourceId)
  const resourceId = positiveIntegerParam(args, 'resource_id') ?? positiveIntegerParam(args, 'resourceId') ?? groupResourceId
  if (resourceId === undefined) throw new Error('resource_id is required when the shot group response has no source_resource_id')
  const body: Record<string, unknown> = {
    resource_id: resourceId,
    group_id: groupId,
    shots: rawShots.map(normalizeShotInput),
  }
  const durationSec = getOptionalNumeric(args, 'duration_sec') ?? getOptionalNumeric(args, 'durationSec')
  const width = getOptionalNumeric(args, 'width')
  const height = getOptionalNumeric(args, 'height')
  if (durationSec !== undefined) body.duration_sec = durationSec
  if (width !== undefined) body.width = Math.floor(width)
  if (height !== undefined) body.height = Math.floor(height)
  const result = await backendPost('/shot-references/from-resource', body)
  const shots = isRecord(result) && Array.isArray(result.items) ? result.items : []
  return {
    status: 'created',
    group_id: groupId,
    count: shots.length,
    shots: shots.map((shot) => summarizeShotReference(shot, { includeFull: true })),
    message: `${shots.length} shot reference(s) added to group #${groupId}.`,
  }
}

export async function analyzeVideoShotCuts(args: Record<string, unknown>): Promise<unknown> {
  const resourceId = requiredPositiveInteger(args, ['resource_id', 'resourceId', 'id'], 'resource_id')
  const maxVideoBytes = Math.floor(clampNumber(getOptionalNumeric(args, 'max_video_bytes') ?? getOptionalNumeric(args, 'maxVideoBytes') ?? DEFAULT_MAX_VIDEO_BYTES, 1, ABSOLUTE_MAX_VIDEO_BYTES))
  const ffmpeg = resolveFFmpegPath()
  if (!ffmpeg) throw new Error('ffmpeg is required for movscript_video_shot_cuts_analyze but was not found')
  const source = await backendGetBinary(`/resources/${encodeURIComponent(String(resourceId))}/file`, { maxBytes: maxVideoBytes })
  const dir = join(tmpdir(), `movscript-shot-cuts-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const inputPath = join(dir, `resource-${resourceId}.video`)
  await mkdir(dir, { recursive: true })
  try {
    await writeFile(inputPath, source.bytes)
    const probed: { durationSec?: number } = await probeVideo(inputPath, ffmpeg).catch(() => ({}))
    const durationSec = positiveNumber(getOptionalNumeric(args, 'duration_sec') ?? getOptionalNumeric(args, 'durationSec')) ?? probed.durationSec
    if (!durationSec) throw new Error('duration_sec is required when ffprobe cannot read video duration')
    const sceneThreshold = positiveNumber(getOptionalNumeric(args, 'scene_threshold') ?? getOptionalNumeric(args, 'sceneThreshold')) ?? DEFAULT_SCENE_THRESHOLD
    const sceneOutput = await runFFmpeg(ffmpeg, [
      '-hide_banner',
      '-i', inputPath,
      '-filter:v', `select='gt(scene,${sceneThreshold})',showinfo`,
      '-an',
      '-f', 'null',
      '-',
    ]).catch((error) => {
      throw error instanceof Error ? error : new Error(String(error))
    })
    const sceneTimes = parseSceneDetectTimes(sceneOutput)
    const shots = buildSceneShotSegments(durationSec, sceneTimes, {
      minShotDurationSec: getOptionalNumeric(args, 'min_shot_duration_sec') ?? getOptionalNumeric(args, 'minShotDurationSec'),
      maxShotDurationSec: getOptionalNumeric(args, 'max_shot_duration_sec') ?? getOptionalNumeric(args, 'maxShotDurationSec'),
    })
    const finalShots = shots.length > 0 ? shots : buildEvenShotSegments(durationSec)
    return {
      status: 'analyzed',
      resource_id: resourceId,
      strategy: shots.length > 0 ? 'scene_detection' : 'even',
      duration_sec: roundTime(durationSec),
      count: finalShots.length,
      shots: finalShots.map((shot, index) => ({
        index: index + 1,
        start_sec: shot.startSec,
        end_sec: shot.endSec,
        startSec: shot.startSec,
        endSec: shot.endSec,
      })),
      ...(sceneTimes.length === 0 ? { warning: 'No scene boundaries were detected; returned even fallback segments.' } : {}),
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function readShotLibrary(uri: string): Promise<unknown> {
  const parsed = parseShotLibraryURI(uri)
  if (!parsed) throw new Error(`Unsupported shot library resource URI: ${uri}`)
  return queryShotLibrary({
    ...(parsed.id !== undefined ? { shot_reference_id: parsed.id, limit: 100 } : {}),
    ...(parsed.query ? { query: parsed.query } : {}),
    ...(parsed.page !== undefined ? { page: parsed.page } : {}),
    ...(parsed.pageSize !== undefined ? { page_size: parsed.pageSize } : {}),
    include_full: true,
  })
}

export function isShotLibraryURI(uri: string): boolean {
  return parseShotLibraryURI(uri) !== null
}

function parseShotLibraryURI(uri: string): { id?: number; query?: string; page?: number; pageSize?: number } | null {
  const match = uri.match(/^movscript:\/\/shot-library(?:\/(\d+))?(?:\?(.*))?$/)
  if (!match) return null
  const params = new URLSearchParams(match[2] ?? '')
  const page = numericParam(params.get('page'))
  const pageSize = numericParam(params.get('page_size') ?? params.get('pageSize') ?? params.get('limit'))
  return {
    ...(match[1] ? { id: Number(match[1]) } : {}),
    ...(params.get('query') || params.get('q') ? { query: params.get('query') ?? params.get('q') ?? '' } : {}),
    ...(page !== undefined ? { page } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
  }
}

async function fetchShotLibraryPage(input: ShotLibraryPageRequest): Promise<Record<string, unknown>> {
  const params = new URLSearchParams()
  params.set('page', String(input.page ?? 1))
  params.set('page_size', String(input.pageSize ?? 20))
  if (input.query?.trim()) params.set('q', input.query.trim())
  if (input.groupId !== undefined) params.set('group_id', String(input.groupId))
  const data = await backendGet(`/shot-references?${params.toString()}`)
  return isRecord(data) ? data : { items: [] }
}

function summarizeShotReference(item: unknown, options: { includeFull: boolean }): unknown {
  if (!isRecord(item)) return item
  if (options.includeFull) return item
  const resource = isRecord(item.resource) ? item.resource : undefined
  const group = isRecord(item.group) ? item.group : undefined
  return {
    ...picked(item, ['ID', 'id', 'title', 'summary', 'analysis_status', 'analysis_source', 'intent', 'pattern', 'shot_function', 'visual_preference', 'emotional_effect', 'start_sec', 'end_sec', 'retrieval_text', 'CreatedAt', 'UpdatedAt']),
    resource: resource ? picked(resource, ['ID', 'id', 'name', 'mime_type', 'type', 'url', 'size']) : undefined,
    group: group ? picked(group, ['ID', 'id', 'title', 'summary', 'analysis_status', 'cut_strategy']) : undefined,
    execution_details: isRecord(item.execution_details) ? picked(item.execution_details, ['duration_sec', 'resolution', 'aspect_ratio', 'coverage_role', 'difficulty', 'blocking', 'requirements']) : undefined,
    search_index: isRecord(item.search_index) ? picked(item.search_index, ['natural_language_queries', 'tags', 'visual_facets', 'narrative_facets', 'emotion_facets', 'pattern_facets', 'production_facets']) : undefined,
  }
}

function picked(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (record[key] !== undefined) result[key] = truncateText(record[key])
  }
  return result
}

function truncateText(value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value.length > 1200 ? `${value.slice(0, 1200)}...` : value
}

function shotReferenceId(item: unknown): number | undefined {
  if (!isRecord(item)) return undefined
  return typeof item.ID === 'number' ? item.ID : typeof item.id === 'number' ? item.id : undefined
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  return typeof record[key] === 'number' && Number.isFinite(record[key]) ? record[key] : undefined
}

function numericParam(value: string | null): number | undefined {
  if (!value?.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function booleanParam(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function normalizeShotInput(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('each shot must be an object')
  const shot: Record<string, unknown> = {}
  copyString(value, shot, 'title')
  copyString(value, shot, 'summary')
  copyArray(value, shot, 'intent')
  copyArray(value, shot, 'pattern')
  copyArray(value, shot, 'shot_function', 'shotFunction')
  copyArray(value, shot, 'visual_preference', 'visualPreference')
  copyArray(value, shot, 'emotional_effect', 'emotionalEffect')
  copyObject(value, shot, 'execution_details', 'executionDetails')
  copyObject(value, shot, 'visual_analysis', 'visualAnalysis')
  copyObject(value, shot, 'scene_semantics', 'sceneSemantics')
  copyObject(value, shot, 'narrative_function', 'narrativeFunction')
  copyObject(value, shot, 'emotional_profile', 'emotionalProfile')
  copyObject(value, shot, 'reusable_pattern', 'reusablePattern')
  const startSec = numberValue(value.start_sec) ?? numberValue(value.startSec)
  const endSec = numberValue(value.end_sec) ?? numberValue(value.endSec)
  if (startSec !== undefined) {
    shot.start_sec = startSec
    shot.start_sec_set = true
  }
  if (endSec !== undefined) {
    shot.end_sec = endSec
    shot.end_sec_set = true
  }
  return shot
}

function copyString(input: Record<string, unknown>, out: Record<string, unknown>, key: string, alias?: string): void {
  const value = stringValue(input[key]) ?? (alias ? stringValue(input[alias]) : undefined)
  if (value !== undefined) out[key] = value
}

function copyArray(input: Record<string, unknown>, out: Record<string, unknown>, key: string, alias?: string): void {
  const value = arrayValue(input[key]) ?? (alias ? arrayValue(input[alias]) : undefined)
  if (value !== undefined) out[key] = value
}

function copyObject(input: Record<string, unknown>, out: Record<string, unknown>, key: string, alias?: string): void {
  const value = isRecord(input[key]) ? input[key] : alias && isRecord(input[alias]) ? input[alias] : undefined
  if (value !== undefined) out[key] = value
}

function requiredPositiveInteger(args: Record<string, unknown>, keys: string[], label: string): number {
  for (const key of keys) {
    const value = positiveIntegerParam(args, key)
    if (value !== undefined) return value
  }
  throw new Error(`${label} must be a positive integer`)
}

function positiveIntegerParam(args: Record<string, unknown>, key: string): number | undefined {
  return positiveIntegerValue(args[key])
}

function positiveIntegerValue(value: unknown): number | undefined {
  const number = numberValue(value)
  return number !== undefined && Number.isInteger(number) && number > 0 ? number : undefined
}

function idField(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined
  return positiveIntegerValue(value.ID) ?? positiveIntegerValue(value.id)
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(number) ? number : undefined
}

function positiveNumber(value: unknown): number | undefined {
  const number = numberValue(value)
  return number !== undefined && number > 0 ? number : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function parseSceneDetectTimes(output: string): number[] {
  const times = new Set<number>()
  for (const match of output.matchAll(/\bpts_time:([0-9]+(?:\.[0-9]+)?)/g)) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value > 0) times.add(roundTime(value))
  }
  return Array.from(times).sort((a, b) => a - b)
}

function buildSceneShotSegments(
  durationSec: number,
  sceneTimes: number[],
  input: { minShotDurationSec?: number; maxShotDurationSec?: number } = {},
): ShotCutSegment[] {
  const minDuration = positiveNumber(input.minShotDurationSec) ?? DEFAULT_MIN_SHOT_DURATION_SEC
  const maxDuration = positiveNumber(input.maxShotDurationSec) ?? DEFAULT_MAX_SHOT_DURATION_SEC
  const boundaries = normalizeSceneBoundaries(sceneTimes, durationSec, minDuration, maxDuration)
  return rangesFromBoundaries(durationSec, boundaries)
}

function buildEvenShotSegments(durationSec: number): ShotCutSegment[] {
  const segmentCount = Math.max(1, Math.ceil(durationSec / DEFAULT_TARGET_SHOT_DURATION_SEC))
  const segmentLength = durationSec / segmentCount
  return Array.from({ length: segmentCount }, (_item, index) => ({
    startSec: roundTime(index * segmentLength),
    endSec: roundTime(index === segmentCount - 1 ? durationSec : (index + 1) * segmentLength),
  }))
}

function normalizeSceneBoundaries(
  sceneTimes: number[],
  durationSec: number,
  minDurationSec: number,
  maxDurationSec: number,
): number[] {
  const boundaries: number[] = []
  let previous = 0
  const candidates = sceneTimes
    .map(roundTime)
    .filter(time => time > 0 && time < durationSec)
    .sort((a, b) => a - b)
  for (const candidate of candidates) {
    addForcedBoundaries(boundaries, previous, candidate, maxDurationSec)
    previous = boundaries[boundaries.length - 1] ?? previous
    if (candidate - previous >= minDurationSec && durationSec - candidate >= minDurationSec) {
      boundaries.push(candidate)
      previous = candidate
    }
  }
  addForcedBoundaries(boundaries, previous, durationSec, maxDurationSec)
  return boundaries
}

function addForcedBoundaries(boundaries: number[], startSec: number, endSec: number, maxDurationSec: number): void {
  let cursor = startSec
  while (maxDurationSec > 0 && endSec - cursor > maxDurationSec) {
    cursor = roundTime(cursor + maxDurationSec)
    if (cursor < endSec) boundaries.push(cursor)
  }
}

function rangesFromBoundaries(durationSec: number, boundaries: number[]): ShotCutSegment[] {
  const points = [0, ...boundaries, durationSec]
  const result: ShotCutSegment[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const startSec = roundTime(points[index] ?? 0)
    const endSec = roundTime(points[index + 1] ?? 0)
    if (endSec > startSec) result.push({ startSec, endSec })
  }
  return result
}

async function probeVideo(inputPath: string, ffmpeg: string): Promise<{ durationSec?: number }> {
  const ffprobe = ffmpeg.replace(/ffmpeg(?:\.exe)?$/i, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
  const output = await runCommand(ffprobe, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'json',
    inputPath,
  ])
  const parsed = JSON.parse(output) as unknown
  const durationSec = isRecord(parsed) && isRecord(parsed.format) ? positiveNumber(parsed.format.duration) : undefined
  return durationSec ? { durationSec } : {}
}

function runFFmpeg(command: string, args: string[]): Promise<string> {
  return runCommand(command, args, true)
}

function runCommand(command: string, args: string[], acceptNonZero = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const appendStdout = (chunk: unknown) => { stdout += String(chunk) }
    const appendStderr = (chunk: unknown) => {
      stderr += String(chunk)
      if (stderr.length > 1024 * 1024) stderr = stderr.slice(stderr.length - 1024 * 1024)
    }
    child.stdout?.on('data', appendStdout)
    child.stderr?.on('data', appendStderr)
    child.on('error', (error) => reject(error instanceof Error ? error : new Error(String(error))))
    child.on('exit', (code) => {
      if (code === 0 || acceptNonZero) {
        resolve(`${stdout}\n${stderr}`)
        return
      }
      reject(new Error(stderr.trim() || `command exited with code ${code ?? 'unknown'}`))
    })
  })
}

function roundTime(value: number): number {
  return Math.round(value * 10) / 10
}
