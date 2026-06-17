import {
  buildVideoCropFilter,
  hasVideoVisualCrop,
  MAX_TIMELINE_EXPORT_AUDIO_CLIPS,
  MAX_TIMELINE_EXPORT_CAPTIONS,
  MAX_TIMELINE_EXPORT_OVERLAYS,
  normalizeTimelineSpeed,
  normalizeTimelineVideoClips,
  timelineVideoClipOutputDurationMs,
  timelineVideoGapsMs,
} from '@movscript/core/resources'

import type {
  VideoClipInput,
  VideoTimelineExportAudioInput,
  VideoTimelineExportCaptionInput,
  VideoTimelineExportInput,
  VideoTimelineExportOverlayInput,
} from './timelineExportTypes'

export {
  normalizeTimelineSpeed,
  normalizeTimelineVideoClips,
  timelineVideoClipOutputDurationMs,
  timelineVideoGapsMs,
}

export function buildMediaTranscodeArgs(input: {
  sourcePath: string
  outputPath: string
  videoCodec: string
  audioCodec: string
  videoBitrateKbps?: number
  audioBitrateKbps?: number
}): string[] {
  return [
    '-y',
    '-hide_banner',
    '-i', input.sourcePath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', input.videoCodec,
    '-pix_fmt', 'yuv420p',
    ...(input.videoBitrateKbps ? ['-b:v', `${input.videoBitrateKbps}k`] : []),
    '-c:a', input.audioCodec,
    ...(input.audioBitrateKbps ? ['-b:a', `${input.audioBitrateKbps}k`] : []),
    '-movflags', '+faststart',
    input.outputPath,
  ]
}

export function buildMediaReframeFilter(input: {
  width: number
  height: number
  mode: 'crop' | 'contain' | 'stretch'
  background: string
}): string {
  if (input.mode === 'stretch') return `scale=${input.width}:${input.height},setsar=1`
  if (input.mode === 'contain') {
    return `scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease,pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2:color=${input.background},setsar=1`
  }
  return `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},setsar=1`
}

export function buildMediaReframeArgs(input: {
  sourcePath: string
  outputPath: string
  filter: string
}): string[] {
  return [
    '-y',
    '-hide_banner',
    '-i', input.sourcePath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-vf', input.filter,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'copy',
    input.outputPath,
  ]
}

export function buildAudioMixArgs(
  videoPath: string,
  audioInputPaths: string[],
  outputPath: string,
  audioClips: VideoTimelineExportAudioInput[],
): string[] {
  const normalized = normalizeTimelineAudioClips(audioClips).slice(0, audioInputPaths.length)
  const filter = buildAudioMixFilter(normalized)
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', videoPath,
  ]
  for (const path of audioInputPaths) args.push('-i', path)
  args.push(
    '-filter_complex', filter,
    '-map', '0:v:0',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-shortest',
    '-movflags', '+faststart',
    outputPath,
  )
  return args
}

export function buildAudioMixFilter(audioClips: VideoTimelineExportAudioInput[]): string {
  const normalized = normalizeTimelineAudioClips(audioClips)
  if (normalized.length === 0) return 'anullsrc=channel_layout=stereo:sample_rate=48000[aout]'
  const chains = normalized.map((clip, index) => {
    const inputIndex = index + 1
    const start = seconds(clip.startMs)
    const duration = seconds(clip.endMs - clip.startMs)
    const delay = Math.round(clip.timelineStartMs)
    const volume = Math.max(0, Math.min(2, (clip.volume ?? 100) / 100)).toFixed(2)
    const speed = normalizeTimelineSpeed(clip.speed)
    const fadeFilters = buildAudioFadeFilters(clip)
    const speedFilter = speed === 1 ? '' : `,${buildAudioTempoFilter(speed)}`
    return `[${inputIndex}:a]atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS${speedFilter},volume=${volume}${fadeFilters.length ? `,${fadeFilters.join(',')}` : ''},adelay=${delay}|${delay}[a${index}]`
  })
  const mixInputs = normalized.map((_, index) => `[a${index}]`).join('')
  return `${chains.join(';')};${mixInputs}amix=inputs=${normalized.length}:duration=longest:dropout_transition=0[aout]`
}

