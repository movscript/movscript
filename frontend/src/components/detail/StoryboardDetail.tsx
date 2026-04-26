import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Storyboard } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Save, Camera, Upload } from 'lucide-react'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ReviewStatusBadge, ReviewActions } from './ReviewStatus'

interface Props {
  storyboard: Storyboard
  onClose?: () => void
  onDelete?: () => void
}

export function StoryboardDetail({ storyboard, onClose, onDelete }: Props) {
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Storyboard>>({ ...storyboard })

  const update = useMutation({
    mutationFn: (data: Partial<Storyboard>) =>
      api.put(`/storyboards/${storyboard.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['storyboards-project', projectId] }),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/storyboards/${storyboard.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storyboards-project', projectId] })
      onDelete?.()
    },
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0">分镜 #{storyboard.order}</span>
          <h2 className="text-sm font-semibold text-foreground truncate">{storyboard.title || `分镜 #${storyboard.order}`}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ReviewStatusBadge status={storyboard.review_status} />
          {onClose && <Button variant="outline" size="sm" onClick={onClose}>关闭</Button>}
        </div>
      </div>

      {/* Review actions */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-border bg-muted/30 shrink-0">
        <ReviewActions
          status={storyboard.review_status}
          apiUrl={`/storyboards/${storyboard.ID}`}
          queryKey={['storyboards-project', projectId]}
        />
        {onDelete && (
          <button onClick={() => remove.mutate()} className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors">
            删除
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: description editor */}
        <div className="w-96 shrink-0 border-r border-border overflow-y-auto p-5 space-y-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">标题</Label>
            <Input value={draft.title ?? ''} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">场景描述</Label>
            <Textarea rows={3} value={draft.description ?? ''} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1">人物</Label>
              <Textarea rows={2} value={draft.characters ?? ''} onChange={(e) => setDraft((d) => ({ ...d, characters: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1">动作</Label>
              <Textarea rows={2} value={draft.actions ?? ''} onChange={(e) => setDraft((d) => ({ ...d, actions: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">对白</Label>
            <Textarea rows={3} value={draft.dialogue ?? ''} onChange={(e) => setDraft((d) => ({ ...d, dialogue: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">氛围</Label>
            <Textarea rows={2} value={draft.atmosphere ?? ''} onChange={(e) => setDraft((d) => ({ ...d, atmosphere: e.target.value }))} />
          </div>
          <Button onClick={() => update.mutate(draft)} disabled={update.isPending} className="w-full gap-1.5" size="sm">
            <Save size={13} /> {update.isPending ? '保存中…' : '保存'}
          </Button>
        </div>

        {/* Right: key frames + draft video */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">关键帧</h3>
              <span className="text-xs text-muted-foreground">参考图片</span>
            </div>
            <ResourceAttachments
              resourceIds={draft.resource_ids ? JSON.parse(draft.resource_ids) : []}
              onChange={(ids) => {
                const updated = { ...draft, resource_ids: JSON.stringify(ids) }
                setDraft(updated)
                update.mutate(updated)
              }}
            />
            <div className="mt-3 flex gap-2">
              <button className="flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 rounded hover:bg-muted/50 text-foreground">
                <Upload size={12} /> 上传关键帧
              </button>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border px-3 py-1.5 rounded hover:bg-muted">
                AI 生成关键帧
              </button>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">底稿视频</h3>
              <span className="text-xs text-muted-foreground">镜头控制参考</span>
            </div>
            <div className="bg-muted rounded-lg aspect-video flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Camera size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">暂无底稿视频</p>
                <button className="mt-2 text-xs text-muted-foreground border border-border px-3 py-1.5 rounded hover:bg-muted">
                  AI 生成底稿
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
