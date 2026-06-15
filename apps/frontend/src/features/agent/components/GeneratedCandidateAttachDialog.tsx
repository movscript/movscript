import { type ComponentPropsWithoutRef, type HTMLAttributes, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { ResourceCandidateAttachPanel } from '@/shared/ui/ResourceCandidateAttachPanel'
import {
  createWorkspaceAssetSlotCandidate,
  createWorkspaceKeyframeCandidate,
} from '@/shared/infrastructure/workspaceCandidateRepository'
import { resourceCandidateKeys } from '@/features/resources/application/resourceQueryKeys'
import { attachmentToResource } from '@/features/agent/domain/agentAttachments'
import { AgentAttachmentIcon } from '@/features/agent/components/AgentAttachmentMediaPreview'
import {
  GENERATED_BINDING_TARGETS,
  type GeneratedBindingTarget,
  attachedGeneratedCandidateIdsAfterResults,
  generatedAttachmentResourceId,
  generatedBindingTargetLabel,
  generatedCandidateAttachPayload,
  generatedCandidateAttachSummary,
  generatedKeyframeCandidatePayload,
  generatedTargetRecordDescription,
  generatedTargetRecordId,
  generatedTargetRecordLabel,
  generatedTargetRecordMeta,
  generatedTargetSearchText,
  isGeneratedCandidateTargetRecord,
  pendingGeneratedCandidateAttachments,
} from '@/features/agent/domain/agentGeneratedResourceBinding'
import { assetCandidateSelectedResult, invalidateResourceMutationResult } from '@/features/resources/application/resourceMutationInvalidation'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import { AppTextEmptyState } from '@movscript/ui/business/app'
import { WorkbenchList, WorkbenchListItem } from '@movscript/ui/business/workbench'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui/primitives'
import {
  candidateResourceFromGeneratedAttachment,
  generatedAttachmentTypeLabel,
  generatedResultBreadcrumb,
  generatedResultDetailTitle,
} from '@/features/agent/components/GeneratedResultCardModel'
import { cn } from '@/shared/ui/cn'
import './GeneratedCandidateAttachDialog.css'

function GeneratedCandidateDialogContent({ className, ...props }: ComponentPropsWithoutRef<typeof DialogContent>) {
  return <DialogContent className={cn('ms-agent-generated-candidate-dialog', className)} {...props} />
}

function GeneratedCandidateDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <DialogHeader className={cn('ms-agent-generated-candidate-dialog__header', className)} {...props} />
}

function GeneratedCandidateDialogTitle({ className, ...props }: ComponentPropsWithoutRef<typeof DialogTitle>) {
  return <DialogTitle className={className} {...props} />
}

function GeneratedCandidateDialogDescription({ className, ...props }: ComponentPropsWithoutRef<typeof DialogDescription>) {
  return <DialogDescription className={className} {...props} />
}

function GeneratedCandidateDialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-candidate-dialog__body', className)} {...props} />
}

function GeneratedCandidateDialogSidebar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-candidate-dialog__sidebar', className)} {...props} />
}

function GeneratedCandidateDialogMain({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-candidate-dialog__main', className)} {...props} />
}

function GeneratedCandidateDialogSectionHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-candidate-dialog__section-header', className)} {...props} />
}

function GeneratedCandidateDialogList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-candidate-dialog__list', className)} {...props} />
}

function GeneratedCandidateDialogControls({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-candidate-dialog__controls', className)} {...props} />
}

function GeneratedCandidateDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <DialogFooter className={cn('ms-agent-generated-candidate-dialog__footer', className)} {...props} />
}

function GeneratedCandidateBadge({ className, ...props }: ComponentPropsWithoutRef<typeof Badge>) {
  return <Badge className={cn('ms-agent-generated-candidate-dialog__badge', className)} {...props} />
}

function GeneratedCandidateActionButton({ className, ...props }: ComponentPropsWithoutRef<typeof Button>) {
  return <Button className={cn('ms-agent-generated-candidate-dialog__action', className)} {...props} />
}

function GeneratedCandidateSearchInput({ className, controlSize = 'sm', ...props }: ComponentPropsWithoutRef<typeof Input>) {
  return <Input controlSize={controlSize} className={cn('ms-agent-generated-candidate-dialog__search', className)} {...props} />
}

function GeneratedCandidateEmptyState({ className, ...props }: ComponentPropsWithoutRef<typeof AppTextEmptyState>) {
  return <AppTextEmptyState className={cn('ms-agent-generated-candidate-dialog__empty', className)} {...props} />
}

