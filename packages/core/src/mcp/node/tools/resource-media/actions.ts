import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { ensureMovScriptWorkspaceRoot, resolveMovScriptWorkspaceRootPaths } from '../../../../workspace/node/paths.js'
import { backendGetBinary, backendPostMultipart } from '../../../../backend/node/client.js'
import { resolveFFmpegPath } from './ffmpegPath.js'
import { resolveMCPDefaultWorkspaceDir } from '../workspace/dir.js'

type VideoFrameExtractionMode = 'overview' | 'timestamps' | 'range' | 'burst'
type AnnotationShapeType = 'rect' | 'circle' | 'line' | 'arrow' | 'text' | 'highlight'

type VideoFrameSourceMetadata = {
  durationSec?: number
  width?: number
  height?: number
  fps?: number
}

type VideoFrameSamplingPlan = {
  mode: VideoFrameExtractionMode
  timestampsSec: number[]
  requestedFrameCount: number
  returnedFrameCount: number
  maxFrames: number
  startSec?: number
  endSec?: number
  centerSec?: number
  windowSec?: number
  fps?: number
  intervalSec?: number
  warnings: string[]
}

const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ABSOLUTE_MAX_IMAGE_BYTES = 20 * 1024 * 1024
const DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const ABSOLUTE_MAX_UPLOAD_BYTES = 100 * 1024 * 1024
const DEFAULT_MAX_VIDEO_BYTES = 200 * 1024 * 1024
const ABSOLUTE_MAX_VIDEO_BYTES = 1024 * 1024 * 1024
const DEFAULT_VIDEO_FRAME_COUNT = 4
const DEFAULT_VIDEO_FRAME_INTERVAL_SEC = 3
const DEFAULT_MAX_WIDTH = 960
const DEFAULT_MAX_FRAMES = 12
const ABSOLUTE_MAX_VIDEO_FRAMES = 24
const DEFAULT_RANGE_FPS = 2
const MAX_FPS = 6
const DEFAULT_BURST_WINDOW_SEC = 2
const DEFAULT_ANNOTATION_WIDTH = 1024
const DEFAULT_ANNOTATION_HEIGHT = 768

export async function readResourceImageForVision(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resourceId = resourceIdParam(args)
  const maxBytes = clampInteger(numberParam(args.max_bytes) ?? numberParam(args.maxBytes) ?? DEFAULT_MAX_IMAGE_BYTES, 1, ABSOLUTE_MAX_IMAGE_BYTES)
  const file = await downloadResourceFile(resourceId, { maxBytes })
  const mimeType = normalizeImageMimeType(stringParam(args.mime_type) ?? stringParam(args.mimeType) ?? file.contentType)
  if (!mimeType.startsWith('image/')) {
    throw new Error(`resource ${resourceId} is not an image resource; content-type=${file.contentType ?? 'unknown'}`)
  }
  if (file.bytes.length > maxBytes) {
    throw new Error(`resource ${resourceId} image is ${file.bytes.length} bytes, above max_bytes=${maxBytes}`)
  }

  const metadata = {
    status: 'image_read',
    resource_id: resourceId,
    mime_type: mimeType,
    size_bytes: file.bytes.length,
    image_payload: 'sent_as_mcp_image_content',
  }
  return mcpToolResultWithImages(metadata, [{
    label: `resource_id=${resourceId}`,
    data: file.bytes.toString('base64'),
    mimeType,
  }])
}

