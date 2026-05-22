import type { ScriptVersion } from '@/api/scriptVersions'
import { buildCommandFirstClientInput } from '@/lib/agentCommandInput'
import {
  openAgentPanelDraft,
  registerAgentPanelPageTool,
  type AgentPanelDraftPayload,
  type AgentPanelPageTool,
} from '@/lib/agentPanelBridge'
import type { AgentTaskArtifactRef } from '@/lib/agentArtifacts'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import { buildProductionDraftSeedMetadata, type ProductionDraftSeedEntity } from '@/lib/productionOrchestrationDraftSeed'
import { buildEmptyProductionProposalDraftContent } from '@/lib/productionProposalDraft'
import type { ProductionAnalysisTarget } from '@/lib/productionAnalysisText'
import type { ProposalSegmentNode } from '@/lib/productionProposalReviewModel'
import { mergeProjectWorkbenchArtifactReviewSearchParams } from '@/lib/projectWorkbenchDraftReview'
import { ROUTES } from '@/routes/projectRoutes'

export type ProductionProposalLaunchProduction = ProductionDraftSeedEntity & {
  script_version_id?: number
  name?: string
  description?: string
}

export interface EnsureProductionProposalDraftInput {
  projectId: number
  productionId: number
  production?: ProductionProposalLaunchProduction | null
  productionPageKey: string
  openedDraftId?: string
  productionSnapshot: { segments: ProposalSegmentNode[] }
  scriptVersion?: ScriptVersion | null
  projectScripts: ScriptVersion[]
  seedProposalFromSnapshot?: boolean
}

export interface ProductionProposalAgentPayloadInput {
  requestId: string
  projectId: number
  productionId: number
  productionLabel: string
  draftId: string
  target: ProductionAnalysisTarget
}

export interface ProductionProposalRevisionAgentPayloadInput {
  requestId: string
  projectId: number
  productionId: number
  productionLabel: string
  draftId: string
  instruction: string
}

export interface ProductionProposalReviewSearchInput {
  productionId: number
  fallbackDraftId?: string
  artifacts?: AgentTaskArtifactRef[]
}

export async function ensureProductionProposalDraft(input: EnsureProductionProposalDraftInput): Promise<AgentDraft> {
  const [explicitProductionDraft, productionDraftQuery] = await Promise.all([
    input.openedDraftId ? localAgentClient.getDraft(input.openedDraftId).catch(() => null) : Promise.resolve(null),
    localAgentClient.listDrafts({
      projectId: input.projectId,
      kind: 'production_proposal',
      pageKey: input.productionPageKey,
      limit: 20,
    }),
  ])

  const existingProductionDraft = (explicitProductionDraft?.kind === 'production_proposal' && explicitProductionDraft.status !== 'superseded')
    ? explicitProductionDraft
    : (productionDraftQuery.drafts ?? []).find((draft) => draft.kind === 'production_proposal' && draft.status !== 'superseded')

  if (existingProductionDraft) return existingProductionDraft

  const productionLabel = productionProposalLaunchLabel(input.production, input.productionId)
  const emptyContent = buildEmptyProductionProposalDraftContent({
    projectId: input.projectId,
    productionId: input.productionId,
    snapshotBase: input.productionSnapshot,
    proposedAt: new Date().toISOString(),
  })
  const content = input.seedProposalFromSnapshot
    ? {
        ...emptyContent,
        summary: emptyContent.summary || '基于当前正式编排创建的提案草稿。',
        proposal: {
          segments: input.productionSnapshot.segments,
        },
      }
    : emptyContent

  return localAgentClient.createDraft({
    projectId: input.projectId,
    kind: 'production_proposal',
    title: `制作提案草稿 - ${productionLabel}`,
    content: JSON.stringify(content, null, 2),
    source: {
      entityType: 'production',
      entityId: input.productionId,
      pageKey: input.productionPageKey,
      pageType: 'production_orchestrate',
      pageRoute: ROUTES.project.productionOrchestration,
      selection: {
        entityType: 'production',
        entityId: input.productionId,
        label: productionLabel,
      },
    },
    target: {
      projectId: input.projectId,
      entityType: 'production',
      entityId: input.productionId,
      field: 'proposal',
    },
    metadata: {
      pageOwned: true,
      proposalScope: 'production',
      productionId: input.productionId,
      seed: buildProductionDraftSeedMetadata({
        projectId: input.projectId,
        production: input.production,
        productionSnapshot: input.productionSnapshot,
        scriptVersion: input.scriptVersion,
        projectScripts: input.projectScripts,
        modelRef: 'frontend:DraftDomainModel:production_proposal:v1',
      }),
    },
  })
}

