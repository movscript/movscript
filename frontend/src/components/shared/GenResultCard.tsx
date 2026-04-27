import { useQueryClient } from '@tanstack/react-query'
import { Loader2, AlertCircle, RotateCcw, CheckCircle2, X } from 'lucide-react'
import { AuthedImage, AuthedVideo } from './AuthedImage'
import { MediaViewer } from './MediaViewer'
import { cn } from '@/lib/utils'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import type { RawResource } from '@/types'
import { useUserStore } from '@/store/userStore'

// ── PromptText ────────────────────────────────────────────────────────────────
// Renders a prompt string, replacing @[resource:ID] tokens with inline thumbnails.

function ResourceChip({ id }: { id: number }) {
  const qc = useQueryClient()
  const userId = useUserStore(s => s.currentUser?.ID)
  const resources = qc.getQueryData<RawResource[]>(['resources']) ?? []
  const resource = resources.find(r => r.ID === id)

  if (!resource) {
    return (
      <span className="inline-flex items-center gap-1 align-middle bg-muted rounded px-1.5 py-0.5 text-[11px] text-muted-foreground mx-0.5">
        #{id}
      </span>
    )
  }

  const uid = userId ? `?uid=${userId}` : ''
  const url = resource.direct_url ?? `${API_BASE}${resource.url}${uid}`
  return (
    <span className="inline-flex items-center gap-1 align-middle bg-muted rounded-md px-1.5 py-0.5 mx-0.5 text-[11px] text-foreground whitespace-nowrap">
      <span className="w-4 h-4 rounded overflow-hidden shrink-0 bg-muted-foreground/20 inline-block">
        {resource.type === 'video' ? (
          resource.direct_url
            ? <video src={url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
            : <AuthedVideo src={url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
        ) : resource.direct_url ? (
          <img src={url} alt={resource.name} className="w-full h-full object-cover" />
        ) : (
          <AuthedImage src={url} alt={resource.name} className="w-full h-full object-cover" />
        )}
      </span>
      <span className="max-w-[80px] truncate">{resource.name}</span>
    </span>
  )
}

export function PromptText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(@\[resource:\d+\])/g)
  return (
    <span className={className}>
      {parts.map((part, i) => {
        const m = part.match(/^@\[resource:(\d+)\]$/)
        if (m) return <ResourceChip key={i} id={Number(m[1])} />
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

export function formatGenTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

export interface GenResultCardProps {
  prompt?: string
  status: 'idle' | 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  outputResource?: RawResource
  outputType: 'image' | 'video'
  error?: string
  timestamp?: string
  onReuse?: () => void
  debugPanel?: React.ReactNode
  compact?: boolean
  className?: string
}

export function GenResultCard({
  prompt,
  status,
  outputResource,
  error,
  timestamp,
  onReuse,
  debugPanel,
  compact = false,
  className,
}: GenResultCardProps) {
  const isRunning = status === 'pending' || status === 'running'

  const statusLabel: Record<string, string> = {
    pending: '排队中',
    running: '生成中',
    done: '已完成',
    failed: '失败',
    cancelled: '已取消',
    idle: '未开始',
  }

  return (
    <div className={cn(
      compact
        ? 'bg-background rounded-lg border border-border/80 shadow-sm overflow-hidden hover:border-border transition-colors'
        : 'bg-background rounded-xl border border-border shadow-sm overflow-hidden',
      className,
    )}>
      {/* Prompt */}
      {prompt && (
        <div className={cn(compact ? 'px-3 pt-3 pb-2' : 'px-4 py-3 border-b border-border')}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                status === 'done' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                isRunning && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                status === 'failed' && 'bg-destructive/10 text-destructive',
                status === 'cancelled' && 'bg-muted text-muted-foreground',
                status === 'idle' && 'bg-muted text-muted-foreground',
              )}>
                {statusLabel[status]}
              </span>
              {timestamp && (
                <span className="text-[11px] text-muted-foreground/60 truncate">{formatGenTime(timestamp)}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {status === 'done' && !compact && <CheckCircle2 size={12} className="text-green-500" />}
              {onReuse && (
                <button
                  onClick={onReuse}
                  title="复用此提示词"
                  className="text-muted-foreground/60 hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                >
                  <RotateCcw size={13} />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-start justify-between gap-2">
            <p className={cn('text-foreground flex-1 leading-relaxed whitespace-pre-wrap', compact ? 'text-xs line-clamp-3' : 'text-sm')}>
              <PromptText text={prompt} />
            </p>
          </div>
          {timestamp && !compact && (
            <span className="text-xs text-muted-foreground/50">{formatGenTime(timestamp)}</span>
          )}
        </div>
      )}

      {/* Output */}
      <div className={cn(compact ? 'px-3 pb-3 bg-background' : 'bg-card min-h-[80px]')}>
        {isRunning && (
          <div className={cn('flex items-center justify-center rounded-md bg-muted/40', compact ? 'h-24' : 'py-10')}>
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 size={compact ? 16 : 22} className="animate-spin" />
              <p className="text-xs">{status === 'pending' ? '等待开始…' : '生成中…'}</p>
            </div>
          </div>
        )}

        {!isRunning && status === 'failed' && (
          <div className={cn('flex items-center justify-center gap-2 text-destructive rounded-md bg-destructive/5', compact ? 'min-h-20 px-3 py-4' : 'py-6')}>
            <AlertCircle size={compact ? 12 : 16} />
            <p className={compact ? 'text-xs' : 'text-sm'}>{error ?? '生成失败'}</p>
          </div>
        )}

        {!isRunning && status === 'cancelled' && (
          <div className={cn('flex items-center justify-center gap-2 text-muted-foreground rounded-md bg-muted/40', compact ? 'min-h-20 px-3 py-4' : 'py-6')}>
            <X size={compact ? 12 : 16} />
            <p className={compact ? 'text-xs' : 'text-sm'}>{error ?? '任务已取消'}</p>
          </div>
        )}

        {!isRunning && status === 'done' && outputResource && (
          <MediaCell
            outputResource={outputResource!}
            compact={compact}
          />
        )}
      </div>

      {debugPanel && (
        <div className="px-4 py-3 border-t border-border bg-muted/20">
          {debugPanel}
        </div>
      )}
    </div>
  )
}

// ── MediaCell ─────────────────────────────────────────────────────────────────
// 4:3 容器，内容居中不裁剪，点击弹出灯箱

function MediaCell({
  outputResource,
  compact,
}: {
  outputResource: RawResource
  compact: boolean
}) {
  return (
    <MediaViewer
      resource={outputResource}
      fit="contain"
      className={cn(
        'w-full bg-muted',
        compact ? 'aspect-video rounded-md border border-border/60' : 'aspect-[4/3] rounded-none',
      )}
      lightbox
    />
  )
}
