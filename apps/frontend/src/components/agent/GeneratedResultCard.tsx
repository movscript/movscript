import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { File, FileText, Image, Mic, Sparkles, Video } from 'lucide-react'

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { api } from '@/lib/api'
import { isGeneratedResultAttachment } from '@/lib/agentGeneratedResultAttachments'
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
} from '@/lib/agentGeneratedResourceBinding'
import { cn } from '@/lib/utils'
import type { AgentAttachment } from '@/store/agentStore'
import type { AssetSlotCandidate, RawResource } from '@/types'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
    <div data-testid="agent-generated-result-card" className="mt-2 rounded-md border border-border bg-background/70 p-2">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles size={12} className="shrink-0 text-primary" />
          <span className="truncate type-caption font-medium text-foreground">生成结果</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="secondary" className="type-micro leading-4 px-1.5 py-0">
            {generated.length} 个结果
          </Badge>
          {hasUsableGeneratedResource && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="h-6 px-2 type-micro"
              onClick={() => setCandidateDialogAttachments(candidateAttachments)}
            >
              批量加入候选
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        {generated.map((attachment) => {
          const resourceId = generatedAttachmentResourceId(attachment)
          return (
            <div key={attachment.id} className="rounded border border-border/70 bg-muted/20 px-2 py-1.5">
              <GeneratedMediaPreview attachment={attachment} onPreview={() => setViewerAttachment(attachment)} />
              <div className="flex min-w-0 items-center gap-2">
                <AttachmentIcon type={attachment.type} size={12} />
                <div className="min-w-0 flex-1">
                  <p className="truncate type-tiny font-medium text-foreground">{attachment.name}</p>
                  <p
                    className="truncate type-micro text-muted-foreground"
                    title={generatedResultDetailTitle(attachment, resourceId)}
                  >
                    {generatedResultBreadcrumb(attachment, resourceId)}
                  </p>
                </div>
                {(attachment.url || resourceId !== undefined) && (
                  <button
                    type="button"
                    onClick={() => setViewerAttachment(attachment)}
                    className="shrink-0 rounded px-1.5 py-1 type-micro text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    查看
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => resourceId !== undefined && copyResourceMention(resourceId)}
                  disabled={resourceId === undefined}
                  className="shrink-0 rounded px-1.5 py-1 type-micro text-muted-foreground hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  {resourceId === undefined ? '无资源 ID' : copiedResourceId === resourceId ? '已复制' : '复制引用'}
                </button>
              </div>
              {resourceId === undefined && (
                <p data-testid="agent-generated-resource-candidate-missing-id" className="mt-1.5 rounded border border-dashed border-border/70 px-2 py-1 type-micro leading-relaxed text-muted-foreground">
                  该生成结果暂未返回资源 ID，不能加入候选。
                </p>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2 type-tiny leading-relaxed text-muted-foreground">
        {hasUsableGeneratedResource
          ? '可在后续消息中粘贴资源引用，或将可用的生成资源加入素材需求、画面锚点的候选列表。'
          : '这些生成结果暂未返回资源 ID，暂不能复制引用或加入候选。'}
      </p>
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
    </div>
  )
}

function GeneratedMediaPreview({ attachment, onPreview }: { attachment: AgentAttachment; onPreview: () => void }) {
  const url = attachment.previewUrl ?? attachment.url
  if (attachment.type === 'image' && url) {
    return (
      <button
        type="button"
        data-testid="agent-generated-media-preview"
        onClick={onPreview}
        className="mb-2 block w-full overflow-hidden rounded-md border border-border/70 bg-muted text-left"
      >
        <AuthedImage src={url} alt={attachment.name} className="h-56 max-h-[45vh] w-full object-contain" />
      </button>
    )
  }
  if (attachment.type === 'video' && url) {
    return (
      <div data-testid="agent-generated-media-preview" className="mb-2 overflow-hidden rounded-md border border-border/70 bg-black">
        <AuthedVideo src={url} className="h-56 max-h-[45vh] w-full object-contain" controls playsInline preload="metadata" />
      </div>
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
    enabled: open && !!projectId && candidateAttachments.length > 0,
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
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-border px-3 py-3">
              <p className="type-caption font-medium text-foreground">资源操作</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={resourceId === undefined}
                  onClick={() => resourceId !== undefined && onCopyResourceMention?.(resourceId)}
                  className="h-7 px-2 type-tiny"
                >
                  {resourceId === undefined ? '无资源 ID' : copiedResourceId === resourceId ? '已复制引用' : '复制引用'}
                </Button>
                <Badge variant="secondary" className="type-micro">
                  {generatedAttachmentTypeLabel(viewerAttachment.type)}
                </Badge>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="grid gap-2">
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
                      <SelectItem key={`viewer-target-type-${target.value}`} value={target.value}>{target.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  value={targetQuery}
                  onChange={(event) => {
                    setTargetQuery(event.target.value)
                    setTargetId(undefined)
                    setAttachMessage('')
                    if (attachStatus !== 'attaching') setAttachStatus('idle')
                  }}
                  placeholder={loadingTargets ? '正在加载目标对象...' : `搜索${generatedBindingTargetLabel(targetConfig.value)}`}
                  disabled={!projectId || candidateAttachments.length === 0}
                  className="h-8 min-w-0 rounded-md border border-input bg-background px-2 type-tiny outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                />
              </div>

              <div className="mt-2 max-h-[34vh] overflow-auto rounded-md border border-border bg-background">
                {loadingTargets ? (
                  <p className="px-3 py-6 text-center type-tiny text-muted-foreground">正在加载目标对象...</p>
                ) : filteredTargets.length === 0 ? (
                  <p className="px-3 py-6 text-center type-tiny text-muted-foreground">
                    {projectId ? '没有匹配的目标对象，请调整搜索条件。' : '请选择项目后再加入候选。'}
                  </p>
                ) : filteredTargets.map((record) => {
                  const selected = record.ID === targetId
                  const meta = generatedTargetRecordMeta(record)
                  const description = generatedTargetRecordDescription(record)
                  return (
                    <button
                      key={`viewer-${targetConfig.value}-${record.ID}`}
                      type="button"
                      className={cn(
                        'block w-full border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted/60',
                        selected && 'bg-primary/10',
                      )}
                      onClick={() => {
                        setTargetId(record.ID)
                        setAttachMessage('')
                        if (attachStatus !== 'attaching') setAttachStatus('idle')
                      }}
                    >
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <p className="min-w-0 truncate type-tiny font-medium text-foreground">{generatedTargetRecordLabel(record)}</p>
                        <span className="shrink-0 type-min text-muted-foreground">#{record.ID}</span>
                      </div>
                      {meta.length > 0 && <p className="mt-0.5 truncate type-min text-muted-foreground">{meta.join(' · ')}</p>}
                      {description && <p className="mt-1 line-clamp-2 type-min leading-relaxed text-muted-foreground">{description}</p>}
                    </button>
                  )
                })}
              </div>

              {selectedTarget && (
                <div className="mt-2 rounded border border-primary/25 bg-primary/10 px-2 py-1.5">
                  <p className="truncate type-micro font-medium text-foreground">{generatedTargetRecordLabel(selectedTarget)}</p>
                  {selectedTargetMeta.length > 0 && <p className="mt-0.5 truncate type-min text-muted-foreground">{selectedTargetMeta.join(' · ')}</p>}
                  {selectedTargetDescription && <p className="mt-1 line-clamp-2 type-min leading-relaxed text-muted-foreground">{selectedTargetDescription}</p>}
                </div>
              )}

              <p className={cn('mt-2 type-micro leading-relaxed', attachStatus === 'error' ? 'text-destructive' : attachStatus === 'attached' ? 'text-primary' : 'text-muted-foreground')}>
                {attachMessage || helperMessage}
              </p>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-3 py-3">
              <Button type="button" onClick={attachCandidates} disabled={!canAttach}>
                {attachStatus === 'attaching' ? '加入中' : attachStatus === 'attached' ? '已加入候选' : attachStatus === 'partial' ? '重试未完成项' : '加入候选'}
              </Button>
            </div>
          </div>
        )}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[min(880px,calc(100vw-32px))] overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>加入候选</DialogTitle>
          <DialogDescription>
            选择生成结果和目标对象，将资源统一加入候选列表。
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-0 md:grid-cols-[260px_minmax(0,1fr)]">
          <div className="min-h-0 border-b border-border p-3 md:border-b-0 md:border-r">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="type-caption font-medium text-foreground">待加入资源</p>
              <Badge variant="secondary" className="type-micro">{candidateAttachments.length}</Badge>
            </div>
            <div className="max-h-[48vh] space-y-1.5 overflow-auto pr-1">
              {candidateAttachments.length === 0 ? (
                <p className="rounded border border-dashed border-border px-2 py-2 type-tiny leading-relaxed text-muted-foreground">
                  这些生成结果暂未返回资源 ID，不能加入候选。
                </p>
              ) : candidateAttachments.map((attachment) => {
                const resourceId = generatedAttachmentResourceId(attachment)
                const attached = attachedAttachmentIds.has(attachment.id)
                return (
                  <div key={attachment.id} className={cn('rounded border px-2 py-1.5', attached ? 'border-primary/30 bg-primary/10' : 'border-border bg-card')}>
                    <div className="flex min-w-0 items-center gap-2">
                      <AttachmentIcon type={attachment.type} size={12} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate type-tiny font-medium text-foreground">{attachment.name}</p>
                        <p className="truncate type-micro text-muted-foreground">{resourceId !== undefined ? `#${resourceId}` : '无资源 ID'} · {attachment.type}</p>
                      </div>
                      {attached && <Badge variant="outline" className="type-micro">已加入</Badge>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="min-h-0 p-3">
            <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
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
              <input
                value={targetQuery}
                onChange={(event) => {
                  setTargetQuery(event.target.value)
                  setTargetId(undefined)
                  setAttachMessage('')
                  if (attachStatus !== 'attaching') setAttachStatus('idle')
                }}
                placeholder={loadingTargets ? '正在加载目标对象...' : `搜索${generatedBindingTargetLabel(targetConfig.value)}，支持名称、状态、描述`}
                disabled={!projectId || candidateAttachments.length === 0}
                className="h-8 min-w-0 rounded-md border border-input bg-background px-2 type-tiny outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
              />
            </div>

            <div className="mt-2 max-h-[42vh] overflow-auto rounded-md border border-border">
              {loadingTargets ? (
                <p className="px-3 py-6 text-center type-tiny text-muted-foreground">正在加载目标对象...</p>
              ) : filteredTargets.length === 0 ? (
                <p className="px-3 py-6 text-center type-tiny text-muted-foreground">
                  {projectId ? '没有匹配的目标对象，请调整搜索条件。' : '请选择项目后再加入候选。'}
                </p>
              ) : filteredTargets.map((record) => {
                const selected = record.ID === targetId
                const meta = generatedTargetRecordMeta(record)
                const description = generatedTargetRecordDescription(record)
                return (
                  <button
                    key={`${targetConfig.value}-${record.ID}`}
                    type="button"
                    className={cn(
                      'block w-full border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted/60',
                      selected && 'bg-primary/10',
                    )}
                    onClick={() => {
                      setTargetId(record.ID)
                      setAttachMessage('')
                      if (attachStatus !== 'attaching') setAttachStatus('idle')
                    }}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <p className="min-w-0 truncate type-tiny font-medium text-foreground">{generatedTargetRecordLabel(record)}</p>
                      <span className="shrink-0 type-min text-muted-foreground">#{record.ID}</span>
                    </div>
                    {meta.length > 0 && <p className="mt-0.5 truncate type-min text-muted-foreground">{meta.join(' · ')}</p>}
                    {description && <p className="mt-1 line-clamp-2 type-min leading-relaxed text-muted-foreground">{description}</p>}
                  </button>
                )
              })}
            </div>

            {selectedTarget && (
              <div className="mt-2 rounded border border-primary/25 bg-primary/10 px-2 py-1.5">
                <p className="truncate type-micro font-medium text-foreground">{generatedTargetRecordLabel(selectedTarget)}</p>
                {selectedTargetMeta.length > 0 && <p className="mt-0.5 truncate type-min text-muted-foreground">{selectedTargetMeta.join(' · ')}</p>}
                {selectedTargetDescription && <p className="mt-1 line-clamp-2 type-min leading-relaxed text-muted-foreground">{selectedTargetDescription}</p>}
              </div>
            )}

            <p className={cn('mt-2 type-micro leading-relaxed', attachStatus === 'error' ? 'text-destructive' : attachStatus === 'attached' ? 'text-primary' : attachStatus === 'partial' ? 'text-muted-foreground' : 'text-muted-foreground')}>
              {attachMessage || helperMessage}
            </p>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-4 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={attachStatus === 'attaching'}>
            关闭
          </Button>
          <Button type="button" onClick={attachCandidates} disabled={!canAttach}>
            {attachStatus === 'attaching' ? '加入中' : attachStatus === 'attached' ? '已全部加入' : attachStatus === 'partial' ? '重试未完成项' : `加入 ${pendingCandidateAttachments.length} 个候选`}
          </Button>
        </DialogFooter>
      </DialogContent>
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
