import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import type { Asset, AssetView } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ReviewStatusBadge, ReviewActions } from './ReviewStatus'

function resolveViewSrc(v: AssetView): string | undefined {
  const raw = v.resource?.url ? `${API_BASE}${v.resource.url}` : v.image_url
  if (!raw) return undefined
  return raw.startsWith('http') ? raw : `${API_BASE}${raw}`
}

function isVideoView(v: AssetView): boolean {
  return v.resource?.type === 'video' || !!v.resource?.mime_type?.startsWith('video/')
}

const ASSET_TYPE_MAP: Record<string, { label: string; color: string }> = {
  character: { label: '角色', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
  scene:     { label: '场景', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
  prop:      { label: '道具', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  draft:     { label: '底稿', color: 'bg-muted text-muted-foreground' },
}

interface Props {
  asset: Asset
  onClose?: () => void
  onDelete?: () => void
}

export function AssetDetail({ asset, onClose, onDelete }: Props) {
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draftName, setDraftName] = useState(asset.name)
  const [draftDesc, setDraftDesc] = useState(asset.description ?? '')

  const update = useMutation({
    mutationFn: (data: Partial<Asset>) =>
      api.put(`/projects/${projectId}/assets/${asset.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', projectId] }),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/assets/${asset.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets', projectId] })
      onDelete?.()
    },
  })

  const typeCfg = ASSET_TYPE_MAP[asset.type] ?? ASSET_TYPE_MAP.draft

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0 font-medium', typeCfg.color)}>
            {typeCfg.label}
          </span>
          <h2 className="text-sm font-semibold text-foreground truncate">{asset.name}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ReviewStatusBadge status={asset.review_status} />
          {onClose && <Button variant="outline" size="sm" onClick={onClose}>关闭</Button>}
        </div>
      </div>

      {/* Review actions */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-border bg-muted/30 shrink-0">
        <ReviewActions
          status={asset.review_status}
          apiUrl={`/projects/${projectId}/assets/${asset.ID}`}
          queryKey={['assets', projectId]}
        />
        {onDelete && (
          <button onClick={() => remove.mutate()} className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors">
            删除
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: edit form */}
        <div className="w-72 shrink-0 border-r border-border overflow-y-auto p-5 space-y-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">名称</Label>
            <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">描述</Label>
            <Textarea rows={5} value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} />
          </div>
          <Button
            onClick={() => update.mutate({ name: draftName, description: draftDesc })}
            disabled={update.isPending}
            className="w-full gap-1.5"
            size="sm"
          >
            <Save size={13} /> {update.isPending ? '保存中…' : '保存'}
          </Button>
        </div>

        {/* Right: views gallery */}
        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">多视角图</h3>
          <div className="grid grid-cols-3 gap-3">
            {(asset.views ?? []).map((v) => {
              const src = resolveViewSrc(v)
              const isVid = isVideoView(v)
              return (
                <div key={v.ID} className="space-y-1">
                  <div className="aspect-square bg-muted rounded-lg border border-border overflow-hidden">
                    {src ? (
                      isVid
                        ? <AuthedVideo src={src} className="w-full h-full object-cover" muted playsInline controls />
                        : <AuthedImage src={src} alt={v.label} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">空</div>
                    )}
                  </div>
                  <p className="text-xs text-center text-muted-foreground">{v.label || v.view_type}</p>
                </div>
              )
            })}
            {(!asset.views || asset.views.length === 0) && (
              <p className="text-xs text-muted-foreground col-span-3">暂无视角图，请在素材管理页上传</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
