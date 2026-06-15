import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Pause, Play, Scissors, X as XIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RawResource } from '@/types'
import { api } from '@/shared/infrastructure/api'
import { createObjectUrl, revokeObjectUrl } from '@/shared/ui/objectUrl'
import { loadResourceBlob } from '@/shared/ui/resourceBlob'
import { UrlVideo } from '@/shared/ui/UrlMedia'
import { toast } from '@/shared/ui/toastStore'
import {
  clipOutputNameError,
  clipRangeError,
  clipSourceError,
  defaultClipOutputName,
  MAX_CLIP_DURATION_MS,
  parseClipTimecode,
} from '@/features/resources/domain/videoClipUi'
import { clipResourceVideo, getResourceVideoClipStatus, resourceVideoClipApiAvailable } from '@/features/resources/application/resourceVideoClipElectron'
import { clipErrorMessage, sourceErrorMessage } from '@/features/resources/application/resourceVideoClipMessages'
import { formatResourceBytes } from '@/features/resources/components/resourceLibraryFormatting'
import { clamp, formatTime, RangeField } from '@/features/resources/components/ResourcesPageVideoClipDialogParts'
import { Dialog } from '@movscript/ui/primitives'
import {
  ResourceMediaFillFrame,
} from '@movscript/ui/business/resource'
import {
  ResourceClipControls,
  ResourceClipExpectedPath,
  ResourceClipFooter,
  ResourceClipHint,
  ResourceClipLayout,
  ResourceClipMain,
  ResourceClipModeGroup,
  ResourceClipProgress,
  ResourceClipRangeGrid,
  ResourceClipRangeTrack,
  ResourceClipSidebar,
  ResourceClipStageFrame,
  ResourceClipStageState,
  ResourceClipStageText,
  ResourceClipStatusText,
  ResourceClipSummary,
  ResourceClipTime,
  ResourceDialogCloseButton,
  ResourceDialogContent,
  ResourceDialogField,
  ResourceDialogFieldLabel,
  ResourceDialogFooter,
  ResourceDialogHeader,
  ResourceDialogInput,
  ResourceDialogStack,
  ResourceDialogText,
  ResourcePageActionButton,
  ResourceStateMessage,
} from '@/features/resources/components/ResourcePageUi'

type ClipPhase = 'idle' | 'preparing' | 'clipping' | 'uploading'

