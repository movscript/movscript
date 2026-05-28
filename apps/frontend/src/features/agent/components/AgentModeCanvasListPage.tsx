import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, LayoutTemplate, Loader2, Pencil, Plus, Trash2, X, Zap, Lightbulb } from 'lucide-react'
import {
  AgentCanvasCreatePanel,
  AgentCanvasListPanel,
  AgentCanvasLoadingState,
  AgentCanvasPageLayout,
  AgentPageDescription,
  AgentPageEyebrowRow,
  AgentPageHeaderContent,
  AgentPageHeaderCopy,
  AgentPageShell,
  AgentPageShellBody,
  AgentPageShellHeader,
  CanvasListCreateActionButton,
  CanvasListCreateDialogBody,
  CanvasListCreateInput,
  CanvasListCreateTypeGrid,
  CanvasListCreateTypeLabel,
  CanvasListCreateTypeTile,
  CanvasListEmpty,
  CanvasListError,
  CanvasListItem,
  CanvasListItemActionButton,
  CanvasListItemActions,
  CanvasListItemBody,
  CanvasListItemIcon,
  CanvasListItemMeta,
  CanvasListItemName,
  CanvasListItemNameInput,
  CanvasListItems,
  CanvasListTypeBadge,
} from '@movscript/ui'

import { api } from '@/shared/infrastructure/api'
import { canvasEditorPath } from '@/routes/appRouteModel'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import type { Canvas, CanvasType } from '@/types'

const TYPE_META: Record<CanvasType, { label: string; icon: typeof Lightbulb }> = {
  inspiration: { label: '灵感画布', icon: Lightbulb },
  workflow: { label: '工作流', icon: Zap },
}

