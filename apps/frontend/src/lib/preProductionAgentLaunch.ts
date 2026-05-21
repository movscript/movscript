import { buildCommandFirstClientInput } from '@/lib/agentCommandInput'
import {
  openAgentPanelDraft,
  registerAgentPanelPageTool,
  type AgentPanelDraftPayload,
  type AgentPanelPageTool,
  type AgentPanelRunSettledPayload,
} from '@/lib/agentPanelBridge'
import type { AgentTaskArtifactRef } from '@/lib/agentArtifacts'
import { selectLatestGeneratedResource, type AgentGeneratedResourceRef } from '@/lib/agentGenerationArtifacts'
import { buildEmptyAssetProposalDraftContent } from '@/lib/assetProposalDraft'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import {
  mergeProjectWorkbenchArtifactReviewSearchParams,
  type ProjectWorkbenchArtifactReviewSearchInput,
} from '@/lib/projectWorkbenchDraftReview'
import { ROUTES } from '@/routes/projectRoutes'

export type PreProductionCandidateGenerationKind = 'image' | 'video'

export interface CreateAssetCandidateProposalDraftInput {
  projectId: number
  assetSlotId: number
  slotName: string
  slotKind: string
  description?: string
  promptHint?: string
  ownerLabel?: string
  referenceResourceIds: number[]
  requestedOutputKind: PreProductionCandidateGenerationKind
}

export interface AssetCandidateProposalAgentPayloadInput {
  requestId: string
  projectId: number
  assetSlotId: number
  slotName: string
  draftId: string
}

export interface PreProductionAuditAgentPayloadInput {
  requestId: string
  projectId: number
  projectLabel: string
}

export interface MediaCandidateGenerationAgentPayloadInput {
  requestId: string
  projectId: number
  assetSlotId: number
  slotName: string
  slotKind: string
  outputKind: PreProductionCandidateGenerationKind
  description?: string
  promptHint?: string
}

export interface AssetCandidateProposalReviewSearchInput {
  assetSlotId: number
  fallbackDraftId: string
  artifacts?: AgentTaskArtifactRef[]
}

export interface PreProductionAuditReviewSearchInput {
  artifacts?: AgentTaskArtifactRef[]
}

export async function createAssetCandidateProposalDraft(input: CreateAssetCandidateProposalDraftInput): Promise<AgentDraft> {
  return localAgentClient.createDraft({
    projectId: input.projectId,
    kind: 'asset_proposal',
    title: `素材候选提案 - ${input.slotName}`,
    content: JSON.stringify(buildEmptyAssetProposalDraftContent({
      projectId: input.projectId,
      assetSlotId: input.assetSlotId,
      slotName: input.slotName,
      slotKind: input.slotKind,
      description: input.description,
      promptHint: input.promptHint,
      ownerLabel: input.ownerLabel,
      referenceResourceIds: input.referenceResourceIds,
      createdAt: new Date().toISOString(),
    }), null, 2),
    source: {
      entityType: 'asset_slot',
      entityId: input.assetSlotId,
      pageType: 'asset_proposal',
      pageRoute: ROUTES.project.preProduction,
    },
    target: {
      projectId: input.projectId,
      entityType: 'asset_slot',
      entityId: input.assetSlotId,
      field: 'candidate_generation_plan',
    },
    metadata: {
      pageOwned: true,
      assetSlotId: input.assetSlotId,
      requestedOutputKind: input.requestedOutputKind,
      referenceResourceIds: input.referenceResourceIds,
    },
  })
}

export function buildAssetCandidateProposalReviewSearchParams(current: URLSearchParams, input: AssetCandidateProposalReviewSearchInput): URLSearchParams {
  return mergeProjectWorkbenchArtifactReviewSearchParams(current, buildAssetCandidateProposalReviewSearchInput(input))
}

export function buildPreProductionAuditReviewSearchParams(current: URLSearchParams, input: PreProductionAuditReviewSearchInput): URLSearchParams {
  return mergeProjectWorkbenchArtifactReviewSearchParams(current, {
    workbenchId: 'pre_production',
    artifacts: input.artifacts,
    primary: { proposalKind: 'setting_proposal' },
    relatedDraftParams: [
      { proposalKind: 'setting_proposal', queryParam: 'settingDraftId' },
      { proposalKind: 'asset_proposal', queryParam: 'assetProposalDraftId' },
    ],
  })
}

export function buildAssetCandidateProposalAgentPanelDraftPayload(input: AssetCandidateProposalAgentPayloadInput): AgentPanelDraftPayload {
  return {
    requestId: input.requestId,
    taskType: 'asset_candidate_proposal',
    message: `请准备素材候选提案：${input.slotName}`,
    title: `素材提案: ${input.slotName}`,
    newConversation: true,
    autoSend: true,
    projectId: input.projectId,
    clientInput: buildCommandFirstClientInput({
      message: `请为当前素材需求编写一份可审阅的素材候选生成提案：${input.slotName}`,
      labels: ['asset-slots', 'asset-proposal', 'draft-application'],
      hints: {
        projectId: input.projectId,
        draftId: input.draftId,
        route: { pathname: ROUTES.project.preProduction },
        selection: {
          entityType: 'asset_slot',
          entityId: input.assetSlotId,
          label: input.slotName,
        },
      },
    }),
    timeoutMs: 240_000,
    renderMode: 'chat',
  }
}

