import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, LayoutTemplate, Lightbulb, Pencil, Plus, Trash2, X, Zap } from 'lucide-react'
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
  CanvasListShell,
  CanvasListTitle,
  CanvasListTypeBadge,
} from '@movscript/ui'

import { canvasEditorPath, type CanvasRouteSource } from '@/routes/appRouteModel'
import { api } from '@/shared/infrastructure/api'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import type { Canvas, CanvasType } from '@/types'

const TYPE_META: Record<CanvasType, { labelKey: string; icon: JSX.Element; descKey: string }> = {
  inspiration: {
    labelKey: 'pages.canvases.types.inspiration',
    icon: <Lightbulb size={12} />,
    descKey: 'pages.canvases.typeDescriptions.inspiration',
  },
  workflow: {
    labelKey: 'pages.canvases.types.workflow',
    icon: <Zap size={12} />,
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

  const canvasesQuery = useQuery<Canvas[]>({
    queryKey: ['canvases', currentProject?.ID],
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
      queryClient.invalidateQueries({ queryKey: ['canvases'] })
      resetCreate()
      navigate(canvasEditorPath(canvas.ID, { source }))
    },
  })

  const removeCanvas = useMutation({
    mutationFn: (id: number) => api.delete(`/canvases/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['canvases'] }),
  })

  const renameCanvas = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.patch(`/canvases/${id}`, { name }).then((response) => response.data as Canvas),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canvases'] })
      setEditingCanvasId(null)
      setEditingName('')
    },
  })

  const canvases = canvasesQuery.data ?? []

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

      {canvasesQuery.isLoading ? (
        <CanvasListLoading>{t('common.loadingShort')}</CanvasListLoading>
      ) : canvasesQuery.error ? (
        <CanvasListError role="alert">
          {errorMessage(canvasesQuery.error)}
        </CanvasListError>
      ) : canvases.length === 0 ? (
        <CanvasListEmpty icon={LayoutTemplate} title={t('pages.canvases.empty')}>
          <CanvasListEmptyActionButton
            type="button"
            onClick={() => setShowCreate(true)}
          >
            {t('pages.canvases.createFirst')}
          </CanvasListEmptyActionButton>
        </CanvasListEmpty>
      ) : (
        <CanvasListItems>
          {canvases.map((canvas) => {
            const type = canvas.canvas_type ?? 'inspiration'
            const meta = TYPE_META[type]
            const isEditing = editingCanvasId === canvas.ID
            return (
              <CanvasListItem key={canvas.ID}>
                <CanvasListItemIcon>
                  <LayoutTemplate size={16} />
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
