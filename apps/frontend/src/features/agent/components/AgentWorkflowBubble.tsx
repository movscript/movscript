import React from 'react'
import { Bot, Image } from 'lucide-react'
import {
  AgentChatMessage,
  AgentWorkflowApprovalBadge,
  AgentWorkflowApprovalBadgeLabel,
  AgentWorkflowApprovalBadgeRow,
  AgentWorkflowApprovalBody,
  AgentWorkflowApprovalCard,
  AgentWorkflowApprovalCodeBlock,
  AgentWorkflowApprovalHeader,
  AgentWorkflowApprovalMeta,
  AgentWorkflowApprovalPreviewStack,
  AgentWorkflowApprovalPrompt,
  AgentWorkflowApprovalRow,
  AgentWorkflowApprovalSideEffect,
  AgentWorkflowApprovalText,
  AgentWorkflowApprovalThumbnail,
  AgentWorkflowApprovalThumbnailFallback,
  AgentWorkflowApprovalTitle,
} from '@movscript/ui'
import {
  DraftDiff,
  isDraftApplyPreview,
  safeJSONStringify,
} from '@/features/agent/components/AgentDebugPreviewDialog'
import { AgentActivityFeedView } from '@/features/agent/components/AgentActivityFeed'
import { type LocalAgentApprovalRequest } from '@/features/agent/components/localRuntime'
import { AuthedImage } from '@/shared/ui/AuthedImage'
import { formatAgentDividerTime } from '@/features/agent/domain/agentMessageDivider'
import { resourceFileUrl } from '@/features/content/domain/contentWorkbenchStatus'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type {
  AgentInputAnswer,
  AgentPendingApprovalRequest,
  AgentPendingInputRequest,
} from '@/features/agent/domain/agentWorkflowInteraction'

type LocalAgentWorkflowInteraction =
  | { id: string; kind: 'input'; createdAt: string; request: AgentPendingInputRequest }
  | { id: string; kind: 'approval'; createdAt: string; approval: AgentPendingApprovalRequest }

export function LocalAgentWorkflowBubble({
  run,
  approving = false,
  onApprove,
  onReject,
  onAnswerInput,
}: {
  run: AgentRun | null
  approving?: boolean
  onApprove?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: AgentInputAnswer) => void
}) {
  if (!run) return null
  const interactions = workflowInteractions(run)
  if (interactions.length === 0) return null
  return (
    <AgentChatMessage
      role="assistant"
      avatar={<Bot size={14} />}
      head={<span className="ms-agent-message__head-label">{formatAgentDividerTime(interactions[0]?.createdAt)}</span>}
    >
      <AgentActivityFeedView
        run={run}
        approving={approving}
        onApprove={onApprove}
        onReject={onReject}
        onAnswerInput={onAnswerInput}
        approvalDetails={(approval) => localAgentApprovalDetails(approval)}
      />
    </AgentChatMessage>
  )
}

export function localAgentApprovalDetails(approval: LocalAgentApprovalRequest) {
  const generationApproval = generationJobApprovalView(approval)
  const assetCandidateApproval = assetSlotCandidateApprovalView(approval)
  return (
    <>
      {generationApproval ? (
        <GenerationJobApprovalDetails view={generationApproval} />
      ) : assetCandidateApproval ? (
        <AssetSlotCandidateApprovalDetails view={assetCandidateApproval} />
      ) : approval.args && (
        <AgentWorkflowApprovalCodeBlock>
          {safeJSONStringify(approval.args)}
        </AgentWorkflowApprovalCodeBlock>
      )}
      {(() => {
        const applyPreview = isDraftApplyPreview(approval.preview) ? approval.preview : null
        return applyPreview ? (
          <AgentWorkflowApprovalPreviewStack>
            <AgentWorkflowApprovalSideEffect>
              {applyPreview.review.sideEffect}
            </AgentWorkflowApprovalSideEffect>
            <DraftDiff preview={applyPreview} />
          </AgentWorkflowApprovalPreviewStack>
        ) : null
      })()}
    </>
  )
}

interface GenerationJobApprovalView {
  targetLabel?: string
  targetType?: string
  targetId?: number
  featureKey?: string
  capability?: string
  modelId?: string
  aspectRatio?: string
  imageSize?: string
  quality?: string
  referenceResourceIds: number[]
  candidateCount?: number
  creativeReferenceName?: string
  prompt?: string
}

interface AssetSlotCandidateApprovalView {
  assetSlotId?: number
  resourceIds: number[]
  sourceType?: string
  sourceId?: number
  score?: number
  note?: string
}