export function normalizeTimelineAudioClips(audioClips: VideoTimelineExportAudioInput[] | undefined): VideoTimelineExportAudioInput[] {
  return (audioClips ?? [])
    .map(clip => ({
      sourcePath: clip.sourcePath,
      sourceData: clip.sourceData,
      sourceName: clip.sourceName,
      startMs: Math.max(0, Math.round(clip.startMs)),
      endMs: Math.max(0, Math.round(clip.endMs)),
      timelineStartMs: Math.max(0, Math.round(clip.timelineStartMs)),
      volume: clip.volume == null ? undefined : Math.max(0, Math.min(200, clip.volume)),
      speed: normalizeTimelineSpeed(clip.speed),
      fadeInMs: clampFinite(clip.fadeInMs, 0, 0, Math.max(0, Math.floor((clip.endMs - clip.startMs) / 2))),
      fadeOutMs: clampFinite(clip.fadeOutMs, 0, 0, Math.max(0, Math.floor((clip.endMs - clip.startMs) / 2))),
    }))
    .filter(clip => (clip.sourcePath || clip.sourceData) && clip.endMs > clip.startMs)
    .slice(0, MAX_TIMELINE_EXPORT_AUDIO_CLIPS)
}

export function buildCaptionBurnArgs(
  inputPath: string,
  outputPath: string,
  captions: VideoTimelineExportCaptionInput[],
): string[] {
  const filter = buildCaptionFilter(captions)
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', inputPath,
    '-vf', filter,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ]
}

export function buildSubtitleFileBurnArgs(
  inputPath: string,
  outputPath: string,
  subtitlePath: string,
): string[] {
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', inputPath,
    '-vf', `subtitles=filename='${escapeFilterQuotedValue(subtitlePath)}'`,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ]
}

export function buildCaptionFilter(captions: VideoTimelineExportCaptionInput[]): string {
  const normalized = normalizeTimelineCaptions(captions)
    .filter(caption => caption.renderer !== 'ass')
    .sort((a, b) => (a.layerIndex ?? 40) - (b.layerIndex ?? 40) || a.startMs - b.startMs)
  if (normalized.length === 0) return 'null'
  return normalized.map((caption) => {
    const start = seconds(caption.startMs)
    const end = seconds(caption.endMs)
    const fontSize = Math.max(12, Math.min(96, Math.round(caption.fontSize ?? 42)))
    const yPercent = Math.max(5, Math.min(95, Math.round(caption.yPercent ?? 88))) / 100
    const color = sanitizeDrawtextColor(caption.textColor)
    const boxOpacity = Math.max(0, Math.min(100, Math.round(caption.boxOpacityPercent ?? 35))) / 100
    return [
      `drawtext=text='${escapeDrawtextText(caption.text)}'`,
      'x=(w-text_w)/2',
      `y=h*${yPercent.toFixed(2)}-text_h/2`,
      `fontsize=${fontSize}`,
      `fontcolor=${color}`,
      'borderw=3',
      'bordercolor=black@0.85',
      'box=1',
      `boxcolor=black@${boxOpacity.toFixed(2)}`,
      'boxborderw=18',
      `enable='between(t\\,${start}\\,${end})'`,
    ].join(':')
  }).join(',')
}

export function buildAssSubtitleDocument(captions: VideoTimelineExportCaptionInput[]): string {
  const normalized = normalizeTimelineCaptions(captions)
    .filter(caption => caption.renderer === 'ass')
    .sort((a, b) => (a.layerIndex ?? 40) - (b.layerIndex ?? 40) || a.startMs - b.startMs)
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'PlayResX: 1920',
    'PlayResY: 1080',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,42,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,2,48,48,88,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]
  for (const caption of normalized) {
    lines.push([
      'Dialogue:',
      [
        Math.max(0, Math.round(caption.layerIndex ?? 40)),
        assTime(caption.startMs),
        assTime(caption.endMs),
        'Default',
        '',
        0,
        0,
        0,
        '',
        assOverride(caption) + escapeAssText(caption.text),
      ].join(','),
    ].join(' '))
  }
  return `${lines.join('\n')}\n`
}

