import { Check, Film, FolderOpen, Loader2, Plus, Pencil, Trash2, X } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@movscript/ui/primitives'

import type { EditingProjectSummary } from '@movscript/editing-surface/registry'
import {
  EDITING_CANVAS_PRESETS,
  formatEditingListProjectTime,
  type EditingCanvasPresetId,
  type EditingListState,
} from '../application/editingListModel'

export function EditingListError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 type-label text-danger">
      {message}
    </div>
  )
}

export function EditingListEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-border bg-background">
      <div className="text-center">
        <Film size={36} className="mx-auto text-muted-foreground" />
        <h2 className="mt-4 type-title text-foreground">暂无剪辑项目</h2>
        <p className="mt-2 type-label text-muted-foreground">创建一个剪辑项目，开始组织素材和时间线。</p>
        <Button type="button" className="mt-4 gap-2" onClick={onCreate}>
          <Plus size={14} />
          新建剪辑
        </Button>
      </div>
    </section>
  )
}

export function EditingProjectGrid(props: {
  projects: EditingProjectSummary[]
  renamingProjectId: string
  renameTitle: string
  onCancelRename: () => void
  onCommitRename: (project: EditingProjectSummary) => void
  onDelete: (project: EditingProjectSummary) => void
  onOpen: (project: EditingProjectSummary) => void
  onRenameTitleChange: (title: string) => void
  onStartRename: (project: EditingProjectSummary) => void
}) {
  return (
    <section
      className="grid justify-start gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 22rem), 22rem))' }}
    >
      {props.projects.map((project) => (
        <EditingProjectCard
          key={`${project.projectId}:${project.id}`}
          project={project}
          renaming={props.renamingProjectId === project.id}
          renameTitle={props.renameTitle}
          onCancelRename={props.onCancelRename}
          onCommitRename={props.onCommitRename}
          onDelete={props.onDelete}
          onOpen={props.onOpen}
          onRenameTitleChange={props.onRenameTitleChange}
          onStartRename={props.onStartRename}
        />
      ))}
    </section>
  )
}

function EditingProjectCard(props: {
  project: EditingProjectSummary
  renaming: boolean
  renameTitle: string
  onCancelRename: () => void
  onCommitRename: (project: EditingProjectSummary) => void
  onDelete: (project: EditingProjectSummary) => void
  onOpen: (project: EditingProjectSummary) => void
  onRenameTitleChange: (title: string) => void
  onStartRename: (project: EditingProjectSummary) => void
}) {
  const {
    project,
    renaming,
    renameTitle,
    onCancelRename,
    onCommitRename,
    onDelete,
    onOpen,
    onRenameTitleChange,
    onStartRename,
  } = props

  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {renaming ? (
            <div className="flex min-w-0 items-center gap-2">
              <Input
                value={renameTitle}
                onChange={(event) => onRenameTitleChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onCommitRename(project)
                  if (event.key === 'Escape') onCancelRename()
                }}
                className="h-8 min-w-0"
                autoFocus
                aria-label={`重命名 ${project.title}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={!renameTitle.trim()}
                aria-label="保存项目名称"
                onClick={() => onCommitRename(project)}
              >
                <Check size={13} />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="取消重命名" onClick={onCancelRename}>
                <X size={13} />
              </Button>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate type-body font-semibold text-foreground">{project.title}</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`重命名 ${project.title}`}
                onClick={() => onStartRename(project)}
              >
                <Pencil size={13} />
              </Button>
            </div>
          )}
          <p className="mt-1 truncate type-caption text-muted-foreground">{project.projectPath ?? project.id}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          intent="danger"
          aria-label={`删除 ${project.title}`}
          onClick={() => onDelete(project)}
        >
          <Trash2 size={13} />
        </Button>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="type-caption text-muted-foreground">{formatEditingListProjectTime(project.updatedAt)}</span>
        <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => onOpen(project)}>
          <FolderOpen size={13} />
          打开
        </Button>
      </div>
    </article>
  )
}

export function EditingCreateProjectDialog(props: {
  canvasPresetId: EditingCanvasPresetId
  onCanvasPresetChange: (presetId: EditingCanvasPresetId) => void
  onCreate: () => void
  onOpenChange: (open: boolean) => void
  onProjectTitleChange: (title: string) => void
  open: boolean
  projectTitle: string
  state: EditingListState
}) {
  const {
    canvasPresetId,
    onCanvasPresetChange,
    onCreate,
    onOpenChange,
    onProjectTitleChange,
    open,
    projectTitle,
    state,
  } = props

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新建剪辑</DialogTitle>
          <DialogDescription>设置剪辑项目名称和画布比例。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="type-label font-medium text-foreground">项目名称</span>
            <Input
              value={projectTitle}
              onChange={(event) => onProjectTitleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onCreate()
              }}
              placeholder="剪辑项目名称"
              autoFocus
            />
          </label>
          <label className="block space-y-2">
            <span className="type-label font-medium text-foreground">画布比例</span>
            <select
              value={canvasPresetId}
              onChange={(event) => onCanvasPresetChange(event.target.value as EditingCanvasPresetId)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 type-label text-foreground"
              aria-label="画布比例"
            >
              {EDITING_CANVAS_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
          </label>
          {state.status === 'error' ? (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 type-label text-danger">
              {state.message}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={state.status === 'creating'}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={!projectTitle.trim() || state.status === 'creating'}
            onClick={onCreate}
          >
            {state.status === 'creating' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            创建并打开
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