function GenerationJobApprovalDetails({ view }: { view: GenerationJobApprovalView }) {
  const specItems = [
    view.modelId ? ['模型', view.modelId] : undefined,
    view.imageSize ? ['尺寸', view.imageSize] : undefined,
    view.aspectRatio ? ['比例', view.aspectRatio] : undefined,
    view.quality ? ['质量', view.quality] : undefined,
    view.candidateCount ? ['候选数', `${view.candidateCount}`] : undefined,
  ].filter((item): item is [string, string] => Boolean(item))
  const previewResourceId = view.referenceResourceIds[0]
  return (
    <AgentWorkflowApprovalCard>
      <AgentWorkflowApprovalRow>
        <ApprovalResourceThumbnail resourceId={previewResourceId} />
        <AgentWorkflowApprovalBody>
          <AgentWorkflowApprovalHeader>
            <AgentWorkflowApprovalTitle>
              {view.targetLabel ?? '生成图片候选'}
            </AgentWorkflowApprovalTitle>
            {view.targetType && view.targetId !== undefined && (
              <AgentWorkflowApprovalBadge>
                {view.targetType} #{view.targetId}
              </AgentWorkflowApprovalBadge>
            )}
          </AgentWorkflowApprovalHeader>
          <AgentWorkflowApprovalBadgeRow>
            {specItems.map(([label, value]) => (
              <AgentWorkflowApprovalBadge key={label}>
                <AgentWorkflowApprovalBadgeLabel>{label}</AgentWorkflowApprovalBadgeLabel> {value}
              </AgentWorkflowApprovalBadge>
            ))}
          </AgentWorkflowApprovalBadgeRow>
          {(view.creativeReferenceName || view.referenceResourceIds.length > 0 || view.featureKey || view.capability) && (
            <AgentWorkflowApprovalMeta>
              {view.creativeReferenceName && <span>参考角色：{view.creativeReferenceName}</span>}
              {view.referenceResourceIds.length > 0 && <span>参考资源：{view.referenceResourceIds.map((id) => `#${id}`).join(', ')}</span>}
              {view.featureKey && <span>{view.featureKey}</span>}
              {view.capability && <span>{view.capability}</span>}
            </AgentWorkflowApprovalMeta>
          )}
        </AgentWorkflowApprovalBody>
      </AgentWorkflowApprovalRow>
      {view.prompt && (
        <AgentWorkflowApprovalPrompt>
          {view.prompt}
        </AgentWorkflowApprovalPrompt>
      )}
    </AgentWorkflowApprovalCard>
  )
}

function AssetSlotCandidateApprovalDetails({ view }: { view: AssetSlotCandidateApprovalView }) {
  const resourceIds = uniqueNumbers(view.resourceIds)
  const previewResourceId = resourceIds[0]
  const resourceLabel = resourceIds.length > 0
    ? resourceIds.map((id) => `#${id}`).join(', ')
    : '未指定'
  const sourceParts = [
    view.sourceType,
    view.sourceId !== undefined ? `#${view.sourceId}` : undefined,
  ].filter(Boolean)
  return (
    <AgentWorkflowApprovalCard>
      <AgentWorkflowApprovalRow>
        <ApprovalResourceThumbnail resourceId={previewResourceId} />
        <AgentWorkflowApprovalBody>
          <AgentWorkflowApprovalHeader>
            {view.assetSlotId !== undefined && (
              <AgentWorkflowApprovalBadge>
                素材槽 #{view.assetSlotId}
              </AgentWorkflowApprovalBadge>
            )}
            {view.assetSlotId === undefined && (
              <AgentWorkflowApprovalTitle>目标素材槽未指定</AgentWorkflowApprovalTitle>
            )}
          </AgentWorkflowApprovalHeader>
          <AgentWorkflowApprovalBadgeRow>
            <AgentWorkflowApprovalBadge>
              <AgentWorkflowApprovalBadgeLabel>资源</AgentWorkflowApprovalBadgeLabel> {resourceLabel}
            </AgentWorkflowApprovalBadge>
            {sourceParts.length > 0 && (
              <AgentWorkflowApprovalBadge>
                <AgentWorkflowApprovalBadgeLabel>来源</AgentWorkflowApprovalBadgeLabel> {sourceParts.join(' ')}
              </AgentWorkflowApprovalBadge>
            )}
            {view.score !== undefined && view.score !== 1 && (
              <AgentWorkflowApprovalBadge>
                <AgentWorkflowApprovalBadgeLabel>评分</AgentWorkflowApprovalBadgeLabel> {view.score}
              </AgentWorkflowApprovalBadge>
            )}
          </AgentWorkflowApprovalBadgeRow>
          <AgentWorkflowApprovalText>
            只加入候选集，不会锁定、采纳或替换当前素材。
          </AgentWorkflowApprovalText>
        </AgentWorkflowApprovalBody>
      </AgentWorkflowApprovalRow>
      {view.note && !isRedundantAssetCandidateNote(view.note, view) && (
        <AgentWorkflowApprovalPrompt>
          {view.note}
        </AgentWorkflowApprovalPrompt>
      )}
    </AgentWorkflowApprovalCard>
  )
}