export default function AgentModeCanvasListPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const currentProject = useProjectStore((s) => s.current)
  const [newName, setNewName] = useState('')
  const [newCanvasType, setNewCanvasType] = useState<CanvasType>('inspiration')
  const [editingCanvasId, setEditingCanvasId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')

  const canvasesQuery = useQuery<Canvas[]>({
    queryKey: ['agent-mode-canvases', currentProject?.ID],
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
      queryClient.invalidateQueries({ queryKey: ['agent-mode-canvases'] })
      setNewName('')
      setNewCanvasType('inspiration')
      navigate(canvasEditorPath(canvas.ID, { source: 'agent' }))
    },
  })

  const renameCanvas = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.patch(`/canvases/${id}`, { name }).then((response) => response.data as Canvas),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-mode-canvases'] })
      setEditingCanvasId(null)
      setEditingName('')
    },
  })

  const removeCanvas = useMutation({
    mutationFn: (id: number) => api.delete(`/canvases/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-mode-canvases'] }),
  })

  const canvases = canvasesQuery.data ?? []

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
    <AgentPageShell>
      <AgentPageShellHeader>
        <AgentPageHeaderContent>
          <AgentPageHeaderCopy>
            <AgentPageEyebrowRow>
              <LayoutTemplate size={15} />
              <span>Agent 模式</span>
            </AgentPageEyebrowRow>
            <h1 className="type-title font-semibold text-foreground">画布列表</h1>
            <AgentPageDescription>
              管理当前项目可供 Agent 参考和执行的画布。
            </AgentPageDescription>
          </AgentPageHeaderCopy>
          <CanvasListTypeBadge>{canvases.length} 个画布</CanvasListTypeBadge>
        </AgentPageHeaderContent>
      </AgentPageShellHeader>

      <AgentPageShellBody>
        <AgentCanvasPageLayout>
          <AgentCanvasCreatePanel>
            <h2 className="type-body font-semibold text-foreground">新建画布</h2>
            <CanvasListCreateDialogBody>
              <CanvasListCreateInput
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitCreate()
                }}
                placeholder="画布名称"
              />
              <CanvasListCreateTypeGrid>
                {(Object.keys(TYPE_META) as CanvasType[]).map((type) => {
                  const meta = TYPE_META[type]
                  const Icon = meta.icon
                  return (
                    <CanvasListCreateTypeTile
                      key={type}
                      type="button"
                      selected={newCanvasType === type}
                      onClick={() => setNewCanvasType(type)}
                    >
                      <CanvasListCreateTypeLabel icon={<Icon size={14} />}>
                        {meta.label}
                      </CanvasListCreateTypeLabel>
                    </CanvasListCreateTypeTile>
                  )
                })}
              </CanvasListCreateTypeGrid>
              <CanvasListCreateActionButton type="button" stretch disabled={!newName.trim() || createCanvas.isPending} onClick={submitCreate}>
                {createCanvas.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                创建画布
              </CanvasListCreateActionButton>
            </CanvasListCreateDialogBody>
          </AgentCanvasCreatePanel>

          <AgentCanvasListPanel>
            {canvasesQuery.isLoading ? (
              <AgentCanvasLoadingState icon={<Loader2 size={14} className="animate-spin" />}>
                正在读取画布
              </AgentCanvasLoadingState>
            ) : canvasesQuery.error ? (
              <CanvasListError role="alert">
                {errorMessage(canvasesQuery.error)}
              </CanvasListError>
            ) : canvases.length === 0 ? (
              <CanvasListEmpty icon={LayoutTemplate} title="暂无画布">
                先在左侧创建一个灵感画布或工作流。
              </CanvasListEmpty>
            ) : (
              <CanvasListItems>
                {canvases.map((canvas) => (
                  <CanvasRow
                    key={canvas.ID}
                    canvas={canvas}
                    editing={editingCanvasId === canvas.ID}
                    editingName={editingName}
                    deleting={removeCanvas.isPending}
                    renaming={renameCanvas.isPending}
                    onEditNameChange={setEditingName}
                    onStartRename={() => startRename(canvas)}
                    onSubmitRename={() => submitRename(canvas.ID)}
                    onCancelRename={cancelRename}
                    onRemove={() => removeCanvas.mutate(canvas.ID)}
                    onOpen={() => navigate(canvasEditorPath(canvas.ID, { source: 'agent' }))}
                  />
                ))}
              </CanvasListItems>
            )}
          </AgentCanvasListPanel>
        </AgentCanvasPageLayout>
      </AgentPageShellBody>
    </AgentPageShell>
  )
}

function CanvasRow({
  canvas,
  editing,
  editingName,
  deleting,
  renaming,
  onEditNameChange,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onRemove,
  onOpen,
}: {
  canvas: Canvas
  editing: boolean
  editingName: string
  deleting: boolean
  renaming: boolean
  onEditNameChange: (value: string) => void
  onStartRename: () => void
  onSubmitRename: () => void
  onCancelRename: () => void
  onRemove: () => void
  onOpen: () => void
}) {
  const type = canvas.canvas_type ?? 'inspiration'
  const meta = TYPE_META[type]
  const Icon = meta.icon

  return (
    <CanvasListItem>
      <CanvasListItemIcon>
        <Icon size={17} />
      </CanvasListItemIcon>
      <CanvasListItemBody>
        {editing ? (
          <CanvasListItemNameInput
            value={editingName}
            onChange={(event) => onEditNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSubmitRename()
              if (event.key === 'Escape') onCancelRename()
            }}
            autoFocus
          />
        ) : (
          <>
            <CanvasListItemName>{canvas.name}</CanvasListItemName>
            <CanvasListItemMeta>#{canvas.ID} · {meta.label}</CanvasListItemMeta>
          </>
        )}
      </CanvasListItemBody>
      <CanvasListTypeBadge>{meta.label}</CanvasListTypeBadge>
      <CanvasListItemActions>
      {editing ? (
        <>
          <CanvasListItemActionButton type="button" size="icon-sm" variant="outline" disabled={!editingName.trim() || renaming} onClick={onSubmitRename} aria-label="确认重命名">
            <Check size={14} />
          </CanvasListItemActionButton>
          <CanvasListItemActionButton type="button" size="icon-sm" variant="ghost" onClick={onCancelRename} aria-label="取消">
            <X size={14} />
          </CanvasListItemActionButton>
        </>
      ) : (
        <>
          <CanvasListItemActionButton type="button" size="icon-sm" variant="ghost" onClick={onStartRename} aria-label="重命名">
            <Pencil size={14} />
          </CanvasListItemActionButton>
          <CanvasListItemActionButton type="button" size="icon-sm" variant="ghost" disabled={deleting} onClick={onRemove} aria-label="删除">
            <Trash2 size={14} />
          </CanvasListItemActionButton>
          <CanvasListItemActionButton type="button" size="icon-sm" variant="ghost" onClick={onOpen} aria-label="打开画布">
            <ArrowRight size={14} />
          </CanvasListItemActionButton>
        </>
      )}
      </CanvasListItemActions>
    </CanvasListItem>
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
