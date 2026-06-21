import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Film,
} from 'lucide-react'
import { api } from '@/shared/infrastructure/api'
import { normalizeAPIBaseURL } from '@/shared/infrastructure/config'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { resourceKeys } from '@/features/resources/application/resourceQueryKeys'
import { invalidateResourceMutationResult, resourceLibraryChangedResult } from '@/features/resources/application/resourceMutationInvalidation'
import { shotLibraryKeys } from '@/features/shot-library/application/shotLibraryQueryKeys'
import { invalidateShotLibraryMutationResult, shotReferencesChangedResult } from '@/features/shot-library/application/shotLibraryMutationInvalidation'
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
  type ShotReferenceManualUpdate,
  uploadShotLibraryResourceToSource,
  updateShotReferenceInSource,
  shotLibraryEntryFromApi,
} from '@/features/shot-library/domain/shotReferenceLibrary'
import {
  buildShotFacetOptions,
  buildShotGroupOptions,
  buildShotTagSuggestions,
  importWorkspaceToManualUpdate,
  isWorkspaceSelected,
  shotEntryKey,
  uploadErrorMessage,
  type ShotImportSession,
} from '@/features/shot-library/domain/shotLibraryWorkspaceModel'
import { ShotImportDialog } from '@/features/shot-library/components/ShotLibraryImportDialog'
import { ShotReferenceDetail } from '@/features/shot-library/components/ShotLibraryReferenceDetail'
import {
  ShotLibraryBrowser,
  ShotLibraryHeader,
  ShotLibraryMetrics,
  ShotLibraryToolbar,
} from '@/features/shot-library/components/ShotLibraryPageSections'
import { SHOT_LIBRARY_PAGE_SIZE } from '@/features/shot-library/components/shotLibraryPagination'
import { useShotLibraryImportController } from '@/features/shot-library/components/useShotLibraryImportController'
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
  const [facetFilters, setFacetFilters] = useState<ShotLibraryFacetFilters>(EMPTY_FACET_FILTERS)
  const [shotPage, setShotPage] = useState(1)
  const {
    importDialogOpen,
    importSession,
    resourceSearch,
    resourcePage,
    selectedLibraryResource,
    resourcePageSize,
    closeImportDialog,
    openImportDialog,
    setImportDialogOpen,
    setImportSession,
    setResourcePage,
    setSelectedLibraryResource,
    startImportFromFile,
    startImportFromResource,
    updateResourceSearch,
    selectImportWorkspace,
    toggleImportWorkspace,
    updateImportWorkspace,
    setImportTargetGroupId,
    setImportTargetGroupTitle,
  } = useShotLibraryImportController({
    uploadFailedTitle: t('pages.shotLibrary.uploadFailed'),
    videoOnlyMessage: t('pages.shotLibrary.videoOnly'),
  })

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
      params.set('page_size', String(resourcePageSize))
      params.set('type', 'video')
      if (resourceSearch.trim()) params.set('q', resourceSearch.trim())
      return api.get(`/resources?${params}`).then(response => response.data)
    },
    enabled: importDialogOpen,
  })
  const resourcePickerItems = resourcePickerData?.items ?? []
  const resourcePickerTotal = resourcePickerData?.total ?? 0
  const resourcePickerPageCount = Math.max(1, Math.ceil(resourcePickerTotal / resourcePageSize))

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
    setShotPage(1)
  }, [activeSourceId, facetFilters, query])

  useEffect(() => {
    setShotPage(current => Math.min(current, shotPageCount))
  }, [shotPageCount])

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

      <ShotLibraryHeader
        saving={confirmShotImport.isPending}
        disabled={!uploadSource}
        onImport={openImportDialog}
      />

      <ShotLibraryMetrics
        entryCount={entries.length}
        totalDuration={totalDuration}
        sourceCount={enabledSources.length}
      />

      <ShotLibraryToolbar
        sources={enabledSources}
        activeSourceId={activeSourceId}
        failedSourceIds={new Set(failedSources.map(result => result.source.id))}
        query={query}
        facetOptions={facetOptions}
        facetFilters={facetFilters}
        onSourceSelect={setActiveSourceId}
        onQueryChange={setQuery}
        onFacetFiltersChange={setFacetFilters}
      />

      <section className="shot-library-page__body">
        <ShotLibraryBrowser
          failedSourceCount={failedSources.length}
          entriesCount={entries.length}
          isLoading={isLoading}
          visibleEntries={visibleEntries}
          pagedVisibleEntries={pagedVisibleEntries}
          selectedEntryKey={selected ? shotEntryKey(selected) : ''}
          page={normalizedShotPage}
          pageCount={shotPageCount}
          onEntrySelect={(entry) => setSelectedKey(shotEntryKey(entry))}
          onPageChange={setShotPage}
        />

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
        onResourceSearch={updateResourceSearch}
        onResourcePage={setResourcePage}
        onSelectResource={startImportFromResource}
        onClearResource={() => setSelectedLibraryResource(null)}
        onSelectWorkspace={selectImportWorkspace}
        onToggleWorkspace={toggleImportWorkspace}
        onUpdateWorkspace={updateImportWorkspace}
        onTargetGroup={setImportTargetGroupId}
        onTargetGroupTitle={setImportTargetGroupTitle}
        onConfirm={handleConfirmImport}
      />
    </main>
  )
}
