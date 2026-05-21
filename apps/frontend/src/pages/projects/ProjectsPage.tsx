import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Project } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { useState, useEffect } from 'react'
import { Plus, Trash2, ArrowRight, FolderOpen, Settings2, X } from 'lucide-react'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Badge } from '@movscript/ui'
import { Progress } from '@movscript/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { ROUTES } from '@/routes/projectRoutes'
import { isLocalLaunchMode } from '@/lib/config'
import { openAdminConsole } from '@/lib/adminConsole'
import { useAppSettingsStore } from '@/store/appSettingsStore'
import { useUserStore } from '@/store/userStore'
import { AppEmptyState, AppMetricCard, AppPage, AppPageHeader, AppSection } from '@/components/app/AppPage'
import { SemanticStatusBadge } from '@/components/app/SemanticStatusBadge'
import { semanticStatusLabel } from '@/components/app/semantic'

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
  draft: number
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

function ProjectCard({
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
  const { data: progress } = useQuery<ProjectProgress>({
    queryKey: ['progress', project.ID],
    queryFn: () => api.get(`/projects/${project.ID}/progress`).then((r) => r.data),
  })

  const status = (project.status ?? 'planning') as ProjectStatus
  const statusLabelKey = STATUS_STEPS.find((s) => s.status === status)?.labelKey
  const statusIdx = STATUS_STEPS.findIndex((s) => s.status === status)

  const contentUnits = progress?.content_units
  const approvedPct = contentUnits && contentUnits.total > 0 ? Math.round((contentUnits.approved / contentUnits.total) * 100) : 0

  return (
    <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden transition-all duration-200">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate">{project.name}</p>
            {project.description && (
              <p className="type-label text-muted-foreground mt-0.5 truncate">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <SemanticStatusBadge status={status} label={statusLabelKey ? t(statusLabelKey) : semanticStatusLabel(status)} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpen(project)}
              className="type-label gap-1"
            >
              {t('pages.projects.enter')} <ArrowRight size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDelete(project.ID)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>

        {/* Status steps */}
        <div className="flex gap-0.5">
          {STATUS_STEPS.map((step, i) => (
            <button
              key={step.status}
              onClick={() => onStatusChange(project.ID, step.status)}
              title={t(step.labelKey)}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                i <= statusIdx ? 'bg-primary' : 'bg-muted hover:bg-muted-foreground/20'
              }`}
            />
          ))}
        </div>

        {/* Stats */}
        {progress && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: t('entities.scripts'), value: progress.scripts },
              { label: t('entities.segments'), value: progress.segments },
              { label: t('entities.assetSlots'), value: progress.asset_slots },
              { label: t('pages.projects.members'), value: progress.members },
            ].map((s) => (
              <AppMetricCard key={s.label} label={s.label} value={s.value} compact />
            ))}
          </div>
        )}

        {/* Content unit progress */}
        {contentUnits && contentUnits.total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between type-label text-muted-foreground">
              <span>{t('pages.projects.contentUnitProgress')}</span>
              <span className="tabular-nums">{t('pages.projects.approvedCount', { approved: contentUnits.approved, total: contentUnits.total })}</span>
            </div>
            <Progress value={approvedPct} className="h-1.5" />
          </div>
        )}
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
              <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
              <Button onClick={handleSubmit} disabled={!name.trim()}>
                <Plus size={14} /> {t('pages.projects.createProject')}
              </Button>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  const { t } = useTranslation()

  return (
    <AppEmptyState
      icon={FolderOpen}
      title={t('pages.projects.empty')}
      detail={t('pages.projects.emptyHint')}
      action={(
        <Button onClick={onCreateClick} className="gap-2">
          <Plus size={15} /> {t('pages.projects.createFirst')}
        </Button>
      )}
    />
  )
}

export default function ProjectsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const current = useProjectStore((s) => s.current)
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const currentUser = useUserStore((s) => s.currentUser)
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
    queryKey: ['projects'],
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
      qc.invalidateQueries({ queryKey: ['projects'] })
      setCurrent(newProject)
      navigate(ROUTES.project.overview)
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/projects/${id}`),
    onSuccess: (_, id) => {
      if (current?.ID === id) setCurrent(null)
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ProjectStatus }) =>
      api.put(`/projects/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  function handleCreate(name: string, desc: string) {
    create.mutate({ name, description: desc })
  }

  function handleOpen(p: Project) {
    setCurrent(p)
    navigate(ROUTES.project.overview)
  }

  function dismissAdminPrompt() {
    setAdminPromptDismissed(true)
    try { localStorage.setItem(LOCAL_ADMIN_PROMPT_DISMISSED_KEY, 'true') } catch {}
  }

  const showAdminPrompt = isLocalLaunchMode(settings)
    && currentUser?.system_role === 'super_admin'
    && !adminPromptDismissed

  return (
    <AppPage width="normal">
      <AppPageHeader
        icon={FolderOpen}
        title={t('pages.projects.myProjects')}
        description={t('pages.projects.emptyHint')}
        actions={!isLoading && projects.length > 0 ? (
          <Button onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus size={14} /> {t('pages.projects.newProject')}
          </Button>
        ) : null}
      />

      {showAdminPrompt && (
        <div className="mb-5 rounded-lg border border-primary/30 bg-primary/5 p-4 type-body">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Settings2 size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{t('pages.projects.localAdminPrompt.title')}</p>
              <p className="mt-1 type-label leading-5 text-muted-foreground">{t('pages.projects.localAdminPrompt.description')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void openAdminConsole(settings.apiBaseURL, '/models')}
                >
                  {t('pages.projects.localAdminPrompt.openModels')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={dismissAdminPrompt}>
                  {t('common.dismiss')}
                </Button>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissAdminPrompt}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t('common.close')}
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      <AppSection title={t('pages.projects.myProjects')} action={<Badge variant="outline">{projects.length}</Badge>}>
        {isLoading ? (
          <p className="type-body text-muted-foreground">{t('common.loadingShort')}</p>
        ) : projects.length === 0 ? (
          <EmptyState onCreateClick={() => setShowCreate(true)} />
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.ID}
                project={p}
                onOpen={handleOpen}
                onDelete={(id) => remove.mutate(id)}
                onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
              />
            ))}
          </div>
        )}
      </AppSection>

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreate={(name, desc) => handleCreate(name, desc)}
        />
      )}
    </AppPage>
  )
}