export function normalizeTimelineCaptions(captions: VideoTimelineExportCaptionInput[] | undefined): VideoTimelineExportCaptionInput[] {
  return (captions ?? [])
    .map((caption): VideoTimelineExportCaptionInput => {
      const align: NonNullable<VideoTimelineExportCaptionInput['align']> = caption.align === 'left' || caption.align === 'right' ? caption.align : 'center'
      const renderer: NonNullable<VideoTimelineExportCaptionInput['renderer']> = caption.renderer === 'ass' ? 'ass' : 'drawtext'
      return {
        startMs: Math.max(0, Math.round(caption.startMs)),
        endMs: Math.max(0, Math.round(caption.endMs)),
        text: caption.text.trim().replace(/\s+/g, ' '),
        layerIndex: clampFinite(caption.layerIndex, 40, -100, 100),
        fontSize: clampFinite(caption.fontSize, 42, 12, 96),
        fontFamily: sanitizeAssFontFamily(caption.fontFamily),
        yPercent: clampFinite(caption.yPercent, 88, 5, 95),
        textColor: sanitizeDrawtextColor(caption.textColor),
        backgroundColor: sanitizeDrawtextColor(caption.backgroundColor),
        boxOpacityPercent: clampFinite(caption.boxOpacityPercent, 35, 0, 100),
        align,
        renderer,
      }
    })
    .filter(caption => caption.text && caption.endMs > caption.startMs)
    .slice(0, MAX_TIMELINE_EXPORT_CAPTIONS)
}

export function buildConcatArgs(concatListPath: string, outputPath: string): string[] {
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ]
}

export function buildConcatList(paths: string[]): string {
  return paths.map(path => `file '${path.replace(/'/g, "'\\''")}'`).join('\n')
}

export function buildOverlayArgs(
  videoPath: string,
  overlayInputPaths: string[],
  outputPath: string,
  overlays: VideoTimelineExportOverlayInput[],
): string[] {
  const normalized = overlays
    .slice(0, overlayInputPaths.length)
    .map((overlay, index) => ({ overlay: normalizeTimelineOverlay(overlay), path: overlayInputPaths[index] }))
    .filter(item => item.path && (item.overlay.sourcePath || item.overlay.sourceData) && item.overlay.endMs > item.overlay.startMs)
    .sort((a, b) => (a.overlay.layerIndex ?? 30) - (b.overlay.layerIndex ?? 30) || a.overlay.startMs - b.overlay.startMs)
    .slice(0, MAX_TIMELINE_EXPORT_OVERLAYS)
  const filter = buildOverlayFilter(normalized.map(item => item.overlay))
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', videoPath,
  ]
  for (const item of normalized) {
    if (item.overlay.sourceKind !== 'video') args.push('-loop', '1')
    args.push('-i', item.path)
  }
  args.push(
    '-filter_complex', filter,
    '-map', '[vout]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath,
  )
  return args
}

export function buildOverlayFilter(overlays: VideoTimelineExportOverlayInput[]): string {
  const normalized = normalizeTimelineOverlays(overlays)
    .sort((a, b) => (a.layerIndex ?? 30) - (b.layerIndex ?? 30) || a.startMs - b.startMs)
  if (normalized.length === 0) return '[0:v]null[vout]'
  const prepare = normalized.map((overlay, index) => {
    const scale = ((overlay.scalePercent ?? 100) / 100).toFixed(3)
    const opacity = ((overlay.opacityPercent ?? 100) / 100).toFixed(3)
    const speed = normalizeTimelineSpeed(overlay.speed)
    const fadeFilters = buildOverlayFadeFilters(overlay)
    const sourceDurationMs = Math.max(100, (overlay.sourceEndMs ?? overlay.endMs) - (overlay.sourceStartMs ?? overlay.startMs))
    const filters = [
      overlay.sourceKind === 'video'
        ? `trim=start=${seconds(overlay.sourceStartMs ?? 0)}:duration=${seconds(sourceDurationMs)}`
        : '',
      overlay.sourceKind === 'video'
        ? speed === 1
          ? `setpts=PTS-STARTPTS+${seconds(overlay.startMs)}/TB`
          : `setpts=${(1 / speed).toFixed(6)}*(PTS-STARTPTS)+${seconds(overlay.startMs)}/TB`
        : '',
    buildMediaPipelineCropFilter(overlay),
      `scale=iw*${scale}:ih*${scale}`,
      'format=rgba',
      `colorchannelmixer=aa=${opacity}`,
      ...fadeFilters,
    ].filter(Boolean)
    return `[${index + 1}:v]${filters.join(',')}[ov${index}]`
  })
  const overlayChains = normalized.map((overlay, index) => {
    const input = index === 0 ? '[0:v]' : `[v${index - 1}]`
    const output = index === normalized.length - 1 ? '[vout]' : `[v${index}]`
    const start = seconds(overlay.startMs)
    const end = seconds(overlay.endMs)
    const x = ((overlay.xPercent ?? 50) / 100).toFixed(3)
    const y = ((overlay.yPercent ?? 50) / 100).toFixed(3)
    return `${input}[ov${index}]overlay=x=W*${x}-w/2:y=H*${y}-h/2:enable='between(t\\,${start}\\,${end})'${output}`
  })
  return [...prepare, ...overlayChains].join(';')
}

