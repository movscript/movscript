import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import type { Project, RawResource, ResourceBinding, ResourceFolder, PaginatedResponse } from '@/types'
import {
  Upload, Trash2, Search, Image as ImageIcon, Video, FileAudio, File as FileIcon,
  Folder, FolderOpen, Share2,
  ChevronRight, MoreHorizontal, MoveRight,
  Pencil, X as XIcon,
  LayoutGrid, List, ChevronLeft, Download, FileText,
  Scissors, Play, Pause,
} from 'lucide-react'
import { MediaViewer, downloadResource, resolveResourceUrl } from '@/shared/ui/MediaViewer'
import { ResourceListItem } from '@/shared/ui/ResourcePanel'
import { ResourceCandidateAttachPanel, candidateResourceFromRawResource } from '@/shared/ui/ResourceCandidateAttachPanel'
import {
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ResourceAssetActionButton,
  ResourceAssetCard,
  ResourceAssetName,
  ResourceAssetPreviewFallback,
  ResourceAssetSelectCheckbox,
  ResourceClipModeGroup,
  ResourceClipSummary,
  ResourceClipControls,
  ResourceClipExpectedPath,
  ResourceClipFooter,
  ResourceClipHint,
  ResourceClipLayout,
  ResourceClipMain,
  ResourceClipProgress,
  ResourceClipRangeFieldHeader,
  ResourceClipRangeFieldRoot,
  ResourceClipRangeGrid,
  ResourceClipRangeInput,
  ResourceClipRangeTrack,
  ResourceClipSidebar,
  ResourceClipStageFrame,
  ResourceClipStageState,
  ResourceClipStageText,
  ResourceClipStatusText,
  ResourceClipTime,
  ResourceContextMenu,
  ResourceContextMenuButton,
  ResourceDangerMenuItem,
  ResourceDialogCloseButton,
  ResourceDialogContent,
  ResourceDialogField,
  ResourceDialogFieldLabel,
  ResourceDialogFooter,
  ResourceDialogHeader,
  ResourceDialogInput,
  ResourceDialogScrollArea,
  ResourceDialogSelect,
  ResourceDialogStack,
  ResourceDialogText,
  ResourceDialogTitle,
  ResourceFolderOption,
  ResourceMediaFillFrame,
  ResourcePageActionButton,
  ResourcePageActionGroup,
  ResourcePageAssetGrid,
  ResourcePageAssetList,
  ResourcePageBulkActions,
  ResourcePageContent,
  ResourcePageEmptyState,
  ResourcePageFilterBar,
  ResourcePageFlexibleSpace,
  ResourcePageHiddenFileInput,
  ResourcePageLayout,
  ResourcePageListCheckbox,
  ResourcePageListRow,
  ResourcePageLoadingState,
  ResourcePageMain,
  ResourcePageMutedText,
  ResourcePagePager,
  ResourcePageSearchField,
  ResourceStateMessage,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { RESOURCE_UPLOAD_ACCEPT } from '@/features/resources/domain/mediaTypes'
import { toast } from '@/shared/ui/toastStore'
import {
  clipOutputNameError,
  clipRangeError,
  clipSourceError,
  defaultClipOutputName,
  MAX_CLIP_DURATION_MS,
  MAX_CLIP_SOURCE_BYTES,
  parseClipTimecode,
} from '@/features/resources/domain/videoClipUi'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'

type TypeFilter = 'all' | 'image' | 'video' | 'audio' | 'text'
type ResourceScopeFilter = 'all' | 'personal' | 'team' | 'project'
type ClipPhase = 'idle' | 'preparing' | 'clipping' | 'uploading'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'image': return <ImageIcon size={14} />
    case 'video': return <Video size={14} />
    case 'audio': return <FileAudio size={14} />
    case 'text': return <FileText size={14} />
    default: return <FileIcon size={14} />
  }
}

const TYPE_TABS: { labelKey: string; value: TypeFilter }[] = [
  { labelKey: 'common.all', value: 'all' },
  { labelKey: 'pages.resources.types.image', value: 'image' },
  { labelKey: 'pages.resources.types.video', value: 'video' },
  { labelKey: 'pages.resources.types.audio', value: 'audio' },
  { labelKey: 'pages.resources.types.text', value: 'text' },
]

const SCOPE_TABS: { labelKey: string; value: ResourceScopeFilter; requiresProject?: boolean }[] = [
  { labelKey: 'pages.resources.scopes.all', value: 'all' },
  { labelKey: 'pages.resources.scopes.personal', value: 'personal' },
  { labelKey: 'pages.resources.scopes.team', value: 'team' },
  { labelKey: 'pages.resources.scopes.project', value: 'project', requiresProject: true },
]

