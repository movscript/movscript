import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Shot } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Save, Camera } from 'lucide-react'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { cn } from '@/lib/utils'
import {
  SHOT_STATUS_LABELS, SHOT_STATUS_COLORS, SHOT_STATUS_NEXT, SHOT_STATUS_STEPS,
} from '@/constants/shot'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ReviewStatusBadge, ReviewActions } from './ReviewStatus'

interface Props {
  shot: Shot
  onClose?: () => void
  onDelete?: () => void
}

export function ShotDetail({ shot, onClose, onDelete }: Props) {
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Shot>>({ ...shot })

  const update = useMutation({
    mutationFn: (data: Partial<Shot>) =>
      api.put(`/storyboards/${shot.storyboard_id}/shots/${shot.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shots-project', projectId] }),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/storyboards/${shot.storyboard_id}/shots/${shot.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shots-project', projectId] })
      onDelete?.()
    },
  })

  const currentIdx = SHOT_STATUS_STEPS.indexOf(shot.status)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0">镜头 {shot.order}</span>
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', SHOT_STATUS_COLORS[shot.status])}>
            {SHOT_STATUS_LABELS[shot.status]}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ReviewStatusBadge status={shot.review_status} />
          {onClose && <Button variant="outline" size="sm" onClick={onClose}>关闭</Button>}
        </div>
      </div>

      {/* Review actions */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-border bg-muted/30 shrink-0">
        <ReviewActions
          status={shot.review_status}
          apiUrl={`/storyboards/${shot.storyboard_id}/shots/${shot.ID}`}
          queryKey={['shots-project', projectId]}
        />
        {onDelete && (
          <button onClick={() => remove.mutate()} className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors">
            删除
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: shot settings */}
        <div className="w-96 shrink-0 border-r border-border overflow-y-auto p-5 space-y-3">
          {/* Status progress */}
          <div className="flex items-center gap-1 mb-2">
            {SHOT_STATUS_STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={cn('w-2 h-2 rounded-full', i <= currentIdx ? 'bg-foreground' : 'bg-muted')} />
                {i < SHOT_STATUS_STEPS.length - 1 && (
                  <div className={cn('w-4 h-0.5', i < currentIdx ? 'bg-foreground' : 'bg-muted')} />
                )}
              </div>
            ))}
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">描述</Label>
            <Textarea rows={2} value={draft.description ?? ''} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">AI 提示词</Label>
            <Textarea
              className="font-mono"
              rows={6}
              placeholder="描述镜头视觉内容…"
              value={draft.prompt ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">参考素材</Label>
            <ResourceAttachments
              resourceIds={draft.ref_resource_ids ? JSON.parse(draft.ref_resource_ids) : []}
              onChange={(ids) => setDraft((d) => ({ ...d, ref_resource_ids: JSON.stringify(ids) }))}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={() => update.mutate(draft)} disabled={update.isPending} className="flex-1 gap-1.5" size="sm">
              <Save size={13} /> {update.isPending ? '保存中…' : '保存'}
            </Button>
            {SHOT_STATUS_NEXT[shot.status] && (
              <button
                onClick={() => update.mutate({ status: SHOT_STATUS_NEXT[shot.status]! })}
                className="text-xs text-muted-foreground border border-border px-3 py-2 rounded hover:bg-muted whitespace-nowrap"
              >
                → {SHOT_STATUS_LABELS[SHOT_STATUS_NEXT[shot.status]!]}
              </button>
            )}
          </div>
        </div>

        {/* Right: video output */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">生成视频</h3>
            <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', SHOT_STATUS_COLORS[shot.status])}>
              {SHOT_STATUS_LABELS[shot.status]}
            </span>
          </div>
          <div className="bg-muted rounded-xl aspect-video flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Camera size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">暂无生成视频</p>
              <p className="text-xs mt-1 mb-3">填写 AI 提示词后开始生成</p>
              <Button
                onClick={() => update.mutate({ status: 'generating' })}
                disabled={!shot.prompt || shot.status === 'generating'}
                size="sm"
              >
                {shot.status === 'generating' ? '生成中…' : '开始生成'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
