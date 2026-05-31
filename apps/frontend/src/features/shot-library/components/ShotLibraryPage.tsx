import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clapperboard,
  Film,
  FolderOpen,
  Loader2,
  Pause,
  Pencil,
  Play,
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
  searchShotReferenceResults,
  type ShotLibraryEntry,
  type ShotLibraryFacetFilters,
  type ShotLibrarySource,
  type ShotLibrarySemanticCategory,
  type ShotLibraryVideoMetadata,
  type ShotSearchMatch,
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
  thumbnailUrl?: string
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
  targetGroupTitle?: string
}

interface ShotLibraryGroupOption {
  id: number
  sourceId: string
  title: string
}

type ShotTagSuggestions = Record<ShotLibrarySemanticCategory, string[]>

const RESOURCE_LIBRARY_PAGE_SIZE = 12
const SHOT_LIBRARY_PAGE_SIZE = 12
const VIDEO_METADATA_TIMEOUT_MS = 8000
const SHOT_IMPORT_DRAFT_REVEAL_DELAY_MS = 110
const SHOT_IMPORT_THUMBNAIL_WIDTH = 320
const EMPTY_FACET_FILTERS: ShotLibraryFacetFilters = {}

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
  const [facetFilters, setFacetFilters] = useState<ShotLibraryFacetFilters>(EMPTY_FACET_FILTERS)
  const [shotPage, setShotPage] = useState(1)

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
        group_title: session.targetGroupId ? undefined : session.targetGroupTitle?.trim() || undefined,
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
  const searchResults = useMemo(() => searchShotReferenceResults(sourceFilteredEntries, query, facetFilters), [sourceFilteredEntries, query, facetFilters])
  const visibleEntries = useMemo(() => searchResults.map(result => result.entry), [searchResults])
  const shotPageCount = Math.max(1, Math.ceil(visibleEntries.length / SHOT_LIBRARY_PAGE_SIZE))
  const normalizedShotPage = Math.min(shotPage, shotPageCount)
  const pagedVisibleEntries = useMemo(
    () => visibleEntries.slice((normalizedShotPage - 1) * SHOT_LIBRARY_PAGE_SIZE, normalizedShotPage * SHOT_LIBRARY_PAGE_SIZE),
    [normalizedShotPage, visibleEntries],
  )
  const selected = visibleEntries.find(entry => shotEntryKey(entry) === selectedKey) ?? visibleEntries[0] ?? sourceFilteredEntries[0]
  const selectedMatch = selected ? searchResults.find(result => shotEntryKey(result.entry) === shotEntryKey(selected)) : undefined
  const totalDuration = entries.reduce((sum, entry) => sum + (entry.executionDetails.durationSec ?? 0), 0)
  const tagSuggestions = useMemo(() => buildShotTagSuggestions(entries), [entries])
  const facetOptions = useMemo(() => buildShotFacetOptions(sourceFilteredEntries), [sourceFilteredEntries])
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

  useEffect(() => {
    setShotPage(1)
  }, [activeSourceId, facetFilters, query])

  useEffect(() => {
    setShotPage(current => Math.min(current, shotPageCount))
  }, [shotPageCount])

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
      targetGroupTitle: defaultImportGroupTitle(file.name),
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
      const drafts = await buildImportDraftsWithThumbnails(resource, metadata, sourceData, objectUrl)
      await revealImportDrafts(sourceKey, metadata, drafts)
    } catch (error) {
      const drafts = await buildImportDraftThumbnails(objectUrl, buildImportDrafts(resource, metadata))
      await revealImportDrafts(sourceKey, metadata, drafts, uploadErrorMessage(error, t('pages.shotLibrary.uploadFailed')))
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
      targetGroupTitle: defaultImportGroupTitle(resource.name),
    })
    let metadata: ShotLibraryVideoMetadata = {}
    let thumbnailObjectUrl: string | undefined
    try {
      const blob = await loadResourceVideoBlob(resource, (progressPercent) => {
        setImportSession(current => current?.sourceKey === sourceKey ? {
          ...current,
          progressPercent,
        } : current)
      })
      thumbnailObjectUrl = URL.createObjectURL(blob)
      metadata = await loadVideoMetadataFromObjectUrl(thumbnailObjectUrl, () => {})
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
      const drafts = await buildImportDraftsWithThumbnails(resource, metadata, sourceData, thumbnailObjectUrl)
      await revealImportDrafts(sourceKey, metadata, drafts)
    } catch (error) {
      const drafts = thumbnailObjectUrl
        ? await buildImportDraftThumbnails(thumbnailObjectUrl, buildImportDrafts(resource, metadata))
        : buildImportDrafts(resource, metadata)
      await revealImportDrafts(sourceKey, metadata, drafts, uploadErrorMessage(error, t('pages.shotLibrary.uploadFailed')))
    } finally {
      if (thumbnailObjectUrl) URL.revokeObjectURL(thumbnailObjectUrl)
    }
  }

  async function revealImportDrafts(sourceKey: string, metadata: ShotLibraryVideoMetadata, drafts: ShotImportDraft[], error?: string) {
    setImportSession(current => current?.sourceKey === sourceKey ? {
      ...current,
      metadata,
      phase: 'review',
      drafts: [],
      activeDraftId: undefined,
      error,
      progressPercent: undefined,
    } : current)
    for (const draft of drafts) {
      await delay(SHOT_IMPORT_DRAFT_REVEAL_DELAY_MS)
      setImportSession(current => current?.sourceKey === sourceKey ? {
        ...current,
        phase: 'review',
        drafts: [...current.drafts, draft],
        activeDraftId: current.activeDraftId ?? draft.id,
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

      <section className="shot-library-page__toolbar">
        <div className="shot-library-page__toolbar-row">
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
        </div>
        <div className="shot-library-page__toolbar-row">
          <ShotFacetFilters
            options={facetOptions}
            value={facetFilters}
            onChange={setFacetFilters}
          />
        </div>
      </section>

      <section className="shot-library-page__body">
        <div className="shot-library-page__library">
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
            <div className="shot-library-page__browser">
              <div className="shot-library-page__grid">
                {pagedVisibleEntries.map(entry => (
                  <ShotReferenceCard
                    key={shotEntryKey(entry)}
                    entry={entry}
                    active={shotEntryKey(entry) === (selected ? shotEntryKey(selected) : '')}
                    onSelect={() => setSelectedKey(shotEntryKey(entry))}
                  />
                ))}
              </div>
              {visibleEntries.length > SHOT_LIBRARY_PAGE_SIZE ? (
                <div className="shot-library-page__pager">
                  <span>{t('pages.shotLibrary.libraryPageStatus', { page: normalizedShotPage, total: shotPageCount })}</span>
                  <div>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      disabled={normalizedShotPage <= 1}
                      onClick={() => setShotPage(page => Math.max(1, page - 1))}
                      aria-label={t('pages.resources.previousPage')}
                      title={t('pages.resources.previousPage')}
                    >
                      <ChevronLeft size={14} />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      disabled={normalizedShotPage >= shotPageCount}
                      onClick={() => setShotPage(page => Math.min(shotPageCount, page + 1))}
                      aria-label={t('pages.resources.nextPage')}
                      title={t('pages.resources.nextPage')}
                    >
                      <ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              ) : null}
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
              match={selectedMatch?.matches ?? []}
              score={selectedMatch?.score ?? 0}
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
        onTargetGroupTitle={(targetGroupTitle) => setImportSession(current => current ? { ...current, targetGroupTitle } : current)}
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

type ShotFacetCategory = keyof Required<ShotLibraryFacetFilters>
type ShotFacetOptions = Record<ShotFacetCategory, string[]>

function ShotFacetFilters({
  options,
  value,
  onChange,
}: {
  options: ShotFacetOptions
  value: ShotLibraryFacetFilters
  onChange: (value: ShotLibraryFacetFilters) => void
}) {
  const { t } = useTranslation()
  const categories: ShotFacetCategory[] = ['visual', 'narrative', 'emotion', 'pattern', 'production']
  const hasActive = categories.some(category => (value[category] ?? []).length > 0)
  return (
    <div className="shot-library-facets">
      {categories.map(category => (
        <label key={category} className="shot-library-facets__field">
          <span>{t(`pages.shotLibrary.facets.${category}`)}</span>
          <select
            value={(value[category] ?? [])[0] ?? ''}
            onChange={event => onChange(setFacetValue(value, category, event.target.value))}
          >
            <option value="">{t('pages.shotLibrary.allFacetValues')}</option>
            {options[category].slice(0, 80).map(option => (
              <option key={`${category}:${option}`} value={option}>{option}</option>
            ))}
          </select>
        </label>
      ))}
      {hasActive ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(EMPTY_FACET_FILTERS)}>
          <X size={14} />
          {t('pages.shotLibrary.clearFilters')}
        </Button>
      ) : null}
    </div>
  )
}

function setFacetValue(filters: ShotLibraryFacetFilters, category: ShotFacetCategory, selected: string): ShotLibraryFacetFilters {
  return {
    ...filters,
    [category]: selected ? [selected] : [],
  }
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
  onTargetGroupTitle,
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
  onTargetGroupTitle: (title: string) => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const activeDraft = session?.drafts.find(draft => draft.id === session.activeDraftId) ?? session?.drafts[0]
  const canConfirm = Boolean(uploadSource && session?.phase === 'review' && session.drafts.some(isDraftSelected))
  const draftGridRef = useRef<HTMLDivElement | null>(null)
  const [draftPage, setDraftPage] = useState(0)
  const draftGridMetrics = useShotDraftGridMetrics(draftGridRef, session?.drafts.length ?? 0)
  const previewAspectRatio = normalizedCssAspectRatio(session?.metadata.width ?? 0, session?.metadata.height ?? 0) ?? '16 / 9'
  const draftGridStyle = useMemo(() => ({
    '--shot-import-draft-columns': String(draftGridMetrics.columns),
  }) as CSSProperties, [draftGridMetrics.columns])
  const drafts = session?.drafts ?? []
  const draftPageSize = Math.max(4, draftGridMetrics.pageSize)
  const draftPageCount = Math.max(1, Math.ceil(drafts.length / draftPageSize))
  const normalizedDraftPage = Math.min(draftPage, draftPageCount - 1)
  const pagedDrafts = drafts.slice(normalizedDraftPage * draftPageSize, normalizedDraftPage * draftPageSize + draftPageSize)

  useEffect(() => {
    setDraftPage(current => Math.min(current, Math.max(0, draftPageCount - 1)))
  }, [draftPageCount])

  useEffect(() => {
    if (!activeDraft) return
    const activeIndex = drafts.findIndex(draft => draft.id === activeDraft.id)
    if (activeIndex < 0) return
    const activePage = Math.floor(activeIndex / draftPageSize)
    setDraftPage(activePage)
  }, [activeDraft?.id, draftPageSize, drafts])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSaving && onOpenChange(nextOpen)}>
      <DialogContent className="shot-import-dialog">
        <DialogHeader className="shot-import-dialog__header">
          <div className="shot-import-dialog__title-row">
            <DialogTitle>{t('pages.shotLibrary.importDialogTitle')}</DialogTitle>
            {session ? <span title={session.sourceName}>{session.sourceName}</span> : null}
          </div>
          {session ? null : (
            <DialogDescription>
              {t('pages.shotLibrary.importDialogDescription')}
            </DialogDescription>
          )}
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
            {session ? (
              <div className="shot-import-dialog__group-editor">
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
                {session.targetGroupId ? null : (
                  <label className="shot-import-dialog__group-name">
                    <FolderOpen size={14} />
                    <Input
                      value={session.targetGroupTitle ?? ''}
                      disabled={isSaving}
                      placeholder={t('pages.shotLibrary.newGroupNamePlaceholder')}
                      aria-label={t('pages.shotLibrary.newGroupName')}
                      onChange={event => onTargetGroupTitle(event.target.value)}
                    />
                  </label>
                )}
              </div>
            ) : null}
          </aside>

          <section className="shot-import-dialog__review-pane">
            {session ? (
              <>
                <div
                  className="shot-import-dialog__preview"
                  style={{ '--shot-import-preview-aspect-ratio': previewAspectRatio } as CSSProperties}
                >
                  <ShotDraftClipPlayer resource={session.sourceResource} draft={activeDraft} />
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
                  <div className="shot-import-dialog__draft-browser">
                    <div ref={draftGridRef} className="shot-import-dialog__draft-grid" style={draftGridStyle}>
                    {session.drafts.length === 0 ? (
                      <div className="shot-import-dialog__empty">
                        {session.phase === 'preparing' ? <Loader2 size={16} /> : <Scissors size={16} />}
                        <span>{session.phase === 'preparing' ? t('pages.shotLibrary.readingSource') : t('pages.shotLibrary.cuttingShots')}</span>
                      </div>
                    ) : pagedDrafts.map(draft => (
                      <button
                        key={draft.id}
                        type="button"
                        className={cn('shot-import-dialog__draft-card', activeDraft?.id === draft.id && 'shot-import-dialog__draft-card--active')}
                        onClick={() => onSelectDraft(draft.id)}
                      >
                        <span
                          className="shot-import-dialog__draft-thumb"
                          style={{ '--shot-import-draft-aspect-ratio': previewAspectRatio } as CSSProperties}
                        >
                          {draft.thumbnailUrl ? <img src={draft.thumbnailUrl} alt="" /> : <Film size={18} />}
                          <span>{formatDraftRange(draft)}</span>
                        </span>
                        <span className="shot-import-dialog__draft-card-body">
                          <span className="shot-import-dialog__draft-card-topline">
                            <span>{String(draft.order).padStart(2, '0')}</span>
                            {draft.status === 'ready' ? <CheckCircle2 size={14} /> : <Loader2 size={14} />}
                          </span>
                          <strong>{draft.title}</strong>
                        </span>
                        <span className="shot-import-dialog__draft-include" onClick={event => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isDraftSelected(draft)}
                            disabled={isSaving}
                            onChange={event => onToggleDraft(draft.id, event.currentTarget.checked)}
                            aria-label={t('pages.shotLibrary.includeShot')}
                          />
                        </span>
                      </button>
                    ))}
                    </div>
                    {drafts.length > draftPageSize ? (
                      <div className="shot-import-dialog__draft-pager">
                        <span>{t('pages.shotLibrary.storyboardPageStatus', { page: normalizedDraftPage + 1, total: draftPageCount })}</span>
                        <div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={normalizedDraftPage <= 0}
                            onClick={() => setDraftPage(page => Math.max(0, page - 1))}
                          >
                            {t('pages.resources.previousPage')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={normalizedDraftPage >= draftPageCount - 1}
                            onClick={() => setDraftPage(page => Math.min(draftPageCount - 1, page + 1))}
                          >
                            {t('pages.resources.nextPage')}
                          </Button>
                        </div>
                      </div>
                    ) : null}
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

function useShotDraftGridMetrics(gridRef: RefObject<HTMLElement>, draftCount: number): { columns: number; pageSize: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = gridRef.current
    if (!element) return
    const update = () => {
      const rect = element.getBoundingClientRect()
      setSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }
    update()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update)
      observer.observe(element)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [gridRef])

  return calculateShotDraftGridMetrics(size.width, size.height, draftCount)
}

function calculateShotDraftGridMetrics(width: number, height: number, draftCount: number): { columns: number; pageSize: number } {
  if (draftCount <= 0) return { columns: 1, pageSize: 1 }
  if (width <= 0) return { columns: Math.min(draftCount, 2), pageSize: Math.min(draftCount, 2) }
  const gap = 10
  const minimumCardWidth = width < 520 ? 190 : 220
  const preferredCardWidth = width >= 920 ? 300 : width >= 680 ? 260 : 230
  let columns = Math.max(1, Math.floor((width + gap) / (preferredCardWidth + gap)))
  columns = Math.min(columns, draftCount)
  while (columns > 1 && (width - gap * (columns - 1)) / columns < minimumCardWidth) {
    columns -= 1
  }
  while (
    columns < draftCount
    && columns < 4
    && (width - gap * columns) / (columns + 1) >= minimumCardWidth
    && (width - gap * (columns - 1)) / columns > 360
  ) {
    columns += 1
  }
  columns = Math.max(1, columns)
  const cardWidth = (width - gap * (columns - 1)) / columns
  const estimatedCardHeight = (cardWidth * 9 / 16) + 54
  const rows = height > 0 ? Math.max(1, Math.floor((height + gap) / (estimatedCardHeight + gap))) : 1
  return {
    columns,
    pageSize: Math.max(1, columns * Math.min(rows, 2)),
  }
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

function ShotDraftClipPlayer({
  resource,
  draft,
  onAspectRatio,
}: {
  resource: RawResource
  draft?: ShotImportDraft
  onAspectRatio?: (aspectRatio: string) => void
}) {
  const { t, i18n } = useTranslation()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [ready, setReady] = useState(false)
  const startSec = draft ? optionalNumber(draft.startSec) ?? 0 : 0
  const endSec = draft ? optionalNumber(draft.endSec) : undefined
  const previewKey = `${resource.ID}:${draft?.id ?? 'source'}:${startSec}:${endSec ?? ''}`
  const clipDuration = draftRangeDuration(draft)

  const seekToStart = (video: HTMLVideoElement) => {
    if (!Number.isFinite(startSec)) return
    const duration = Number.isFinite(video.duration) ? video.duration : undefined
    const target = duration === undefined ? startSec : Math.min(startSec, Math.max(0, duration - 0.05))
    if (Math.abs(video.currentTime - target) > 0.15) video.currentTime = target
    updateClipProgress(video)
  }

  const withinDraftRange = (video: HTMLVideoElement) => {
    if (video.currentTime < startSec - 0.15) return false
    if (endSec !== undefined && video.currentTime >= endSec) return false
    return true
  }

  const currentClipDuration = (video: HTMLVideoElement) => {
    if (endSec !== undefined) return Math.max(0.1, endSec - startSec)
    const duration = Number.isFinite(video.duration) ? video.duration : undefined
    return duration === undefined ? clipDuration : Math.max(0.1, duration - startSec)
  }

  const updateClipProgress = (video: HTMLVideoElement) => {
    const duration = currentClipDuration(video)
    const elapsed = Math.max(0, Math.min(duration, video.currentTime - startSec))
    setProgress(duration > 0 ? elapsed / duration : 0)
  }

  useEffect(() => {
    setPlaying(false)
    setProgress(0)
    setReady(false)
  }, [previewKey])

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video || !ready) return
    if (playing) {
      video.pause()
      return
    }
    if (!withinDraftRange(video)) seekToStart(video)
    await video.play().catch(() => setPlaying(false))
  }

  const seekClipProgress = (nextProgress: number) => {
    const video = videoRef.current
    if (!video) return
    const duration = currentClipDuration(video)
    video.currentTime = startSec + duration * nextProgress
    setProgress(nextProgress)
  }

  return (
    <div className="shot-import-clip-player">
      <AuthedVideo
        ref={videoRef}
        key={previewKey}
        className="shot-import-dialog__preview-video"
        src={resolveResourceUrl(resource)}
        playsInline
        preload="metadata"
        diagnosticLabel={`shot-import:${resource.ID}:${draft?.id ?? 'source'}`}
        onLoadedMetadata={event => {
          setReady(true)
          const aspectRatio = videoElementAspectRatio(event.currentTarget)
          if (aspectRatio) onAspectRatio?.(aspectRatio)
          seekToStart(event.currentTarget)
        }}
        onPlay={event => {
          setPlaying(true)
          if (!withinDraftRange(event.currentTarget)) seekToStart(event.currentTarget)
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={event => {
          const video = event.currentTarget
          if (endSec !== undefined && video.currentTime >= endSec) {
            video.pause()
            seekToStart(video)
            return
          }
          updateClipProgress(video)
        }}
      />
      <div className="shot-import-clip-player__controls">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          onClick={togglePlayback}
          disabled={!ready || !draft}
          aria-label={playing ? t('pages.shotLibrary.pauseShot') : t('pages.shotLibrary.playShot')}
          title={playing ? t('pages.shotLibrary.pauseShot') : t('pages.shotLibrary.playShot')}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </Button>
        <input
          type="range"
          min="0"
          max="1000"
          value={Math.round(progress * 1000)}
          disabled={!ready || !draft}
          onChange={event => seekClipProgress(Number(event.currentTarget.value) / 1000)}
          aria-label={t('pages.shotLibrary.clipProgress')}
        />
        <span>{formatClipProgress(progress, clipDuration, i18n.language)}</span>
      </div>
    </div>
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
      <StructuredShotEditor draft={draft} disabled={disabled} onChange={onChange} />
    </div>
  )
}

function ShotReferenceCard({ entry, active, onSelect }: { entry: ShotLibraryEntry; active: boolean; onSelect: () => void }) {
  const [detectedAspectRatio, setDetectedAspectRatio] = useState<string>()
  return (
    <button
      type="button"
      className={cn('shot-reference-card', active && 'shot-reference-card--active')}
      onClick={onSelect}
      title={entry.title}
      aria-label={entry.title}
    >
      <div
        className="shot-reference-card__media"
        style={{ '--shot-reference-aspect-ratio': detectedAspectRatio ?? shotReferenceAspectRatio(entry) } as CSSProperties}
      >
        <MediaViewer
          resource={resourceFromEntry(entry)}
          fit="cover"
          lightbox={false}
          onVideoLoadedMetadata={event => {
            const aspectRatio = videoElementAspectRatio(event.currentTarget)
            if (aspectRatio) setDetectedAspectRatio(aspectRatio)
          }}
        />
      </div>
    </button>
  )
}

function shotReferenceAspectRatio(entry: ShotLibraryEntry): string {
  const fromAspectRatio = parseAspectRatio(entry.executionDetails.aspectRatio)
  if (fromAspectRatio) return fromAspectRatio
  const fromResolution = parseResolutionAspectRatio(entry.executionDetails.resolution)
  if (fromResolution) return fromResolution
  return '16 / 9'
}

function parseAspectRatio(value: string | undefined): string | undefined {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/)
  if (!match) return undefined
  return normalizedCssAspectRatio(Number(match[1]), Number(match[2]))
}

function parseResolutionAspectRatio(value: string | undefined): string | undefined {
  const match = value?.trim().match(/^(\d+)\s*x\s*(\d+)$/i)
  if (!match) return undefined
  return normalizedCssAspectRatio(Number(match[1]), Number(match[2]))
}

function normalizedCssAspectRatio(width: number, height: number): string | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined
  const ratio = width / height
  if (ratio < 0.25 || ratio > 4) return undefined
  return `${width} / ${height}`
}

function videoElementAspectRatio(video: HTMLVideoElement): string | undefined {
  return normalizedCssAspectRatio(video.videoWidth, video.videoHeight)
}

function shotClipDraftFromEntry(entry: ShotLibraryEntry): ShotImportDraft {
  return {
    ...detailDraftFromEntry(entry),
    id: shotEntryKey(entry),
    order: entry.order || 1,
    status: 'ready',
    selected: true,
  }
}

function ShotReferenceDetail({
  entry,
  tagSuggestions,
  deleting,
  saving,
  canDelete,
  match,
  score,
  onDelete,
  onSave,
}: {
  entry: ShotLibraryEntry
  tagSuggestions: ShotTagSuggestions
  deleting: boolean
  saving: boolean
  canDelete: boolean
  match: ShotSearchMatch[]
  score: number
  onDelete: () => void
  onSave: (input: ShotReferenceManualUpdate) => void
}) {
  const { t, i18n } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => detailDraftFromEntry(entry))
  const [detectedAspectRatio, setDetectedAspectRatio] = useState<string>()
  const draftKey = shotEntryKey(entry)
  useEffect(() => {
    setDraft(detailDraftFromEntry(entry))
    setEditing(false)
    setDetectedAspectRatio(undefined)
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
      execution_details: executionDetailsFromDraft(draft, entry),
      visual_analysis: visualAnalysisFromDraft(draft),
      scene_semantics: sceneSemanticsFromDraft(draft),
      narrative_function: narrativeFunctionFromDraft(draft),
      emotional_profile: emotionalProfileFromDraft(draft),
      reusable_pattern: reusablePatternFromDraft(draft),
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
        <SearchMatchPanel score={score} matches={match} />
        <div
          className="shot-library-page__preview"
          style={{ '--shot-reference-aspect-ratio': detectedAspectRatio ?? shotReferenceAspectRatio(entry) } as CSSProperties}
        >
          <ShotDraftClipPlayer
            resource={resourceFromEntry(entry)}
            draft={shotClipDraftFromEntry(entry)}
            onAspectRatio={setDetectedAspectRatio}
          />
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
            <StructuredShotEditor draft={draft} onChange={patch => setDraft(current => ({ ...current, ...patch }))} />
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
            <DetailGroup title={t('pages.shotLibrary.visualAnalysis')} values={visualAnalysisDetails(entry).map(value => ({ value }))} />
            <DetailGroup title={t('pages.shotLibrary.narrativeFunction')} values={narrativeFunctionDetails(entry).map(value => ({ value }))} />
            <DetailGroup title={t('pages.shotLibrary.sceneSemantics')} values={sceneSemanticsDetails(entry).map(value => ({ value }))} />
            <DetailGroup title={t('pages.shotLibrary.reusablePattern')} values={reusablePatternDetails(entry).map(value => ({ value }))} />
            <DetailGroup title={t('pages.shotLibrary.searchIndex')} values={searchIndexDetails(entry).map(value => ({ value }))} />
            <DetailGroup title={t('pages.shotLibrary.executionDetails')} values={[
              entry.startSec !== undefined ? `${t('pages.shotLibrary.startSec')}: ${entry.startSec}` : '',
              entry.endSec !== undefined ? `${t('pages.shotLibrary.endSec')}: ${entry.endSec}` : '',
              entry.executionDetails.durationSec ? `${t('pages.shotLibrary.duration')}: ${formatDuration(entry.executionDetails.durationSec, i18n.language)}` : '',
              entry.executionDetails.resolution ? `${t('pages.shotLibrary.resolution')}: ${entry.executionDetails.resolution}` : '',
              entry.executionDetails.aspectRatio ? `${t('pages.shotLibrary.aspectRatio')}: ${entry.executionDetails.aspectRatio}` : '',
              entry.executionDetails.coverageRole ? `${t('pages.shotLibrary.coverageRole')}: ${entry.executionDetails.coverageRole}` : '',
              entry.executionDetails.transitionIn ? `${t('pages.shotLibrary.transitionIn')}: ${entry.executionDetails.transitionIn}` : '',
              entry.executionDetails.transitionOut ? `${t('pages.shotLibrary.transitionOut')}: ${entry.executionDetails.transitionOut}` : '',
              entry.executionDetails.difficulty ? `${t('pages.shotLibrary.difficulty')}: ${entry.executionDetails.difficulty}` : '',
              entry.executionDetails.blocking ? `${t('pages.shotLibrary.blocking')}: ${entry.executionDetails.blocking}` : '',
              ...(entry.executionDetails.requirements ?? []).map(value => `${t('pages.shotLibrary.requirement')}: ${value}`),
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

function SearchMatchPanel({ score, matches }: { score: number; matches: ShotSearchMatch[] }) {
  const { t } = useTranslation()
  if (score <= 0 && matches.length === 0) return null
  return (
    <section className="shot-library-page__match-panel">
      <h2>{t('pages.shotLibrary.matchReason')}</h2>
      <div className="shot-library-page__match-score">{t('pages.shotLibrary.matchScore', { score })}</div>
      <TagRow
        values={matches.map(match => ({
          value: `${match.category}: ${match.term ? `${match.term} -> ` : ''}${match.value}`,
        }))}
        empty="-"
      />
    </section>
  )
}

function StructuredShotEditor({
  draft,
  disabled = false,
  onChange,
}: {
  draft: ReturnType<typeof detailDraftFromEntry>
  disabled?: boolean
  onChange: (patch: Partial<ReturnType<typeof detailDraftFromEntry>>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="shot-library-structured-editor">
      <h2>{t('pages.shotLibrary.structuredAnnotation')}</h2>
      <div className="shot-library-manual-form__grid">
        <TextDraftField label="shot_size" value={draft.shotSize} disabled={disabled} onChange={value => onChange({ shotSize: value })} />
        <TextDraftField label="camera_angle" value={draft.cameraAngle} disabled={disabled} onChange={value => onChange({ cameraAngle: value })} />
        <TextDraftField label="camera_height" value={draft.cameraHeight} disabled={disabled} onChange={value => onChange({ cameraHeight: value })} />
        <TextDraftField label="camera_movement.type" value={draft.cameraMovementType} disabled={disabled} onChange={value => onChange({ cameraMovementType: value })} />
        <TextDraftField label="camera_movement.speed" value={draft.cameraMovementSpeed} disabled={disabled} onChange={value => onChange({ cameraMovementSpeed: value })} />
        <TextDraftField label="camera_movement.stability" value={draft.cameraMovementStability} disabled={disabled} onChange={value => onChange({ cameraMovementStability: value })} />
        <TextDraftField label="camera_movement.motivation" value={draft.cameraMovementMotivation} disabled={disabled} onChange={value => onChange({ cameraMovementMotivation: value })} />
        <TextDraftField label="lens.focal_length_class" value={draft.lensFocalLength} disabled={disabled} onChange={value => onChange({ lensFocalLength: value })} />
        <TextDraftField label="lens.depth_of_field" value={draft.lensDepthOfField} disabled={disabled} onChange={value => onChange({ lensDepthOfField: value })} />
        <TextDraftField label="focus.behavior" value={draft.focusBehavior} disabled={disabled} onChange={value => onChange({ focusBehavior: value })} />
        <TextDraftField label="lighting.style" value={draft.lightingStyle} disabled={disabled} onChange={value => onChange({ lightingStyle: value })} />
        <TextDraftField label="lighting.contrast" value={draft.lightingContrast} disabled={disabled} onChange={value => onChange({ lightingContrast: value })} />
        <TextDraftField label="color.palette" value={draft.colorPalette} disabled={disabled} onChange={value => onChange({ colorPalette: value })} />
        <TextDraftField label="color.saturation" value={draft.colorSaturation} disabled={disabled} onChange={value => onChange({ colorSaturation: value })} />
        <TextDraftField label="environment.location_type" value={draft.environmentLocationType} disabled={disabled} onChange={value => onChange({ environmentLocationType: value })} />
        <TextDraftField label="narrative.primary" value={draft.narrativePrimary} disabled={disabled} onChange={value => onChange({ narrativePrimary: value })} />
        <TextDraftField label="narrative.information_state" value={draft.informationState} disabled={disabled} onChange={value => onChange({ informationState: value })} />
        <TextDraftField label="scene.scene_type" value={draft.sceneType} disabled={disabled} onChange={value => onChange({ sceneType: value })} />
        <TextDraftField label="scene.location_type" value={draft.sceneLocationType} disabled={disabled} onChange={value => onChange({ sceneLocationType: value })} />
        <TextDraftField label="scene.conflict_level" value={draft.conflictLevel} disabled={disabled} onChange={value => onChange({ conflictLevel: value })} />
        <TextDraftField label="emotion.valence" value={draft.emotionValence} disabled={disabled} onChange={value => onChange({ emotionValence: value })} />
        <TextDraftField label="emotion.arousal" value={draft.emotionArousal} disabled={disabled} onChange={value => onChange({ emotionArousal: value })} />
        <TextDraftField label="emotion.viewer_position" value={draft.viewerPosition} disabled={disabled} onChange={value => onChange({ viewerPosition: value })} />
        <TextDraftField label="execution.coverage_role" value={draft.coverageRole} disabled={disabled} onChange={value => onChange({ coverageRole: value })} />
        <TextDraftField label="execution.difficulty" value={draft.difficulty} disabled={disabled} onChange={value => onChange({ difficulty: value })} />
      </div>
      <TextDraftField label="framing" value={draft.framing} disabled={disabled} onChange={value => onChange({ framing: value })} />
      <TextDraftField label="composition" value={draft.composition} disabled={disabled} onChange={value => onChange({ composition: value })} />
      <TextDraftField label="lens.optical_effects" value={draft.opticalEffects} disabled={disabled} onChange={value => onChange({ opticalEffects: value })} />
      <TextDraftField label="environment.spatial_feeling" value={draft.spatialFeeling} disabled={disabled} onChange={value => onChange({ spatialFeeling: value })} />
      <TextDraftField label="scene.genre" value={draft.genre} disabled={disabled} onChange={value => onChange({ genre: value })} />
      <TextDraftField label="narrative.secondary" value={draft.narrativeSecondary} disabled={disabled} onChange={value => onChange({ narrativeSecondary: value })} />
      <TextDraftField label="emotion.names" value={draft.emotionNames} disabled={disabled} onChange={value => onChange({ emotionNames: value })} />
      <TextDraftField label="reusable.pattern_ids" value={draft.patternIds} disabled={disabled} onChange={value => onChange({ patternIds: value })} />
      <ManualField label="reusable.principle">
        <Textarea value={draft.reusablePrinciple} disabled={disabled} rows={3} onChange={event => onChange({ reusablePrinciple: event.target.value })} />
      </ManualField>
      <TextDraftField label="reusable.works_when" value={draft.worksWhen} disabled={disabled} onChange={value => onChange({ worksWhen: value })} />
      <TextDraftField label="reusable.avoid_when" value={draft.avoidWhen} disabled={disabled} onChange={value => onChange({ avoidWhen: value })} />
      <TextDraftField label="execution.requirements" value={draft.requirements} disabled={disabled} onChange={value => onChange({ requirements: value })} />
      <ManualField label="execution.blocking">
        <Textarea value={draft.blocking} disabled={disabled} rows={2} onChange={event => onChange({ blocking: event.target.value })} />
      </ManualField>
    </div>
  )
}

function TextDraftField({ label, value, disabled = false, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <ManualField label={label}>
      <Input value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
    </ManualField>
  )
}

function visualAnalysisDetails(entry: ShotLibraryEntry): string[] {
  const visual = entry.visualAnalysis
  return [
    labeledValue('shot_size', visual.shot_size),
    labeledValue('camera_angle', visual.camera_angle),
    labeledValue('camera_height', visual.camera_height),
    labeledValue('framing', visual.framing?.join(', ')),
    labeledValue('composition', visual.composition?.join(', ')),
    labeledValue('lens', [visual.lens?.focal_length_class, visual.lens?.depth_of_field, ...(visual.lens?.optical_effects ?? [])].filter(Boolean).join(', ')),
    labeledValue('focus', [visual.focus?.behavior, visual.focus?.initial_focus, visual.focus?.final_focus].filter(Boolean).join(' -> ')),
    labeledValue('movement', [visual.camera_movement?.type, visual.camera_movement?.speed, visual.camera_movement?.stability, visual.camera_movement?.motivation].filter(Boolean).join(', ')),
    labeledValue('lighting', [visual.lighting?.style, visual.lighting?.contrast, visual.lighting?.direction].filter(Boolean).join(', ')),
    labeledValue('color', [visual.color?.palette, visual.color?.contrast, visual.color?.saturation].filter(Boolean).join(', ')),
    labeledValue('environment', [visual.environment?.location_type, ...(visual.environment?.spatial_feeling ?? [])].filter(Boolean).join(', ')),
    ...(visual.characters ?? []).map((character, index) => labeledValue(`character_${index + 1}`, [character.role, character.visibility, character.expression, character.action].filter(Boolean).join(', '))),
  ].filter(Boolean)
}

function narrativeFunctionDetails(entry: ShotLibraryEntry): string[] {
  const fn = entry.narrativeFunction
  return [
    labeledValue('primary', fn.primary),
    labeledValue('secondary', fn.secondary?.join(', ')),
    labeledValue('information_state', fn.information_state),
    labeledValue('sequence_position', fn.sequence_position),
    labeledValue('relation_to_previous', fn.relation_to_previous),
    labeledValue('relation_to_next', fn.relation_to_next),
  ].filter(Boolean)
}

function sceneSemanticsDetails(entry: ShotLibraryEntry): string[] {
  const semantics = entry.sceneSemantics
  return [
    labeledValue('genre', semantics.genre?.join(', ')),
    labeledValue('scene_type', semantics.scene_type),
    labeledValue('location_type', semantics.location_type),
    labeledValue('relationship_state', semantics.relationship_state),
    labeledValue('conflict_level', semantics.conflict_level),
    labeledValue('story_beat', semantics.story_beat),
    labeledValue('production_scale', semantics.production_scale),
  ].filter(Boolean)
}

function reusablePatternDetails(entry: ShotLibraryEntry): string[] {
  const pattern = entry.reusablePattern
  return [
    labeledValue('principle', pattern.principle),
    labeledValue('pattern_ids', pattern.pattern_ids?.join(', ')),
    ...(pattern.works_when ?? []).map(value => labeledValue('works_when', value)),
    ...(pattern.avoid_when ?? []).map(value => labeledValue('avoid_when', value)),
    ...Object.entries(pattern.variables ?? {}).map(([key, value]) => labeledValue(key, value)),
  ].filter(Boolean)
}

function searchIndexDetails(entry: ShotLibraryEntry): string[] {
  const index = entry.searchIndex
  return [
    labeledValue('queries', index.natural_language_queries?.slice(0, 4).join(' | ')),
    labeledValue('visual_facets', index.visual_facets?.slice(0, 8).join(', ')),
    labeledValue('narrative_facets', index.narrative_facets?.slice(0, 8).join(', ')),
    labeledValue('emotion_facets', index.emotion_facets?.slice(0, 8).join(', ')),
    labeledValue('pattern_facets', index.pattern_facets?.slice(0, 8).join(', ')),
  ].filter(Boolean)
}

function labeledValue(label: string, value?: string): string {
  return value && value.trim() ? `${label}: ${value}` : ''
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
    resolution: entry.executionDetails.resolution ?? '',
    aspectRatio: entry.executionDetails.aspectRatio ?? '',
    shotSize: entry.visualAnalysis.shot_size ?? '',
    framing: (entry.visualAnalysis.framing ?? []).join(', '),
    composition: (entry.visualAnalysis.composition ?? []).join(', '),
    cameraAngle: entry.visualAnalysis.camera_angle ?? '',
    cameraHeight: entry.visualAnalysis.camera_height ?? '',
    lensFocalLength: entry.visualAnalysis.lens?.focal_length_class ?? '',
    lensDepthOfField: entry.visualAnalysis.lens?.depth_of_field ?? '',
    opticalEffects: (entry.visualAnalysis.lens?.optical_effects ?? []).join(', '),
    focusBehavior: entry.visualAnalysis.focus?.behavior ?? '',
    cameraMovementType: entry.visualAnalysis.camera_movement?.type ?? '',
    cameraMovementSpeed: entry.visualAnalysis.camera_movement?.speed ?? '',
    cameraMovementStability: entry.visualAnalysis.camera_movement?.stability ?? '',
    cameraMovementMotivation: entry.visualAnalysis.camera_movement?.motivation ?? '',
    lightingStyle: entry.visualAnalysis.lighting?.style ?? '',
    lightingContrast: entry.visualAnalysis.lighting?.contrast ?? '',
    colorPalette: entry.visualAnalysis.color?.palette ?? '',
    colorSaturation: entry.visualAnalysis.color?.saturation ?? '',
    environmentLocationType: entry.visualAnalysis.environment?.location_type ?? '',
    spatialFeeling: (entry.visualAnalysis.environment?.spatial_feeling ?? []).join(', '),
    genre: (entry.sceneSemantics.genre ?? []).join(', '),
    sceneType: entry.sceneSemantics.scene_type ?? '',
    sceneLocationType: entry.sceneSemantics.location_type ?? '',
    conflictLevel: entry.sceneSemantics.conflict_level ?? '',
    narrativePrimary: entry.narrativeFunction.primary ?? '',
    narrativeSecondary: (entry.narrativeFunction.secondary ?? []).join(', '),
    informationState: entry.narrativeFunction.information_state ?? '',
    emotionNames: (entry.emotionalProfile.names ?? []).join(', '),
    emotionValence: entry.emotionalProfile.valence ?? '',
    emotionArousal: entry.emotionalProfile.arousal ?? '',
    viewerPosition: entry.emotionalProfile.viewer_position ?? '',
    patternIds: (entry.reusablePattern.pattern_ids ?? []).join(', '),
    reusablePrinciple: entry.reusablePattern.principle ?? '',
    worksWhen: (entry.reusablePattern.works_when ?? []).join(', '),
    avoidWhen: (entry.reusablePattern.avoid_when ?? []).join(', '),
    coverageRole: entry.executionDetails.coverageRole ?? '',
    difficulty: entry.executionDetails.difficulty ?? '',
    requirements: (entry.executionDetails.requirements ?? []).join(', '),
    blocking: entry.executionDetails.blocking ?? '',
  }
}

function executionDetailsFromDraft(draft: ReturnType<typeof detailDraftFromEntry>, entry?: ShotLibraryEntry): ShotReferenceManualUpdate['execution_details'] {
  return {
    duration_sec: entry?.executionDetails.durationSec,
    resolution: entry?.executionDetails.resolution ?? cleanText(draft.resolution),
    aspect_ratio: entry?.executionDetails.aspectRatio ?? cleanText(draft.aspectRatio),
    transition_in: entry?.executionDetails.transitionIn,
    transition_out: entry?.executionDetails.transitionOut,
    coverage_role: cleanText(draft.coverageRole),
    difficulty: cleanText(draft.difficulty),
    requirements: splitTags(draft.requirements),
    blocking: cleanText(draft.blocking),
  }
}

function visualAnalysisFromDraft(draft: ReturnType<typeof detailDraftFromEntry>): ShotReferenceManualUpdate['visual_analysis'] {
  return {
    shot_size: cleanText(draft.shotSize),
    framing: splitTags(draft.framing),
    composition: splitTags(draft.composition),
    camera_angle: cleanText(draft.cameraAngle),
    camera_height: cleanText(draft.cameraHeight),
    lens: {
      focal_length_class: cleanText(draft.lensFocalLength),
      depth_of_field: cleanText(draft.lensDepthOfField),
      optical_effects: splitTags(draft.opticalEffects),
    },
    focus: {
      behavior: cleanText(draft.focusBehavior),
    },
    camera_movement: {
      type: cleanText(draft.cameraMovementType),
      speed: cleanText(draft.cameraMovementSpeed),
      stability: cleanText(draft.cameraMovementStability),
      motivation: cleanText(draft.cameraMovementMotivation),
    },
    lighting: {
      style: cleanText(draft.lightingStyle),
      contrast: cleanText(draft.lightingContrast),
    },
    color: {
      palette: cleanText(draft.colorPalette),
      saturation: cleanText(draft.colorSaturation),
    },
    environment: {
      location_type: cleanText(draft.environmentLocationType),
      spatial_feeling: splitTags(draft.spatialFeeling),
    },
  }
}

function sceneSemanticsFromDraft(draft: ReturnType<typeof detailDraftFromEntry>): ShotReferenceManualUpdate['scene_semantics'] {
  return {
    genre: splitTags(draft.genre),
    scene_type: cleanText(draft.sceneType),
    location_type: cleanText(draft.sceneLocationType),
    conflict_level: cleanText(draft.conflictLevel),
  }
}

function narrativeFunctionFromDraft(draft: ReturnType<typeof detailDraftFromEntry>): ShotReferenceManualUpdate['narrative_function'] {
  return {
    primary: cleanText(draft.narrativePrimary),
    secondary: splitTags(draft.narrativeSecondary),
    information_state: cleanText(draft.informationState),
  }
}

function emotionalProfileFromDraft(draft: ReturnType<typeof detailDraftFromEntry>): ShotReferenceManualUpdate['emotional_profile'] {
  return {
    names: splitTags(draft.emotionNames),
    valence: cleanText(draft.emotionValence),
    arousal: cleanText(draft.emotionArousal),
    viewer_position: cleanText(draft.viewerPosition),
  }
}

function reusablePatternFromDraft(draft: ReturnType<typeof detailDraftFromEntry>): ShotReferenceManualUpdate['reusable_pattern'] {
  return {
    pattern_ids: splitTags(draft.patternIds),
    principle: cleanText(draft.reusablePrinciple),
    works_when: splitTags(draft.worksWhen),
    avoid_when: splitTags(draft.avoidWhen),
  }
}

function cleanText(value: string): string | undefined {
  return value.trim() || undefined
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

function buildShotFacetOptions(entries: ShotLibraryEntry[]): ShotFacetOptions {
  const result: ShotFacetOptions = {
    visual: [],
    narrative: [],
    emotion: [],
    pattern: [],
    production: [],
  }
  for (const entry of entries) {
    appendFacetValues(result.visual, [
      ...(entry.searchIndex.visual_facets ?? []),
      entry.visualAnalysis.shot_size,
      entry.visualAnalysis.camera_movement?.type,
      entry.visualAnalysis.camera_movement?.stability,
      entry.visualAnalysis.focus?.behavior,
      ...(entry.visualAnalysis.framing ?? []),
      ...(entry.visualAnalysis.composition ?? []),
    ])
    appendFacetValues(result.narrative, [
      ...(entry.searchIndex.narrative_facets ?? []),
      entry.narrativeFunction.primary,
      entry.narrativeFunction.information_state,
      entry.narrativeFunction.sequence_position,
    ])
    appendFacetValues(result.emotion, [
      ...(entry.searchIndex.emotion_facets ?? []),
      ...(entry.emotionalProfile.names ?? []),
      ...entry.emotionalEffect,
    ])
    appendFacetValues(result.pattern, [
      ...(entry.searchIndex.pattern_facets ?? []),
      ...(entry.reusablePattern.pattern_ids ?? []),
      ...entry.pattern,
    ])
    appendFacetValues(result.production, [
      ...(entry.searchIndex.production_facets ?? []),
      ...(entry.executionDetails.requirements ?? []),
      entry.executionDetails.coverageRole,
      entry.executionDetails.difficulty,
      entry.executionDetails.aspectRatio,
    ])
  }
  for (const values of Object.values(result)) {
    values.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }
  return result
}

function appendFacetValues(target: string[], values: Array<string | undefined>) {
  for (const value of values) {
    const clean = value?.trim()
    if (clean && !target.includes(clean)) target.push(clean)
  }
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

async function buildImportDraftsWithThumbnails(
  resource: RawResource,
  metadata: ShotLibraryVideoMetadata,
  sourceData: ArrayBuffer,
  thumbnailSourceUrl: string,
): Promise<ShotImportDraft[]> {
  const drafts = await buildLocalImportDrafts(resource, metadata, sourceData)
  return buildImportDraftThumbnails(thumbnailSourceUrl, drafts)
}

async function buildImportDraftThumbnails(sourceUrl: string, drafts: ShotImportDraft[]): Promise<ShotImportDraft[]> {
  if (typeof document === 'undefined' || drafts.length === 0) return drafts
  try {
    const thumbnails = await captureDraftThumbnails(sourceUrl, drafts)
    return drafts.map((draft, index) => ({ ...draft, thumbnailUrl: thumbnails[index] }))
  } catch {
    return drafts
  }
}

async function captureDraftThumbnails(sourceUrl: string, drafts: ShotImportDraft[]): Promise<Array<string | undefined>> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
  video.src = sourceUrl
  try {
    await waitForVideoMetadata(video)
    const result: Array<string | undefined> = []
    for (const draft of drafts) {
      result.push(await captureDraftThumbnail(video, draft))
    }
    return result
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.onloadedmetadata = null
      video.onerror = null
    }
    const timeout = window.setTimeout(() => {
      cleanup()
      resolve()
    }, VIDEO_METADATA_TIMEOUT_MS)
    video.onloadedmetadata = () => {
      cleanup()
      resolve()
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('video metadata unavailable'))
    }
  })
}

function captureDraftThumbnail(video: HTMLVideoElement, draft: ShotImportDraft): Promise<string | undefined> {
  return new Promise(resolve => {
    const start = optionalNumber(draft.startSec) ?? 0
    const duration = Number.isFinite(video.duration) ? video.duration : undefined
    const target = duration === undefined ? start : Math.min(start + 0.05, Math.max(0, duration - 0.05))
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.onseeked = null
      video.onerror = null
    }
    const draw = () => {
      cleanup()
      resolve(drawVideoThumbnail(video))
    }
    const timeout = window.setTimeout(() => {
      cleanup()
      resolve(undefined)
    }, 2500)
    video.onseeked = draw
    video.onerror = () => {
      cleanup()
      resolve(undefined)
    }
    if (Math.abs(video.currentTime - target) <= 0.04 && video.readyState >= 2) {
      draw()
      return
    }
    video.currentTime = target
  })
}

function drawVideoThumbnail(video: HTMLVideoElement): string | undefined {
  if (!video.videoWidth || !video.videoHeight) return undefined
  const width = SHOT_IMPORT_THUMBNAIL_WIDTH
  const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return undefined
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
  const drawWidth = video.videoWidth * scale
  const drawHeight = video.videoHeight * scale
  context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
  return canvas.toDataURL('image/jpeg', 0.76)
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
      selected: false,
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
    execution_details: executionDetailsFromDraft(draft),
    visual_analysis: visualAnalysisFromDraft(draft),
    scene_semantics: sceneSemanticsFromDraft(draft),
    narrative_function: narrativeFunctionFromDraft(draft),
    emotional_profile: emotionalProfileFromDraft(draft),
    reusable_pattern: reusablePatternFromDraft(draft),
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

function defaultImportGroupTitle(sourceName: string): string {
  return titleFromFilename(sourceName) || sourceName
}

function titleFromFilename(sourceName: string): string {
  return sourceName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function draftRangeDuration(draft?: ShotImportDraft): number {
  if (!draft) return 0
  const start = optionalNumber(draft.startSec)
  const end = optionalNumber(draft.endSec)
  if (start !== undefined && end !== undefined) return Math.max(0, end - start)
  return 0
}

function formatDraftRange(draft: ShotImportDraft): string {
  const start = optionalNumber(draft.startSec)
  const end = optionalNumber(draft.endSec)
  if (start === undefined && end === undefined) return '--'
  if (start !== undefined && end !== undefined) return `${formatTimecode(start)}-${formatTimecode(end)}`
  if (start !== undefined) return `${formatTimecode(start)}+`
  return `-${formatTimecode(end!)}`
}

function formatClipProgress(progress: number, durationSec: number, language = ''): string {
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0
  const elapsed = Math.max(0, Math.min(duration, duration * progress))
  return `${formatTimecode(elapsed)} / ${duration ? formatDuration(duration, language) : '--'}`
}

function formatTimecode(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const totalSeconds = Math.floor(value)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
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
