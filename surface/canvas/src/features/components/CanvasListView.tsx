import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  CanvasListCreateButton,
  CanvasListDescription,
  CanvasListEmpty,
  CanvasListEmptyActionButton,
  CanvasListError,
  CanvasListHeader,
  CanvasListHeaderText,
  CanvasListLoading,
  CanvasListShell,
  CanvasListTitle,
} from './CanvasListUi'
import {
  CanvasListCreateModal,
  CanvasListProgramStrip,
  CanvasListResults,
  CanvasListSearchAndFilters,
} from './CanvasListViewSections'
import {
  CANVAS_LIST_PAGE_SIZE,
  CANVAS_LIST_TYPE_META,
  type CanvasTypeFilter,
} from './CanvasListViewModel'

import { canvasEditorSurfacePath, type CanvasRouteSource } from '@movscript/shared'
import { canvasKeys } from '../application/canvasQueryKeys'
import { canvasListChangedResult, invalidateCanvasMutationResult } from '../application/canvasMutationInvalidation'
import { canvasApi, canvasServicePaths } from '../application/canvasServiceApi'
import type { Canvas, CanvasType } from '@movscript/shared'
import { useSurfaceHostState } from '../application/surfaceHostStateHooks'

type CanvasListViewProps = {
  source: CanvasRouteSource
  className?: string
}