export async function extractResourceVideoFramesForVision(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resourceId = resourceIdParam(args)
  const maxVideoBytes = clampInteger(numberParam(args.max_video_bytes) ?? numberParam(args.maxVideoBytes) ?? DEFAULT_MAX_VIDEO_BYTES, 1, ABSOLUTE_MAX_VIDEO_BYTES)
  const maxWidth = clampInteger(numberParam(args.max_width) ?? numberParam(args.maxWidth) ?? DEFAULT_MAX_WIDTH, 128, 1920)
  const imageFormat = stringParam(args.image_format) === 'png' || stringParam(args.imageFormat) === 'png' ? 'png' : 'jpeg'
  const ffmpeg = resolveFFmpegPath()
  if (!ffmpeg) throw new Error('ffmpeg is required for movscript_resource_video_extract_frames but was not found')

  const file = await downloadResourceFile(resourceId, { maxBytes: maxVideoBytes })
  const dir = await mkdtempStable('movscript-mcp-video-')
  const inputPath = join(dir, `resource-${resourceId}.video`)
  const extension = imageFormat === 'png' ? 'png' : 'jpg'
  const mimeType = imageFormat === 'png' ? 'image/png' : 'image/jpeg'
  try {
    await writeFile(inputPath, file.bytes)
    const video = await probeVideoMetadata(inputPath, ffmpeg).catch(() => ({}))
    const sampling = buildMCPFrameSamplingPlan({
      mode: modeParam(args.mode),
      count: numberParam(args.count) ?? numberParam(args.frame_count),
      maxFrames: numberParam(args.max_frames) ?? numberParam(args.maxFrames),
      timestampsSec: timestampsParam(args.timestamps_sec ?? args.timestampsSec),
      startSec: numberParam(args.start_sec) ?? numberParam(args.startSec),
      endSec: numberParam(args.end_sec) ?? numberParam(args.endSec),
      centerSec: numberParam(args.center_sec) ?? numberParam(args.centerSec),
      windowSec: numberParam(args.window_sec) ?? numberParam(args.windowSec),
      fps: numberParam(args.fps),
      intervalSec: numberParam(args.interval_sec) ?? numberParam(args.intervalSec),
    }, video)
    const frames: Array<{ index: number; timestamp_sec: number; mime_type: string; size_bytes: number; image_payload: string }> = []
    const images: Array<{ label: string; data: string; mimeType: string }> = []
    for (let index = 0; index < sampling.timestampsSec.length; index += 1) {
      const timestamp = sampling.timestampsSec[index] ?? 0
      const outputPath = join(dir, `frame-${String(index + 1).padStart(3, '0')}.${extension}`)
      await runFFmpeg(ffmpeg, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        timestamp.toFixed(3),
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-vf',
        `scale=${maxWidth}:-2:force_original_aspect_ratio=decrease`,
        ...(imageFormat === 'jpeg' ? ['-q:v', '3'] : []),
        outputPath,
      ])
      const bytes = await readFile(outputPath)
      frames.push({
        index: index + 1,
        timestamp_sec: timestamp,
        mime_type: mimeType,
        size_bytes: bytes.length,
        image_payload: 'sent_as_mcp_image_content',
      })
      images.push({
        label: `frame ${index + 1}, timestamp_sec=${timestamp}`,
        data: bytes.toString('base64'),
        mimeType,
      })
    }

    const metadata = {
      status: 'frames_extracted',
      resource_id: resourceId,
      source_mime_type: file.contentType ?? 'video/unknown',
      source_size_bytes: file.bytes.length,
      max_video_bytes: maxVideoBytes,
      ...(Object.keys(video).length > 0 ? { video: publicVideoMetadata(video) } : {}),
      sampling: publicSamplingPlan({ ...sampling, returnedFrameCount: frames.length }),
      max_width: maxWidth,
      frames,
      ...(sampling.warnings.length > 0 ? { warnings: sampling.warnings } : {}),
      message: 'Video frames were extracted by MovScript MCP and returned as MCP image content. The original video was not sent to the model.',
    }
    return mcpToolResultWithImages(metadata, images)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function annotateResourceImage(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const source = await loadImageAnnotationSource(args)
  const natural = parseImageSize(source.bytes, source.mimeType)
  const width = clampInteger(numberParam(args.width) ?? natural?.width ?? DEFAULT_ANNOTATION_WIDTH, 1, 16384)
  const height = clampInteger(numberParam(args.height) ?? natural?.height ?? DEFAULT_ANNOTATION_HEIGHT, 1, 16384)
  const shapes = annotationShapes(args.annotations ?? args.shapes)
  if (shapes.length === 0) throw new Error('annotations must contain at least one shape')
  const title = stringParam(args.title) ?? 'MovScript agent annotation'
  const svg = renderAnnotationSVG({
    source,
    width,
    height,
    title,
    shapes,
    note: stringParam(args.note),
  })
  const outputPath = await resolveAnnotationOutputPath(args, title)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, svg, 'utf8')
  const bytes = Buffer.from(svg, 'utf8')
  const metadata = {
    status: 'annotated',
    artifact_path: outputPath,
    mime_type: 'image/svg+xml',
    size_bytes: bytes.length,
    width,
    height,
    source: source.public,
    annotation_count: shapes.length,
    annotations: shapes.map(publicAnnotationShape),
    image_payload: 'sent_as_mcp_image_content',
    message: 'Annotated guidance image was rendered as SVG. Upload artifact_path with movscript_resource_upload to store it as a RawResource for generation.',
  }
  return mcpToolResultWithImages(metadata, [{
    label: `annotated guidance image: ${basename(outputPath)}`,
    data: bytes.toString('base64'),
    mimeType: 'image/svg+xml',
  }])
}

export async function uploadAgentImageResource(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const input = await loadUploadInput(args)
  const maxBytes = clampInteger(numberParam(args.max_bytes) ?? numberParam(args.maxBytes) ?? DEFAULT_MAX_UPLOAD_BYTES, 1, ABSOLUTE_MAX_UPLOAD_BYTES)
  if (input.bytes.length > maxBytes) {
    throw new Error(`upload input is ${input.bytes.length} bytes, above max_bytes=${maxBytes}`)
  }
  const filename = uploadFilename(args, input.mimeType, input.filename)
  const form = new FormData()
  const blob = new Blob([new Uint8Array(input.bytes)], { type: input.mimeType })
  form.append('file', blob, filename)
  const folderId = stringParam(args.folder_id) ?? stringParam(args.folderId)
  if (folderId) form.append('folder_id', folderId)
  const resource = await backendPostMultipart('/resources/upload', form)
  const resourceId = numericResourceId(resource)
  if (resourceId === undefined) throw new Error('resource upload response did not include a valid resource ID')
  return {
    status: 'uploaded',
    resource_id: resourceId,
    resource,
    source: input.public,
    filename,
    mime_type: input.mimeType,
    size_bytes: input.bytes.length,
    message: 'Agent-created image was uploaded to MovScript RawResource library. Use resource_id in generation input_resource_ids/reference_resource_ids.',
  }
}

