import { type HTMLAttributes, type ReactNode, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  MOVSCRIPT_DECISION_REQUEST_METHOD,
  type AgentChatServerRequestResponse,
} from '@movscript/core/agent/chat'

import { MediaViewer } from '@/shared/ui/MediaViewer'
import { createElectronMovScriptWorkspaceService } from '@/shared/infrastructure/workspaceDomainRepository'
import { openAgentPanelDecisionRequest } from '@/features/agent/application/agentPanelBridge'
import { attachmentToResource } from '@/features/agent/domain/agentAttachments'
import { AgentAttachmentIcon, AgentAttachmentMediaPreview } from '@/features/agent/components/AgentAttachmentMediaPreview'
import { isGeneratedResultAttachment } from '@/features/agent/domain/agentGeneratedResultAttachments'
import {
  generatedAttachmentResourceId,
  generatedContentUnitCandidateDecisionRef,
} from '@/features/agent/domain/agentGeneratedResourceBinding'
import { assetCandidateSelectedResult, invalidateResourceMutationResult } from '@/features/resources/application/resourceMutationInvalidation'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import { Badge, Button, type BadgeProps, type ButtonProps, SparklesIcon } from '@movscript/ui/primitives'
import { cn } from '@/shared/ui/cn'
import { GeneratedCandidateAttachDialog } from '@/features/agent/components/GeneratedCandidateAttachDialog'
import { resourceMentionToken } from '@/features/agent/presentation/agentMentionEditorModel'
import {
  generatedResultBreadcrumb,
  generatedResultDetailTitle,
} from '@/features/agent/components/GeneratedResultCardModel'
import './GeneratedResultCard.css'

const AGENT_GENERATED_RESULT_INITIAL_RENDER_LIMIT = 4
type GeneratedMediaPreviewSurface = 'muted' | 'dark'

function GeneratedResultCardShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-result-card', className)} {...props} />
}

function GeneratedResultList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-result-card-list', className)} {...props} />
}

function GeneratedResultHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-result-card-header', className)} {...props} />
}

function GeneratedResultTitle({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn('agent-generated-result-card-title', className)} {...props}>
      <SparklesIcon className="agent-generated-result-card-title-icon" />
      <span className="agent-generated-result-card-title-text">{children}</span>
    </div>
  )
}

function GeneratedResultActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-result-card-actions', className)} {...props} />
}

function GeneratedResultCountBadge({ className, ...props }: BadgeProps) {
  return <Badge className={cn('agent-generated-result-card-count', className)} {...props} />
}

function GeneratedResultActionButton({ className, size = 'xs', ...props }: ButtonProps) {
  return <Button size={size} className={cn('agent-generated-result-card-action', className)} {...props} />
}

function GeneratedResultItem({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-result-item', className)} {...props} />
}

function GeneratedResultItemRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-result-item-row', className)} {...props} />
}

function GeneratedResultItemIcon({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-generated-result-item-icon', className)} {...props} />
}

function GeneratedResultItemBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-result-item-body', className)} {...props} />
}