function ApprovalResourceThumbnail({ resourceId }: { resourceId?: number }) {
  return (
    <AgentWorkflowApprovalThumbnail>
      {resourceId !== undefined ? (
        <AuthedImage
          src={resourceFileUrl(resourceId)}
          alt={`资源 #${resourceId}`}
        />
      ) : (
        <AgentWorkflowApprovalThumbnailFallback>
          <Image size={14} />
        </AgentWorkflowApprovalThumbnailFallback>
      )}
    </AgentWorkflowApprovalThumbnail>
  )
}

function generationJobApprovalView(approval: LocalAgentApprovalRequest): GenerationJobApprovalView | null {
  const args = asRecord(approval.args)
  if (!args) return null
  const kind = stringValue(args.kind)
  if (approval.toolName !== 'generation_job_create' && !(approval.toolName === 'core_work_start' && kind === 'generation_job')) return null
  const request = asRecord(args.request) ?? args
  const target = asRecord(request.target)
  const params = asRecord(request.params)
  const metadata = asRecord(request.metadata)
  const referenceResourceIds = arrayNumbers(request.reference_resource_ids)
  return {
    targetLabel: stringValue(target?.name) ?? stringValue(request.targetName) ?? stringValue(metadata?.creative_reference_name),
    targetType: stringValue(target?.type),
    targetId: numberValue(target?.id) ?? numberValue(request.asset_slot_id),
    featureKey: stringValue(request.feature_key),
    capability: stringValue(request.capability),
    modelId: stringValue(request.model_id),
    aspectRatio: stringValue(params?.aspect_ratio),
    imageSize: stringValue(params?.image_size),
    quality: stringValue(params?.quality),
    referenceResourceIds,
    candidateCount: numberValue(metadata?.candidate_count),
    creativeReferenceName: stringValue(metadata?.creative_reference_name),
    prompt: stringValue(request.prompt),
  }
}

function assetSlotCandidateApprovalView(approval: LocalAgentApprovalRequest): AssetSlotCandidateApprovalView | null {
  if (approval.toolName !== 'candidate_asset_slot_attach' && approval.toolName !== 'asset_candidate_write') return null
  const args = asRecord(approval.args)
  if (!args) return null
  const resourceIds = [
    ...arrayNumbers(args.resource_ids),
    ...arrayNumbers(args.resourceIds),
    ...arrayNumbers(args.output_resource_ids),
    ...arrayNumbers(args.outputResourceIds),
  ]
  const singleResourceId = numberValue(args.resource_id)
    ?? numberValue(args.resourceId)
    ?? numberValue(args.output_resource_id)
    ?? numberValue(args.outputResourceId)
  if (singleResourceId !== undefined && !resourceIds.includes(singleResourceId)) resourceIds.unshift(singleResourceId)
  return {
    assetSlotId: numberValue(args.asset_slot_id) ?? numberValue(args.assetSlotId),
    resourceIds: uniqueNumbers(resourceIds),
    sourceType: stringValue(args.source_type) ?? stringValue(args.sourceType),
    sourceId: numberValue(args.source_id) ?? numberValue(args.sourceId) ?? numberValue(args.jobId),
    score: numberValue(args.score),
    note: stringValue(args.note),
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function arrayNumbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)) : []
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)]
}

function isRedundantAssetCandidateNote(note: string, view: AssetSlotCandidateApprovalView): boolean {
  const normalized = note.toLowerCase()
  const mentionsCandidate = /候选|candidate/.test(normalized)
  const mentionsGeneration = /generation_job|生成任务/.test(normalized)
  const mentionsResource = /资源|resource/.test(normalized)
  const mentionsSource = view.sourceId !== undefined ? normalized.includes(`#${view.sourceId}`) || normalized.includes(String(view.sourceId)) : false
  return mentionsCandidate && mentionsGeneration && mentionsResource && mentionsSource
}

function workflowInteractions(run: AgentRun): LocalAgentWorkflowInteraction[] {
  const approvals = run.pendingApprovals ?? []
  const inputs = run.pendingInputRequests ?? []
  return [
    ...inputs
      .filter((request) => request.status === 'pending' || request.status === 'answered' || request.status === 'cancelled')
      .map((request) => ({
        id: `input-${request.id}`,
        kind: 'input' as const,
        createdAt: request.createdAt,
        request,
      })),
    ...approvals
      .filter((approval) => approval.status === 'pending' || approval.status === 'approved' || approval.status === 'rejected')
      .map((approval) => ({
        id: `approval-${approval.id}`,
        kind: 'approval' as const,
        createdAt: approval.createdAt,
        approval,
      })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
