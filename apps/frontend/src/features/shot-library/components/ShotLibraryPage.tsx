import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Film,
  FolderOpen,
  Loader2,
  Pencil,
  Save,
  Scissors,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  StatusBadge,
  Textarea,
  cn,
} from '@movscript/ui'
import { api } from '@/shared/infrastructure/api'
import { normalizeAPIBaseURL } from '@/shared/infrastructure/config'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { MediaViewer, resolveResourceUrl } from '@/shared/ui/MediaViewer'
import { AuthedVideo } from '@/shared/ui/AuthedImage'
import { toast } from '@/shared/ui/toastStore'
import type { PaginatedResponse, RawResource } from '@/types'
import {
  analyzeShotReference,
  createShotReferencesFromResourceInSource,
  deleteShotReferenceFromSource,
  listShotLibrarySource,
  localizeShotSemanticValue,
  localizeShotSummary,
  normalizeShotLibrarySources,
  searchShotReferences,
  type ShotLibraryEntry,
  type ShotLibrarySource,
  type ShotLibrarySemanticCategory,
  type ShotLibraryVideoMetadata,
  type ShotReferenceManualUpdate,
  uploadShotLibraryResourceToSource,
  updateShotReferenceInSource,
  shotLibraryEntryFromApi,
} from '@/features/shot-library/domain/shotReferenceLibrary'

type ShotImportPhase = 'idle' | 'preparing' | 'cutting' | 'review' | 'saving'
type ShotImportSourceKind = 'file' | 'resource'
type ShotManualDraft = ReturnType<typeof detailDraftFromEntry>
type ShotCutRange = { startSec: number; endSec: number }

interface ShotImportDraft extends ShotManualDraft {
  id: string
  order: number
  status: 'cutting' | 'ready'
  selected: boolean
}

interface ShotImportSession {
  sourceKey: string
  sourceKind: ShotImportSourceKind
  sourceName: string
  sourceResource: RawResource
  file?: File
  objectUrl?: string
  metadata: ShotLibraryVideoMetadata
  phase: ShotImportPhase
  drafts: ShotImportDraft[]
  activeDraftId?: string
  error?: string
  progressPercent?: number
  targetGroupId?: number
}

interface ShotLibraryGroupOption {
  id: number
  sourceId: string
  title: string
}

type ShotTagSuggestions = Record<ShotLibrarySemanticCategory, string[]>

const RESOURCE_LIBRARY_PAGE_SIZE = 12
const VIDEO_METADATA_TIMEOUT_MS = 8000

async function loadVideoMetadata(file: File): Promise<ShotLibraryVideoMetadata> {
  const url = URL.createObjectURL(file)
  return loadVideoMetadataFromObjectUrl(url, () => URL.revokeObjectURL(url))
}

async function loadVideoMetadataFromBlob(blob: Blob): Promise<ShotLibraryVideoMetadata> {
  const url = URL.createObjectURL(blob)
  return loadVideoMetadataFromObjectUrl(url, () => URL.revokeObjectURL(url))
}

async function loadVideoMetadataFromObjectUrl(url: string, cleanup: () => void): Promise<ShotLibraryVideoMetadata> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    let settled = false
    const done = (metadata: ShotLibraryVideoMetadata) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      cleanup()
      resolve(metadata)
    }
    const timeout = window.setTimeout(() => done({}), VIDEO_METADATA_TIMEOUT_MS)
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => {
      done({
        durationSec: Number.isFinite(video.duration) ? video.duration : undefined,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
      })
    }
    video.onerror = () => done({})
    video.src = url
  })
}

async function loadResourceVideoBlob(resource: RawResource, onProgress?: (percent: number | undefined) => void): Promise<Blob> {
  const response = await api.get(resolveResourceUrl(resource), {
    baseURL: '',
    responseType: 'blob',
    onDownloadProgress: (event) => {
      const total = event.total || resource.size || 0
      onProgress?.(total > 0 ? Math.min(99, Math.round((event.loaded / total) * 100)) : undefined)
    },
  })
  return response.data as Blob
}

