import type { VideoFrameExtraction } from '../../../../media/video/videoFrameExtraction.js'
import type { VideoFrameExtractionMode, VideoFrameOutputLayout } from '../../../../media/video/videoFrameExtraction.js'
import type { RuntimeModelChatMessage } from '../../../../model/config/modelConfig.js'
import { runtimeModelTextContent } from '../../../../messages/model/modelMessage.js'
import type { RuntimeToolHandler } from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import type { AgentRun, JSONValue } from '../../../../state/shared/types.js'
import { isValidAgentEntityId } from '../../../../context/runtime/runtimeContext.js'
import type { CoreVideoFrameExtractionPort } from '../../../../ports/media/videoFrameExtractionPort.js'

export function createCoreVideoFrameToolHandler(): RuntimeToolHandler {
  return {
    toolNames: ['core_video_extract_frames'],
    async execute({ args, run, videoFrameExtractionPort, signal }) {
      const videoResult = await executeVideoFrameExtractionTool(
        args,
        run,
        videoFrameExtractionPort,
        signal,
      )
      return {
        result: videoResult.result,
        supplementalMessages: videoResult.supplementalMessages,
      }
    },
  }
}

async function executeVideoFrameExtractionTool(
  args: Record<string, JSONValue>,
  run: AgentRun,
  videoFrameExtractionPort: CoreVideoFrameExtractionPort,
  signal?: AbortSignal,
): Promise<{ result: JSONValue; supplementalMessages: RuntimeModelChatMessage[] }> {
  const resourceId = entityIdField(args.resourceId) ?? entityIdField(args.resource_id)
  if (resourceId === undefined) throw new Error('core_video_extract_frames requires resourceId')
  const count = Math.max(1, Math.min(Math.floor(numberField(args.count) ?? 4), 8))
  const maxFrames = numberField(args.maxFrames ?? args.max_frames)
  const maxWidth = Math.max(128, Math.min(Math.floor(numberField(args.maxWidth ?? args.max_width) ?? 768), 1280))
  const imageFormat = args.imageFormat === 'png' || args.image_format === 'png' ? 'png' as const : 'jpeg' as const
  const timestampsSec = numberArrayField(args.timestampsSec ?? args.timestamps_sec)
  const mode = modeField(args.mode)
  const outputLayout = outputLayoutField(args.outputLayout ?? args.output_layout)
  const extraction = await videoFrameExtractionPort.extract({
    run,
    resourceId,
    count,
    ...(timestampsSec.length > 0 ? { timestampsSec } : {}),
    ...(mode ? { mode } : {}),
    ...(numberField(args.startSec ?? args.start_sec) !== undefined ? { startSec: numberField(args.startSec ?? args.start_sec) } : {}),
    ...(numberField(args.endSec ?? args.end_sec) !== undefined ? { endSec: numberField(args.endSec ?? args.end_sec) } : {}),
    ...(numberField(args.centerSec ?? args.center_sec) !== undefined ? { centerSec: numberField(args.centerSec ?? args.center_sec) } : {}),
    ...(numberField(args.windowSec ?? args.window_sec) !== undefined ? { windowSec: numberField(args.windowSec ?? args.window_sec) } : {}),
    ...(numberField(args.fps) !== undefined ? { fps: numberField(args.fps) } : {}),
    ...(numberField(args.intervalSec ?? args.interval_sec) !== undefined ? { intervalSec: numberField(args.intervalSec ?? args.interval_sec) } : {}),
    ...(maxFrames !== undefined ? { maxFrames: Math.max(1, Math.min(Math.floor(maxFrames), 16)) } : {}),
    ...(outputLayout ? { outputLayout } : {}),
    maxWidth,
    imageFormat,
    signal,
  })
  return {
    result: publicVideoFrameExtractionResult(extraction) as unknown as JSONValue,
    supplementalMessages: videoFrameSupplementalMessages(extraction),
  }
}