export async function readResourceFileBlob(resourceId: number, options: { maxBytes?: number } = {}): Promise<{ mimeType: string; blob: string; sizeBytes: number }> {
  const maxBytes = clampInteger(options.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES, 1, ABSOLUTE_MAX_IMAGE_BYTES)
  const file = await downloadResourceFile(resourceId, { maxBytes })
  if (file.bytes.length > maxBytes) {
    throw new Error(`resource ${resourceId} is ${file.bytes.length} bytes, above maxBytes=${maxBytes}`)
  }
  return {
    mimeType: file.contentType ?? 'application/octet-stream',
    blob: file.bytes.toString('base64'),
    sizeBytes: file.bytes.length,
  }
}

export function buildMCPFrameSamplingPlan(input: {
  count?: number
  timestampsSec?: number[]
  mode?: VideoFrameExtractionMode
  startSec?: number
  endSec?: number
  centerSec?: number
  windowSec?: number
  fps?: number
  intervalSec?: number
  maxFrames?: number
}, video: VideoFrameSourceMetadata = {}): VideoFrameSamplingPlan {
  const warnings: string[] = []
  const maxFrames = clampInteger(input.maxFrames ?? DEFAULT_MAX_FRAMES, 1, ABSOLUTE_MAX_VIDEO_FRAMES)
  const mode = resolveFrameMode(input)
  const durationSec = video.durationSec
  const requested = requestedFrameCount(input, mode, durationSec)
  let timestampsSec: number[] = []

  if (mode === 'timestamps') {
    timestampsSec = normalizeExplicitTimestamps(input.timestampsSec, maxFrames, durationSec, warnings)
  } else if (mode === 'range') {
    const range = normalizeRange(input.startSec, input.endSec, durationSec, warnings)
    timestampsSec = timestampsForRange(range.startSec, range.endSec, input, maxFrames, warnings)
    return {
      mode,
      timestampsSec,
      requestedFrameCount: requested,
      returnedFrameCount: timestampsSec.length,
      maxFrames,
      startSec: range.startSec,
      endSec: range.endSec,
      ...(samplingFps(input) !== undefined ? { fps: samplingFps(input) } : {}),
      ...(samplingIntervalSec(input) !== undefined ? { intervalSec: samplingIntervalSec(input) } : {}),
      warnings,
    }
  } else if (mode === 'burst') {
    const burst = normalizeBurst(input.centerSec, input.windowSec, durationSec, warnings)
    timestampsSec = timestampsForRange(burst.startSec, burst.endSec, input, maxFrames, warnings)
    return {
      mode,
      timestampsSec,
      requestedFrameCount: requested,
      returnedFrameCount: timestampsSec.length,
      maxFrames,
      startSec: burst.startSec,
      endSec: burst.endSec,
      centerSec: burst.centerSec,
      windowSec: burst.windowSec,
      ...(samplingFps(input) !== undefined ? { fps: samplingFps(input) } : {}),
      ...(samplingIntervalSec(input) !== undefined ? { intervalSec: samplingIntervalSec(input) } : {}),
      warnings,
    }
  } else {
    timestampsSec = overviewTimestamps(input.count ?? DEFAULT_VIDEO_FRAME_COUNT, maxFrames, durationSec)
  }

  if (timestampsSec.length === 0) timestampsSec = durationSec && durationSec > 0 ? [roundTime(durationSec / 2)] : [0]
  return {
    mode,
    timestampsSec,
    requestedFrameCount: requested,
    returnedFrameCount: timestampsSec.length,
    maxFrames,
    warnings,
  }
}

async function downloadResourceFile(resourceId: number, options: { maxBytes?: number } = {}): Promise<{ bytes: Buffer; contentType?: string; contentLength?: number }> {
  return backendGetBinary(`/resources/${encodeURIComponent(String(resourceId))}/file`, options)
}

function mcpToolResultWithImages(
  metadata: Record<string, unknown>,
  images: Array<{ label: string; data: string; mimeType: string }>,
): Record<string, unknown> {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(metadata, null, 2),
      },
      ...images.flatMap((image) => [
        { type: 'text', text: image.label },
        { type: 'image', data: image.data, mimeType: image.mimeType },
      ]),
    ],
    data: metadata,
  }
}

function runFFmpeg(ffmpeg: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => reject(error instanceof Error ? error : new Error(String(error))))
    child.on('exit', (code) => {
      if (code === 0) {
        resolveRun()
        return
      }
      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code ?? 'unknown'}`))
    })
  })
}

function runCommand(command: string, args: string[]): Promise<{ stdout: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => reject(error instanceof Error ? error : new Error(String(error))))
    child.on('exit', (code) => {
      if (code === 0) {
        resolveRun({ stdout })
        return
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code ?? 'unknown'}`))
    })
  })
}

