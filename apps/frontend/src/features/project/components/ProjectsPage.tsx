import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/shared/infrastructure/api'
import type { Project } from '@/types'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useState, useEffect } from 'react'
import { Plus, Trash2, ArrowRight, FolderOpen } from 'lucide-react'
import {
  AppPageHeader,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Progress,
  ProjectPageActionButton,
  ProjectPageEmptyState,
  ProjectListPageLayout,
  ProjectPageLocalAdminPrompt,
  StatusBadge,
  Textarea,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { ROUTES } from '@/routes/projectRoutes'
import { routeForWorkMode } from '@/routes/appRouteModel'
import { isLocalLaunchMode } from '@/shared/infrastructure/config'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { projectListQueryKey, projectProgressQueryKey } from '@/features/project/application/projectQueries'
import { initializeProjectGitWorkspace } from '@/features/project/application/projectGitWorkspace'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { projectStatusRecipe } from '@/features/project/presentation/projectSemanticUi'

type ProjectStatus = 'planning' | 'script_analysis' | 'asset_prep' | 'production' | 'editing' | 'done'

const STATUS_STEPS: { status: ProjectStatus; labelKey: string }[] = [
  { status: 'planning', labelKey: 'pages.projects.status.planning' },
  { status: 'script_analysis', labelKey: 'pages.projects.status.scriptAnalysis' },
  { status: 'asset_prep', labelKey: 'pages.projects.status.assetPrep' },
  { status: 'production', labelKey: 'pages.projects.status.production' },
  { status: 'editing', labelKey: 'pages.projects.status.editing' },
  { status: 'done', labelKey: 'pages.projects.status.done' },
]

const LOCAL_ADMIN_PROMPT_DISMISSED_KEY = 'movscript-local-admin-prompt-dismissed'

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
  onStatusChange,
}: {
  project: Project
  onOpen: (p: Project) => void
  onDelete: (id: number) => void
  onStatusChange: (id: number, status: ProjectStatus) => void
}) {
  const { t } = useTranslation()
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const { data: progress } = useQuery<ProjectProgress>({
    queryKey: projectProgressQueryKey(currentOrgID, project.ID),
    queryFn: () => api.get(`/projects/${project.ID}/progress`).then((r) => r.data),
  })

  const status = (project.status ?? 'planning') as ProjectStatus
  const statusLabelKey = STATUS_STEPS.find((s) => s.status === status)?.labelKey
  const statusIdx = STATUS_STEPS.findIndex((s) => s.status === status)

  const contentUnits = progress?.content_units
  const approvedPct = contentUnits && contentUnits.total > 0 ? Math.round((contentUnits.approved / contentUnits.total) * 100) : 0
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
          <StatusBadge {...projectStatusRecipe(status)}>{statusLabelKey ? t(statusLabelKey) : status}</StatusBadge>
        </div>
        {project.description ? (
          <p className="mt-1 truncate type-label text-muted-foreground">{project.description}</p>
        ) : null}
        <div className="mt-3 flex gap-0.5">
          {STATUS_STEPS.map((step, i) => (
            <ProjectPageActionButton
              key={step.status}
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onStatusChange(project.ID, step.status)}
              title={t(step.labelKey)}
              aria-label={t(step.labelKey)}
              className={`h-1.5 min-w-0 flex-1 rounded-full p-0 ${
                i <= statusIdx ? 'bg-primary' : 'border border-border bg-transparent hover:border-muted-foreground/40'
              }`}
            />
          ))}
        </div>
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

function CreateProjectModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (name: string, desc: string) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  function handleSubmit() {
    if (!name.trim()) return
    onCreate(name.trim(), desc.trim())
    onClose()
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
  const navigate = useNavigate()
  const current = useProjectStore((s) => s.current)
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const currentUser = useUserStore((s) => s.currentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const settings = useAppSettingsStore((s) => s.settings)
  const [showCreate, setShowCreate] = useState(false)
  const [adminPromptDismissed, setAdminPromptDismissed] = useState(() => {
    try {
      return localStorage.getItem(LOCAL_ADMIN_PROMPT_DISMISSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: projectListQueryKey(currentOrgID),
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
      qc.invalidateQueries({ queryKey: projectListQueryKey(currentOrgID) })
      void initializeProjectGitWorkspace(newProject, currentOrgID)
      setCurrent(newProject)
      navigate(routeForWorkMode(settings.workMode, true))
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/projects/${id}`),
    onSuccess: (_, id) => {
      if (current?.ID === id) setCurrent(null)
      qc.invalidateQueries({ queryKey: projectListQueryKey(currentOrgID) })
    },
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ProjectStatus }) =>
      api.put(`/projects/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectListQueryKey(currentOrgID) }),
  })

  function handleCreate(name: string, desc: string) {
    create.mutate({ name, description: desc })
  }

  function handleOpen(p: Project) {
    setCurrent(p)
    navigate(routeForWorkMode(settings.workMode, true))
  }

  function dismissAdminPrompt() {
    setAdminPromptDismissed(true)
    try { localStorage.setItem(LOCAL_ADMIN_PROMPT_DISMISSED_KEY, 'true') } catch {}
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
          <ProjectPageActionButton onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus size={14} /> {t('pages.projects.newProject')}
          </ProjectPageActionButton>
        ) : null}
      />

      {showAdminPrompt && (
        <ProjectPageLocalAdminPrompt
          title={t('pages.projects.localAdminPrompt.title')}
          description={t('pages.projects.localAdminPrompt.description')}
          openLabel={t('pages.projects.localAdminPrompt.openModels')}
          dismissLabel={t('common.dismiss')}
          closeLabel={t('common.close')}
          onOpenModels={() => void openAdminConsole(settings.apiBaseURL, '/models')}
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
                <ProjectPageActionButton onClick={() => setShowCreate(true)} className="gap-2">
                  <Plus size={14} /> {t('pages.projects.createFirst')}
                </ProjectPageActionButton>
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
                onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
              />
            ))}
          </div>
        )}
      </section>

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreate={(name, desc) => handleCreate(name, desc)}
        />
      )}
    </ProjectListPageLayout>
  )
}
