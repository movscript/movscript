import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { RawResource, ResourceFolder, ResourceFolderPermission, User, PaginatedResponse } from '@/types'
import {
  Upload, Trash2, Search, Image as ImageIcon, Video, FileAudio, File as FileIcon,
  FolderPlus, Folder, FolderOpen, Share2,
  ChevronRight, MoreHorizontal, Globe, MoveRight,
  ShieldCheck, Pencil, Eye, PenLine, X as XIcon,
  LayoutGrid, List, ChevronLeft, Download, FileText,
  Scissors, Play, Pause,
} from 'lucide-react'
import { MediaViewer, downloadResource, resolveResourceUrl } from '@/components/shared/MediaViewer'
import { ResourceListItem } from '@/components/shared/ResourcePanel'
import { ProjectSurfaceHeader } from '@/components/app/AppPage'
import { Button } from '@movscript/ui'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'
import { RESOURCE_UPLOAD_ACCEPT } from '@/lib/mediaTypes'
import { toast } from '@/store/toastStore'
import {
  clipOutputNameError,
  clipRangeError,
  clipSourceError,
  defaultClipOutputName,
  MAX_CLIP_DURATION_MS,
  MAX_CLIP_SOURCE_BYTES,
  parseClipTimecode,
} from '@/lib/videoClipUi'

type TypeFilter = 'all' | 'image' | 'video' | 'audio' | 'text'
type Tab = 'mine' | 'shared'
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

