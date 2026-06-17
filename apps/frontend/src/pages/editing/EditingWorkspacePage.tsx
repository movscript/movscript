import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Film, FolderOpen, Loader2, Plus, Save, Scissors, Sparkles, Video } from 'lucide-react'
import { AppContentLayout, ProjectSurfaceHeader } from '@movscript/ui/layout'
import { Badge, Button, Input } from '@movscript/ui/primitives'

import type { ElectronMediaPipelineEditingProject } from '@/shared/contracts/electronApiMedia'
import type { ElectronAPI } from '@/shared/contracts/electronApi'

const EDITING_PROJECT_REGISTRY_KEY = 'movscript.editing-projects.v1'
const STANDALONE_EDITING_PROJECT_ID = 'standalone'

type EditingProjectSummary = {
  id: string
  projectId: string
  title: string
  updatedAt: string
  projectPath?: string
  snapshot?: ElectronMediaPipelineEditingProject
}

type SaveState =
  | { status: 'idle'; message?: string }
  | { status: 'saving'; message?: string }
  | { status: 'saved'; message: string }
  | { status: 'error'; message: string }

export default function EditingWorkspacePage() {
  const [projectTitle, setProjectTitle] = useState('未命名剪辑')
  const [projects, setProjects] = useState<EditingProjectSummary[]>([])
  const [activeProject, setActiveProject] = useState<ElectronMediaPipelineEditingProject | null>(null)
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })
  const mediaAPI = readMediaAPI()
  const hasMediaPipelineStore = Boolean(mediaAPI?.saveMediaEditingProject && mediaAPI?.getMediaEditingProject)

  useEffect(() => {
    setProjects(readEditingProjectRegistry())
  }, [])

  const activeProjectSummary = useMemo(() => {
    if (!activeProject) return null
    return projects.find((project) => project.id === activeProject.id) ?? null
  }, [activeProject, projects])

  async function createProject() {
    const editingProject = createEmptyEditingProject(projectTitle)
    setActiveProject(editingProject)
    await saveProject(editingProject)
  }

  async function openProject(project: EditingProjectSummary) {
    setSaveState({ status: 'idle' })
    if (mediaAPI?.getMediaEditingProject) {
      const result = await mediaAPI.getMediaEditingProject({
        projectId: project.projectId,
        editingProjectId: project.id,
      })
      if (result.status === 'ok') {
        setActiveProject(result.editingProject ?? result.editing_project)
        return
      }
    }
    if (project.snapshot) {
      setActiveProject(project.snapshot)
      return
    }
    setSaveState({ status: 'error', message: '未找到本地剪辑项目文件' })
  }

  async function saveProject(project = activeProject) {
    if (!project) return
    setSaveState({ status: 'saving' })
    try {
      const now = new Date().toISOString()
      const nextProject = {
        ...project,
        updatedAt: now,
        revision: (project.revision ?? 0) + 1,
      }
      const result = mediaAPI?.saveMediaEditingProject
        ? await mediaAPI.saveMediaEditingProject({ editingProject: nextProject })
        : undefined
      const savedProject = result?.editingProject ?? result?.editing_project ?? nextProject
      const nextProjects = upsertEditingProjectSummary(projects, {
        id: savedProject.id,
        projectId: savedProject.projectId,
        title: savedProject.title,
        updatedAt: savedProject.updatedAt ?? now,
        projectPath: result?.projectPath ?? result?.project_path,
        snapshot: savedProject,
      })
      setProjects(nextProjects)
      writeEditingProjectRegistry(nextProjects)
      setActiveProject(savedProject)
      setSaveState({ status: 'saved', message: result ? '已保存到本机剪辑工作区' : '已保存到浏览器本地记录' })
    } catch (error) {
      setSaveState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <AppContentLayout variant="contained" width="xwide" contentClassName="space-y-5 py-5">
      <ProjectSurfaceHeader
        icon={Scissors}
        title="剪辑"
        description="独立剪辑项目工作台"
        meta={(
          <>
            <Badge variant={hasMediaPipelineStore ? 'solid' : 'outline'} tone={hasMediaPipelineStore ? 'success' : 'warning'}>
              {hasMediaPipelineStore ? 'mediaPipeline 已连接' : '浏览器本地模式'}
            </Badge>
            {activeProject ? <Badge variant="outline">rev {activeProject.revision ?? 0}</Badge> : null}
          </>
        )}
        actions={(
          <>
            <Button type="button" variant="outline" className="gap-2" disabled={!activeProject || saveState.status === 'saving'} onClick={() => void saveProject()}>
              {saveState.status === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              保存
            </Button>
            <Button type="button" className="gap-2" disabled={!projectTitle.trim() || saveState.status === 'saving'} onClick={() => void createProject()}>
              <Plus size={14} />
              新建剪辑项目
            </Button>
          </>
        )}
      />

      <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-background p-4">
            <label className="block type-label font-medium text-muted-foreground" htmlFor="editing-project-title">项目名称</label>
            <Input
              id="editing-project-title"
              value={projectTitle}
              onChange={(event) => setProjectTitle(event.target.value)}
              className="mt-2"
            />
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="type-body font-semibold text-foreground">剪辑项目</h2>
              <Badge variant="outline">{projects.length}</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {projects.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 type-label text-muted-foreground">
                  暂无剪辑项目
                </div>
              ) : projects.map((project) => (
                <button
                  key={`${project.projectId}:${project.id}`}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-left transition hover:border-foreground/25 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => void openProject(project)}
                >
                  <span className="min-w-0">
                    <span className="block truncate type-label font-medium text-foreground">{project.title}</span>
                    <span className="block truncate type-caption text-muted-foreground">{formatEditingProjectTime(project.updatedAt)}</span>
                  </span>
                  <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          {saveState.status !== 'idle' ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 type-label text-muted-foreground">
              {saveState.status === 'saving' ? <Loader2 size={14} className="animate-spin" /> : saveState.status === 'saved' ? <CheckCircle2 size={14} className="text-success" /> : <Sparkles size={14} />}
              <span>{saveState.message}</span>
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate type-body font-semibold text-foreground">{activeProject?.title ?? '未打开剪辑项目'}</h2>
                <p className="mt-1 type-label text-muted-foreground">
                  {activeProjectSummary?.projectPath ?? activeProject?.id ?? '创建或打开一个剪辑项目'}
                </p>
              </div>
              {activeProject ? (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{activeProject.timeline.width}x{activeProject.timeline.height}</Badge>
                  <Badge variant="outline">{activeProject.timeline.fps} fps</Badge>
                  <Badge variant="outline">{activeProject.timeline.tracks.length} tracks</Badge>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex aspect-video min-h-[260px] items-center justify-center rounded-md border border-border bg-black text-white">
                <div className="text-center">
                  <Film size={32} className="mx-auto opacity-80" />
                  <p className="mt-3 text-sm font-medium">{activeProject ? activeProject.title : '剪辑预览'}</p>
                </div>
              </div>
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <h3 className="type-label font-medium text-muted-foreground">项目来源</h3>
                <dl className="mt-3 space-y-2 type-label">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">source</dt>
                    <dd className="truncate text-foreground">{String(activeProject?.source?.kind ?? 'manual')}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">assets</dt>
                    <dd className="text-foreground">{activeProject?.assets.assets.length ?? 0}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">duration</dt>
                    <dd className="text-foreground">{formatDuration(activeProject?.timeline.durationMs ?? 0)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2 type-body font-semibold text-foreground">
              <Video size={16} className="text-muted-foreground" />
              Timeline
            </div>
            <div className="mt-4 space-y-2">
              {(activeProject?.timeline.tracks ?? defaultTimelineTracks()).map((track) => (
                <div key={track.id} className="grid min-h-12 grid-cols-[120px_minmax(0,1fr)] overflow-hidden rounded-md border border-border">
                  <div className="flex items-center border-r border-border bg-muted/30 px-3 type-label font-medium text-foreground">
                    {track.type}
                  </div>
                  <div className="flex min-w-0 items-center gap-2 bg-muted/10 px-3">
                    {track.clips.length === 0 ? (
                      <span className="type-caption text-muted-foreground">empty</span>
                    ) : track.clips.map((clip) => (
                      <span key={clip.id} className="rounded-sm border border-primary/30 bg-primary/10 px-2 py-1 type-caption text-foreground">
                        {clip.id}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </AppContentLayout>
  )
}

function createEmptyEditingProject(title: string): ElectronMediaPipelineEditingProject {
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
      width: 1920,
      height: 1080,
      background: '#000000',
      durationMs: 0,
      tracks: defaultTimelineTracks(),
    },
    assets: { assets: [] },
    createdAt: now,
    updatedAt: now,
    revision: 0,
  }
}

function defaultTimelineTracks(): ElectronMediaPipelineEditingProject['timeline']['tracks'] {
  return [
    { id: 'track_video_0', type: 'video', zIndex: 0, clips: [] },
    { id: 'track_audio_0', type: 'audio', zIndex: 0, clips: [] },
    { id: 'track_subtitle_0', type: 'subtitle', zIndex: 1, clips: [] },
  ]
}

function readMediaAPI(): Pick<ElectronAPI, 'saveMediaEditingProject' | 'getMediaEditingProject'> | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { api?: ElectronAPI }).api
}

function readEditingProjectRegistry(): EditingProjectSummary[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(EDITING_PROJECT_REGISTRY_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isEditingProjectSummary) : []
  } catch {
    return []
  }
}

function writeEditingProjectRegistry(projects: EditingProjectSummary[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(EDITING_PROJECT_REGISTRY_KEY, JSON.stringify(projects.slice(0, 20)))
}

function upsertEditingProjectSummary(projects: EditingProjectSummary[], project: EditingProjectSummary) {
  return [project, ...projects.filter((candidate) => candidate.id !== project.id)].slice(0, 20)
}

function isEditingProjectSummary(value: unknown): value is EditingProjectSummary {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<EditingProjectSummary>
  return typeof candidate.id === 'string' && typeof candidate.projectId === 'string' && typeof candidate.title === 'string'
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

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
