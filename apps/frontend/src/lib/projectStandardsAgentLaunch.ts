import { buildCommandFirstClientInput } from '@/lib/agentCommandInput'
import {
  openAgentPanelDraft,
  registerAgentPanelPageTool,
  type AgentPanelDraftPayload,
  type AgentPanelPageTool,
} from '@/lib/agentPanelBridge'
import type { AgentTaskArtifactRef } from '@/lib/agentArtifacts'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import { buildDefaultProjectStylePatch, buildEmptyProjectStandardsProposalDraftContent } from '@/lib/projectStandardsProposalDraft'
import { resolveProjectWorkbenchDraftReviewSearchParams } from '@/lib/projectWorkbenchDraftReview'
import { ROUTES } from '@/routes/projectRoutes'

export interface ProjectStandardsDraftInput {
  projectId: number
  projectName?: string | null
  pageKey: string
  createdAt?: string
}

export interface ProjectStandardsAgentPayloadInput {
  requestId: string
  projectId: number
  projectName?: string | null
  draftId: string
  promptOverride?: string
}

export interface ProjectStandardsReviewSearchInput {
  fallbackDraftId?: string
  artifacts?: AgentTaskArtifactRef[]
}

export async function createProjectStandardsProposalDraft(input: ProjectStandardsDraftInput): Promise<AgentDraft> {
  const projectLabel = projectStandardsProjectLabel(input.projectName, input.projectId)
  return localAgentClient.createDraft({
    projectId: input.projectId,
    kind: 'project_standards_proposal',
    title: `项目规范提案草稿 - ${projectLabel}`,
    content: JSON.stringify(buildEmptyProjectStandardsProposalDraftContent({
      projectId: input.projectId,
      mode: 'snapshot',
      projectStyle: buildDefaultProjectStylePatch(),
      createdAt: input.createdAt ?? new Date().toISOString(),
      summary: '请定义项目级制作规范：固定 8 项和按需扩展的提示词规则。',
    }), null, 2),
    source: {
      entityType: 'project',
      entityId: input.projectId,
      pageKey: input.pageKey,
      pageType: 'project_standards',
      pageRoute: ROUTES.project.standards,
    },
    target: {
      projectId: input.projectId,
      entityType: 'project',
      entityId: input.projectId,
      field: 'project_style',
    },
    metadata: {
      pageOwned: true,
      proposalScope: 'project_standards',
      proposalMode: 'snapshot',
      backendApply: 'project_standards_proposal',
    },
  })
}

export function buildProjectStandardsReviewSearchParams(current: URLSearchParams, input: ProjectStandardsReviewSearchInput): URLSearchParams {
  return resolveProjectWorkbenchDraftReviewSearchParams(current, {
    workbenchId: 'project_standards',
    proposalKind: 'project_standards_proposal',
    artifacts: input.artifacts,
    fallbackDraftId: input.fallbackDraftId,
  })?.searchParams ?? current
}

export function buildProjectStandardsAgentPanelDraftPayload(input: ProjectStandardsAgentPayloadInput): AgentPanelDraftPayload {
  const projectLabel = projectStandardsProjectLabel(input.projectName, input.projectId)
  const userMessage = input.promptOverride || projectStandardsAgentMessage(projectLabel)
  return {
    requestId: input.requestId,
    taskType: 'project_standards_proposal',
    message: `请制定项目规范：${projectLabel}`,
    title: `项目规范提案: ${projectLabel}`,
    newConversation: true,
    autoSend: true,
    projectId: input.projectId,
    clientInput: buildCommandFirstClientInput({
      message: userMessage,
      labels: ['project-workspace', 'project-standards', 'draft-review'],
      hints: {
        projectId: input.projectId,
        draftId: input.draftId,
        route: { pathname: ROUTES.project.standards },
        selection: {
          entityType: 'project',
          entityId: input.projectId,
          label: projectLabel,
        },
      },
    }),
    timeoutMs: 180_000,
    renderMode: 'page',
  }
}

export function launchProjectStandardsProposalAgent(input: ProjectStandardsAgentPayloadInput & { onSettled: AgentPanelPageTool }): () => void {
  const cleanup = registerAgentPanelPageTool(input.requestId, input.onSettled)
  openAgentPanelDraft(buildProjectStandardsAgentPanelDraftPayload(input))
  return cleanup
}

export function projectStandardsProjectLabel(projectName: string | null | undefined, projectId: number): string {
  return projectName || `#${projectId}`
}

function projectStandardsAgentMessage(projectLabel: string): string {
  return `请基于已写入 draft 的空模板，为项目「${projectLabel}」制定项目级制作规范。填写 proposal.project_style：保留并补齐固定字段 aspect_ratio、shot_size_system、camera_language、visual_style、lighting_style、color_palette、pacing_rules、negative_rules；也可以按项目需要新增 custom_rules，每条包含 key、label、category、value、prompt_role、enabled、required、order。若项目需要用图片固定画风，请用 custom_rules 实现：新增 enabled=true、prompt_role="style" 的画风参考规则，在 value 中写明参考图片的 resource#ID 或 reference_resource_ids，并说明这些图片用于画风、质感、色彩、线条、光影参考；后续生成图片/视频时应把这些资源 ID 作为 reference_resource_ids 传给支持参考图的生成工具。不要创建设定资料或素材需求。`
}