export function normalizeTimelineOverlays(overlays: VideoTimelineExportOverlayInput[] | undefined): VideoTimelineExportOverlayInput[] {
  return (overlays ?? [])
    .map(normalizeTimelineOverlay)
    .filter(overlay => (overlay.sourcePath || overlay.sourceData) && overlay.endMs > overlay.startMs)
    .sort((a, b) => (a.layerIndex ?? 30) - (b.layerIndex ?? 30) || a.startMs - b.startMs)
    .slice(0, MAX_TIMELINE_EXPORT_OVERLAYS)
}

export function normalizeTimelineOverlay(overlay: VideoTimelineExportOverlayInput): VideoTimelineExportOverlayInput {
  return {
    sourcePath: overlay.sourcePath,
    sourceData: overlay.sourceData,
    sourceName: overlay.sourceName,
    sourceKind: overlay.sourceKind === 'video' ? 'video' : 'image',
    startMs: Math.max(0, Math.round(overlay.startMs)),
    endMs: Math.max(0, Math.round(overlay.endMs)),
    sourceStartMs: Math.max(0, Math.round(overlay.sourceStartMs ?? 0)),
    sourceEndMs: Math.max(0, Math.round(overlay.sourceEndMs ?? overlay.endMs - overlay.startMs)),
    layerIndex: clampFinite(overlay.layerIndex, 30, -100, 100),
    volume: overlay.volume == null ? undefined : Math.max(0, Math.min(200, overlay.volume)),
    muted: overlay.muted,
    speed: normalizeTimelineSpeed(overlay.speed),
    fadeInMs: clampFinite(overlay.fadeInMs, 0, 0, Math.max(0, Math.floor((overlay.endMs - overlay.startMs) / 2))),
    fadeOutMs: clampFinite(overlay.fadeOutMs, 0, 0, Math.max(0, Math.floor((overlay.endMs - overlay.startMs) / 2))),
    cropLeftPercent: clampFinite(overlay.cropLeftPercent, 0, 0, 45),
    cropRightPercent: clampFinite(overlay.cropRightPercent, 0, 0, 45),
    cropTopPercent: clampFinite(overlay.cropTopPercent, 0, 0, 45),
    cropBottomPercent: clampFinite(overlay.cropBottomPercent, 0, 0, 45),
    xPercent: clampFinite(overlay.xPercent, 50, 0, 100),
    yPercent: clampFinite(overlay.yPercent, 50, 0, 100),
    scalePercent: clampFinite(overlay.scalePercent, 100, 25, 400),
    opacityPercent: clampFinite(overlay.opacityPercent, 100, 0, 100),
  }
}

