import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import type { Project } from '@/types'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { openProjectWindow } from '@/shared/infrastructure/appWindowContext'
import { useState, useEffect } from 'react'
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
import { ROUTES } from '@/routes/projectRoutes'
import { isLocalLaunchMode } from '@/shared/infrastructure/config'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { projectKeys } from '@/features/project/application/projectQueries'
import { invalidateProjectMutationResult, projectListChangedResult } from '@/features/project/application/projectMutationInvalidation'
import { initializeProjectGitWorkspace } from '@/features/project/application/projectGitWorkspace'
import { readLocalAdminPromptDismissed, saveLocalAdminPromptDismissed } from '@/features/project/presentation/localAdminPromptPreference'
import { projectStatusRecipe } from '@/features/project/presentation/projectSemanticUi'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ProjectListPageLayout, ProjectPageActionButton, ProjectPageEmptyState, ProjectPageLocalAdminPrompt } from './ProjectPageUi'

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
  onDelete: (id: number) => void
}) {
  const { t } = useTranslation()
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const { data: progress } = useQuery<ProjectProgress>({
    queryKey: projectKeys.progress(currentOrgID, project.ID),
    queryFn: () => api.get(`/projects/${project.ID}/progress`).then((r) => r.data),
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
          onClick={() => onDelete(project.ID)}
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
                  placeholder={t('pages.projects.projectPathPlaceholder', '留空则创建云端项目，或选择一个本地目录')}
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
              <ProjectPageActionButton onClick={handleSubmit} disabled={!name.trim()}>
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
  const current = useProjectStore((s) => s.current)
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const currentUser = useUserStore((s) => s.currentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const settings = useAppSettingsStore((s) => s.settings)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)
  const [showCreate, setShowCreate] = useState(false)
  const [adminPromptDismissed, setAdminPromptDismissed] = useState(readLocalAdminPromptDismissed)
  const [localProjectError, setLocalProjectError] = useState<string>()

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: projectKeys.list(currentOrgID),
    queryFn: () => api.get('/projects').then((r) => r.data),
  })

  useEffect(() => {
    if (!isLoading && current) {
      const exists = projects.some((p) => p.ID === current.ID)
      if (!exists) setCurrent(null)
    }
  }, [projects, isLoading, current, setCurrent])

  const create = useMutation({
    mutationFn: (p: Partial<Project>) => api.post('/projects', p).then((r) => r.data),
    onSuccess: (newProject: Project) => {
      invalidateProjectMutationResult(qc, projectListChangedResult({ orgId: currentOrgID, changedIds: [newProject.ID] }))
      void initializeProjectGitWorkspace(newProject, currentOrgID)
      setCurrent(newProject)
      setWorkMode('project')
      void openProjectWindow({ projectId: newProject.ID, project: newProject, route: ROUTES.project.home })
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/projects/${id}`),
    onSuccess: (_, id) => {
      if (current?.ID === id) setCurrent(null)
      invalidateProjectMutationResult(qc, projectListChangedResult({ orgId: currentOrgID, changedIds: [id] }))
    },
  })

  async function handleCreate(name: string, desc: string, projectDir?: string) {
    if (!projectDir) {
      create.mutate({ name, description: desc })
      return
    }
    const api = readElectronApi()
    if (!api?.createLocalMovScriptProject) {
      setLocalProjectError(t('pages.projects.localProjectUnavailable', '当前环境不支持本地项目路径'))
      return
    }
    try {
      setLocalProjectError(undefined)
      const result = await api.createLocalMovScriptProject({ projectDir, title: name, description: desc })
      setCurrent(result.project as Project)
      setWorkMode('project')
      void openProjectWindow({ projectDir: result.projectDir, project: result.project, route: ROUTES.project.home })
    } catch (error) {
      setLocalProjectError(error instanceof Error ? error.message : String(error))
    }
  }

  function handleOpen(p: Project) {
    setCurrent(p)
    setWorkMode('project')
    if (p.workspace_path || p.project_path) {
      void openProjectWindow({ projectDir: p.workspace_path ?? p.project_path, project: p, route: ROUTES.project.home })
      return
    }
    void openProjectWindow({ projectId: p.ID, project: p, route: ROUTES.project.home })
  }

  async function handlePickProjectPath(): Promise<string | null> {
    const api = readElectronApi()
    return await api?.openDirectory?.() ?? null
  }

  async function handleOpenLocalProject() {
    const api = readElectronApi()
    const projectDir = await api?.openDirectory?.()
    if (!projectDir) return
    if (!api?.openLocalMovScriptProject) {
      setLocalProjectError(t('pages.projects.localProjectUnavailable', '当前环境不支持本地项目路径'))
      return
    }
    try {
      setLocalProjectError(undefined)
      const result = await api.openLocalMovScriptProject({ projectDir })
      setCurrent(result.project as Project)
      setWorkMode('project')
      void openProjectWindow({ projectDir: result.projectDir, project: result.project, route: ROUTES.project.home })
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
          onOpenModels={() => void openAdminConsole(undefined, '/models')}
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
                    onDelete={(id) => remove.mutate(id)}
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