function publicVideoFrameExtractionResult(extraction: VideoFrameExtraction): Record<string, JSONValue> {
  return {
    status: extraction.status,
    resource_id: extraction.resourceId,
    frame_count: extraction.frameCount,
    ...(extraction.durationSec !== undefined ? { duration_sec: extraction.durationSec } : {}),
    ...(extraction.video ? {
      video: {
        ...(extraction.video.durationSec !== undefined ? { duration_sec: extraction.video.durationSec } : {}),
        ...(extraction.video.width !== undefined ? { width: extraction.video.width } : {}),
        ...(extraction.video.height !== undefined ? { height: extraction.video.height } : {}),
        ...(extraction.video.fps !== undefined ? { fps: extraction.video.fps } : {}),
      },
    } : {}),
    sampling: {
      mode: extraction.sampling.mode,
      timestamps_sec: extraction.sampling.timestampsSec,
      requested_frame_count: extraction.sampling.requestedFrameCount,
      returned_frame_count: extraction.sampling.returnedFrameCount,
      max_frames: extraction.sampling.maxFrames,
      ...(extraction.sampling.startSec !== undefined ? { start_sec: extraction.sampling.startSec } : {}),
      ...(extraction.sampling.endSec !== undefined ? { end_sec: extraction.sampling.endSec } : {}),
      ...(extraction.sampling.centerSec !== undefined ? { center_sec: extraction.sampling.centerSec } : {}),
      ...(extraction.sampling.windowSec !== undefined ? { window_sec: extraction.sampling.windowSec } : {}),
      ...(extraction.sampling.fps !== undefined ? { fps: extraction.sampling.fps } : {}),
      ...(extraction.sampling.intervalSec !== undefined ? { interval_sec: extraction.sampling.intervalSec } : {}),
    },
    output_layout: extraction.outputLayout,
    frames: extraction.frames.map((frame) => ({
      index: frame.index,
      timestamp_sec: frame.timestampSec,
      mime_type: frame.mimeType,
      size_bytes: frame.sizeBytes,
      image_payload: 'sent_to_model_as_image_part',
    })),
    source: {
      kind: 'backend_resource',
      resource_id: extraction.resourceId,
      ...(extraction.download.url ? { url: extraction.download.url } : {}),
      ...(extraction.download.contentType ? { content_type: extraction.download.contentType } : {}),
      ...(extraction.download.contentLength !== undefined ? { content_length: extraction.download.contentLength } : {}),
    },
    ...(extraction.warnings && extraction.warnings.length > 0 ? { warnings: extraction.warnings } : {}),
    message: 'Video frames were extracted locally and sent to the model as image parts. The original video file was not sent to the model.',
  }
}

function videoFrameSupplementalMessages(extraction: VideoFrameExtraction): RuntimeModelChatMessage[] {
  if (extraction.frames.length === 0) return []
  return [{
    role: 'user',
    content: [
      ...runtimeModelTextContent([
        `Local video frame extraction for resource_id=${extraction.resourceId}.`,
        'The original video was not sent to the model. Inspect the following extracted frames as representative visual evidence.',
      ].join('\n')),
      ...extraction.frames.flatMap((frame) => ([
        { type: 'text' as const, text: `Frame ${frame.index}, timestamp_sec=${frame.timestampSec}` },
        { type: 'image' as const, source: { type: 'data_url' as const, dataUrl: frame.dataUrl }, detail: 'auto' as const },
      ])),
    ],
  }]
}

function entityIdField(value: JSONValue | undefined): number | undefined {
  return isValidAgentEntityId(value) ? value : undefined
}

function numberField(value: JSONValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function numberArrayField(value: JSONValue | undefined): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map(numberField)
    .filter((item): item is number => item !== undefined && item >= 0)
}

function modeField(value: JSONValue | undefined): VideoFrameExtractionMode | undefined {
  return value === 'overview' || value === 'timestamps' || value === 'range' || value === 'burst'
    ? value
    : undefined
}

function outputLayoutField(value: JSONValue | undefined): VideoFrameOutputLayout | undefined {
  return value === 'individual' || value === 'contact_sheet' || value === 'both'
    ? value
    : undefined
}
