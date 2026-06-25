import { ChevronLeft, ChevronRight, Clock3, Layers3, Lightbulb, Search, Workflow } from 'lucide-react'
import {
  CanvasListCreateActionButton,
  CanvasListCreateActions,
  CanvasListCreateDialog,
  CanvasListCreateDialogBody,
  CanvasListCreateField,
  CanvasListCreateInput,
  CanvasListCreateLabel,
  CanvasListCreateTypeDescription,
  CanvasListCreateTypeGrid,
  CanvasListCreateTypeLabel,
  CanvasListCreateTypeTile,
  CanvasListEmpty,
  CanvasListEmptyActionButton,
  CanvasListFilterButton,
  CanvasListFilterGroup,
  CanvasListItems,
  CanvasListPageButton,
  CanvasListPageStatus,
  CanvasListPagination,
  CanvasListSearchBox,
  CanvasListSearchInput,
  CanvasListSummary,
  CanvasListToolbar,
} from './CanvasListUi'
import { CanvasListRow } from './CanvasListViewRow'
import {
  CANVAS_LIST_TYPE_FILTERS,
  CANVAS_LIST_TYPE_META,
  type CanvasListTranslate,
  type CanvasTypeFilter,
} from './CanvasListViewModel'

import type { Canvas, CanvasRouteSource, CanvasType, Project } from '@movscript/shared'

export function CanvasListProgramStrip({
  canvases,
  currentProject,
  t,
}: {
  canvases: Canvas[]
  currentProject: Project | null | undefined
  t: CanvasListTranslate
}) {
  const inspirationCount = canvases.filter((canvas) => (canvas.canvas_type ?? 'inspiration') === 'inspiration').length
  const workflowCount = canvases.filter((canvas) => (canvas.canvas_type ?? 'inspiration') === 'workflow').length

  return (
    <div className="canvas-list-program-strip" aria-label={t('pages.canvases.workspaceSummary', { defaultValue: '画布工作区概览' })}>
      <div className="canvas-list-program-strip__item">
        <span className="canvas-list-program-strip__icon"><Layers3 size={14} /></span>
        <span className="canvas-list-program-strip__label">{t('common.all')}</span>
        <strong className="canvas-list-program-strip__value">{canvases.length}</strong>
      </div>
      <div className="canvas-list-program-strip__item">
        <span className="canvas-list-program-strip__icon" data-canvas-type="inspiration"><Lightbulb size={14} /></span>
        <span className="canvas-list-program-strip__label">{t(CANVAS_LIST_TYPE_META.inspiration.labelKey)}</span>
        <strong className="canvas-list-program-strip__value">{inspirationCount}</strong>
      </div>
      <div className="canvas-list-program-strip__item">
        <span className="canvas-list-program-strip__icon" data-canvas-type="workflow"><Workflow size={14} /></span>
        <span className="canvas-list-program-strip__label">{t(CANVAS_LIST_TYPE_META.workflow.labelKey)}</span>
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
  )
}

export function CanvasListSearchAndFilters({
  search,
  typeFilter,
  onSearchChange,
  onTypeFilterChange,
  t,
}: {
  search: string
  typeFilter: CanvasTypeFilter
  onSearchChange: (value: string) => void
  onTypeFilterChange: (value: CanvasTypeFilter) => void
  t: CanvasListTranslate
}) {
  return (
    <CanvasListToolbar>
      <CanvasListSearchBox icon={<Search size={14} />}>
        <CanvasListSearchInput
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('pages.canvases.searchPlaceholder')}
          aria-label={t('pages.canvases.searchLabel')}
        />
      </CanvasListSearchBox>
      <CanvasListFilterGroup aria-label={t('pages.canvases.categoryFilter')}>
        {CANVAS_LIST_TYPE_FILTERS.map((filter) => (
          <CanvasListFilterButton
            key={filter}
            active={typeFilter === filter}
            onClick={() => onTypeFilterChange(filter)}
          >
            {filter === 'all' ? t('common.all') : t(CANVAS_LIST_TYPE_META[filter].labelKey)}
          </CanvasListFilterButton>
        ))}
      </CanvasListFilterGroup>
    </CanvasListToolbar>
  )
}