async function probeVideoMetadata(path: string, ffmpeg: string): Promise<VideoFrameSourceMetadata> {
  const ffprobe = ffprobePath(ffmpeg)
  const result = await runCommand(ffprobe, [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=width,height,avg_frame_rate,r_frame_rate',
    '-of',
    'json',
    path,
  ])
  const parsed = JSON.parse(result.stdout) as {
    format?: { duration?: string }
    streams?: Array<{ width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }>
  }
  const stream = parsed.streams?.find(item => typeof item.width === 'number' && typeof item.height === 'number') ?? parsed.streams?.[0]
  const durationSec = positiveNumber(Number(parsed.format?.duration))
  const fps = parseFrameRate(stream?.avg_frame_rate) ?? parseFrameRate(stream?.r_frame_rate)
  return {
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(positiveInteger(stream?.width) !== undefined ? { width: positiveInteger(stream?.width) } : {}),
    ...(positiveInteger(stream?.height) !== undefined ? { height: positiveInteger(stream?.height) } : {}),
    ...(fps !== undefined ? { fps } : {}),
  }
}

function ffprobePath(ffmpeg: string): string {
  if (ffmpeg === 'ffmpeg') return 'ffprobe'
  const suffix = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const probeSuffix = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  return ffmpeg.endsWith(suffix) ? `${ffmpeg.slice(0, -suffix.length)}${probeSuffix}` : 'ffprobe'
}

function resolveFrameMode(input: { mode?: VideoFrameExtractionMode; timestampsSec?: number[]; startSec?: number; endSec?: number; centerSec?: number }): VideoFrameExtractionMode {
  if (input.mode) return input.mode
  if (input.timestampsSec && input.timestampsSec.length > 0) return 'timestamps'
  if (input.centerSec !== undefined) return 'burst'
  if (input.startSec !== undefined || input.endSec !== undefined) return 'range'
  return 'overview'
}

function requestedFrameCount(input: { count?: number; timestampsSec?: number[]; startSec?: number; endSec?: number; centerSec?: number; windowSec?: number; fps?: number; intervalSec?: number }, mode: VideoFrameExtractionMode, durationSec: number | undefined): number {
  if (mode === 'timestamps') return input.timestampsSec?.length ?? 0
  if (mode === 'range' || mode === 'burst') {
    const startSec = mode === 'burst'
      ? Math.max(0, (input.centerSec ?? 0) - (input.windowSec ?? DEFAULT_BURST_WINDOW_SEC) / 2)
      : input.startSec ?? 0
    const endSec = mode === 'burst'
      ? (input.centerSec ?? 0) + (input.windowSec ?? DEFAULT_BURST_WINDOW_SEC) / 2
      : input.endSec ?? durationSec ?? startSec
    const interval = samplingIntervalSec(input) ?? (1 / (samplingFps(input) ?? DEFAULT_RANGE_FPS))
    return Math.max(1, Math.floor(Math.max(0, endSec - startSec) / interval) + 1)
  }
  return input.count ?? DEFAULT_VIDEO_FRAME_COUNT
}

function normalizeExplicitTimestamps(timestampsSec: number[] | undefined, maxFrames: number, durationSec: number | undefined, warnings: string[]): number[] {
  const explicit = (timestampsSec ?? [])
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map(value => clampToDuration(value, durationSec))
    .map(roundTime)
  if (explicit.length > maxFrames) {
    warnings.push(`Requested ${explicit.length} timestamps; returned the first ${maxFrames} due to max_frames.`)
  }
  return uniqueSorted(explicit).slice(0, maxFrames)
}

function overviewTimestamps(count: number, maxFrames: number, durationSec: number | undefined): number[] {
  const frameCount = clampInteger(count, 1, maxFrames)
  if (!durationSec || durationSec <= 0) {
    const interval = DEFAULT_VIDEO_FRAME_INTERVAL_SEC
    return Array.from({ length: frameCount }, (_unused, index) => roundTime(index * interval))
  }
  if (frameCount <= 1) return [roundTime(durationSec / 2)]
  const margin = Math.min(1, Math.max(0.1, durationSec * 0.08))
  const start = Math.min(durationSec, margin)
  const end = Math.max(start, durationSec - margin)
  const step = frameCount === 1 ? 0 : (end - start) / (frameCount - 1)
  return uniqueSorted(Array.from({ length: frameCount }, (_unused, index) => roundTime(start + step * index)))
}

function normalizeRange(start: number | undefined, end: number | undefined, durationSec: number | undefined, warnings: string[]): { startSec: number; endSec: number } {
  const normalizedStart = clampToDuration(Math.max(0, start ?? 0), durationSec)
  const fallbackEnd = durationSec ?? normalizedStart
  let normalizedEnd = clampToDuration(Math.max(0, end ?? fallbackEnd), durationSec)
  if (normalizedEnd < normalizedStart) {
    warnings.push('end_sec was before start_sec; the range was normalized to a single timestamp.')
    normalizedEnd = normalizedStart
  }
  return { startSec: roundTime(normalizedStart), endSec: roundTime(normalizedEnd) }
}

