import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { File, FileText, Image, Mic, Sparkles, Video } from 'lucide-react'

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { api } from '@/lib/api'
import { isGeneratedResultAttachment } from '@/lib/agentGeneratedResultAttachments'
import {
  GENERATED_BINDING_TARGETS,
  type GeneratedBindingTarget,
  generatedAttachmentResourceId,
  generatedBindingErrorMessage,
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
import type { AssetSlotCandidate } from '@/types'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'

export function GeneratedResultCard({ attachments, projectId }: { attachments: AgentAttachment[]; projectId?: number }) {
  const [copiedResourceId, setCopiedResourceId] = useState<number | null>(null)
  const generated = attachments.filter(isGeneratedResultAttachment)
  if (generated.length === 0) return null
  const hasUsableGeneratedResource = generated.some((attachment) => generatedAttachmentResourceId(attachment) !== undefined)

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
        <Badge variant="secondary" className="shrink-0 type-micro leading-4 px-1.5 py-0">
          {generated.length} 个结果
        </Badge>
      </div>
      {generated.length > 1 && (
        <GeneratedBulkCandidateAttachControl attachments={generated} projectId={projectId} />
      )}
      <div className="space-y-1.5">
        {generated.map((attachment) => {
          const resourceId = generatedAttachmentResourceId(attachment)
          return (
            <div key={attachment.id} className="rounded border border-border/70 bg-muted/20 px-2 py-1.5">
              <GeneratedMediaPreview attachment={attachment} />
              <div className="flex min-w-0 items-center gap-2">
                <AttachmentIcon type={attachment.type} size={12} />
                <div className="min-w-0 flex-1">
                  <p className="truncate type-tiny font-medium text-foreground">{attachment.name}</p>
                  <p className="truncate type-micro text-muted-foreground">
                    {resourceId !== undefined ? `#${resourceId}` : '未返回资源 ID'} · {attachment.type} · {attachment.mimeType || 'unknown'} · {formatBytes(attachment.size)}
                  </p>
                  {attachment.generated && (
                    <p className="truncate type-micro text-muted-foreground">
                      {[
                        attachment.generated.jobId !== undefined ? `Job #${attachment.generated.jobId}` : undefined,
                        attachment.generated.jobType,
                        attachment.generated.providerName,
                        attachment.generated.modelDisplay ?? attachment.generated.modelIdentifier,
                        attachment.generated.status,
                        attachment.generated.stage,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                {attachment.url && (
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded px-1.5 py-1 type-micro text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    打开
                  </a>
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
              <GeneratedCandidateAttachControl attachment={attachment} projectId={projectId} />
            </div>
          )
        })}
      </div>
      <p className="mt-2 type-tiny leading-relaxed text-muted-foreground">
        {hasUsableGeneratedResource
          ? '可在后续消息中粘贴资源引用，或将可用的生成资源加入素材需求、画面锚点的候选列表。'
          : '这些生成结果暂未返回资源 ID，暂不能复制引用或加入候选。'}
      </p>
    </div>
  )
}

function GeneratedMediaPreview({ attachment }: { attachment: AgentAttachment }) {
  const url = attachment.previewUrl ?? attachment.url
  if (attachment.type === 'image' && url) {
    return (
      <a
        data-testid="agent-generated-media-preview"
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mb-2 block overflow-hidden rounded-md border border-border/70 bg-muted"
      >
        <AuthedImage src={url} alt={attachment.name} className="h-56 max-h-[45vh] w-full object-contain" />
      </a>
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

function GeneratedBulkCandidateAttachControl({ attachments, projectId }: { attachments: AgentAttachment[]; projectId?: number }) {
  const [targetType, setTargetType] = useState<GeneratedBindingTarget>('asset_slot')
  const [targetId, setTargetId] = useState<number | undefined>(undefined)
  const [targetQuery, setTargetQuery] = useState('')
  const [attachStatus, setAttachStatus] = useState<'idle' | 'attaching' | 'attached' | 'partial' | 'error'>('idle')
  const [attachMessage, setAttachMessage] = useState('')
  const [attachedAttachmentIds, setAttachedAttachmentIds] = useState<Set<string>>(() => new Set())
  const queryClient = useQueryClient()
  const targetConfig = GENERATED_BINDING_TARGETS.find((target) => target.value === targetType) ?? GENERATED_BINDING_TARGETS[0]
  const candidateAttachments = attachments.filter((attachment) => generatedAttachmentResourceId(attachment) !== undefined)
  const pendingCandidateAttachments = pendingGeneratedCandidateAttachments(candidateAttachments, attachedAttachmentIds)
  const hasCandidateAttachments = pendingCandidateAttachments.length > 0
  const { data: targetRecords = [], isFetching: loadingTargets } = useQuery({
    queryKey: ['agent-generated-candidate-targets', projectId, targetConfig.entityKind],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig(targetConfig.entityKind)),
    enabled: !!projectId && hasCandidateAttachments,
    staleTime: 30_000,
  })
  const normalizedQuery = targetQuery.trim().toLowerCase()
  const filteredTargets = targetRecords
    .filter((record) => isGeneratedCandidateTargetRecord(record, targetConfig.value))
    .filter((record) => !normalizedQuery || generatedTargetSearchText(record).includes(normalizedQuery))
    .slice(0, 20)
  const selectedTarget = targetId !== undefined ? filteredTargets.find((record) => record.ID === targetId) : undefined
  const canAttach = !!projectId && targetId !== undefined && !!selectedTarget && hasCandidateAttachments && attachStatus !== 'attaching' && attachStatus !== 'attached'
  const helperMessage = !projectId
    ? '请选择项目后再加入候选。'
    : candidateAttachments.length === 0
      ? '这些生成结果暂未返回可加入候选的资源 ID。'
      : pendingCandidateAttachments.length === 0
        ? `已将 ${attachedAttachmentIds.size} 个生成资源加入当前${generatedBindingTargetLabel(targetConfig.value)}候选列表。`
        : `将 ${pendingCandidateAttachments.length} 个生成资源加入同一个${generatedBindingTargetLabel(targetConfig.value)}候选列表。`

  async function attachAllCandidates() {
    if (!projectId || !canAttach || targetId === undefined) return
    setAttachStatus('attaching')
    setAttachMessage('')
    const targetRecord = selectedTarget
    const attemptedAttachments = pendingCandidateAttachments
    const results = targetRecord
      ? await Promise.allSettled(attemptedAttachments.map((attachment) => attachGeneratedCandidate(projectId, targetConfig.value, targetId, targetRecord, attachment)))
      : []
    const targetLabel = selectedTarget ? generatedTargetRecordLabel(selectedTarget) : `${generatedBindingTargetLabel(targetConfig.value)} #${targetId}`
    const summary = generatedCandidateAttachSummary(targetLabel, results)
    const nextAttachedAttachmentIds = attachedGeneratedCandidateIdsAfterResults(attachedAttachmentIds, attemptedAttachments, results)
    if (summary.createdCount > 0) {
      setAttachedAttachmentIds(nextAttachedAttachmentIds)
      invalidateGeneratedCandidateQueries(queryClient, projectId)
    }
    const cumulativeAttachedCount = nextAttachedAttachmentIds.size
    const allPendingAttached = cumulativeAttachedCount >= candidateAttachments.length && candidateAttachments.length > 0
    setAttachStatus(allPendingAttached && summary.failedCount === 0 ? 'attached' : summary.status)
    setAttachMessage(allPendingAttached && summary.failedCount === 0
      ? `${targetLabel} 已累计加入 ${cumulativeAttachedCount} 个候选`
      : summary.message)
  }

  return (
    <div data-testid="agent-generated-bulk-candidate" className="mb-2 grid gap-1.5 rounded border border-primary/20 bg-primary/5 p-1.5">
      <div className="grid grid-cols-[82px_minmax(0,1fr)_auto] gap-1">
        <Select
          value={targetConfig.value}
          onValueChange={(value) => {
            setTargetType(value as typeof targetType)
            setTargetId(undefined)
            setAttachedAttachmentIds(new Set())
            setAttachMessage('')
            if (attachStatus !== 'attaching') setAttachStatus('idle')
          }}
          disabled={!projectId || candidateAttachments.length === 0 || attachStatus === 'attaching'}
        >
          <SelectTrigger className="h-7 min-w-0 type-tiny">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GENERATED_BINDING_TARGETS.map((target) => (
              <SelectItem key={`bulk-target-type-${target.value}`} value={target.value}>{target.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={targetId !== undefined ? String(targetId) : undefined}
          onValueChange={(value) => {
            setTargetId(Number(value))
            setAttachedAttachmentIds(new Set())
            setAttachMessage('')
            if (attachStatus !== 'attaching') setAttachStatus('idle')
          }}
          disabled={!projectId || candidateAttachments.length === 0 || loadingTargets || filteredTargets.length === 0}
        >
          <SelectTrigger className="h-7 min-w-0 type-tiny">
            <SelectValue placeholder={loadingTargets ? '加载中' : `选择${generatedBindingTargetLabel(targetConfig.value)}`} />
          </SelectTrigger>
          <SelectContent>
            {filteredTargets.map((record) => (
              <SelectItem key={`bulk-${targetConfig.value}-${record.ID}`} value={String(record.ID)}>
                {generatedTargetRecordLabel(record)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" variant="secondary" disabled={!canAttach} onClick={attachAllCandidates} className="px-2 type-tiny">
          {attachStatus === 'attaching' ? '加入中' : attachStatus === 'attached' ? '已加入' : attachStatus === 'partial' ? '重试失败项' : '全部加入候选'}
        </Button>
      </div>
      <input
        value={targetQuery}
        onChange={(event) => {
          setTargetQuery(event.target.value)
          setTargetId(undefined)
          setAttachedAttachmentIds(new Set())
          setAttachMessage('')
          if (attachStatus !== 'attaching') setAttachStatus('idle')
        }}
        placeholder={loadingTargets ? '正在加载目标对象...' : `搜索${generatedBindingTargetLabel(targetConfig.value)}`}
        disabled={!projectId || candidateAttachments.length === 0}
        className="h-7 min-w-0 rounded-md border border-input bg-background px-2 type-tiny outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
      />
      <p className={cn('type-micro leading-relaxed', attachStatus === 'error' ? 'text-destructive' : attachStatus === 'attached' ? 'text-green-700' : attachStatus === 'partial' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
        {attachMessage || helperMessage}
      </p>
    </div>
  )
}

function GeneratedCandidateAttachControl({ attachment, projectId }: { attachment: AgentAttachment; projectId?: number }) {
  const [targetType, setTargetType] = useState<GeneratedBindingTarget>('asset_slot')
  const [targetId, setTargetId] = useState<number | undefined>(undefined)
  const [targetQuery, setTargetQuery] = useState('')
  const [attachStatus, setAttachStatus] = useState<'idle' | 'attaching' | 'attached' | 'error'>('idle')
  const [attachMessage, setAttachMessage] = useState('')
  const queryClient = useQueryClient()
  const targetConfig = GENERATED_BINDING_TARGETS.find((target) => target.value === targetType) ?? GENERATED_BINDING_TARGETS[0]
  const resourceId = generatedAttachmentResourceId(attachment)
  const { data: targetRecords = [], isFetching: loadingTargets } = useQuery({
    queryKey: ['agent-generated-candidate-targets', projectId, targetConfig.entityKind],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig(targetConfig.entityKind)),
    enabled: !!projectId && attachment.resourceId !== undefined && resourceId !== undefined,
    staleTime: 30_000,
  })
  if (resourceId === undefined) {
    return (
      <p data-testid="agent-generated-resource-candidate-missing-id" className="mt-1.5 rounded border border-dashed border-border/70 px-2 py-1 type-micro leading-relaxed text-muted-foreground">
        该生成结果暂未返回资源 ID，不能加入候选。
      </p>
    )
  }
  const normalizedQuery = targetQuery.trim().toLowerCase()
  const filteredTargets = targetRecords
    .filter((record) => isGeneratedCandidateTargetRecord(record, targetConfig.value))
    .filter((record) => !normalizedQuery || generatedTargetSearchText(record).includes(normalizedQuery))
    .slice(0, 20)
  const selectedTarget = targetId !== undefined ? filteredTargets.find((record) => record.ID === targetId) : undefined
  const canAttach = !!projectId && targetId !== undefined && !!selectedTarget && attachStatus !== 'attaching' && attachStatus !== 'attached'
  const selectedTargetDescription = selectedTarget ? generatedTargetRecordDescription(selectedTarget) : ''
  const selectedTargetMeta = selectedTarget ? generatedTargetRecordMeta(selectedTarget) : []

  async function attachCandidate() {
    if (!projectId || !canAttach || resourceId === undefined || targetId === undefined) return
    setAttachStatus('attaching')
    setAttachMessage('')
    try {
      if (!selectedTarget) throw new Error('请选择目标对象')
      const created = await attachGeneratedCandidate(projectId, targetConfig.value, targetId, selectedTarget, attachment)
      setAttachStatus('attached')
      const targetLabel = selectedTarget ? generatedTargetRecordLabel(selectedTarget) : `${generatedBindingTargetLabel(targetConfig.value)} #${targetId}`
      setAttachMessage(`${targetLabel} 已加入候选 #${created.ID}`)
      invalidateGeneratedCandidateQueries(queryClient, projectId)
    } catch (error) {
      setAttachStatus('error')
      setAttachMessage(generatedBindingErrorMessage(error, '加入候选失败'))
    }
  }

  return (
    <div data-testid="agent-generated-resource-candidate" className="mt-1.5 grid gap-1.5 rounded border border-border/60 bg-background/50 p-1.5">
      <div className="grid grid-cols-[82px_minmax(0,1fr)_auto] gap-1">
        <Select
          value={targetConfig.value}
          onValueChange={(value) => {
            setTargetType(value as typeof targetType)
            setTargetId(undefined)
            setAttachMessage('')
            if (attachStatus !== 'attaching') setAttachStatus('idle')
          }}
          disabled={!projectId || attachStatus === 'attaching'}
        >
          <SelectTrigger className="h-7 min-w-0 type-tiny">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GENERATED_BINDING_TARGETS.map((target) => (
              <SelectItem key={`target-type-${target.value}`} value={target.value}>{target.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={targetId !== undefined ? String(targetId) : undefined}
          onValueChange={(value) => {
            setTargetId(Number(value))
            setAttachMessage('')
            if (attachStatus !== 'attaching') setAttachStatus('idle')
          }}
          disabled={!projectId || loadingTargets || filteredTargets.length === 0}
        >
          <SelectTrigger className="h-7 min-w-0 type-tiny">
            <SelectValue placeholder={loadingTargets ? '加载中' : `选择${generatedBindingTargetLabel(targetConfig.value)}`} />
          </SelectTrigger>
          <SelectContent>
            {filteredTargets.map((record) => (
              <SelectItem key={`${targetConfig.value}-${record.ID}`} value={String(record.ID)}>
                {generatedTargetRecordLabel(record)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" variant="secondary" disabled={!canAttach} onClick={attachCandidate} className="px-2 type-tiny">
          {attachStatus === 'attaching' ? '加入中' : attachStatus === 'attached' ? '已加入' : '加入候选'}
        </Button>
      </div>
      <input
        value={targetQuery}
        onChange={(event) => {
          setTargetQuery(event.target.value)
          setTargetId(undefined)
          setAttachMessage('')
          if (attachStatus !== 'attaching') setAttachStatus('idle')
        }}
        placeholder={loadingTargets ? '正在加载目标对象...' : `搜索${generatedBindingTargetLabel(targetConfig.value)}`}
        disabled={!projectId}
        className="h-7 min-w-0 rounded-md border border-input bg-background px-2 type-tiny outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
      />
      {projectId && normalizedQuery && !loadingTargets && filteredTargets.length === 0 && (
        <p className="rounded border border-dashed border-border/70 px-2 py-1 type-micro leading-relaxed text-muted-foreground">
          没有匹配的目标对象，请调整搜索条件后再选择。
        </p>
      )}
      {selectedTarget && (
        <div className="rounded border border-primary/20 bg-primary/5 px-2 py-1.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="min-w-0 truncate type-micro font-medium text-foreground">{generatedTargetRecordLabel(selectedTarget)}</p>
            <span className="shrink-0 type-min text-muted-foreground">#{selectedTarget.ID}</span>
          </div>
          {selectedTargetMeta.length > 0 && (
            <p className="mt-0.5 truncate type-min text-muted-foreground">{selectedTargetMeta.join(' · ')}</p>
          )}
          {selectedTargetDescription && (
            <p className="mt-1 line-clamp-2 type-min leading-relaxed text-muted-foreground">{selectedTargetDescription}</p>
          )}
        </div>
      )}
      <p className={cn('type-micro leading-relaxed', attachStatus === 'error' ? 'text-destructive' : attachStatus === 'attached' ? 'text-green-700' : 'text-muted-foreground')}>
        {attachMessage || (projectId ? `选择${generatedBindingTargetLabel(targetConfig.value)}后，将生成资源加入候选列表。` : '请选择项目后再加入候选。')}
      </p>
    </div>
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

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

function resourceMentionToken(resourceId: number) {
  return `@[resource:${resourceId}]`
}