export function CanvasListResults({
  canvases,
  pagedCanvases,
  filteredCount,
  source,
  editingCanvasId,
  editingName,
  renamePending,
  removePending,
  pageCount,
  currentPage,
  hasFilters,
  onClearFilters,
  onOpen,
  onStartRename,
  onEditingNameChange,
  onSubmitRename,
  onCancelRename,
  onRemove,
  onPreviousPage,
  onNextPage,
  t,
}: {
  canvases: Canvas[]
  pagedCanvases: Canvas[]
  filteredCount: number
  source: CanvasRouteSource
  editingCanvasId: number | null
  editingName: string
  renamePending: boolean
  removePending: boolean
  pageCount: number
  currentPage: number
  hasFilters: boolean
  onClearFilters: () => void
  onOpen: (canvas: Canvas) => void
  onStartRename: (canvas: Canvas) => void
  onEditingNameChange: (value: string) => void
  onSubmitRename: (id: number) => void
  onCancelRename: () => void
  onRemove: (id: number) => void
  onPreviousPage: () => void
  onNextPage: () => void
  t: CanvasListTranslate
}) {
  return (
    <>
      <CanvasListSummary>
        {t('pages.canvases.resultSummary', { shown: filteredCount, total: canvases.length })}
      </CanvasListSummary>
      {filteredCount === 0 ? (
        <CanvasListEmpty icon={Search} title={t('pages.canvases.noResults')}>
          {hasFilters ? (
            <CanvasListEmptyActionButton type="button" onClick={onClearFilters}>
              {t('pages.canvases.clearFilters')}
            </CanvasListEmptyActionButton>
          ) : null}
        </CanvasListEmpty>
      ) : (
        <>
          <CanvasListItems>
            {pagedCanvases.map((canvas) => (
              <CanvasListRow
                key={canvas.ID}
                canvas={canvas}
                source={source}
                editing={editingCanvasId === canvas.ID}
                editingName={editingName}
                renamePending={renamePending}
                removePending={removePending}
                onOpen={onOpen}
                onStartRename={onStartRename}
                onEditingNameChange={onEditingNameChange}
                onSubmitRename={onSubmitRename}
                onCancelRename={onCancelRename}
                onRemove={onRemove}
                t={t}
              />
            ))}
          </CanvasListItems>
          {pageCount > 1 ? (
            <CanvasListPagination>
              <CanvasListPageStatus>
                {t('pages.canvases.pageStatus', { page: currentPage, pageCount })}
              </CanvasListPageStatus>
              <CanvasListPageButton
                type="button"
                onClick={onPreviousPage}
                disabled={currentPage <= 1}
                aria-label={t('pages.canvases.previousPage')}
              >
                <ChevronLeft size={14} />
              </CanvasListPageButton>
              <CanvasListPageButton
                type="button"
                onClick={onNextPage}
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
  )
}

export function CanvasListCreateModal({
  open,
  name,
  canvasType,
  creating,
  onClose,
  onNameChange,
  onCanvasTypeChange,
  onSubmit,
  t,
}: {
  open: boolean
  name: string
  canvasType: CanvasType
  creating: boolean
  onClose: () => void
  onNameChange: (value: string) => void
  onCanvasTypeChange: (value: CanvasType) => void
  onSubmit: () => void
  t: CanvasListTranslate
}) {
  return (
    <CanvasListCreateDialog open={open} onClose={onClose} title={t('pages.canvases.newCanvas')}>
      <CanvasListCreateDialogBody>
        <CanvasListCreateField>
          <CanvasListCreateLabel>{t('pages.canvases.nameRequired')}</CanvasListCreateLabel>
          <CanvasListCreateInput
            autoFocus
            placeholder={t('pages.canvases.namePlaceholder')}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSubmit()
            }}
          />
        </CanvasListCreateField>

        <CanvasListCreateTypeGrid>
          {(Object.keys(CANVAS_LIST_TYPE_META) as CanvasType[]).map((type) => {
            const meta = CANVAS_LIST_TYPE_META[type]
            const selected = canvasType === type
            return (
              <CanvasListCreateTypeTile
                key={type}
                type="button"
                selected={selected}
                onClick={() => onCanvasTypeChange(type)}
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
            onClick={onSubmit}
            disabled={!name.trim() || creating}
            stretch
          >
            {creating ? t('common.creating') : t('pages.canvases.createAndOpen')}
          </CanvasListCreateActionButton>
          <CanvasListCreateActionButton type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </CanvasListCreateActionButton>
        </CanvasListCreateActions>
      </CanvasListCreateDialogBody>
    </CanvasListCreateDialog>
  )
}