export function VideoClipDialog({
  resource,
  folderId,
  onClose,
  onCreated,
}: {
  resource: RawResource
  folderId?: number
  onClose: () => void
  onCreated: (created: RawResource) => void
}) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [duration, setDuration] = useState(0)
  const [startMs, setStartMs] = useState(0)
  const [endMs, setEndMs] = useState(0)
  const [currentMs, setCurrentMs] = useState(0)
  const [outputName, setOutputName] = useState(defaultClipOutputName(resource.name))
  const [mode, setMode] = useState<'accurate' | 'fast'>('accurate')
  const [playing, setPlaying] = useState(false)
  const [loadingSource, setLoadingSource] = useState(true)
  const [sourceProgress, setSourceProgress] = useState<{ loaded: number; total?: number }>({ loaded: 0 })
  const [sourceLoadAttempt, setSourceLoadAttempt] = useState(0)
  const [sourceError, setSourceError] = useState('')
  const [sourceErrorRetryable, setSourceErrorRetryable] = useState(false)
  const [clipError, setClipError] = useState('')
  const [clipPhase, setClipPhase] = useState<ClipPhase>('idle')
  const [clipStatus, setClipStatus] = useState<{ loading: boolean; available: boolean; version?: string; error?: string; code?: 'FFMPEG_NOT_FOUND' | 'FFMPEG_UNAVAILABLE'; expectedBundledPath?: string; platform?: string; arch?: string }>({
    loading: true,
    available: false,
  })

  const uploadClip = useMutation({
    mutationFn: async () => {
      if (!sourceBlob) throw new Error(t('pages.resources.clipSourceMissing'))
      if (!resourceVideoClipApiAvailable()) throw new Error(t('pages.resources.clipDesktopOnly'))
      setClipError('')
      setClipPhase('preparing')
      const sourceData = await sourceBlob.arrayBuffer()
      setClipPhase('clipping')
      const result = await clipResourceVideo({
        sourceData,
        sourceName: resource.name,
        startMs,
        endMs,
        outputName,
        mode,
      })
      if (!result) throw new Error(t('pages.resources.clipDesktopOnly'))
      if (!result.ok || !result.data) {
        throw new Error(clipErrorMessage(result.code, result.error, t))
      }
      const clipBytes = new Uint8Array(result.data)
      const clipBuffer = clipBytes.buffer.slice(clipBytes.byteOffset, clipBytes.byteOffset + clipBytes.byteLength) as ArrayBuffer
      const file = new window.File([clipBuffer], result.outputName || outputName, { type: result.mimeType || 'video/mp4' })
      const fd = new FormData()
      fd.append('file', file)
      if (folderId) fd.append('folder_id', String(folderId))
      setClipPhase('uploading')
      const created = await api.post('/resources/upload', fd).then(r => r.data as RawResource)
      return { created, fallbackApplied: result.fallbackApplied === true }
    },
    onSuccess: ({ created, fallbackApplied }) => {
      setClipPhase('idle')
      toast.success(t('pages.resources.clipCreated'), fallbackApplied ? t('pages.resources.clipFallbackApplied', { name: created.name }) : created.name)
      onCreated(created)
    },
    onError: (error) => {
      setClipPhase('idle')
      setClipError(error instanceof Error ? error.message : t('pages.resources.clipFailed'))
    },
  })

  useEffect(() => {
    let active = true
    let objectUrl = ''
    const controller = new AbortController()
    setLoadingSource(true)
    setSourceError('')
    setSourceErrorRetryable(false)
    setSourceProgress({ loaded: 0, total: resource.size || undefined })
    const initialSourceError = clipSourceError(resource.size)
    if (initialSourceError) {
      setSourceError(sourceErrorMessage(initialSourceError, resource.size, t))
      setSourceErrorRetryable(false)
      setLoadingSource(false)
      setSourceBlob(null)
      setSourceUrl('')
      return () => {
        active = false
      }
    }
    loadResourceBlob(resource, {
      signal: controller.signal,
      onDownloadProgress: (event) => {
        if (!active) return
        setSourceProgress({
          loaded: event.loaded,
          total: event.total || resource.size || undefined,
        })
      },
    })
      .then((blob) => {
        if (!active) return
        const downloadedSourceError = clipSourceError(blob.size)
        if (downloadedSourceError) {
          setSourceError(sourceErrorMessage(downloadedSourceError, blob.size, t))
          setSourceErrorRetryable(false)
          return
        }
        objectUrl = createObjectUrl(blob)
        setSourceBlob(blob)
        setSourceUrl(objectUrl)
      })
      .catch(() => {
        if (active) {
          setSourceError(t('pages.resources.clipLoadSourceFailed'))
          setSourceErrorRetryable(true)
        }
      })
      .finally(() => {
        if (active) setLoadingSource(false)
      })
    return () => {
      active = false
      controller.abort()
      revokeObjectUrl(objectUrl)
    }
  }, [resource, sourceLoadAttempt, t])

  useEffect(() => {
    let active = true
    if (!resourceVideoClipApiAvailable()) {
      setClipStatus({ loading: false, available: false, error: t('pages.resources.clipDesktopOnly') })
      return
    }
    setClipStatus({ loading: true, available: false })
    getResourceVideoClipStatus()
      .then((status) => {
        if (!active) return
        if (!status) {
          setClipStatus({ loading: false, available: false, error: t('pages.resources.clipDesktopOnly') })
          return
        }
        setClipStatus({
          loading: false,
          available: status.available,
          version: status.version,
          error: status.available
            ? undefined
            : status.code === 'FFMPEG_NOT_FOUND'
              ? t('pages.resources.clipFFmpegMissing')
              : status.error || t('pages.resources.clipFFmpegMissing'),
          code: status.code,
          expectedBundledPath: status.expectedBundledPath,
          platform: status.platform,
          arch: status.arch,
        })
      })
      .catch(() => {
        if (active) setClipStatus({ loading: false, available: false, error: t('pages.resources.clipFFmpegMissing') })
      })
    return () => {
      active = false
    }
  }, [t])

  const durationMs = Math.max(0, Math.round(duration * 1000))
  const selectedDurationMs = Math.max(0, endMs - startMs)
  const rangeMax = Math.max(durationMs, 1000)
  const rangeError = clipRangeError(startMs, endMs, MAX_CLIP_DURATION_MS)
  const sourceSizeError = clipSourceError(sourceBlob?.size ?? resource.size)
  const outputNameError = clipOutputNameError(outputName)
  const isBusy = uploadClip.isPending
  const canClip = Boolean(sourceBlob) && clipStatus.available && !rangeError && !sourceSizeError && !outputNameError && !uploadClip.isPending
  const progressPct = durationMs > 0 ? Math.min(100, Math.max(0, currentMs / durationMs * 100)) : 0
  const sourceProgressPct = sourceProgress.total ? Math.min(100, Math.max(0, sourceProgress.loaded / sourceProgress.total * 100)) : 0
  const selectedPct = durationMs > 0 ? Math.min(100, Math.max(0, selectedDurationMs / durationMs * 100)) : 0
  const phaseLabel = clipPhase === 'idle' ? '' : t(`pages.resources.clipPhases.${clipPhase}`)

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

  function setStartFromCurrent() {
    setStart(currentMs)
  }

  function setEndFromCurrent() {
    setEnd(currentMs)
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
    } else {
      video.pause()
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && !isBusy && onClose()}>
      <ResourceDialogContent size="clip" hideClose>
          <ResourceDialogHeader
            icon={Scissors}
            title={t('pages.resources.clipVideoTitle')}
            close={(
            <ResourceDialogCloseButton
              disabled={isBusy}
              aria-label={t('common.close')}
            >
              <XIcon size={16} />
            </ResourceDialogCloseButton>
            )}
          />

          <ResourceClipLayout>
            <ResourceClipMain>
              <ResourceClipStageFrame>
                {loadingSource ? (
                  <ResourceClipStageState>
                    <ResourceClipStageText>{t('pages.resources.clipLoadingSource')}</ResourceClipStageText>
                    <ResourceClipProgress value={sourceProgressPct} variant="inverse" />
                    <ResourceDialogText tone="faint">
                      {sourceProgress.total
                        ? t('pages.resources.clipLoadProgress', { loaded: formatResourceBytes(sourceProgress.loaded), total: formatResourceBytes(sourceProgress.total) })
                        : formatResourceBytes(sourceProgress.loaded)}
                    </ResourceDialogText>
                  </ResourceClipStageState>
                ) : sourceError ? (
                  <ResourceClipStageState>
                    <ResourceClipStageText>{sourceError}</ResourceClipStageText>
                    {sourceErrorRetryable && (
                      <ResourcePageActionButton
                        size="sm"
                        variant="outline"
                        onClick={() => setSourceLoadAttempt(attempt => attempt + 1)}
                        aria-label={t('pages.resources.clipRetryLoad')}
                      >
                        {t('pages.resources.clipRetryLoad')}
                      </ResourcePageActionButton>
                    )}
                  </ResourceClipStageState>
                ) : (
                  <ResourceMediaFillFrame fit="contain">
                    <UrlVideo
                      ref={videoRef}
                      src={sourceUrl}
                      controls={false}
                      playsInline
                      onLoadedMetadata={handleMetadata}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onTimeUpdate={(event) => {
                        const ms = Math.round(event.currentTarget.currentTime * 1000)
                        setCurrentMs(ms)
                        if (endMs > startMs && ms >= endMs) {
                          event.currentTarget.pause()
                          event.currentTarget.currentTime = startMs / 1000
                        }
                      }}
                    />
                  </ResourceMediaFillFrame>
                )}
              </ResourceClipStageFrame>

              <ResourceClipControls>
                  <ResourcePageActionButton
                    size="icon-sm"
                    variant="outline"
                    onClick={togglePlayback}
                    disabled={!sourceBlob}
                    title={playing ? t('pages.resources.clipPause') : t('pages.resources.clipPlaySegment')}
                    aria-label={playing ? t('pages.resources.clipPause') : t('pages.resources.clipPlaySegment')}
                  >
                    {playing ? <Pause size={14} /> : <Play size={14} />}
                  </ResourcePageActionButton>
                  <ResourcePageActionButton
                    size="sm"
                    variant="outline"
                    onClick={() => seekTo(startMs)}
                    disabled={!sourceBlob || isBusy}
                    aria-label={t('pages.resources.clipGoStart')}
                  >
                    {t('pages.resources.clipGoStart')}
                  </ResourcePageActionButton>
                  <ResourcePageActionButton
                    size="sm"
                    variant="outline"
                    onClick={setStartFromCurrent}
                    disabled={!sourceBlob || isBusy}
                    aria-label={t('pages.resources.clipSetStart')}
                  >
                    {t('pages.resources.clipSetStart')}
                  </ResourcePageActionButton>
                  <ResourcePageActionButton
                    size="sm"
                    variant="outline"
                    onClick={setEndFromCurrent}
                    disabled={!sourceBlob || isBusy}
                    aria-label={t('pages.resources.clipSetEnd')}
                  >
                    {t('pages.resources.clipSetEnd')}
                  </ResourcePageActionButton>
                  <ResourceClipRangeTrack
                    rangeStart={durationMs ? startMs / durationMs * 100 : 0}
                    rangeSize={selectedPct}
                    marker={progressPct}
                  />
                  <ResourceClipTime>{formatTime(currentMs)} / {formatTime(durationMs)}</ResourceClipTime>
              </ResourceClipControls>

                <ResourceClipRangeGrid>
                  <RangeField
                    label={t('pages.resources.clipStart')}
                    value={startMs}
                    max={rangeMax}
                    onChange={setStart}
                    onTimecodeCommit={value => setTimecodeTarget('start', value)}
                    disabled={isBusy}
                  />
                  <RangeField
                    label={t('pages.resources.clipEnd')}
                    value={endMs}
                    max={rangeMax}
                    onChange={setEnd}
                    onTimecodeCommit={value => setTimecodeTarget('end', value)}
                    disabled={isBusy}
                  />
                </ResourceClipRangeGrid>
            </ResourceClipMain>

            <ResourceClipSidebar>
              <ResourceDialogStack density="loose">
                <ResourceDialogField>
                  <ResourceDialogFieldLabel>{t('pages.resources.clipOutputName')}</ResourceDialogFieldLabel>
                  <ResourceDialogInput
                    value={outputName}
                    onChange={event => setOutputName(event.target.value)}
                    disabled={isBusy}
                  />
                </ResourceDialogField>
                <ResourceDialogField>
                  <ResourceDialogFieldLabel>{t('pages.resources.clipMode')}</ResourceDialogFieldLabel>
                  <ResourceClipModeGroup>
                    <ResourcePageActionButton size="xs" variant={mode === 'accurate' ? 'solid' : 'ghost'} disabled={isBusy} onClick={() => setMode('accurate')}>
                      {t('pages.resources.clipAccurate')}
                    </ResourcePageActionButton>
                    <ResourcePageActionButton size="xs" variant={mode === 'fast' ? 'solid' : 'ghost'} disabled={isBusy} onClick={() => setMode('fast')}>
                      {t('pages.resources.clipFast')}
                    </ResourcePageActionButton>
                  </ResourceClipModeGroup>
                </ResourceDialogField>
                <ResourceClipSummary
                  rows={[
                    { label: t('pages.resources.clipDuration'), value: formatTime(selectedDurationMs) },
                    { label: t('pages.resources.clipMaxDuration'), value: formatTime(MAX_CLIP_DURATION_MS) },
                    { label: t('pages.resources.clipSource'), value: resource.name, title: resource.name },
                    { label: t('pages.resources.clipSourceSize'), value: formatResourceBytes(sourceBlob?.size ?? resource.size) },
                    { label: t('pages.resources.clipOutput'), value: outputName, title: outputName },
                  ]}
                />
                {phaseLabel && (
                  <ResourceStateMessage tone="info">
                    {phaseLabel}
                  </ResourceStateMessage>
                )}
                {isBusy && (
                  <ResourceStateMessage tone="neutral">
                    {t('pages.resources.clipBusyHint')}
                  </ResourceStateMessage>
                )}
                {rangeError && (
                  <ResourceStateMessage tone="danger">
                    {rangeError === 'too_long' ? t('pages.resources.clipTooLong') : t('pages.resources.clipInvalidRange')}
                  </ResourceStateMessage>
                )}
                {sourceSizeError && (
                  <ResourceStateMessage tone="danger">
                    {sourceErrorMessage(sourceSizeError, sourceBlob?.size ?? resource.size, t)}
                  </ResourceStateMessage>
                )}
                {outputNameError && (
                  <ResourceStateMessage tone="danger">
                    {outputNameError === 'unsupported_extension'
                      ? t('pages.resources.clipOutputNameMp4')
                      : outputNameError === 'invalid_filename'
                        ? t('pages.resources.clipOutputNameInvalid')
                        : outputNameError === 'too_long'
                          ? t('pages.resources.clipOutputNameTooLong')
                        : t('pages.resources.clipOutputNameRequired')}
                  </ResourceStateMessage>
                )}
                <ResourceClipHint>
                  {t('pages.resources.clipLocalHint')}
                </ResourceClipHint>
                <ResourceStateMessage tone={
                  clipStatus.loading
                    ? 'neutral'
                    : clipStatus.available
                      ? 'success'
                      : 'danger'
                }>
                  {clipStatus.loading
                    ? t('pages.resources.clipCheckingFFmpeg')
                    : clipStatus.available
                      ? t('pages.resources.clipFFmpegReady', { version: clipStatus.version || 'ffmpeg' })
                      : (
                        <ResourceClipStatusText>
                          {clipStatus.error || t('pages.resources.clipFFmpegMissing')}
                          {clipStatus.expectedBundledPath && (
                            <ResourceClipExpectedPath>
                              {t('pages.resources.clipFFmpegExpectedPath', { path: clipStatus.expectedBundledPath })}
                            </ResourceClipExpectedPath>
                          )}
                        </ResourceClipStatusText>
                      )}
                </ResourceStateMessage>
                {(clipError || !resourceVideoClipApiAvailable()) && (
                  <ResourceStateMessage tone="danger">
                    {clipError || t('pages.resources.clipDesktopOnly')}
                  </ResourceStateMessage>
                )}
              </ResourceDialogStack>
            </ResourceClipSidebar>
          </ResourceClipLayout>

          <ResourceClipFooter>
            <ResourcePageActionButton variant="outline" size="sm" onClick={onClose} disabled={isBusy}>{t('common.cancel')}</ResourcePageActionButton>
            <ResourcePageActionButton size="sm" onClick={() => uploadClip.mutate()} disabled={!canClip}>
              <Scissors size={14} />
              {uploadClip.isPending ? (phaseLabel || t('pages.resources.clipCreating')) : t('pages.resources.clipCreate')}
            </ResourcePageActionButton>
          </ResourceClipFooter>
      </ResourceDialogContent>
    </Dialog>
  )
}