function normalizeBurst(center: number | undefined, windowSec: number | undefined, durationSec: number | undefined, warnings: string[]): { startSec: number; endSec: number; centerSec: number; windowSec: number } {
  const normalizedWindow = Math.max(0, windowSec ?? DEFAULT_BURST_WINDOW_SEC)
  const normalizedCenter = clampToDuration(Math.max(0, center ?? 0), durationSec)
  const startSec = clampToDuration(Math.max(0, normalizedCenter - normalizedWindow / 2), durationSec)
  let endSec = clampToDuration(normalizedCenter + normalizedWindow / 2, durationSec)
  if (endSec < startSec) {
    warnings.push('burst window could not be applied; the range was normalized to a single timestamp.')
    endSec = startSec
  }
  return { startSec: roundTime(startSec), endSec: roundTime(endSec), centerSec: roundTime(normalizedCenter), windowSec: roundTime(normalizedWindow) }
}

function timestampsForRange(startSec: number, endSec: number, input: { fps?: number; intervalSec?: number }, maxFrames: number, warnings: string[]): number[] {
  const interval = samplingIntervalSec(input) ?? (1 / (samplingFps(input) ?? DEFAULT_RANGE_FPS))
  const timestamps: number[] = []
  for (let timestamp = startSec; timestamp <= endSec + 0.0001; timestamp += interval) {
    timestamps.push(roundTime(timestamp))
  }
  if (timestamps.length === 0) timestamps.push(roundTime(startSec))
  if (timestamps.length > maxFrames) {
    warnings.push(`Requested ${timestamps.length} frames for the time range; downsampled to ${maxFrames} due to max_frames.`)
    return downsample(timestamps, maxFrames)
  }
  return uniqueSorted(timestamps)
}

function samplingFps(input: { fps?: number }): number | undefined {
  const fps = positiveNumber(input.fps)
  return fps === undefined ? undefined : Math.min(fps, MAX_FPS)
}

function samplingIntervalSec(input: { intervalSec?: number }): number | undefined {
  return positiveNumber(input.intervalSec)
}

function downsample(values: number[], maxItems: number): number[] {
  if (values.length <= maxItems) return uniqueSorted(values)
  if (maxItems <= 1) return [values[0] ?? 0]
  const step = (values.length - 1) / (maxItems - 1)
  return uniqueSorted(Array.from({ length: maxItems }, (_unused, index) => values[Math.round(index * step)] ?? values[values.length - 1] ?? 0))
}

function publicSamplingPlan(sampling: VideoFrameSamplingPlan): Record<string, unknown> {
  return {
    mode: sampling.mode,
    timestamps_sec: sampling.timestampsSec,
    requested_frame_count: sampling.requestedFrameCount,
    returned_frame_count: sampling.returnedFrameCount,
    max_frames: sampling.maxFrames,
    ...(sampling.startSec !== undefined ? { start_sec: sampling.startSec } : {}),
    ...(sampling.endSec !== undefined ? { end_sec: sampling.endSec } : {}),
    ...(sampling.centerSec !== undefined ? { center_sec: sampling.centerSec } : {}),
    ...(sampling.windowSec !== undefined ? { window_sec: sampling.windowSec } : {}),
    ...(sampling.fps !== undefined ? { fps: sampling.fps } : {}),
    ...(sampling.intervalSec !== undefined ? { interval_sec: sampling.intervalSec } : {}),
    ...(sampling.warnings.length > 0 ? { warnings: sampling.warnings } : {}),
  }
}

function publicVideoMetadata(video: VideoFrameSourceMetadata): Record<string, unknown> {
  return {
    ...(video.durationSec !== undefined ? { duration_sec: video.durationSec } : {}),
    ...(video.width !== undefined ? { width: video.width } : {}),
    ...(video.height !== undefined ? { height: video.height } : {}),
    ...(video.fps !== undefined ? { fps: video.fps } : {}),
  }
}

async function loadImageAnnotationSource(args: Record<string, unknown>): Promise<{
  bytes: Buffer
  mimeType: string
  public: Record<string, unknown>
}> {
  const resourceId = optionalResourceIdParam(args)
  if (resourceId !== undefined) {
    const maxBytes = clampInteger(numberParam(args.max_source_bytes) ?? numberParam(args.maxSourceBytes) ?? DEFAULT_MAX_IMAGE_BYTES, 1, ABSOLUTE_MAX_IMAGE_BYTES)
    const file = await downloadResourceFile(resourceId, { maxBytes })
    const mimeType = normalizeImageMimeType(stringParam(args.mime_type) ?? stringParam(args.mimeType) ?? file.contentType)
    return {
      bytes: file.bytes,
      mimeType,
      public: { kind: 'backend_resource', resource_id: resourceId, mime_type: mimeType, size_bytes: file.bytes.length },
    }
  }
  const dataUrl = stringParam(args.data_url) ?? stringParam(args.dataUrl)
  if (dataUrl) {
    const decoded = decodeDataURL(dataUrl)
    return {
      bytes: decoded.bytes,
      mimeType: normalizeImageMimeType(decoded.mimeType),
      public: { kind: 'data_url', mime_type: decoded.mimeType, size_bytes: decoded.bytes.length },
    }
  }
  const localPath = stringParam(args.local_path) ?? stringParam(args.localPath) ?? stringParam(args.artifact_path) ?? stringParam(args.artifactPath)
  if (localPath) {
    const bytes = await readFile(localPath)
    const mimeType = normalizeImageMimeType(stringParam(args.mime_type) ?? stringParam(args.mimeType) ?? mimeTypeFromFilename(localPath))
    return {
      bytes,
      mimeType,
      public: { kind: 'local_path', path: localPath, mime_type: mimeType, size_bytes: bytes.length },
    }
  }
  throw new Error('annotate requires resource_id, data_url, or local_path')
}

