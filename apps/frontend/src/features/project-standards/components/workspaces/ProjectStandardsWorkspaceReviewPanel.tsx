import { Link } from 'react-router-dom'
import { CheckCircle2, FileText, GitBranch, Loader2 } from 'lucide-react'
import {
  ProjectWorkspaceReviewActionButton,
  ProjectWorkspaceReviewBadge,
  ProjectWorkspaceReviewCallout,
  ProjectWorkspaceReviewEmptyBlock,
  ProjectWorkspaceReviewEmptyText,
  ProjectWorkspaceReviewLoadingState,
  ProjectWorkspaceReviewNoteList,
  ProjectWorkspaceReviewStatusBadge
} from './ProjectStandardsWorkspaceReviewPrimitives'
import {
  ProjectStandardsWorkspaceReviewArtifactList,
  ProjectStandardsWorkspaceReviewArtifactPanel,
  ProjectStandardsWorkspaceReviewFieldDiffList,
  ProjectStandardsWorkspaceReviewFieldDiffRow,
  ProjectStandardsWorkspaceReviewShell,
  ProjectStandardsWorkspaceReviewSummaryCallout,
} from './ProjectStandardsWorkspaceReviewUi'

import type { WorkspaceArtifact } from '@/shared/contracts/workspaceArtifact'
import type { ProjectStandardsReviewWorkspace } from '@/features/project-standards/application/projectStandardsModel'
import { ROUTES } from '@/routes/projectRoutes'
import { projectStandardsWorkspaceStatusRecipe } from '@/features/project-standards/presentation/projectStandardsSemanticUi'

export function ProjectStandardsWorkspaceReviewPanel({
  loading,
  workspaceCount,
  workspaces,
  applyingWorkspaceId,
  onApplyWorkspace,
}: {
  loading: boolean
  workspaceCount: number
  workspaces: ProjectStandardsReviewWorkspace[]
  applyingWorkspaceId: string | null
  onApplyWorkspace: (workspace: WorkspaceArtifact) => void
}) {
  return (
    <ProjectStandardsWorkspaceReviewShell
      kind="project_standards_workspace"
      title="项目规范审阅"
      description="审阅 project_standards_workspace 中的 project_style，包含固定规范和扩展 custom_rules。"
      icon={GitBranch}
      countLabel={`workspace ${workspaceCount}`}
      layout="contained-scroll"
    >
      <ProjectStandardsWorkspaceReviewArtifactList scroll>
        {loading ? (
          <ProjectWorkspaceReviewLoadingState icon={<Loader2 size={12} className="animate-spin" />} text="读取工作区…" />
        ) : null}
        {!loading && workspaces.length === 0 ? (
          <EmptyWorkspaceBlock title="暂无项目规范工作区" detail="从上方发起项目规范工作区后，AI 对核心规范和扩展规则的建议会进入这里审阅。" />
        ) : null}
        {workspaces.map(({ workspace, workspaceView, styleRows }) => (
          <ProjectStandardsWorkspaceReviewArtifactPanel
            key={workspace.id}
            title={workspace.title}
            className="last:mb-0"
            meta={`${formatWorkspaceDate(workspace.updatedAt)} · ${workspace.id}`}
            badges={
              <>
                <ProjectWorkspaceReviewStatusBadge {...projectStandardsWorkspaceStatusRecipe(workspace.status)}>{workspaceStatusLabel(workspace.status)}</ProjectWorkspaceReviewStatusBadge>
                <ProjectWorkspaceReviewBadge variant="outline">{styleRows.length} 条标准</ProjectWorkspaceReviewBadge>
              </>
            }
          >
            {workspaceView ? (
              <>
                <ProjectStandardsWorkspaceReviewSummaryCallout
                  title="项目规范工作区"
                  summary={workspaceView.summary}
                  badges={
                    <>
                      <ProjectWorkspaceReviewBadge>{styleRows.length} 条规范</ProjectWorkspaceReviewBadge>
                      <ProjectWorkspaceReviewBadge variant="outline">写入 Project</ProjectWorkspaceReviewBadge>
                    </>
                  }
                  detail="提交后会写入 Project.aspect_ratio、Project.visual_style 和完整 project_style JSON，包括 custom_rules。"
                  actions={
                      <ProjectWorkspaceReviewActionButton
                        size="xs"
                        onClick={() => onApplyWorkspace(workspace)}
                        loading={applyingWorkspaceId === workspace.id}
                        disabled={workspace.status === 'applied' || workspace.status === 'accepted' || styleRows.length === 0}
                      >
                        <CheckCircle2 size={12} />
                        应用规范
                      </ProjectWorkspaceReviewActionButton>
                  }
                />

                {styleRows.length > 0 ? (
                  <ProjectStandardsWorkspaceReviewFieldDiffList columns={2}>
                    {styleRows.map((row) => (
                      <ProjectStandardsWorkspaceReviewFieldDiffRow
                        key={row.key}
                        label={row.label}
                        before={row.before || '未设置'}
                        after={row.after}
                        change={row.changed ? 'modified' : 'unchanged'}
                      />
                    ))}
                  </ProjectStandardsWorkspaceReviewFieldDiffList>
                ) : (
                  <ProjectWorkspaceReviewEmptyText>
                    这份工作区还没有填写 project_style。
                  </ProjectWorkspaceReviewEmptyText>
                )}

                {workspaceView.impactNotes.length > 0 ? (
                  <ProjectWorkspaceReviewCallout tone="neutral" compact title="影响说明">
                    <ProjectWorkspaceReviewNoteList notes={workspaceView.impactNotes} itemKeyPrefix={`${workspace.id}-impact`} />
                  </ProjectWorkspaceReviewCallout>
                ) : null}

                <ProjectWorkspaceReviewCallout tone="neutral" compact title="历史">
                  <div className="flex justify-end">
                    <ProjectWorkspaceReviewActionButton size="xs" variant="outline" className="gap-1.5" asChild>
                      <Link to={ROUTES.agentConsole}>
                        <FileText size={12} />
                        打开 Agent 控制台
                      </Link>
                    </ProjectWorkspaceReviewActionButton>
                  </div>
                </ProjectWorkspaceReviewCallout>
              </>
            ) : (
              <ProjectWorkspaceReviewEmptyText>
                无法解析这份工作区的差异。
              </ProjectWorkspaceReviewEmptyText>
            )}
          </ProjectStandardsWorkspaceReviewArtifactPanel>
        ))}
      </ProjectStandardsWorkspaceReviewArtifactList>
    </ProjectStandardsWorkspaceReviewShell>
  )
}

function EmptyWorkspaceBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <ProjectWorkspaceReviewEmptyBlock title={title} detail={detail} compact />
  )
}

function workspaceStatusLabel(status: WorkspaceArtifact['status']) {
  const labels: Record<WorkspaceArtifact['status'], string> = {
    workspace: '待应用',
    accepted: '已接受',
    rejected: '已拒绝',
    applied: '已应用',
    superseded: '已替代',
  }
  return labels[status] ?? status
}

function formatWorkspaceDate(value?: string) {
  if (!value) return ''
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return ''
  return `${time.getMonth() + 1}/${time.getDate()} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}
