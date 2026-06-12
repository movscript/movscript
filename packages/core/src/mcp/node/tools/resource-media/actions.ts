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
type ResourceImageReadMode = 'fit' | 'original'
type AnnotationShapeType = 'rect' | 'circle' | 'line' | 'arrow' | 'text' | 'highlight'

type VideoFrameSourceMetadata = {
  durationSec?: number
  width?: number
  height?: number
  fps?: number
}

type VideoComposeItem = {
  resourceId: number
  startSec?: number
  endSec?: number
  durationSec?: number
  volume?: number
  muted?: boolean
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
const DEFAULT_MAX_IMAGE_WIDTH = 1568
const DEFAULT_MAX_IMAGE_HEIGHT = 1568
const ABSOLUTE_MAX_IMAGE_DIMENSION = 4096
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
  const mode = resourceImageReadModeParam(args)
  const maxWidth = clampInteger(numberParam(args.max_width) ?? numberParam(args.maxWidth) ?? DEFAULT_MAX_IMAGE_WIDTH, 1, ABSOLUTE_MAX_IMAGE_DIMENSION)
  const maxHeight = clampInteger(numberParam(args.max_height) ?? numberParam(args.maxHeight) ?? DEFAULT_MAX_IMAGE_HEIGHT, 1, ABSOLUTE_MAX_IMAGE_DIMENSION)
  const file = await downloadResourceFile(resourceId, { maxBytes })
  const sourceMimeType = normalizeImageMimeType(stringParam(args.mime_type) ?? stringParam(args.mimeType) ?? file.contentType)
  if (!sourceMimeType.startsWith('image/')) {
    throw new Error(`resource ${resourceId} is not an image resource; content-type=${file.contentType ?? 'unknown'}`)
  }
  if (file.bytes.length > maxBytes) {
    throw new Error(`resource ${resourceId} image is ${file.bytes.length} bytes, above max_bytes=${maxBytes}`)
  }

  const processed = await processResourceImageForVision(resourceId, file.bytes, sourceMimeType, {
    mode,
    maxWidth,
    maxHeight,
  })
  const metadata = {
    status: 'image_read',
    resource_id: resourceId,
    mode,
    source_mime_type: sourceMimeType,
    source_size_bytes: file.bytes.length,
    source_width: processed.source.width,
    source_height: processed.source.height,
    mime_type: processed.mimeType,
    size_bytes: processed.bytes.length,
    width: processed.width,
    height: processed.height,
    resized: processed.resized,
    ...(mode === 'fit' ? { max_width: maxWidth, max_height: maxHeight } : {}),
    image_payload: 'sent_as_mcp_image_content',
  }
  return mcpToolResultWithImages(metadata, [{
    data: processed.bytes.toString('base64'),
    mimeType: processed.mimeType,
  }], { includeText: false })
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
    const video: VideoFrameSourceMetadata = await probeVideoMetadata(inputPath, ffmpeg).catch(() => ({}))
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

export async function probeResourceVideo(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resourceId = resourceIdParam(args)
  const maxVideoBytes = clampInteger(numberParam(args.max_video_bytes) ?? numberParam(args.maxVideoBytes) ?? DEFAULT_MAX_VIDEO_BYTES, 1, ABSOLUTE_MAX_VIDEO_BYTES)
  const ffmpeg = resolveFFmpegPath()
  if (!ffmpeg) throw new Error('ffmpeg is required for movscript_resource_video_probe but was not found')

  const file = await downloadResourceFile(resourceId, { maxBytes: maxVideoBytes })
  const dir = await mkdtempStable('movscript-mcp-video-probe-')
  const inputPath = join(dir, `resource-${resourceId}.video`)
  try {
    await writeFile(inputPath, file.bytes)
    const video = await probeVideoMetadata(inputPath, ffmpeg)
    return {
      status: 'probed',
      resource_id: resourceId,
      source_mime_type: file.contentType ?? 'video/unknown',
      source_size_bytes: file.bytes.length,
      max_video_bytes: maxVideoBytes,
      video: publicVideoMetadata(video),
      message: `Video resource #${resourceId} probed.`,
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function extractResourceVideoFrameToResource(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await extractResourceVideoFramesToResources({
    ...args,
    mode: 'timestamps',
    timestamps_sec: [numberParam(args.timestamp_sec) ?? numberParam(args.timestampSec) ?? 0],
    max_frames: 1,
  })
  const item = Array.isArray(result.items) ? result.items[0] : undefined
  if (!isRecord(item)) throw new Error('frame extraction did not create an image resource')
  return {
    status: 'created',
    source_resource_id: result.resource_id,
    image_resource_id: item.resource_id,
    resource_id: item.resource_id,
    timestamp_sec: item.timestamp_sec,
    frame: item,
    video: result.video,
    message: `Extracted frame at ${item.timestamp_sec}s to image resource #${item.resource_id}.`,
  }
}

export async function extractResourceVideoFramesToResources(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resourceId = resourceIdParam(args)
  const maxVideoBytes = clampInteger(numberParam(args.max_video_bytes) ?? numberParam(args.maxVideoBytes) ?? DEFAULT_MAX_VIDEO_BYTES, 1, ABSOLUTE_MAX_VIDEO_BYTES)
  const maxWidth = clampInteger(numberParam(args.max_width) ?? numberParam(args.maxWidth) ?? DEFAULT_MAX_WIDTH, 128, 1920)
  const imageFormat = stringParam(args.image_format) === 'png' || stringParam(args.imageFormat) === 'png' ? 'png' : 'jpeg'
  const maxUploadBytes = clampInteger(numberParam(args.max_upload_bytes) ?? numberParam(args.maxUploadBytes) ?? DEFAULT_MAX_UPLOAD_BYTES, 1, ABSOLUTE_MAX_UPLOAD_BYTES)
  const ffmpeg = resolveFFmpegPath()
  if (!ffmpeg) throw new Error('ffmpeg is required for movscript_resource_video_extract_frames_to_resources but was not found')

  const file = await downloadResourceFile(resourceId, { maxBytes: maxVideoBytes })
  const dir = await mkdtempStable('movscript-mcp-video-frames-')
  const inputPath = join(dir, `resource-${resourceId}.video`)
  const extension = imageFormat === 'png' ? 'png' : 'jpg'
  const mimeType = imageFormat === 'png' ? 'image/png' : 'image/jpeg'
  try {
    await writeFile(inputPath, file.bytes)
    const video: VideoFrameSourceMetadata = await probeVideoMetadata(inputPath, ffmpeg).catch(() => ({}))
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
    const items: Record<string, unknown>[] = []
    for (let index = 0; index < sampling.timestampsSec.length; index += 1) {
      const timestamp = sampling.timestampsSec[index] ?? 0
      const outputPath = join(dir, `frame-${String(index + 1).padStart(3, '0')}.${extension}`)
      await extractVideoFrame(ffmpeg, inputPath, outputPath, {
        timestampSec: timestamp,
        maxWidth,
        imageFormat,
      })
      const bytes = await readFile(outputPath)
      const filename = frameOutputFilename(args, resourceId, timestamp, extension, index)
      const uploaded = await uploadGeneratedResourceBytes({
        bytes,
        mimeType,
        filename,
        folderId: stringParam(args.folder_id) ?? stringParam(args.folderId),
        maxBytes: maxUploadBytes,
        derivative: {
          operation: 'video_extract_frame',
          tool: 'movscript_resource_video_extract_frames_to_resources',
          inputResourceIds: [resourceId],
          params: {
            timestamp_sec: timestamp,
            max_width: maxWidth,
            image_format: imageFormat,
          },
        },
      })
      items.push({
        index: index + 1,
        timestamp_sec: timestamp,
        resource_id: uploaded.resource_id,
        image_resource_id: uploaded.resource_id,
        mime_type: mimeType,
        size_bytes: bytes.length,
        resource: uploaded.resource,
        source: {
          operation: 'video_extract_frame',
          source_resource_id: resourceId,
          timestamp_sec: timestamp,
          max_width: maxWidth,
          image_format: imageFormat,
        },
      })
    }
    const resourceIds = items
      .map((item) => numberParam(item.resource_id))
      .filter((item): item is number => item !== undefined)
    return {
      status: 'created',
      resource_id: resourceId,
      source_resource_id: resourceId,
      source_mime_type: file.contentType ?? 'video/unknown',
      source_size_bytes: file.bytes.length,
      ...(Object.keys(video).length > 0 ? { video: publicVideoMetadata(video) } : {}),
      sampling: publicSamplingPlan({ ...sampling, returnedFrameCount: items.length }),
      max_width: maxWidth,
      image_format: imageFormat,
      count: items.length,
      resource_ids: resourceIds,
      image_resource_ids: resourceIds,
      items,
      ...(sampling.warnings.length > 0 ? { warnings: sampling.warnings } : {}),
      message: `${items.length} frame resource(s) created from video resource #${resourceId}.`,
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function trimResourceVideoToResource(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resourceId = resourceIdParam(args)
  const maxVideoBytes = clampInteger(numberParam(args.max_video_bytes) ?? numberParam(args.maxVideoBytes) ?? DEFAULT_MAX_VIDEO_BYTES, 1, ABSOLUTE_MAX_VIDEO_BYTES)
  const maxUploadBytes = clampInteger(numberParam(args.max_upload_bytes) ?? numberParam(args.maxUploadBytes) ?? ABSOLUTE_MAX_UPLOAD_BYTES, 1, ABSOLUTE_MAX_UPLOAD_BYTES)
  const ffmpeg = resolveFFmpegPath()
  if (!ffmpeg) throw new Error('ffmpeg is required for movscript_resource_video_trim_to_resource but was not found')

  const file = await downloadResourceFile(resourceId, { maxBytes: maxVideoBytes })
  const dir = await mkdtempStable('movscript-mcp-video-trim-')
  const inputPath = join(dir, `resource-${resourceId}.video`)
  const outputPath = join(dir, 'trimmed.mp4')
  try {
    await writeFile(inputPath, file.bytes)
    const video: VideoFrameSourceMetadata = await probeVideoMetadata(inputPath, ffmpeg).catch(() => ({}))
    const range = clipRangeFromArgs(args, video.durationSec)
    await trimVideoFile(ffmpeg, inputPath, outputPath, range, {
      mode: stringParam(args.mode) === 'fast' ? 'fast' : 'accurate',
      volume: numberParam(args.volume),
      muted: booleanParam(args.muted),
    })
    const bytes = await readFile(outputPath)
    const filename = videoOutputFilename(args, `resource-${resourceId}-trim-${range.startSec}-${range.endSec}`)
    const uploaded = await uploadGeneratedResourceBytes({
      bytes,
      mimeType: 'video/mp4',
      filename,
      folderId: stringParam(args.folder_id) ?? stringParam(args.folderId),
      maxBytes: maxUploadBytes,
      derivative: {
        operation: 'video_trim',
        tool: 'movscript_resource_video_trim_to_resource',
        inputResourceIds: [resourceId],
        params: {
          start_sec: range.startSec,
          end_sec: range.endSec,
          mode: stringParam(args.mode) === 'fast' ? 'fast' : 'accurate',
          ...(numberParam(args.volume) !== undefined ? { volume: numberParam(args.volume) } : {}),
          ...(booleanParam(args.muted) !== undefined ? { muted: booleanParam(args.muted) } : {}),
        },
      },
    })
    return {
      status: 'created',
      source_resource_id: resourceId,
      video_resource_id: uploaded.resource_id,
      resource_id: uploaded.resource_id,
      mime_type: 'video/mp4',
      size_bytes: bytes.length,
      duration_sec: roundTime(range.endSec - range.startSec),
      start_sec: range.startSec,
      end_sec: range.endSec,
      resource: uploaded.resource,
      source: {
        operation: 'video_trim',
        source_resource_id: resourceId,
        start_sec: range.startSec,
        end_sec: range.endSec,
      },
      message: `Trimmed video resource #${resourceId} to video resource #${uploaded.resource_id}.`,
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function composeResourceVideosToResource(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const items = videoComposeItems(args.items)
  const maxVideoBytes = clampInteger(numberParam(args.max_video_bytes) ?? numberParam(args.maxVideoBytes) ?? DEFAULT_MAX_VIDEO_BYTES, 1, ABSOLUTE_MAX_VIDEO_BYTES)
  const maxUploadBytes = clampInteger(numberParam(args.max_upload_bytes) ?? numberParam(args.maxUploadBytes) ?? ABSOLUTE_MAX_UPLOAD_BYTES, 1, ABSOLUTE_MAX_UPLOAD_BYTES)
  const ffmpeg = resolveFFmpegPath()
  if (!ffmpeg) throw new Error('ffmpeg is required for movscript_resource_video_compose_to_resource but was not found')

  const dir = await mkdtempStable('movscript-mcp-video-compose-')
  try {
    const segmentPaths: string[] = []
    const segments: Record<string, unknown>[] = []
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!
      const file = await downloadResourceFile(item.resourceId, { maxBytes: maxVideoBytes })
      const inputPath = join(dir, `input-${String(index + 1).padStart(3, '0')}.video`)
      const segmentPath = join(dir, `segment-${String(index + 1).padStart(3, '0')}.mp4`)
      await writeFile(inputPath, file.bytes)
      const video: VideoFrameSourceMetadata = await probeVideoMetadata(inputPath, ffmpeg).catch(() => ({}))
      const range = clipRangeFromItem(item, video.durationSec)
      await trimVideoFile(ffmpeg, inputPath, segmentPath, range, {
        mode: 'accurate',
        volume: item.volume,
        muted: item.muted,
      })
      segmentPaths.push(segmentPath)
      segments.push({
        index: index + 1,
        source_resource_id: item.resourceId,
        start_sec: range.startSec,
        end_sec: range.endSec,
        duration_sec: roundTime(range.endSec - range.startSec),
        ...(Object.keys(video).length > 0 ? { video: publicVideoMetadata(video) } : {}),
      })
    }
    const listPath = join(dir, 'concat-list.txt')
    await writeFile(listPath, segmentPaths.map((path) => `file '${basename(path)}'`).join('\n'), 'utf8')
    const outputPath = join(dir, 'composed.mp4')
    await runFFmpeg(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputPath,
    ])
    const bytes = await readFile(outputPath)
    const filename = videoOutputFilename(args, `composed-video-${randomUUID().slice(0, 8)}`)
    const uploaded = await uploadGeneratedResourceBytes({
      bytes,
      mimeType: 'video/mp4',
      filename,
      folderId: stringParam(args.folder_id) ?? stringParam(args.folderId),
      maxBytes: maxUploadBytes,
      derivative: {
        operation: 'video_compose',
        tool: 'movscript_resource_video_compose_to_resource',
        inputResourceIds: items.map((item) => item.resourceId),
        params: { segments },
      },
    })
    const durationSec = segments.reduce((total, item) => total + (numberParam(item.duration_sec) ?? 0), 0)
    return {
      status: 'created',
      video_resource_id: uploaded.resource_id,
      resource_id: uploaded.resource_id,
      mime_type: 'video/mp4',
      size_bytes: bytes.length,
      duration_sec: roundTime(durationSec),
      count: segments.length,
      input_resource_ids: items.map((item) => item.resourceId),
      segments,
      resource: uploaded.resource,
      source: {
        operation: 'video_compose',
        input_resource_ids: items.map((item) => item.resourceId),
        segments,
      },
      message: `Composed ${segments.length} video segment(s) to video resource #${uploaded.resource_id}.`,
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function createResourceVideoContactSheetToResource(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resourceId = resourceIdParam(args)
  const maxVideoBytes = clampInteger(numberParam(args.max_video_bytes) ?? numberParam(args.maxVideoBytes) ?? DEFAULT_MAX_VIDEO_BYTES, 1, ABSOLUTE_MAX_VIDEO_BYTES)
  const maxUploadBytes = clampInteger(numberParam(args.max_upload_bytes) ?? numberParam(args.maxUploadBytes) ?? DEFAULT_MAX_UPLOAD_BYTES, 1, ABSOLUTE_MAX_UPLOAD_BYTES)
  const columns = clampInteger(numberParam(args.columns) ?? 3, 1, 8)
  const count = clampInteger(numberParam(args.count) ?? 9, 1, 64)
  const rows = Math.max(1, Math.ceil(count / columns))
  const thumbWidth = clampInteger(numberParam(args.thumb_width) ?? numberParam(args.thumbWidth) ?? 320, 64, 960)
  const ffmpeg = resolveFFmpegPath()
  if (!ffmpeg) throw new Error('ffmpeg is required for movscript_resource_video_contact_sheet_to_resource but was not found')

  const file = await downloadResourceFile(resourceId, { maxBytes: maxVideoBytes })
  const dir = await mkdtempStable('movscript-mcp-video-sheet-')
  const inputPath = join(dir, `resource-${resourceId}.video`)
  const outputPath = join(dir, 'contact-sheet.jpg')
  try {
    await writeFile(inputPath, file.bytes)
    const video = await probeVideoMetadata(inputPath, ffmpeg).catch((): VideoFrameSourceMetadata => ({}))
    const durationSec = video.durationSec
    const intervalSec = positiveNumber(numberParam(args.interval_sec) ?? numberParam(args.intervalSec))
      ?? (durationSec ? Math.max(0.1, durationSec / count) : DEFAULT_VIDEO_FRAME_INTERVAL_SEC)
    await runFFmpeg(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      inputPath,
      '-vf',
      `fps=1/${intervalSec.toFixed(3)},scale=${thumbWidth}:-2:force_original_aspect_ratio=decrease,tile=${columns}x${rows}:padding=8:margin=8`,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      outputPath,
    ])
    const bytes = await readFile(outputPath)
    const filename = ensureExtension(stringParam(args.filename) ?? stringParam(args.name) ?? `resource-${resourceId}-contact-sheet`, 'jpg')
    const uploaded = await uploadGeneratedResourceBytes({
      bytes,
      mimeType: 'image/jpeg',
      filename,
      folderId: stringParam(args.folder_id) ?? stringParam(args.folderId),
      maxBytes: maxUploadBytes,
      derivative: {
        operation: 'video_contact_sheet',
        tool: 'movscript_resource_video_contact_sheet_to_resource',
        inputResourceIds: [resourceId],
        params: {
          columns,
          rows,
          count,
          thumb_width: thumbWidth,
          interval_sec: roundTime(intervalSec),
        },
      },
    })
    return {
      status: 'created',
      source_resource_id: resourceId,
      image_resource_id: uploaded.resource_id,
      resource_id: uploaded.resource_id,
      mime_type: 'image/jpeg',
      size_bytes: bytes.length,
      video: publicVideoMetadata(video),
      sheet: {
        columns,
        rows,
        count,
        thumb_width: thumbWidth,
        interval_sec: roundTime(intervalSec),
      },
      resource: uploaded.resource,
      source: {
        operation: 'video_contact_sheet',
        source_resource_id: resourceId,
        columns,
        rows,
        count,
        thumb_width: thumbWidth,
        interval_sec: roundTime(intervalSec),
      },
      message: `Created contact sheet image resource #${uploaded.resource_id} from video resource #${resourceId}.`,
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function extractResourceVideoAudioToResource(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resourceId = resourceIdParam(args)
  const maxVideoBytes = clampInteger(numberParam(args.max_video_bytes) ?? numberParam(args.maxVideoBytes) ?? DEFAULT_MAX_VIDEO_BYTES, 1, ABSOLUTE_MAX_VIDEO_BYTES)
  const maxUploadBytes = clampInteger(numberParam(args.max_upload_bytes) ?? numberParam(args.maxUploadBytes) ?? ABSOLUTE_MAX_UPLOAD_BYTES, 1, ABSOLUTE_MAX_UPLOAD_BYTES)
  const ffmpeg = resolveFFmpegPath()
  if (!ffmpeg) throw new Error('ffmpeg is required for movscript_resource_video_extract_audio_to_resource but was not found')

  const file = await downloadResourceFile(resourceId, { maxBytes: maxVideoBytes })
  const dir = await mkdtempStable('movscript-mcp-video-audio-')
  const inputPath = join(dir, `resource-${resourceId}.video`)
  const outputPath = join(dir, 'audio.m4a')
  try {
    await writeFile(inputPath, file.bytes)
    const range = optionalAudioRangeFromArgs(args)
    await runFFmpeg(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      ...(range ? ['-ss', range.startSec.toFixed(3)] : []),
      '-i',
      inputPath,
      ...(range ? ['-t', (range.endSec - range.startSec).toFixed(3)] : []),
      '-vn',
      '-map',
      '0:a:0?',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      outputPath,
    ])
    const bytes = await readFile(outputPath)
    const filename = ensureExtension(stringParam(args.filename) ?? stringParam(args.name) ?? `resource-${resourceId}-audio`, 'm4a')
    const uploaded = await uploadGeneratedResourceBytes({
      bytes,
      mimeType: 'audio/mp4',
      filename,
      folderId: stringParam(args.folder_id) ?? stringParam(args.folderId),
      maxBytes: maxUploadBytes,
      derivative: {
        operation: 'video_extract_audio',
        tool: 'movscript_resource_video_extract_audio_to_resource',
        inputResourceIds: [resourceId],
        params: {
          ...(range ? { start_sec: range.startSec, end_sec: range.endSec } : {}),
        },
      },
    })
    return {
      status: 'created',
      source_resource_id: resourceId,
      audio_resource_id: uploaded.resource_id,
      resource_id: uploaded.resource_id,
      mime_type: 'audio/mp4',
      size_bytes: bytes.length,
      ...(range ? { start_sec: range.startSec, end_sec: range.endSec, duration_sec: roundTime(range.endSec - range.startSec) } : {}),
      resource: uploaded.resource,
      source: {
        operation: 'video_extract_audio',
        source_resource_id: resourceId,
        ...(range ? { start_sec: range.startSec, end_sec: range.endSec } : {}),
      },
      message: `Extracted audio resource #${uploaded.resource_id} from video resource #${resourceId}.`,
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function transformResourceImageToResource(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resourceId = resourceIdParam(args)
  const maxSourceBytes = clampInteger(numberParam(args.max_source_bytes) ?? numberParam(args.maxSourceBytes) ?? DEFAULT_MAX_IMAGE_BYTES, 1, ABSOLUTE_MAX_IMAGE_BYTES)
  const maxUploadBytes = clampInteger(numberParam(args.max_upload_bytes) ?? numberParam(args.maxUploadBytes) ?? DEFAULT_MAX_UPLOAD_BYTES, 1, ABSOLUTE_MAX_UPLOAD_BYTES)
  const ffmpeg = resolveFFmpegPath()
  if (!ffmpeg) throw new Error('ffmpeg is required for movscript_resource_image_transform_to_resource but was not found')

  const file = await downloadResourceFile(resourceId, { maxBytes: maxSourceBytes })
  const sourceMimeType = normalizeImageMimeType(stringParam(args.mime_type) ?? stringParam(args.mimeType) ?? file.contentType)
  const outputFormat = imageOutputFormat(args, sourceMimeType)
  const outputMimeType = imageMimeTypeForFormat(outputFormat)
  const outputExtension = imageExtensionForFormat(outputFormat)
  const dir = await mkdtempStable('movscript-mcp-image-transform-')
  const inputPath = join(dir, `resource-${resourceId}${extensionForMimeType(sourceMimeType) || '.image'}`)
  const outputPath = join(dir, `transformed.${outputExtension}`)
  try {
    await writeFile(inputPath, file.bytes)
    const source = await probeImageMetadata(inputPath, ffmpeg)
    await decodeImageFrame(inputPath, ffmpeg)
    const transform = imageTransformSpec(args, source)
    const filters = imageTransformFilters(transform)
    await runFFmpeg(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      ...(filters.length > 0 ? ['-vf', filters.join(',')] : []),
      ...(outputFormat === 'jpeg' ? ['-q:v', '2'] : []),
      ...(outputFormat === 'webp' ? ['-lossless', '1'] : []),
      outputPath,
    ])
    const bytes = await readFile(outputPath)
    const filename = ensureExtension(stringParam(args.filename) ?? stringParam(args.name) ?? `resource-${resourceId}-transform`, outputExtension)
    const uploaded = await uploadGeneratedResourceBytes({
      bytes,
      mimeType: outputMimeType,
      filename,
      folderId: stringParam(args.folder_id) ?? stringParam(args.folderId),
      maxBytes: maxUploadBytes,
      derivative: {
        operation: 'image_transform',
        tool: 'movscript_resource_image_transform_to_resource',
        inputResourceIds: [resourceId],
        params: { ...transform.public, output_format: outputFormat },
      },
    })
    return {
      status: 'created',
      source_resource_id: resourceId,
      image_resource_id: uploaded.resource_id,
      resource_id: uploaded.resource_id,
      source_mime_type: sourceMimeType,
      source_size_bytes: file.bytes.length,
      source_width: source.width,
      source_height: source.height,
      mime_type: outputMimeType,
      size_bytes: bytes.length,
      width: transform.output.width,
      height: transform.output.height,
      resource: uploaded.resource,
      transform: { ...transform.public, output_format: outputFormat },
      message: `Transformed image resource #${resourceId} to image resource #${uploaded.resource_id}.`,
    }
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
  const output = await resolveAnnotationOutputPath(args, title)
  const outputPath = output.path
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
    artifact_location: output.location,
    ...(output.cacheDir ? { cache_dir: output.cacheDir } : {}),
    image_payload: 'stored_as_local_artifact',
    mcp_image_content: false,
    message: 'Annotated guidance image was rendered as SVG and stored at artifact_path. The image bytes were not returned as MCP image content. Upload artifact_path with movscript_resource_upload to store it as a RawResource for generation.',
  }
  return mcpToolResultMetadata(metadata)
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

export async function uploadAgentImageResources(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const items = batchItems(args.items, 'items')
  const continueOnError = booleanParam(args.continue_on_error) ?? booleanParam(args.continueOnError) ?? true
  const maxConcurrency = continueOnError
    ? clampInteger(numberParam(args.max_concurrency) ?? numberParam(args.maxConcurrency) ?? 3, 1, 8)
    : 1
  const defaults = batchDefaults(args, new Set(['items', 'continue_on_error', 'continueOnError', 'max_concurrency', 'maxConcurrency']))
  const results = await runBatch(items, maxConcurrency, async (item, index) => {
    const result = await uploadAgentImageResource({ ...defaults, ...item })
    return {
      index,
      status: 'uploaded',
      resource_id: result.resource_id,
      resource: result.resource,
      source: result.source,
      filename: result.filename,
      mime_type: result.mime_type,
      size_bytes: result.size_bytes,
      message: result.message,
    }
  }, continueOnError)
  const successItems = results.filter((item) => item.status !== 'error' && item.status !== 'skipped')
  const failedItems = results.filter((item) => item.status === 'error')
  const resourceIds = successItems
    .map((item) => numberParam(item.resource_id))
    .filter((value): value is number => value !== undefined)
  return {
    status: batchStatus(successItems.length, failedItems.length),
    total: items.length,
    success_count: successItems.length,
    failed_count: failedItems.length,
    items: results,
    resource_ids: resourceIds,
    message: `${successItems.length}/${items.length} resource upload(s) completed.`,
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

async function extractVideoFrame(
  ffmpeg: string,
  inputPath: string,
  outputPath: string,
  input: { timestampSec: number; maxWidth: number; imageFormat: 'jpeg' | 'png' },
): Promise<void> {
  await runFFmpeg(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    input.timestampSec.toFixed(3),
    '-i',
    inputPath,
    '-frames:v',
    '1',
    '-vf',
    `scale=${input.maxWidth}:-2:force_original_aspect_ratio=decrease`,
    ...(input.imageFormat === 'jpeg' ? ['-q:v', '3'] : []),
    outputPath,
  ])
}

async function trimVideoFile(
  ffmpeg: string,
  inputPath: string,
  outputPath: string,
  range: { startSec: number; endSec: number },
  options: { mode: 'fast' | 'accurate'; volume?: number; muted?: boolean },
): Promise<void> {
  const durationSec = Math.max(0.1, range.endSec - range.startSec)
  if (options.mode === 'fast' && !options.muted && options.volume === undefined) {
    await runFFmpeg(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      range.startSec.toFixed(3),
      '-i',
      inputPath,
      '-t',
      durationSec.toFixed(3),
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputPath,
    ])
    return
  }

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputPath,
    '-ss',
    range.startSec.toFixed(3),
    '-t',
    durationSec.toFixed(3),
    '-map',
    '0:v:0',
    '-vf',
    'setsar=1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-movflags',
    '+faststart',
  ]
  const volume = options.volume === undefined ? 100 : clampNumber(options.volume, 0, 200)
  if (options.muted || volume <= 0) {
    args.push('-an')
  } else {
    args.push('-map', '0:a?')
    if (volume !== 100) args.push('-filter:a', `volume=${(volume / 100).toFixed(2)}`)
    args.push('-c:a', 'aac', '-b:a', '128k')
  }
  args.push(outputPath)
  await runFFmpeg(ffmpeg, args)
}

function clipRangeFromArgs(args: Record<string, unknown>, durationSec: number | undefined): { startSec: number; endSec: number } {
  return normalizeClipRange({
    startSec: numberParam(args.start_sec) ?? numberParam(args.startSec) ?? 0,
    endSec: numberParam(args.end_sec) ?? numberParam(args.endSec),
    durationSec: numberParam(args.duration_sec) ?? numberParam(args.durationSec),
    sourceDurationSec: durationSec,
  })
}

function optionalAudioRangeFromArgs(args: Record<string, unknown>): { startSec: number; endSec: number } | undefined {
  const startSec = numberParam(args.start_sec) ?? numberParam(args.startSec)
  const endSec = numberParam(args.end_sec) ?? numberParam(args.endSec)
  const durationSec = numberParam(args.duration_sec) ?? numberParam(args.durationSec)
  if (startSec === undefined && endSec === undefined && durationSec === undefined) return undefined
  return normalizeClipRange({
    startSec: startSec ?? 0,
    endSec,
    durationSec,
  })
}

function clipRangeFromItem(item: VideoComposeItem, durationSec: number | undefined): { startSec: number; endSec: number } {
  return normalizeClipRange({
    startSec: item.startSec ?? 0,
    endSec: item.endSec,
    durationSec: item.durationSec,
    sourceDurationSec: durationSec,
  })
}

function normalizeClipRange(input: { startSec: number; endSec?: number; durationSec?: number; sourceDurationSec?: number }): { startSec: number; endSec: number } {
  const startSec = roundTime(Math.max(0, input.startSec))
  const endCandidate = input.endSec ?? (input.durationSec !== undefined ? startSec + Math.max(0, input.durationSec) : input.sourceDurationSec)
  if (endCandidate === undefined) throw new Error('end_sec or duration_sec is required when video duration cannot be probed')
  const endSec = roundTime(clampToDuration(Math.max(0, endCandidate), input.sourceDurationSec))
  if (endSec <= startSec) throw new Error('video clip range must have end_sec greater than start_sec')
  return { startSec, endSec }
}

function videoComposeItems(value: unknown): VideoComposeItem[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('items must contain at least one video resource item')
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`items[${index}] must be an object`)
    const resourceId = optionalResourceIdParam(item)
    if (resourceId === undefined) throw new Error(`items[${index}].resource_id is required`)
    const startSec = numberParam(item.start_sec) ?? numberParam(item.startSec)
    const endSec = numberParam(item.end_sec) ?? numberParam(item.endSec)
    const durationSec = numberParam(item.duration_sec) ?? numberParam(item.durationSec)
    const volume = numberParam(item.volume)
    const muted = booleanParam(item.muted)
    const normalized: VideoComposeItem = {
      resourceId,
    }
    if (startSec !== undefined) normalized.startSec = startSec
    if (endSec !== undefined) normalized.endSec = endSec
    if (durationSec !== undefined) normalized.durationSec = durationSec
    if (volume !== undefined) normalized.volume = volume
    if (muted !== undefined) normalized.muted = muted
    return normalized
  })
}

async function uploadGeneratedResourceBytes(input: {
  bytes: Buffer
  mimeType: string
  filename: string
  folderId?: string
  maxBytes: number
  derivative?: {
    operation: string
    tool?: string
    inputResourceIds?: number[]
    params?: Record<string, unknown>
  }
}): Promise<{ resource_id: number; resource: unknown }> {
  if (input.bytes.length > input.maxBytes) {
    throw new Error(`generated resource is ${input.bytes.length} bytes, above max_upload_bytes=${input.maxBytes}`)
  }
  const form = new FormData()
  const blob = new Blob([new Uint8Array(input.bytes)], { type: input.mimeType })
  form.append('file', blob, input.filename)
  if (input.folderId) form.append('folder_id', input.folderId)
  if (input.derivative) {
    form.append('derivative', JSON.stringify({
      operation: input.derivative.operation,
      ...(input.derivative.tool ? { tool: input.derivative.tool } : {}),
      input_resource_ids: input.derivative.inputResourceIds ?? [],
      params: input.derivative.params ?? {},
    }))
  }
  const resource = await backendPostMultipart('/resources/upload', form)
  const resourceId = numericResourceId(resource)
  if (resourceId === undefined) throw new Error('resource upload response did not include a valid resource ID')
  return { resource_id: resourceId, resource }
}

function frameOutputFilename(args: Record<string, unknown>, resourceId: number, timestampSec: number, extension: string, index: number): string {
  const explicit = stringParam(args.filename) ?? stringParam(args.name)
  if (explicit) {
    if (index === 0) return ensureExtension(explicit, extension)
    return ensureExtension(`${safeFilename(basename(explicit, extname(explicit)))}-${String(index + 1).padStart(3, '0')}`, extension)
  }
  return `resource-${resourceId}-frame-${timestampSec.toFixed(3).replace('.', '_')}.${extension}`
}

function videoOutputFilename(args: Record<string, unknown>, fallbackBase: string): string {
  const explicit = stringParam(args.filename) ?? stringParam(args.name)
  return ensureExtension(explicit ?? safeFilename(fallbackBase), 'mp4')
}

function ensureExtension(value: string, extension: string): string {
  const normalizedExtension = extension.startsWith('.') ? extension.slice(1) : extension
  const currentExtension = extname(value)
  if (currentExtension.toLowerCase() === `.${normalizedExtension.toLowerCase()}`) return value
  const base = currentExtension ? value.slice(0, -currentExtension.length) : value
  return `${safeFilename(base)}.${normalizedExtension}`
}

function imageOutputFormat(args: Record<string, unknown>, sourceMimeType: string): 'jpeg' | 'png' | 'webp' {
  const explicit = stringParam(args.output_format) ?? stringParam(args.outputFormat) ?? stringParam(args.image_format) ?? stringParam(args.imageFormat)
  switch ((explicit ?? '').toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'jpeg'
    case 'webp':
      return 'webp'
    case 'png':
      return 'png'
    case '':
      if (sourceMimeType === 'image/jpeg' || sourceMimeType === 'image/jpg') return 'jpeg'
      if (sourceMimeType === 'image/webp') return 'webp'
      return 'png'
    default:
      throw new Error('output_format must be one of jpeg, png, or webp')
  }
}

function imageMimeTypeForFormat(format: 'jpeg' | 'png' | 'webp'): string {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'png':
    default:
      return 'image/png'
  }
}

function imageExtensionForFormat(format: 'jpeg' | 'png' | 'webp'): string {
  return format === 'jpeg' ? 'jpg' : format
}

function imageTransformSpec(args: Record<string, unknown>, source: { width: number; height: number }): {
  crop?: { x: number; y: number; width: number; height: number }
  resize?: { width?: number; height?: number; maxWidth?: number; maxHeight?: number }
  output: { width: number; height: number }
  public: Record<string, unknown>
} {
  const cropX = clampInteger(numberParam(args.crop_x) ?? numberParam(args.cropX) ?? 0, 0, source.width)
  const cropY = clampInteger(numberParam(args.crop_y) ?? numberParam(args.cropY) ?? 0, 0, source.height)
  const cropWidth = positiveInteger(numberParam(args.crop_width) ?? numberParam(args.cropWidth))
  const cropHeight = positiveInteger(numberParam(args.crop_height) ?? numberParam(args.cropHeight))
  const crop = cropWidth !== undefined || cropHeight !== undefined
    ? {
        x: cropX,
        y: cropY,
        width: Math.min(cropWidth ?? (source.width - cropX), source.width - cropX),
        height: Math.min(cropHeight ?? (source.height - cropY), source.height - cropY),
      }
    : undefined
  if (crop && (crop.width <= 0 || crop.height <= 0)) throw new Error('crop rectangle must overlap the source image')

  const base = crop ? { width: crop.width, height: crop.height } : source
  const width = positiveInteger(numberParam(args.width))
  const height = positiveInteger(numberParam(args.height))
  const maxWidth = positiveInteger(numberParam(args.max_width) ?? numberParam(args.maxWidth))
  const maxHeight = positiveInteger(numberParam(args.max_height) ?? numberParam(args.maxHeight))
  const resize = width !== undefined || height !== undefined || maxWidth !== undefined || maxHeight !== undefined
    ? { width, height, maxWidth, maxHeight }
    : undefined
  const output = computeImageTransformOutputDimensions(base, resize)
  const publicSpec: Record<string, unknown> = {
    source_width: source.width,
    source_height: source.height,
    output_width: output.width,
    output_height: output.height,
  }
  if (crop) publicSpec.crop = { x: crop.x, y: crop.y, width: crop.width, height: crop.height }
  if (resize) {
    publicSpec.resize = {
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(maxWidth !== undefined ? { max_width: maxWidth } : {}),
      ...(maxHeight !== undefined ? { max_height: maxHeight } : {}),
    }
  }
  return { crop, resize, output, public: publicSpec }
}

function computeImageTransformOutputDimensions(
  source: { width: number; height: number },
  resize?: { width?: number; height?: number; maxWidth?: number; maxHeight?: number },
): { width: number; height: number } {
  if (!resize) return source
  if (resize.width !== undefined && resize.height !== undefined) {
    return { width: resize.width, height: resize.height }
  }
  if (resize.width !== undefined) {
    return { width: resize.width, height: Math.max(1, Math.round(source.height * (resize.width / source.width))) }
  }
  if (resize.height !== undefined) {
    return { width: Math.max(1, Math.round(source.width * (resize.height / source.height))), height: resize.height }
  }
  return fitDimensions(source, resize.maxWidth ?? source.width, resize.maxHeight ?? source.height)
}

function imageTransformFilters(transform: {
  crop?: { x: number; y: number; width: number; height: number }
  resize?: { width?: number; height?: number; maxWidth?: number; maxHeight?: number }
}): string[] {
  const filters: string[] = []
  if (transform.crop) {
    filters.push(`crop=${transform.crop.width}:${transform.crop.height}:${transform.crop.x}:${transform.crop.y}`)
  }
  if (transform.resize) {
    const resize = transform.resize
    if (resize.width !== undefined && resize.height !== undefined) {
      filters.push(`scale=${resize.width}:${resize.height}`)
    } else if (resize.width !== undefined) {
      filters.push(`scale=${resize.width}:-2`)
    } else if (resize.height !== undefined) {
      filters.push(`scale=-2:${resize.height}`)
    } else {
      filters.push(`scale=${resize.maxWidth ?? -2}:${resize.maxHeight ?? -2}:force_original_aspect_ratio=decrease`)
    }
  }
  return filters
}

async function downloadResourceFile(resourceId: number, options: { maxBytes?: number } = {}): Promise<{ bytes: Buffer; contentType?: string; contentLength?: number }> {
  return backendGetBinary(`/resources/${encodeURIComponent(String(resourceId))}/file`, options)
}

async function processResourceImageForVision(
  resourceId: number,
  bytes: Buffer,
  mimeType: string,
  options: { mode: ResourceImageReadMode; maxWidth: number; maxHeight: number },
): Promise<{
  bytes: Buffer
  mimeType: string
  width: number
  height: number
  resized: boolean
  source: { width: number; height: number }
}> {
  const ffmpeg = resolveFFmpegPath()
  if (!ffmpeg) throw new Error('ffmpeg is required for movscript_resource_image_read image validation and resizing but was not found')

  const dir = await mkdtempStable('movscript-mcp-image-')
  const inputPath = join(dir, `resource-${resourceId}${extensionForMimeType(mimeType) || '.image'}`)
  try {
    await writeFile(inputPath, bytes)
    const source = await probeImageMetadata(inputPath, ffmpeg)
    await decodeImageFrame(inputPath, ffmpeg)

    if (options.mode === 'original') {
      return {
        bytes,
        mimeType,
        width: source.width,
        height: source.height,
        resized: false,
        source,
      }
    }

    const outputDimensions = fitDimensions(source, options.maxWidth, options.maxHeight)
    if (outputDimensions.width === source.width && outputDimensions.height === source.height) {
      return {
        bytes,
        mimeType,
        width: source.width,
        height: source.height,
        resized: false,
        source,
      }
    }

    const outputPath = join(dir, 'image-fit.png')
    await runFFmpeg(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-vf',
      `scale=${options.maxWidth}:${options.maxHeight}:force_original_aspect_ratio=decrease`,
      outputPath,
    ])
    const outputBytes = await readFile(outputPath)
    return {
      bytes: outputBytes,
      mimeType: 'image/png',
      width: outputDimensions.width,
      height: outputDimensions.height,
      resized: true,
      source,
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function probeImageMetadata(path: string, ffmpeg: string): Promise<{ width: number; height: number }> {
  const ffprobe = ffprobePath(ffmpeg)
  const result = await runCommand(ffprobe, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'json',
    path,
  ]).catch((error) => {
    throw new Error(`unable to read image dimensions: ${error instanceof Error ? error.message : String(error)}`)
  })
  const parsed = JSON.parse(result.stdout) as { streams?: Array<{ width?: number; height?: number }> }
  const stream = parsed.streams?.find(item => positiveInteger(item.width) !== undefined && positiveInteger(item.height) !== undefined)
  const width = positiveInteger(stream?.width)
  const height = positiveInteger(stream?.height)
  if (width === undefined || height === undefined) throw new Error('unable to read image dimensions')
  return { width, height }
}

async function decodeImageFrame(path: string, ffmpeg: string): Promise<void> {
  await runFFmpeg(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    path,
    '-frames:v',
    '1',
    '-f',
    'null',
    '-',
  ]).catch((error) => {
    throw new Error(`unable to decode image bytes: ${error instanceof Error ? error.message : String(error)}`)
  })
}

function fitDimensions(source: { width: number; height: number }, maxWidth: number, maxHeight: number): { width: number; height: number } {
  if (source.width <= maxWidth && source.height <= maxHeight) return source
  const scale = Math.min(maxWidth / source.width, maxHeight / source.height)
  return {
    width: Math.max(1, Math.floor(source.width * scale)),
    height: Math.max(1, Math.floor(source.height * scale)),
  }
}

function mcpToolResultWithImages(
  metadata: Record<string, unknown>,
  images: Array<{ label?: string; data: string; mimeType: string }>,
  options: { includeText?: boolean } = {},
): Record<string, unknown> {
  const includeText = options.includeText ?? true
  return {
    content: [
      ...(includeText ? [{
        type: 'text',
        text: JSON.stringify(metadata, null, 2),
      }] : []),
      ...images.flatMap((image) => [
        ...(includeText && image.label ? [{ type: 'text', text: image.label }] : []),
        { type: 'image', data: image.data, mimeType: image.mimeType },
      ]),
    ],
    data: metadata,
  }
}

function mcpToolResultMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(metadata, null, 2),
      },
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

async function resolveAnnotationOutputPath(args: Record<string, unknown>, title: string): Promise<{
  path: string
  location: string
  cacheDir?: string
}> {
  const outputPath = stringParam(args.output_path) ?? stringParam(args.outputPath)
  if (outputPath) return { path: outputPath, location: 'explicit_path' }
  const workspacePath = stringParam(args.workspace_path) ?? stringParam(args.workspacePath)
  if (workspacePath) {
    return {
      path: await resolveWorkspaceFilePath(stringParam(args.workspaceDir), workspacePath),
      location: 'workspace_path',
    }
  }
  const dir = join(tmpdir(), 'movscript-mcp-artifacts')
  const filename = `${safeFilename(title || 'annotation')}-${randomUUID().slice(0, 8)}.svg`
  return { path: join(dir, filename), location: 'cache', cacheDir: dir }
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

function resourceImageReadModeParam(args: Record<string, unknown>): ResourceImageReadMode {
  const mode = stringParam(args.mode)
  if (mode === 'original' || mode === 'fit') return mode
  if (mode) throw new Error('mode must be "fit" or "original"')

  const detail = stringParam(args.detail)
  if (detail === 'original') return 'original'
  if (detail === undefined || detail === 'high' || detail === 'auto' || detail === 'low') return 'fit'
  throw new Error('detail must be "original", "high", "auto", or "low"')
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
    case '.mp4':
    case '.m4v':
      return 'video/mp4'
    case '.mov':
      return 'video/quicktime'
    case '.webm':
      return 'video/webm'
    case '.mkv':
      return 'video/x-matroska'
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
    case 'video/mp4':
      return '.mp4'
    case 'video/quicktime':
      return '.mov'
    case 'video/webm':
      return '.webm'
    case 'video/x-matroska':
      return '.mkv'
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

function booleanParam(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function batchItems(value: unknown, name: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${name} must contain at least one item`)
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`${name}[${index}] must be an object`)
    return item
  })
}

function batchDefaults(args: Record<string, unknown>, excluded: Set<string>): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (!excluded.has(key) && value !== undefined) defaults[key] = value
  }
  return defaults
}

async function runBatch(
  items: Record<string, unknown>[],
  concurrency: number,
  worker: (item: Record<string, unknown>, index: number) => Promise<Record<string, unknown>>,
  continueOnError: boolean,
): Promise<Record<string, unknown>[]> {
  const results: Array<Record<string, unknown> | undefined> = new Array(items.length)
  let nextIndex = 0
  let stopped = false
  async function runWorker() {
    while (!stopped) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      const item = items[index]
      if (!item) return
      try {
        results[index] = await worker(item, index)
      } catch (error) {
        results[index] = {
          index,
          status: 'error',
          error: errorMessage(error),
        }
        if (!continueOnError) stopped = true
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker))
  return results.map((result, index) => result ?? {
    index,
    status: 'skipped',
    error: 'Skipped because an earlier item failed and continue_on_error is false.',
  })
}

function batchStatus(successCount: number, failedCount: number): string {
  if (failedCount === 0) return 'completed'
  return successCount > 0 ? 'partial_error' : 'error'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