export function CanvasListView({ source, className }: CanvasListViewProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const currentProject = useSurfaceHostState((state) => state.currentProject)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCanvasType, setNewCanvasType] = useState<CanvasType>('inspiration')
  const [editingCanvasId, setEditingCanvasId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [typeFilter, setTypeFilter] = useState<CanvasTypeFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const canvasesQuery = useQuery<Canvas[]>({
    queryKey: canvasKeys.list(),
    queryFn: () =>
      canvasApi
        .get(canvasServicePaths.canvases)
        .then((response) =>
          canvasListFromResponse(response.data, t('pages.canvases.invalidListResponse')),
        ),
  })

  const createCanvas = useMutation({
    mutationFn: (payload: { name: string; canvas_type: CanvasType }) =>
      canvasApi.post(canvasServicePaths.canvases, payload).then((response) => response.data as Canvas),
    onSuccess: (canvas) => {
      invalidateCanvasMutationResult(queryClient, canvasListChangedResult({ changedIds: [canvas.ID] }))
      resetCreate()
      navigate(canvasEditorSurfacePath(canvas.ID, { source }))
    },
  })

  const removeCanvas = useMutation({
    mutationFn: (id: number) => canvasApi.delete(canvasServicePaths.canvas(id)),
    onSuccess: (_, id) => invalidateCanvasMutationResult(queryClient, canvasListChangedResult({ changedIds: [id] })),
  })

  const renameCanvas = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      canvasApi.patch(canvasServicePaths.canvas(id), { name }).then((response) => response.data as Canvas),
    onSuccess: (canvas) => {
      invalidateCanvasMutationResult(queryClient, canvasListChangedResult({ changedIds: [canvas.ID] }))
      setEditingCanvasId(null)
      setEditingName('')
    },
  })

  const canvases = canvasesQuery.data ?? []
  const filteredCanvases = useMemo(() => {
    const query = search.trim().toLowerCase()
    return canvases.filter((canvas) => {
      const type = canvas.canvas_type ?? 'inspiration'
      if (typeFilter !== 'all' && type !== typeFilter) return false
      if (!query) return true
      return `${canvas.name} ${canvas.ID} ${t(CANVAS_LIST_TYPE_META[type].labelKey)}`
        .toLowerCase()
        .includes(query)
    })
  }, [canvases, search, t, typeFilter])
  const pageCount = Math.max(1, Math.ceil(filteredCanvases.length / CANVAS_LIST_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pagedCanvases = filteredCanvases.slice((currentPage - 1) * CANVAS_LIST_PAGE_SIZE, currentPage * CANVAS_LIST_PAGE_SIZE)
  const hasFilters = search.trim().length > 0 || typeFilter !== 'all'

  function resetCreate() {
    setShowCreate(false)
    setNewName('')
    setNewCanvasType('inspiration')
  }

  function submitCreate() {
    const name = newName.trim()
    if (!name || createCanvas.isPending) return
    createCanvas.mutate({ name, canvas_type: newCanvasType })
  }

  function startRename(canvas: Canvas) {
    setEditingCanvasId(canvas.ID)
    setEditingName(canvas.name)
  }

  function submitRename(id: number) {
    const name = editingName.trim()
    if (!name || renameCanvas.isPending) return
    renameCanvas.mutate({ id, name })
  }

  function cancelRename() {
    setEditingCanvasId(null)
    setEditingName('')
  }

  function updateTypeFilter(nextFilter: CanvasTypeFilter) {
    setTypeFilter(nextFilter)
    setPage(1)
  }

  function updateSearch(nextSearch: string) {
    setSearch(nextSearch)
    setPage(1)
  }

  function clearFilters() {
    updateSearch('')
    updateTypeFilter('all')
  }

  return (
    <CanvasListShell className={className}>
      <CanvasListHeader>
        <CanvasListHeaderText>
          <CanvasListTitle>{t('header.titles.canvases')}</CanvasListTitle>
          <CanvasListDescription>{t('pages.canvases.subtitle')}</CanvasListDescription>
        </CanvasListHeaderText>
        <CanvasListCreateButton type="button" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> {t('pages.canvases.newCanvas')}
        </CanvasListCreateButton>
      </CanvasListHeader>

      <CanvasListProgramStrip canvases={canvases} currentProject={currentProject} t={t} />

      {canvasesQuery.isLoading ? (
        <CanvasListLoading>{t('common.loadingShort')}</CanvasListLoading>
      ) : canvasesQuery.error ? (
        <CanvasListError role="alert">
          {errorMessage(canvasesQuery.error)}
        </CanvasListError>
      ) : canvases.length === 0 ? (
        <CanvasListEmpty icon={Workflow} title={t('pages.canvases.empty')}>
          <CanvasListEmptyActionButton
            type="button"
            onClick={() => setShowCreate(true)}
          >
            {t('pages.canvases.createFirst')}
          </CanvasListEmptyActionButton>
        </CanvasListEmpty>
      ) : (
        <>
          <CanvasListSearchAndFilters
            search={search}
            typeFilter={typeFilter}
            onSearchChange={updateSearch}
            onTypeFilterChange={updateTypeFilter}
            t={t}
          />
          <CanvasListResults
            canvases={canvases}
            pagedCanvases={pagedCanvases}
            filteredCount={filteredCanvases.length}
            source={source}
            editingCanvasId={editingCanvasId}
            editingName={editingName}
            renamePending={renameCanvas.isPending}
            removePending={removeCanvas.isPending}
            pageCount={pageCount}
            currentPage={currentPage}
            hasFilters={hasFilters}
            onClearFilters={clearFilters}
            onOpen={(canvas) => navigate(canvasEditorSurfacePath(canvas.ID, { source }))}
            onStartRename={startRename}
            onEditingNameChange={setEditingName}
            onSubmitRename={submitRename}
            onCancelRename={cancelRename}
            onRemove={(id) => removeCanvas.mutate(id)}
            onPreviousPage={() => setPage((value) => Math.max(1, value - 1))}
            onNextPage={() => setPage((value) => Math.min(pageCount, value + 1))}
            t={t}
          />
        </>
      )}

      <CanvasListCreateModal
        open={showCreate}
        name={newName}
        canvasType={newCanvasType}
        creating={createCanvas.isPending}
        onClose={resetCreate}
        onNameChange={setNewName}
        onCanvasTypeChange={setNewCanvasType}
        onSubmit={submitCreate}
        t={t}
      />
    </CanvasListShell>
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function canvasListFromResponse(data: unknown, invalidResponseMessage: string): Canvas[] {
  if (Array.isArray(data)) return data as Canvas[]

  if (isRecord(data)) {
    const items = data.items ?? data.canvases ?? data.data
    if (Array.isArray(items)) return items as Canvas[]
  }

  throw new Error(invalidResponseMessage)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
