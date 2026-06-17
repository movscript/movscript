import { useEffect, useState } from 'react'
import { Check, Film, FolderOpen, Loader2, Pencil, Plus, Scissors, Trash2, X } from 'lucide-react'
import { ProjectSurfaceHeader } from '@movscript/ui/layout'
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

import {
  readEditingProjectRegistry,
  upsertEditingProjectSummary,
  writeEditingProjectRegistry,
  type EditingProjectSummary,
} from '@/features/app-shell/application/editingProjectRegistry'
import { editingProjectPath } from '@/routes/appRouteModel'
import { openEditingProjectWindow } from '@/shared/infrastructure/appWindowContext'
import type { ElectronAPI } from '@/shared/contracts/electronApi'
import type { ElectronMediaPipelineEditingProject } from '@/shared/contracts/electronApiMedia'

const STANDALONE_EDITING_PROJECT_ID = 'standalone'
const EDITING_CANVAS_PRESETS = [
  { id: '16:9', label: '16:9 横屏', width: 1920, height: 1080 },
  { id: '9:16', label: '9:16 竖屏', width: 1080, height: 1920 },
  { id: '1:1', label: '1:1 方形', width: 1080, height: 1080 },
  { id: '4:5', label: '4:5 信息流', width: 1080, height: 1350 },
] as const

type EditingListMediaAPI = Pick<ElectronAPI, 'saveMediaEditingProject'>

type ListState =
  | { status: 'idle'; message?: string }
  | { status: 'creating'; message?: string }
  | { status: 'error'; message: string }