type AnnotationShape = {
  type: AnnotationShapeType
  x?: number
  y?: number
  width?: number
  height?: number
  cx?: number
  cy?: number
  r?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  text?: string
  color: string
  fill?: string
  strokeWidth: number
  opacity: number
  fontSize: number
  label?: string
}

function annotationShapes(value: unknown): AnnotationShape[] {
  if (!Array.isArray(value)) return []
  return value.map(annotationShape).filter((item): item is AnnotationShape => item !== undefined)
}

function annotationShape(value: unknown): AnnotationShape | undefined {
  if (!isRecord(value)) return undefined
  const type = shapeType(value.type)
  if (!type) return undefined
  const color = stringParam(value.color) ?? (type === 'highlight' ? '#facc15' : '#ef4444')
  const strokeWidth = clampNumber(numberParam(value.stroke_width) ?? numberParam(value.strokeWidth) ?? 5, 1, 64)
  const opacity = clampNumber(numberParam(value.opacity) ?? (type === 'highlight' ? 0.32 : 0.95), 0.05, 1)
  const fontSize = clampNumber(numberParam(value.font_size) ?? numberParam(value.fontSize) ?? 32, 8, 240)
  return {
    type,
    ...(numberParam(value.x) !== undefined ? { x: numberParam(value.x) } : {}),
    ...(numberParam(value.y) !== undefined ? { y: numberParam(value.y) } : {}),
    ...(numberParam(value.width) !== undefined ? { width: numberParam(value.width) } : {}),
    ...(numberParam(value.height) !== undefined ? { height: numberParam(value.height) } : {}),
    ...(numberParam(value.cx) !== undefined ? { cx: numberParam(value.cx) } : {}),
    ...(numberParam(value.cy) !== undefined ? { cy: numberParam(value.cy) } : {}),
    ...(numberParam(value.r) !== undefined ? { r: numberParam(value.r) } : {}),
    ...(numberParam(value.x1) !== undefined ? { x1: numberParam(value.x1) } : {}),
    ...(numberParam(value.y1) !== undefined ? { y1: numberParam(value.y1) } : {}),
    ...(numberParam(value.x2) !== undefined ? { x2: numberParam(value.x2) } : {}),
    ...(numberParam(value.y2) !== undefined ? { y2: numberParam(value.y2) } : {}),
    ...(stringParam(value.text) ? { text: stringParam(value.text) } : {}),
    ...(stringParam(value.fill) ? { fill: stringParam(value.fill) } : {}),
    ...(stringParam(value.label) ? { label: stringParam(value.label) } : {}),
    color,
    strokeWidth,
    opacity,
    fontSize,
  }
}

function renderAnnotationSVG(input: {
  source: { bytes: Buffer; mimeType: string }
  width: number
  height: number
  title: string
  note?: string
  shapes: AnnotationShape[]
}): string {
  const sourceHref = `data:${input.source.mimeType};base64,${input.source.bytes.toString('base64')}`
  const shapeSVG = input.shapes.map(renderAnnotationShape).join('\n  ')
  const noteSVG = input.note
    ? `<text x="24" y="${Math.max(36, input.height - 24)}" font-family="Arial, sans-serif" font-size="24" fill="#111827" stroke="#ffffff" stroke-width="5" paint-order="stroke">${escapeXML(input.note)}</text>`
    : ''
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">`,
    `  <title>${escapeXML(input.title)}</title>`,
    '  <defs>',
    '    <marker id="arrow-head" markerWidth="16" markerHeight="16" refX="12" refY="8" orient="auto" markerUnits="strokeWidth">',
    '      <path d="M 0 0 L 16 8 L 0 16 z" fill="context-stroke" />',
    '    </marker>',
    '  </defs>',
    `  <image href="${sourceHref}" x="0" y="0" width="${input.width}" height="${input.height}" preserveAspectRatio="xMidYMid meet" />`,
    `  ${shapeSVG}`,
    noteSVG ? `  ${noteSVG}` : '',
    '</svg>',
  ].filter(Boolean).join('\n')
}

