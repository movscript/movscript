import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Canvas, CanvasType } from '@/types'
import { Plus, Trash2, ArrowRight, LayoutTemplate, Lightbulb, Zap } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const TYPE_META: Record<CanvasType, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  inspiration: {
    label: '灵感激发',
    icon: <Lightbulb size={12} />,
    color: 'bg-muted text-foreground border-border',
    desc: '手动逐节点运行，自由探索创意',
  },
  workflow: {
    label: '工作流',
    icon: <Zap size={12} />,
    color: 'bg-muted text-foreground border-border',
    desc: '定义输入输出，全流程自动执行',
  },
}

export default function CanvasListPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const currentProject = useProjectStore((s) => s.current)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<CanvasType>('inspiration')

  const { data: canvases = [], isLoading } = useQuery<Canvas[]>({
    queryKey: ['canvases', currentProject?.ID],
    queryFn: () => {
      const params: Record<string, string> = {}
      if (currentProject?.ID) params.project_id = String(currentProject.ID)
      return api.get('/canvases', { params }).then((r) => r.data)
    },
  })

  const create = useMutation({
    mutationFn: (payload: { name: string; canvas_type: CanvasType; project_id?: number }) =>
      api.post('/canvases', payload).then((r) => r.data as Canvas),
    onSuccess: (cv) => {
      qc.invalidateQueries({ queryKey: ['canvases'] })
      setShowCreate(false)
      setNewName('')
      setNewType('inspiration')
      navigate(`/canvases/${cv.ID}`)
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/canvases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvases'] }),
  })

  function handleCreate() {
    if (!newName.trim()) return
    create.mutate({ name: newName.trim(), canvas_type: newType, project_id: currentProject?.ID })
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold text-foreground">画布</h1>
          <p className="text-xs text-muted-foreground mt-0.5">灵感激发 · 工作流</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={14} /> 新建画布
        </Button>
      </div>

      {/* Canvas list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : canvases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <LayoutTemplate size={36} className="mb-3 opacity-40" />
          <p className="text-sm mb-2">还没有画布</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
          >
            创建第一个画布
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {canvases.map((cv) => {
            const type = cv.canvas_type ?? 'inspiration'
            const meta = TYPE_META[type]
            return (
              <div
                key={cv.ID}
                className="border border-border rounded-lg px-4 py-3 bg-background shadow-sm flex items-center gap-3 hover:border-border/80 transition-colors"
              >
                <LayoutTemplate size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{cv.name}</p>
                </div>
                <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${meta.color}`}>
                  {meta.icon}{meta.label}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/canvases/${cv.ID}`)}
                  className="shrink-0"
                >
                  打开 <ArrowRight size={13} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove.mutate(cv.ID)}
                  aria-label="删除"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {/* Create dialog */}
      <CreateDialog
        open={showCreate}
        onClose={() => { setShowCreate(false); setNewName(''); setNewType('inspiration') }}
        title="新建画布"
      >
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1.5">画布名称 *</Label>
            <Input
              autoFocus
              placeholder="为你的画布起个名字"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-2">画布类型</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(TYPE_META) as [CanvasType, typeof TYPE_META[CanvasType]][]).map(([type, meta]) => (
                <button
                  key={type}
                  onClick={() => setNewType(type)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 text-left transition-colors ${
                    newType === type
                      ? 'border-foreground bg-card'
                      : 'border-border hover:border-border/80'
                  }`}
                >
                  <span className={`flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full border ${meta.color}`}>
                    {meta.icon}{meta.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{meta.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || create.isPending}
              className="flex-1"
            >
              {create.isPending ? '创建中…' : '创建并打开'}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setShowCreate(false); setNewName(''); setNewType('inspiration') }}
            >
              取消
            </Button>
          </div>
        </div>
      </CreateDialog>
    </div>
  )
}