export default function EditingListPage() {
  const [projectTitle, setProjectTitle] = useState('未命名剪辑')
  const [projects, setProjects] = useState<EditingProjectSummary[]>([])
  const [state, setState] = useState<ListState>({ status: 'idle' })
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [renamingProjectId, setRenamingProjectId] = useState('')
  const [renameTitle, setRenameTitle] = useState('')
  const [canvasPresetId, setCanvasPresetId] = useState<(typeof EDITING_CANVAS_PRESETS)[number]['id']>('16:9')
  const mediaAPI = readMediaAPI()

  useEffect(() => {
    setProjects(readEditingProjectRegistry())
  }, [])

  async function createAndOpenProject() {
    if (!projectTitle.trim()) return
    setState({ status: 'creating', message: '正在创建剪辑项目' })
    try {
      const preset = EDITING_CANVAS_PRESETS.find((candidate) => candidate.id === canvasPresetId) ?? EDITING_CANVAS_PRESETS[0]
      const project = createEmptyEditingProject(projectTitle, preset)
      const result = mediaAPI?.saveMediaEditingProject
        ? await mediaAPI.saveMediaEditingProject({ editingProject: project })
        : undefined
      if (result?.status === 'conflict') {
        setState({ status: 'error', message: result.message || '剪辑项目版本已变化，创建已取消' })
        return
      }
      const savedProject = result?.editingProject ?? result?.editing_project ?? project
      const nextProjects = upsertEditingProjectSummary(projects, {
        id: savedProject.id,
        projectId: savedProject.projectId,
        title: savedProject.title,
        updatedAt: savedProject.updatedAt ?? new Date().toISOString(),
        projectPath: result?.projectPath ?? result?.project_path,
        snapshot: savedProject,
      })
      setProjects(nextProjects)
      writeEditingProjectRegistry(nextProjects)
      setShowCreateDialog(false)
      setProjectTitle('未命名剪辑')
      setState({ status: 'idle' })
      await openEditingProject(savedProject.id, savedProject.title)
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  async function openEditingProject(editingProjectId: string, title?: string) {
    await openEditingProjectWindow({
      editingProjectId,
      title,
      route: editingProjectPath(editingProjectId),
    })
  }

  function deleteProject(project: EditingProjectSummary) {
    const nextProjects = projects.filter((candidate) => candidate.id !== project.id)
    setProjects(nextProjects)
    writeEditingProjectRegistry(nextProjects)
  }

  function openCreateDialog() {
    setState({ status: 'idle' })
    setShowCreateDialog(true)
  }

  function startRenameProject(project: EditingProjectSummary) {
    setRenamingProjectId(project.id)
    setRenameTitle(project.title)
  }

  function cancelRenameProject() {
    setRenamingProjectId('')
    setRenameTitle('')
  }

  async function commitRenameProject(project: EditingProjectSummary) {
    const title = renameTitle.trim()
    if (!title) return
    if (title === project.title) {
      cancelRenameProject()
      return
    }
    try {
      const now = new Date().toISOString()
      const nextSnapshot = project.snapshot
        ? {
          ...project.snapshot,
          title,
          updatedAt: now,
          revision: (project.snapshot.revision ?? 0) + 1,
        }
        : undefined
      const result = nextSnapshot && mediaAPI?.saveMediaEditingProject
        ? await mediaAPI.saveMediaEditingProject({ editingProject: nextSnapshot, expectedRevision: project.snapshot?.revision })
        : undefined
      if (result?.status === 'conflict') {
        setState({ status: 'error', message: result.message || '剪辑项目版本已变化，重命名已取消' })
        return
      }
      const savedProject = result?.editingProject ?? result?.editing_project ?? nextSnapshot
      const nextProjects = projects.map((candidate) => {
        if (candidate.id !== project.id) return candidate
        return {
          ...candidate,
          title: savedProject?.title ?? title,
          updatedAt: savedProject?.updatedAt ?? now,
          projectPath: result?.projectPath ?? result?.project_path ?? candidate.projectPath,
          snapshot: savedProject ?? candidate.snapshot,
        }
      })
      setProjects(nextProjects)
      writeEditingProjectRegistry(nextProjects)
      cancelRenameProject()
      setState({ status: 'idle' })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <div className="space-y-5 py-5">
      <ProjectSurfaceHeader
        icon={Scissors}
        title="剪辑"
        actions={(
          <Button type="button" className="gap-2" onClick={openCreateDialog}>
            <Plus size={14} />
            新建剪辑
          </Button>
        )}
      />

      {state.status === 'error' ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 type-label text-danger">
          {state.message}
        </div>
      ) : null}

      {projects.length === 0 ? (
        <section className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-border bg-background">
          <div className="text-center">
            <Film size={36} className="mx-auto text-muted-foreground" />
            <h2 className="mt-4 type-title text-foreground">暂无剪辑项目</h2>
            <p className="mt-2 type-label text-muted-foreground">创建一个剪辑项目，开始组织素材和时间线。</p>
            <Button type="button" className="mt-4 gap-2" onClick={openCreateDialog}>
              <Plus size={14} />
              新建剪辑
            </Button>
          </div>
        </section>
      ) : (
        <section
          className="grid justify-start gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 22rem), 22rem))' }}
        >
          {projects.map((project) => (
            <article key={`${project.projectId}:${project.id}`} className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {renamingProjectId === project.id ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <Input
                        value={renameTitle}
                        onChange={(event) => setRenameTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void commitRenameProject(project)
                          if (event.key === 'Escape') cancelRenameProject()
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
                        onClick={() => void commitRenameProject(project)}
                      >
                        <Check size={13} />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" aria-label="取消重命名" onClick={cancelRenameProject}>
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
                        onClick={() => startRenameProject(project)}
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
                  onClick={() => deleteProject(project)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="type-caption text-muted-foreground">{formatEditingProjectTime(project.updatedAt)}</span>
                <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => void openEditingProject(project.id, project.title)}>
                  <FolderOpen size={13} />
                  打开
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}

      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (state.status === 'creating') return
        setShowCreateDialog(open)
        if (open) setState({ status: 'idle' })
      }}>
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
                onChange={(event) => setProjectTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createAndOpenProject()
                }}
                placeholder="剪辑项目名称"
                autoFocus
              />
            </label>
            <label className="block space-y-2">
              <span className="type-label font-medium text-foreground">画布比例</span>
              <select
                value={canvasPresetId}
                onChange={(event) => setCanvasPresetId(event.target.value as (typeof EDITING_CANVAS_PRESETS)[number]['id'])}
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
              onClick={() => setShowCreateDialog(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={!projectTitle.trim() || state.status === 'creating'}
              onClick={() => void createAndOpenProject()}
            >
              {state.status === 'creating' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              创建并打开
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function createEmptyEditingProject(
  title: string,
  canvas: Pick<(typeof EDITING_CANVAS_PRESETS)[number], 'width' | 'height'>,
): ElectronMediaPipelineEditingProject {
  const now = new Date().toISOString()
  const id = `editing_project_${Date.now()}`
  return {
    version: 1,
    id,
    projectId: STANDALONE_EDITING_PROJECT_ID,
    title: title.trim() || '未命名剪辑',
    source: { kind: 'manual' },
    timeline: {
      version: 1,
      id: `timeline_${id}`,
      fps: 24,
      width: canvas.width,
      height: canvas.height,
      background: '#000000',
      durationMs: 0,
      tracks: [],
    },
    assets: { assets: [] },
    createdAt: now,
    updatedAt: now,
    revision: 0,
  }
}

function readMediaAPI(): EditingListMediaAPI | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { api?: ElectronAPI }).api
}

function formatEditingProjectTime(value: string) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}