// ─── Move to Folder Dialog ───────────────────────────────────────────────────
function MoveDialog({
  resource,
  folders,
  onClose,
}: {
  resource: RawResource
  folders: ResourceFolder[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  // null = root (unfiled), number = folder ID
  const [targetFolder, setTargetFolder] = useState<number | null>(resource.folder_id ?? null)

  const move = useMutation({
    mutationFn: () =>
      api.put(`/resources/${resource.ID}`, { folder_id: targetFolder ?? 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      onClose()
    },
  })

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <ResourceDialogContent size="xs">
          <ResourceDialogTitle>{t('pages.resources.moveToFolder')}</ResourceDialogTitle>
          <ResourceDialogText title={resource.name}>{resource.name}</ResourceDialogText>
          <ResourceDialogScrollArea>
            <FolderOption
              label={t('pages.resources.unfiledRoot')}
              selected={targetFolder === null}
              onClick={() => setTargetFolder(null)}
            />
            {folders.map(f => (
              <FolderOption
                key={f.ID}
                label={f.name}
                selected={targetFolder === f.ID}
                onClick={() => setTargetFolder(f.ID)}
              />
            ))}
          </ResourceDialogScrollArea>
          <ResourceDialogFooter>
            <ResourcePageActionButton variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</ResourcePageActionButton>
            <ResourcePageActionButton size="sm" onClick={() => move.mutate()} disabled={move.isPending}>
              {move.isPending ? t('pages.resources.moving') : t('pages.resources.move')}
            </ResourcePageActionButton>
          </ResourceDialogFooter>
      </ResourceDialogContent>
    </Dialog>
  )
}

// ─── Rename Resource Dialog ──────────────────────────────────────────────────
function RenameResourceDialog({
  resource,
  onClose,
}: {
  resource: RawResource
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState(resource.name)

  const rename = useMutation({
    mutationFn: () => api.put(`/resources/${resource.ID}`, { name: name.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      onClose()
    },
  })

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <ResourceDialogContent size="sm">
          <ResourceDialogTitle>{t('pages.resources.renameResource')}</ResourceDialogTitle>
          <ResourceDialogField>
            <ResourceDialogFieldLabel>{t('forms.name')}</ResourceDialogFieldLabel>
            <ResourceDialogInput
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && name.trim()) rename.mutate()
              }}
            />
          </ResourceDialogField>
          <ResourceDialogFooter>
            <ResourcePageActionButton variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</ResourcePageActionButton>
            <ResourcePageActionButton size="sm" onClick={() => rename.mutate()} disabled={!name.trim() || rename.isPending}>
              {rename.isPending ? t('common.saving') : t('common.save')}
            </ResourcePageActionButton>
          </ResourceDialogFooter>
      </ResourceDialogContent>
    </Dialog>
  )
}

