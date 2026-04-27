import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Canvas, CanvasType } from '@/types'
import { Plus, Trash2, ArrowRight, LayoutTemplate, Lightbulb, Zap } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

const TYPE_META: Record<CanvasType, { labelKey: string; icon: React.ReactNode; color: string; descKey: string }> = {
  inspiration: {
    labelKey: 'pages.canvases.types.inspiration',
    icon: <Lightbulb size={12} />,
    color: 'bg-muted text-foreground border-border',
    descKey: 'pages.canvases.typeDescriptions.inspiration',
  },
  workflow: {
    labelKey: 'pages.canvases.types.workflow',
    icon: <Zap size={12} />,
    color: 'bg-muted text-foreground border-border',
    descKey: 'pages.canvases.typeDescriptions.workflow',
  },
}

export default function CanvasListPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const currentProject = useProjectStore((s) => s.current)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

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
      navigate(`/canvases/${cv.ID}`)
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/canvases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvases'] }),
  })

  function handleCreate() {
    if (!newName.trim()) return
    create.mutate({ name: newName.trim(), canvas_type: 'workflow', project_id: currentProject?.ID })
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold text-foreground">{t('header.titles.canvases')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t('pages.canvases.subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={14} /> {t('pages.canvases.newCanvas')}
        </Button>
      </div>

      {/* Canvas list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loadingShort')}</p>
      ) : canvases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <LayoutTemplate size={36} className="mb-3 opacity-40" />
          <p className="text-sm mb-2">{t('pages.canvases.empty')}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
          >
            {t('pages.canvases.createFirst')}
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
                  {meta.icon}{t(meta.labelKey)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/canvases/${cv.ID}`)}
                  className="shrink-0"
                >
                  {t('pages.canvases.open')} <ArrowRight size={13} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove.mutate(cv.ID)}
                  aria-label={t('common.delete')}
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
        onClose={() => { setShowCreate(false); setNewName('') }}
        title={t('pages.canvases.newCanvas')}
      >
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1.5">{t('pages.canvases.nameRequired')}</Label>
            <Input
              autoFocus
              placeholder={t('pages.canvases.namePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {t('pages.canvases.workflowCreateHint')}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || create.isPending}
              className="flex-1"
            >
              {create.isPending ? t('common.creating') : t('pages.canvases.createAndOpen')}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setShowCreate(false); setNewName('') }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </CreateDialog>
    </div>
  )
}