// ─── Folder Dialog ────────────────────────────────────────────────────────────
function FolderDialog({
  open,
  onClose,
  editFolder,
}: {
  open: boolean
  onClose: () => void
  editFolder?: ResourceFolder | null
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState(editFolder?.name ?? '')
  const [isShared, setIsShared] = useState(editFolder?.is_shared ?? false)

  const save = useMutation({
    mutationFn: () => {
      const body = { name, is_shared: isShared }
      return editFolder
        ? api.put(`/resource-folders/${editFolder.ID}`, body)
        : api.post('/resource-folders', body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resource-folders'] })
      onClose()
    },
  })

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-xl p-6 w-80 z-50">
          <Dialog.Title className="type-body font-semibold mb-4">
            {editFolder ? t('pages.resources.editFolder') : t('pages.resources.newFolder')}
          </Dialog.Title>
          <div className="space-y-3">
            <div>
              <label className="type-label text-muted-foreground mb-1 block">{t('forms.name')}</label>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-1.5 type-body border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={t('pages.resources.folderNamePlaceholder')}
              />
            </div>
            <label className="flex items-center gap-2 type-body cursor-pointer">
              <input
                type="checkbox"
                checked={isShared}
                onChange={e => setIsShared(e.target.checked)}
                className="rounded"
              />
              <Globe size={14} className="text-muted-foreground" />
              {t('pages.resources.enableSharingVisible')}
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
              {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Permissions Dialog ───────────────────────────────────────────────────────
function PermissionsDialog({ folder, onClose }: { folder: ResourceFolder; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchQ, setSearchQ] = useState('')
  const [localIsShared, setLocalIsShared] = useState(folder.is_shared)

  const { data: perms = [] } = useQuery<ResourceFolderPermission[]>({
    queryKey: ['folder-permissions', folder.ID],
    queryFn: () => api.get(`/resource-folders/${folder.ID}/permissions`).then(r => r.data),
  })

  const { data: searchResults = [] } = useQuery<User[]>({
    queryKey: ['users-search', searchQ],
    queryFn: () => api.get(`/users?q=${encodeURIComponent(searchQ)}`).then(r => r.data),
    enabled: searchQ.trim().length > 0,
  })

  const existingUserIds = new Set(perms.map(p => p.user_id))

  const toggleShared = useMutation({
    mutationFn: (v: boolean) => api.put(`/resource-folders/${folder.ID}`, { is_shared: v }),
    onSuccess: (_, v) => {
      setLocalIsShared(v)
      qc.invalidateQueries({ queryKey: ['resource-folders'] })
    },
  })

  const grant = useMutation({
    mutationFn: ({ userId, permission }: { userId: number; permission: string }) =>
      api.post(`/resource-folders/${folder.ID}/permissions`, { user_id: userId, permission }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folder-permissions', folder.ID] }),
  })

  const revoke = useMutation({
    mutationFn: (userId: number) =>
      api.delete(`/resource-folders/${folder.ID}/permissions/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folder-permissions', folder.ID] }),
  })

  const PERM_LABELS = { read: t('pages.resources.permissions.read'), write: t('pages.resources.permissions.write') }
  const PERM_ICONS = { read: <Eye size={12} />, write: <PenLine size={12} /> }

  return (
    <Dialog.Root open onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-xl p-6 w-96 z-50 max-h-[80vh] flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-primary" />
            <Dialog.Title className="type-body font-semibold flex-1">{t('pages.resources.permissionSettingsTitle', { name: folder.name })}</Dialog.Title>
            <Dialog.Close className="text-muted-foreground hover:text-foreground">
              <XIcon size={14} />
            </Dialog.Close>
          </div>

          {/* Sharing toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
            <div>
              <p className="type-label font-medium">{t('pages.resources.enableSharing')}</p>
              <p className="type-caption text-muted-foreground mt-0.5">{t('pages.resources.enableSharingHint')}</p>
            </div>
            <button
              onClick={() => toggleShared.mutate(!localIsShared)}
              className={`relative w-10 h-5 rounded-full transition-colors ${localIsShared ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${localIsShared ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {localIsShared && (
            <>
              {/* Current permission list */}
              <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                <p className="type-caption text-muted-foreground font-medium mb-1">{t('pages.resources.authorizedUsers')}</p>
                {perms.length === 0 ? (
                  <p className="type-label text-muted-foreground/60 py-2 text-center">{t('pages.resources.noAuthorizedUsers')}</p>
                ) : (
                  perms.map(p => (
                    <div key={p.ID} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background">
                      <span className="type-label font-medium flex-1 truncate">{p.user?.username ?? t('pages.resources.userFallback', { id: p.user_id })}</span>
                      {/* Toggle permission */}
                      <button
                        onClick={() => grant.mutate({ userId: p.user_id, permission: p.permission === 'read' ? 'write' : 'read' })}
                        className="flex items-center gap-1 type-caption px-2 py-0.5 rounded-full border border-border hover:bg-muted transition-colors"
                        title={t('pages.resources.togglePermissionTitle')}
                      >
                        {PERM_ICONS[p.permission]}
                        {PERM_LABELS[p.permission]}
                      </button>
                      {/* Revoke */}
                      <button
                        onClick={() => revoke.mutate(p.user_id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title={t('pages.resources.removePermissionTitle')}
                      >
                        <XIcon size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add user */}
              <div className="border-t border-border pt-3 space-y-2">
                <p className="type-caption text-muted-foreground font-medium">{t('pages.resources.addUser')}</p>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={searchQ}
                    onChange={e => setSearchQ(e.target.value)}
                    placeholder={t('pages.resources.searchUsersPlaceholder')}
                    className="w-full pl-7 pr-3 py-1.5 type-label border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                {searchResults.length > 0 && (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {searchResults.map(u => {
                      const already = existingUserIds.has(u.ID)
                      return (
                        <div key={u.ID} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background type-label">
                          <span className="flex-1 truncate">{u.username}</span>
                          {already ? (
                            <span className="text-muted-foreground type-caption">{t('pages.resources.alreadyAdded')}</span>
                          ) : (
                            <div className="flex gap-1">
                              <button
                                onClick={() => { grant.mutate({ userId: u.ID, permission: 'read' }); setSearchQ('') }}
                                className="flex items-center gap-1 type-caption px-2 py-0.5 rounded-full bg-muted hover:bg-primary hover:text-primary-foreground transition-colors"
                              >
                                <Eye size={10} /> {t('pages.resources.permissions.read')}
                              </button>
                              <button
                                onClick={() => { grant.mutate({ userId: u.ID, permission: 'write' }); setSearchQ('') }}
                                className="flex items-center gap-1 type-caption px-2 py-0.5 rounded-full bg-muted hover:bg-primary hover:text-primary-foreground transition-colors"
                              >
                                <PenLine size={10} /> {t('pages.resources.permissions.write')}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

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
    <Dialog.Root open onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-xl p-6 w-72 z-50">
          <Dialog.Title className="type-body font-semibold mb-4">{t('pages.resources.moveToFolder')}</Dialog.Title>
          <p className="type-label text-muted-foreground mb-3 truncate" title={resource.name}>{resource.name}</p>
          <div className="space-y-1 max-h-56 overflow-y-auto">
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
                isShared={f.is_shared}
                onClick={() => setTargetFolder(f.ID)}
              />
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={() => move.mutate()} disabled={move.isPending}>
              {move.isPending ? t('pages.resources.moving') : t('pages.resources.move')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
    <Dialog.Root open onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-xl p-6 w-80 z-50">
          <Dialog.Title className="type-body font-semibold mb-4">{t('pages.resources.renameResource')}</Dialog.Title>
          <div>
            <label className="type-label text-muted-foreground mb-1 block">{t('forms.name')}</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && name.trim()) rename.mutate()
              }}
              className="w-full px-3 py-1.5 type-body border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={() => rename.mutate()} disabled={!name.trim() || rename.isPending}>
              {rename.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
    <Dialog.Root open onOpenChange={v => !v && !isBusy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(880px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Scissors size={16} className="text-primary" />
            <Dialog.Title className="min-w-0 flex-1 truncate type-body font-semibold">{t('pages.resources.clipVideoTitle')}</Dialog.Title>
            <Dialog.Close
              disabled={isBusy}
              className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('common.close')}
            >
              <XIcon size={16} />
            </Dialog.Close>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_260px] overflow-hidden max-lg:grid-cols-1">
            <div className="min-h-0 overflow-auto p-4">
              <div className="aspect-video overflow-hidden rounded-lg bg-black">
                {loadingSource ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-8 type-body text-white/70">
                    <span>{t('pages.resources.clipLoadingSource')}</span>
                    <div className="h-1.5 w-full max-w-72 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full rounded-full bg-white/70" style={{ width: `${sourceProgressPct}%` }} />
                    </div>
                    <span className="type-label text-white/50">
                      {sourceProgress.total
                        ? t('pages.resources.clipLoadProgress', { loaded: formatBytes(sourceProgress.loaded), total: formatBytes(sourceProgress.total) })
                        : formatBytes(sourceProgress.loaded)}
                    </span>
                  </div>
                ) : sourceError ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center type-body text-white/70">
                    <span>{sourceError}</span>
                    {sourceErrorRetryable && (
                      <button
                        onClick={() => setSourceLoadAttempt(attempt => attempt + 1)}
                        className="rounded-lg border border-white/20 px-3 py-1.5 type-label text-white/80 hover:bg-white/10"
                        aria-label={t('pages.resources.clipRetryLoad')}
                      >
                        {t('pages.resources.clipRetryLoad')}
                      </button>
                    )}
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    src={sourceUrl}
                    className="h-full w-full object-contain"
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
                )}
              </div>

              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={togglePlayback}
                    disabled={!sourceBlob}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
                    title={playing ? t('pages.resources.clipPause') : t('pages.resources.clipPlaySegment')}
                    aria-label={playing ? t('pages.resources.clipPause') : t('pages.resources.clipPlaySegment')}
                  >
                    {playing ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button
                    onClick={() => seekTo(startMs)}
                    disabled={!sourceBlob || isBusy}
                    className="rounded-lg border border-border px-3 py-1.5 type-label text-muted-foreground hover:bg-muted disabled:opacity-50"
                    aria-label={t('pages.resources.clipGoStart')}
                  >
                    {t('pages.resources.clipGoStart')}
                  </button>
                  <button
                    onClick={setStartFromCurrent}
                    disabled={!sourceBlob || isBusy}
                    className="rounded-lg border border-border px-3 py-1.5 type-label text-muted-foreground hover:bg-muted disabled:opacity-50"
                    aria-label={t('pages.resources.clipSetStart')}
                  >
                    {t('pages.resources.clipSetStart')}
                  </button>
                  <button
                    onClick={setEndFromCurrent}
                    disabled={!sourceBlob || isBusy}
                    className="rounded-lg border border-border px-3 py-1.5 type-label text-muted-foreground hover:bg-muted disabled:opacity-50"
                    aria-label={t('pages.resources.clipSetEnd')}
                  >
                    {t('pages.resources.clipSetEnd')}
                  </button>
                  <div className="min-w-40 flex-1">
                    <div className="relative h-2 rounded-full bg-muted">
                      <div className="absolute inset-y-0 rounded-full bg-primary/20" style={{ left: `${durationMs ? startMs / durationMs * 100 : 0}%`, width: `${selectedPct}%` }} />
                      <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-primary" style={{ left: `${progressPct}%` }} />
                    </div>
                  </div>
                  <span className="w-24 text-right type-label tabular-nums text-muted-foreground">{formatTime(currentMs)} / {formatTime(durationMs)}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
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
                </div>
              </div>
            </div>

            <div className="border-l border-border p-4 max-lg:border-l-0 max-lg:border-t">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block type-label text-muted-foreground">{t('pages.resources.clipOutputName')}</label>
                  <input
                    value={outputName}
                    onChange={event => setOutputName(event.target.value)}
                    disabled={isBusy}
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 type-body focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="mb-1 block type-label text-muted-foreground">{t('pages.resources.clipMode')}</label>
                  <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border type-label">
                    <button disabled={isBusy} onClick={() => setMode('accurate')} className={`px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-60 ${mode === 'accurate' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                      {t('pages.resources.clipAccurate')}
                    </button>
                    <button disabled={isBusy} onClick={() => setMode('fast')} className={`px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-60 ${mode === 'fast' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                      {t('pages.resources.clipFast')}
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 type-label text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>{t('pages.resources.clipDuration')}</span>
                    <span className="font-medium text-foreground">{formatTime(selectedDurationMs)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>{t('pages.resources.clipMaxDuration')}</span>
                    <span className="font-medium text-foreground">{formatTime(MAX_CLIP_DURATION_MS)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>{t('pages.resources.clipSource')}</span>
                    <span className="max-w-36 truncate text-foreground" title={resource.name}>{resource.name}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>{t('pages.resources.clipSourceSize')}</span>
                    <span className="font-medium text-foreground">{formatBytes(sourceBlob?.size ?? resource.size)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>{t('pages.resources.clipOutput')}</span>
                    <span className="max-w-36 truncate text-foreground" title={outputName}>{outputName}</span>
                  </div>
                </div>
                {phaseLabel && (
                  <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 type-label text-primary">
                    {phaseLabel}
                  </div>
                )}
                {isBusy && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 type-label text-muted-foreground">
                    {t('pages.resources.clipBusyHint')}
                  </div>
                )}
                {rangeError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 type-label text-destructive">
                    {rangeError === 'too_long' ? t('pages.resources.clipTooLong') : t('pages.resources.clipInvalidRange')}
                  </div>
                )}
                {sourceSizeError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 type-label text-destructive">
                    {sourceErrorMessage(sourceSizeError, sourceBlob?.size ?? resource.size, t)}
                  </div>
                )}
                {outputNameError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 type-label text-destructive">
                    {outputNameError === 'unsupported_extension'
                      ? t('pages.resources.clipOutputNameMp4')
                      : outputNameError === 'invalid_filename'
                        ? t('pages.resources.clipOutputNameInvalid')
                        : outputNameError === 'too_long'
                          ? t('pages.resources.clipOutputNameTooLong')
                        : t('pages.resources.clipOutputNameRequired')}
                  </div>
                )}
                <p className="type-label leading-5 text-muted-foreground">
                  {t('pages.resources.clipLocalHint')}
                </p>
                <div className={`rounded-lg border p-3 type-label ${
                  clipStatus.loading
                    ? 'border-border bg-muted/30 text-muted-foreground'
                    : clipStatus.available
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                      : 'border-destructive/30 bg-destructive/10 text-destructive'
                }`}>
                  {clipStatus.loading
                    ? t('pages.resources.clipCheckingFFmpeg')
                    : clipStatus.available
                      ? t('pages.resources.clipFFmpegReady', { version: clipStatus.version || 'ffmpeg' })
                      : (
                        <span>
                          {clipStatus.error || t('pages.resources.clipFFmpegMissing')}
                          {clipStatus.expectedBundledPath && (
                            <span className="mt-1 block break-all font-mono type-caption leading-4">
                              {t('pages.resources.clipFFmpegExpectedPath', { path: clipStatus.expectedBundledPath })}
                            </span>
                          )}
                        </span>
                      )}
                </div>
                {(clipError || !window.api?.clipVideo) && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 type-label text-destructive">
                    {clipError || t('pages.resources.clipDesktopOnly')}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isBusy}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={() => uploadClip.mutate()} disabled={!canClip}>
              <Scissors size={14} />
              {uploadClip.isPending ? (phaseLabel || t('pages.resources.clipCreating')) : t('pages.resources.clipCreate')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="type-label text-muted-foreground">{label}</label>
        <input
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
          className="h-7 w-20 rounded-md border border-border bg-background px-2 text-right type-label tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={label}
        />
      </div>
      <input type="range" min={0} max={max} step={100} value={value} onChange={event => onChange(Number(event.target.value))} disabled={disabled} className="w-full disabled:opacity-60" />
    </div>
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

function FolderOption({ label, selected, isShared, onClick }: {
  label: string; selected: boolean; isShared?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 type-label rounded-lg transition-colors text-left ${
        selected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'
      }`}
    >
      <Folder size={12} />
      <span className="flex-1 truncate">{label}</span>
      {isShared && <Globe size={10} className={selected ? 'opacity-70' : 'text-blue-400'} />}
    </button>
  )
}

// ─── Resource Card ────────────────────────────────────────────────────────────
function ResourceCard({
  resource,
  onDelete,
  onMove,
  onRename,
  onDownload,
  onClip,
  isSharedView,
}: {
  resource: RawResource
  onDelete?: () => void
  onMove: () => void
  onRename: () => void
  onDownload: () => void
  onClip?: () => void
  isSharedView?: boolean
}) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      className="group relative flex cursor-grab flex-col gap-1.5 active:cursor-grabbing"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/resource-id', String(resource.ID))
        event.dataTransfer.setData('application/canvas-resource', JSON.stringify(resource))
        event.dataTransfer.effectAllowed = 'copy'
      }}
      title={t('shared.resourcePanel.previewDragTitle')}
    >
      {/* Preview */}
      <div className="aspect-square relative">
        {resource.type === 'image' || resource.type === 'video' || resource.type === 'audio' || resource.type === 'text' ? (
          <MediaViewer resource={resource} className="w-full h-full" />
        ) : (
          <div className="w-full h-full rounded-lg bg-muted flex items-center justify-center">
            <TypeIcon type={resource.type} />
          </div>
        )}

        {/* Action menu */}
        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title={t('pages.resources.actions')}
            >
              <MoreHorizontal size={12} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="bg-background border border-border rounded-lg shadow-lg py-1 min-w-36 z-50 type-body"
              align="end"
              sideOffset={4}
            >
              <DropdownMenu.Item
                className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground"
                onSelect={onDownload}
              >
                <Download size={14} />
                {t('shared.mediaViewer.download')}
              </DropdownMenu.Item>
              {!isSharedView && (
                <DropdownMenu.Item
                  className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground"
                  onSelect={onRename}
                >
                  <Pencil size={14} />
                  {t('pages.resources.renameResource')}
                </DropdownMenu.Item>
              )}
              {!isSharedView && (
                <DropdownMenu.Item
                  className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground"
                  onSelect={onMove}
                >
                  <MoveRight size={14} />
                  {t('pages.resources.moveToFolder')}
                </DropdownMenu.Item>
              )}
              {!isSharedView && resource.type === 'video' && onClip && (
                <DropdownMenu.Item
                  className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground"
                  onSelect={onClip}
                >
                  <Scissors size={14} />
                  {t('pages.resources.clipVideo')}
                </DropdownMenu.Item>
              )}
              {!isSharedView && onDelete && (
                <>
                  <DropdownMenu.Separator className="my-1 border-t border-border" />
                  <DropdownMenu.Item
                    className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-destructive"
                    onSelect={onDelete}
                  >
                    <Trash2 size={14} />
                    {t('common.delete')}
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Shared badge */}
        {resource.is_shared && (
          <div className="absolute bottom-1 right-1">
            <span title={t('pages.resources.sharedTitle')}><Share2 size={10} className="text-blue-400" /></span>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-1 text-muted-foreground/70">
        <TypeIcon type={resource.type} />
        <span className="type-label truncate flex-1" title={resource.name}>{resource.name}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="type-label text-muted-foreground/50">{formatBytes(resource.size)}</span>
        {isSharedView && resource.owner && (
          <span className="type-label text-muted-foreground/50 truncate ml-1">{resource.owner.username}</span>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ResourcesPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('mine')
  const [filter, setFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  // selectedFolder: null=all, 'root'=unfiled, number=folder ID
  // selectedFolderTab: which sidebar section the selected folder belongs to
  const [selectedFolder, setSelectedFolder] = useState<number | 'root' | null>(null)
  const [selectedFolderTab, setSelectedFolderTab] = useState<'mine' | 'shared'>('mine')
  const [folderDialog, setFolderDialog] = useState<{ open: boolean; folder?: ResourceFolder | null }>({ open: false })
  const [moveResource, setMoveResource] = useState<RawResource | null>(null)
  const [renameResource, setRenameResource] = useState<RawResource | null>(null)
  const [clipResource, setClipResource] = useState<RawResource | null>(null)
  const [permissionsFolder, setPermissionsFolder] = useState<ResourceFolder | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [page, setPage] = useState(1)
  const pageSize = 30

  // My folders
  const { data: myFolders = [] } = useQuery<ResourceFolder[]>({
    queryKey: ['resource-folders', 'mine'],
    queryFn: () => api.get('/resource-folders').then(r => r.data),
  })

  // Shared folders from other users
  const { data: sharedFolders = [] } = useQuery<ResourceFolder[]>({
    queryKey: ['resource-folders', 'shared'],
    queryFn: () => api.get('/resource-folders?shared=true').then(r => r.data),
  })

  const deleteFolder = useMutation({
    mutationFn: (id: number) => api.delete(`/resource-folders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resource-folders'] })
      if (typeof selectedFolder === 'number') setSelectedFolder(null)
    },
  })

  // Resources: personal or shared, with optional folder filter
  const folderParam = selectedFolder === 'root' ? 'root' : selectedFolder != null ? String(selectedFolder) : undefined
  const { data: resourcesData, isLoading } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['resources', tab, folderParam, selectedFolderTab, filter, search, page],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', String(pageSize))
      if (tab === 'shared' || (selectedFolderTab === 'shared' && selectedFolder != null)) {
        params.set('shared', 'true')
      }
      if (folderParam && !(tab === 'shared' && !selectedFolder)) {
        params.set('folder_id', folderParam)
      }
      // When showing all shared (no folder selected), don't pass folder_id
      if (tab === 'shared' && selectedFolder === null) {
        params.delete('folder_id')
      }
      if (filter !== 'all') params.set('type', filter)
      if (search.trim()) params.set('q', search.trim())
      return api.get(`/resources?${params}`).then(r => r.data)
    },
  })
  const resources = resourcesData?.items ?? []
  const total = resourcesData?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      if (typeof selectedFolder === 'number' && selectedFolderTab === 'mine') {
        fd.append('folder_id', String(selectedFolder))
      }
      return api.post('/resources/upload', fd).then(r => r.data as RawResource)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resources'] }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/resources/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resources'] }),
  })

  const isSharedView = tab === 'shared' || selectedFolderTab === 'shared'

  const visible = resources

  const currentFolderLabel = () => {
    if (selectedFolder === 'root') return t('pages.resources.unfiled')
    if (typeof selectedFolder === 'number') {
      const inMine = myFolders.find(f => f.ID === selectedFolder)
      if (inMine) return inMine.name
      const inShared = sharedFolders.find(f => f.ID === selectedFolder)
      if (inShared) return t('pages.resources.sharedFolderWithOwner', { name: inShared.name, owner: inShared.owner?.username ?? t('pages.resources.otherUser') })
    }
    return null
  }

  function selectMyFolder(id: number | 'root' | null) {
    setSelectedFolder(id)
    setSelectedFolderTab('mine')
    setTab('mine')
    setPage(1)
  }

  function selectSharedFolder(id: number) {
    setSelectedFolder(id)
    setSelectedFolderTab('shared')
    setTab('shared')
    setPage(1)
  }

  return (
    <div className="flex h-full">
      {/* Sidebar — folder tree */}
      <div className="w-52 shrink-0 border-r border-border flex flex-col bg-background">
        {/* My Folders section */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
          <span className="type-label font-semibold text-foreground">{t('pages.resources.myFolders')}</span>
          <button
            onClick={() => setFolderDialog({ open: true, folder: null })}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={t('pages.resources.newFolder')}
          >
            <FolderPlus size={14} />
          </button>
        </div>

        <div className="overflow-y-auto py-1 border-b border-border">
          <FolderItem
            label={t('pages.resources.allResources')}
            icon={<Folder size={14} />}
            active={selectedFolder === null && tab === 'mine'}
            onClick={() => selectMyFolder(null)}
          />
          <FolderItem
            label={t('pages.resources.unfiled')}
            icon={<Folder size={14} />}
            active={selectedFolder === 'root' && tab === 'mine'}
            onClick={() => selectMyFolder('root')}
          />
          {myFolders.map(f => (
            <FolderItem
              key={f.ID}
              label={f.name}
              icon={selectedFolder === f.ID && tab === 'mine' ? <FolderOpen size={14} /> : <Folder size={14} />}
              active={selectedFolder === f.ID && tab === 'mine'}
              onClick={() => selectMyFolder(f.ID)}
              badge={f.resource_count > 0 ? f.resource_count : undefined}
              isShared={f.is_shared}
              onEdit={() => setFolderDialog({ open: true, folder: f })}
              onDelete={() => deleteFolder.mutate(f.ID)}
              onPermissions={() => setPermissionsFolder(f)}
            />
          ))}
        </div>

        {/* Shared Folders section */}
        <div className="px-3 py-2.5 border-b border-border/50">
          <div className="flex items-center gap-1.5">
            <Share2 size={12} className="text-muted-foreground" />
            <span className="type-label font-semibold text-foreground">{t('pages.resources.sharedFolders')}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {sharedFolders.length === 0 ? (
            <p className="px-3 py-2 type-label text-muted-foreground/50">{t('pages.resources.noSharedFolders')}</p>
          ) : (
            sharedFolders.map(f => (
              <FolderItem
                key={f.ID}
                label={f.name}
                icon={selectedFolder === f.ID && tab === 'shared' ? <FolderOpen size={14} /> : <Folder size={14} />}
                active={selectedFolder === f.ID && tab === 'shared'}
                onClick={() => selectSharedFolder(f.ID)}
                badge={f.resource_count > 0 ? f.resource_count : undefined}
                subtitle={f.owner?.username}
              />
            ))
          )}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <ProjectSurfaceHeader
          icon={FolderOpen}
          title={t('header.titles.resources')}
          description={t('pages.resources.description', { defaultValue: '管理项目素材、生成结果、文件夹和共享资源。' })}
          className="px-4 py-3"
          meta={currentFolderLabel() ? <span className="type-label text-muted-foreground">{currentFolderLabel()}</span> : null}
          actions={(
            <>
              <div className="flex rounded-lg border border-border overflow-hidden type-label">
                <button
                  onClick={() => { setTab('mine'); setPage(1); if (selectedFolderTab === 'shared') setSelectedFolder(null) }}
                  className={`px-3 py-1 transition-colors ${tab === 'mine' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  {t('pages.resources.mine')}
                </button>
                <button
                  onClick={() => { setTab('shared'); setSelectedFolderTab('shared'); setPage(1) }}
                  className={`px-3 py-1 flex items-center gap-1 transition-colors ${tab === 'shared' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  <Share2 size={12} />
                  {t('pages.resources.shared')}
                </button>
              </div>

              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1) }}
                  placeholder={t('pages.resources.searchFilesPlaceholder')}
                  className="pl-7 pr-3 py-1.5 type-label border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-40"
                />
              </div>

              <Button
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
                className={`gap-1.5 ${isSharedView ? 'invisible' : ''}`}
              >
                <Upload size={14} />
                {upload.isPending ? t('pages.resources.uploading') : t('pages.resources.uploadFile')}
              </Button>
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                  title={t('pages.resources.gridTitle')}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                  title={t('pages.resources.listTitle')}
                >
                  <List size={14} />
                </button>
              </div>
            </>
          )}
        />
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={RESOURCE_UPLOAD_ACCEPT}
            multiple
            onChange={e => {
              if (!e.target.files) return
              Array.from(e.target.files).forEach(f => upload.mutate(f))
              e.target.value = ''
            }}
          />

        {/* Type filter */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-background shrink-0">
          {TYPE_TABS.map(tabItem => (
            <button
              key={tabItem.value}
              onClick={() => { setFilter(tabItem.value); setPage(1) }}
              className={`px-3 py-1 type-label rounded-full transition-colors ${
                filter === tabItem.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {t(tabItem.labelKey)}
            </button>
          ))}
          <div className="flex-1" />
          <span className="type-label text-muted-foreground">{t('pages.resources.filesCount', { count: total })}</span>
        </div>

        {/* Grid / List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground type-body">{t('common.loadingShort')}</div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/50">
              <Upload size={24} className="mb-3 opacity-30" />
              <p className="type-body">
                {isSharedView ? t('pages.resources.noSharedResources') : search ? t('pages.resources.noMatchedFiles') : t('pages.resources.noResourcesUpload')}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {visible.map(r => (
                <ResourceCard
                  key={r.ID}
                  resource={r}
                  isSharedView={isSharedView}
                  onDelete={!isSharedView ? () => remove.mutate(r.ID) : undefined}
                  onMove={() => setMoveResource(r)}
                  onRename={() => setRenameResource(r)}
                  onClip={() => setClipResource(r)}
                  onDownload={() => downloadResource(resolveResourceUrl(r), r.name)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {visible.map(r => (
                <ResourceListItem
                  key={r.ID}
                  resource={r}
                  thumbSize="md"
                  draggable
                  trailing={
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          className="w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all shrink-0"
                          onClick={e => e.stopPropagation()}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="bg-background border border-border rounded-lg shadow-lg py-1 min-w-36 z-50 type-body" align="end" sideOffset={4}>
                          <DropdownMenu.Item className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground" onSelect={() => downloadResource(resolveResourceUrl(r), r.name)}>
                            <Download size={14} />{t('shared.mediaViewer.download')}
                          </DropdownMenu.Item>
                          {!isSharedView && (
                            <DropdownMenu.Item className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground" onSelect={() => setRenameResource(r)}>
                              <Pencil size={14} />{t('pages.resources.renameResource')}
                            </DropdownMenu.Item>
                          )}
                          {!isSharedView && (
                            <DropdownMenu.Item className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground" onSelect={() => setMoveResource(r)}>
                              <MoveRight size={14} />{t('pages.resources.moveToFolder')}
                            </DropdownMenu.Item>
                          )}
                          {!isSharedView && r.type === 'video' && (
                            <DropdownMenu.Item className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground" onSelect={() => setClipResource(r)}>
                              <Scissors size={14} />{t('pages.resources.clipVideo')}
                            </DropdownMenu.Item>
                          )}
                          {!isSharedView && (
                            <>
                              <DropdownMenu.Separator className="my-1 border-t border-border" />
                              <DropdownMenu.Item className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-destructive" onSelect={() => remove.mutate(r.ID)}>
                                <Trash2 size={14} />{t('common.delete')}
                              </DropdownMenu.Item>
                            </>
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-background shrink-0 type-label text-muted-foreground">
          <span>{t('pages.resources.pageStatus', { page, pageCount })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft size={14} />
              {t('pages.resources.previousPage')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
              {t('pages.resources.nextPage')}
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {folderDialog.open && (
        <FolderDialog
          open
          onClose={() => setFolderDialog({ open: false })}
          editFolder={folderDialog.folder}
        />
      )}
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
          folderId={typeof selectedFolder === 'number' && selectedFolderTab === 'mine' ? selectedFolder : undefined}
          onClose={() => setClipResource(null)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['resources'] })
            setClipResource(null)
          }}
        />
      )}
      {permissionsFolder && (
        <PermissionsDialog
          folder={permissionsFolder}
          onClose={() => setPermissionsFolder(null)}
        />
      )}
    </div>
  )
}

// ─── Folder Sidebar Item ──────────────────────────────────────────────────────
function FolderItem({
  label,
  icon,
  active,
  onClick,
  badge,
  isShared,
  subtitle,
  onEdit,
  onDelete,
  onPermissions,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  badge?: number
  isShared?: boolean
  subtitle?: string
  onEdit?: () => void
  onDelete?: () => void
  onPermissions?: () => void
}) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-1.5 type-label cursor-pointer transition-colors ${
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      }`}
      onClick={onClick}
    >
      <span className="shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="truncate">{label}</div>
        {subtitle && <div className="type-tiny text-muted-foreground/60 truncate">{subtitle}</div>}
      </div>

      {isShared && <span title={t('pages.resources.sharedTitle')}><Globe size={10} className="text-blue-400 shrink-0" /></span>}

      {badge != null && (
        <span className="bg-muted text-muted-foreground rounded-full px-1.5 type-tiny">{badge}</span>
      )}

      {(onEdit || onDelete || onPermissions) && (
        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              className="w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <MoreHorizontal size={12} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="bg-background border border-border rounded-lg shadow-lg py-1 min-w-28 z-50 type-label"
              align="end"
              sideOffset={4}
            >
              {onEdit && (
                <DropdownMenu.Item
                  className="px-3 py-1.5 cursor-pointer hover:bg-muted text-foreground"
                  onSelect={() => { onEdit(); setMenuOpen(false) }}
                >
                  {t('pages.resources.edit')}
                </DropdownMenu.Item>
              )}
              {onPermissions && (
                <DropdownMenu.Item
                  className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground"
                  onSelect={() => { onPermissions(); setMenuOpen(false) }}
                >
                  <ShieldCheck size={12} />
                  {t('pages.resources.permissionSettings')}
                </DropdownMenu.Item>
              )}
              {onDelete && (
                <DropdownMenu.Item
                  className="px-3 py-1.5 cursor-pointer hover:bg-muted text-destructive"
                  onSelect={() => { onDelete(); setMenuOpen(false) }}
                >
                  {t('common.delete')}
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  )
}
