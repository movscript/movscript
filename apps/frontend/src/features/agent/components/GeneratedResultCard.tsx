import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { File, FileText, Image, Mic, Video } from 'lucide-react'

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { ResourceCandidateAttachPanel, type CandidateResourceRef } from '@/shared/ui/ResourceCandidateAttachPanel'
import { AuthedImage, AuthedVideo } from '@/shared/ui/AuthedImage'
import { api } from '@/shared/infrastructure/api'
import { isGeneratedResultAttachment } from '@/features/agent/domain/agentGeneratedResultAttachments'
import {
  GENERATED_BINDING_TARGETS,
  type GeneratedBindingTarget,
  generatedAttachmentResourceId,
  generatedBindingTargetLabel,
  generatedCandidateAttachPayload,
  generatedCandidateAttachSummary,
  generatedKeyframeCandidatePayload,
  attachedGeneratedCandidateIdsAfterResults,
  invalidateGeneratedCandidateQueries,
  generatedTargetRecordDescription,
  generatedTargetRecordLabel,
  generatedTargetRecordMeta,
  generatedTargetSearchText,
  isGeneratedCandidateTargetRecord,
  pendingGeneratedCandidateAttachments,
} from '@/features/agent/domain/agentGeneratedResourceBinding'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import type { AssetSlotCandidate, RawResource } from '@/types'
import {
  AgentGeneratedCandidateActionButton,
  AgentGeneratedCandidateBadge,
  AgentGeneratedCandidateDialogBody,
  AgentGeneratedCandidateDialogContent,
  AgentGeneratedCandidateDialogControls,
  AgentGeneratedCandidateDialogDescription,
  AgentGeneratedCandidateDialogFooter,
  AgentGeneratedCandidateDialogHeader,
  AgentGeneratedCandidateDialogList,
  AgentGeneratedCandidateDialogMain,
  AgentGeneratedCandidateDialogSectionHeader,
  AgentGeneratedCandidateDialogSidebar,
  AgentGeneratedCandidateDialogTitle,
  AgentGeneratedCandidateEmptyMessage,
  AgentGeneratedCandidateEmptyState,
  AgentGeneratedCandidateResourceBody,
  AgentGeneratedCandidateResourceIcon,
  AgentGeneratedCandidateResourceItem,
  AgentGeneratedCandidateResourceMeta,
  AgentGeneratedCandidateResourceName,
  AgentGeneratedCandidateResourceRow,
  AgentGeneratedCandidateSelectedTarget,
  AgentGeneratedCandidateSearchInput,
  AgentGeneratedCandidateStatusMessage,
  AgentGeneratedCandidateTargetDescription,
  AgentGeneratedCandidateTargetId,
  AgentGeneratedCandidateTargetItem,
  AgentGeneratedCandidateTargetList,
  AgentGeneratedCandidateTargetListFrame,
  AgentGeneratedCandidateTargetMeta,
  AgentGeneratedCandidateTargetRow,
  AgentGeneratedCandidateTargetTitle,
  AgentGeneratedMediaPreview,
  AgentGeneratedMediaPreviewButton,
  AgentGeneratedResultActionButton,
  AgentGeneratedResultActions,
  AgentGeneratedResultCard as AgentGeneratedResultCardShell,
  AgentGeneratedResultCountBadge,
  AgentGeneratedResultHeader,
  AgentGeneratedResultHelperText,
  AgentGeneratedResultItem,
  AgentGeneratedResultItemBody,
  AgentGeneratedResultItemIcon,
  AgentGeneratedResultItemMeta,
  AgentGeneratedResultItemName,
  AgentGeneratedResultItemRow,
  AgentGeneratedResultList,
  AgentGeneratedResultMissingNotice,
  AgentGeneratedResultTitle,
  AgentGeneratedViewerActionButton,
  AgentGeneratedViewerBadge,
  AgentGeneratedViewerSideActions,
  AgentGeneratedViewerSideHeader,
  AgentGeneratedViewerSidePanel,
  Dialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui'

export function GeneratedResultCard({ attachments, projectId }: { attachments: AgentAttachment[]; projectId?: number }) {
  const [copiedResourceId, setCopiedResourceId] = useState<number | null>(null)
  const [candidateDialogAttachments, setCandidateDialogAttachments] = useState<AgentAttachment[] | null>(null)
  const [viewerAttachment, setViewerAttachment] = useState<AgentAttachment | null>(null)
  const generated = attachments.filter(isGeneratedResultAttachment)
  if (generated.length === 0) return null
  const hasUsableGeneratedResource = generated.some((attachment) => generatedAttachmentResourceId(attachment) !== undefined)
  const candidateAttachments = generated.filter((attachment) => generatedAttachmentResourceId(attachment) !== undefined)

  function copyResourceMention(resourceId: number) {
    navigator.clipboard.writeText(resourceMentionToken(resourceId))
    setCopiedResourceId(resourceId)
    setTimeout(() => setCopiedResourceId(null), 1500)
  }

  return (
    <AgentGeneratedResultCardShell data-testid="agent-generated-result-card">
      <AgentGeneratedResultHeader>
        <AgentGeneratedResultTitle>生成结果</AgentGeneratedResultTitle>
        <AgentGeneratedResultActions>
          <AgentGeneratedResultCountBadge>
            {generated.length} 个结果
          </AgentGeneratedResultCountBadge>
          {hasUsableGeneratedResource && (
            <AgentGeneratedResultActionButton
              type="button"
              variant="outline"
              data-testid="agent-generated-bulk-candidate-open"
              onClick={() => setCandidateDialogAttachments(candidateAttachments)}
            >
              批量加入候选
            </AgentGeneratedResultActionButton>
          )}
        </AgentGeneratedResultActions>
      </AgentGeneratedResultHeader>
      <AgentGeneratedResultList>
        {generated.map((attachment) => {
          const resourceId = generatedAttachmentResourceId(attachment)
          return (
            <AgentGeneratedResultItem key={attachment.id}>
              <GeneratedMediaPreview attachment={attachment} onPreview={() => setViewerAttachment(attachment)} />
              <AgentGeneratedResultItemRow>
                <AgentGeneratedResultItemIcon>
                  <AttachmentIcon type={attachment.type} size={12} />
                </AgentGeneratedResultItemIcon>
                <AgentGeneratedResultItemBody>
                  <AgentGeneratedResultItemName>{attachment.name}</AgentGeneratedResultItemName>
                  <AgentGeneratedResultItemMeta
                    title={generatedResultDetailTitle(attachment, resourceId)}
                  >
                    {generatedResultBreadcrumb(attachment, resourceId)}
                  </AgentGeneratedResultItemMeta>
                </AgentGeneratedResultItemBody>
                {(attachment.url || resourceId !== undefined) && (
                  <AgentGeneratedResultActionButton
                    type="button"
                    variant="ghost"
                    onClick={() => setViewerAttachment(attachment)}
                  >
                    查看
                  </AgentGeneratedResultActionButton>
                )}
                <AgentGeneratedResultActionButton
                  type="button"
                  variant="ghost"
                  onClick={() => resourceId !== undefined && copyResourceMention(resourceId)}
                  disabled={resourceId === undefined}
                >
                  {resourceId === undefined ? '无资源 ID' : copiedResourceId === resourceId ? '已复制' : '复制引用'}
                </AgentGeneratedResultActionButton>
              </AgentGeneratedResultItemRow>
              {resourceId === undefined && (
                <AgentGeneratedResultMissingNotice data-testid="agent-generated-resource-candidate-missing-id">
                  该生成结果暂未返回资源 ID，不能加入候选。
                </AgentGeneratedResultMissingNotice>
              )}
            </AgentGeneratedResultItem>
          )
        })}
      </AgentGeneratedResultList>
      <AgentGeneratedResultHelperText>
        {hasUsableGeneratedResource
          ? '可在后续消息中粘贴资源引用，或将可用的生成资源加入素材需求、画面锚点的候选列表。'
          : '这些生成结果暂未返回资源 ID，暂不能复制引用或加入候选。'}
      </AgentGeneratedResultHelperText>
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
    </AgentGeneratedResultCardShell>
  )
}

function GeneratedMediaPreview({ attachment, onPreview }: { attachment: AgentAttachment; onPreview: () => void }) {
  const url = attachment.previewUrl ?? attachment.url
  if (attachment.type === 'image' && url) {
    return (
      <AgentGeneratedMediaPreviewButton
        type="button"
        data-testid="agent-generated-media-preview"
        onClick={onPreview}
      >
        <AuthedImage src={url} alt={attachment.name} />
      </AgentGeneratedMediaPreviewButton>
    )
  }
  if (attachment.type === 'video' && url) {
    return (
      <AgentGeneratedMediaPreview data-testid="agent-generated-media-preview" surface="dark">
        <AuthedVideo src={url} controls playsInline preload="metadata" />
      </AgentGeneratedMediaPreview>
    )
  }
  return null
}

function resourceFromGeneratedAttachment(attachment: AgentAttachment): RawResource | null {
  const resourceId = generatedAttachmentResourceId(attachment)
  const directUrl = attachment.url ?? attachment.previewUrl
  const resourceUrl = directUrl ? '' : resourceId !== undefined ? `/api/v1/resources/${resourceId}/file` : ''
  if (!directUrl && !resourceUrl) return null
  return {
    ID: resourceId ?? 0,
    owner_id: 0,
    type: attachment.type,
    name: attachment.name,
    url: resourceUrl,
    size: attachment.size,
    mime_type: attachment.mimeType,
    ...(directUrl ? { direct_url: directUrl } : {}),
  }
}

function candidateResourceFromGeneratedAttachment(attachment: AgentAttachment): CandidateResourceRef {
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    resourceId: generatedAttachmentResourceId(attachment),
    sourceJobId: attachment.generated?.jobId,
  }
}