function GeneratedCandidateResourceItem({
  attached = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { attached?: boolean }) {
  return (
    <div
      data-attached={attached ? 'true' : undefined}
      className={cn('ms-agent-generated-candidate-resource-item', className)}
      {...props}
    />
  )
}

function GeneratedCandidateResourceRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-candidate-resource-item__row', className)} {...props} />
}

function GeneratedCandidateResourceIcon({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('ms-agent-generated-candidate-resource-item__icon', className)} {...props} />
}

function GeneratedCandidateResourceBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-candidate-resource-item__body', className)} {...props} />
}

function GeneratedCandidateResourceName({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('ms-agent-generated-candidate-resource-item__name', className)} {...props} />
}

function GeneratedCandidateResourceMeta({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('ms-agent-generated-candidate-resource-item__meta', className)} {...props} />
}

function GeneratedCandidateTargetListFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-candidate-target-list', className)} {...props} />
}

function GeneratedCandidateTargetList({ className, ...props }: ComponentPropsWithoutRef<typeof WorkbenchList>) {
  return <WorkbenchList className={cn('ms-agent-generated-candidate-target-list__items', className)} {...props} />
}

function GeneratedCandidateTargetItem({ className, density = 'compact', ...props }: ComponentPropsWithoutRef<typeof WorkbenchListItem>) {
  return <WorkbenchListItem density={density} className={cn('ms-agent-generated-candidate-target-list__item', className)} {...props} />
}

function GeneratedCandidateEmptyMessage({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('ms-agent-generated-candidate-empty-message', className)} {...props} />
}

function GeneratedCandidateTargetRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-candidate-target-row', className)} {...props} />
}

function GeneratedCandidateTargetTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('ms-agent-generated-candidate-target-title', className)} {...props} />
}

function GeneratedCandidateTargetId({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('ms-agent-generated-candidate-target-id', className)} {...props} />
}

function GeneratedCandidateTargetMeta({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('ms-agent-generated-candidate-target-meta', className)} {...props} />
}

function GeneratedCandidateTargetDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('ms-agent-generated-candidate-target-description', className)} {...props} />
}

function GeneratedCandidateSelectedTarget({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-candidate-selected-target', className)} {...props} />
}

function GeneratedCandidateStatusMessage({
  className,
  tone = 'neutral',
  ...props
}: HTMLAttributes<HTMLParagraphElement> & { tone?: 'neutral' | 'success' | 'danger' }) {
  return <p data-tone={tone} className={cn('ms-agent-generated-candidate-status-message', className)} {...props} />
}

function GeneratedViewerSidePanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-viewer-panel', className)} {...props} />
}

function GeneratedViewerSideHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-viewer-panel__header', className)} {...props} />
}

function GeneratedViewerSideActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-viewer-panel__actions', className)} {...props} />
}

function GeneratedViewerSideContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-agent-generated-viewer-panel__content', className)} {...props} />
}

function GeneratedViewerActionButton({ className, size = 'xs', ...props }: ComponentPropsWithoutRef<typeof Button>) {
  return <Button size={size} className={cn('ms-agent-generated-viewer-panel__action', className)} {...props} />
}

function GeneratedViewerBadge({ className, ...props }: ComponentPropsWithoutRef<typeof Badge>) {
  return <Badge className={cn('ms-agent-generated-viewer-panel__badge', className)} {...props} />
}