export function buildTimelineSegmentArgs(
  input: VideoClipInput & {
    sourcePath: string
    volume?: number
    muted?: boolean
    speed?: number
    fit?: 'crop' | 'contain' | 'cover' | 'none'
    width?: number
    height?: number
    background?: string
    xPercent?: number
    yPercent?: number
    scalePercent?: number
  },
  outputPath: string,
  durationMs: number,
): string[] {
  const start = mediaPipelineFFmpegSeconds(input.startMs)
  const duration = mediaPipelineFFmpegSeconds(durationMs)
  const speed = normalizeTimelineSpeed(input.speed)
  const width = positiveInt(input.width) ?? 1280
  const height = positiveInt(input.height) ?? 720
  const background = sanitizeFFmpegColor(input.background) || 'black'
  const filters = [
    buildMediaPipelineCropFilter(input),
    buildVideoFadeFilter(input.fadeInMs, input.fadeOutMs, durationMs),
    speed === 1 ? '' : `setpts=${(1 / speed).toFixed(6)}*PTS`,
    buildTimelineClipFitFilter({
      width,
      height,
      background,
      fit: input.fit,
      xPercent: input.xPercent,
      yPercent: input.yPercent,
      scalePercent: input.scalePercent,
    }),
    'setsar=1',
  ].filter(Boolean).join(',')
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', input.sourcePath,
    '-ss', start,
    '-t', duration,
    '-map', '0:v:0',
    '-vf', filters,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-movflags', '+faststart',
  ]
  const volume = Math.max(0, Math.min(200, input.volume ?? 100))
  if (input.muted || volume <= 0) {
    args.push('-an')
  } else {
    args.push('-map', '0:a?')
    const audioFilters = [
      speed === 1 ? '' : buildAudioTempoFilter(speed),
      volume === 100 ? '' : `volume=${(volume / 100).toFixed(2)}`,
    ].filter(Boolean)
    if (audioFilters.length > 0) args.push('-filter:a', audioFilters.join(','))
    args.push('-c:a', 'aac', '-b:a', '128k')
  }
  args.push(outputPath)
  return args
}

function buildTimelineClipFitFilter(input: {
  width: number
  height: number
  background: string
  fit?: 'crop' | 'contain' | 'cover' | 'none'
  xPercent?: number
  yPercent?: number
  scalePercent?: number
}): string {
  const padColor = input.background === 'black' || input.background === '0x000000'
    ? ''
    : `:color=${input.background}`
  const xPercent = clampFinite(input.xPercent, 50, 0, 100)
  const yPercent = clampFinite(input.yPercent, 50, 0, 100)
  const scalePercent = clampFinite(input.scalePercent, 100, 25, 400)
  const hasTransform = xPercent !== 50 || yPercent !== 50 || scalePercent !== 100
  if (input.fit === 'none') {
    if (!hasTransform) return `scale=${input.width}:${input.height},setsar=1`
    return buildTransformedTimelineClipFilter(`scale=${input.width}:${input.height}`, input, scalePercent, xPercent, yPercent, padColor)
  }
  if (input.fit === 'cover' || input.fit === 'crop') {
    const baseFilter = `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height}`
    return hasTransform ? buildTransformedTimelineClipFilter(baseFilter, input, scalePercent, xPercent, yPercent, padColor) : baseFilter
  }
  const baseFilter = `scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease`
  if (hasTransform) return buildTransformedTimelineClipFilter(baseFilter, input, scalePercent, xPercent, yPercent, padColor)
  return `${baseFilter},pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2${padColor}`
}

function buildTransformedTimelineClipFilter(
  baseFilter: string,
  input: { width: number; height: number },
  scalePercent: number,
  xPercent: number,
  yPercent: number,
  padColor: string,
): string {
  const scale = (scalePercent / 100).toFixed(4)
  const cropX = ((100 - xPercent) / 100).toFixed(4)
  const cropY = ((100 - yPercent) / 100).toFixed(4)
  return [
    baseFilter,
    `scale=trunc(iw*${scale}/2)*2:trunc(ih*${scale}/2)*2`,
    `pad=max(iw\\,${input.width}):max(ih\\,${input.height}):(ow-iw)/2:(oh-ih)/2${padColor}`,
    `crop=${input.width}:${input.height}:(iw-${input.width})*${cropX}:(ih-${input.height})*${cropY}`,
  ].join(',')
}

export function buildAudioTempoFilter(speed: number): string {
  let remaining = normalizeTimelineSpeed(speed)
  const factors: number[] = []
  while (remaining > 2) {
    factors.push(2)
    remaining /= 2
  }
  while (remaining < 0.5) {
    factors.push(0.5)
    remaining /= 0.5
  }
  factors.push(remaining)
  return factors.map(factor => `atempo=${factor.toFixed(3)}`).join(',')
}

export function buildBlankVideoArgs(outputPath: string, durationMs: number, input: { width?: number; height?: number; background?: string } = {}): string[] {
  const width = positiveInt(input.width) ?? 1280
  const height = positiveInt(input.height) ?? 720
  const background = sanitizeFFmpegColor(input.background) || 'black'
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', `color=c=${background}:s=${width}x${height}:r=30`,
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-t', mediaPipelineFFmpegSeconds(durationMs),
    '-shortest',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]
}