function GeneratedResultItemName({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-generated-result-item-name', className)} {...props} />
}

function GeneratedResultItemMeta({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-generated-result-item-meta', className)} {...props} />
}

function GeneratedResultMissingNotice({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-result-missing-notice', className)} {...props} />
}

function GeneratedResultHelperText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-generated-result-card-helper', className)} {...props} />
}

function GeneratedMediaPreviewButton({
  className,
  surface = 'muted',
  variant = 'ghost',
  size = 'md',
  children,
  ...props
}: ButtonProps & { surface?: GeneratedMediaPreviewSurface }) {
  return (
    <Button
      asChild
      variant={variant}
      size={size}
      data-surface={surface}
      fullWidth
      align="start"
      className={cn('agent-generated-media-preview agent-generated-media-preview-button', className)}
      {...props}
    >
      <button>{children}</button>
    </Button>
  )
}

export function GeneratedResultCard({ attachments, projectId }: { attachments: AgentAttachment[]; projectId?: number }) {
  const [copiedResourceId, setCopiedResourceId] = useState<number | null>(null)
  const [expandedResults, setExpandedResults] = useState(false)
  const [candidateDialogAttachments, setCandidateDialogAttachments] = useState<AgentAttachment[] | null>(null)
  const [viewerAttachment, setViewerAttachment] = useState<AgentAttachment | null>(null)
  const [requestedDecisionKeys, setRequestedDecisionKeys] = useState<Set<string>>(() => new Set())
  const generated = attachments.filter(isGeneratedResultAttachment)
  const queryClient = useQueryClient()
  if (generated.length === 0) return null
  const hasUsableGeneratedResource = generated.some((attachment) => generatedAttachmentResourceId(attachment) !== undefined)
  const candidateAttachments = generated.filter((attachment) => generatedAttachmentResourceId(attachment) !== undefined)
  const renderedGenerated = expandedResults ? generated : generated.slice(0, AGENT_GENERATED_RESULT_INITIAL_RENDER_LIMIT)
  const hiddenGeneratedCount = generated.length - renderedGenerated.length

  function copyResourceMention(resourceId: number) {
    navigator.clipboard.writeText(resourceMentionToken(resourceId))
    setCopiedResourceId(resourceId)
    setTimeout(() => setCopiedResourceId(null), 1500)
  }

  useEffect(() => {
    if (!projectId) return
    const requests = generated.flatMap((attachment) => {
      const request = generatedContentUnitDecisionRequest(projectId, attachment)
      if (!request || requestedDecisionKeys.has(request.key)) return []
      return [request]
    })
    if (requests.length === 0) return
    setRequestedDecisionKeys((current) => new Set([...current, ...requests.map((request) => request.key)]))
    for (const request of requests) {
      openAgentPanelDecisionRequest({
        request: request.request,
        onResolve: async (response) => {
          await handleGeneratedContentUnitDecision(projectId, request, response)
          invalidateResourceMutationResult(queryClient, assetCandidateSelectedResult({ projectId }))
        },
      })
    }
  }, [generated, projectId, queryClient, requestedDecisionKeys])

  return (
    <GeneratedResultCardShell data-testid="agent-generated-result-card">
      <GeneratedResultHeader>
        <GeneratedResultTitle>生成结果</GeneratedResultTitle>
        <GeneratedResultActions>
          <GeneratedResultCountBadge>
            {generated.length} 个结果
          </GeneratedResultCountBadge>
          {hasUsableGeneratedResource && (
            <GeneratedResultActionButton
              type="button"
              variant="outline"
              data-testid="agent-generated-bulk-candidate-open"
              onClick={() => setCandidateDialogAttachments(candidateAttachments)}
            >
              批量加入候选
            </GeneratedResultActionButton>
          )}
        </GeneratedResultActions>
      </GeneratedResultHeader>
      <GeneratedResultList>
        {renderedGenerated.map((attachment) => {
          const resourceId = generatedAttachmentResourceId(attachment)
          return (
            <GeneratedResultItem key={attachment.id}>
              <GeneratedMediaPreview attachment={attachment} onPreview={() => setViewerAttachment(attachment)} />
              <GeneratedResultItemRow>
                <GeneratedResultItemIcon>
                  <AgentAttachmentIcon type={attachment.type} size={12} />
                </GeneratedResultItemIcon>
                <GeneratedResultItemBody>
                  <GeneratedResultItemName>{attachment.name}</GeneratedResultItemName>
                  <GeneratedResultItemMeta
                    title={generatedResultDetailTitle(attachment, resourceId)}
                  >
                    {generatedResultBreadcrumb(attachment, resourceId)}
                  </GeneratedResultItemMeta>
                </GeneratedResultItemBody>
                {(attachment.url || resourceId !== undefined) && (
                  <GeneratedResultActionButton
                    type="button"
                    variant="ghost"
                    onClick={() => setViewerAttachment(attachment)}
                  >
                    查看
                  </GeneratedResultActionButton>
                )}
                <GeneratedResultActionButton
                  type="button"
                  variant="ghost"
                  onClick={() => resourceId !== undefined && copyResourceMention(resourceId)}
                  disabled={resourceId === undefined}
                >
                  {resourceId === undefined ? '无资源 ID' : copiedResourceId === resourceId ? '已复制' : '复制引用'}
                </GeneratedResultActionButton>
              </GeneratedResultItemRow>
              {resourceId === undefined && (
                <GeneratedResultMissingNotice data-testid="agent-generated-resource-candidate-missing-id">
                  该生成结果暂未返回资源 ID，不能加入候选。
                </GeneratedResultMissingNotice>
              )}
            </GeneratedResultItem>
          )
        })}
      </GeneratedResultList>
      {hiddenGeneratedCount > 0 && (
        <GeneratedResultActionButton
          type="button"
          variant="ghost"
          onClick={() => setExpandedResults(true)}
        >
          显示剩余 {hiddenGeneratedCount} 个结果
        </GeneratedResultActionButton>
      )}
      <GeneratedResultHelperText>
        {hasUsableGeneratedResource
          ? '可在后续消息中粘贴资源引用，或将可用的生成资源加入素材需求、画面锚点的候选列表。'
          : '这些生成结果暂未返回资源 ID，暂不能复制引用或加入候选。'}
      </GeneratedResultHelperText>
      <GeneratedCandidateAttachDialog
        attachments={candidateDialogAttachments ?? []}
        projectId={projectId}
        open={candidateDialogAttachments !== null}
        onOpenChange={(open) => {
          if (!open) setCandidateDialogAttachments(null)
        }}
      />
      <GeneratedCandidateAttachDialog
        attachments={viewerAttachment ? [viewerAttachment] : []}
        projectId={projectId}
        open={viewerAttachment !== null}
        viewerAttachment={viewerAttachment}
        copiedResourceId={copiedResourceId}
        onCopyResourceMention={copyResourceMention}
        onOpenChange={(open) => {
          if (!open) setViewerAttachment(null)
        }}
      />
    </GeneratedResultCardShell>
  )
}

interface GeneratedContentUnitDecisionRequest {
  key: string
  contentUnitId: string | number
  candidateId: string | number
  resourceId: number
  request: {
    id: string
    method: typeof MOVSCRIPT_DECISION_REQUEST_METHOD
    params: Record<string, unknown>
  }
}

function generatedContentUnitDecisionRequest(projectId: number, attachment: AgentAttachment): GeneratedContentUnitDecisionRequest | undefined {
  const decisionRef = generatedContentUnitCandidateDecisionRef(attachment)
  if (!decisionRef) return undefined
  const { contentUnitId, candidateId, resourceId } = decisionRef
  const key = `${projectId}:${String(contentUnitId)}:${String(candidateId)}:${resourceId}`
  return {
    key,
    contentUnitId,
    candidateId,
    resourceId,
    request: {
      id: `movscript-decision:${key}`,
      method: MOVSCRIPT_DECISION_REQUEST_METHOD,
      params: {
        title: `${attachment.name} 已生成`,
        summary: '请选择是否采纳该候选作为后续生产的稳定依赖。',
        question: `如何处理 content unit ${String(contentUnitId)} 的候选 ${String(candidateId)}?`,
        projectId,
        contentUnitId,
        candidateId,
        resourceId,
        targetKind: 'content_unit',
      },
    },
  }
}

async function handleGeneratedContentUnitDecision(
  projectId: number,
  request: GeneratedContentUnitDecisionRequest,
  response: AgentChatServerRequestResponse | undefined,
) {
  if (response?.action !== 'decision') return
  await createElectronMovScriptWorkspaceService({ projectId }).decideContentUnitCandidate({
    contentUnitId: request.contentUnitId,
    candidateId: request.candidateId,
    decision: response.decision,
    resourceId: request.resourceId,
    reason: response.reason ?? `agent_panel_${response.decision}`,
    metadata: {
      source: 'agent_panel_decision_request',
      request_id: request.request.id,
      ...(response.metadata ?? {}),
    },
  })
}

function GeneratedMediaPreview({ attachment, onPreview }: { attachment: AgentAttachment; onPreview: () => void }) {
  const resource = attachmentToResource(attachment)
  if (!resource) return null
  if (attachment.type === 'image') {
    return (
      <GeneratedMediaPreviewButton
        type="button"
        data-testid="agent-generated-media-preview"
        onClick={onPreview}
      >
        <AgentAttachmentMediaPreview attachment={attachment} variant="result" thumbnailMaxSize={480} />
      </GeneratedMediaPreviewButton>
    )
  }
  if (attachment.type === 'video') {
    return (
      <GeneratedMediaPreviewButton
        type="button"
        data-testid="agent-generated-media-preview"
        surface="dark"
        onClick={onPreview}
      >
        <MediaViewer
          resource={resource}
          fit="contain"
          lightbox={false}
          lightweightVideoThumb
        />
      </GeneratedMediaPreviewButton>
    )
  }
  return null
}