function renderAnnotationShape(shape: AnnotationShape): string {
  const common = `stroke="${escapeXML(shape.color)}" stroke-width="${shape.strokeWidth}" opacity="${shape.opacity}"`
  if (shape.type === 'rect' || shape.type === 'highlight') {
    const x = shape.x ?? 0
    const y = shape.y ?? 0
    const width = shape.width ?? 1
    const height = shape.height ?? 1
    const fill = shape.type === 'highlight' ? shape.color : (shape.fill ?? 'none')
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${escapeXML(fill)}" ${common} />`
  }
  if (shape.type === 'circle') {
    return `<circle cx="${shape.cx ?? shape.x ?? 0}" cy="${shape.cy ?? shape.y ?? 0}" r="${shape.r ?? 24}" fill="${escapeXML(shape.fill ?? 'none')}" ${common} />`
  }
  if (shape.type === 'line' || shape.type === 'arrow') {
    const marker = shape.type === 'arrow' ? ' marker-end="url(#arrow-head)"' : ''
    return `<line x1="${shape.x1 ?? shape.x ?? 0}" y1="${shape.y1 ?? shape.y ?? 0}" x2="${shape.x2 ?? 0}" y2="${shape.y2 ?? 0}" fill="none" ${common}${marker} />`
  }
  if (shape.type === 'text') {
    return `<text x="${shape.x ?? 0}" y="${shape.y ?? shape.fontSize}" font-family="Arial, sans-serif" font-size="${shape.fontSize}" fill="${escapeXML(shape.color)}" stroke="#ffffff" stroke-width="${Math.max(2, Math.round(shape.strokeWidth / 2))}" paint-order="stroke" opacity="${shape.opacity}">${escapeXML(shape.text ?? shape.label ?? '')}</text>`
  }
  return ''
}

function publicAnnotationShape(shape: AnnotationShape): Record<string, unknown> {
  return {
    type: shape.type,
    ...(shape.x !== undefined ? { x: shape.x } : {}),
    ...(shape.y !== undefined ? { y: shape.y } : {}),
    ...(shape.width !== undefined ? { width: shape.width } : {}),
    ...(shape.height !== undefined ? { height: shape.height } : {}),
    ...(shape.cx !== undefined ? { cx: shape.cx } : {}),
    ...(shape.cy !== undefined ? { cy: shape.cy } : {}),
    ...(shape.r !== undefined ? { r: shape.r } : {}),
    ...(shape.x1 !== undefined ? { x1: shape.x1 } : {}),
    ...(shape.y1 !== undefined ? { y1: shape.y1 } : {}),
    ...(shape.x2 !== undefined ? { x2: shape.x2 } : {}),
    ...(shape.y2 !== undefined ? { y2: shape.y2 } : {}),
    ...(shape.text !== undefined ? { text: shape.text } : {}),
    color: shape.color,
    stroke_width: shape.strokeWidth,
    opacity: shape.opacity,
  }
}

async function resolveAnnotationOutputPath(args: Record<string, unknown>, title: string): Promise<string> {
  const outputPath = stringParam(args.output_path) ?? stringParam(args.outputPath)
  if (outputPath) return outputPath
  const workspacePath = stringParam(args.workspace_path) ?? stringParam(args.workspacePath)
  if (workspacePath) return resolveWorkspaceFilePath(stringParam(args.workspaceDir), workspacePath)
  const dir = join(tmpdir(), 'movscript-mcp-artifacts')
  const filename = `${safeFilename(title || 'annotation')}-${randomUUID().slice(0, 8)}.svg`
  return join(dir, filename)
}

async function loadUploadInput(args: Record<string, unknown>): Promise<{
  bytes: Buffer
  mimeType: string
  filename?: string
  public: Record<string, unknown>
}> {
  const dataUrl = stringParam(args.data_url) ?? stringParam(args.dataUrl)
  if (dataUrl) {
    const decoded = decodeDataURL(dataUrl)
    return {
      bytes: decoded.bytes,
      mimeType: decoded.mimeType,
      public: { kind: 'data_url', mime_type: decoded.mimeType, size_bytes: decoded.bytes.length },
    }
  }
  const base64 = stringParam(args.base64)
  if (base64) {
    const mimeType = normalizeImageMimeType(stringParam(args.mime_type) ?? stringParam(args.mimeType))
    const bytes = Buffer.from(base64, 'base64')
    return {
      bytes,
      mimeType,
      public: { kind: 'base64', mime_type: mimeType, size_bytes: bytes.length },
    }
  }
  const workspacePath = stringParam(args.workspace_path) ?? stringParam(args.workspacePath)
  if (workspacePath) {
    const path = await resolveWorkspaceFilePath(stringParam(args.workspaceDir), workspacePath)
    const bytes = await readFile(path)
    const mimeType = normalizeImageMimeType(stringParam(args.mime_type) ?? stringParam(args.mimeType) ?? mimeTypeFromFilename(path))
    return {
      bytes,
      mimeType,
      filename: basename(path),
      public: { kind: 'workspace_path', path: workspacePath, mime_type: mimeType, size_bytes: bytes.length },
    }
  }
  const localPath = stringParam(args.local_path) ?? stringParam(args.localPath) ?? stringParam(args.artifact_path) ?? stringParam(args.artifactPath) ?? stringParam(args.path)
  if (localPath) {
    const fileStat = await stat(localPath)
    if (!fileStat.isFile()) throw new Error('local_path must point to a file')
    const bytes = await readFile(localPath)
    const mimeType = normalizeImageMimeType(stringParam(args.mime_type) ?? stringParam(args.mimeType) ?? mimeTypeFromFilename(localPath))
    return {
      bytes,
      mimeType,
      filename: basename(localPath),
      public: { kind: 'local_path', path: localPath, mime_type: mimeType, size_bytes: bytes.length },
    }
  }
  throw new Error('upload requires data_url, base64, workspace_path, artifact_path, or local_path')
}

