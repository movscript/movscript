import { useRef, useState, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { sourceErrorMessage } from '../application/resourceVideoClipMessages'
import { useResourceVideoClipSource } from '../application/useResourceVideoClipSource'
import { useResourceVideoClipStatus } from '../application/useResourceVideoClipStatus'
import { useResourceVideoClipUpload } from '../application/useResourceVideoClipUpload'
import {
  clipOutputNameError,
  clipRangeError,
  clipSourceError,
  defaultClipOutputName,
  MAX_CLIP_DURATION_MS,
  parseClipTimecode,
} from '../domain/videoClipUi'
import type { RawResource } from '@movscript/shared'
import { clamp } from './ResourcesPageVideoClipDialogParts'

export function useVideoClipDialogController({
  resource,
  folderId,
  onCreated,
}: {
  resource: RawResource
  folderId?: number
  onCreated: (created: RawResource) => void
}) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const source = useResourceVideoClipSource(resource)
  const [duration, setDuration] = useState(0)
  const [startMs, setStartMs] = useState(0)
  const [endMs, setEndMs] = useState(0)
  const [currentMs, setCurrentMs] = useState(0)
  const [outputName, setOutputName] = useState(defaultClipOutputName(resource.name))
  const [mode, setMode] = useState<'accurate' | 'fast'>('accurate')
  const [playing, setPlaying] = useState(false)
  const clipStatus = useResourceVideoClipStatus()
  const {
    clipError,
    clipPhase,
    isBusy,
    uploadClip,
  } = useResourceVideoClipUpload({
    clipStatus,
    endMs,
    folderId,
    mode,
    onCreated,
    outputName,
    resource,
    sourceBlob: source.sourceBlob,
    startMs,
    t,
  })

  const durationMs = Math.max(0, Math.round(duration * 1000))
  const selectedDurationMs = Math.max(0, endMs - startMs)
  const rangeMax = Math.max(durationMs, 1000)
  const rangeError = clipRangeError(startMs, endMs, MAX_CLIP_DURATION_MS)
  const sourceSizeError = clipSourceError(source.sourceBlob?.size ?? resource.size)
  const outputNameError = clipOutputNameError(outputName)
  const canClip = Boolean(source.sourceBlob) && clipStatus.available && !rangeError && !sourceSizeError && !outputNameError && !uploadClip.isPending
  const progressPct = durationMs > 0 ? Math.min(100, Math.max(0, currentMs / durationMs * 100)) : 0
  const sourceProgressPct = source.sourceProgress.total ? Math.min(100, Math.max(0, source.sourceProgress.loaded / source.sourceProgress.total * 100)) : 0
  const selectedPct = durationMs > 0 ? Math.min(100, Math.max(0, selectedDurationMs / durationMs * 100)) : 0
  const phaseLabel = clipPhase === 'idle' ? '' : t(`pages.resources.clipPhases.${clipPhase}`)
  const sourceErrorText = source.sourceError
    ? source.sourceError === 'load_failed'
      ? t('pages.resources.clipLoadSourceFailed')
      : sourceErrorMessage(source.sourceError, source.sourceErrorSize ?? resource.size, t)
    : ''
  const clipStatusErrorText = clipStatus.loading || clipStatus.available
    ? ''
    : clipStatus.unavailableReason === 'host_unavailable'
      ? t('pages.resources.clipDesktopOnly')
      : clipStatus.unavailableReason === 'status_failed' || clipStatus.code === 'FFMPEG_NOT_FOUND'
        ? t('pages.resources.clipFFmpegMissing')
        : clipStatus.error || t('pages.resources.clipFFmpegMissing')

  function handleMetadata() {
    const nextDuration = videoRef.current?.duration ?? 0
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) return
    const nextDurationMs = Math.round(nextDuration * 1000)
    setDuration(nextDuration)
    setStartMs(0)
    setEndMs(Math.min(nextDurationMs, MAX_CLIP_DURATION_MS))
  }

  function setStart(value: number) {
    const next = clamp(value, 0, Math.max(0, endMs - 500))
    setStartMs(next)
    seekTo(next)
  }

  function setEnd(value: number) {
    const next = clamp(value, startMs + 500, rangeMax)
    setEndMs(next)
    if (currentMs > next) seekTo(next)
  }

  function setTimecodeTarget(target: 'start' | 'end', value: string) {
    const parsed = parseClipTimecode(value)
    if (parsed == null) return
    if (target === 'start') {
      setStart(parsed)
      return
    }
    setEnd(parsed)
  }

  function seekTo(ms: number) {
    if (videoRef.current) videoRef.current.currentTime = ms / 1000
    setCurrentMs(ms)
  }

  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      if (video.currentTime * 1000 < startMs || video.currentTime * 1000 >= endMs) {
        video.currentTime = startMs / 1000
      }
      void video.play()
      return
    }
    video.pause()
  }

  function handleTimeUpdate(event: SyntheticEvent<HTMLVideoElement>) {
    const ms = Math.round(event.currentTarget.currentTime * 1000)
    setCurrentMs(ms)
    if (endMs > startMs && ms >= endMs) {
      event.currentTarget.pause()
      event.currentTarget.currentTime = startMs / 1000
    }
  }

  return {
    canClip,
    clipError,
    clipStatus,
    clipStatusErrorText,
    currentMs,
    durationMs,
    handleMetadata,
    handleTimeUpdate,
    isBusy,
    mode,
    outputName,
    outputNameError,
    phaseLabel,
    playing,
    progressPct,
    rangeError,
    rangeMax,
    selectedDurationMs,
    selectedPct,
    setEnd,
    setEndFromCurrent: () => setEnd(currentMs),
    setMode,
    setOutputName,
    setPlaying,
    setStart,
    setStartFromCurrent: () => setStart(currentMs),
    setTimecodeTarget,
    source,
    sourceErrorText,
    sourceProgressPct,
    sourceSizeError,
    startMs,
    endMs,
    t,
    togglePlayback,
    uploadClip,
    videoRef,
    seekTo,
  }
}
