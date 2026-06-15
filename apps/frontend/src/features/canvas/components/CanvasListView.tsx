import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Clock3, Layers3, Lightbulb, Pencil, Plus, Search, Trash2, Workflow, X, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  CanvasListCreateActionButton,
  CanvasListCreateActions,
  CanvasListCreateButton,
  CanvasListCreateDialog,
  CanvasListCreateDialogBody,
  CanvasListCreateField,
  CanvasListCreateInput,
  CanvasListCreateLabel,
  CanvasListCreateTypeDescription,
  CanvasListCreateTypeGrid,
  CanvasListCreateTypeLabel,
  CanvasListCreateTypeTile,
  CanvasListDescription,
  CanvasListEmpty,
  CanvasListEmptyActionButton,
  CanvasListError,
  CanvasListFilterButton,
  CanvasListFilterGroup,
  CanvasListHeader,
  CanvasListHeaderText,
  CanvasListItem,
  CanvasListItemActionButton,
  CanvasListItemActions,
  CanvasListItemBody,
  CanvasListItemIcon,
  CanvasListItemMeta,
  CanvasListItemName,
  CanvasListItemNameInput,
  CanvasListItems,
  CanvasListLoading,
  CanvasListPageButton,
  CanvasListPageStatus,
  CanvasListPagination,
  CanvasListSearchBox,
  CanvasListSearchInput,
  CanvasListShell,
  CanvasListSummary,
  CanvasListTitle,
  CanvasListToolbar,
  CanvasListTypeBadge
} from './CanvasListUi'

import { canvasEditorPath, type CanvasRouteSource } from '@/routes/appRouteModel'
import { canvasKeys } from '@/features/canvas/application/canvasQueryKeys'
import { canvasListChangedResult, invalidateCanvasMutationResult } from '@/features/canvas/application/canvasMutationInvalidation'
import { api } from '@/shared/infrastructure/api'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import type { Canvas, CanvasType } from '@/types'

const PAGE_SIZE = 8

type CanvasTypeFilter = 'all' | CanvasType

const TYPE_META: Record<CanvasType, { labelKey: string; icon: JSX.Element; listIcon: JSX.Element; descKey: string }> = {
  inspiration: {
    labelKey: 'pages.canvases.types.inspiration',
    icon: <Lightbulb size={12} />,
    listIcon: <Lightbulb size={16} />,
    descKey: 'pages.canvases.typeDescriptions.inspiration',
  },
  workflow: {
    labelKey: 'pages.canvases.types.workflow',
    icon: <Zap size={12} />,
    listIcon: <Workflow size={16} />,
    descKey: 'pages.canvases.typeDescriptions.workflow',
  },
}

type CanvasListViewProps = {
  source: CanvasRouteSource
  className?: string
}

