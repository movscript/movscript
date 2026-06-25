import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { surfaceDataApi as api } from '@movscript/shared/surface-http'
import {
  isSurfaceLocalProjectEntry,
  mergeSurfaceRecentProjects,
  openSurfaceAdminConsole,
  openSurfaceProjectWindow,
  removeSurfaceLocalProjectRecent,
  setSurfaceCurrentProject,
  setSurfaceWorkMode,
  surfaceRoutePath,
  surfaceWorkspaceOwnerContext,
  type Project,
} from '@movscript/shared'
import { useMemo, useState, useEffect } from 'react'
import { Plus, Trash2, ArrowRight, FolderOpen } from 'lucide-react'
import { AppPageHeader } from '@movscript/ui/layout'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Progress,
  StatusBadge,
  Textarea
} from '@movscript/ui/primitives'
import { useTranslation } from 'react-i18next'
import { isLocalLaunchMode } from '@movscript/shared'
import { readSurfaceHostApi } from '@movscript/shared'
import { projectKeys } from '../application/projectQueries'
import {
  backendProjectWithLocalPath,
  bindLocalProjectToBackend,
  ensureBackendProjectForLocalProject,
  ensureProjectDataSpaceForLocalProject,
  resolveBackendProjectByUID,
  type LocalProjectScope,
} from '../application/localProjectLifecycle'
import { invalidateProjectMutationResult, projectListChangedResult } from '../application/projectMutationInvalidation'
import { readLocalAdminPromptDismissed, saveLocalAdminPromptDismissed } from '../presentation/localAdminPromptPreference'
import { projectStatusRecipe } from '../presentation/projectSemanticUi'
import { ProjectListPageLayout, ProjectPageActionButton, ProjectPageEmptyState, ProjectPageLocalAdminPrompt } from './ProjectPageUi'
import { useSurfaceHostState } from '../application/surfaceHostStateHooks'

interface ContentUnitProgress {
  total: number
  workspace: number
  prompt_ready: number
  generating: number
  approved: number
}

interface ProjectProgress {
  scripts: number
  segments: number
  asset_slots: number
  members: number
  content_units: ContentUnitProgress
  keyframes: {
    accepted: number
  }
}

function ProjectListRow({
  project,
  onOpen,
  onDelete,
}: {
  project: Project
  onOpen: (p: Project) => void
  onDelete: (project: Project) => void
}) {
  const { t } = useTranslation()
  const currentOrgID = useSurfaceHostState((state) => state.currentOrgID)
  const { data: progress } = useQuery<ProjectProgress>({
    queryKey: projectKeys.progress(currentOrgID, project.ID),
    queryFn: () => api.get(`/projects/${project.ID}/progress`).then((r) => r.data),
    enabled: project.ID > 0,
  })

  const contentUnits = progress?.content_units
  const approvedPct = contentUnits && contentUnits.total > 0 ? Math.round((contentUnits.approved / contentUnits.total) * 100) : 0
  const statusRecipe = projectStatusRecipe(contentUnits && contentUnits.total > 0 ? (approvedPct >= 100 ? 'ready' : 'active') : 'default')
  const stats = progress ? [
    { label: t('entities.scripts'), value: progress.scripts },
    { label: t('entities.segments'), value: progress.segments },
    { label: t('entities.assetSlots'), value: progress.asset_slots },
    { label: t('pages.projects.members'), value: progress.members },
  ] : []

  return (
    <div className="projects-list-row">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ProjectPageActionButton
            type="button"
            variant="link"
            size="xs"
            onClick={() => onOpen(project)}
            className="h-auto min-w-0 justify-start p-0 text-left type-body font-semibold text-foreground hover:text-primary"
          >
            {project.name}
          </ProjectPageActionButton>
          <StatusBadge {...statusRecipe}>
            {approvedPct >= 100 ? t('common.done') : t('common.inProgress')}
          </StatusBadge>
        </div>
        {project.description ? (
          <p className="mt-1 truncate type-label text-muted-foreground">{project.description}</p>
        ) : null}
      </div>

      <div className="projects-list-row__progress">
        {contentUnits && contentUnits.total > 0 ? (
          <>
            <div className="flex justify-between gap-3 type-label text-muted-foreground">
              <span className="truncate">{t('pages.projects.contentUnitProgress')}</span>
              <span className="shrink-0 tabular-nums">{t('pages.projects.approvedCount', { approved: contentUnits.approved, total: contentUnits.total })}</span>
            </div>
            <Progress value={approvedPct} className="mt-2 h-1.5" />
          </>
        ) : (
          <p className="type-label text-muted-foreground">{t('pages.projects.contentUnitProgress')}</p>
        )}
      </div>

      <dl className="projects-list-row__stats">
        {stats.length > 0 ? stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="truncate type-tiny text-muted-foreground">{s.label}</dt>
            <dd className="mt-0.5 type-body font-semibold tabular-nums text-foreground">{s.value}</dd>
          </div>
        )) : null}
      </dl>

      <div className="projects-list-row__actions">
        <ProjectPageActionButton
          variant="outline"
          size="sm"
          onClick={() => onOpen(project)}
          className="type-label gap-1"
        >
          {t('pages.projects.enter')} <ArrowRight size={14} />
        </ProjectPageActionButton>
        <ProjectPageActionButton
          variant="ghost"
          size="icon-sm"
          tone="danger"
          onClick={() => onDelete(project)}
          aria-label={t('common.delete')}
        >
          <Trash2 size={14} />
        </ProjectPageActionButton>
      </div>
    </div>
  )
}

