import type { CanvasExecutableSpec, MovPluginHost, PluginRunResult } from '@movscript/plugin-sdk'

interface PluginArgs {
  prompt: string
  voice_id?: string
  language?: string
  speed?: number | string
  subtitle_format?: string
}

interface UploadedResource {
  ID: number
  name?: string
  type?: string
  mime_type?: string
  url?: string
}

interface TimingSegment {
  index: number
  text: string
  start: number
  end: number
}

interface VoiceoverPlan {
  text: string
  voiceId: string
  language: string
  speed: number
  duration: number
  segments: TimingSegment[]
}

const SAMPLE_RATE = 16_000
const MAX_DURATION_SECONDS = 120

function buildPlan(args: PluginArgs): VoiceoverPlan {
  const text = String(args.prompt ?? '').trim()
  if (!text) throw new Error('配音文本不能为空')

  const voiceId = String(args.voice_id ?? 'mock-narrator').trim() || 'mock-narrator'
  const language = String(args.language ?? 'zh-CN').trim() || 'zh-CN'
  const speed = clampNumber(Number(args.speed ?? 1), 0.5, 2)
  const rawSegments = splitText(text)

  let cursor = 0
  const segments = rawSegments.map((segmentText, index) => {
    const duration = estimateDuration(segmentText, language, speed)
    const segment = {
      index: index + 1,
      text: segmentText,
      start: roundTime(cursor),
      end: roundTime(cursor + duration),
    }
    cursor += duration
    return segment
  })

  if (cursor > MAX_DURATION_SECONDS) {
    const scale = MAX_DURATION_SECONDS / cursor
    for (const segment of segments) {
      segment.start = roundTime(segment.start * scale)
      segment.end = roundTime(segment.end * scale)
    }
    cursor = MAX_DURATION_SECONDS
  }

  return {
    text,
    voiceId,
    language,
    speed,
    duration: roundTime(Math.max(cursor, 0.8)),
    segments,
  }
}

export function compile(args: PluginArgs): CanvasExecutableSpec {
  const plan = buildPlan(args)
  return {
    executor: 'ai_model',
    capability: 'audio_tts',
    featureKey: 'plugin.voiceover_generator',
    prompt: plan.text,
    duration: plan.duration,
    params: {
      voice_id: plan.voiceId,
      language: plan.language,
      speed: plan.speed,
      subtitle_format: args.subtitle_format ?? 'srt',
      provider: 'mock',
    },
  }
}

export async function run(host: MovPluginHost, args: PluginArgs): Promise<PluginRunResult> {
  const plan = buildPlan(args)
  const stem = `voiceover-${Date.now()}`
  const timing = {
    schema: 'movscript.mediaArtifacts.v1',
    kind: 'voiceover_timing',
    provider: 'mock',
    model_id: 'mock-local-tone-v1',
    voice_id: plan.voiceId,
    language: plan.language,
    duration: plan.duration,
    sample_rate: SAMPLE_RATE,
    segments: plan.segments,
  }

  const [audio, subtitles, timingResource] = await Promise.all([
    host.resources.upload({
      filename: `${stem}.wav`,
      mime_type: 'audio/wav',
      data_base64: bytesToBase64(generateMockWav(plan)),
    }) as Promise<UploadedResource>,
    host.resources.upload({
      filename: `${stem}.srt`,
      mime_type: 'text/plain',
      text: segmentsToSrt(plan.segments),
    }) as Promise<UploadedResource>,
    host.resources.upload({
      filename: `${stem}.timing.json`,
      mime_type: 'application/json',
      text: JSON.stringify(timing, null, 2),
    }) as Promise<UploadedResource>,
  ])

  return {
    content: [{
      type: 'text',
      text: [
        '语音生成完成 (mock)',
        `音频资源 ID: ${audio.ID}`,
        `字幕资源 ID: ${subtitles.ID}`,
        `时间轴资源 ID: ${timingResource.ID}`,
        `时长: ${plan.duration.toFixed(2)}s`,
      ].join('\n'),
    }],
    data: {
      provider: 'mock',
      model_id: 'mock-local-tone-v1',
      output_resource_id: audio.ID,
      output_resource_ids: [audio.ID, subtitles.ID, timingResource.ID],
      output_resource: audio,
      audio_resource_id: audio.ID,
      subtitle_resource_id: subtitles.ID,
      timing_resource_id: timingResource.ID,
      resources: {
        audio,
        subtitles,
        timing: timingResource,
      },
      outputs: {
        audio: { type: 'audio', resource_id: audio.ID, resource: audio },
        subtitles: { type: 'text', resource_id: subtitles.ID, resource: subtitles },
        timing: { type: 'json', resource_id: timingResource.ID, resource: timingResource, json: timing },
      },
      timing,
    },
  }
}

function splitText(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim()
  const matches = normalized.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) ?? [normalized]
  const segments: string[] = []
  for (const match of matches) {
    const value = match.trim()
    if (!value) continue
    if (value.length <= 42) {
      segments.push(value)
      continue
    }
    for (let start = 0; start < value.length; start += 36) {
      segments.push(value.slice(start, start + 36).trim())
    }
  }
  return segments.length > 0 ? segments : [normalized]
}

function estimateDuration(text: string, language: string, speed: number) {
  const charsPerSecond = language.startsWith('zh') || language.startsWith('ja') ? 5.2 : 13
  const weightedLength = Math.max(text.replace(/\s/g, '').length, 1)
  return clampNumber(weightedLength / charsPerSecond / speed + 0.18, 0.55, 8)
}

function generateMockWav(plan: VoiceoverPlan) {
  const sampleCount = Math.max(1, Math.ceil(plan.duration * SAMPLE_RATE))
  const dataBytes = sampleCount * 2
  const bytes = new Uint8Array(44 + dataBytes)
  const view = new DataView(bytes.buffer)
  writeAscii(bytes, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(bytes, 8, 'WAVE')
  writeAscii(bytes, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(bytes, 36, 'data')
  view.setUint32(40, dataBytes, true)

  const baseFrequency = 180 + (hashString(plan.voiceId) % 120)
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / SAMPLE_RATE
    const segment = plan.segments.find((item) => t >= item.start && t < item.end)
    const active = segment ? 1 : 0.12
    const envelope = Math.min(1, i / 480, (sampleCount - i) / 480)
    const syllable = segment ? 1 + ((segment.index % 5) * 0.035) : 0.65
    const sample = Math.sin(2 * Math.PI * baseFrequency * syllable * t) * 0.12 * active * Math.max(0, envelope)
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true)
  }
  return bytes
}

function segmentsToSrt(segments: TimingSegment[]) {
  return segments.map((segment) => [
    String(segment.index),
    `${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}`,
    segment.text,
    '',
  ].join('\n')).join('\n')
}

function formatSrtTime(value: number) {
  const ms = Math.max(0, Math.round(value * 1000))
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  const millis = ms % 1000
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(millis).padStart(3, '0')}`
}

function writeAscii(bytes: Uint8Array, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    bytes[offset + i] = value.charCodeAt(i)
  }
}

function bytesToBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function hashString(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}