export function getRequiredTimelineFFmpegFilters(input: VideoTimelineExportInput): string[] {
  const required = new Set<string>()
  required.add('scale')
  required.add('pad')
  required.add('setsar')
  if (input.clips.some(clip => (clip.fadeInMs ?? 0) > 0 || (clip.fadeOutMs ?? 0) > 0)) {
    required.add('fade')
  }
  if (input.clips.some(clip => normalizeTimelineSpeed(clip.speed) !== 1)) {
    required.add('atempo')
    required.add('setpts')
  }
  if (
    input.clips.some(hasMediaPipelineVisualCrop)
    || input.clips.some(hasMediaPipelineVisualTransform)
    || (input.overlays ?? []).some(hasMediaPipelineVisualCrop)
    || (input.overlays ?? []).some(hasMediaPipelineVisualTransform)
  ) {
    required.add('crop')
  }
  if (timelineVideoGapsMs(input.clips).length > 0) {
    required.add('anullsrc')
    required.add('color')
  }
  if (input.clips.some(clip => !clip.muted && clip.volume != null && clip.volume > 0 && clip.volume !== 100)) {
    required.add('volume')
  }
  const captions = normalizeTimelineCaptions(input.captions)
  if (captions.some(caption => caption.renderer !== 'ass')) {
    required.add('drawtext')
  }
  if (captions.some(caption => caption.renderer === 'ass') || (input.subtitleFiles?.length ?? 0) > 0) {
    required.add('subtitles')
  }
  if (normalizeTimelineOverlays(input.overlays).length > 0) {
    required.add('scale')
    required.add('format')
    required.add('colorchannelmixer')
    required.add('overlay')
    if ((input.overlays ?? []).some(overlay => overlay.sourceKind === 'video')) {
      required.add('trim')
      required.add('setpts')
    }
    if ((input.overlays ?? []).some(overlay => (overlay.fadeInMs ?? 0) > 0 || (overlay.fadeOutMs ?? 0) > 0)) {
      required.add('fade')
    }
  }
  if (normalizeTimelineAudioClips(input.audioClips).length > 0) {
    required.add('atrim')
    required.add('asetpts')
    required.add('volume')
    required.add('adelay')
    required.add('amix')
    if ((input.audioClips ?? []).some(clip => normalizeTimelineSpeed(clip.speed) !== 1)) {
      required.add('atempo')
    }
    if ((input.audioClips ?? []).some(clip => (clip.fadeInMs ?? 0) > 0 || (clip.fadeOutMs ?? 0) > 0)) {
      required.add('afade')
    }
  }
  return [...required].sort()
}

export interface MediaHlsVariantGraphSpec {
  width?: number
  height?: number
  videoBitrateKbps?: number
  video_bitrate_kbps?: number
  audioBitrateKbps?: number
  audio_bitrate_kbps?: number
}

export interface MediaHlsMasterVariant {
  manifestName: string
  width?: number
  height?: number
  bandwidth: number
}

export function buildMediaHlsPackageArgs(input: {
  sourceMp4Path: string
  manifestPath: string
  segmentPattern: string
  segmentDurationSec: number
  initName?: string
}): string[] {
  return [
    '-y',
    '-i', input.sourceMp4Path,
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-f', 'hls',
    '-hls_time', String(input.segmentDurationSec),
    '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', input.initName ?? 'init.mp4',
    '-hls_segment_filename', input.segmentPattern,
    input.manifestPath,
  ]
}

export function buildMediaHlsVariantPackageArgs(input: {
  sourceMp4Path: string
  manifestPath: string
  segmentPattern: string
  initName: string
  segmentDurationSec: number
  variant: MediaHlsVariantGraphSpec
}): string[] {
  return [
    '-y',
    '-i', input.sourceMp4Path,
    ...buildMediaHlsVariantVideoArgs(input.variant),
    '-c:a', 'aac',
    '-b:a', `${mediaHlsVariantAudioBitrate(input.variant)}k`,
    '-f', 'hls',
    '-hls_time', String(input.segmentDurationSec),
    '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', input.initName,
    '-hls_segment_filename', input.segmentPattern,
    input.manifestPath,
  ]
}

