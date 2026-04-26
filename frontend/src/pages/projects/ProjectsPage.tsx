import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Project } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { useState, useEffect } from 'react'
import { Plus, Trash2, ArrowRight, FolderOpen, FileEdit, FileText, Layers, LayoutGrid, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ProjectStatus = 'planning' | 'script_analysis' | 'asset_prep' | 'production' | 'editing' | 'done'

const STATUS_STEPS: { status: ProjectStatus; label: string }[] = [
  { status: 'planning', label: '规划' },
  { status: 'script_analysis', label: '剧本分析' },
  { status: 'asset_prep', label: '素材准备' },
  { status: 'production', label: '制作' },
  { status: 'editing', label: '剪辑' },
  { status: 'done', label: '完成' },
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
  const { data: progress } = useQuery<ProjectProgress>({
    queryKey: ['progress', project.ID],
    queryFn: () => api.get(`/projects/${project.ID}/progress`).then((r) => r.data),
  })

  const status = (project.status ?? 'planning') as ProjectStatus
  const statusLabel = STATUS_STEPS.find((s) => s.status === status)?.label ?? status
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
            <Badge variant={STATUS_BADGE_VARIANT[status]}>{statusLabel}</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpen(project)}
              className="h-7 text-xs gap-1"
            >
              进入 <ArrowRight size={13} />
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
              title={step.label}
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
              { label: '剧本', value: progress.scripts },
              { label: '分集', value: progress.episodes },
              { label: '素材', value: progress.assets },
              { label: '成员', value: progress.members },
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
              <span>分镜进度</span>
              <span className="tabular-nums">{sb.approved}/{sb.total} 已通过</span>
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
    label: '完整制作',
    description: '从底稿开始，覆盖所有环节',
    icon: FileEdit,
    steps: ['底稿写作', '主剧本', '分集剧本', '分场剧本', '分镜脚本', '镜头生产', '剧集剪辑'],
  },
  {
    key: 'from_script',
    label: '有剧本二创',
    description: '已有剧本，从分集开始生产',
    icon: FileText,
    steps: ['主剧本', '分集剧本', '分场剧本', '分镜脚本', '镜头生产', '剧集剪辑'],
  },
  {
    key: 'from_storyboard',
    label: '有分镜',
    description: '已有分镜脚本，直接进行镜头生产',
    icon: Layers,
    steps: ['分镜脚本', '镜头生产', '剧集剪辑'],
  },
  {
    key: 'custom',
    label: '自定义',
    description: '从空白开始，手动构建生产管线',
    icon: LayoutGrid,
    steps: [],
  },
] as const

type TemplateKey = typeof TEMPLATES[number]['key']

function CreateProjectModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (name: string, desc: string, template: string) => void
}) {
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
            {step === 'template' ? '选择生产管线模板' : '新建项目'}
          </DialogTitle>
        </DialogHeader>

        {step === 'template' ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">选择适合你项目的生产管线，创建后可在管线页面自定义调整</p>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((t) => {
                const Icon = t.icon
                const selected = selectedTemplate === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => setSelectedTemplate(t.key)}
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
                        {t.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{t.description}</p>
                    {t.steps.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {t.steps.map((s) => (
                          <span key={s} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    {t.steps.length === 0 && (
                      <span className="text-[10px] text-muted-foreground italic">空白管线</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button onClick={() => setStep('info')}>
                下一步 <ArrowRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => setStep('template')}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft size={13} /> 返回选择模板
            </button>
            <div className="space-y-1.5">
              <Label htmlFor="project-name">项目名称 *</Label>
              <Input
                id="project-name"
                autoFocus
                placeholder="给项目起个名字"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-desc">项目描述（可选）</Label>
              <Textarea
                id="project-desc"
                placeholder="简单描述一下这个项目"
                rows={3}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button onClick={handleSubmit} disabled={!name.trim()}>
                <Plus size={14} /> 创建项目
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <FolderOpen size={28} className="text-muted-foreground" />
      </div>
      <h3 className="text-base font-medium text-foreground mb-1">还没有项目</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        创建你的第一个短剧项目，开始管理剧本、分集和素材
      </p>
      <Button onClick={onCreateClick} className="gap-2">
        <Plus size={15} /> 创建第一个项目
      </Button>
    </div>
  )
}

export default function ProjectsPage() {
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
        <h1 className="text-lg font-semibold text-foreground">我的项目</h1>
        {!isLoading && projects.length > 0 && (
          <Button onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus size={14} /> 新建项目
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
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
