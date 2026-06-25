import React from 'react'
import { Bot, Image } from 'lucide-react'
import { AgentChatMessage } from '@/shared/ui/AgentMessageUi'
import {
  AgentRunInteractionApprovalBadge,
  AgentRunInteractionApprovalBadgeLabel,
  AgentRunInteractionApprovalBadgeRow,
  AgentRunInteractionApprovalBody,
  AgentRunInteractionApprovalCard,
  AgentRunInteractionApprovalCodeBlock,
  AgentRunInteractionApprovalHeader,
  AgentRunInteractionApprovalMeta,
  AgentRunInteractionApprovalPreviewStack,
  AgentRunInteractionApprovalPrompt,
  AgentRunInteractionApprovalRow,
  AgentRunInteractionApprovalSideEffect,
  AgentRunInteractionApprovalText,
  AgentRunInteractionApprovalThumbnail,
  AgentRunInteractionApprovalThumbnailFallback,
  AgentRunInteractionApprovalTitle
} from '@/features/agent/components/run-interaction-ui'
import {
  WorkspaceDiff,
  isWorkspaceApplyPreview,
  safeJSONStringify,
} from '@/features/agent/components/AgentDebugPreviewWorkspaceDiff'
import { AgentActivityFeedView } from '@/features/agent/components/AgentActivityFeed'
import { type ProviderSessionApprovalRequest } from '@/features/agent/components/providerSessionInteractions'
import { formatAgentDividerTime } from '@/features/agent/presentation/agentMessageDivider'
import { ResourceFileImage } from '@movscript/resource-surface/resource-media-components'
import type { AgentRun } from '@movscript/agent-protocol'
import type {
  AgentInputAnswer,
  AgentPendingApprovalRequest,
  AgentPendingInputRequest,
} from '@/features/agent/domain/agentRunInteraction'
import type { AgentRunApprovalDecisionInput } from '@/features/agent/application/agentRunInteractionActions'

type ProviderSessionRunInteractionInteraction =
  | { id: string; kind: 'input'; createdAt: string; request: AgentPendingInputRequest }
  | { id: string; kind: 'approval'; createdAt: string; approval: AgentPendingApprovalRequest }

export function ProviderSessionRunInteractionBubble({
  run,
  approving = false,
  onApprove,
  onReject,
  onAnswerInput,
}: {
  run: AgentRun | null
  approving?: boolean
  onApprove?: (approvalIds?: string[], approvalDecision?: AgentRunApprovalDecisionInput) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: AgentInputAnswer) => void
}) {
  if (!run) return null
  const interactions = runInteractions(run)
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
        onApproveForSession={onApprove ? (approvalIds) => onApprove(approvalIds, { scope: 'session' }) : undefined}
        onReject={onReject}
        onAnswerInput={onAnswerInput}
        approvalDetails={(approval) => providerSessionApprovalDetails(approval)}
      />
    </AgentChatMessage>
  )
}

