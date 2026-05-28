import { Link } from 'react-router-dom'
import { CheckCircle2, FileText, GitBranch, Loader2 } from 'lucide-react'
import {
  ProjectProposalReviewActionButton,
  ProjectProposalReviewBadge,
  ProjectProposalReviewCallout,
  ProjectProposalReviewEmptyBlock,
  ProjectProposalReviewEmptyText,
  ProjectProposalReviewLoadingState,
  ProjectProposalReviewNoteList,
  ProjectProposalReviewStatusBadge,
  ReviewProposalDraftList,
  ReviewProposalDraftPanel,
  ReviewProposalFieldDiffList,
  ReviewProposalFieldDiffRow,
  ReviewProposalShell,
  ReviewProposalSummaryCallout,
} from '@movscript/ui'

import type { AgentDraft } from '@/shared/infrastructure/localAgentClient'
import type { ProjectStandardsReviewDraft } from '@/features/project-standards/application/projectStandardsModel'
import { ROUTES } from '@/routes/projectRoutes'
import { projectStandardsDraftStatusRecipe } from '@/features/project-standards/presentation/projectStandardsSemanticUi'

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
    <ReviewProposalShell
      kind="project_standards_proposal"
      title="项目规范审阅"
      description="审阅 project_standards_proposal 中的 project_style，包含固定规范和扩展 custom_rules。"
      icon={GitBranch}
      countLabel={`draft ${draftCount}`}
      layout="contained-scroll"
    >
      <ReviewProposalDraftList scroll>
        {loading ? (
          <ProjectProposalReviewLoadingState icon={<Loader2 size={12} className="animate-spin" />} text="读取草稿…" />
        ) : null}
        {!loading && drafts.length === 0 ? (
          <EmptyProposalBlock title="暂无项目规范草稿" detail="从上方发起项目规范提案后，AI 对核心规范和扩展规则的建议会进入这里审阅。" />
        ) : null}
        {drafts.map(({ draft, proposalView, styleRows }) => (
          <ReviewProposalDraftPanel
            key={draft.id}
            title={draft.title}
            className="last:mb-0"
            meta={`${formatDraftDate(draft.updatedAt)} · ${draft.id}`}
            badges={
              <>
                <ProjectProposalReviewStatusBadge {...projectStandardsDraftStatusRecipe(draft.status)}>{draftStatusLabel(draft.status)}</ProjectProposalReviewStatusBadge>
                <ProjectProposalReviewBadge variant="outline">{styleRows.length} 条标准</ProjectProposalReviewBadge>
              </>
            }
          >
            {proposalView ? (
              <>
                <ReviewProposalSummaryCallout
                  title="项目规范提案"
                  summary={proposalView.summary}
                  badges={
                    <>
                      <ProjectProposalReviewBadge>{styleRows.length} 条规范</ProjectProposalReviewBadge>
                      <ProjectProposalReviewBadge variant="outline">写入 Project</ProjectProposalReviewBadge>
                    </>
                  }
                  detail="提交后会写入 Project.aspect_ratio、Project.visual_style 和完整 project_style JSON，包括 custom_rules。"
                  actions={
                      <ProjectProposalReviewActionButton
                        size="xs"
                        onClick={() => onApplyDraft(draft)}
                        loading={applyingDraftId === draft.id}
                        disabled={draft.status === 'applied' || draft.status === 'accepted' || styleRows.length === 0}
                      >
                        <CheckCircle2 size={12} />
                        应用规范
                      </ProjectProposalReviewActionButton>
                  }
                />

                {styleRows.length > 0 ? (
                  <ReviewProposalFieldDiffList columns={2}>
                    {styleRows.map((row) => (
                      <ReviewProposalFieldDiffRow
                        key={row.key}
                        label={row.label}
                        before={row.before || '未设置'}
                        after={row.after}
                        change={row.changed ? 'modified' : 'unchanged'}
                      />
                    ))}
                  </ReviewProposalFieldDiffList>
                ) : (
                  <ProjectProposalReviewEmptyText>
                    这份草稿还没有填写 project_style。
                  </ProjectProposalReviewEmptyText>
                )}

                {proposalView.impactNotes.length > 0 ? (
                  <ProjectProposalReviewCallout tone="neutral" compact title="影响说明">
                    <ProjectProposalReviewNoteList notes={proposalView.impactNotes} itemKeyPrefix={`${draft.id}-impact`} />
                  </ProjectProposalReviewCallout>
                ) : null}

                <ProjectProposalReviewCallout tone="neutral" compact title="历史">
                  <div className="flex justify-end">
                    <ProjectProposalReviewActionButton size="xs" variant="outline" className="gap-1.5" asChild>
                      <Link to={ROUTES.agentDrafts}>
                        <FileText size={12} />
                        查看全部
                      </Link>
                    </ProjectProposalReviewActionButton>
                  </div>
                </ProjectProposalReviewCallout>
              </>
            ) : (
              <ProjectProposalReviewEmptyText>
                无法解析这份草稿的差异。
              </ProjectProposalReviewEmptyText>
            )}
          </ReviewProposalDraftPanel>
        ))}
      </ReviewProposalDraftList>
    </ReviewProposalShell>
  )
}

function EmptyProposalBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <ProjectProposalReviewEmptyBlock title={title} detail={detail} compact />
  )
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
