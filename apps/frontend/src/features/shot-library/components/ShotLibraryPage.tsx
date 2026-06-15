import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Film,
  Search,
  Sparkles,
  Upload,
  Video,
} from 'lucide-react'
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@movscript/ui/primitives'
import { api } from '@/shared/infrastructure/api'
import { normalizeAPIBaseURL } from '@/shared/infrastructure/config'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { resourceKeys } from '@/features/resources/application/resourceQueryKeys'
import { invalidateResourceMutationResult, resourceLibraryChangedResult } from '@/features/resources/application/resourceMutationInvalidation'
import { shotLibraryKeys } from '@/features/shot-library/application/shotLibraryQueryKeys'
import { invalidateShotLibraryMutationResult, shotReferencesChangedResult } from '@/features/shot-library/application/shotLibraryMutationInvalidation'
import { createObjectUrl, revokeObjectUrl } from '@/shared/ui/objectUrl'
import { toast } from '@/shared/ui/toastStore'
import type { PaginatedResponse, RawResource } from '@/types'
import {
  createShotReferencesFromResourceInSource,
  deleteShotReferenceFromSource,
  listShotLibrarySource,
  normalizeShotLibrarySources,
  searchShotReferenceResults,
  shotSearchBackendQuery,
  type ShotLibraryEntry,
  type ShotLibraryFacetFilters,
  type ShotLibrarySource,
  type ShotLibraryVideoMetadata,
  type ShotReferenceManualUpdate,
  uploadShotLibraryResourceToSource,
  updateShotReferenceInSource,
  shotLibraryEntryFromApi,
} from '@/features/shot-library/domain/shotReferenceLibrary'
import {
  buildImportWorkspaces,
  buildShotFacetOptions,
  buildShotGroupOptions,
  buildShotTagSuggestions,
  defaultImportGroupTitle,
  formatDuration,
  importWorkspaceToManualUpdate,
  isWorkspaceSelected,
  shotEntryKey,
  tempResourceFromFile,
  uploadErrorMessage,
  type ShotFacetOptions,
  type ShotImportSession,
  type ShotImportWorkspace,
  type ShotManualWorkspace,
} from '@/features/shot-library/domain/shotLibraryWorkspaceModel'
import { ShotFacetFilters, ShotLibraryMetric, ShotLibrarySourceBar } from '@/features/shot-library/components/ShotLibraryBrowserChrome'
import { ShotImportDialog } from '@/features/shot-library/components/ShotLibraryImportDialog'
import { ShotReferenceCard } from '@/features/shot-library/components/ShotLibraryReferenceCard'
import { ShotReferenceDetail } from '@/features/shot-library/components/ShotLibraryReferenceDetail'
import {
  RESOURCE_LIBRARY_PAGE_SIZE,
  SHOT_IMPORT_WORKSPACE_REVEAL_DELAY_MS,
  SHOT_LIBRARY_PAGE_SIZE,
  buildImportWorkspaceThumbnails,
  buildImportWorkspacesWithThumbnails,
  delay,
  loadResourceVideoBlob,
  loadVideoMetadataFromBlob,
  loadVideoMetadataFromObjectUrl,
} from '@/features/shot-library/components/shotLibraryImportPreparation'
import './ShotLibraryPage.css'
const EMPTY_FACET_FILTERS: ShotLibraryFacetFilters = {}
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
      invalidateShotLibraryMutationResult(queryClient, shotReferencesChangedResult({ changedIds: [entry.ID] }))
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
      invalidateShotLibraryMutationResult(queryClient, shotReferencesChangedResult({ changedIds: [entry.ID] }))
      setSelectedKey(shotEntryKey(entry))
      toast.success(t('pages.shotLibrary.updateSuccess'), entry.title)
    },
    onError: (error) => {
      toast.error(t('pages.shotLibrary.updateFailed'), error instanceof Error ? error.message : undefined)
    },
  })

  const { data: sourceResults, isLoading } = useQuery({
    queryKey: shotLibraryKeys.referenceList({ sources: enabledSources, query, language: i18n.language }),
    queryFn: async () => {
      const backendQuery = shotSearchBackendQuery(query, i18n.language)
      return Promise.all(enabledSources.map(source => listShotLibrarySource(api, source, backendQuery)))
    },
    enabled: enabledSources.length > 0,
  })
  const entries = useMemo(() => (sourceResults ?? [])
    .flatMap(result => (result.page?.items ?? []).map(item => shotLibraryEntryFromApi(item, result.source)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [sourceResults])
  const failedSources = useMemo(() => (sourceResults ?? []).filter(result => result.error), [sourceResults])

  const { data: resourcePickerData, isLoading: isResourcePickerLoading } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: resourceKeys.shotLibraryPicker({ search: resourceSearch, page: resourcePage }),
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
        shots: session.workspaces.filter(isWorkspaceSelected).map(importWorkspaceToManualUpdate),
      })
      return { created, source }
    },
    onSuccess: ({ created, source }) => {
      invalidateShotLibraryMutationResult(queryClient, shotReferencesChangedResult({ changedIds: created.map(entry => entry.ID) }))
      invalidateResourceMutationResult(queryClient, resourceLibraryChangedResult())
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
  const searchResults = useMemo(() => searchShotReferenceResults(sourceFilteredEntries, query, facetFilters, i18n.language), [sourceFilteredEntries, query, facetFilters, i18n.language])
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
      revokeObjectUrl(importSession?.objectUrl)
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
    const objectUrl = createObjectUrl(file)
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
      workspaces: [],
      targetGroupId: undefined,
      targetGroupTitle: defaultImportGroupTitle(file.name),
    })
    let metadata: ShotLibraryVideoMetadata = {}
    try {
      metadata = await loadVideoMetadataFromBlob(file)
      setImportSession(current => current?.sourceKey === sourceKey ? {
        ...current,
        metadata,
        phase: 'cutting',
        workspaces: [],
        activeWorkspaceId: undefined,
        error: undefined,
        progressPercent: undefined,
      } : current)
      const sourceData = await file.arrayBuffer()
      const workspaces = await buildImportWorkspacesWithThumbnails(resource, metadata, sourceData, objectUrl)
      await revealImportWorkspaces(sourceKey, metadata, workspaces)
    } catch (error) {
      const workspaces = await buildImportWorkspaceThumbnails(objectUrl, buildImportWorkspaces(resource, metadata))
      await revealImportWorkspaces(sourceKey, metadata, workspaces, uploadErrorMessage(error, t('pages.shotLibrary.uploadFailed')))
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
      workspaces: [],
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
      thumbnailObjectUrl = createObjectUrl(blob)
      metadata = await loadVideoMetadataFromObjectUrl(thumbnailObjectUrl, () => {})
      setImportSession(current => current?.sourceKey === sourceKey ? {
        ...current,
        metadata,
        phase: 'cutting',
        workspaces: [],
        activeWorkspaceId: undefined,
        error: undefined,
        progressPercent: undefined,
      } : current)
      const sourceData = await blob.arrayBuffer()
      const workspaces = await buildImportWorkspacesWithThumbnails(resource, metadata, sourceData, thumbnailObjectUrl)
      await revealImportWorkspaces(sourceKey, metadata, workspaces)
    } catch (error) {
      const workspaces = thumbnailObjectUrl
        ? await buildImportWorkspaceThumbnails(thumbnailObjectUrl, buildImportWorkspaces(resource, metadata))
        : buildImportWorkspaces(resource, metadata)
      await revealImportWorkspaces(sourceKey, metadata, workspaces, uploadErrorMessage(error, t('pages.shotLibrary.uploadFailed')))
    } finally {
      revokeObjectUrl(thumbnailObjectUrl)
    }
  }

  async function revealImportWorkspaces(sourceKey: string, metadata: ShotLibraryVideoMetadata, workspaces: ShotImportWorkspace[], error?: string) {
    setImportSession(current => current?.sourceKey === sourceKey ? {
      ...current,
      metadata,
      phase: 'review',
      workspaces: [],
      activeWorkspaceId: undefined,
      error,
      progressPercent: undefined,
    } : current)
    for (const workspace of workspaces) {
      await delay(SHOT_IMPORT_WORKSPACE_REVEAL_DELAY_MS)
      setImportSession(current => current?.sourceKey === sourceKey ? {
        ...current,
        phase: 'review',
        workspaces: [...current.workspaces, workspace],
        activeWorkspaceId: current.activeWorkspaceId ?? workspace.id,
      } : current)
    }
  }

  function closeImportDialog() {
    setImportDialogOpen(false)
    setSelectedLibraryResource(null)
    setImportSession(current => {
      revokeObjectUrl(current?.objectUrl)
      return null
    })
  }

  function updateImportWorkspace(workspaceId: string, patch: Partial<ShotManualWorkspace>) {
    setImportSession(current => current ? {
      ...current,
      workspaces: current.workspaces.map(workspace => workspace.id === workspaceId ? { ...workspace, ...patch } : workspace),
    } : current)
  }

  function toggleImportWorkspace(workspaceId: string, selected: boolean) {
    setImportSession(current => current ? {
      ...current,
      workspaces: current.workspaces.map(workspace => workspace.id === workspaceId ? { ...workspace, selected } : workspace),
    } : current)
  }

  function handleConfirmImport() {
    if (!importSession || !uploadSource || importSession.workspaces.length === 0) return
    if (!importSession.workspaces.some(isWorkspaceSelected)) return
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
        onSelectWorkspace={(workspaceId) => setImportSession(current => current ? { ...current, activeWorkspaceId: workspaceId } : current)}
        onToggleWorkspace={toggleImportWorkspace}
        onUpdateWorkspace={updateImportWorkspace}
        onTargetGroup={(targetGroupId) => setImportSession(current => current ? { ...current, targetGroupId } : current)}
        onTargetGroupTitle={(targetGroupTitle) => setImportSession(current => current ? { ...current, targetGroupTitle } : current)}
        onConfirm={handleConfirmImport}
      />
    </main>
  )
}