async function resolveWorkspaceFilePath(workspaceDir: string | undefined, workspacePath: string): Promise<string> {
  const rootDir = workspaceDir?.trim() || await resolveDefaultMovScriptWorkspaceDir()
  const workspaceRoot = resolveMovScriptWorkspaceRootPaths(rootDir)
  ensureMovScriptWorkspaceRoot(workspaceRoot)
  const rootPath = workspaceRoot.controlDir
  const normalizedRelativePath = workspacePath.replace(/^[/\\]+/, '')
  const absolutePath = resolve(rootPath, normalizedRelativePath)
  const rootRelativePath = relative(rootPath, absolutePath)
  if (rootRelativePath === '' || (!rootRelativePath.startsWith(`..${sep}`) && rootRelativePath !== '..' && !isAbsolute(rootRelativePath))) {
    return absolutePath
  }
  throw new Error('workspace_path must stay inside the MovScript workspace directory')
}

async function resolveDefaultMovScriptWorkspaceDir(): Promise<string> {
  return resolveMCPDefaultWorkspaceDir()
}

function uploadFilename(args: Record<string, unknown>, mimeType: string, sourceFilename?: string): string {
  const explicit = stringParam(args.filename) ?? stringParam(args.name)
  if (explicit) return explicit
  const ext = extname(sourceFilename ?? '') || extensionForMimeType(mimeType)
  const base = sourceFilename ? safeFilename(basename(sourceFilename, extname(sourceFilename))) : `agent-guidance-${randomUUID().slice(0, 8)}`
  return `${base}${ext || '.png'}`
}

function decodeDataURL(value: string): { mimeType: string; bytes: Buffer } {
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) throw new Error('data_url must be a valid data URL')
  const mimeType = match[1] || 'image/png'
  const isBase64 = !!match[2]
  const payload = match[3] ?? ''
  return {
    mimeType,
    bytes: isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8'),
  }
}

function parseImageSize(bytes: Buffer, mimeType: string): { width: number; height: number } | undefined {
  if (mimeType === 'image/png' && bytes.length >= 24 && bytes.toString('ascii', 1, 4) === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  if ((mimeType === 'image/jpeg' || mimeType === 'image/jpg') && bytes.length > 4) {
    return parseJPEGSize(bytes)
  }
  if (mimeType === 'image/gif' && bytes.length >= 10) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) }
  }
  return undefined
}

function parseJPEGSize(bytes: Buffer): { width: number; height: number } | undefined {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined
    const marker = bytes[offset + 1]
    const length = bytes.readUInt16BE(offset + 2)
    if (marker !== undefined && marker >= 0xc0 && marker <= 0xc3) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  return undefined
}

function resourceIdParam(args: Record<string, unknown>): number {
  const value = optionalResourceIdParam(args)
  if (value === undefined) throw new Error('resource_id is required')
  return value
}

function optionalResourceIdParam(args: Record<string, unknown>): number | undefined {
  const value = numberParam(args.resource_id) ?? numberParam(args.resourceId) ?? numberParam(args.id)
  return value !== undefined && value >= 1 ? Math.floor(value) : undefined
}

function timestampsParam(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map(numberParam)
    .filter((item): item is number => item !== undefined && item >= 0)
    .map(roundTime)
}

function modeParam(value: unknown): VideoFrameExtractionMode | undefined {
  return value === 'overview' || value === 'timestamps' || value === 'range' || value === 'burst' ? value : undefined
}

function shapeType(value: unknown): AnnotationShapeType | undefined {
  return value === 'rect' || value === 'circle' || value === 'line' || value === 'arrow' || value === 'text' || value === 'highlight'
    ? value
    : undefined
}

function normalizeImageMimeType(value: string | undefined): string {
  if (!value) return 'image/png'
  return value.split(';')[0]?.trim().toLowerCase() || 'image/png'
}

function mimeTypeFromFilename(filename: string): string {
  switch (extname(filename).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.png':
    default:
      return 'image/png'
  }
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg'
    case 'image/svg+xml':
      return '.svg'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    case 'image/png':
    default:
      return '.png'
  }
}

function numericResourceId(resource: unknown): number | undefined {
  if (!isRecord(resource)) return undefined
  return numberParam(resource.ID) ?? numberParam(resource.id)
}

function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberParam(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000
}

function clampToDuration(value: number, durationSec: number | undefined): number {
  if (!durationSec || durationSec <= 0) return value
  return Math.min(value, durationSec)
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map(roundTime))].sort((left, right) => left - right)
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function parseFrameRate(value: string | undefined): number | undefined {
  if (!value || value === '0/0') return undefined
  const [num, den] = value.split('/').map(Number)
  if (!Number.isFinite(num) || !Number.isFinite(den) || !num || !den) return undefined
  return Math.round((num / den) * 1000) / 1000
}

function safeFilename(value: string): string {
  const normalized = value.trim().replace(/\.[^.]+$/, '') || 'agent-guidance'
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'agent-guidance'
}

function escapeXML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

async function mkdtempStable(prefix: string): Promise<string> {
  const dir = join(tmpdir(), `${prefix}${randomUUID().slice(0, 8)}`)
  await mkdir(dir, { recursive: true })
  return dir
}