export function buildMediaHlsMasterManifest(variants: MediaHlsMasterVariant[]): string {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:7']
  for (const variant of variants) {
    const attrs = [`BANDWIDTH=${variant.bandwidth}`]
    if (variant.width && variant.height) attrs.push(`RESOLUTION=${variant.width}x${variant.height}`)
    lines.push(`#EXT-X-STREAM-INF:${attrs.join(',')}`)
    lines.push(variant.manifestName)
  }
  return `${lines.join('\n')}\n`
}

export function mediaHlsVariantBandwidth(variant: MediaHlsVariantGraphSpec): number {
  return (mediaHlsVariantVideoBitrate(variant) + mediaHlsVariantAudioBitrate(variant)) * 1000
}

function buildMediaHlsVariantVideoArgs(variant: MediaHlsVariantGraphSpec): string[] {
  const args = ['-c:v', 'libx264', '-preset', 'veryfast']
  const bitrate = mediaHlsVariantVideoBitrate(variant)
  args.push('-b:v', `${bitrate}k`, '-maxrate', `${Math.round(bitrate * 1.15)}k`, '-bufsize', `${Math.round(bitrate * 2)}k`)
  const width = positiveInt(variant.width)
  const height = positiveInt(variant.height)
  if (width && height) args.push('-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`)
  else if (height) args.push('-vf', `scale=-2:${height}`)
  else if (width) args.push('-vf', `scale=${width}:-2`)
  return args
}

function mediaHlsVariantVideoBitrate(variant: MediaHlsVariantGraphSpec): number {
  const explicit = positiveInt(variant.videoBitrateKbps ?? variant.video_bitrate_kbps)
  if (explicit) return explicit
  const height = positiveInt(variant.height)
  if (height && height <= 480) return 1000
  if (height && height <= 720) return 2500
  return 5000
}

function mediaHlsVariantAudioBitrate(variant: MediaHlsVariantGraphSpec): number {
  return positiveInt(variant.audioBitrateKbps ?? variant.audio_bitrate_kbps) || 128
}

function buildAudioFadeFilters(clip: VideoTimelineExportAudioInput): string[] {
  const durationMs = Math.max(0, clip.endMs - clip.startMs)
  const maxFadeSeconds = durationMs / 2000
  const fadeInSeconds = Math.min(maxFadeSeconds, Math.max(0, clip.fadeInMs ?? 0) / 1000)
  const fadeOutSeconds = Math.min(maxFadeSeconds, Math.max(0, clip.fadeOutMs ?? 0) / 1000)
  const filters: string[] = []
  if (fadeInSeconds > 0) filters.push(`afade=t=in:st=0:d=${fadeInSeconds.toFixed(3)}`)
  if (fadeOutSeconds > 0) {
    const startSeconds = Math.max(0, durationMs / 1000 - fadeOutSeconds)
    filters.push(`afade=t=out:st=${startSeconds.toFixed(3)}:d=${fadeOutSeconds.toFixed(3)}`)
  }
  return filters
}

function buildOverlayFadeFilters(overlay: VideoTimelineExportOverlayInput): string[] {
  const durationMs = Math.max(0, overlay.endMs - overlay.startMs)
  const maxFadeSeconds = durationMs / 2000
  const fadeInSeconds = Math.min(maxFadeSeconds, Math.max(0, overlay.fadeInMs ?? 0) / 1000)
  const fadeOutSeconds = Math.min(maxFadeSeconds, Math.max(0, overlay.fadeOutMs ?? 0) / 1000)
  const filters: string[] = []
  if (fadeInSeconds > 0) {
    filters.push(`fade=t=in:st=${seconds(overlay.startMs)}:d=${fadeInSeconds.toFixed(3)}:alpha=1`)
  }
  if (fadeOutSeconds > 0) {
    const startSeconds = Math.max(0, overlay.endMs / 1000 - fadeOutSeconds)
    filters.push(`fade=t=out:st=${startSeconds.toFixed(3)}:d=${fadeOutSeconds.toFixed(3)}:alpha=1`)
  }
  return filters
}

export function buildMediaPipelineCropFilter(input: Pick<VideoClipInput, 'cropLeftPercent' | 'cropRightPercent' | 'cropTopPercent' | 'cropBottomPercent'>): string {
  return buildVideoCropFilter(input)
}

export function hasMediaPipelineVisualCrop(input: Pick<VideoClipInput, 'cropLeftPercent' | 'cropRightPercent' | 'cropTopPercent' | 'cropBottomPercent'>): boolean {
  return hasVideoVisualCrop(input)
}

function hasMediaPipelineVisualTransform(input: { xPercent?: number; yPercent?: number; scalePercent?: number }): boolean {
  return clampFinite(input.xPercent, 50, 0, 100) !== 50
    || clampFinite(input.yPercent, 50, 0, 100) !== 50
    || clampFinite(input.scalePercent, 100, 25, 400) !== 100
}

function buildVideoFadeFilter(fadeInMs: number | undefined, fadeOutMs: number | undefined, durationMs: number): string {
  const durationSeconds = Math.max(0, durationMs) / 1000
  const maxFadeSeconds = durationSeconds / 2
  const fadeInSeconds = Math.min(maxFadeSeconds, Math.max(0, fadeInMs ?? 0) / 1000)
  const fadeOutSeconds = Math.min(maxFadeSeconds, Math.max(0, fadeOutMs ?? 0) / 1000)
  const filters: string[] = []
  if (fadeInSeconds > 0) filters.push(`fade=t=in:st=0:d=${fadeInSeconds.toFixed(3)}`)
  if (fadeOutSeconds > 0) {
    const startSeconds = Math.max(0, durationSeconds - fadeOutSeconds)
    filters.push(`fade=t=out:st=${startSeconds.toFixed(3)}:d=${fadeOutSeconds.toFixed(3)}`)
  }
  return filters.join(',')
}

function escapeDrawtextText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
}

