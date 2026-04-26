import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ReviewStatus } from '@/types'
import { cn } from '@/lib/utils'
import { Send, CheckCircle, RotateCcw, FileEdit } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const REVIEW_STATUS_CONFIG: Record<ReviewStatus, {
  label: string
  color: string
  bg: string
}> = {
  draft:        { label: '草稿',   color: 'text-muted-foreground', bg: 'bg-muted' },
  under_review: { label: '提审中', color: 'text-amber-600',        bg: 'bg-amber-50 dark:bg-amber-950/30' },
  approved:     { label: '审核定稿', color: 'text-emerald-600',    bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  revision:     { label: '重改中', color: 'text-rose-600',         bg: 'bg-rose-50 dark:bg-rose-950/30' },
}

export function ReviewStatusBadge({ status }: { status?: ReviewStatus }) {
  const s = status ?? 'draft'
  const cfg = REVIEW_STATUS_CONFIG[s]
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', cfg.bg, cfg.color)}>
      {cfg.label}
    </span>
  )
}

interface ReviewActionsProps {
  status?: ReviewStatus
  apiUrl: string          // e.g. /projects/1/scripts/2
  queryKey: unknown[]
  extraPayload?: Record<string, unknown>
}

export function ReviewActions({ status, apiUrl, queryKey, extraPayload }: ReviewActionsProps) {
  const qc = useQueryClient()
  const s = status ?? 'draft'

  const update = useMutation({
    mutationFn: (review_status: ReviewStatus) =>
      api.patch(apiUrl, { review_status, ...extraPayload }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  return (
    <div className="flex items-center gap-2">
      <ReviewStatusBadge status={s} />
      {s === 'draft' && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1 text-amber-600 border-amber-200 hover:bg-amber-50"
          onClick={() => update.mutate('under_review')}
          disabled={update.isPending}
        >
          <Send size={12} /> 提交审核
        </Button>
      )}
      {s === 'under_review' && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
            onClick={() => update.mutate('approved')}
            disabled={update.isPending}
          >
            <CheckCircle size={12} /> 审核通过
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-rose-600 border-rose-200 hover:bg-rose-50"
            onClick={() => update.mutate('revision')}
            disabled={update.isPending}
          >
            <RotateCcw size={12} /> 打回重改
          </Button>
        </>
      )}
      {(s === 'approved' || s === 'revision') && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1 text-muted-foreground"
          onClick={() => update.mutate('draft')}
          disabled={update.isPending}
        >
          <FileEdit size={12} /> 重置草稿
        </Button>
      )}
    </div>
  )
}