export function CanvasListView({ source, className }: CanvasListViewProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const currentProject = useProjectStore((state) => state.current)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCanvasType, setNewCanvasType] = useState<CanvasType>('inspiration')
  const [editingCanvasId, setEditingCanvasId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [typeFilter, setTypeFilter] = useState<CanvasTypeFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const canvasesQuery = useQuery<Canvas[]>({
    queryKey: canvasKeys.list(currentProject?.ID),
    queryFn: () => {
      const params: Record<string, string> = {}
      if (currentProject?.ID) params.project_id = String(currentProject.ID)
      return api.get('/canvases', { params }).then((response) => response.data)
    },
  })

  const createCanvas = useMutation({
    mutationFn: (payload: { name: string; canvas_type: CanvasType; project_id?: number }) =>
      api.post('/canvases', payload).then((response) => response.data as Canvas),
    onSuccess: (canvas) => {
      invalidateCanvasMutationResult(queryClient, canvasListChangedResult({ changedIds: [canvas.ID] }))
      resetCreate()
      navigate(canvasEditorPath(canvas.ID, { source }))
    },
  })

  const removeCanvas = useMutation({
    mutationFn: (id: number) => api.delete(`/canvases/${id}`),
    onSuccess: (_, id) => invalidateCanvasMutationResult(queryClient, canvasListChangedResult({ changedIds: [id] })),
  })

  const renameCanvas = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.patch(`/canvases/${id}`, { name }).then((response) => response.data as Canvas),
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
      return `${canvas.name} ${canvas.ID} ${t(TYPE_META[type].labelKey)}`
        .toLowerCase()
        .includes(query)
    })
  }, [canvases, search, t, typeFilter])
  const pageCount = Math.max(1, Math.ceil(filteredCanvases.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pagedCanvases = filteredCanvases.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const hasFilters = search.trim().length > 0 || typeFilter !== 'all'
  const inspirationCount = canvases.filter((canvas) => (canvas.canvas_type ?? 'inspiration') === 'inspiration').length
  const workflowCount = canvases.filter((canvas) => (canvas.canvas_type ?? 'inspiration') === 'workflow').length

  function resetCreate() {
    setShowCreate(false)
    setNewName('')
    setNewCanvasType('inspiration')
  }

  function submitCreate() {
    const name = newName.trim()
    if (!name || createCanvas.isPending) return
    createCanvas.mutate({ name, canvas_type: newCanvasType, project_id: currentProject?.ID })
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

      <div className="canvas-list-program-strip" aria-label={t('pages.canvases.workspaceSummary', { defaultValue: '画布工作区概览' })}>
        <div className="canvas-list-program-strip__item">
          <span className="canvas-list-program-strip__icon"><Layers3 size={14} /></span>
          <span className="canvas-list-program-strip__label">{t('common.all')}</span>
          <strong className="canvas-list-program-strip__value">{canvases.length}</strong>
        </div>
        <div className="canvas-list-program-strip__item">
          <span className="canvas-list-program-strip__icon" data-canvas-type="inspiration"><Lightbulb size={14} /></span>
          <span className="canvas-list-program-strip__label">{t(TYPE_META.inspiration.labelKey)}</span>
          <strong className="canvas-list-program-strip__value">{inspirationCount}</strong>
        </div>
        <div className="canvas-list-program-strip__item">
          <span className="canvas-list-program-strip__icon" data-canvas-type="workflow"><Workflow size={14} /></span>
          <span className="canvas-list-program-strip__label">{t(TYPE_META.workflow.labelKey)}</span>
          <strong className="canvas-list-program-strip__value">{workflowCount}</strong>
        </div>
        <div className="canvas-list-program-strip__item canvas-list-program-strip__item--wide">
          <span className="canvas-list-program-strip__icon"><Clock3 size={14} /></span>
          <span className="canvas-list-program-strip__label">
            {currentProject?.name
              ? t('pages.canvases.currentProject', { defaultValue: '当前项目' })
              : t('pages.canvases.globalLibrary', { defaultValue: '全局画布库' })}
          </span>
          <strong className="canvas-list-program-strip__value canvas-list-program-strip__value--text">
            {currentProject?.name ?? t('pages.canvases.allProjects', { defaultValue: 'All projects' })}
          </strong>
        </div>
      </div>

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
          <CanvasListToolbar>
            <CanvasListSearchBox icon={<Search size={14} />}>
              <CanvasListSearchInput
                value={search}
                onChange={(event) => updateSearch(event.target.value)}
                placeholder={t('pages.canvases.searchPlaceholder')}
                aria-label={t('pages.canvases.searchLabel')}
              />
            </CanvasListSearchBox>
            <CanvasListFilterGroup aria-label={t('pages.canvases.categoryFilter')}>
              {(['all', 'inspiration', 'workflow'] as CanvasTypeFilter[]).map((filter) => (
                <CanvasListFilterButton
                  key={filter}
                  active={typeFilter === filter}
                  onClick={() => updateTypeFilter(filter)}
                >
                  {filter === 'all' ? t('common.all') : t(TYPE_META[filter].labelKey)}
                </CanvasListFilterButton>
              ))}
            </CanvasListFilterGroup>
          </CanvasListToolbar>
          <CanvasListSummary>
            {t('pages.canvases.resultSummary', { shown: filteredCanvases.length, total: canvases.length })}
          </CanvasListSummary>
          {filteredCanvases.length === 0 ? (
            <CanvasListEmpty icon={Search} title={t('pages.canvases.noResults')}>
              {hasFilters ? (
                <CanvasListEmptyActionButton
                  type="button"
                  onClick={() => {
                    updateSearch('')
                    updateTypeFilter('all')
                  }}
                >
                  {t('pages.canvases.clearFilters')}
                </CanvasListEmptyActionButton>
              ) : null}
            </CanvasListEmpty>
          ) : (
            <>
              <CanvasListItems>
                {pagedCanvases.map((canvas) => {
                  const type = canvas.canvas_type ?? 'inspiration'
                  const meta = TYPE_META[type]
                  const isEditing = editingCanvasId === canvas.ID
                  return (
                    <CanvasListItem key={canvas.ID}>
                      <CanvasListItemIcon data-canvas-type={type}>
                        {meta.listIcon}
                      </CanvasListItemIcon>
                      <CanvasListItemBody>
                        {isEditing ? (
                          <CanvasListItemNameInput
                            autoFocus
                            value={editingName}
                            onChange={(event) => setEditingName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') submitRename(canvas.ID)
                              if (event.key === 'Escape') cancelRename()
                            }}
                          />
                        ) : (
                          <>
                            <CanvasListItemName>{canvas.name}</CanvasListItemName>
                            {source === 'agent' ? (
                              <CanvasListItemMeta>#{canvas.ID}</CanvasListItemMeta>
                            ) : null}
                          </>
                        )}
                      </CanvasListItemBody>
                      <CanvasListTypeBadge icon={meta.icon}>{t(meta.labelKey)}</CanvasListTypeBadge>
                      {isEditing ? (
                        <CanvasListItemActions>
                          <CanvasListItemActionButton
                            variant="outline"
                            size="icon"
                            onClick={() => submitRename(canvas.ID)}
                            disabled={!editingName.trim() || renameCanvas.isPending}
                            aria-label={t('pages.canvases.renameConfirm')}
                          >
                            <Check size={14} />
                          </CanvasListItemActionButton>
                          <CanvasListItemActionButton
                            variant="ghost"
                            size="icon"
                            onClick={cancelRename}
                            aria-label={t('common.cancel')}
                            muted
                          >
                            <X size={14} />
                          </CanvasListItemActionButton>
                        </CanvasListItemActions>
                      ) : (
                        <CanvasListItemActions>
                          <CanvasListItemActionButton
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(canvasEditorPath(canvas.ID, { source }))}
                          >
                            {t('pages.canvases.open')} <ArrowRight size={14} />
                          </CanvasListItemActionButton>
                          <CanvasListItemActionButton
                            variant="ghost"
                            size="icon"
                            onClick={() => startRename(canvas)}
                            aria-label={t('pages.canvases.rename')}
                            muted
                          >
                            <Pencil size={14} />
                          </CanvasListItemActionButton>
                          <CanvasListItemActionButton
                            variant="ghost"
                            tone="danger"
                            size="icon"
                            onClick={() => removeCanvas.mutate(canvas.ID)}
                            disabled={removeCanvas.isPending}
                            aria-label={t('common.delete')}
                          >
                            <Trash2 size={14} />
                          </CanvasListItemActionButton>
                        </CanvasListItemActions>
                      )}
                    </CanvasListItem>
                  )
                })}
              </CanvasListItems>
              {pageCount > 1 ? (
                <CanvasListPagination>
                  <CanvasListPageStatus>
                    {t('pages.canvases.pageStatus', { page: currentPage, pageCount })}
                  </CanvasListPageStatus>
                  <CanvasListPageButton
                    type="button"
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={currentPage <= 1}
                    aria-label={t('pages.canvases.previousPage')}
                  >
                    <ChevronLeft size={14} />
                  </CanvasListPageButton>
                  <CanvasListPageButton
                    type="button"
                    onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                    disabled={currentPage >= pageCount}
                    aria-label={t('pages.canvases.nextPage')}
                  >
                    <ChevronRight size={14} />
                  </CanvasListPageButton>
                </CanvasListPagination>
              ) : null}
            </>
          )}
        </>
      )}

      <CanvasListCreateDialog
        open={showCreate}
        onClose={resetCreate}
        title={t('pages.canvases.newCanvas')}
      >
        <CanvasListCreateDialogBody>
          <CanvasListCreateField>
            <CanvasListCreateLabel>{t('pages.canvases.nameRequired')}</CanvasListCreateLabel>
            <CanvasListCreateInput
              autoFocus
              placeholder={t('pages.canvases.namePlaceholder')}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitCreate()
              }}
            />
          </CanvasListCreateField>

          <CanvasListCreateTypeGrid>
            {(Object.keys(TYPE_META) as CanvasType[]).map((type) => {
              const meta = TYPE_META[type]
              const selected = newCanvasType === type
              return (
                <CanvasListCreateTypeTile
                  key={type}
                  type="button"
                  selected={selected}
                  onClick={() => setNewCanvasType(type)}
                >
                  <CanvasListCreateTypeLabel icon={meta.icon}>
                    {t(meta.labelKey)}
                  </CanvasListCreateTypeLabel>
                  <CanvasListCreateTypeDescription selected={selected}>
                    {t(meta.descKey)}
                  </CanvasListCreateTypeDescription>
                </CanvasListCreateTypeTile>
              )
            })}
          </CanvasListCreateTypeGrid>

          <CanvasListCreateActions>
            <CanvasListCreateActionButton
              type="button"
              onClick={submitCreate}
              disabled={!newName.trim() || createCanvas.isPending}
              stretch
            >
              {createCanvas.isPending ? t('common.creating') : t('pages.canvases.createAndOpen')}
            </CanvasListCreateActionButton>
            <CanvasListCreateActionButton
              type="button"
              variant="outline"
              onClick={resetCreate}
            >
              {t('common.cancel')}
            </CanvasListCreateActionButton>
          </CanvasListCreateActions>
        </CanvasListCreateDialogBody>
      </CanvasListCreateDialog>
    </CanvasListShell>
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
