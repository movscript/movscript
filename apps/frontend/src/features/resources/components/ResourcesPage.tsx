import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import type { ExternalResourceItem, ExternalResourceSearchResult, ExternalResourceSource, Project, RawResource, ResourceBinding, ResourceFolder, PaginatedResponse } from '@/types'
import {
  Upload, Trash2, Search, Image as ImageIcon, Video, FileAudio, File as FileIcon,
  Folder, FolderOpen, Share2,
  ChevronRight, MoreHorizontal, MoveRight,
  Pencil, X as XIcon,
  LayoutGrid, List, ChevronLeft, Download, FileText,
  Scissors, Play, Pause, CheckSquare, KeyRound,
} from 'lucide-react'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { createObjectUrl, revokeObjectUrl } from '@/shared/ui/objectUrl'
import { loadResourceBlob } from '@/shared/ui/resourceBlob'
import { downloadResource } from '@/shared/ui/resourceDownload'
import { UrlImage, UrlMediaPreview, UrlVideo } from '@/shared/ui/UrlMedia'
import { ResourceCandidateAttachPanel, candidateResourceFromRawResource } from '@/shared/ui/ResourceCandidateAttachPanel'
import {
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ProjectSurfaceHeader,
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
  ResourceFolderTreeItem,
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
  ResourcePermissionActionGroup,
  ResourcePermissionEmpty,
  ResourcePermissionSection,
  ResourcePermissionShareRow,
  ResourcePermissionUserRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  ResourceSharedIndicator,
  ResourceStateMessage,
  ResourcePanelThumb,
  ResourcePanelThumbFallback,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { RESOURCE_UPLOAD_ACCEPT } from '@/shared/domain/mediaTypes'
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
type ExternalMediaFilter = 'image' | 'video'
type ExternalOrientationFilter = 'all' | 'landscape' | 'portrait' | 'square'
type ClipPhase = 'idle' | 'preparing' | 'clipping' | 'uploading'

interface ExternalResourceSearchSnapshot {
  sourceId?: number
  query: string
  submittedQuery: string
  mediaTypes: ExternalMediaFilter[]
  orientation: ExternalOrientationFilter
  page: number
  result: ExternalResourceSearchResult
}

const EXTERNAL_ORIENTATION_OPTIONS: { value: ExternalOrientationFilter; label: string }[] = [
  { value: 'all', label: '任意方向' },
  { value: 'landscape', label: '横向' },
  { value: 'portrait', label: '竖向' },
  { value: 'square', label: '方形' },
]

const EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY = 'movscript.externalResourceSearch.last'

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

const RESOURCE_PAGE_SIZE_OPTIONS = [12, 30, 60, 120]
const DEFAULT_RESOURCE_PAGE_SIZE = 30
const EXTERNAL_RESOURCE_PAGE_SIZE = 24

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
              <FolderItem
                key={f.ID}
                folder={f}
                active={targetFolder === f.ID}
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

function FolderItem({ folder, active, onClick }: {
  folder: ResourceFolder
  active: boolean
  onClick: () => void
}) {
  return (
    <ResourceFolderTreeItem
      active={active}
      icon={active ? <FolderOpen size={12} /> : <Folder size={12} />}
      label={folder.name}
      subtitle={folder.storage_backend || undefined}
      badge={folder.resource_count}
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

function resourceTypeLabel(resource: RawResource, t: ReturnType<typeof useTranslation>['t']) {
  return t(`pages.resources.types.${resource.type}`, { defaultValue: resource.type })
}

function isResourceInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-resource-interactive="true"]'))
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
            <ResourcePermissionSection title={t('pages.resources.permissionPreview', { defaultValue: '权限预览' })}>
              <ResourcePermissionShareRow
                title={t('pages.resources.projectReadPermission', { defaultValue: '项目成员可读' })}
                description={t('pages.resources.projectReadPermissionHint', { defaultValue: '资源仍保留在当前资源库，项目只获得引用权限。' })}
                control={<Switch checked disabled aria-label={t('pages.resources.projectReadPermission', { defaultValue: '项目成员可读' })} />}
              />
            </ResourcePermissionSection>
            <ResourceDialogSelect
              value={projectID}
              onChange={event => setProjectID(Number(event.target.value))}
            >
              {projects.map(project => (
                <option key={project.ID} value={project.ID}>{project.name}</option>
              ))}
            </ResourceDialogSelect>
            <ResourcePermissionSection title={t('pages.resources.shareTargets', { defaultValue: '分享目标' })} divided>
              {projects.length === 0 ? (
                <ResourcePermissionEmpty>{t('pages.resources.noProjectsToShare', { defaultValue: '当前团队没有可分享的项目。' })}</ResourcePermissionEmpty>
              ) : (
                projects.slice(0, 3).map(project => (
                  <ResourcePermissionUserRow
                    key={project.ID}
                    name={project.name}
                    meta={t('pages.resources.projectReadMeta', { defaultValue: '读取权限' })}
                    actions={(
                      <ResourcePermissionActionGroup>
                        <ResourcePageActionButton size="xs" variant={projectID === project.ID ? 'solid' : 'ghost'} onClick={() => setProjectID(project.ID)}>
                          {projectID === project.ID ? t('common.selected') : t('common.select')}
                        </ResourcePageActionButton>
                      </ResourcePermissionActionGroup>
                    )}
                  />
                ))
              )}
            </ResourcePermissionSection>
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

function ResourceItemActionMenu({
  x,
  y,
  isSharedView,
  canShareToTeam,
  resourceType,
  onClose,
  onDownload,
  onRename,
  onShareToTeam,
  onShareToProject,
  onMove,
  onClip,
  onDelete,
}: {
  x: number
  y: number
  isSharedView?: boolean
  canShareToTeam: boolean
  resourceType: RawResource['type']
  onClose: () => void
  onDownload: () => void
  onRename: () => void
  onShareToTeam?: () => void
  onShareToProject: () => void
  onMove: () => void
  onClip?: () => void
  onDelete?: () => void
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

  function run(action: () => void) {
    onClose()
    action()
  }

  return (
    <ResourceContextMenu
      x={x}
      y={y}
      label={t('pages.resources.actions')}
      className="resource-context-menu--resource-actions"
      onClick={event => event.stopPropagation()}
    >
      <ResourceContextMenuButton onClick={() => run(onDownload)}>
        <Download size={14} />
        {t('shared.mediaViewer.download')}
      </ResourceContextMenuButton>
      {!isSharedView && (
        <ResourceContextMenuButton onClick={() => run(onRename)}>
          <Pencil size={14} />
          {t('pages.resources.renameResource')}
        </ResourceContextMenuButton>
      )}
      {canShareToTeam && onShareToTeam && (
        <ResourceContextMenuButton onClick={() => run(onShareToTeam)}>
          <Share2 size={14} />
          {t('pages.resources.shareToTeam', { defaultValue: '加入团队资源库' })}
        </ResourceContextMenuButton>
      )}
      <ResourceContextMenuButton onClick={() => run(onShareToProject)}>
        <FolderOpen size={14} />
        {t('pages.resources.shareToProject', { defaultValue: '分享给项目' })}
      </ResourceContextMenuButton>
      {!isSharedView && (
        <ResourceContextMenuButton onClick={() => run(onMove)}>
          <MoveRight size={14} />
          {t('pages.resources.moveToFolder')}
        </ResourceContextMenuButton>
      )}
      {!isSharedView && resourceType === 'video' && onClip && (
        <ResourceContextMenuButton onClick={() => run(onClip)}>
          <Scissors size={14} />
          {t('pages.resources.clipVideo')}
        </ResourceContextMenuButton>
      )}
      {onDelete && (
        <ResourceContextMenuButton tone="danger" onClick={() => run(onDelete)}>
          <Trash2 size={14} />
          {t('common.delete')}
        </ResourceContextMenuButton>
      )}
    </ResourceContextMenu>
  )
}

function ResourceItemDropdownMenu({
  trigger,
  isSharedView,
  canShareToTeam,
  resourceType,
  onDownload,
  onRename,
  onShareToTeam,
  onShareToProject,
  onMove,
  onClip,
  onDelete,
}: {
  trigger: ReactNode
  isSharedView?: boolean
  canShareToTeam: boolean
  resourceType: RawResource['type']
  onDownload: () => void
  onRename: () => void
  onShareToTeam?: () => void
  onShareToProject: () => void
  onMove: () => void
  onClip?: () => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={event => event.stopPropagation()}>
        <DropdownMenuItem onSelect={onDownload}>
          <Download size={14} />
          {t('shared.mediaViewer.download')}
        </DropdownMenuItem>
        {!isSharedView && (
          <DropdownMenuItem onSelect={onRename}>
            <Pencil size={14} />
            {t('pages.resources.renameResource')}
          </DropdownMenuItem>
        )}
        {canShareToTeam && onShareToTeam && (
          <DropdownMenuItem onSelect={onShareToTeam}>
            <Share2 size={14} />
            {t('pages.resources.shareToTeam', { defaultValue: '加入团队资源库' })}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onShareToProject}>
          <FolderOpen size={14} />
          {t('pages.resources.shareToProject', { defaultValue: '分享给项目' })}
        </DropdownMenuItem>
        {!isSharedView && (
          <DropdownMenuItem onSelect={onMove}>
            <MoveRight size={14} />
            {t('pages.resources.moveToFolder')}
          </DropdownMenuItem>
        )}
        {!isSharedView && resourceType === 'video' && onClip && (
          <DropdownMenuItem onSelect={onClip}>
            <Scissors size={14} />
            {t('pages.resources.clipVideo')}
          </DropdownMenuItem>
        )}
        {onDelete && (
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
  onShareToTeam,
  onShareToProject,
  isSharedView,
  selectionMode,
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
  onShareToTeam?: () => void
  onShareToProject: () => void
  isSharedView?: boolean
  selectionMode?: boolean
  selected?: boolean
  onSelectChange?: (selected: boolean) => void
  onContextMenu?: (event: MouseEvent, resource: RawResource) => void
  previewProjectId?: number
}) {
  const { t } = useTranslation()
  const scopeLabel = resourceScopeLabel(resource, currentUserID, currentOrgID, t)

  return (
    <ResourceAssetCard
      selected={selected}
      draggable
      onContextMenu={(event) => onContextMenu?.(event, resource)}
      onDragStart={(event) => {
        if (isResourceInteractiveTarget(event.target)) {
          event.preventDefault()
          return
        }
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
            data-resource-interactive="true"
            checked={Boolean(selected)}
            onCheckedChange={onSelectChange}
            inputProps={{ 'aria-label': t('pages.resources.selectResource', { defaultValue: '选择资源' }) }}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
          />
        ) : undefined}
      actionControl={(
        <ResourceItemDropdownMenu
          trigger={(
            <ResourceAssetActionButton
              data-resource-interactive="true"
              draggable={false}
              title={t('pages.resources.actions')}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => event.stopPropagation()}
              onDragStart={event => event.preventDefault()}
            >
              <MoreHorizontal size={12} />
            </ResourceAssetActionButton>
          )}
          isSharedView={isSharedView}
          canShareToTeam={Boolean(onShareToTeam)}
          resourceType={resource.type}
          onDownload={onDownload}
          onRename={onRename}
          onShareToTeam={onShareToTeam}
          onShareToProject={onShareToProject}
          onMove={onMove}
          onClip={onClip}
          onDelete={onDelete}
        />
      )}
      sharedBadge={scopeLabel ? <ResourceSharedIndicator>{scopeLabel}</ResourceSharedIndicator> : undefined}
      typeIcon={<TypeIcon type={resource.type} />}
      name={<ResourceAssetName title={resource.name}>{resource.name}</ResourceAssetName>}
      size={formatBytes(resource.size)}
      owner={resourceScopeLabel(resource, currentUserID, currentOrgID, t)}
    />
  )
}

function ResourceListRowItem({
  resource,
  currentUserID,
  currentOrgID,
  isSharedView,
  selectionMode,
  selectControl,
  onDelete,
  onMove,
  onRename,
  onDownload,
  onClip,
  onShareToTeam,
  onShareToProject,
}: {
  resource: RawResource
  currentUserID?: number
  currentOrgID?: number
  isSharedView?: boolean
  selectionMode?: boolean
  selectControl?: ReactNode
  onDelete?: () => void
  onMove: () => void
  onRename: () => void
  onDownload: () => void
  onClip?: () => void
  onShareToTeam?: () => void
  onShareToProject: () => void
}) {
  const { t } = useTranslation()
  const scopeLabel = resourceScopeLabel(resource, currentUserID, currentOrgID, t)

  return (
    <>
      {selectionMode ? selectControl : null}
      <ResourcePanelThumb size="md">
        {resource.type === 'image' || resource.type === 'video' || resource.type === 'text' ? (
          <MediaViewer resource={resource} lightbox={false} />
        ) : (
          <ResourcePanelThumbFallback>
            <TypeIcon type={resource.type} />
          </ResourcePanelThumbFallback>
        )}
      </ResourcePanelThumb>
      <div className="resource-page__list-body">
        <span className="resource-page__list-name" title={resource.name}>{resource.name}</span>
        <span className="resource-page__list-meta">
          <span className="resource-page__list-meta-item">
            <TypeIcon type={resource.type} />
            {resourceTypeLabel(resource, t)}
          </span>
          <span>{formatBytes(resource.size)}</span>
          {scopeLabel ? <ResourceSharedIndicator muted>{scopeLabel}</ResourceSharedIndicator> : null}
        </span>
      </div>
      <ResourceItemDropdownMenu
        trigger={(
          <ResourcePageActionButton
            data-resource-interactive="true"
            draggable={false}
            type="button"
            variant="ghost"
            size="icon-xs"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onDragStart={event => event.preventDefault()}
            title={t('pages.resources.actions')}
          >
            <MoreHorizontal size={14} />
          </ResourcePageActionButton>
        )}
        isSharedView={isSharedView}
        canShareToTeam={Boolean(onShareToTeam)}
        resourceType={resource.type}
        onDownload={onDownload}
        onRename={onRename}
        onShareToTeam={onShareToTeam}
        onShareToProject={onShareToProject}
        onMove={onMove}
        onClip={onClip}
        onDelete={onDelete}
      />

    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export interface ResourceLibraryViewProps {
  variant?: 'page' | 'pane'
}

export function ExternalResourceSearchView() {
  const qc = useQueryClient()
  const [searchSnapshot] = useState(() => loadExternalResourceSearchSnapshot())
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(searchSnapshot?.sourceId ?? null)
  const [query, setQuery] = useState(searchSnapshot?.query ?? '')
  const [submittedQuery, setSubmittedQuery] = useState(searchSnapshot?.submittedQuery ?? '')
  const [selectedMediaTypes, setSelectedMediaTypes] = useState<Set<ExternalMediaFilter>>(() => new Set(searchSnapshot?.mediaTypes?.length ? searchSnapshot.mediaTypes : ['image', 'video']))
  const [orientation, setOrientation] = useState<ExternalOrientationFilter>(searchSnapshot?.orientation ?? 'all')
  const [page, setPage] = useState<number>(searchSnapshot?.page ?? 1)
  const [selectedExternalKeys, setSelectedExternalKeys] = useState<Set<string>>(() => new Set())
  const [previewItem, setPreviewItem] = useState<ExternalResourceItem | null>(null)

  const { data: sources = [], isLoading: sourcesLoading } = useQuery<ExternalResourceSource[]>({
    queryKey: ['external-resource-sources'],
    queryFn: () => api.get('/external-resource-sources').then(r => r.data),
  })
  const enabledSources = useMemo(() => sources.filter(source => source.is_enabled), [sources])
  const providerOptions = useMemo(() => {
    const seen = new Set<string>()
    return enabledSources.filter((source) => {
      if (seen.has(source.provider_key)) return false
      seen.add(source.provider_key)
      return true
    })
  }, [enabledSources])
  const selectedSource = enabledSources.find(source => source.ID === selectedSourceId) ?? enabledSources[0]
  const selectedProviderKey = selectedSource?.provider_key ?? providerOptions[0]?.provider_key ?? ''
  const providerSources = useMemo(
    () => enabledSources.filter(source => source.provider_key === selectedProviderKey),
    [enabledSources, selectedProviderKey],
  )

  useEffect(() => {
    if (enabledSources[0] && (!selectedSourceId || !enabledSources.some(source => source.ID === selectedSourceId))) {
      setSelectedSourceId(enabledSources[0].ID)
    }
  }, [enabledSources, selectedSourceId])

  const mediaTypes = Array.from(selectedMediaTypes).sort() as ExternalMediaFilter[]
  const mediaTypeKey = mediaTypes.join('|')
  const searchQuery = useQuery<ExternalResourceSearchResult>({
    queryKey: ['external-resources', selectedSource?.ID, submittedQuery, mediaTypeKey, orientation, page],
    queryFn: async () => {
      const pageSize = Math.max(1, Math.floor(EXTERNAL_RESOURCE_PAGE_SIZE / Math.max(1, mediaTypes.length)))
      const searchMediaType = (mediaType: ExternalMediaFilter) => {
        const params = new URLSearchParams()
        params.set('source_id', String(selectedSource!.ID))
        params.set('q', submittedQuery)
        params.set('media_type', mediaType)
        params.set('page', String(page))
        params.set('page_size', String(pageSize))
        if (orientation !== 'all') params.set('orientation', orientation)
        return api.get(`/external-resources/search?${params}`).then(r => r.data as ExternalResourceSearchResult)
      }
      if (mediaTypes.length === 1) return searchMediaType(mediaTypes[0])
      const results = await Promise.all(mediaTypes.map(searchMediaType))
      return {
        total: results.reduce((sum, result) => sum + result.total, 0),
        items: results.flatMap(result => result.items),
        page,
        page_size: EXTERNAL_RESOURCE_PAGE_SIZE,
        provider: results[0]?.provider ?? selectedSource?.provider_key ?? '',
        source_name: results[0]?.source_name,
      }
    },
    enabled: Boolean(selectedSource?.ID && submittedQuery.trim() && mediaTypes.length > 0),
    initialData: () => externalResourceSearchInitialData(searchSnapshot, {
      sourceId: selectedSource?.ID,
      submittedQuery,
      mediaTypeKey,
      orientation,
      page,
    }),
  })

  useEffect(() => {
    if (!searchQuery.data || !selectedSource?.ID || !submittedQuery.trim()) return
    saveExternalResourceSearchSnapshot({
      sourceId: selectedSource.ID,
      query: submittedQuery,
      submittedQuery,
      mediaTypes,
      orientation,
      page,
      result: searchQuery.data,
    })
  }, [mediaTypeKey, orientation, page, searchQuery.data, selectedSource?.ID, submittedQuery])

  function submitSearch() {
    const nextQuery = query.trim()
    if (!nextQuery) return
    setSubmittedQuery(nextQuery)
    setPage(1)
    setSelectedExternalKeys(new Set())
  }

  const items = searchQuery.data?.items ?? []
  const total = searchQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / EXTERNAL_RESOURCE_PAGE_SIZE))
  const selectedItems = items.filter(item => selectedExternalKeys.has(externalResourceKey(item)))
  const allVisibleSelected = items.length > 0 && selectedItems.length === items.length
  const importExternalResources = useMutation({
    mutationFn: async (resources: ExternalResourceItem[]) => {
      const created: RawResource[] = []
      for (const item of resources) {
        created.push(await uploadExternalResourceItem(item))
      }
      return created
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      setSelectedExternalKeys(new Set())
      toast.success(`已加入素材库`, `${created.length} 个外部资源已保存`)
    },
    onError: (error) => {
      toast.error('加入素材库失败', error instanceof Error ? error.message : undefined)
    },
  })

  function toggleMediaType(mediaType: ExternalMediaFilter) {
    setSelectedMediaTypes(current => {
      const next = new Set(current)
      if (next.has(mediaType)) {
        if (next.size === 1) return current
        next.delete(mediaType)
      } else {
        next.add(mediaType)
      }
      return next
    })
    setPage(1)
    setSelectedExternalKeys(new Set())
  }

  function updateOrientation(nextOrientation: ExternalOrientationFilter) {
    setOrientation(nextOrientation)
    setPage(1)
    setSelectedExternalKeys(new Set())
  }

  function updateSelectedSource(nextSourceId: number) {
    setSelectedSourceId(nextSourceId)
    setPage(1)
    setSelectedExternalKeys(new Set())
  }

  function updateSelectedProvider(nextProviderKey: string) {
    const providerSource = enabledSources.find(source => source.provider_key === nextProviderKey)
    if (!providerSource) return
    setSelectedSourceId(providerSource.ID)
    setPage(1)
    setSelectedExternalKeys(new Set())
  }

  function toggleExternalSelection(item: ExternalResourceItem, selected: boolean) {
    const key = externalResourceKey(item)
    setSelectedExternalKeys(current => {
      const next = new Set(current)
      if (selected) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function toggleVisibleSelection() {
    setSelectedExternalKeys(current => {
      const next = new Set(current)
      if (allVisibleSelected) {
        items.forEach(item => next.delete(externalResourceKey(item)))
      } else {
        items.forEach(item => next.add(externalResourceKey(item)))
      }
      return next
    })
  }

  return (
    <>
      <ResourcePageFilterBar>
        <ResourcePageSearchField
          icon={Search}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') submitSearch()
          }}
          placeholder={selectedSource ? `搜索 ${externalResourceProviderName(selectedSource.provider_key)}` : '搜索外部资源'}
        />
        <ResourcePageActionButton size="sm" onClick={submitSearch} disabled={!selectedSource || !query.trim() || searchQuery.isFetching}>
          <Search size={14} />
          搜索
        </ResourcePageActionButton>
        {providerOptions.length > 1 && (
          <Select
            value={selectedProviderKey}
            onValueChange={updateSelectedProvider}
          >
            <SelectTrigger
              size="sm"
              className="resource-page__external-provider-trigger"
              aria-label="选择外部资源 provider"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerOptions.map(source => (
                <SelectItem key={source.provider_key} value={source.provider_key}>
                  {externalResourceProviderName(source.provider_key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {providerSources.length > 1 && (
          <Select
            value={selectedSource ? String(selectedSource.ID) : ''}
            onValueChange={value => updateSelectedSource(Number(value))}
          >
            <SelectTrigger
              size="sm"
              className="resource-page__external-source-trigger"
              aria-label="选择外部资源来源"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerSources.map(source => (
                <SelectItem key={source.ID} value={String(source.ID)}>
                  {source.name || externalResourceProviderName(source.provider_key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <ResourcePageActionGroup>
          <ResourcePageActionButton size="xs" variant={selectedMediaTypes.has('image') ? 'solid' : 'ghost'} onClick={() => toggleMediaType('image')}>
            图片
          </ResourcePageActionButton>
          <ResourcePageActionButton size="xs" variant={selectedMediaTypes.has('video') ? 'solid' : 'ghost'} onClick={() => toggleMediaType('video')}>
            视频
          </ResourcePageActionButton>
        </ResourcePageActionGroup>
        <ResourcePageActionGroup>
          {EXTERNAL_ORIENTATION_OPTIONS.map(option => (
            <ResourcePageActionButton
              key={option.value}
              size="xs"
              variant={orientation === option.value ? 'solid' : 'ghost'}
              onClick={() => updateOrientation(option.value)}
            >
              {option.label}
            </ResourcePageActionButton>
          ))}
        </ResourcePageActionGroup>
        <ResourcePageFlexibleSpace />
        {selectedItems.length > 0 && (
          <ResourcePageBulkActions>
            <ResourcePageMutedText>已选择 {selectedItems.length} 个</ResourcePageMutedText>
            <ResourcePageActionButton
              variant="outline"
              size="sm"
              onClick={() => importExternalResources.mutate(selectedItems)}
              disabled={importExternalResources.isPending}
            >
              <Download size={14} />
              加入素材库
            </ResourcePageActionButton>
            <ResourcePageActionButton variant="outline" size="sm" onClick={() => setSelectedExternalKeys(new Set())}>
              取消
            </ResourcePageActionButton>
          </ResourcePageBulkActions>
        )}
        {items.length > 0 && (
          <ResourcePageActionButton variant="outline" size="sm" onClick={toggleVisibleSelection}>
            {allVisibleSelected ? '取消全选' : '全选本页'}
          </ResourcePageActionButton>
        )}
      </ResourcePageFilterBar>

      <ResourcePageContent>
        {sourcesLoading ? (
          <ResourcePageLoadingState>加载中</ResourcePageLoadingState>
        ) : !selectedSource ? (
          <ResourcePageEmptyState icon={KeyRound}>配置外部资源 API Key 后开始搜索</ResourcePageEmptyState>
        ) : !submittedQuery ? (
          <ResourcePageEmptyState icon={Search}>输入关键词搜索外部资源</ResourcePageEmptyState>
        ) : searchQuery.isLoading && items.length === 0 ? (
          <ResourcePageLoadingState>搜索中</ResourcePageLoadingState>
        ) : items.length === 0 ? (
          <ResourcePageEmptyState icon={Search}>没有匹配的外部资源</ResourcePageEmptyState>
        ) : (
          <ResourcePageAssetGrid>
            {items.map(item => (
              <ExternalResourceCard
                key={externalResourceKey(item)}
                item={item}
                selected={selectedExternalKeys.has(externalResourceKey(item))}
                onSelectChange={selected => toggleExternalSelection(item, selected)}
                onPreview={() => setPreviewItem(item)}
              />
            ))}
          </ResourcePageAssetGrid>
        )}
      </ResourcePageContent>

      <ResourcePagePager
        status={`第 ${page} / ${pageCount} 页`}
        actions={(
          <>
            <ResourcePageActionButton
              variant="outline"
              size="sm"
              onClick={() => { setPage(p => Math.max(1, p - 1)); setSelectedExternalKeys(new Set()) }}
              disabled={page <= 1 || searchQuery.isFetching}
            >
              <ChevronLeft size={14} />
              上一页
            </ResourcePageActionButton>
            <ResourcePageActionButton
              variant="outline"
              size="sm"
              onClick={() => { setPage(p => Math.min(pageCount, p + 1)); setSelectedExternalKeys(new Set()) }}
              disabled={page >= pageCount || searchQuery.isFetching}
            >
              下一页
              <ChevronRight size={14} />
            </ResourcePageActionButton>
          </>
        )}
      />
      {previewItem ? (
        <ExternalResourcePreviewDialog
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onAdd={() => importExternalResources.mutate([previewItem], { onSuccess: () => setPreviewItem(null) })}
          adding={importExternalResources.isPending}
        />
      ) : null}
    </>
  )
}

export function ExternalResourceSearchPage({
  variant = 'page',
}: ResourceLibraryViewProps) {
  return (
    <ResourcePageLayout data-resource-variant={variant}>
      <ResourcePageMain>
        <ExternalResourceSearchView />
      </ResourcePageMain>
    </ResourcePageLayout>
  )
}

function ExternalResourceCard({
  item,
  selected,
  onSelectChange,
  onPreview,
}: {
  item: ExternalResourceItem
  selected: boolean
  onSelectChange: (selected: boolean) => void
  onPreview: () => void
}) {
  const name = item.title || `${item.provider_key} #${item.external_id}`
  const meta = externalResourceMeta(item)

  return (
    <ResourceAssetCard
      selected={selected}
      title="点击预览"
      style={{ cursor: 'pointer' }}
      onClick={onPreview}
      preview={(
        <ResourceMediaFillFrame fit="cover">
          {item.thumbnail_url ? (
            <UrlImage src={item.thumbnail_url} alt={name} loading="lazy" />
          ) : (
            <ResourceAssetPreviewFallback>
              <TypeIcon type={item.media_type} />
            </ResourceAssetPreviewFallback>
          )}
        </ResourceMediaFillFrame>
      )}
      selectControl={(
        <ResourceAssetSelectCheckbox
          data-resource-interactive="true"
          checked={selected}
          onCheckedChange={onSelectChange}
          inputProps={{ 'aria-label': '选择外部资源' }}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
        />
      )}
      typeIcon={<TypeIcon type={item.media_type} />}
      name={<ResourceAssetName title={name}>{name}</ResourceAssetName>}
      size={meta}
      owner={item.author_name ? (
        <span title={item.author_name} style={{ fontSize: 11, lineHeight: '14px' }}>
          {item.author_name}
        </span>
      ) : item.license_label}
    />
  )
}

function ExternalResourcePreviewDialog({
  item,
  onClose,
  onAdd,
  adding,
}: {
  item: ExternalResourceItem
  onClose: () => void
  onAdd: () => void
  adding?: boolean
}) {
  const name = item.title || `${item.provider_key} #${item.external_id}`
  const previewUrl = item.preview_url || item.thumbnail_url
  const aspectRatio = externalResourceAspectRatio(item)
  const dialogStyle = {
    '--external-resource-aspect-ratio': aspectRatio,
    '--external-resource-dialog-preferred-width': `${roundCssNumber(aspectRatio * 68)}vh`,
    '--external-resource-dialog-max-by-media': `${Math.max(320, Math.round(aspectRatio * 640))}px`,
  } as CSSProperties

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <ResourceDialogContent
        size="md"
        hideClose
        className="resource-page__external-preview-dialog"
        style={dialogStyle}
      >
        <ResourceDialogHeader
          icon={item.media_type === 'video' ? Video : ImageIcon}
          title={name}
          close={<ResourceDialogCloseButton aria-label="关闭"><XIcon size={16} /></ResourceDialogCloseButton>}
        />
        <ResourceDialogStack className="resource-page__external-preview-stack">
          <div className="resource-page__external-preview-stage" data-media-type={item.media_type}>
            {previewUrl ? (
              <UrlMediaPreview
                src={previewUrl}
                type={item.media_type}
                poster={item.thumbnail_url}
                alt={name}
              />
            ) : (
              <ResourceAssetPreviewFallback>
                <TypeIcon type={item.media_type} />
              </ResourceAssetPreviewFallback>
            )}
          </div>
          <ResourceDialogText tone="foreground">
            {[externalResourceMeta(item), item.author_name, item.license_label].filter(Boolean).join(' · ')}
          </ResourceDialogText>
          {item.description ? <ResourceDialogText>{item.description}</ResourceDialogText> : null}
        </ResourceDialogStack>
        <ResourceDialogFooter>
          <ResourcePageActionButton variant="outline" size="sm" onClick={onClose}>
            关闭
          </ResourcePageActionButton>
          <ResourcePageActionButton size="sm" onClick={onAdd} disabled={adding}>
            <Download size={14} />
            加入素材库
          </ResourcePageActionButton>
        </ResourceDialogFooter>
      </ResourceDialogContent>
    </Dialog>
  )
}

function externalResourceKey(item: ExternalResourceItem) {
  return `${item.provider_key}-${item.media_type}-${item.external_id}`
}

function externalResourceProviderName(providerKey: string) {
  switch (providerKey) {
    case 'pixabay':
      return 'Pixabay'
    case 'pexels':
      return 'Pexels'
    default:
      return providerKey
  }
}

function loadExternalResourceSearchSnapshot(): ExternalResourceSearchSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ExternalResourceSearchSnapshot>
    const submittedQuery = typeof parsed.submittedQuery === 'string' ? parsed.submittedQuery.trim() : ''
    if (!submittedQuery || !parsed.result || !Array.isArray(parsed.result.items)) return null
    return {
      sourceId: typeof parsed.sourceId === 'number' ? parsed.sourceId : undefined,
      query: typeof parsed.query === 'string' && parsed.query.trim() ? parsed.query.trim() : submittedQuery,
      submittedQuery,
      mediaTypes: normalizeExternalMediaTypes(parsed.mediaTypes),
      orientation: normalizeExternalOrientation(parsed.orientation),
      page: normalizeExternalSnapshotPage(parsed.page),
      result: parsed.result as ExternalResourceSearchResult,
    }
  } catch {
    return null
  }
}

function saveExternalResourceSearchSnapshot(snapshot: ExternalResourceSearchSnapshot) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(EXTERNAL_RESOURCE_SEARCH_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Best-effort UI state persistence; search remains fully usable without storage.
  }
}

function externalResourceSearchInitialData(
  snapshot: ExternalResourceSearchSnapshot | null,
  current: {
    sourceId?: number
    submittedQuery: string
    mediaTypeKey: string
    orientation: ExternalOrientationFilter
    page: number
  },
) {
  if (!snapshot || !current.sourceId) return undefined
  if (snapshot.sourceId && snapshot.sourceId !== current.sourceId) return undefined
  if (snapshot.submittedQuery !== current.submittedQuery.trim()) return undefined
  if (snapshot.mediaTypes.join('|') !== current.mediaTypeKey) return undefined
  if (snapshot.orientation !== current.orientation) return undefined
  if (snapshot.page !== current.page) return undefined
  return snapshot.result
}

function normalizeExternalMediaTypes(value: unknown): ExternalMediaFilter[] {
  const input = Array.isArray(value) ? value : []
  const output = input.filter((item): item is ExternalMediaFilter => item === 'image' || item === 'video')
  return output.length > 0 ? (Array.from(new Set(output)).sort() as ExternalMediaFilter[]) : ['image', 'video']
}

function normalizeExternalOrientation(value: unknown): ExternalOrientationFilter {
  return value === 'landscape' || value === 'portrait' || value === 'square' ? value : 'all'
}

function normalizeExternalSnapshotPage(value: unknown) {
  const page = Number(value)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

async function uploadExternalResourceItem(item: ExternalResourceItem): Promise<RawResource> {
  const url = item.preview_url || item.thumbnail_url
  if (!url) throw new Error('外部资源没有可导入的文件地址')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`下载外部资源失败：HTTP ${response.status}`)
  const blob = await response.blob()
  const file = new window.File(
    [blob],
    externalResourceFileName(item, blob.type),
    { type: blob.type || externalResourceMimeType(item) },
  )
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/resources/upload', fd).then(r => r.data as RawResource)
}

function externalResourceFileName(item: ExternalResourceItem, mimeType: string) {
  const title = item.title || `${item.provider_key}-${item.media_type}-${item.external_id}`
  const base = title
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `${item.provider_key}-${item.external_id}`
  return `${base}-${item.external_id}${externalResourceExtension(item, mimeType)}`
}

function externalResourceExtension(item: ExternalResourceItem, mimeType: string) {
  const urlPath = item.preview_url || item.thumbnail_url || ''
  const urlExtension = urlPath.split('?')[0]?.match(/\.(jpe?g|png|webp|gif|mp4|mov|webm)$/i)?.[0]
  if (urlExtension) return urlExtension.toLowerCase()
  if (mimeType.includes('png')) return '.png'
  if (mimeType.includes('webp')) return '.webp'
  if (mimeType.includes('gif')) return '.gif'
  if (mimeType.includes('video/webm')) return '.webm'
  if (mimeType.includes('video/quicktime')) return '.mov'
  if (mimeType.includes('video')) return '.mp4'
  return item.media_type === 'video' ? '.mp4' : '.jpg'
}

function externalResourceMimeType(item: ExternalResourceItem) {
  return item.media_type === 'video' ? 'video/mp4' : 'image/jpeg'
}

function externalResourceMeta(item: ExternalResourceItem) {
  const dimensions = item.width && item.height ? `${item.width}x${item.height}` : ''
  const duration = item.duration_seconds ? `${item.duration_seconds}s` : ''
  return [dimensions, duration].filter(Boolean).join(' · ') || item.media_type
}

function externalResourceAspectRatio(item: ExternalResourceItem) {
  const width = Number(item.width)
  const height = Number(item.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return item.media_type === 'video' ? 16 / 9 : 1
  }
  return clamp(width / height, 0.25, 3.2)
}

function roundCssNumber(value: number) {
  return Math.round(value * 1000) / 1000
}

export function ResourceLibraryView({
  variant = 'page',
}: ResourceLibraryViewProps) {
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
  const [previewResource, setPreviewResource] = useState<RawResource | null>(null)
  const [selectedResourceIDs, setSelectedResourceIDs] = useState<Set<number>>(() => new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; resources: RawResource[] } | null>(null)
  const [shareProjectResources, setShareProjectResources] = useState<RawResource[] | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectionMode, setSelectionMode] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_RESOURCE_PAGE_SIZE)

  useEffect(() => {
    if ((scope === 'team' && !currentOrgID) || (scope === 'project' && !currentProject?.ID)) {
      setScope('all')
      setPage(1)
      setSelectedResourceIDs(new Set())
      setSelectionMode(false)
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
    queryKey: ['resources', scope, filter, search, page, pageSize],
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
  const projectBindingByResourceID = useMemo(() => {
    const map = new Map<number, number>()
    projectBindings.forEach(binding => {
      if (binding.resource_id && binding.ID) map.set(binding.resource_id, binding.ID)
    })
    return map
  }, [projectBindings])
  const resources = isProjectScope ? paginateResources(projectResources, page, pageSize) : resourcesData?.items ?? []
  const total = isProjectScope ? projectResources.length : resourcesData?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const isLoading = isProjectScope ? isProjectResourcesLoading : isResourceLoading

  useEffect(() => {
    setPage(current => Math.min(current, pageCount))
  }, [pageCount])

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

  const revoke = useMutation({
    mutationFn: (bindingID: number) => api.delete(`/resource-bindings/${bindingID}`),
    onSuccess: () => {
      setContextMenu(null)
      setSelectedResourceIDs(new Set())
      qc.invalidateQueries({ queryKey: ['resource-bindings'] })
      toast.success(t('pages.resources.revokedFromProjectSuccess', { defaultValue: '已从项目移除引用' }))
    },
  })

  const isSharedView = isProjectScope

  const visible = resources
  const selectedResources = visible.filter(resource => selectedResourceIDs.has(resource.ID))
  const selectedIDs = resourceIDs(selectedResources)
  const selectedProjectBindingIDs = selectedIDs
    .map(id => projectBindingByResourceID.get(id))
    .filter((id): id is number => Boolean(id))
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

  function toggleSelectionMode() {
    if (selectionMode) setSelectedResourceIDs(new Set())
    setSelectionMode(current => !current)
  }

  function setTab(tab: 'mine' | 'team' | 'project') {
    setScope(tab === 'mine' ? 'personal' : tab)
    setPage(1)
    setSelectedResourceIDs(new Set())
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

  function handleResourceRowDragStart(event: DragEvent<HTMLDivElement>, resource: RawResource) {
    if (isResourceInteractiveTarget(event.target)) {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData('application/resource-id', String(resource.ID))
    event.dataTransfer.setData('application/canvas-resource', JSON.stringify(resource))
    event.dataTransfer.effectAllowed = 'copy'
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
    <ResourcePageLayout data-resource-variant={variant}>
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

        <ProjectSurfaceHeader
          icon={FolderOpen}
          title={t('pages.resources.title', { defaultValue: '资源库' })}
          description={t('pages.resources.description', { defaultValue: '统一管理个人、团队和项目引用资源。' })}
          meta={<ResourcePageMutedText>{t('pages.resources.filesCount', { count: total })}</ResourcePageMutedText>}
          actions={(
            <>
              <ResourcePageActionGroup>
                <ResourcePageActionButton
                  size="xs"
                  variant={scope === 'personal' ? 'solid' : 'ghost'}
                  onClick={() => setTab('mine')}
                >
                  {t('pages.resources.scopes.personal')}
                </ResourcePageActionButton>
                <ResourcePageActionButton
                  size="xs"
                  variant={scope === 'team' ? 'solid' : 'ghost'}
                  onClick={() => setTab('team')}
                  disabled={!currentOrgID}
                >
                  {t('pages.resources.scopes.team')}
                </ResourcePageActionButton>
                <ResourcePageActionButton
                  size="xs"
                  variant={scope === 'project' ? 'solid' : 'ghost'}
                  onClick={() => setTab('project')}
                  disabled={!currentProject?.ID}
                >
                  {t('pages.resources.scopes.project')}
                </ResourcePageActionButton>
              </ResourcePageActionGroup>
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
            </>
          )}
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
          <ResourcePageActionButton
            size="sm"
            variant={selectionMode ? 'solid' : 'outline'}
            onClick={toggleSelectionMode}
          >
            {selectionMode ? <XIcon size={14} /> : <CheckSquare size={14} />}
            {selectionMode ? t('common.cancel') : t('pages.resources.selectMode', { defaultValue: '选择' })}
          </ResourcePageActionButton>
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
              {isProjectScope && selectedProjectBindingIDs.length > 0 && (
                <ResourcePageActionButton variant="ghost" tone="danger" size="sm" onClick={() => selectedProjectBindingIDs.forEach(id => revoke.mutate(id))} disabled={revoke.isPending}>
                  <Trash2 size={14} />
                  {t('pages.resources.revokeFromProject', { defaultValue: '移出项目' })}
                </ResourcePageActionButton>
              )}
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
                  selectionMode={selectionMode}
                  onDelete={isProjectScope
                    ? (projectBindingByResourceID.get(r.ID) ? () => revoke.mutate(projectBindingByResourceID.get(r.ID)!) : undefined)
                    : () => remove.mutate(r.ID)}
                  onMove={() => setMoveResource(r)}
                  onRename={() => setRenameResource(r)}
                  onClip={() => setClipResource(r)}
                  onShareToTeam={canAdoptToTeam(r) ? () => shareResourcesToTeam([r]) : undefined}
                  onShareToProject={() => openShareToProject([r])}
                  onDownload={() => downloadResource(r)}
                  selected={selectionMode && selectedResourceIDs.has(r.ID)}
                  onSelectChange={selectionMode ? selected => setResourceSelected(r, selected) : undefined}
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
                  draggable={!selectedResourceIDs.has(r.ID)}
                  onDragStart={!selectedResourceIDs.has(r.ID) ? event => handleResourceRowDragStart(event, r) : undefined}
                  onClick={() => setPreviewResource(r)}
                  onContextMenu={event => openResourceContextMenu(event, r)}
                  title={selectedResourceIDs.has(r.ID) ? t('common.selected') : t('shared.resourcePanel.previewDragTitle')}
                >
                  <ResourceListRowItem
                    resource={r}
                    currentUserID={currentUser?.ID}
                    currentOrgID={currentOrgID ?? undefined}
                    isSharedView={isSharedView}
                    selectionMode={selectionMode}
                    selectControl={selectedResourceIDs.has(r.ID) || selectionMode ? (
                      <ResourcePageListCheckbox
                        data-resource-interactive="true"
                        checked={selectedResourceIDs.has(r.ID)}
                        onCheckedChange={checked => setResourceSelected(r, checked)}
                        inputProps={{ 'aria-label': t('pages.resources.selectResource', { defaultValue: '选择资源' }) }}
                        onPointerDown={event => event.stopPropagation()}
                        onClick={event => event.stopPropagation()}
                      />
                    ) : undefined}
                    onDelete={isProjectScope
                      ? (projectBindingByResourceID.get(r.ID) ? () => revoke.mutate(projectBindingByResourceID.get(r.ID)!) : undefined)
                      : () => remove.mutate(r.ID)}
                    onMove={() => setMoveResource(r)}
                    onRename={() => setRenameResource(r)}
                    onClip={() => setClipResource(r)}
                    onShareToTeam={canAdoptToTeam(r) ? () => shareResourcesToTeam([r]) : undefined}
                    onShareToProject={() => openShareToProject([r])}
                    onDownload={() => downloadResource(r)}
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
            <label className="resource-page__page-size-field">
              <span>{t('pages.resources.pageSize', { defaultValue: '每页' })}</span>
              <ResourceDialogSelect
                className="resource-page__page-size-select"
                value={pageSize}
                onChange={event => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}
              >
                {RESOURCE_PAGE_SIZE_OPTIONS.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </ResourceDialogSelect>
            </label>
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
      {previewResource && (
        <MediaViewer
          resource={previewResource}
          open
          onOpenChange={open => !open && setPreviewResource(null)}
          fit="contain"
          sidePanel={(
            <ResourceCandidateAttachPanel
              resources={[candidateResourceFromRawResource(previewResource)]}
              projectId={currentProject?.ID}
              compact
            />
          )}
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

export default function ResourcesPage() {
  return <ResourceLibraryView />
}