export function providerSessionApprovalDetails(approval: ProviderSessionApprovalRequest) {
  const generationApproval = generationJobApprovalView(approval)
  const assetCandidateApproval = assetSlotCandidateApprovalView(approval)
  const args = approvalArgs(approval)
  const preview = approvalPreview(approval)
  return (
    <>
      {generationApproval ? (
        <GenerationJobApprovalDetails view={generationApproval} />
      ) : assetCandidateApproval ? (
        <AssetSlotCandidateApprovalDetails view={assetCandidateApproval} />
      ) : args && (
        <AgentRunInteractionApprovalCodeBlock>
          {safeJSONStringify(args)}
        </AgentRunInteractionApprovalCodeBlock>
      )}
      {(() => {
        const applyPreview = isWorkspaceApplyPreview(preview) ? preview : null
        return applyPreview ? (
          <AgentRunInteractionApprovalPreviewStack>
            <AgentRunInteractionApprovalSideEffect>
              {applyPreview.review.sideEffect}
            </AgentRunInteractionApprovalSideEffect>
            <WorkspaceDiff preview={applyPreview} />
          </AgentRunInteractionApprovalPreviewStack>
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
  settingName?: string
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
    <AgentRunInteractionApprovalCard>
      <AgentRunInteractionApprovalRow>
        <ApprovalResourceThumbnail resourceId={previewResourceId} />
        <AgentRunInteractionApprovalBody>
          <AgentRunInteractionApprovalHeader>
            <AgentRunInteractionApprovalTitle>
              {view.targetLabel ?? '生成图片候选'}
            </AgentRunInteractionApprovalTitle>
            {view.targetType && view.targetId !== undefined && (
              <AgentRunInteractionApprovalBadge>
                {view.targetType} #{view.targetId}
              </AgentRunInteractionApprovalBadge>
            )}
          </AgentRunInteractionApprovalHeader>
          <AgentRunInteractionApprovalBadgeRow>
            {specItems.map(([label, value]) => (
              <AgentRunInteractionApprovalBadge key={label}>
                <AgentRunInteractionApprovalBadgeLabel>{label}</AgentRunInteractionApprovalBadgeLabel> {value}
              </AgentRunInteractionApprovalBadge>
            ))}
          </AgentRunInteractionApprovalBadgeRow>
          {(view.settingName || view.referenceResourceIds.length > 0 || view.featureKey || view.capability) && (
            <AgentRunInteractionApprovalMeta>
              {view.settingName && <span>参考角色：{view.settingName}</span>}
              {view.referenceResourceIds.length > 0 && <span>参考资源：{view.referenceResourceIds.map((id) => `#${id}`).join(', ')}</span>}
              {view.featureKey && <span>{view.featureKey}</span>}
              {view.capability && <span>{view.capability}</span>}
            </AgentRunInteractionApprovalMeta>
          )}
        </AgentRunInteractionApprovalBody>
      </AgentRunInteractionApprovalRow>
      {view.prompt && (
        <AgentRunInteractionApprovalPrompt>
          {view.prompt}
        </AgentRunInteractionApprovalPrompt>
      )}
    </AgentRunInteractionApprovalCard>
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
    <AgentRunInteractionApprovalCard>
      <AgentRunInteractionApprovalRow>
        <ApprovalResourceThumbnail resourceId={previewResourceId} />
        <AgentRunInteractionApprovalBody>
          <AgentRunInteractionApprovalHeader>
            {view.assetSlotId !== undefined && (
              <AgentRunInteractionApprovalBadge>
                素材槽 #{view.assetSlotId}
              </AgentRunInteractionApprovalBadge>
            )}
            {view.assetSlotId === undefined && (
              <AgentRunInteractionApprovalTitle>目标素材槽未指定</AgentRunInteractionApprovalTitle>
            )}
          </AgentRunInteractionApprovalHeader>
          <AgentRunInteractionApprovalBadgeRow>
            <AgentRunInteractionApprovalBadge>
              <AgentRunInteractionApprovalBadgeLabel>资源</AgentRunInteractionApprovalBadgeLabel> {resourceLabel}
            </AgentRunInteractionApprovalBadge>
            {sourceParts.length > 0 && (
              <AgentRunInteractionApprovalBadge>
                <AgentRunInteractionApprovalBadgeLabel>来源</AgentRunInteractionApprovalBadgeLabel> {sourceParts.join(' ')}
              </AgentRunInteractionApprovalBadge>
            )}
            {view.score !== undefined && view.score !== 1 && (
              <AgentRunInteractionApprovalBadge>
                <AgentRunInteractionApprovalBadgeLabel>评分</AgentRunInteractionApprovalBadgeLabel> {view.score}
              </AgentRunInteractionApprovalBadge>
            )}
          </AgentRunInteractionApprovalBadgeRow>
          <AgentRunInteractionApprovalText>
            只加入候选集，不会锁定、采纳或替换当前素材。
          </AgentRunInteractionApprovalText>
        </AgentRunInteractionApprovalBody>
      </AgentRunInteractionApprovalRow>
      {view.note && !isRedundantAssetCandidateNote(view.note, view) && (
        <AgentRunInteractionApprovalPrompt>
          {view.note}
        </AgentRunInteractionApprovalPrompt>
      )}
    </AgentRunInteractionApprovalCard>
  )
}

function ApprovalResourceThumbnail({ resourceId }: { resourceId?: number }) {
  return (
    <AgentRunInteractionApprovalThumbnail>
      {resourceId !== undefined ? (
        <ResourceFileImage
          resourceId={resourceId}
          alt={`资源 #${resourceId}`}
        />
      ) : (
        <AgentRunInteractionApprovalThumbnailFallback>
          <Image size={14} />
        </AgentRunInteractionApprovalThumbnailFallback>
      )}
    </AgentRunInteractionApprovalThumbnail>
  )
}

function generationJobApprovalView(approval: ProviderSessionApprovalRequest): GenerationJobApprovalView | null {
  const args = asRecord(approvalArgs(approval))
  if (!args) return null
  const kind = stringValue(args.kind)
  if (!isGenerationSubmitApproval(approval.toolName, kind)) return null
  const workRequest = asRecord(args.request)
  const request = asRecord(workRequest?.args) ?? workRequest ?? args
  const target = asRecord(request.target)
  const params = asRecord(request.params)
  const metadata = asRecord(request.metadata)
  const referenceResourceIds = [
    ...arrayNumbers(request.reference_resource_ids),
    ...arrayNumbers(request.input_resource_ids),
  ]
  return {
    targetLabel: stringValue(target?.name) ?? stringValue(request.targetName) ?? stringValue(metadata?.setting_name),
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
    settingName: stringValue(metadata?.setting_name),
    prompt: stringValue(request.prompt),
  }
}

function isGenerationSubmitApproval(toolName: string | undefined, kind: string | undefined): boolean {
  return toolName === 'generation_submit'
    || toolName === 'generation_job_create'
    || (toolName === 'core_work_start' && kind === 'generation_job')
}

function assetSlotCandidateApprovalView(approval: ProviderSessionApprovalRequest): AssetSlotCandidateApprovalView | null {
  if (approval.toolName !== 'asset_candidate_write') return null
  const args = asRecord(approvalArgs(approval))
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

function approvalArgs(approval: ProviderSessionApprovalRequest): unknown {
  return 'args' in approval ? approval.args : undefined
}

function approvalPreview(approval: ProviderSessionApprovalRequest): unknown {
  return 'preview' in approval ? approval.preview : undefined
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

function runInteractions(run: AgentRun): ProviderSessionRunInteractionInteraction[] {
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