export function buildPreProductionAuditAgentPanelDraftPayload(input: PreProductionAuditAgentPayloadInput): AgentPanelDraftPayload {
  return {
    requestId: input.requestId,
    taskType: 'pre_production_audit',
    message: `请梳理当前设定和素材：${input.projectLabel}`,
    title: `前期准备梳理: ${input.projectLabel}`,
    newConversation: true,
    autoSend: true,
    projectId: input.projectId,
    clientInput: buildCommandFirstClientInput({
      message: [
        `请梳理当前项目「${input.projectLabel}」的前期准备。`,
        '读取当前 draft model / 已有 proposal draft 的 seed 与 snapshot 作为设定基准，再检查 asset_slots，输出可审阅草稿：',
        '1. 如果设定资料缺漏、重复、状态不清晰，创建或更新 setting_proposal；只修改 proposal.creative_references，proposal.asset_slots 必须为空。',
        '2. 如果素材需求缺漏、归属不清晰、优先级/状态/类型需要修正，创建或更新 asset_proposal；只修改 proposal.asset_slots，proposal.creative_references 必须为空。',
        '3. 本轮只做设定与素材需求提案；不处理图片/视频输出、媒体任务或候选 prompt。',
        '4. 已有 setting_proposal draft 时，优先使用 draft 的 metadata.seed.data 或 content.snapshot_base；不要用 live creative reference 查询覆盖 draft 基准。',
        '5. 如果查询工具返回 total_count > 0 但 count/returned = 0，说明当前筛选没有可用明细；应回到 draft seed/snapshot 或放宽筛选，不要据此判定“有资料但不能编辑”。',
        '6. 保留已确认信息，在 summary 或 impact_notes 中列出关键缺口和建议审阅顺序。',
      ].join('\n'),
      labels: ['pre-production', 'setting_proposal', 'asset_proposal', 'draft-review'],
      hints: {
        projectId: input.projectId,
        route: { pathname: ROUTES.project.preProduction },
        selection: {
          entityType: 'project',
          entityId: input.projectId,
          label: input.projectLabel,
        },
      },
    }),
    timeoutMs: 300_000,
    renderMode: 'page',
  }
}

export function buildMediaCandidateGenerationAgentPanelDraftPayload(input: MediaCandidateGenerationAgentPayloadInput): AgentPanelDraftPayload {
  return {
    requestId: input.requestId,
    taskType: 'asset_candidate_generation',
    message: `请为素材需求生成${input.outputKind === 'video' ? '视频' : '图片'}候选：${input.slotName}`,
    title: `生成${input.outputKind === 'video' ? '视频' : '图片'}候选: ${input.slotName}`,
    newConversation: true,
    autoSend: true,
    projectId: input.projectId,
    clientInput: buildCommandFirstClientInput({
      message: [
        `请为当前 asset slot 真实生成一个或多个${input.outputKind === 'video' ? '视频' : '图片'}候选：${input.slotName}。`,
        `目标 assetSlotId=${input.assetSlotId}，类型=${input.slotKind}。`,
        input.description ? `素材说明：${input.description}` : '',
        input.promptHint ? `提示词线索：${input.promptHint}` : '',
        '这不是素材方案草稿，请走 asset_candidate_generation / visual_generation，创建生成任务并监控结果；如果得到一个或多个 output_resource_id，请逐个加入候选集并逐项报告写入结果。',
      ].filter(Boolean).join('\n'),
      labels: ['pre-production', 'asset-candidate-generation', input.outputKind === 'video' ? 'video-generation' : 'image-generation'],
      hints: {
        projectId: input.projectId,
        route: { pathname: ROUTES.project.preProduction },
        selection: {
          entityType: 'asset_slot',
          entityId: input.assetSlotId,
          label: input.slotName,
        },
      },
    }),
    timeoutMs: 600_000,
    renderMode: 'chat',
  }
}

export function launchAssetCandidateProposalAgent(input: AssetCandidateProposalAgentPayloadInput & { onSettled: AgentPanelPageTool }): () => void {
  const cleanup = registerAgentPanelPageTool(input.requestId, input.onSettled)
  openAgentPanelDraft(buildAssetCandidateProposalAgentPanelDraftPayload(input))
  return cleanup
}

export function launchPreProductionAuditAgent(input: PreProductionAuditAgentPayloadInput & { onSettled: AgentPanelPageTool }): () => void {
  const cleanup = registerAgentPanelPageTool(input.requestId, input.onSettled)
  openAgentPanelDraft(buildPreProductionAuditAgentPanelDraftPayload(input))
  return cleanup
}

export function launchMediaCandidateGenerationAgent(input: MediaCandidateGenerationAgentPayloadInput & { onSettled: AgentPanelPageTool }): () => void {
  const cleanup = registerAgentPanelPageTool(input.requestId, input.onSettled)
  openAgentPanelDraft(buildMediaCandidateGenerationAgentPanelDraftPayload(input))
  return cleanup
}

export function getMediaCandidateGenerationResult(payload: AgentPanelRunSettledPayload): AgentGeneratedResourceRef | undefined {
  return selectLatestGeneratedResource(payload.run)
}

export function mediaCandidateOutputResourceIds(generated?: AgentGeneratedResourceRef): number[] {
  return generated?.outputResourceIds?.length
    ? generated.outputResourceIds
    : generated?.outputResourceId
      ? [generated.outputResourceId]
      : []
}

export function buildAssetCandidateProposalReviewSearchInput(input: AssetCandidateProposalReviewSearchInput): ProjectWorkbenchArtifactReviewSearchInput {
  return {
    workbenchId: 'pre_production',
    artifacts: input.artifacts,
    primary: {
      proposalKind: 'asset_proposal',
      fallbackDraftId: input.fallbackDraftId,
      entityType: 'asset_slot',
      entityId: input.assetSlotId,
    },
    entityType: 'asset_slot',
    entityId: input.assetSlotId,
    relatedDraftParams: [
      { proposalKind: 'asset_proposal', queryParam: 'assetProposalDraftId', fallbackDraftId: input.fallbackDraftId },
    ],
  }
}
