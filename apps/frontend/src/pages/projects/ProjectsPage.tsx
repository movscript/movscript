import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Project } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { useState, useEffect } from 'react'
import { Plus, Trash2, ArrowRight, FolderOpen, FileEdit, FileText, Layers, LayoutGrid, ChevronLeft } from 'lucide-react'
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

type ProjectStatus = 'planning' | 'script_analysis' | 'asset_prep' | 'production' | 'editing' | 'done'

const STATUS_STEPS: { status: ProjectStatus; labelKey: string }[] = [
  { status: 'planning', labelKey: 'pages.projects.status.planning' },
  { status: 'script_analysis', labelKey: 'pages.projects.status.scriptAnalysis' },
  { status: 'asset_prep', labelKey: 'pages.projects.status.assetPrep' },
  { status: 'production', labelKey: 'pages.projects.status.production' },
  { status: 'editing', labelKey: 'pages.projects.status.editing' },
  { status: 'done', labelKey: 'pages.projects.status.done' },
]

const STATUS_BADGE_VARIANT: Record<ProjectStatus, 'secondary' | 'default' | 'outline'> = {
  planning:        'secondary',
  script_analysis: 'secondary',
  asset_prep:      'secondary',
  production:      'secondary',
  editing:         'secondary',
  done:            'default',
}

interface StoryboardProgress {
  total: number
  draft: number
  prompt_ready: number
  generating: number
  generated: number
  approved: number
}

interface ProjectProgress {
  scripts: number
  episodes: number
  assets: number
  members: number
  storyboards: StoryboardProgress
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

  const sb = progress?.storyboards
  const approvedPct = sb && sb.total > 0 ? Math.round((sb.approved / sb.total) * 100) : 0

  return (
    <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden transition-all duration-200">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate">{project.name}</p>
            {project.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant={STATUS_BADGE_VARIANT[status]}>{statusLabelKey ? t(statusLabelKey) : status}</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpen(project)}
              className="h-7 text-xs gap-1"
            >
              {t('pages.projects.enter')} <ArrowRight size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(project.ID)}
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>

        {/* Pipeline steps */}
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
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: t('entities.scripts'), value: progress.scripts },
              { label: t('entities.episodes'), value: progress.episodes },
              { label: t('entities.assets'), value: progress.assets },
              { label: t('pages.projects.members'), value: progress.members },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-base font-semibold text-foreground tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Storyboard progress */}
        {sb && sb.total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t('pages.projects.storyboardProgress')}</span>
              <span className="tabular-nums">{t('pages.projects.approvedCount', { approved: sb.approved, total: sb.total })}</span>
            </div>
            <Progress value={approvedPct} className="h-1.5" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Pipeline template definitions ────────────────────────────────────────────

const TEMPLATES = [
  {
    key: 'full_production',
    labelKey: 'pages.projects.templates.fullProduction.label',
    descriptionKey: 'pages.projects.templates.fullProduction.description',
    icon: FileEdit,
    stepKeys: ['pages.projects.templateSteps.mainScript', 'pages.projects.templateSteps.settingCreation', 'pages.projects.templateSteps.episodeScript', 'pages.projects.templateSteps.sceneScript', 'pages.projects.templateSteps.storyboardScript', 'pages.projects.templateSteps.shotProduction', 'pages.projects.templateSteps.episodeEditing'],
  },
  {
    key: 'from_script',
    labelKey: 'pages.projects.templates.fromScript.label',
    descriptionKey: 'pages.projects.templates.fromScript.description',
    icon: FileText,
    stepKeys: ['pages.projects.templateSteps.mainScript', 'pages.projects.templateSteps.settingCreation', 'pages.projects.templateSteps.episodeScript', 'pages.projects.templateSteps.sceneScript', 'pages.projects.templateSteps.storyboardScript', 'pages.projects.templateSteps.shotProduction', 'pages.projects.templateSteps.episodeEditing'],
  },
  {
    key: 'from_storyboard',
    labelKey: 'pages.projects.templates.fromStoryboard.label',
    descriptionKey: 'pages.projects.templates.fromStoryboard.description',
    icon: Layers,
    stepKeys: ['pages.projects.templateSteps.storyboardScript', 'pages.projects.templateSteps.shotProduction', 'pages.projects.templateSteps.episodeEditing'],
  },
  {
    key: 'custom',
    labelKey: 'pages.projects.templates.custom.label',
    descriptionKey: 'pages.projects.templates.custom.description',
    icon: LayoutGrid,
    stepKeys: [],
  },
] as const

type TemplateKey = typeof TEMPLATES[number]['key']

function CreateProjectModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (name: string, desc: string, template: string) => void
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState<'template' | 'info'>('template')
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('full_production')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  function handleSubmit() {
    if (!name.trim()) return
    onCreate(name.trim(), desc.trim(), selectedTemplate)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'template' ? t('pages.projects.selectTemplateTitle') : t('pages.projects.newProject')}
          </DialogTitle>
        </DialogHeader>

        {step === 'template' ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{t('pages.projects.templateHint')}</p>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((template) => {
                const Icon = template.icon
                const selected = selectedTemplate === template.key
                return (
                  <button
                    key={template.key}
                    onClick={() => setSelectedTemplate(template.key)}
                    className={`
                      p-3 rounded-lg border text-left transition-all
                      ${selected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon size={14} className={selected ? 'text-primary' : 'text-muted-foreground'} />
                      <span className={`text-sm font-medium ${selected ? 'text-primary' : 'text-foreground'}`}>
                        {t(template.labelKey)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{t(template.descriptionKey)}</p>
                    {template.stepKeys.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {template.stepKeys.map((s) => (
                          <span key={s} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {t(s)}
                          </span>
                        ))}
                      </div>
                    )}
                    {template.stepKeys.length === 0 && (
                      <span className="text-[10px] text-muted-foreground italic">{t('pages.projects.blankPipeline')}</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
              <Button onClick={() => setStep('info')}>
                {t('pages.projects.nextStep')} <ArrowRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => setStep('template')}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft size={13} /> {t('pages.projects.backToTemplate')}
            </button>
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
        )}
      </DialogContent>
    </Dialog>
  )
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <FolderOpen size={28} className="text-muted-foreground" />
      </div>
      <h3 className="text-base font-medium text-foreground mb-1">{t('pages.projects.empty')}</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        {t('pages.projects.emptyHint')}
      </p>
      <Button onClick={onCreateClick} className="gap-2">
        <Plus size={15} /> {t('pages.projects.createFirst')}
      </Button>
    </div>
  )
}

export default function ProjectsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const current = useProjectStore((s) => s.current)
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const [showCreate, setShowCreate] = useState(false)

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
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

  function handleCreate(name: string, desc: string, template: string) {
    create.mutate({ name, description: desc, pipeline_template: template })
  }

  function handleOpen(p: Project) {
    setCurrent(p)
    navigate('/scripts')
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-foreground">{t('pages.projects.myProjects')}</h1>
        {!isLoading && projects.length > 0 && (
          <Button onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus size={14} /> {t('pages.projects.newProject')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loadingShort')}</p>
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

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreate={(name, desc, template) => handleCreate(name, desc, template)}
        />
      )}
    </div>
  )
}