export function buildProductionProposalReviewSearchParams(current: URLSearchParams, input: ProductionProposalReviewSearchInput): URLSearchParams {
  return mergeProjectWorkbenchArtifactReviewSearchParams(current, {
    workbenchId: 'creative_taskGraph',
    artifacts: input.artifacts,
    primary: {
      proposalKind: 'production_proposal',
      fallbackDraftId: input.fallbackDraftId,
    },
    entityType: 'production',
    entityId: input.productionId,
    relatedDraftParams: [
      { proposalKind: 'setting_proposal', queryParam: 'settingDraftId' },
      { proposalKind: 'asset_proposal', queryParam: 'assetProposalDraftId' },
    ],
  })
}

export function buildProductionProposalAgentPanelDraftPayload(input: ProductionProposalAgentPayloadInput): AgentPanelDraftPayload {
  return {
    requestId: input.requestId,
    taskType: 'production_proposal',
    message: `请生成制作提案：${input.productionLabel}`,
    title: `制作提案: ${input.productionLabel}`,
    newConversation: true,
    autoSend: true,
    projectId: input.projectId,
    clientInput: buildCommandFirstClientInput({
      message: productionProposalAgentMessage(input.target),
      labels: ['production-orchestration', 'draft-application'],
      hints: {
        projectId: input.projectId,
        productionId: input.productionId,
        draftId: input.draftId,
        route: { pathname: ROUTES.project.productionOrchestration },
        selection: {
          entityType: 'production',
          entityId: input.productionId,
          label: input.productionLabel,
        },
      },
    }),
    timeoutMs: 180_000,
    renderMode: 'page',
  }
}

export function launchProductionProposalAgent(input: ProductionProposalAgentPayloadInput & { onSettled: AgentPanelPageTool }): () => void {
  const cleanup = registerAgentPanelPageTool(input.requestId, input.onSettled)
  openAgentPanelDraft(buildProductionProposalAgentPanelDraftPayload(input))
  return cleanup
}

export function buildProductionProposalRevisionRequestId(now = Date.now(), random = Math.random()) {
  return `production_proposal_revision_${now.toString(36)}_${random.toString(36).slice(2, 8)}`
}

export function buildProductionProposalRevisionAgentPanelDraftPayload(input: ProductionProposalRevisionAgentPayloadInput): AgentPanelDraftPayload {
  const instruction = input.instruction.trim()
  const draftFileRef = `agent://draft/${encodeURIComponent(input.draftId)}/content`
  return {
    requestId: input.requestId,
    taskType: 'production_proposal',
    message: instruction ? `调整制作提案：${instruction}` : `调整制作提案：${input.productionLabel}`,
    title: `调整制作提案: ${input.productionLabel}`,
    newConversation: true,
    autoSend: true,
    projectId: input.projectId,
    clientInput: buildCommandFirstClientInput({
      message: [
        `请调整当前 production_proposal 草稿：${input.productionLabel}。`,
        `必须把 draft content 当作文件处理：先使用 core_file_read 读取 ${draftFileRef}，再使用 core_file_edit 修改同一个 ref；不要直接写正式 production graph。`,
        '修改完成后简要说明调整了哪些段落、情节、内容项或素材需求。不要调用 draft_apply，除非用户明确要求提交且经过确认。',
        instruction ? `用户调整要求：${instruction}` : '',
      ].filter(Boolean).join('\n\n'),
      labels: ['production-orchestration', 'production-proposal-draft-edit'],
      hints: {
        projectId: input.projectId,
        productionId: input.productionId,
        draftId: input.draftId,
        route: { pathname: ROUTES.project.productionOrchestration },
        selection: {
          entityType: 'production',
          entityId: input.productionId,
          label: input.productionLabel,
        },
      },
    }),
    timeoutMs: 180_000,
    renderMode: 'page',
  }
}

export function launchProductionProposalRevisionAgent(input: ProductionProposalRevisionAgentPayloadInput & { onSettled: AgentPanelPageTool }): () => void {
  const cleanup = registerAgentPanelPageTool(input.requestId, input.onSettled)
  openAgentPanelDraft(buildProductionProposalRevisionAgentPanelDraftPayload(input))
  return cleanup
}

export function productionProposalLaunchLabel(production: { ID?: number; name?: string } | null | undefined, productionId: number): string {
  return production ? String(production.name ?? `制作 #${production.ID}`) : `制作 #${productionId}`
}

function productionProposalAgentMessage(target: ProductionAnalysisTarget): string {
  if (target.scope === 'segmentAnalysis' && target.entityId) {
    return `请围绕当前选中的编排段 #${target.entityId} 生成 production_proposal。若发现必须引用但不存在的项目级设定资料，先转 setting_proposal；若缺少素材需求锚点，先转 asset_proposal。不要把这些上游对象写进 project_standards_proposal。`
  }
  return '请基于当前 production snapshot 生成 production_proposal。若发现必须引用但不存在的项目级设定资料，先转 setting_proposal；若缺少素材需求锚点，先转 asset_proposal。不要把这些上游对象写进 project_standards_proposal。'
}
