import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CalendarDays, CheckCircle2, Clock, FileWarning, Loader2, RotateCcw, Send } from 'lucide-react'
import { api } from '@/lib/api'
import type { PipelineNode } from '@/types'
import { Button } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { cn } from '@/lib/utils'

interface ArtifactReviewRailProps {
  node?: PipelineNode
  canSubmit?: boolean
  canReview?: boolean
  onNodeUpdated?: (node: PipelineNode) => void
}

const STATUS_META: Record<string, { label: string; className: string; description: string }> = {
  draft: {
    label: '草稿',
    className: 'bg-muted text-muted-foreground',
    description: '内容仍在创作中，完成后可以提交审核。',
  },
  under_review: {
    label: '待审核',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
    description: '等待负责人确认，审核通过后会进入终稿状态。',
  },
  rejected: {
    label: '被打回',
    className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    description: '需要根据审核意见修改后重新提交。',
  },
  final: {
    label: '已通过',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
    description: '当前产物已确认，可作为下游环节参考。',
  },
}

export function ArtifactReviewRail({ node, canSubmit = false, canReview = false, onNodeUpdated }: ArtifactReviewRailProps) {
  const qc = useQueryClient()
  const [rejectNote, setRejectNote] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)

  const transition = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: object }) => {
      if (!node) throw new Error('Missing pipeline node')
      return api.post(`/pipeline/nodes/${node.ID}/${action}`, body ?? {}).then((r) => r.data)
    },
    onSuccess: (data: unknown) => {
      qc.invalidateQueries({ queryKey: ['pipeline', node?.project_id] })
      const result = data as Record<string, unknown>
      const updated = (result.node ?? result) as PipelineNode
      onNodeUpdated?.(updated)
      setShowRejectInput(false)
      setRejectNote('')
    },
  })

  if (!node) {
    return (
      <aside className="w-80 shrink-0 border-l border-border bg-card">
        <div className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">流程状态</h2>
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground leading-relaxed">
            当前产物还没有绑定管线节点。绑定后可以在这里提交审核、查看打回原因和负责人信息。
          </div>
        </div>
      </aside>
    )
  }

  const meta = STATUS_META[node.status] ?? STATUS_META.draft
  const assignee = node.assignee?.username ?? (node.assignee_id ? `用户 #${node.assignee_id}` : '未分配')
  const lead = node.lead?.username ?? (node.lead_id ? `用户 #${node.lead_id}` : '未指定')
  const busy = transition.isPending

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">流程状态</h2>
            <span className={cn('rounded px-2 py-0.5 text-xs font-medium', meta.className)}>{meta.label}</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{meta.description}</p>

          <div className="grid grid-cols-2 gap-2">
            <InfoCell label="执行人" value={assignee} />
            <InfoCell label="负责人" value={lead} />
          </div>

          <div className="rounded-md border border-border bg-background px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CalendarDays size={12} />
              截止时间
            </div>
            <p className="mt-1 text-xs text-foreground">{node.due_date ? node.due_date.substring(0, 10) : '未设置'}</p>
          </div>
        </section>

        {node.description && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground">节点说明</h3>
            <p className="rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {node.description}
            </p>
          </section>
        )}

        {node.status === 'rejected' && node.review_note && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400">
              <FileWarning size={13} />
              打回原因
            </h3>
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
              {node.review_note}
            </p>
          </section>
        )}
      </div>

      <div className="border-t border-border p-4 space-y-2">
        {(node.status === 'draft' || node.status === 'rejected') && (
          <Button
            className="w-full gap-1.5"
            size="sm"
            onClick={() => transition.mutate({ action: 'submit' })}
            disabled={!canSubmit || busy}
            title={canSubmit ? undefined : '当前用户没有提交权限'}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {node.status === 'rejected' ? '重新提交' : '提交审核'}
          </Button>
        )}

        {node.status === 'under_review' && (
          <>
            <Button
              className="w-full gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              size="sm"
              onClick={() => transition.mutate({ action: 'approve' })}
              disabled={!canReview || busy}
              title={canReview ? undefined : '当前用户没有审核权限'}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              通过并设为终稿
            </Button>

            {!showRejectInput ? (
              <Button
                variant="outline"
                className="w-full gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                size="sm"
                onClick={() => setShowRejectInput(true)}
                disabled={!canReview || busy}
              >
                <AlertCircle size={14} />
                打回修改
              </Button>
            ) : (
              <div className="space-y-2">
                <Textarea
                  value={rejectNote}
                  rows={3}
                  className="resize-none text-sm"
                  placeholder="说明需要修改的地方"
                  onChange={(e) => setRejectNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowRejectInput(false); setRejectNote('') }}>
                    取消
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={() => transition.mutate({ action: 'reject', body: { note: rejectNote } })}
                    disabled={busy}
                  >
                    确认打回
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {node.status === 'final' && (
          <Button
            variant="outline"
            className="w-full gap-1.5"
            size="sm"
            onClick={() => transition.mutate({ action: 'reopen' })}
            disabled={!canReview || busy}
            title={canReview ? undefined : '当前用户没有重新打开权限'}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            重新打开
          </Button>
        )}

        {node.status !== 'under_review' && node.status !== 'final' && !canSubmit && (
          <p className="text-[11px] text-muted-foreground">只有执行人、负责人或项目管理者可以提交审核。</p>
        )}
        {node.status === 'under_review' && !canReview && (
          <p className="text-[11px] text-muted-foreground">只有负责人或项目管理者可以审核，执行人不能审核自己的任务。</p>
        )}
        {node.status === 'draft' && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock size={12} />
            保存内容后再提交审核。
          </div>
        )}
      </div>
    </aside>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xs font-medium text-foreground">{value}</p>
    </div>
  )
}