function VideoClipDialog({
  resource,
  folderId,
  onClose,
  onCreated,
}: {
  resource: RawResource
  folderId?: number
  onClose: () => void
  onCreated: () => void
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
  const [clipStatus, setClipStatus] = useState<{
    loading: boolean
    available: boolean
    version?: string
    error?: string
    code?: 'FFMPEG_NOT_FOUND' | 'FFMPEG_UNAVAILABLE'
    expectedBundledPath?: string
    platform?: string
    arch?: string
  }>({
    loading: true,
    available: false,
  })

  const uploadClip = useMutation({
    mutationFn: async () => {
      if (!sourceBlob) throw new Error(t('pages.resources.clipSourceMissing'))
      const clipVideo = window.api?.clipVideo
      if (!clipVideo) throw new Error(t('pages.resources.clipDesktopOnly'))
      setClipError('')
      setClipPhase('preparing')
      const sourceData = await sourceBlob.arrayBuffer()
      setClipPhase('clipping')
      const result = await clipVideo({
        sourceData,
        sourceName: resource.name,
        startMs,
        endMs,
        outputName,
        mode,
      })
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
      onCreated()
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
    api.get(resolveResourceUrl(resource), {
      baseURL: '',
      responseType: 'blob',
      signal: controller.signal,
      onDownloadProgress: (event) => {
        if (!active) return
        setSourceProgress({
          loaded: event.loaded,
          total: event.total || resource.size || undefined,
        })
      },
    })
      .then((response) => {
        if (!active) return
        const blob = response.data as Blob
        const downloadedSourceError = clipSourceError(blob.size)
        if (downloadedSourceError) {
          setSourceError(sourceErrorMessage(downloadedSourceError, blob.size, t))
          setSourceErrorRetryable(false)
          return
        }
        objectUrl = URL.createObjectURL(blob)
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
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [resource, sourceLoadAttempt, t])

  useEffect(() => {
    let active = true
    const getStatus = window.api?.getVideoClipStatus
    if (!getStatus) {
      setClipStatus({ loading: false, available: false, error: t('pages.resources.clipDesktopOnly') })
      return
    }
    setClipStatus({ loading: true, available: false })
    getStatus()
      .then((status) => {
        if (!active) return
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
                        ? t('pages.resources.clipLoadProgress', { loaded: formatBytes(sourceProgress.loaded), total: formatBytes(sourceProgress.total) })
                        : formatBytes(sourceProgress.loaded)}
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
                    <video
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
                    { label: t('pages.resources.clipSourceSize'), value: formatBytes(sourceBlob?.size ?? resource.size) },
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
                {(clipError || !window.api?.clipVideo) && (
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

function RangeField({ label, value, max, onChange, onTimecodeCommit, disabled = false }: {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
  onTimecodeCommit: (value: string) => void
  disabled?: boolean
}) {
  const [timecode, setTimecode] = useState(formatTime(value))

  useEffect(() => {
    setTimecode(formatTime(value))
  }, [value])

  function commitTimecode() {
    onTimecodeCommit(timecode)
    setTimecode(formatTime(value))
  }

  return (
    <ResourceClipRangeFieldRoot>
      <ResourceClipRangeFieldHeader>
        <ResourceDialogFieldLabel>{label}</ResourceDialogFieldLabel>
        <ResourceDialogInput
          value={timecode}
          onChange={event => setTimecode(event.target.value)}
          onBlur={commitTimecode}
          disabled={disabled}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setTimecode(formatTime(value))
              event.currentTarget.blur()
            }
          }}
          aria-label={label}
        />
      </ResourceClipRangeFieldHeader>
      <ResourceClipRangeInput min={0} max={max} step={100} value={value} onChange={event => onChange(Number(event.target.value))} disabled={disabled} />
    </ResourceClipRangeFieldRoot>
  )
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const millis = Math.floor((Math.max(0, ms) % 1000) / 100)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${millis}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function clipErrorMessage(code: string | undefined, fallback: string | undefined, t: ReturnType<typeof useTranslation>['t']): string {
  if (code === 'FFMPEG_NOT_FOUND') return t('pages.resources.clipFFmpegMissing')
  if (code === 'CLIP_TOO_LONG') return t('pages.resources.clipTooLong')
  if (code === 'CLIP_TIMEOUT') return t('pages.resources.clipTimeout')
  if (code === 'INVALID_RANGE') return t('pages.resources.clipInvalidRange')
  if (code === 'SOURCE_EMPTY') return t('pages.resources.clipSourceEmpty')
  if (code === 'SOURCE_TOO_LARGE') return t('pages.resources.clipSourceTooLarge', { size: '', max: formatBytes(MAX_CLIP_SOURCE_BYTES) })
  return fallback || t('pages.resources.clipFailed')
}

function sourceErrorMessage(error: 'empty' | 'too_large', size: number | undefined, t: ReturnType<typeof useTranslation>['t']): string {
  if (error === 'empty') return t('pages.resources.clipSourceEmpty')
  return t('pages.resources.clipSourceTooLarge', { size: formatBytes(size ?? 0), max: formatBytes(MAX_CLIP_SOURCE_BYTES) })
}

function FolderOption({ label, selected, onClick }: {
  label: string; selected: boolean; onClick: () => void
}) {
  return (
    <ResourceFolderOption
      active={selected}
      icon={<Folder size={12} />}
      label={label}
      onClick={onClick}
    />
  )
}

function resourceIDs(resources: RawResource[]) {
  return Array.from(new Set(resources.map(resource => resource.ID).filter(id => Number.isFinite(id) && id > 0)))
}

function resourceScopeLabel(resource: RawResource, currentUserID: number | undefined, currentOrgID: number | undefined, t: ReturnType<typeof useTranslation>['t']) {
  if (currentOrgID && resource.org_id === currentOrgID) {
    if (resource.owner && resource.owner_id !== currentUserID) {
      return t('pages.resources.teamResourceWithOwner', { owner: resource.owner.username, defaultValue: `Team library / ${resource.owner.username}` })
    }
    return t('pages.resources.teamResource', { defaultValue: 'Team library' })
  }
  if (resource.owner_id === currentUserID) {
    return t('pages.resources.personalStaging', { defaultValue: 'Personal staging' })
  }
  if (resource.owner?.username) {
    return t('pages.resources.resourceOwner', { owner: resource.owner.username, defaultValue: `Owner: ${resource.owner.username}` })
  }
  return undefined
}

function projectScopeResources(bindings: ResourceBinding[], filter: TypeFilter, query: string) {
  const seen = new Set<number>()
  const keyword = query.trim().toLowerCase()
  return bindings
    .map(binding => binding.resource)
    .filter((resource): resource is RawResource => Boolean(resource))
    .filter(resource => {
      if (seen.has(resource.ID)) return false
      seen.add(resource.ID)
      if (filter !== 'all' && resource.type !== filter) return false
      if (keyword && !resource.name.toLowerCase().includes(keyword)) return false
      return true
    })
}

function paginateResources(resources: RawResource[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  return resources.slice(start, start + pageSize)
}

// ─── Share To Project Dialog ─────────────────────────────────────────────────
function ShareToProjectDialog({
  resources,
  projects,
  onClose,
  onShare,
  isSharing,
}: {
  resources: RawResource[]
  projects: Project[]
  onClose: () => void
  onShare: (projectID: number) => void
  isSharing: boolean
}) {
  const { t } = useTranslation()
  const [projectID, setProjectID] = useState(projects[0]?.ID ?? 0)

  useEffect(() => {
    if (projectID === 0 && projects[0]) setProjectID(projects[0].ID)
  }, [projectID, projects])

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <ResourceDialogContent size="md">
          <ResourceDialogTitle>
            {t('pages.resources.shareToProjectTitle', { defaultValue: '分享给项目' })}
          </ResourceDialogTitle>
          <ResourceDialogStack>
            <ResourceDialogText>
              {t('pages.resources.shareToProjectHint', {
                count: resources.length,
                defaultValue: `将 ${resources.length} 个资源加入项目引用，项目成员可读取这些资源。`,
              })}
            </ResourceDialogText>
            <ResourceDialogSelect
              value={projectID}
              onChange={event => setProjectID(Number(event.target.value))}
            >
              {projects.map(project => (
                <option key={project.ID} value={project.ID}>{project.name}</option>
              ))}
            </ResourceDialogSelect>
            {projects.length === 0 && (
              <ResourceDialogText>{t('pages.resources.noProjectsToShare', { defaultValue: '当前团队没有可分享的项目。' })}</ResourceDialogText>
            )}
          </ResourceDialogStack>
          <ResourceDialogFooter>
            <ResourcePageActionButton variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</ResourcePageActionButton>
            <ResourcePageActionButton size="sm" onClick={() => onShare(projectID)} disabled={!projectID || isSharing}>
              {isSharing ? t('common.saving') : t('pages.resources.shareToProject', { defaultValue: '分享给项目' })}
            </ResourcePageActionButton>
          </ResourceDialogFooter>
      </ResourceDialogContent>
    </Dialog>
  )
}

function ResourceBulkContextMenu({
  x,
  y,
  resources,
  canShareToTeam,
  onClose,
  onShareToTeam,
  onShareToProject,
}: {
  x: number
  y: number
  resources: RawResource[]
  canShareToTeam: boolean
  onClose: () => void
  onShareToTeam: () => void
  onShareToProject: () => void
}) {
  const { t } = useTranslation()
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [onClose])

  return (
    <ResourceContextMenu
      x={x}
      y={y}
      label={t('pages.resources.selectedCount', { count: resources.length, defaultValue: `${resources.length} selected` })}
      onClick={event => event.stopPropagation()}
    >
      {canShareToTeam && (
        <ResourceContextMenuButton onClick={onShareToTeam}>
          <Share2 size={14} />
          {t('pages.resources.shareToTeam', { defaultValue: '加入团队资源库' })}
        </ResourceContextMenuButton>
      )}
      <ResourceContextMenuButton onClick={onShareToProject}>
        <FolderOpen size={14} />
        {t('pages.resources.shareToProject', { defaultValue: '分享给项目' })}
      </ResourceContextMenuButton>
    </ResourceContextMenu>
  )
}

// ─── Resource Card ────────────────────────────────────────────────────────────
function ResourceCard({
  resource,
  currentUserID,
  currentOrgID,
  onDelete,
  onMove,
  onRename,
  onDownload,
  onClip,
  isSharedView,
  selected,
  onSelectChange,
  onContextMenu,
  previewProjectId,
}: {
  resource: RawResource
  currentUserID?: number
  currentOrgID?: number
  onDelete?: () => void
  onMove: () => void
  onRename: () => void
  onDownload: () => void
  onClip?: () => void
  isSharedView?: boolean
  selected?: boolean
  onSelectChange?: (selected: boolean) => void
  onContextMenu?: (event: MouseEvent, resource: RawResource) => void
  previewProjectId?: number
}) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <ResourceAssetCard
      selected={selected}
      draggable
      onContextMenu={(event) => onContextMenu?.(event, resource)}
      onDragStart={(event) => {
        event.dataTransfer.setData('application/resource-id', String(resource.ID))
        event.dataTransfer.setData('application/canvas-resource', JSON.stringify(resource))
        event.dataTransfer.effectAllowed = 'copy'
      }}
      title={t('shared.resourcePanel.previewDragTitle')}
      preview={(
        resource.type === 'image' || resource.type === 'video' || resource.type === 'audio' || resource.type === 'text' ? (
          <MediaViewer
            resource={resource}
            fit="cover"
            sidePanel={(
              <ResourceCandidateAttachPanel
                resources={[candidateResourceFromRawResource(resource)]}
                projectId={previewProjectId}
                compact
              />
            )}
          />
        ) : (
          <ResourceAssetPreviewFallback>
            <TypeIcon type={resource.type} />
          </ResourceAssetPreviewFallback>
        )
      )}
      selectControl={onSelectChange ? (
          <ResourceAssetSelectCheckbox
            checked={Boolean(selected)}
            onCheckedChange={onSelectChange}
            inputProps={{ 'aria-label': t('pages.resources.selectResource', { defaultValue: '选择资源' }) }}
            onClick={event => event.stopPropagation()}
          />
        ) : undefined}
      actionControl={(
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <ResourceAssetActionButton
              title={t('pages.resources.actions')}
            >
              <MoreHorizontal size={12} />
            </ResourceAssetActionButton>
          </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuItem
                onSelect={onDownload}
              >
                <Download size={14} />
                {t('shared.mediaViewer.download')}
              </DropdownMenuItem>
              {!isSharedView && (
                <DropdownMenuItem
                  onSelect={onRename}
                >
                  <Pencil size={14} />
                  {t('pages.resources.renameResource')}
                </DropdownMenuItem>
              )}
              {!isSharedView && (
                <DropdownMenuItem
                  onSelect={onMove}
                >
                  <MoveRight size={14} />
                  {t('pages.resources.moveToFolder')}
                </DropdownMenuItem>
              )}
              {!isSharedView && resource.type === 'video' && onClip && (
                <DropdownMenuItem
                  onSelect={onClip}
                >
                  <Scissors size={14} />
                  {t('pages.resources.clipVideo')}
                </DropdownMenuItem>
              )}
              {!isSharedView && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <ResourceDangerMenuItem onSelect={onDelete}>
                    <Trash2 size={14} />
                    {t('common.delete')}
                  </ResourceDangerMenuItem>
                </>
              )}
            </DropdownMenuContent>
        </DropdownMenu>
      )}
      typeIcon={<TypeIcon type={resource.type} />}
      name={<ResourceAssetName title={resource.name}>{resource.name}</ResourceAssetName>}
      size={formatBytes(resource.size)}
      owner={resourceScopeLabel(resource, currentUserID, currentOrgID, t)}
    />
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ResourcesPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const currentOrgID = useUserStore(state => state.currentOrgID)
  const currentUser = useUserStore(state => state.currentUser)
  const currentProject = useProjectStore(state => state.current)
  const fileRef = useRef<HTMLInputElement>(null)
  const [scope, setScope] = useState<ResourceScopeFilter>('all')
  const [filter, setFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const [moveResource, setMoveResource] = useState<RawResource | null>(null)
  const [renameResource, setRenameResource] = useState<RawResource | null>(null)
  const [clipResource, setClipResource] = useState<RawResource | null>(null)
  const [selectedResourceIDs, setSelectedResourceIDs] = useState<Set<number>>(() => new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; resources: RawResource[] } | null>(null)
  const [shareProjectResources, setShareProjectResources] = useState<RawResource[] | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [page, setPage] = useState(1)
  const pageSize = 30

  useEffect(() => {
    if ((scope === 'team' && !currentOrgID) || (scope === 'project' && !currentProject?.ID)) {
      setScope('all')
      setPage(1)
      setSelectedResourceIDs(new Set())
    }
  }, [scope, currentOrgID, currentProject?.ID])

  // My folders
  const { data: myFolders = [] } = useQuery<ResourceFolder[]>({
    queryKey: ['resource-folders', 'mine'],
    queryFn: () => api.get('/resource-folders').then(r => r.data),
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects', 'resource-share-targets'],
    queryFn: () => api.get('/projects').then(r => r.data),
  })

  const isProjectScope = scope === 'project'

  // Resources: unified library view without folder or shared tab filtering.
  const { data: resourcesData, isLoading: isResourceLoading } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['resources', scope, filter, search, page],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', String(pageSize))
      if (scope === 'personal' || scope === 'team') params.set('scope', scope)
      if (filter !== 'all') params.set('type', filter)
      if (search.trim()) params.set('q', search.trim())
      return api.get(`/resources?${params}`).then(r => r.data)
    },
    enabled: !isProjectScope,
  })

  const { data: projectBindings = [], isLoading: isProjectResourcesLoading } = useQuery<ResourceBinding[]>({
    queryKey: ['resource-bindings', currentProject?.ID, 'library-scope'],
    queryFn: () => api.get(`/projects/${currentProject!.ID}/resource-bindings`).then(r => r.data),
    enabled: isProjectScope && Boolean(currentProject?.ID),
  })
  const projectResources = isProjectScope ? projectScopeResources(projectBindings, filter, search) : []
  const resources = isProjectScope ? paginateResources(projectResources, page, pageSize) : resourcesData?.items ?? []
  const total = isProjectScope ? projectResources.length : resourcesData?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const isLoading = isProjectScope ? isProjectResourcesLoading : isResourceLoading

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/resources/upload', fd).then(r => r.data as RawResource)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resources'] }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/resources/${id}`),
    onSuccess: (_, id) => {
      setSelectedResourceIDs(current => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      qc.invalidateQueries({ queryKey: ['resources'] })
    },
  })

  const adoptToTeam = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id => api.post(`/resources/${id}/adopt-to-team`)))
    },
    onSuccess: () => {
      setContextMenu(null)
      setSelectedResourceIDs(new Set())
      qc.invalidateQueries({ queryKey: ['resources'] })
      toast.success(t('pages.resources.sharedToTeamSuccess', { defaultValue: '已加入团队资源库' }))
    },
  })

  const shareToProject = useMutation({
    mutationFn: async ({ projectID, ids }: { projectID: number; ids: number[] }) => {
      await Promise.all(ids.map(id => api.post(`/projects/${projectID}/resource-bindings`, {
        resource_id: id,
        owner_type: 'project',
        owner_id: projectID,
        role: 'reference',
        status: 'selected',
        source_type: 'manual',
      })))
    },
    onSuccess: () => {
      setContextMenu(null)
      setShareProjectResources(null)
      setSelectedResourceIDs(new Set())
      qc.invalidateQueries({ queryKey: ['resources'] })
      qc.invalidateQueries({ queryKey: ['resource-bindings'] })
      toast.success(t('pages.resources.sharedToProjectSuccess', { defaultValue: '已分享给项目' }))
    },
  })

  const isSharedView = false

  const visible = resources
  const selectedResources = visible.filter(resource => selectedResourceIDs.has(resource.ID))
  const selectedIDs = resourceIDs(selectedResources)
  const selectedPersonalStagingResources = selectedResources.filter(canAdoptToTeam)

  useEffect(() => {
    setSelectedResourceIDs(current => {
      const visibleIDs = new Set(visible.map(resource => resource.ID))
      const next = new Set(Array.from(current).filter(id => visibleIDs.has(id)))
      return next.size === current.size ? current : next
    })
  }, [visible])

  function setResourceSelected(resource: RawResource, selected: boolean) {
    setSelectedResourceIDs(current => {
      const next = new Set(current)
      if (selected) next.add(resource.ID)
      else next.delete(resource.ID)
      return next
    })
  }

  function contextMenuResources(resource: RawResource) {
    if (selectedResourceIDs.has(resource.ID)) {
      const selected = visible.filter(item => selectedResourceIDs.has(item.ID))
      return selected.length > 0 ? selected : [resource]
    }
    return [resource]
  }

  function openResourceContextMenu(event: MouseEvent, resource: RawResource) {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, resources: contextMenuResources(resource) })
  }

  function shareResourcesToTeam(resourcesToShare: RawResource[]) {
    const ids = resourceIDs(resourcesToShare.filter(canAdoptToTeam))
    if (ids.length === 0) return
    adoptToTeam.mutate(ids)
  }

  function openShareToProject(resourcesToShare: RawResource[]) {
    if (resourcesToShare.length === 0) return
    setContextMenu(null)
    setShareProjectResources(resourcesToShare)
  }

  function canAdoptToTeam(resource: RawResource) {
    return Boolean(currentOrgID && currentUser?.ID && resource.owner_id === currentUser.ID && !resource.org_id)
  }

  return (
    <ResourcePageLayout>
      <ResourcePageMain>
        <ResourcePageHiddenFileInput
          ref={fileRef}
          type="file"
          accept={RESOURCE_UPLOAD_ACCEPT}
          multiple
          onChange={e => {
            if (!e.target.files) return
            Array.from(e.target.files).forEach(f => upload.mutate(f))
            e.target.value = ''
          }}
        />

        <ResourcePageFilterBar>
          <ResourcePageSearchField
            icon={Search}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder={t('pages.resources.searchFilesPlaceholder')}
          />
          <ResourcePageActionButton
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            hidden={isProjectScope}
          >
            <Upload size={14} />
            {upload.isPending ? t('pages.resources.uploading') : t('pages.resources.uploadFile')}
          </ResourcePageActionButton>
          <ResourcePageActionGroup>
            <ResourcePageActionButton
              size="icon-xs"
              variant={viewMode === 'grid' ? 'solid' : 'ghost'}
              onClick={() => setViewMode('grid')}
              title={t('pages.resources.gridTitle')}
            >
              <LayoutGrid size={14} />
            </ResourcePageActionButton>
            <ResourcePageActionButton
              size="icon-xs"
              variant={viewMode === 'list' ? 'solid' : 'ghost'}
              onClick={() => setViewMode('list')}
              title={t('pages.resources.listTitle')}
            >
              <List size={14} />
            </ResourcePageActionButton>
          </ResourcePageActionGroup>
          <ResourcePageActionGroup>
            {SCOPE_TABS.map(tabItem => {
              const disabled = (tabItem.requiresProject && !currentProject?.ID) || (tabItem.value === 'team' && !currentOrgID)
              return (
                <ResourcePageActionButton
                  key={tabItem.value}
                  size="xs"
                  variant={scope === tabItem.value ? 'solid' : 'ghost'}
                  onClick={() => { if (!disabled) { setScope(tabItem.value); setPage(1); setSelectedResourceIDs(new Set()) } }}
                  disabled={disabled}
                >
                  {t(tabItem.labelKey)}
                </ResourcePageActionButton>
              )
            })}
          </ResourcePageActionGroup>
          <ResourcePageActionGroup>
            {TYPE_TABS.map(tabItem => (
              <ResourcePageActionButton
                key={tabItem.value}
                size="xs"
                variant={filter === tabItem.value ? 'solid' : 'ghost'}
                onClick={() => { setFilter(tabItem.value); setPage(1) }}
              >
                {t(tabItem.labelKey)}
              </ResourcePageActionButton>
            ))}
          </ResourcePageActionGroup>
          <ResourcePageFlexibleSpace />
          {selectedIDs.length > 0 && (
            <ResourcePageBulkActions>
              <ResourcePageMutedText>
                {t('pages.resources.selectedCount', { count: selectedIDs.length, defaultValue: `${selectedIDs.length} selected` })}
              </ResourcePageMutedText>
              {selectedPersonalStagingResources.length > 0 && (
                <ResourcePageActionButton variant="outline" size="sm" onClick={() => shareResourcesToTeam(selectedResources)} disabled={adoptToTeam.isPending}>
                  <Share2 size={14} />
                  {t('pages.resources.shareToTeam', { defaultValue: '加入团队资源库' })}
                </ResourcePageActionButton>
              )}
              <ResourcePageActionButton variant="outline" size="sm" onClick={() => openShareToProject(selectedResources)} disabled={shareToProject.isPending}>
                <FolderOpen size={14} />
                {t('pages.resources.shareToProject', { defaultValue: '分享给项目' })}
              </ResourcePageActionButton>
              <ResourcePageActionButton variant="outline" size="sm" onClick={() => setSelectedResourceIDs(new Set())}>
                {t('common.cancel')}
              </ResourcePageActionButton>
            </ResourcePageBulkActions>
          )}
          <ResourcePageMutedText>{t('pages.resources.filesCount', { count: total })}</ResourcePageMutedText>
        </ResourcePageFilterBar>

        <ResourcePageContent>
          {isLoading ? (
            <ResourcePageLoadingState>{t('common.loadingShort')}</ResourcePageLoadingState>
          ) : visible.length === 0 ? (
            <ResourcePageEmptyState icon={Upload}>
              {search ? t('pages.resources.noMatchedFiles') : t('pages.resources.noResourcesUpload')}
            </ResourcePageEmptyState>
          ) : viewMode === 'grid' ? (
            <ResourcePageAssetGrid>
              {visible.map(r => (
                <ResourceCard
                  key={r.ID}
                  resource={r}
                  currentUserID={currentUser?.ID}
                  currentOrgID={currentOrgID ?? undefined}
                  isSharedView={isSharedView}
                  onDelete={!isSharedView ? () => remove.mutate(r.ID) : undefined}
                  onMove={() => setMoveResource(r)}
                  onRename={() => setRenameResource(r)}
                  onClip={() => setClipResource(r)}
                  onDownload={() => downloadResource(resolveResourceUrl(r), r.name)}
                  selected={selectedResourceIDs.has(r.ID)}
                  onSelectChange={selected => setResourceSelected(r, selected)}
                  onContextMenu={openResourceContextMenu}
                  previewProjectId={currentProject?.ID}
                />
              ))}
            </ResourcePageAssetGrid>
          ) : (
            <ResourcePageAssetList>
              {visible.map(r => (
                <ResourcePageListRow
                  key={r.ID}
                  selected={selectedResourceIDs.has(r.ID)}
                  onContextMenu={event => openResourceContextMenu(event, r)}
                >
                  <ResourcePageListCheckbox
                    checked={selectedResourceIDs.has(r.ID)}
                    onCheckedChange={checked => setResourceSelected(r, checked)}
                    inputProps={{ 'aria-label': t('pages.resources.selectResource', { defaultValue: '选择资源' }) }}
                    onClick={event => event.stopPropagation()}
                  />
                  <ResourceListItem
                    resource={r}
                    thumbSize="md"
                    draggable
                    trailing={
                      <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <ResourcePageActionButton
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={e => e.stopPropagation()}
                        >
                          <MoreHorizontal size={14} />
                        </ResourcePageActionButton>
                      </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={4}>
                          <DropdownMenuItem onSelect={() => downloadResource(resolveResourceUrl(r), r.name)}>
                            <Download size={14} />{t('shared.mediaViewer.download')}
                          </DropdownMenuItem>
                          {!isSharedView && (
                            <DropdownMenuItem onSelect={() => setRenameResource(r)}>
                              <Pencil size={14} />{t('pages.resources.renameResource')}
                            </DropdownMenuItem>
                          )}
                          {!isSharedView && (
                            <DropdownMenuItem onSelect={() => setMoveResource(r)}>
                              <MoveRight size={14} />{t('pages.resources.moveToFolder')}
                            </DropdownMenuItem>
                          )}
                          {!isSharedView && r.type === 'video' && (
                            <DropdownMenuItem onSelect={() => setClipResource(r)}>
                              <Scissors size={14} />{t('pages.resources.clipVideo')}
                            </DropdownMenuItem>
                          )}
                          {!isSharedView && (
                            <>
                              <DropdownMenuSeparator />
                              <ResourceDangerMenuItem onSelect={() => remove.mutate(r.ID)}>
                                <Trash2 size={14} />{t('common.delete')}
                              </ResourceDangerMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    }
                    previewProjectId={currentProject?.ID}
                  />
                </ResourcePageListRow>
              ))}
            </ResourcePageAssetList>
          )}
        </ResourcePageContent>

        <ResourcePagePager
          status={t('pages.resources.pageStatus', { page, pageCount })}
          actions={(
            <>
            <ResourcePageActionButton variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft size={14} />
              {t('pages.resources.previousPage')}
            </ResourcePageActionButton>
            <ResourcePageActionButton variant="outline" size="sm" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
              {t('pages.resources.nextPage')}
              <ChevronRight size={14} />
            </ResourcePageActionButton>
            </>
          )}
        />
      </ResourcePageMain>

      {/* Dialogs */}
      {moveResource && (
        <MoveDialog
          resource={moveResource}
          folders={myFolders}
          onClose={() => setMoveResource(null)}
        />
      )}
      {renameResource && (
        <RenameResourceDialog
          resource={renameResource}
          onClose={() => setRenameResource(null)}
        />
      )}
      {clipResource && (
        <VideoClipDialog
          resource={clipResource}
          onClose={() => setClipResource(null)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['resources'] })
            setClipResource(null)
          }}
        />
      )}
      {shareProjectResources && (
        <ShareToProjectDialog
          resources={shareProjectResources}
          projects={projects}
          onClose={() => setShareProjectResources(null)}
          isSharing={shareToProject.isPending}
          onShare={(projectID) => shareToProject.mutate({ projectID, ids: resourceIDs(shareProjectResources) })}
        />
      )}
      {contextMenu && (
        <ResourceBulkContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          resources={contextMenu.resources}
          canShareToTeam={contextMenu.resources.some(canAdoptToTeam)}
          onClose={() => setContextMenu(null)}
          onShareToTeam={() => shareResourcesToTeam(contextMenu.resources)}
          onShareToProject={() => openShareToProject(contextMenu.resources)}
        />
      )}
    </ResourcePageLayout>
  )
}