function CreateProjectModal({ onClose, onCreate, onPickPath }: {
  onClose: () => void
  onCreate: (name: string, desc: string, projectDir?: string) => void
  onPickPath: () => Promise<string | null>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [projectDir, setProjectDir] = useState('')

  function handleSubmit() {
    if (!name.trim()) return
    if (!projectDir.trim()) return
    onCreate(name.trim(), desc.trim(), projectDir.trim() || undefined)
    onClose()
  }

  async function handlePickPath() {
    const path = await onPickPath()
    if (path) setProjectDir(path)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('pages.projects.newProject')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">{t('pages.projects.nameRequired')}</Label>
              <Input
                id="project-name"
                autoFocus
                placeholder={t('pages.projects.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-desc">{t('pages.projects.descriptionOptional')}</Label>
              <Textarea
                id="project-desc"
                placeholder={t('pages.projects.descriptionPlaceholder')}
                rows={3}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-path">{t('pages.projects.projectPath', '项目路径')}</Label>
              <div className="flex gap-2">
                <Input
                  id="project-path"
                  placeholder={t('pages.projects.projectPathPlaceholder', '选择或输入一个本地项目目录')}
                  value={projectDir}
                  onChange={(e) => setProjectDir(e.target.value)}
                />
                <ProjectPageActionButton type="button" variant="outline" onClick={() => void handlePickPath()}>
                  <FolderOpen size={14} />
                </ProjectPageActionButton>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <ProjectPageActionButton variant="ghost" onClick={onClose}>{t('common.cancel')}</ProjectPageActionButton>
              <ProjectPageActionButton onClick={handleSubmit} disabled={!name.trim() || !projectDir.trim()}>
                <Plus size={14} /> {t('pages.projects.createProject')}
              </ProjectPageActionButton>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function ProjectsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const current = useSurfaceHostState((state) => state.currentProject)
  const currentUser = useSurfaceHostState((state) => state.currentUser)
  const currentOrgID = useSurfaceHostState((state) => state.currentOrgID)
  const orgMemberships = useSurfaceHostState((state) => state.orgMemberships)
  const localRecentProjects = useSurfaceHostState((state) => state.localRecentProjects)
  const settings = useSurfaceHostState((state) => state.appSettings)
  const [showCreate, setShowCreate] = useState(false)
  const [adminPromptDismissed, setAdminPromptDismissed] = useState(readLocalAdminPromptDismissed)
  const [localProjectError, setLocalProjectError] = useState<string>()

  const { data: backendProjects = [], isLoading } = useQuery<Project[]>({
    queryKey: projectKeys.list(currentOrgID),
    queryFn: () => api.get('/projects').then((r) => r.data),
  })
  const projects = useMemo(() => {
    return mergeSurfaceRecentProjects(backendProjects, localRecentProjects)
  }, [backendProjects, localRecentProjects])

  useEffect(() => {
    if (!isLoading && current) {
      const exists = projects.some((p) => p.ID === current.ID)
      if (!exists) setSurfaceCurrentProject(null)
    }
  }, [projects, isLoading, current])

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/projects/${id}`),
    onSuccess: (_, id) => {
      if (current?.ID === id) setSurfaceCurrentProject(null)
      invalidateProjectMutationResult(qc, projectListChangedResult({ orgId: currentOrgID, changedIds: [id] }))
    },
  })

  function currentLocalProjectScope(): LocalProjectScope {
    const owner = surfaceWorkspaceOwnerContext({ currentUser, currentOrgID, orgMemberships })
    if (owner.orgId !== undefined) return { scopeKind: 'org', scopeId: String(owner.orgId) }
    if (owner.userId !== undefined) return { scopeKind: 'user', scopeId: String(owner.userId) }
    throw new Error('当前用户不可用，无法绑定后端项目')
  }

  async function handleCreate(name: string, desc: string, projectDir?: string) {
    if (!projectDir) {
      setLocalProjectError(t('pages.projects.projectPathRequired', '请选择或输入本地项目目录'))
      return
    }
    const api = readSurfaceHostApi()
    if (!api?.createLocalMovScriptProject) {
      setLocalProjectError(t('pages.projects.localProjectUnavailable', '当前环境不支持本地项目路径'))
      return
    }
    try {
      setLocalProjectError(undefined)
      const inspection = await api.inspectLocalMovScriptProject?.({ projectDir })
      const overwrite = inspection ? !inspection.canCreateClean : false
      if (inspection && overwrite && !window.confirm(`该目录已有 MovScript 项目文件：\n${inspection.impacts.join('\n') || '已有文件可能被影响'}\n\n是否强制创建并重新绑定？`)) {
        return
      }
      const result = await api.createLocalMovScriptProject({ projectDir, title: name, description: desc, overwrite })
      const ensured = await ensureBackendProjectForLocalProject(result)
      const scope = currentLocalProjectScope()
      await ensureProjectDataSpaceForLocalProject(result, scope)
      const bound = await bindLocalProjectToBackend(result, ensured.project, scope)
      const project = backendProjectWithLocalPath(ensured.project, bound)
      setSurfaceCurrentProject(project)
      setSurfaceWorkMode('project')
      void openSurfaceProjectWindow({ projectDir: bound.projectDir, project, route: surfaceRoutePath('project.home', { projectId: project.ID }) })
    } catch (error) {
      setLocalProjectError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleOpen(p: Project) {
    let projectToOpen = p
    let projectDir = p.workspace_path ?? p.project_path
    if (projectDir) {
      if (isSurfaceLocalProjectEntry(p)) {
        const result = await readSurfaceHostApi()?.openLocalMovScriptProject?.({ projectDir }).catch((error: unknown) => {
          setLocalProjectError(error instanceof Error ? error.message : String(error))
          return undefined
        })
        if (!result) return
        projectToOpen = result.project as Project
        projectDir = result.projectDir
      }
      setSurfaceCurrentProject(projectToOpen)
      setSurfaceWorkMode('project')
      void openSurfaceProjectWindow({ projectDir, project: projectToOpen, route: surfaceRoutePath('project.home', { projectId: projectToOpen.ID }) })
      return
    }
    setLocalProjectError(t('pages.projects.projectPathRequired', '这个项目没有本地路径，无法打开为路径绑定项目'))
  }

  function handleDeleteProject(project: Project) {
    if (project.local || project.ID < 0) {
      const projectDir = project.workspace_path ?? project.project_path
      if (projectDir) removeSurfaceLocalProjectRecent(projectDir)
      if (current?.ID === project.ID) setSurfaceCurrentProject(null)
      return
    }
    remove.mutate(project.ID)
  }

  async function handlePickProjectPath(): Promise<string | null> {
    const api = readSurfaceHostApi()
    return await api?.openDirectory?.() ?? null
  }

  async function handleOpenLocalProject() {
    const api = readSurfaceHostApi()
    const projectDir = await api?.openDirectory?.()
    if (!projectDir) return
    if (!api?.openLocalMovScriptProject) {
      setLocalProjectError(t('pages.projects.localProjectUnavailable', '当前环境不支持本地项目路径'))
      return
    }
    try {
      setLocalProjectError(undefined)
      const inspection = await api.inspectLocalMovScriptProject?.({ projectDir })
      if (!inspection?.projectUid) {
        setLocalProjectError(t('pages.projects.projectPathRequired', '该目录缺少 project_uid，无法作为 MovScript 项目打开'))
        return
      }
      const result = await api.openLocalMovScriptProject({ projectDir })
      const resolved = await resolveBackendProjectByUID(inspection.projectUid)
      if (!resolved && !window.confirm('后端没有找到这个 project_uid。是否在当前后端空间创建对应项目记录并打开？')) {
        return
      }
      const backendProject = resolved ?? (await ensureBackendProjectForLocalProject(result)).project
      const scope = currentLocalProjectScope()
      await ensureProjectDataSpaceForLocalProject(result, scope)
      const bound = await bindLocalProjectToBackend(result, backendProject, scope)
      const project = backendProjectWithLocalPath(backendProject, bound)
      setSurfaceCurrentProject(project)
      setSurfaceWorkMode('project')
      void openSurfaceProjectWindow({ projectDir: bound.projectDir, project, route: surfaceRoutePath('project.home', { projectId: project.ID }) })
    } catch (error) {
      setLocalProjectError(error instanceof Error ? error.message : String(error))
    }
  }

  function dismissAdminPrompt() {
    setAdminPromptDismissed(true)
    saveLocalAdminPromptDismissed()
  }

  const showAdminPrompt = isLocalLaunchMode(settings)
    && currentUser?.system_role === 'super_admin'
    && !adminPromptDismissed

  return (
    <ProjectListPageLayout>
      <AppPageHeader
        icon={FolderOpen}
        title={t('pages.projects.myProjects')}
        description={t('pages.projects.emptyHint')}
        actions={!isLoading && projects.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <ProjectPageActionButton variant="outline" onClick={() => void handleOpenLocalProject()} className="gap-1.5">
              <FolderOpen size={14} /> {t('pages.projects.openLocalProject', '打开本地项目')}
            </ProjectPageActionButton>
            <ProjectPageActionButton onClick={() => setShowCreate(true)} className="gap-1.5">
              <Plus size={14} /> {t('pages.projects.newProject')}
            </ProjectPageActionButton>
          </div>
        ) : null}
      />

      {localProjectError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 type-label text-destructive">
          {localProjectError}
        </div>
      ) : null}

      {showAdminPrompt && (
        <ProjectPageLocalAdminPrompt
          title={t('pages.projects.localAdminPrompt.title')}
          description={t('pages.projects.localAdminPrompt.description')}
          openLabel={t('pages.projects.localAdminPrompt.openModels')}
          dismissLabel={t('common.dismiss')}
          closeLabel={t('common.close')}
          onOpenModels={() => void openSurfaceAdminConsole(undefined, '/models')}
          onDismiss={dismissAdminPrompt}
        />
      )}

      <section className="projects-region" aria-label={t('pages.projects.myProjects')}>
        {isLoading ? (
          <div className="projects-region__body">
            <p className="type-body text-muted-foreground">{t('common.loadingShort')}</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="projects-region__body">
            <ProjectPageEmptyState
              icon={FolderOpen}
              title={t('pages.projects.empty')}
              action={(
                <div className="flex flex-wrap justify-center gap-2">
                  <ProjectPageActionButton onClick={() => setShowCreate(true)} className="gap-2">
                    <Plus size={14} /> {t('pages.projects.createFirst')}
                  </ProjectPageActionButton>
                  <ProjectPageActionButton variant="outline" onClick={() => void handleOpenLocalProject()} className="gap-2">
                    <FolderOpen size={14} /> {t('pages.projects.openLocalProject', '打开本地项目')}
                  </ProjectPageActionButton>
                </div>
              )}
            />
          </div>
        ) : (
          <div className="projects-list">
            {projects.map((p) => (
              <ProjectListRow
                key={p.ID}
                project={p}
                onOpen={handleOpen}
                onDelete={handleDeleteProject}
              />
            ))}
          </div>
        )}
      </section>

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreate={(name, desc, projectDir) => void handleCreate(name, desc, projectDir)}
          onPickPath={handlePickProjectPath}
        />
      )}
    </ProjectListPageLayout>
  )
}
