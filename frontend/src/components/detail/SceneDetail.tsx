import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Scene } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ReviewStatusBadge, ReviewActions } from './ReviewStatus'

const TIME_LABELS: Record<string, string> = {
  day: '白天', night: '夜晚', dawn: '黎明', dusk: '黄昏',
}
const TIME_COLORS: Record<string, string> = {
  day:   'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  night: 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400',
  dawn:  'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400',
  dusk:  'border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400',
}

interface Props {
  scene: Scene
  onClose?: () => void
  onDelete?: () => void
}

export function SceneDetail({ scene, onClose, onDelete }: Props) {
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Scene>>({ ...scene })

  const update = useMutation({
    mutationFn: (data: Partial<Scene>) =>
      api.put(`/scenes/${scene.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenes', projectId] }),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/scenes/${scene.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scenes', projectId] })
      onDelete?.()
    },
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base font-mono text-muted-foreground shrink-0">场{scene.number}</span>
          <h2 className="text-sm font-semibold text-foreground truncate">{scene.title}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ReviewStatusBadge status={scene.review_status} />
          {onClose && <Button variant="outline" size="sm" onClick={onClose}>关闭</Button>}
        </div>
      </div>

      {/* Review actions */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-border bg-muted/30 shrink-0">
        <ReviewActions
          status={scene.review_status}
          apiUrl={`/scenes/${scene.ID}`}
          queryKey={['scenes', projectId]}
        />
        {onDelete && (
          <button onClick={() => remove.mutate()} className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors">
            删除
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: settings */}
        <div className="w-72 shrink-0 border-r border-border overflow-y-auto p-5 space-y-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">标题</Label>
            <Input value={draft.title ?? ''} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">拍摄地点</Label>
            <Input value={draft.location ?? ''} onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">时间段</Label>
            <div className="flex gap-1.5 flex-wrap">
              {Object.entries(TIME_LABELS).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setDraft((d) => ({ ...d, time_of_day: v }))}
                  className={cn(
                    'flex-1 py-1.5 text-xs rounded border transition-colors min-w-[60px]',
                    draft.time_of_day === v ? cn(TIME_COLORS[v], 'font-medium') : 'border-border text-muted-foreground hover:border-border/80'
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">备注</Label>
            <Textarea rows={4} value={draft.notes ?? ''} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
          </div>
          <Button onClick={() => update.mutate(draft)} disabled={update.isPending} className="w-full gap-1.5" size="sm">
            <Save size={13} /> {update.isPending ? '保存中…' : '保存'}
          </Button>
        </div>

        {/* Right: media */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">素材库</h3>
            <span className="text-xs text-muted-foreground">图片 / 视频</span>
          </div>
          <ResourceAttachments
            resourceIds={draft.resource_ids ? JSON.parse(draft.resource_ids) : []}
            onChange={(ids) => {
              const updated = { ...draft, resource_ids: JSON.stringify(ids) }
              setDraft(updated)
              update.mutate(updated)
            }}
          />
        </div>
      </div>
    </div>
  )
}
