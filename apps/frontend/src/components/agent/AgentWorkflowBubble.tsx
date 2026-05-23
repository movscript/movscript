import React from 'react'
import { Bot, Image } from 'lucide-react'
import { AgentChatMessage } from '@movscript/ui'
import {
  DraftDiff,
  isDraftApplyPreview,
  safeJSONStringify,
} from '@/components/agent/AgentDebugPreviewDialog'
import {
  LocalAgentApprovalRequestCard,
  LocalAgentInputRequestCard,
  type LocalAgentApprovalRequest,
} from '@/components/agent/localRuntime'
import { AuthedImage } from '@/components/shared/AuthedImage'
import { formatAgentDividerTime } from '@/lib/agentMessageDivider'
import { resourceFileUrl } from '@/lib/contentWorkbenchStatus'
import type { AgentRun } from '@/lib/localAgentClient'
import type {
  AgentInputAnswer,
  AgentPendingApprovalRequest,
  AgentPendingInputRequest,
} from '@/lib/agentWorkflowInteraction'

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
    <>
      {interactions.map((interaction) => {
        return (
          <AgentChatMessage
            key={`${run.id}-${interaction.id}`}
            role="assistant"
            avatar={<Bot size={14} />}
            data-agent-divider-label={formatAgentDividerTime(interaction.createdAt)}
          >
            {interaction.kind === 'input' ? (
              <LocalAgentInputRequestCard
                request={interaction.request}
                disabled={approving || interaction.request.status !== 'pending' || !onAnswerInput}
                onAnswer={(answer) => onAnswerInput?.(interaction.request.id, answer)}
              />
            ) : (
              <LocalAgentApprovalRequestCard
                approval={interaction.approval}
                approving={approving}
                onApprove={onApprove}
                onReject={onReject}
                approvalDetails={(approval) => localAgentApprovalDetails(approval)}
              />
            )}
          </AgentChatMessage>
        )
      })}
    </>
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
        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-1.5 type-micro text-muted-foreground">
          {safeJSONStringify(approval.args)}
        </pre>
      )}
      {(() => {
        const applyPreview = isDraftApplyPreview(approval.preview) ? approval.preview : null
        return applyPreview ? (
          <div className="mt-1 space-y-1">
            <div className="rounded border border-border/70 bg-muted/20 p-1.5 type-micro leading-relaxed text-muted-foreground">
              {applyPreview.review.sideEffect}
            </div>
            <DraftDiff preview={applyPreview} />
          </div>
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
    <div className="mt-1.5 rounded-md border border-border/30 bg-background/35 p-2.5">
      <div className="flex min-w-0 items-start gap-2">
        <ApprovalResourceThumbnail resourceId={previewResourceId} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="truncate type-tiny font-medium text-foreground">
              {view.targetLabel ?? '生成图片候选'}
            </span>
            {view.targetType && view.targetId !== undefined && (
              <span className="rounded border border-border/30 px-1.5 py-0 type-micro text-muted-foreground">
                {view.targetType} #{view.targetId}
              </span>
            )}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap gap-1">
            {specItems.map(([label, value]) => (
              <span key={label} className="rounded border border-border/30 bg-transparent px-1.5 py-0.5 type-micro text-muted-foreground">
                <span className="text-foreground/80">{label}</span> {value}
              </span>
            ))}
          </div>
          {(view.creativeReferenceName || view.referenceResourceIds.length > 0 || view.featureKey || view.capability) && (
            <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 type-micro text-muted-foreground">
              {view.creativeReferenceName && <span>参考角色：{view.creativeReferenceName}</span>}
              {view.referenceResourceIds.length > 0 && <span>参考资源：{view.referenceResourceIds.map((id) => `#${id}`).join(', ')}</span>}
              {view.featureKey && <span>{view.featureKey}</span>}
              {view.capability && <span>{view.capability}</span>}
            </div>
          )}
        </div>
      </div>
      {view.prompt && (
        <p className="mt-2 line-clamp-3 type-tiny leading-relaxed text-muted-foreground">
          {view.prompt}
        </p>
      )}
    </div>
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
    <div className="mt-1.5 rounded-md border border-border/30 bg-background/35 p-2.5">
      <div className="flex min-w-0 items-start gap-2">
        <ApprovalResourceThumbnail resourceId={previewResourceId} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
            {view.assetSlotId !== undefined && (
              <span className="rounded border border-border/30 px-1.5 py-0 type-micro text-muted-foreground">
                素材槽 #{view.assetSlotId}
              </span>
            )}
            {view.assetSlotId === undefined && (
              <span className="truncate type-tiny font-medium text-foreground">目标素材槽未指定</span>
            )}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap gap-1">
            <span className="rounded border border-border/30 bg-transparent px-1.5 py-0.5 type-micro text-muted-foreground">
              <span className="text-foreground/80">资源</span> {resourceLabel}
            </span>
            {sourceParts.length > 0 && (
              <span className="rounded border border-border/30 bg-transparent px-1.5 py-0.5 type-micro text-muted-foreground">
                <span className="text-foreground/80">来源</span> {sourceParts.join(' ')}
              </span>
            )}
            {view.score !== undefined && view.score !== 1 && (
              <span className="rounded border border-border/30 bg-transparent px-1.5 py-0.5 type-micro text-muted-foreground">
                <span className="text-foreground/80">评分</span> {view.score}
              </span>
            )}
          </div>
          <p className="mt-1 type-micro leading-relaxed text-muted-foreground">
            只加入候选集，不会锁定、采纳或替换当前素材。
          </p>
        </div>
      </div>
      {view.note && !isRedundantAssetCandidateNote(view.note, view) && (
        <p className="mt-2 line-clamp-2 type-tiny leading-relaxed text-muted-foreground">
          {view.note}
        </p>
      )}
    </div>
  )
}

function ApprovalResourceThumbnail({ resourceId }: { resourceId?: number }) {
  return (
    <div className="mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border/30 bg-muted/20">
      {resourceId !== undefined ? (
        <AuthedImage
          src={resourceFileUrl(resourceId)}
          alt={`资源 #${resourceId}`}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sky-700 dark:text-sky-300">
          <Image size={14} />
        </div>
      )}
    </div>
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