function GeneratedCandidateAttachDialog({
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
    queryKey: ['agent-generated-candidate-targets', projectId, targetConfig.entityKind],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig(targetConfig.entityKind)),
    enabled: open && !!projectId && hasCandidateAttachments,
    staleTime: 30_000,
  })
  const normalizedQuery = targetQuery.trim().toLowerCase()
  const filteredTargets = targetRecords
    .filter((record) => isGeneratedCandidateTargetRecord(record, targetConfig.value))
    .filter((record) => !normalizedQuery || generatedTargetSearchText(record).includes(normalizedQuery))
    .slice(0, 80)
  const selectedTarget = targetId !== undefined ? filteredTargets.find((record) => record.ID === targetId) : undefined
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
      invalidateGeneratedCandidateQueries(queryClient, projectId)
    }
    const allAttached = nextAttachedAttachmentIds.size >= candidateAttachments.length && candidateAttachments.length > 0
    setAttachStatus(allAttached && summary.failedCount === 0 ? 'attached' : summary.status)
    setAttachMessage(allAttached && summary.failedCount === 0
      ? `${targetLabel} 已累计加入 ${nextAttachedAttachmentIds.size} 个候选`
      : summary.message)
  }

  const viewerResource = viewerAttachment ? resourceFromGeneratedAttachment(viewerAttachment) : null
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
          <AgentGeneratedViewerSidePanel>
            <AgentGeneratedViewerSideHeader>
              <p className="type-caption font-medium text-foreground">资源操作</p>
              <AgentGeneratedViewerSideActions>
                <AgentGeneratedViewerActionButton
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={resourceId === undefined}
                  onClick={() => resourceId !== undefined && onCopyResourceMention?.(resourceId)}
                  className="h-7 px-2 type-tiny"
                >
                  {resourceId === undefined ? '无资源 ID' : copiedResourceId === resourceId ? '已复制引用' : '复制引用'}
                </AgentGeneratedViewerActionButton>
                <AgentGeneratedViewerBadge className="type-tiny">
                  {generatedAttachmentTypeLabel(viewerAttachment.type)}
                </AgentGeneratedViewerBadge>
              </AgentGeneratedViewerSideActions>
            </AgentGeneratedViewerSideHeader>
            <ResourceCandidateAttachPanel
              resources={[candidateResourceFromGeneratedAttachment(viewerAttachment)]}
              projectId={projectId}
              compact
              className="min-h-0 flex-1"
            />
          </AgentGeneratedViewerSidePanel>
        )}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AgentGeneratedCandidateDialogContent data-testid={viewerAttachment ? 'agent-generated-resource-candidate' : 'agent-generated-bulk-candidate'}>
        <AgentGeneratedCandidateDialogHeader>
          <AgentGeneratedCandidateDialogTitle>加入候选</AgentGeneratedCandidateDialogTitle>
          <AgentGeneratedCandidateDialogDescription>
            选择生成结果和目标对象，将资源统一加入候选列表。
          </AgentGeneratedCandidateDialogDescription>
        </AgentGeneratedCandidateDialogHeader>

        <AgentGeneratedCandidateDialogBody>
          <AgentGeneratedCandidateDialogSidebar>
            <AgentGeneratedCandidateDialogSectionHeader>
              <p className="type-caption font-medium text-foreground">待加入资源</p>
              <AgentGeneratedCandidateBadge className="type-tiny">{candidateAttachments.length}</AgentGeneratedCandidateBadge>
            </AgentGeneratedCandidateDialogSectionHeader>
            <AgentGeneratedCandidateDialogList>
              {candidateAttachments.length === 0 ? (
                <AgentGeneratedCandidateEmptyState className="px-2 py-2 type-tiny leading-relaxed">
                  这些生成结果暂未返回资源 ID，不能加入候选。
                </AgentGeneratedCandidateEmptyState>
              ) : candidateAttachments.map((attachment) => {
                const resourceId = generatedAttachmentResourceId(attachment)
                const attached = attachedAttachmentIds.has(attachment.id)
                return (
                  <AgentGeneratedCandidateResourceItem key={attachment.id} attached={attached}>
                    <AgentGeneratedCandidateResourceRow>
                      <AgentGeneratedCandidateResourceIcon>
                        <AttachmentIcon type={attachment.type} size={12} />
                      </AgentGeneratedCandidateResourceIcon>
                      <AgentGeneratedCandidateResourceBody>
                        <AgentGeneratedCandidateResourceName>{attachment.name}</AgentGeneratedCandidateResourceName>
                        <AgentGeneratedCandidateResourceMeta>{resourceId !== undefined ? `#${resourceId}` : '未返回资源 ID'} · {attachment.type}</AgentGeneratedCandidateResourceMeta>
                      </AgentGeneratedCandidateResourceBody>
                      {attached && <AgentGeneratedCandidateBadge variant="outline" className="type-tiny">已加入</AgentGeneratedCandidateBadge>}
                    </AgentGeneratedCandidateResourceRow>
                  </AgentGeneratedCandidateResourceItem>
                )
              })}
            </AgentGeneratedCandidateDialogList>
          </AgentGeneratedCandidateDialogSidebar>

          <AgentGeneratedCandidateDialogMain>
            <AgentGeneratedCandidateDialogControls>
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
              <AgentGeneratedCandidateSearchInput
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
            </AgentGeneratedCandidateDialogControls>

            <AgentGeneratedCandidateTargetListFrame>
              {loadingTargets ? (
                <AgentGeneratedCandidateEmptyMessage>正在加载目标对象...</AgentGeneratedCandidateEmptyMessage>
              ) : filteredTargets.length === 0 ? (
                <AgentGeneratedCandidateEmptyMessage>
                  {projectId ? '没有匹配的目标对象，请调整搜索条件。' : '请选择项目后再加入候选。'}
                </AgentGeneratedCandidateEmptyMessage>
              ) : (
                <AgentGeneratedCandidateTargetList>
                  {filteredTargets.map((record) => {
                    const selected = record.ID === targetId
                    const meta = generatedTargetRecordMeta(record)
                    const description = generatedTargetRecordDescription(record)
                    return (
                      <AgentGeneratedCandidateTargetItem
                        key={`${targetConfig.value}-${record.ID}`}
                        active={selected}
                        onClick={() => {
                          setTargetId(record.ID)
                          setAttachMessage('')
                          if (attachStatus !== 'attaching') setAttachStatus('idle')
                        }}
                      >
                        <AgentGeneratedCandidateTargetRow>
                          <AgentGeneratedCandidateTargetTitle>{generatedTargetRecordLabel(record)}</AgentGeneratedCandidateTargetTitle>
                          <AgentGeneratedCandidateTargetId>#{record.ID}</AgentGeneratedCandidateTargetId>
                        </AgentGeneratedCandidateTargetRow>
                        {meta.length > 0 && <AgentGeneratedCandidateTargetMeta>{meta.join(' · ')}</AgentGeneratedCandidateTargetMeta>}
                        {description && <AgentGeneratedCandidateTargetDescription>{description}</AgentGeneratedCandidateTargetDescription>}
                      </AgentGeneratedCandidateTargetItem>
                    )
                  })}
                </AgentGeneratedCandidateTargetList>
              )}
            </AgentGeneratedCandidateTargetListFrame>

            {selectedTarget && (
              <AgentGeneratedCandidateSelectedTarget>
                <AgentGeneratedCandidateTargetTitle>{generatedTargetRecordLabel(selectedTarget)}</AgentGeneratedCandidateTargetTitle>
                {selectedTargetMeta.length > 0 && <AgentGeneratedCandidateTargetMeta>{selectedTargetMeta.join(' · ')}</AgentGeneratedCandidateTargetMeta>}
                {selectedTargetDescription && <AgentGeneratedCandidateTargetDescription>{selectedTargetDescription}</AgentGeneratedCandidateTargetDescription>}
              </AgentGeneratedCandidateSelectedTarget>
            )}

            <AgentGeneratedCandidateStatusMessage tone={attachStatus === 'error' ? 'danger' : attachStatus === 'attached' ? 'success' : 'neutral'}>
              {attachMessage || helperMessage}
            </AgentGeneratedCandidateStatusMessage>
          </AgentGeneratedCandidateDialogMain>
        </AgentGeneratedCandidateDialogBody>

        <AgentGeneratedCandidateDialogFooter>
          <AgentGeneratedCandidateActionButton type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={attachStatus === 'attaching'}>
            关闭
          </AgentGeneratedCandidateActionButton>
          <AgentGeneratedCandidateActionButton type="button" onClick={attachCandidates} disabled={!canAttach}>
            {attachStatus === 'attaching' ? '加入中' : attachStatus === 'attached' ? '已全部加入' : attachStatus === 'partial' ? '重试未完成项' : '全部加入候选'}
          </AgentGeneratedCandidateActionButton>
        </AgentGeneratedCandidateDialogFooter>
      </AgentGeneratedCandidateDialogContent>
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
    const { data } = await api.post<SemanticEntityRecord>(`/projects/${projectId}/entities/keyframes`, generatedKeyframeCandidatePayload(targetRecord, attachment))
    return data
  }
  const { data } = await api.post<AssetSlotCandidate>(`/projects/${projectId}/entities/asset-slot-candidates`, generatedCandidateAttachPayload(targetId, attachment))
  return data
}