export default function ShotLibraryPage() {
  const { t, i18n } = useTranslation()
  const settings = useAppSettingsStore((s) => s.settings)
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [activeSourceId, setActiveSourceId] = useState<string | 'all'>(settings.defaultShotLibrarySourceId ?? 'all')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importSession, setImportSession] = useState<ShotImportSession | null>(null)
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourcePage, setResourcePage] = useState(1)
  const [selectedLibraryResource, setSelectedLibraryResource] = useState<RawResource | null>(null)

  const shotSources = useMemo(
    () => normalizeShotLibrarySources(settings.shotLibrarySources, settings.apiBaseURL, t('pages.shotLibrary.defaultSourceName')),
    [settings.apiBaseURL, settings.shotLibrarySources, t],
  )
  const enabledSources = useMemo(() => shotSources.filter(source => source.enabled), [shotSources])
  const writableSources = useMemo(() => enabledSources.filter(source => !source.readOnly), [enabledSources])
  const uploadSource = writableSources.find(source => source.id === activeSourceId)
    ?? writableSources.find(source => source.id === settings.defaultShotLibrarySourceId)
    ?? writableSources[0]
  const currentApiSource = writableSources.find(source => source.baseURL === normalizeAPIBaseURL(settings.apiBaseURL)) ?? uploadSource

  const removeShotReference = useMutation({
    mutationFn: async (entry: ShotLibraryEntry) => {
      const source = enabledSources.find(item => item.id === entry.sourceId)
      if (!source || source.readOnly) throw new Error(t('pages.shotLibrary.readOnlySource'))
      await deleteShotReferenceFromSource(api, source, entry.ID)
      return entry
    },
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ['shot-references'] })
      setSelectedKey(current => current === shotEntryKey(entry) ? null : current)
      toast.success(t('pages.shotLibrary.deleteSuccess'), entry.title)
    },
    onError: (error) => {
      toast.error(t('pages.shotLibrary.deleteFailed'), error instanceof Error ? error.message : undefined)
    },
  })

  const updateShotReference = useMutation({
    mutationFn: async ({ entry, input }: { entry: ShotLibraryEntry; input: ShotReferenceManualUpdate }) => {
      const source = enabledSources.find(item => item.id === entry.sourceId)
      if (!source || source.readOnly) throw new Error(t('pages.shotLibrary.readOnlySource'))
      return updateShotReferenceInSource(api, source, entry.ID, input)
    },
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ['shot-references'] })
      setSelectedKey(shotEntryKey(entry))
      toast.success(t('pages.shotLibrary.updateSuccess'), entry.title)
    },
    onError: (error) => {
      toast.error(t('pages.shotLibrary.updateFailed'), error instanceof Error ? error.message : undefined)
    },
  })

  const { data: sourceResults, isLoading } = useQuery({
    queryKey: ['shot-references', enabledSources.map(source => `${source.id}:${source.apiV1BaseURL}`).join('|'), query],
    queryFn: async () => {
      return Promise.all(enabledSources.map(source => listShotLibrarySource(api, source, query)))
    },
    enabled: enabledSources.length > 0,
  })
  const entries = useMemo(() => (sourceResults ?? [])
    .flatMap(result => (result.page?.items ?? []).map(item => shotLibraryEntryFromApi(item, result.source)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [sourceResults])
  const failedSources = useMemo(() => (sourceResults ?? []).filter(result => result.error), [sourceResults])

  const { data: resourcePickerData, isLoading: isResourcePickerLoading } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['shot-library-resource-picker', resourceSearch, resourcePage],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('page', String(resourcePage))
      params.set('page_size', String(RESOURCE_LIBRARY_PAGE_SIZE))
      params.set('type', 'video')
      if (resourceSearch.trim()) params.set('q', resourceSearch.trim())
      return api.get(`/resources?${params}`).then(response => response.data)
    },
    enabled: importDialogOpen,
  })
  const resourcePickerItems = resourcePickerData?.items ?? []
  const resourcePickerTotal = resourcePickerData?.total ?? 0
  const resourcePickerPageCount = Math.max(1, Math.ceil(resourcePickerTotal / RESOURCE_LIBRARY_PAGE_SIZE))

  const confirmShotImport = useMutation({
    mutationFn: async ({ session, source }: { session: ShotImportSession; source: ShotLibrarySource }) => {
      setImportSession(current => current ? { ...current, phase: 'saving', error: undefined } : current)
      let resource = session.sourceResource
      if (session.sourceKind === 'file') {
        if (!session.file) throw new Error(t('pages.shotLibrary.fileMissing'))
        const form = new FormData()
        form.append('file', session.file)
        resource = await uploadShotLibraryResourceToSource(api, source, form)
      }
      const created = await createShotReferencesFromResourceInSource(api, source, {
        resource_id: resource.ID,
        group_id: session.targetGroupId,
        duration_sec: session.metadata.durationSec,
        width: session.metadata.width,
        height: session.metadata.height,
        shots: session.drafts.filter(isDraftSelected).map(importDraftToManualUpdate),
      })
      return { created, source }
    },
    onSuccess: ({ created, source }) => {
      queryClient.invalidateQueries({ queryKey: ['shot-references'] })
      queryClient.invalidateQueries({ queryKey: ['resources'] })
      if (created[0]) setSelectedKey(shotEntryKey(created[0]))
      closeImportDialog()
      toast.success(t('pages.shotLibrary.uploadSuccess'), `${source.name} · ${t('pages.shotLibrary.importedShotCount', { count: created.length })}`)
    },
    onError: (error) => {
      setImportSession(current => current ? {
        ...current,
        phase: 'review',
        error: uploadErrorMessage(error, t('pages.shotLibrary.uploadFailed')),
      } : current)
      toast.error(t('pages.shotLibrary.uploadFailed'), error instanceof Error ? error.message : undefined)
    },
  })

  const sourceFilteredEntries = useMemo(
    () => activeSourceId === 'all' ? entries : entries.filter(entry => entry.sourceId === activeSourceId),
    [activeSourceId, entries],
  )
  const visibleEntries = useMemo(() => query.trim() ? searchShotReferences(sourceFilteredEntries, query) : sourceFilteredEntries, [sourceFilteredEntries, query])
  const visibleGroups = useMemo(() => groupShotReferences(visibleEntries), [visibleEntries])
  const selected = sourceFilteredEntries.find(entry => shotEntryKey(entry) === selectedKey) ?? visibleEntries[0] ?? sourceFilteredEntries[0]
  const totalDuration = entries.reduce((sum, entry) => sum + (entry.executionDetails.durationSec ?? 0), 0)
  const tagSuggestions = useMemo(() => buildShotTagSuggestions(entries), [entries])
  const groupOptions = useMemo(() => buildShotGroupOptions(entries), [entries])
  const importTargetSource = importSession?.sourceKind === 'resource' ? currentApiSource : uploadSource
  const importGroupOptions = useMemo(
    () => groupOptions.filter(group => !importTargetSource || group.sourceId === importTargetSource.id),
    [groupOptions, importTargetSource],
  )

  useEffect(() => {
    return () => {
      if (importSession?.objectUrl) URL.revokeObjectURL(importSession.objectUrl)
    }
  }, [importSession?.objectUrl])

  async function startImportFromFile(file: File | undefined) {
    if (!file) return
    setImportDialogOpen(true)
    if (!file.type.startsWith('video/')) {
      toast.error(t('pages.shotLibrary.uploadFailed'), t('pages.shotLibrary.videoOnly'))
      return
    }
    const objectUrl = URL.createObjectURL(file)
    const resource = tempResourceFromFile(file, objectUrl)
    const sourceKey = `file:${file.name}:${file.size}:${file.lastModified}`
    setImportSession({
      sourceKey,
      sourceKind: 'file',
      sourceName: file.name,
      sourceResource: resource,
      file,
      objectUrl,
      metadata: {},
      phase: 'preparing',
      drafts: [],
      targetGroupId: undefined,
    })
    let metadata: ShotLibraryVideoMetadata = {}
    try {
      metadata = await loadVideoMetadata(file)
      setImportSession(current => current?.sourceKey === sourceKey ? {
        ...current,
        metadata,
        phase: 'cutting',
        drafts: [],
        activeDraftId: undefined,
        error: undefined,
        progressPercent: undefined,
      } : current)
      const sourceData = await file.arrayBuffer()
      const drafts = await buildLocalImportDrafts(resource, metadata, sourceData)
      setImportSession(current => current?.sourceKey === sourceKey ? {
        ...current,
        metadata,
        phase: 'review',
        drafts,
        activeDraftId: drafts[0]?.id,
        error: undefined,
        progressPercent: undefined,
      } : current)
    } catch (error) {
      const drafts = buildImportDrafts(resource, metadata)
      setImportSession(current => current?.sourceKey === sourceKey ? {
        ...current,
        metadata,
        phase: 'review',
        drafts,
        activeDraftId: drafts[0]?.id,
        error: uploadErrorMessage(error, t('pages.shotLibrary.uploadFailed')),
        progressPercent: undefined,
      } : current)
    }
  }

  async function startImportFromResource(resource: RawResource) {
    setSelectedLibraryResource(resource)
    setImportDialogOpen(true)
    const sourceKey = `resource:${resource.ID}:${Date.now()}`
    setImportSession({
      sourceKey,
      sourceKind: 'resource',
      sourceName: resource.name,
      sourceResource: resource,
      metadata: {},
      phase: 'preparing',
      drafts: [],
      targetGroupId: undefined,
    })
    let metadata: ShotLibraryVideoMetadata = {}
    try {
      const blob = await loadResourceVideoBlob(resource, (progressPercent) => {
        setImportSession(current => current?.sourceKey === sourceKey ? {
          ...current,
          progressPercent,
        } : current)
      })
      metadata = await loadVideoMetadataFromBlob(blob)
      setImportSession(current => current?.sourceKey === sourceKey ? {
        ...current,
        metadata,
        phase: 'cutting',
        drafts: [],
        activeDraftId: undefined,
        error: undefined,
        progressPercent: undefined,
      } : current)
      const sourceData = await blob.arrayBuffer()
      const drafts = await buildLocalImportDrafts(resource, metadata, sourceData)
      setImportSession(current => current?.sourceKey === sourceKey ? {
        ...current,
        metadata,
        phase: 'review',
        drafts,
        activeDraftId: drafts[0]?.id,
        error: undefined,
        progressPercent: undefined,
      } : current)
    } catch (error) {
      const drafts = buildImportDrafts(resource, metadata)
      setImportSession(current => current?.sourceKey === sourceKey ? {
        ...current,
        metadata,
        phase: 'review',
        drafts,
        activeDraftId: drafts[0]?.id,
        error: uploadErrorMessage(error, t('pages.shotLibrary.uploadFailed')),
        progressPercent: undefined,
      } : current)
    }
  }

  function closeImportDialog() {
    setImportDialogOpen(false)
    setSelectedLibraryResource(null)
    setImportSession(current => {
      if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl)
      return null
    })
  }

  function updateImportDraft(draftId: string, patch: Partial<ShotManualDraft>) {
    setImportSession(current => current ? {
      ...current,
      drafts: current.drafts.map(draft => draft.id === draftId ? { ...draft, ...patch } : draft),
    } : current)
  }

  function toggleImportDraft(draftId: string, selected: boolean) {
    setImportSession(current => current ? {
      ...current,
      drafts: current.drafts.map(draft => draft.id === draftId ? { ...draft, selected } : draft),
    } : current)
  }

  function handleConfirmImport() {
    if (!importSession || !uploadSource || importSession.drafts.length === 0) return
    if (!importSession.drafts.some(isDraftSelected)) return
    const source = importSession.sourceKind === 'resource' ? currentApiSource : uploadSource
    if (!source) return
    confirmShotImport.mutate({ session: importSession, source })
  }

  return (
    <main className="shot-library-page">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(event) => {
          startImportFromFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />

      <section className="shot-library-page__header">
        <div className="shot-library-page__title-block">
          <div className="shot-library-page__eyebrow">
            <Clapperboard size={14} />
            <span>{t('pages.shotLibrary.eyebrow')}</span>
          </div>
          <h1>{t('pages.shotLibrary.title')}</h1>
          <p>{t('pages.shotLibrary.description')}</p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setImportDialogOpen(true)}
          loading={confirmShotImport.isPending}
          disabled={!uploadSource}
        >
          <Upload size={14} />
          {confirmShotImport.isPending ? t('pages.shotLibrary.analyzing') : t('pages.shotLibrary.uploadShot')}
        </Button>
      </section>

      <section className="shot-library-page__metrics" aria-label={t('pages.shotLibrary.metricsLabel')}>
        <ShotLibraryMetric icon={Film} label={t('pages.shotLibrary.totalReferences')} value={String(entries.length)} />
        <ShotLibraryMetric icon={Video} label={t('pages.shotLibrary.totalDuration')} value={formatDuration(totalDuration, i18n.language)} />
        <ShotLibraryMetric icon={Sparkles} label={t('pages.shotLibrary.librarySources')} value={String(enabledSources.length)} />
      </section>

      <section className="shot-library-page__body">
        <div className="shot-library-page__library">
          <ShotLibrarySourceBar
            sources={enabledSources}
            activeSourceId={activeSourceId}
            onSelect={setActiveSourceId}
            failedSourceIds={new Set(failedSources.map(result => result.source.id))}
          />
          <div className="shot-library-page__search">
            <Search size={14} />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('pages.shotLibrary.searchPlaceholder')}
              aria-label={t('pages.shotLibrary.searchPlaceholder')}
            />
          </div>

          {failedSources.length > 0 ? (
            <div className="shot-library-page__source-warning">
              <AlertCircle size={14} />
              <span>{t('pages.shotLibrary.sourceLoadFailed', { count: failedSources.length })}</span>
            </div>
          ) : null}

          {entries.length === 0 ? (
            <Card className="shot-library-page__empty">
              <CardHeader>
                <CardTitle>{t('pages.shotLibrary.emptyTitle')}</CardTitle>
                <CardDescription>{t('pages.shotLibrary.emptyDescription')}</CardDescription>
              </CardHeader>
            </Card>
          ) : isLoading ? (
            <div className="shot-library-page__empty-inline">
              <Sparkles size={16} />
              <span>{t('common.loadingShort')}</span>
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="shot-library-page__empty-inline">
              <AlertCircle size={16} />
              <span>{t('pages.shotLibrary.noMatches')}</span>
            </div>
          ) : (
            <div className="shot-library-page__groups">
              {visibleGroups.map(group => (
                <section key={group.id} className="shot-library-group">
                  <div className="shot-library-group__header">
                    <strong>{group.title}</strong>
                    <span>{t('pages.shotLibrary.groupShotCount', { count: group.entries.length })}</span>
                  </div>
                  <div className="shot-library-page__grid">
                    {group.entries.map(entry => (
                      <ShotReferenceCard
                        key={shotEntryKey(entry)}
                        entry={entry}
                        active={shotEntryKey(entry) === (selected ? shotEntryKey(selected) : '')}
                        onSelect={() => setSelectedKey(shotEntryKey(entry))}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="shot-library-page__detail" aria-label={t('pages.shotLibrary.detailTitle')}>
          {selected ? (
            <ShotReferenceDetail
              entry={selected}
              tagSuggestions={tagSuggestions}
              deleting={removeShotReference.isPending}
              saving={updateShotReference.isPending}
              canDelete={!selected.sourceReadOnly}
              onDelete={() => removeShotReference.mutate(selected)}
              onSave={(input) => updateShotReference.mutate({ entry: selected, input })}
            />
          ) : (
            <div className="shot-library-page__detail-empty">
              <Film size={18} />
              <span>{t('pages.shotLibrary.selectHint')}</span>
            </div>
          )}
        </aside>
      </section>

      <ShotImportDialog
        open={importDialogOpen}
        session={importSession}
        uploadSource={importSession?.sourceKind === 'resource' ? currentApiSource : uploadSource}
        groupOptions={importGroupOptions}
        tagSuggestions={tagSuggestions}
        resources={resourcePickerItems}
        selectedResource={selectedLibraryResource}
        resourceSearch={resourceSearch}
        resourcePage={resourcePage}
        resourcePageCount={resourcePickerPageCount}
        resourceTotal={resourcePickerTotal}
        isResourceLoading={isResourcePickerLoading}
        isSaving={confirmShotImport.isPending}
        onOpenChange={(open) => open ? setImportDialogOpen(true) : closeImportDialog()}
        onChooseFile={() => fileInputRef.current?.click()}
        onResourceSearch={(value) => {
          setResourceSearch(value)
          setResourcePage(1)
        }}
        onResourcePage={setResourcePage}
        onSelectResource={startImportFromResource}
        onClearResource={() => setSelectedLibraryResource(null)}
        onSelectDraft={(draftId) => setImportSession(current => current ? { ...current, activeDraftId: draftId } : current)}
        onToggleDraft={toggleImportDraft}
        onUpdateDraft={updateImportDraft}
        onTargetGroup={(targetGroupId) => setImportSession(current => current ? { ...current, targetGroupId } : current)}
        onConfirm={handleConfirmImport}
      />
    </main>
  )
}

function ShotLibraryMetric({ icon: Icon, label, value }: { icon: typeof Film; label: string; value: string }) {
  return (
    <div className="shot-library-page__metric">
      <Icon size={15} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

interface ShotLibraryEntryGroup {
  id: string
  title: string
  entries: ShotLibraryEntry[]
}

function groupShotReferences(entries: ShotLibraryEntry[]): ShotLibraryEntryGroup[] {
  const groups = new Map<string, ShotLibraryEntryGroup>()
  for (const entry of entries) {
    const id = `${entry.sourceId}:${entry.groupId ?? `resource:${entry.resourceId}`}`
    const current = groups.get(id)
    if (current) {
      current.entries.push(entry)
    } else {
      groups.set(id, {
        id,
        title: entry.groupTitle || entry.resourceName || entry.title,
        entries: [entry],
      })
    }
  }
  return Array.from(groups.values()).map(group => ({
    ...group,
    entries: group.entries.sort((a, b) => a.order - b.order || (a.startSec ?? 0) - (b.startSec ?? 0) || b.updatedAt.localeCompare(a.updatedAt)),
  }))
}

function ShotLibrarySourceBar({
  sources,
  activeSourceId,
  failedSourceIds,
  onSelect,
}: {
  sources: ShotLibrarySource[]
  activeSourceId: string | 'all'
  failedSourceIds: Set<string>
  onSelect: (sourceId: string | 'all') => void
}) {
  const { t } = useTranslation()
  return (
    <div className="shot-library-page__sources" aria-label={t('pages.shotLibrary.sourceFilter')}>
      <button
        type="button"
        className={cn('shot-library-page__source-chip', activeSourceId === 'all' && 'shot-library-page__source-chip--active')}
        onClick={() => onSelect('all')}
      >
        {t('pages.shotLibrary.allSources')}
      </button>
      {sources.map(source => (
        <button
          key={source.id}
          type="button"
          className={cn(
            'shot-library-page__source-chip',
            activeSourceId === source.id && 'shot-library-page__source-chip--active',
            failedSourceIds.has(source.id) && 'shot-library-page__source-chip--failed',
          )}
          onClick={() => onSelect(source.id)}
          title={source.apiV1BaseURL}
        >
          {source.name}
          {source.readOnly ? <span>{t('pages.shotLibrary.readOnlyBadge')}</span> : null}
        </button>
      ))}
    </div>
  )
}

function ShotImportDialog({
  open,
  session,
  uploadSource,
  groupOptions,
  tagSuggestions,
  resources,
  selectedResource,
  resourceSearch,
  resourcePage,
  resourcePageCount,
  resourceTotal,
  isResourceLoading,
  isSaving,
  onOpenChange,
  onChooseFile,
  onResourceSearch,
  onResourcePage,
  onSelectResource,
  onClearResource,
  onSelectDraft,
  onToggleDraft,
  onUpdateDraft,
  onTargetGroup,
  onConfirm,
}: {
  open: boolean
  session: ShotImportSession | null
  uploadSource?: ShotLibrarySource
  groupOptions: ShotLibraryGroupOption[]
  tagSuggestions: ShotTagSuggestions
  resources: RawResource[]
  selectedResource: RawResource | null
  resourceSearch: string
  resourcePage: number
  resourcePageCount: number
  resourceTotal: number
  isResourceLoading: boolean
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onChooseFile: () => void
  onResourceSearch: (value: string) => void
  onResourcePage: (value: number) => void
  onSelectResource: (resource: RawResource) => void
  onClearResource: () => void
  onSelectDraft: (draftId: string) => void
  onToggleDraft: (draftId: string, selected: boolean) => void
  onUpdateDraft: (draftId: string, patch: Partial<ShotManualDraft>) => void
  onTargetGroup: (groupId: number | undefined) => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const activeDraft = session?.drafts.find(draft => draft.id === session.activeDraftId) ?? session?.drafts[0]
  const canConfirm = Boolean(uploadSource && session?.phase === 'review' && session.drafts.some(isDraftSelected))

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSaving && onOpenChange(nextOpen)}>
      <DialogContent className="shot-import-dialog">
        <DialogHeader className="shot-import-dialog__header">
          <DialogTitle>{t('pages.shotLibrary.importDialogTitle')}</DialogTitle>
          <DialogDescription>
            {session ? session.sourceName : t('pages.shotLibrary.importDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="shot-import-dialog__body">
          <aside className="shot-import-dialog__source-pane">
            <div className="shot-import-dialog__source-actions">
              <Button type="button" size="sm" variant="outline" onClick={onChooseFile} disabled={isSaving}>
                <Upload size={14} />
                {t('pages.shotLibrary.chooseLocalVideo')}
              </Button>
              <div className="shot-import-dialog__source-target">
                <span>{t('pages.shotLibrary.importTarget')}</span>
                <strong>{uploadSource?.name ?? t('pages.shotLibrary.noWritableSource')}</strong>
              </div>
            </div>
            {session ? (
              <label className="shot-library-manual-form__field">
                <span>{t('pages.shotLibrary.targetGroup')}</span>
                <select
                  value={session.targetGroupId ?? ''}
                  onChange={event => onTargetGroup(event.target.value ? Number(event.target.value) : undefined)}
                  disabled={isSaving}
                >
                  <option value="">{t('pages.shotLibrary.createNewGroup')}</option>
                  {groupOptions.map(group => (
                    <option key={group.id} value={group.id}>{group.title}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <ShotImportResourceGrid
              resources={resources}
              selectedResource={selectedResource}
              search={resourceSearch}
              page={resourcePage}
              pageCount={resourcePageCount}
              total={resourceTotal}
              isLoading={isResourceLoading}
              onSearch={onResourceSearch}
              onPage={onResourcePage}
              onSelect={onSelectResource}
              onClear={onClearResource}
              disabled={isSaving}
            />
          </aside>

          <section className="shot-import-dialog__review-pane">
            {session ? (
              <>
                <div className="shot-import-dialog__preview">
                  <ShotDraftVideoPreview resource={session.sourceResource} draft={activeDraft} />
                </div>
                <div className="shot-import-dialog__status-row">
                  <StatusBadge intent={session.phase === 'review' ? 'success' : session.error ? 'danger' : 'info'} emphasis="soft">
                    {importPhaseLabel(session.phase, t)}
                  </StatusBadge>
                  <span>{importProgressLabel(session, t)}</span>
                </div>
                {session.error ? (
                  <div className="shot-import-dialog__error">
                    <AlertCircle size={14} />
                    <span>{session.error}</span>
                  </div>
                ) : null}
                <div className="shot-import-dialog__draft-layout">
                  <div className="shot-import-dialog__draft-list">
                    {session.drafts.length === 0 ? (
                      <div className="shot-import-dialog__empty">
                        {session.phase === 'preparing' ? <Loader2 size={16} /> : <Scissors size={16} />}
                        <span>{session.phase === 'preparing' ? t('pages.shotLibrary.readingSource') : t('pages.shotLibrary.cuttingShots')}</span>
                      </div>
                    ) : session.drafts.map(draft => (
                      <button
                        key={draft.id}
                        type="button"
                        className={cn('shot-import-dialog__draft-item', activeDraft?.id === draft.id && 'shot-import-dialog__draft-item--active')}
                        onClick={() => onSelectDraft(draft.id)}
                      >
                        <input
                          type="checkbox"
                          checked={isDraftSelected(draft)}
                          disabled={isSaving}
                          onClick={event => event.stopPropagation()}
                          onChange={event => onToggleDraft(draft.id, event.currentTarget.checked)}
                          aria-label={t('pages.shotLibrary.includeShot')}
                        />
                        <span>{String(draft.order).padStart(2, '0')}</span>
                        <strong>{draft.title}</strong>
                        {draft.status === 'ready' ? <CheckCircle2 size={14} /> : <Loader2 size={14} />}
                      </button>
                    ))}
                  </div>
                  {activeDraft ? (
                    <ShotImportDraftEditor
                      draft={activeDraft}
                      disabled={isSaving}
                      tagSuggestions={tagSuggestions}
                      onChange={(patch) => onUpdateDraft(activeDraft.id, patch)}
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <div className="shot-import-dialog__starter">
                <FolderOpen size={20} />
                <span>{t('pages.shotLibrary.importStarter')}</span>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="shot-import-dialog__footer">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={!canConfirm || isSaving} loading={isSaving}>
            <Save size={14} />
            {t('pages.shotLibrary.confirmImport')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ShotImportResourceGrid({
  resources,
  selectedResource,
  search,
  page,
  pageCount,
  total,
  isLoading,
  disabled,
  onSearch,
  onPage,
  onSelect,
  onClear,
}: {
  resources: RawResource[]
  selectedResource: RawResource | null
  search: string
  page: number
  pageCount: number
  total: number
  isLoading: boolean
  disabled: boolean
  onSearch: (value: string) => void
  onPage: (value: number) => void
  onSelect: (resource: RawResource) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="shot-import-resource-grid">
      <div className="shot-import-resource-grid__search">
        <Search size={13} />
        <Input
          value={search}
          disabled={disabled}
          placeholder={t('pages.assets.searchPlaceholder')}
          onChange={event => onSearch(event.target.value)}
        />
        {selectedResource ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            onClick={onClear}
            aria-label={t('forms.clearSelection')}
            title={t('forms.clearSelection')}
          >
            <X size={14} />
          </Button>
        ) : null}
      </div>
      <div className="shot-import-resource-grid__list" aria-busy={isLoading}>
        {isLoading ? (
          <div className="shot-import-resource-grid__state">
            <Loader2 className="shot-import-resource-grid__spinner" size={16} />
            <span>{t('common.loadingShort')}</span>
          </div>
        ) : resources.length === 0 ? (
          <div className="shot-import-resource-grid__state">
            <Film size={16} />
            <span>{t('pages.resources.empty')}</span>
          </div>
        ) : resources.map(resource => (
          <button
            key={resource.ID}
            type="button"
            className={cn(
              'shot-import-resource-grid__card',
              selectedResource?.ID === resource.ID && 'shot-import-resource-grid__card--selected',
            )}
            disabled={disabled}
            onClick={() => onSelect(resource)}
            aria-label={resource.name}
            aria-pressed={selectedResource?.ID === resource.ID}
            title={resource.name}
          >
            <MediaViewer resource={resource} fit="cover" lightbox={false} />
            {selectedResource?.ID === resource.ID ? (
              <span className="shot-import-resource-grid__selected">
                <CheckCircle2 size={16} />
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="shot-import-resource-grid__pager">
        <span>{t('common.itemsCount', { count: total })}</span>
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || page <= 1}
            onClick={() => onPage(Math.max(1, page - 1))}
          >
            {t('pages.resources.previousPage')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || page >= pageCount}
            onClick={() => onPage(Math.min(pageCount, page + 1))}
          >
            {t('pages.resources.nextPage')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ShotDraftVideoPreview({ resource, draft }: { resource: RawResource; draft?: ShotImportDraft }) {
  const startSec = draft ? optionalNumber(draft.startSec) ?? 0 : 0
  const endSec = draft ? optionalNumber(draft.endSec) : undefined
  const previewKey = `${resource.ID}:${draft?.id ?? 'source'}:${startSec}:${endSec ?? ''}`

  const seekToStart = (video: HTMLVideoElement) => {
    if (!Number.isFinite(startSec)) return
    const duration = Number.isFinite(video.duration) ? video.duration : undefined
    const target = duration === undefined ? startSec : Math.min(startSec, Math.max(0, duration - 0.05))
    if (Math.abs(video.currentTime - target) > 0.15) video.currentTime = target
  }

  const withinDraftRange = (video: HTMLVideoElement) => {
    if (video.currentTime < startSec - 0.15) return false
    if (endSec !== undefined && video.currentTime >= endSec) return false
    return true
  }

  return (
    <AuthedVideo
      key={previewKey}
      className="shot-import-dialog__preview-video"
      src={resolveResourceUrl(resource)}
      controls
      playsInline
      preload="metadata"
      diagnosticLabel={`shot-import:${resource.ID}:${draft?.id ?? 'source'}`}
      onLoadedMetadata={event => seekToStart(event.currentTarget)}
      onPlay={event => {
        if (!withinDraftRange(event.currentTarget)) seekToStart(event.currentTarget)
      }}
      onTimeUpdate={event => {
        const video = event.currentTarget
        if (endSec === undefined || video.currentTime < endSec) return
        video.pause()
        seekToStart(video)
      }}
    />
  )
}

function ShotImportDraftEditor({
  draft,
  disabled,
  tagSuggestions,
  onChange,
}: {
  draft: ShotImportDraft
  disabled: boolean
  tagSuggestions: ShotTagSuggestions
  onChange: (patch: Partial<ShotManualDraft>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="shot-import-dialog__editor">
      <ManualField label={t('pages.shotLibrary.titleField')}>
        <Input value={draft.title} disabled={disabled} onChange={event => onChange({ title: event.target.value })} />
      </ManualField>
      <ManualField label={t('pages.shotLibrary.summaryField')}>
        <Textarea value={draft.summary} disabled={disabled} rows={3} onChange={event => onChange({ summary: event.target.value })} />
      </ManualField>
      <div className="shot-library-manual-form__range">
        <ManualField label={t('pages.shotLibrary.startSec')}>
          <Input value={draft.startSec} disabled={disabled} onChange={event => onChange({ startSec: event.target.value })} />
        </ManualField>
        <ManualField label={t('pages.shotLibrary.endSec')}>
          <Input value={draft.endSec} disabled={disabled} onChange={event => onChange({ endSec: event.target.value })} />
        </ManualField>
      </div>
      <TagInputField label={t('pages.shotLibrary.intent')} value={draft.intent} disabled={disabled} suggestions={tagSuggestions.intent} category="intent" onChange={value => onChange({ intent: value })} />
      <TagInputField label={t('pages.shotLibrary.pattern')} value={draft.pattern} disabled={disabled} suggestions={tagSuggestions.pattern} category="pattern" onChange={value => onChange({ pattern: value })} />
      <TagInputField label={t('pages.shotLibrary.shotFunction')} value={draft.shotFunction} disabled={disabled} suggestions={tagSuggestions.shotFunction} category="shotFunction" onChange={value => onChange({ shotFunction: value })} />
      <TagInputField label={t('pages.shotLibrary.visualPreference')} value={draft.visualPreference} disabled={disabled} suggestions={tagSuggestions.visualPreference} category="visualPreference" onChange={value => onChange({ visualPreference: value })} />
      <TagInputField label={t('pages.shotLibrary.emotionalEffect')} value={draft.emotionalEffect} disabled={disabled} suggestions={tagSuggestions.emotionalEffect} category="emotionalEffect" onChange={value => onChange({ emotionalEffect: value })} />
    </div>
  )
}

function ShotReferenceCard({ entry, active, onSelect }: { entry: ShotLibraryEntry; active: boolean; onSelect: () => void }) {
  const { i18n } = useTranslation()
  return (
    <button
      type="button"
      className={cn('shot-reference-card', active && 'shot-reference-card--active')}
      onClick={onSelect}
    >
      <div className="shot-reference-card__media">
        <MediaViewer resource={resourceFromEntry(entry)} lightweightVideoThumb lightbox={false} />
      </div>
      <div className="shot-reference-card__body">
        <div className="shot-reference-card__title-row">
          <strong title={entry.title}>{entry.title}</strong>
          <StatusBadge intent="success" emphasis="soft">{entry.analysisStatus}</StatusBadge>
        </div>
        <div className="shot-reference-card__source">{entry.sourceName}</div>
        <p>{localizeShotSummary(entry, i18n.language)}</p>
        <TagRow
          values={[
            ...entry.intent.slice(0, 2).map(value => ({ category: 'intent' as const, value })),
            ...entry.pattern.slice(0, 2).map(value => ({ category: 'pattern' as const, value })),
          ]}
        />
      </div>
    </button>
  )
}

function ShotReferenceDetail({
  entry,
  tagSuggestions,
  deleting,
  saving,
  canDelete,
  onDelete,
  onSave,
}: {
  entry: ShotLibraryEntry
  tagSuggestions: ShotTagSuggestions
  deleting: boolean
  saving: boolean
  canDelete: boolean
  onDelete: () => void
  onSave: (input: ShotReferenceManualUpdate) => void
}) {
  const { t, i18n } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => detailDraftFromEntry(entry))
  const draftKey = shotEntryKey(entry)
  useEffect(() => {
    setDraft(detailDraftFromEntry(entry))
    setEditing(false)
  }, [draftKey])
  const confirmDelete = () => {
    if (!window.confirm(t('pages.shotLibrary.deleteConfirm', { title: entry.title }))) return
    onDelete()
  }
  const submit = () => {
    onSave({
      title: draft.title,
      summary: draft.summary,
      intent: splitTags(draft.intent),
      pattern: splitTags(draft.pattern),
      shot_function: splitTags(draft.shotFunction),
      visual_preference: splitTags(draft.visualPreference),
      emotional_effect: splitTags(draft.emotionalEffect),
      start_sec: optionalNumber(draft.startSec),
      start_sec_set: true,
      end_sec: optionalNumber(draft.endSec),
      end_sec_set: true,
    })
  }
  return (
    <Card className="shot-library-page__detail-card">
      <CardHeader>
        <div className="shot-library-page__detail-title-row">
          <CardTitle>{entry.title}</CardTitle>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => setEditing(current => !current)}
            disabled={entry.sourceReadOnly}
            aria-label={editing ? t('pages.shotLibrary.cancelEdit') : t('pages.shotLibrary.editReference')}
            title={entry.sourceReadOnly ? t('pages.shotLibrary.readOnlySource') : editing ? t('pages.shotLibrary.cancelEdit') : t('pages.shotLibrary.editReference')}
          >
            {editing ? <X size={14} /> : <Pencil size={14} />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            tone="danger"
            onClick={confirmDelete}
            loading={deleting}
            disabled={!canDelete}
            aria-label={t('pages.shotLibrary.deleteReference')}
            title={canDelete ? t('pages.shotLibrary.deleteReference') : t('pages.shotLibrary.readOnlySource')}
          >
            <Trash2 size={14} />
          </Button>
        </div>
        <CardDescription>{localizeShotSummary(entry, i18n.language)}</CardDescription>
      </CardHeader>
      <CardContent className="shot-library-page__detail-content">
        <DetailGroup title={t('pages.shotLibrary.source')} values={[{ value: `${entry.sourceName} · ${entry.sourceBaseURL || '-'}` }]} />
        <DetailGroup title={t('pages.shotLibrary.group')} values={[{ value: entry.groupTitle ?? '-' }]} />
        <div className="shot-library-page__preview">
          <MediaViewer resource={resourceFromEntry(entry)} fit="contain" />
        </div>
        {editing ? (
          <div className="shot-library-manual-form">
            <ManualField label={t('pages.shotLibrary.titleField')}>
              <Input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} />
            </ManualField>
            <ManualField label={t('pages.shotLibrary.summaryField')}>
              <Textarea value={draft.summary} rows={3} onChange={event => setDraft(current => ({ ...current, summary: event.target.value }))} />
            </ManualField>
            <TagInputField label={t('pages.shotLibrary.intent')} value={draft.intent} suggestions={tagSuggestions.intent} category="intent" onChange={value => setDraft(current => ({ ...current, intent: value }))} />
            <TagInputField label={t('pages.shotLibrary.pattern')} value={draft.pattern} suggestions={tagSuggestions.pattern} category="pattern" onChange={value => setDraft(current => ({ ...current, pattern: value }))} />
            <TagInputField label={t('pages.shotLibrary.shotFunction')} value={draft.shotFunction} suggestions={tagSuggestions.shotFunction} category="shotFunction" onChange={value => setDraft(current => ({ ...current, shotFunction: value }))} />
            <TagInputField label={t('pages.shotLibrary.visualPreference')} value={draft.visualPreference} suggestions={tagSuggestions.visualPreference} category="visualPreference" onChange={value => setDraft(current => ({ ...current, visualPreference: value }))} />
            <TagInputField label={t('pages.shotLibrary.emotionalEffect')} value={draft.emotionalEffect} suggestions={tagSuggestions.emotionalEffect} category="emotionalEffect" onChange={value => setDraft(current => ({ ...current, emotionalEffect: value }))} />
            <div className="shot-library-manual-form__range">
              <ManualField label={t('pages.shotLibrary.startSec')}>
                <Input value={draft.startSec} onChange={event => setDraft(current => ({ ...current, startSec: event.target.value }))} />
              </ManualField>
              <ManualField label={t('pages.shotLibrary.endSec')}>
                <Input value={draft.endSec} onChange={event => setDraft(current => ({ ...current, endSec: event.target.value }))} />
              </ManualField>
            </div>
            <div className="shot-library-manual-form__actions">
              <Button type="button" size="sm" onClick={submit} loading={saving}>
                <Save size={14} />
                {t('pages.shotLibrary.saveManualSettings')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DetailGroup title={t('pages.shotLibrary.intent')} category="intent" values={entry.intent} />
            <DetailGroup title={t('pages.shotLibrary.pattern')} category="pattern" values={entry.pattern} />
            <DetailGroup title={t('pages.shotLibrary.shotFunction')} category="shotFunction" values={entry.shotFunction} />
            <DetailGroup title={t('pages.shotLibrary.visualPreference')} category="visualPreference" values={entry.visualPreference} />
            <DetailGroup title={t('pages.shotLibrary.emotionalEffect')} category="emotionalEffect" values={entry.emotionalEffect} />
            <DetailGroup title={t('pages.shotLibrary.executionDetails')} values={[
              entry.startSec !== undefined ? `${t('pages.shotLibrary.startSec')}: ${entry.startSec}` : '',
              entry.endSec !== undefined ? `${t('pages.shotLibrary.endSec')}: ${entry.endSec}` : '',
              entry.executionDetails.durationSec ? `${t('pages.shotLibrary.duration')}: ${formatDuration(entry.executionDetails.durationSec, i18n.language)}` : '',
              entry.executionDetails.resolution ? `${t('pages.shotLibrary.resolution')}: ${entry.executionDetails.resolution}` : '',
              entry.executionDetails.aspectRatio ? `${t('pages.shotLibrary.aspectRatio')}: ${entry.executionDetails.aspectRatio}` : '',
            ].filter(Boolean).map(value => ({ value }))} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function DetailGroup({ title, category, values }: { title: string; category?: ShotLibrarySemanticCategory; values: Array<string | { value: string; category?: ShotLibrarySemanticCategory }> }) {
  return (
    <section className="shot-library-page__detail-group">
      <h2>{title}</h2>
      <TagRow values={values.map(value => typeof value === 'string' ? { value, category } : value)} empty="-" />
    </section>
  )
}

function ManualField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="shot-library-manual-form__field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function TagInputField({
  label,
  value,
  suggestions,
  category,
  disabled = false,
  onChange,
}: {
  label: string
  value: string
  suggestions: string[]
  category: ShotLibrarySemanticCategory
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const { i18n } = useTranslation()
  return (
    <ManualField label={label}>
      <Input value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
      {suggestions.length > 0 ? (
        <div className="shot-library-page__tags">
          {suggestions.slice(0, 12).map(suggestion => (
            <button
              key={`${category}:${suggestion}`}
              type="button"
              className="shot-library-page__tag-button"
              disabled={disabled}
              onClick={() => onChange(appendTagValue(value, suggestion))}
            >
              {localizeShotSemanticValue(category, suggestion, i18n.language)}
            </button>
          ))}
        </div>
      ) : null}
    </ManualField>
  )
}

function detailDraftFromEntry(entry: ShotLibraryEntry) {
  return {
    title: entry.title,
    summary: entry.summary,
    intent: entry.intent.join(', '),
    pattern: entry.pattern.join(', '),
    shotFunction: entry.shotFunction.join(', '),
    visualPreference: entry.visualPreference.join(', '),
    emotionalEffect: entry.emotionalEffect.join(', '),
    startSec: entry.startSec === undefined ? '' : String(entry.startSec),
    endSec: entry.endSec === undefined ? '' : String(entry.endSec),
  }
}

function buildShotTagSuggestions(entries: ShotLibraryEntry[]): ShotTagSuggestions {
  const categories: ShotLibrarySemanticCategory[] = ['intent', 'pattern', 'shotFunction', 'visualPreference', 'emotionalEffect']
  const result = Object.fromEntries(categories.map(category => [category, [] as string[]])) as ShotTagSuggestions
  for (const entry of entries) {
    for (const category of categories) {
      const source = category === 'intent' ? entry.intent : category === 'pattern' ? entry.pattern : category === 'shotFunction' ? entry.shotFunction : category === 'visualPreference' ? entry.visualPreference : entry.emotionalEffect
      for (const value of source) {
        if (!result[category].includes(value)) result[category].push(value)
      }
    }
  }
  for (const category of categories) {
    result[category].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }
  return result
}

function buildShotGroupOptions(entries: ShotLibraryEntry[]): ShotLibraryGroupOption[] {
  const groups = new Map<number, ShotLibraryGroupOption>()
  for (const entry of entries) {
    if (!entry.groupId) continue
    if (groups.has(entry.groupId)) continue
    groups.set(entry.groupId, {
      id: entry.groupId,
      sourceId: entry.sourceId,
      title: entry.groupTitle || entry.title,
    })
  }
  return Array.from(groups.values()).sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
}

function isDraftSelected(draft: ShotImportDraft) {
  return draft.selected !== false
}

function appendTagValue(current: string, next: string) {
  const values = current.split(/[,，\n]/).map(item => item.trim()).filter(Boolean)
  if (!values.includes(next)) values.push(next)
  return values.join(', ')
}

function tempResourceFromFile(file: File, objectUrl: string): RawResource {
  return {
    ID: -1,
    owner_id: 0,
    type: 'video',
    name: file.name,
    url: objectUrl,
    size: file.size,
    mime_type: file.type || 'video/mp4',
  }
}

async function buildLocalImportDrafts(
  resource: RawResource,
  metadata: ShotLibraryVideoMetadata,
  sourceData: ArrayBuffer,
): Promise<ShotImportDraft[]> {
  const analyzeShotCuts = typeof window === 'undefined' ? undefined : window.api?.analyzeShotCuts
  if (!analyzeShotCuts || !metadata.durationSec) return buildImportDrafts(resource, metadata)
  try {
    const result = await analyzeShotCuts({
      sourceData,
      sourceName: resource.name,
      durationSec: metadata.durationSec,
    })
    if (result.ok && result.shots?.length) {
      return buildImportDrafts(resource, metadata, result.shots)
    }
  } catch {
    // Fall through to deterministic local draft ranges when desktop scene detection is unavailable.
  }
  return buildImportDrafts(resource, metadata)
}

function buildImportDrafts(resource: RawResource, metadata: ShotLibraryVideoMetadata, ranges?: ShotCutRange[]): ShotImportDraft[] {
  const duration = metadata.durationSec && metadata.durationSec > 0 ? metadata.durationSec : undefined
  const normalizedRanges = ranges?.length ? ranges : undefined
  const segmentCount = normalizedRanges?.length ?? (duration ? Math.max(1, Math.ceil(duration / 6)) : 1)
  const segmentLength = duration ? duration / segmentCount : undefined
  return Array.from({ length: segmentCount }, (_, index) => {
    const range = normalizedRanges?.[index]
    const start = range ? roundTime(range.startSec) : segmentLength === undefined ? undefined : roundTime(index * segmentLength)
    const end = range ? roundTime(range.endSec) : segmentLength === undefined ? undefined : roundTime(index === segmentCount - 1 ? duration! : (index + 1) * segmentLength)
    const segmentDuration = start !== undefined && end !== undefined ? Math.max(0.1, end - start) : duration
    const analyzed = analyzeShotReference(resource, {
      name: resource.name,
      size: resource.size,
      type: resource.mime_type,
    }, {
      durationSec: segmentDuration,
      width: metadata.width,
      height: metadata.height,
    })
    const draft = detailDraftFromEntry({
      ...analyzed,
      order: index + 1,
      title: `${analyzed.title} · ${String(index + 1).padStart(2, '0')}`,
      startSec: start,
      endSec: end,
    })
    return {
      ...draft,
      id: `draft-${index + 1}`,
      order: index + 1,
      status: 'ready' as const,
      selected: true,
    }
  })
}

function importDraftToManualUpdate(draft: ShotImportDraft): ShotReferenceManualUpdate {
  return {
    title: draft.title,
    summary: draft.summary,
    intent: splitTags(draft.intent),
    pattern: splitTags(draft.pattern),
    shot_function: splitTags(draft.shotFunction),
    visual_preference: splitTags(draft.visualPreference),
    emotional_effect: splitTags(draft.emotionalEffect),
    start_sec: optionalNumber(draft.startSec),
    start_sec_set: true,
    end_sec: optionalNumber(draft.endSec),
    end_sec_set: true,
  }
}

function importPhaseLabel(phase: ShotImportPhase, t: (key: string) => string): string {
  return t(`pages.shotLibrary.importPhases.${phase}`)
}

function importProgressLabel(session: ShotImportSession, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (session.phase === 'preparing') {
    const suffix = session.progressPercent !== undefined ? ` · ${session.progressPercent}%` : ''
    return `${t('pages.shotLibrary.readingSource')}${suffix}`
  }
  if (session.phase === 'cutting') return t('pages.shotLibrary.cuttingShots')
  return t('pages.shotLibrary.importedShotCount', { count: session.drafts.filter(isDraftSelected).length })
}

function roundTime(value: number): number {
  return Math.round(value * 10) / 10
}

function splitTags(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function TagRow({ values, empty }: { values: Array<string | { value: string; category?: ShotLibrarySemanticCategory }>; empty?: string }) {
  const { i18n } = useTranslation()
  if (values.length === 0) return empty ? <span className="shot-library-page__muted">{empty}</span> : null
  return (
    <div className="shot-library-page__tags">
      {values.map((item) => {
        const value = typeof item === 'string' ? item : item.value
        const category = typeof item === 'string' ? undefined : item.category
        const label = category ? localizeShotSemanticValue(category, value, i18n.language) : value
        return (
          <StatusBadge key={`${category ?? 'value'}:${value}`} intent="neutral" emphasis="soft">{label}</StatusBadge>
        )
      })}
    </div>
  )
}

function resourceFromEntry(entry: ShotLibraryEntry): RawResource {
  return {
    ID: entry.resourceId,
    owner_id: 0,
    type: 'video',
    name: entry.resourceName,
    url: entry.resourceUrl,
    size: entry.size,
    mime_type: entry.mimeType,
  }
}

function shotEntryKey(entry: Pick<ShotLibraryEntry, 'sourceId' | 'ID'>): string {
  return `${entry.sourceId}:${entry.ID}`
}

function uploadErrorMessage(error: unknown, fallback: string): string {
  const responseError = (error as { response?: { data?: { error?: unknown; message?: unknown } } } | undefined)?.response?.data
  if (typeof responseError?.message === 'string') return responseError.message
  if (typeof responseError?.error === 'string') return responseError.error
  return error instanceof Error ? error.message : fallback
}

function formatDuration(value: number, language = '') {
  if (!Number.isFinite(value) || value <= 0) return '0s'
  if (language.toLowerCase().startsWith('zh')) {
    if (value < 60) return `${Math.round(value)} 秒`
    const minutes = Math.floor(value / 60)
    const seconds = Math.round(value % 60)
    return `${minutes} 分 ${seconds} 秒`
  }
  if (value < 60) return `${Math.round(value)}s`
  const minutes = Math.floor(value / 60)
  const seconds = Math.round(value % 60)
  return `${minutes}m ${seconds}s`
}
