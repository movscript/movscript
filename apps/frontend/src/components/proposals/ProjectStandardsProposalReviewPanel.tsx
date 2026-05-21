import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, FileText, Loader2 } from 'lucide-react'
import { Badge, Button } from '@movscript/ui'

import type { AgentDraft } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/projectRoutes'
import { ProposalReviewShell } from '@/components/proposals/ProposalReviewShell'

export interface ProjectStandardsProposalDraftView {
  summary: string
  impactNotes: string[]
  debug: {
    scope?: string
    pageKey?: string
    draftId?: string
    draftUpdatedAt?: string
    draftStatus?: string
    sourceRunId?: string
    sourceThreadId?: string
  }
}

export interface ProjectStyleDraftRow {
  key: string
  label: string
  before: string
  after: string
  changed: boolean
  kind?: 'core' | 'custom'
}

export interface ProjectStandardsReviewDraft {
  draft: AgentDraft
  proposalView: ProjectStandardsProposalDraftView | null
  styleRows: ProjectStyleDraftRow[]
}

export function ProjectStandardsProposalReviewPanel({
  loading,
  draftCount,
  drafts,
  applyingDraftId,
  onApplyDraft,
}: {
  loading: boolean
  draftCount: number
  drafts: ProjectStandardsReviewDraft[]
  applyingDraftId: string | null
  onApplyDraft: (draft: AgentDraft) => void
}) {
  return (
    <ProposalReviewShell
      kind="project_standards_proposal"
      title="项目规范审阅"
      description="审阅 project_standards_proposal 中的 project_style，包含固定规范和扩展 custom_rules。"
      countLabel={`draft ${draftCount}`}
      className="min-h-0 overflow-hidden shadow-sm"
    >
      <div className="mt-3 min-h-0 space-y-3 overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-3 type-label text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            读取草稿…
          </div>
        ) : null}
        {!loading && drafts.length === 0 ? (
          <EmptyProposalBlock title="暂无项目规范草稿" detail="从上方发起项目规范提案后，AI 对核心规范和扩展规则的建议会进入这里审阅。" />
        ) : null}
        {drafts.map(({ draft, proposalView, styleRows }) => (
          <div key={draft.id} className="rounded-lg border border-border bg-background p-3 last:mb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate type-label font-semibold text-foreground">{draft.title}</p>
                <p className="mt-1 type-tiny text-muted-foreground">{formatDraftDate(draft.updatedAt)} · {draft.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={draftStatusVariant(draft.status)} className="shrink-0 type-tiny">{draftStatusLabel(draft.status)}</Badge>
                <Badge variant="outline" className="type-tiny">{styleRows.length} 条标准</Badge>
              </div>
            </div>

            {proposalView ? (
              <div className="mt-3 space-y-3">
                <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="type-tiny font-medium text-foreground">项目规范提案</p>
                      <p className="mt-1 type-tiny leading-4 text-muted-foreground">{proposalView.summary}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 type-tiny">
                      <Badge variant="secondary" className="h-5 rounded-full px-1.5">{styleRows.length} 条规范</Badge>
                      <Badge variant="outline" className="h-5 rounded-full px-1.5">写入 Project</Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="type-tiny text-muted-foreground">提交后会写入 Project.aspect_ratio、Project.visual_style 和完整 project_style JSON，包括 custom_rules。</p>
                    <div className="flex gap-1.5">
                      <Button
                        size="xs"
                        className="px-2 type-tiny"
                        onClick={() => onApplyDraft(draft)}
                        loading={applyingDraftId === draft.id}
                        disabled={draft.status === 'applied' || draft.status === 'accepted' || styleRows.length === 0}
                      >
                        <CheckCircle2 size={12} />
                        应用规范
                      </Button>
                    </div>
                  </div>
                </div>

                {styleRows.length > 0 ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {styleRows.map((row) => (
                      <div key={row.key} className="rounded-md border border-border bg-card px-3 py-2">
                        <p className="type-tiny font-medium text-muted-foreground">{row.label}</p>
                        <div className="mt-1 flex items-start gap-1.5 type-tiny leading-4">
                          <span className="min-w-0 flex-1 truncate text-muted-foreground line-through">{row.before || '未设置'}</span>
                          <ArrowRight size={10} className="mt-0.5 shrink-0 text-muted-foreground" />
                          <span className={cn('min-w-0 flex-1 whitespace-pre-wrap', row.changed ? 'text-foreground' : 'text-muted-foreground')}>{row.after}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 type-tiny text-muted-foreground">
                    这份草稿还没有填写 project_style。
                  </div>
                )}

                {proposalView.impactNotes.length > 0 ? (
                  <div className="space-y-1 rounded-md border border-border bg-background/70 p-2">
                    <p className="type-tiny font-medium text-foreground">影响说明</p>
                    {proposalView.impactNotes.slice(0, 4).map((note, index) => (
                      <p key={`${draft.id}-impact-${index}`} className="type-tiny leading-4 text-muted-foreground">{note}</p>
                    ))}
                  </div>
                ) : null}

                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="type-tiny font-medium text-foreground">历史</p>
                    <Button size="xs" variant="outline" className="gap-1.5 px-2 type-tiny" asChild>
                      <Link to={ROUTES.agentDrafts}>
                        <FileText size={12} />
                        查看全部
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed border-border bg-background px-3 py-4 type-tiny text-muted-foreground">
                无法解析这份草稿的差异。
              </div>
            )}
          </div>
        ))}
      </div>
    </ProposalReviewShell>
  )
}

function EmptyProposalBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background px-4 py-6 text-center">
      <p className="type-body font-medium text-foreground">{title}</p>
      <p className="mt-1 type-label leading-5 text-muted-foreground">{detail}</p>
    </div>
  )
}

function draftStatusVariant(status: AgentDraft['status']) {
  if (status === 'applied') return 'success' as const
  if (status === 'rejected') return 'danger' as const
  if (status === 'superseded') return 'outline' as const
  if (status === 'accepted') return 'secondary' as const
  return 'warning' as const
}

function draftStatusLabel(status: AgentDraft['status']) {
  const labels: Record<AgentDraft['status'], string> = {
    draft: '待应用',
    accepted: '已接受',
    rejected: '已拒绝',
    applied: '已应用',
    superseded: '已替代',
  }
  return labels[status] ?? status
}

function formatDraftDate(value?: string) {
  if (!value) return ''
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return ''
  return `${time.getMonth() + 1}/${time.getDate()} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}
