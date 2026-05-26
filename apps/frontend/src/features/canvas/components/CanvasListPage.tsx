import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/shared/infrastructure/api'
import { canvasEditorPath } from '@/routes/appRouteModel'
import type { Canvas, CanvasType } from '@/types'
import { Plus, Trash2, ArrowRight, LayoutTemplate, Lightbulb, Zap, Pencil, Check, X } from 'lucide-react'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
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
  CanvasListHeader,
  CanvasListHeaderText,
  CanvasListItem,
  CanvasListItemActionButton,
  CanvasListItemActions,
  CanvasListItemBody,
  CanvasListItemIcon,
  CanvasListItemName,
  CanvasListItemNameInput,
  CanvasListItems,
  CanvasListLoading,
  CanvasListShell,
  CanvasListTitle,
  CanvasListTypeBadge,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'

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

export default function CanvasListPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const currentProject = useProjectStore((s) => s.current)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCanvasType, setNewCanvasType] = useState<CanvasType>('inspiration')
  const [editingCanvasId, setEditingCanvasId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')

  const { data: canvases = [], isLoading } = useQuery<Canvas[]>({
    queryKey: ['canvases', currentProject?.ID],
    queryFn: () => {
      const params: Record<string, string> = {}
      if (currentProject?.ID) params.project_id = String(currentProject.ID)
      return api.get('/canvases', { params }).then((r) => r.data)
    },
  })

  const create = useMutation({
    mutationFn: (payload: { name: string; canvas_type: CanvasType; project_id?: number }) =>
      api.post('/canvases', payload).then((r) => r.data as Canvas),
    onSuccess: (cv) => {
      qc.invalidateQueries({ queryKey: ['canvases'] })
      setShowCreate(false)
      setNewName('')
      setNewCanvasType('inspiration')
      navigate(canvasEditorPath(cv.ID, { source: 'detail' }))
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/canvases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvases'] }),
  })

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.patch(`/canvases/${id}`, { name }).then((r) => r.data as Canvas),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canvases'] })
      setEditingCanvasId(null)
      setEditingName('')
    },
  })

  function handleCreate() {
    if (!newName.trim()) return
    create.mutate({ name: newName.trim(), canvas_type: newCanvasType, project_id: currentProject?.ID })
  }

  function startRename(cv: Canvas) {
    setEditingCanvasId(cv.ID)
    setEditingName(cv.name)
  }

  function submitRename(id: number) {
    const name = editingName.trim()
    if (!name) return
    rename.mutate({ id, name })
  }

  function cancelRename() {
    setEditingCanvasId(null)
    setEditingName('')
  }

  return (
    <CanvasListShell>
      <CanvasListHeader>
        <CanvasListHeaderText>
          <CanvasListTitle>{t('header.titles.canvases')}</CanvasListTitle>
          <CanvasListDescription>{t('pages.canvases.subtitle')}</CanvasListDescription>
        </CanvasListHeaderText>
        <CanvasListCreateButton onClick={() => setShowCreate(true)}>
          <Plus size={14} /> {t('pages.canvases.newCanvas')}
        </CanvasListCreateButton>
      </CanvasListHeader>

      {isLoading ? (
        <CanvasListLoading>{t('common.loadingShort')}</CanvasListLoading>
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
          {canvases.map((cv) => {
            const type = cv.canvas_type ?? 'inspiration'
            const meta = TYPE_META[type]
            const isEditing = editingCanvasId === cv.ID
            return (
              <CanvasListItem key={cv.ID}>
                <CanvasListItemIcon>
                  <LayoutTemplate size={16} />
                </CanvasListItemIcon>
                <CanvasListItemBody>
                  {isEditing ? (
                    <CanvasListItemNameInput
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename(cv.ID)
                        if (e.key === 'Escape') cancelRename()
                      }}
                    />
                  ) : (
                    <CanvasListItemName>{cv.name}</CanvasListItemName>
                  )}
                </CanvasListItemBody>
                <CanvasListTypeBadge icon={meta.icon}>{t(meta.labelKey)}</CanvasListTypeBadge>
                {isEditing ? (
                  <CanvasListItemActions>
                    <CanvasListItemActionButton
                      variant="outline"
                      size="icon"
                      onClick={() => submitRename(cv.ID)}
                      disabled={!editingName.trim() || rename.isPending}
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
                      onClick={() => navigate(canvasEditorPath(cv.ID, { source: 'detail' }))}
                    >
                      {t('pages.canvases.open')} <ArrowRight size={14} />
                    </CanvasListItemActionButton>
                    <CanvasListItemActionButton
                      variant="ghost"
                      size="icon"
                      onClick={() => startRename(cv)}
                      aria-label={t('pages.canvases.rename')}
                      muted
                    >
                      <Pencil size={14} />
                    </CanvasListItemActionButton>
                    <CanvasListItemActionButton
                      variant="ghost"
                      tone="danger"
                      size="icon"
                      onClick={() => remove.mutate(cv.ID)}
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
        onClose={() => { setShowCreate(false); setNewName(''); setNewCanvasType('inspiration') }}
        title={t('pages.canvases.newCanvas')}
      >
        <CanvasListCreateDialogBody>
          <CanvasListCreateField>
            <CanvasListCreateLabel>{t('pages.canvases.nameRequired')}</CanvasListCreateLabel>
            <CanvasListCreateInput
              autoFocus
              placeholder={t('pages.canvases.namePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
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
              onClick={handleCreate}
              disabled={!newName.trim() || create.isPending}
              stretch
            >
              {create.isPending ? t('common.creating') : t('pages.canvases.createAndOpen')}
            </CanvasListCreateActionButton>
            <CanvasListCreateActionButton
              variant="outline"
              onClick={() => { setShowCreate(false); setNewName(''); setNewCanvasType('inspiration') }}
            >
              {t('common.cancel')}
            </CanvasListCreateActionButton>
          </CanvasListCreateActions>
        </CanvasListCreateDialogBody>
      </CanvasListCreateDialog>
    </CanvasListShell>
  )
}
