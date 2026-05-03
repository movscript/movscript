import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, Clapperboard, Image, X } from 'lucide-react'
import { Badge, Button } from '@movscript/ui'
import { generatePreview, type PreviewScope } from '@/api/preview'
import { cn } from '@/lib/utils'

interface PreviewDrawerProps {
  open: boolean
  onClose: () => void
  projectId: number
  scope: PreviewScope
  entityId: number
  entityTitle?: string
}

const scopeLabel: Record<PreviewScope, string> = {
  segment: '片段',
  scene_moment: '情节',
  content_unit: '内容单元',
}

const priorityTone: Record<string, string> = {
  high: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  low: 'bg-zinc-500/10 text-zinc-500',
}

const priorityLabel: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

export function PreviewDrawer({ open, onClose, projectId, scope, entityId, entityTitle }: PreviewDrawerProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['preview', projectId, scope, entityId],
    queryFn: () => generatePreview(projectId, scope, entityId),
    enabled: open && !!entityId && !!projectId,
    staleTime: 30_000,
  })

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
          onClick={onClose}
        />
      )}
      <div
        className={cn(
          'fixed right-0 top-0 z-40 flex h-full w-[520px] flex-col bg-background shadow-2xl border-l border-border transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Clapperboard size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] shrink-0">{scopeLabel[scope]}</Badge>
              <span className="truncate text-sm font-semibold text-foreground">{entityTitle || data?.entity.title || '预演'}</span>
            </div>
            {data?.context.segment_title && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{data.context.segment_title}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              加载中…
            </div>
          )}

          {isError && (
            <div className="flex h-40 items-center justify-center text-sm text-destructive">
              加载失败，请关闭后重试
            </div>
          )}

          {data && (
            <div className="space-y-4 p-4">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span>{data.content_units.length} 个内容单元</span>
                <ChevronRight size={12} className="shrink-0" />
                <span>{data.keyframes.length} 个关键帧</span>
                <ChevronRight size={12} className="shrink-0" />
                <span>{data.missing_assets.length} 个素材缺口</span>
              </div>

              {data.missing_assets.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-600" />
                    <span className="text-sm font-medium text-foreground">{data.missing_assets.length} 个素材待补充</span>
                  </div>
                  <div className="space-y-1.5">
                    {data.missing_assets.map((asset) => (
                      <div key={asset.id} className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">{asset.name}</p>
                          {asset.description && (
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{asset.description}</p>
                          )}
                        </div>
                        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', priorityTone[asset.priority] ?? priorityTone.low)}>
                          {priorityLabel[asset.priority] ?? asset.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Image size={14} className="text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">关键帧</span>
                  <Badge variant="outline" className="text-[10px]">{data.keyframes.length}</Badge>
                </div>

                {data.keyframes.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center">
                    <p className="text-sm text-muted-foreground">暂无关键帧</p>
                    <p className="mt-1 text-xs text-muted-foreground">需要先完善内容单元</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {data.keyframes.map((kf) => (
                      <div key={kf.id} className="rounded-lg border border-border bg-background p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] tabular-nums text-muted-foreground">#{kf.order}</span>
                          <span className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-medium',
                            kf.has_asset
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                          )}>
                            {kf.has_asset ? '可预演' : '待补素材'}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-xs font-medium leading-4 text-foreground">{kf.title || '未命名关键帧'}</p>
                        {kf.description && (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{kf.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" className="w-full" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </>
  )
}