function AttachmentIcon({ type, size = 12 }: { type: AgentAttachment['type']; size?: number }) {
  if (type === 'image') return <Image size={size} />
  if (type === 'video') return <Video size={size} />
  if (type === 'audio') return <Mic size={size} />
  if (type === 'text') return <FileText size={size} />
  return <File size={size} />
}

function generatedResultBreadcrumb(attachment: AgentAttachment, resourceId: number | undefined) {
  return [
    resourceId !== undefined ? `资源 #${resourceId}` : '未返回资源 ID',
    generatedAttachmentTypeLabel(attachment.type),
    attachment.generated?.modelDisplay ?? attachment.generated?.modelIdentifier,
  ].filter(Boolean).join(' · ')
}

function generatedResultDetailTitle(attachment: AgentAttachment, resourceId: number | undefined) {
  return [
    resourceId !== undefined ? `资源 #${resourceId}` : '未返回资源 ID',
    generatedAttachmentTypeLabel(attachment.type),
    attachment.mimeType,
    attachment.size ? formatBytes(attachment.size) : undefined,
    attachment.generated?.jobId !== undefined ? `Job #${attachment.generated.jobId}` : undefined,
    attachment.generated?.jobType,
    attachment.generated?.providerName,
    attachment.generated?.modelDisplay ?? attachment.generated?.modelIdentifier,
    attachment.generated?.status,
    attachment.generated?.stage,
  ].filter(Boolean).join(' · ')
}

function generatedAttachmentTypeLabel(type: AgentAttachment['type']) {
  if (type === 'image') return '图片'
  if (type === 'video') return '视频'
  if (type === 'audio') return '音频'
  if (type === 'text') return '文本'
  return '文件'
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

function resourceMentionToken(resourceId: number) {
  return `@[resource:${resourceId}]`
}