export function GeneratedCandidateAttachDialog({
  attachments,
  projectId,
  open,
  onOpenChange,
  viewerAttachment,
  copiedResourceId,
  onCopyResourceMention,
}: {
  attachments: AgentAttachment[]
  projectId?: number
  open: boolean
  onOpenChange: (open: boolean) => void
  viewerAttachment?: AgentAttachment | null
  copiedResourceId?: number | null
  onCopyResourceMention?: (resourceId: number) => void
}) {
  const [targetType, setTargetType] = useState<GeneratedBindingTarget>('asset_slot')
  const [targetId, setTargetId] = useState<number | undefined>(undefined)
  const [targetQuery, setTargetQuery] = useState('')
  const [attachStatus, setAttachStatus] = useState<'idle' | 'attaching' | 'attached' | 'partial' | 'error'>('idle')
  const [attachMessage, setAttachMessage] = useState('')
  const [attachedAttachmentIds, setAttachedAttachmentIds] = useState<Set<string>>(() => new Set())
  const queryClient = useQueryClient()
  const attachmentKey = attachments.map((attachment) => attachment.id).join('|')
  const targetConfig = GENERATED_BINDING_TARGETS.find((target) => target.value === targetType) ?? GENERATED_BINDING_TARGETS[0]
  const candidateAttachments = attachments.filter((attachment) => generatedAttachmentResourceId(attachment) !== undefined)
  const pendingCandidateAttachments = pendingGeneratedCandidateAttachments(candidateAttachments, attachedAttachmentIds)
  const hasCandidateAttachments = pendingCandidateAttachments.length > 0
  const { data: targetRecords = [], isFetching: loadingTargets } = useQuery({
    queryKey: resourceCandidateKeys.generatedTargets(projectId, targetConfig.entityKind),
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig(targetConfig.entityKind)),
    enabled: open && !!projectId && hasCandidateAttachments,
    staleTime: 30_000,
  })
  const normalizedQuery = targetQuery.trim().toLowerCase()
  const filteredTargets = targetRecords
    .filter((record) => isGeneratedCandidateTargetRecord(record, targetConfig.value))
    .filter((record) => generatedTargetRecordId(record) !== undefined)
    .filter((record) => !normalizedQuery || generatedTargetSearchText(record).includes(normalizedQuery))
    .slice(0, 80)
  const selectedTarget = targetId !== undefined ? filteredTargets.find((record) => generatedTargetRecordId(record) === targetId) : undefined
  const canAttach = !!projectId && targetId !== undefined && !!selectedTarget && hasCandidateAttachments && attachStatus !== 'attaching' && attachStatus !== 'attached'
  const selectedTargetDescription = selectedTarget ? generatedTargetRecordDescription(selectedTarget) : ''
  const selectedTargetMeta = selectedTarget ? generatedTargetRecordMeta(selectedTarget) : []
  const helperMessage = !projectId
    ? '请选择项目后再加入候选。'
    : candidateAttachments.length === 0
      ? '这些生成结果暂未返回可加入候选的资源 ID。'
      : pendingCandidateAttachments.length === 0
        ? `已将 ${attachedAttachmentIds.size} 个生成资源加入候选。`
        : `将 ${pendingCandidateAttachments.length} 个生成资源加入所选${generatedBindingTargetLabel(targetConfig.value)}。`

  useEffect(() => {
    if (!open) return
    setTargetId(undefined)
    setTargetQuery('')
    setAttachStatus('idle')
    setAttachMessage('')
    setAttachedAttachmentIds(new Set())
  }, [attachmentKey, open])

  function resetSelection() {
    setTargetId(undefined)
    setAttachedAttachmentIds(new Set())
    setAttachMessage('')
    if (attachStatus !== 'attaching') setAttachStatus('idle')
  }

  async function attachCandidates() {
    if (!projectId || !canAttach || targetId === undefined || !selectedTarget) return
    setAttachStatus('attaching')
    setAttachMessage('')
    const attemptedAttachments = pendingCandidateAttachments
    const results = await Promise.allSettled(attemptedAttachments.map((attachment) => (
      attachGeneratedCandidate(projectId, targetConfig.value, targetId, selectedTarget, attachment)
    )))
    const targetLabel = generatedTargetRecordLabel(selectedTarget)
    const summary = generatedCandidateAttachSummary(targetLabel, results)
    const nextAttachedAttachmentIds = attachedGeneratedCandidateIdsAfterResults(attachedAttachmentIds, attemptedAttachments, results)
    if (summary.createdCount > 0) {
      setAttachedAttachmentIds(nextAttachedAttachmentIds)
      invalidateResourceMutationResult(queryClient, assetCandidateSelectedResult({ projectId }))
    }
    const allAttached = nextAttachedAttachmentIds.size >= candidateAttachments.length && candidateAttachments.length > 0
    setAttachStatus(allAttached && summary.failedCount === 0 ? 'attached' : summary.status)
    setAttachMessage(allAttached && summary.failedCount === 0
      ? `${targetLabel} 已累计加入 ${nextAttachedAttachmentIds.size} 个候选`
      : summary.message)
  }

  const viewerResource = viewerAttachment ? attachmentToResource(viewerAttachment) : null
  if (viewerAttachment && viewerResource) {
    const resourceId = generatedAttachmentResourceId(viewerAttachment)
    return (
      <MediaViewer
        resource={viewerResource}
        open={open}
        onOpenChange={onOpenChange}
        fit="contain"
        metadata={(
          <p className="truncate type-caption text-muted-foreground" title={generatedResultDetailTitle(viewerAttachment, resourceId)}>
            {generatedResultBreadcrumb(viewerAttachment, resourceId)}
          </p>
        )}
        sidePanel={(
          <GeneratedViewerSidePanel>
            <GeneratedViewerSideHeader>
              <p className="type-caption font-medium text-foreground">资源操作</p>
              <GeneratedViewerSideActions>
                <GeneratedViewerActionButton
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={resourceId === undefined}
                  onClick={() => resourceId !== undefined && onCopyResourceMention?.(resourceId)}
                  className="h-7 px-2 type-tiny"
                >
                  {resourceId === undefined ? '无资源 ID' : copiedResourceId === resourceId ? '已复制引用' : '复制引用'}
                </GeneratedViewerActionButton>
                <GeneratedViewerBadge className="type-tiny">
                  {generatedAttachmentTypeLabel(viewerAttachment.type)}
                </GeneratedViewerBadge>
              </GeneratedViewerSideActions>
            </GeneratedViewerSideHeader>
            <GeneratedViewerSideContent>
              <ResourceCandidateAttachPanel
                resources={[candidateResourceFromGeneratedAttachment(viewerAttachment)]}
                projectId={projectId}
                compact
              />
            </GeneratedViewerSideContent>
          </GeneratedViewerSidePanel>
        )}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <GeneratedCandidateDialogContent data-testid={viewerAttachment ? 'agent-generated-resource-candidate' : 'agent-generated-bulk-candidate'}>
        <GeneratedCandidateDialogHeader>
          <GeneratedCandidateDialogTitle>加入候选</GeneratedCandidateDialogTitle>
          <GeneratedCandidateDialogDescription>
            选择生成结果和目标对象，将资源统一加入候选列表。
          </GeneratedCandidateDialogDescription>
        </GeneratedCandidateDialogHeader>

        <GeneratedCandidateDialogBody>
          <GeneratedCandidateDialogSidebar>
            <GeneratedCandidateDialogSectionHeader>
              <p className="type-caption font-medium text-foreground">待加入资源</p>
              <GeneratedCandidateBadge className="type-tiny">{candidateAttachments.length}</GeneratedCandidateBadge>
            </GeneratedCandidateDialogSectionHeader>
            <GeneratedCandidateDialogList>
              {candidateAttachments.length === 0 ? (
                <GeneratedCandidateEmptyState className="px-2 py-2 type-tiny leading-relaxed">
                  这些生成结果暂未返回资源 ID，不能加入候选。
                </GeneratedCandidateEmptyState>
              ) : candidateAttachments.map((attachment) => {
                const resourceId = generatedAttachmentResourceId(attachment)
                const attached = attachedAttachmentIds.has(attachment.id)
                return (
                  <GeneratedCandidateResourceItem key={attachment.id} attached={attached}>
                    <GeneratedCandidateResourceRow>
                      <GeneratedCandidateResourceIcon>
                        <AgentAttachmentIcon type={attachment.type} size={12} />
                      </GeneratedCandidateResourceIcon>
                      <GeneratedCandidateResourceBody>
                        <GeneratedCandidateResourceName>{attachment.name}</GeneratedCandidateResourceName>
                        <GeneratedCandidateResourceMeta>{resourceId !== undefined ? `#${resourceId}` : '未返回资源 ID'} · {attachment.type}</GeneratedCandidateResourceMeta>
                      </GeneratedCandidateResourceBody>
                      {attached && <GeneratedCandidateBadge variant="outline" className="type-tiny">已加入</GeneratedCandidateBadge>}
                    </GeneratedCandidateResourceRow>
                  </GeneratedCandidateResourceItem>
                )
              })}
            </GeneratedCandidateDialogList>
          </GeneratedCandidateDialogSidebar>

          <GeneratedCandidateDialogMain>
            <GeneratedCandidateDialogControls>
              <Select
                value={targetConfig.value}
                onValueChange={(value) => {
                  setTargetType(value as typeof targetType)
                  resetSelection()
                }}
                disabled={!projectId || candidateAttachments.length === 0 || attachStatus === 'attaching'}
              >
                <SelectTrigger className="h-8 min-w-0 type-tiny">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENERATED_BINDING_TARGETS.map((target) => (
                    <SelectItem key={`dialog-target-type-${target.value}`} value={target.value}>{target.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <GeneratedCandidateSearchInput
                value={targetQuery}
                onChange={(event) => {
                  setTargetQuery(event.target.value)
                  setTargetId(undefined)
                  setAttachMessage('')
                  if (attachStatus !== 'attaching') setAttachStatus('idle')
                }}
                placeholder={loadingTargets ? '正在加载目标对象...' : `搜索${generatedBindingTargetLabel(targetConfig.value)}，支持名称、状态、描述`}
                disabled={!projectId || candidateAttachments.length === 0}
                controlSize="sm"
                className="h-8 min-w-0 type-tiny"
              />
            </GeneratedCandidateDialogControls>

            <GeneratedCandidateTargetListFrame>
              {loadingTargets ? (
                <GeneratedCandidateEmptyMessage>正在加载目标对象...</GeneratedCandidateEmptyMessage>
              ) : filteredTargets.length === 0 ? (
                <GeneratedCandidateEmptyMessage>
                  {projectId ? '没有匹配的目标对象，请调整搜索条件。' : '请选择项目后再加入候选。'}
                </GeneratedCandidateEmptyMessage>
              ) : (
                <GeneratedCandidateTargetList>
                  {filteredTargets.map((record) => {
                    const recordId = generatedTargetRecordId(record)
                    if (recordId === undefined) return null
                    const selected = recordId === targetId
                    const meta = generatedTargetRecordMeta(record)
                    const description = generatedTargetRecordDescription(record)
                    return (
                      <GeneratedCandidateTargetItem
                        key={`${targetConfig.value}-${recordId}`}
                        active={selected}
                        onClick={() => {
                          setTargetId(recordId)
                          setAttachMessage('')
                          if (attachStatus !== 'attaching') setAttachStatus('idle')
                        }}
                      >
                        <GeneratedCandidateTargetRow>
                          <GeneratedCandidateTargetTitle>{generatedTargetRecordLabel(record)}</GeneratedCandidateTargetTitle>
                          <GeneratedCandidateTargetId>#{recordId}</GeneratedCandidateTargetId>
                        </GeneratedCandidateTargetRow>
                        {meta.length > 0 && <GeneratedCandidateTargetMeta>{meta.join(' · ')}</GeneratedCandidateTargetMeta>}
                        {description && <GeneratedCandidateTargetDescription>{description}</GeneratedCandidateTargetDescription>}
                      </GeneratedCandidateTargetItem>
                    )
                  })}
                </GeneratedCandidateTargetList>
              )}
            </GeneratedCandidateTargetListFrame>

            {selectedTarget && (
              <GeneratedCandidateSelectedTarget>
                <GeneratedCandidateTargetTitle>{generatedTargetRecordLabel(selectedTarget)}</GeneratedCandidateTargetTitle>
                {selectedTargetMeta.length > 0 && <GeneratedCandidateTargetMeta>{selectedTargetMeta.join(' · ')}</GeneratedCandidateTargetMeta>}
                {selectedTargetDescription && <GeneratedCandidateTargetDescription>{selectedTargetDescription}</GeneratedCandidateTargetDescription>}
              </GeneratedCandidateSelectedTarget>
            )}

            <GeneratedCandidateStatusMessage tone={attachStatus === 'error' ? 'danger' : attachStatus === 'attached' ? 'success' : 'neutral'}>
              {attachMessage || helperMessage}
            </GeneratedCandidateStatusMessage>
          </GeneratedCandidateDialogMain>
        </GeneratedCandidateDialogBody>

        <GeneratedCandidateDialogFooter>
          <GeneratedCandidateActionButton type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={attachStatus === 'attaching'}>
            关闭
          </GeneratedCandidateActionButton>
          <GeneratedCandidateActionButton type="button" onClick={attachCandidates} disabled={!canAttach}>
            {attachStatus === 'attaching' ? '加入中' : attachStatus === 'attached' ? '已全部加入' : attachStatus === 'partial' ? '重试未完成项' : '全部加入候选'}
          </GeneratedCandidateActionButton>
        </GeneratedCandidateDialogFooter>
      </GeneratedCandidateDialogContent>
    </Dialog>
  )
}

async function attachGeneratedCandidate(
  projectId: number,
  targetType: GeneratedBindingTarget,
  targetId: number,
  targetRecord: SemanticEntityRecord,
  attachment: AgentAttachment,
) {
  if (targetType === 'keyframe') {
    return createWorkspaceKeyframeCandidate(projectId, generatedKeyframeCandidatePayload(targetRecord, attachment))
  }
  return createWorkspaceAssetSlotCandidate(projectId, generatedCandidateAttachPayload(targetId, attachment), targetRecord)
}