function escapeAssText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N')
}

function escapeFilterQuotedValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}

function sanitizeDrawtextColor(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return 'white'
  const hexMatch = normalized.match(/^#([0-9a-f]{6})$/)
  if (hexMatch) return `0x${hexMatch[1]}`
  const ffmpegHexMatch = normalized.match(/^0x[0-9a-f]{6}$/)
  return ffmpegHexMatch ? normalized : 'white'
}

function sanitizeFFmpegColor(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return ''
  const hexMatch = normalized.match(/^#([0-9a-f]{6})$/)
  if (hexMatch) return `0x${hexMatch[1]}`
  const ffmpegHexMatch = normalized.match(/^0x[0-9a-f]{6}$/)
  return ffmpegHexMatch ? normalized : ''
}

function sanitizeAssFontFamily(value: string | undefined): string {
  return value?.trim().replace(/[,{}\\]/g, '').slice(0, 80) || 'Arial'
}

function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3)
}

export function mediaPipelineFFmpegSeconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3)
}

function assTime(ms: number): string {
  const totalCentiseconds = Math.max(0, Math.round(ms / 10))
  const centiseconds = totalCentiseconds % 100
  const totalSeconds = Math.floor(totalCentiseconds / 100)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  return `${hours}:${pad2(minutes)}:${pad2(seconds)}.${pad2(centiseconds)}`
}

function assOverride(caption: VideoTimelineExportCaptionInput): string {
  const yPercent = Math.max(5, Math.min(95, Math.round(caption.yPercent ?? 88))) / 100
  const x = caption.align === 'left'
    ? Math.round(1920 * 0.08)
    : caption.align === 'right'
      ? Math.round(1920 * 0.92)
      : Math.round(1920 / 2)
  const alignment = caption.align === 'left' ? 1 : caption.align === 'right' ? 3 : 2
  const y = Math.round(1080 * yPercent)
  return [
    '{',
    `\\fn${caption.fontFamily || 'Arial'}`,
    `\\fs${Math.max(12, Math.min(96, Math.round(caption.fontSize ?? 42)))}`,
    `\\c${drawtextColorToAssColor(caption.textColor)}`,
    `\\an${alignment}`,
    `\\pos(${x},${y})`,
    '}',
  ].join('')
}

function drawtextColorToAssColor(value: string | undefined): string {
  const normalized = sanitizeDrawtextColor(value)
  if (normalized === 'white') return '&H00FFFFFF&'
  const hex = normalized.replace(/^0x/, '')
  const red = hex.slice(0, 2)
  const green = hex.slice(2, 4)
  const blue = hex.slice(4, 6)
  return `&H00${blue}${green}${red}&`.toUpperCase()
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function clampFinite(value: number | undefined, fallback: number, min: number, max: number): number {
  const finiteValue = Number.isFinite(value) ? value as number : fallback
  return Math.min(max, Math.max(min, Math.round(finiteValue)))
}

function positiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}
