import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import {
  GENERATED_BINDING_TARGETS,
  type GeneratedBindingTarget,
  attachedGeneratedCandidateIdsAfterResults,
  generatedBindingTargetLabel,
  generatedCandidateAttachSummary,
  generatedTargetRecordDescription,
  generatedTargetRecordLabel,
  generatedTargetRecordMeta,
  generatedTargetSearchText,
  isGeneratedCandidateTargetRecord,
  pendingGeneratedCandidateAttachments,
} from '@/lib/agentGeneratedResourceBinding'
import { invalidateAssetCandidateConsumers } from '@/lib/assetCandidateQueryInvalidation'
import { cn } from '@/lib/utils'
import type { AssetSlotCandidate, ResourceBindingOwnerType } from '@/types'
import { api } from '@/lib/api'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'

export interface CandidateResourceRef {
  id: string
  name: string
  type?: string
  resourceId?: number
  sourceJobId?: number
}

export function candidateResourceFromRawResource(resource: { ID: number; name: string; type?: string }): CandidateResourceRef {
  return {
    id: `resource-${resource.ID}`,
    name: resource.name,
    type: resource.type,
    resourceId: resource.ID,
  }
}

export function ResourceCandidateAttachPanel({
  resources,
  projectId,
  className,
  compact = false,
  showResourceList = false,
  actionLabel = '加入候选',
  attachedLabel = '已加入候选',
}: {
  resources: CandidateResourceRef[]
  projectId?: number
  className?: string
  compact?: boolean
  showResourceList?: boolean
  actionLabel?: string
  attachedLabel?: string
}) {
  const [targetType, setTargetType] = useState<GeneratedBindingTarget>('asset_slot')
  const [targetId, setTargetId] = useState<number | undefined>(undefined)
  const [targetQuery, setTargetQuery] = useState('')
  const [attachStatus, setAttachStatus] = useState<'idle' | 'attaching' | 'attached' | 'partial' | 'error'>('idle')
  const [attachMessage, setAttachMessage] = useState('')
  const [attachedResourceIds, setAttachedResourceIds] = useState<Set<string>>(() => new Set())
  const queryClient = useQueryClient()
  const resourceKey = resources.map((resource) => resource.id).join('|')
  const targetConfig = GENERATED_BINDING_TARGETS.find((target) => target.value === targetType) ?? GENERATED_BINDING_TARGETS[0]
  const candidateResources = resources.filter((resource) => validResourceId(resource.resourceId) !== undefined)
  const pendingCandidateResources = pendingGeneratedCandidateAttachments(candidateResources, attachedResourceIds)
  const hasCandidateResources = pendingCandidateResources.length > 0

  const { data: targetRecords = [], isFetching: loadingTargets } = useQuery({
    queryKey: ['resource-candidate-targets', projectId, targetConfig.entityKind],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig(targetConfig.entityKind)),
    enabled: !!projectId && hasCandidateResources,
    staleTime: 30_000,
  })

  const normalizedQuery = targetQuery.trim().toLowerCase()
  const filteredTargets = targetRecords
    .filter((record) => isGeneratedCandidateTargetRecord(record, targetConfig.value))
    .filter((record) => !normalizedQuery || generatedTargetSearchText(record).includes(normalizedQuery))
    .slice(0, 80)
  const selectedTarget = targetId !== undefined ? filteredTargets.find((record) => record.ID === targetId) : undefined
  const canAttach = !!projectId && targetId !== undefined && !!selectedTarget && hasCandidateResources && attachStatus !== 'attaching' && attachStatus !== 'attached'
  const selectedTargetDescription = selectedTarget ? generatedTargetRecordDescription(selectedTarget) : ''
  const selectedTargetMeta = selectedTarget ? generatedTargetRecordMeta(selectedTarget) : []
  const helperMessage = !projectId
    ? '请选择当前项目后再加入候选。'
    : candidateResources.length === 0
      ? '当前资源没有可加入候选的资源 ID。'
      : pendingCandidateResources.length === 0
        ? `已将 ${attachedResourceIds.size} 个资源加入候选。`
        : `将 ${pendingCandidateResources.length} 个资源加入所选${generatedBindingTargetLabel(targetConfig.value)}。`

  useEffect(() => {
    setTargetId(undefined)
    setTargetQuery('')
    setAttachStatus('idle')
    setAttachMessage('')
    setAttachedResourceIds(new Set())
  }, [resourceKey, projectId])

  function resetSelection() {
    setTargetId(undefined)
    setAttachedResourceIds(new Set())
    setAttachMessage('')
    if (attachStatus !== 'attaching') setAttachStatus('idle')
  }

  async function attachCandidates() {
    if (!projectId || !canAttach || targetId === undefined || !selectedTarget) return
    setAttachStatus('attaching')
    setAttachMessage('')
    const attemptedResources = pendingCandidateResources
    const results = await Promise.allSettled(attemptedResources.map((resource) => (
      attachResourceCandidate(projectId, targetConfig.value, targetId, selectedTarget, resource)
    )))
    const targetLabel = generatedTargetRecordLabel(selectedTarget)
    const summary = generatedCandidateAttachSummary(targetLabel, results)
    const nextAttachedResourceIds = attachedGeneratedCandidateIdsAfterResults(attachedResourceIds, attemptedResources, results)
    if (summary.createdCount > 0) {
      setAttachedResourceIds(nextAttachedResourceIds)
      invalidateAssetCandidateConsumers(queryClient, projectId)
      void queryClient.invalidateQueries({ queryKey: ['resource-candidate-targets', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['agent-generated-candidate-targets', projectId] })
    }
    const allAttached = nextAttachedResourceIds.size >= candidateResources.length && candidateResources.length > 0
    setAttachStatus(allAttached && summary.failedCount === 0 ? 'attached' : summary.status)
    setAttachMessage(allAttached && summary.failedCount === 0
      ? `${targetLabel} 已累计加入 ${nextAttachedResourceIds.size} 个候选`
      : summary.message)
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="shrink-0 border-b border-border px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="type-caption font-medium text-foreground">候选操作</p>
          <Badge variant="secondary" className="type-micro">{candidateResources.length}</Badge>
        </div>
        {showResourceList && (
          <div className="mt-2 max-h-28 space-y-1 overflow-auto">
            {candidateResources.length === 0 ? (
              <p className="rounded border border-dashed border-border px-2 py-1.5 type-micro text-muted-foreground">没有可加入的资源。</p>
            ) : candidateResources.map((resource) => {
              const attached = attachedResourceIds.has(resource.id)
              return (
                <div key={resource.id} className={cn('rounded border px-2 py-1.5', attached ? 'border-primary/30 bg-primary/10' : 'border-border bg-card')}>
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <p className="min-w-0 truncate type-tiny font-medium text-foreground">{resource.name}</p>
                    {attached ? <Badge variant="outline" className="type-micro">已加入</Badge> : null}
                  </div>
                  <p className="truncate type-micro text-muted-foreground">#{resource.resourceId} · {resource.type ?? 'resource'}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className={cn('grid gap-2', !compact && 'sm:grid-cols-[140px_minmax(0,1fr)]')}>
          <Select
            value={targetConfig.value}
            onValueChange={(value) => {
              setTargetType(value as GeneratedBindingTarget)
              resetSelection()
            }}
            disabled={!projectId || candidateResources.length === 0 || attachStatus === 'attaching'}
          >
            <SelectTrigger className="h-8 min-w-0 type-tiny">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GENERATED_BINDING_TARGETS.map((target) => (
                <SelectItem key={`resource-target-type-${target.value}`} value={target.value}>{target.label}</SelectItem>
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
            disabled={!projectId || candidateResources.length === 0}
            className="h-8 min-w-0 rounded-md border border-input bg-background px-2 type-tiny outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
          />
        </div>

        <div className={cn('mt-2 overflow-auto rounded-md border border-border bg-background', compact ? 'max-h-[34vh]' : 'max-h-[42vh]')}>
          {loadingTargets ? (
            <p className="px-3 py-6 text-center type-tiny text-muted-foreground">正在加载目标对象...</p>
          ) : filteredTargets.length === 0 ? (
            <p className="px-3 py-6 text-center type-tiny text-muted-foreground">
              {projectId ? '没有匹配的目标对象，请调整搜索条件。' : '请选择当前项目后再加入候选。'}
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

        <p className={cn('mt-2 type-micro leading-relaxed', attachStatus === 'error' ? 'text-destructive' : attachStatus === 'attached' ? 'text-primary' : 'text-muted-foreground')}>
          {attachMessage || helperMessage}
        </p>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-3 py-3">
        <Button type="button" onClick={attachCandidates} disabled={!canAttach}>
          {attachStatus === 'attaching' ? '加入中' : attachStatus === 'attached' ? attachedLabel : attachStatus === 'partial' ? '重试未完成项' : actionLabel}
        </Button>
      </div>
    </div>
  )
}

async function attachResourceCandidate(
  projectId: number,
  targetType: Extract<ResourceBindingOwnerType, 'asset_slot' | 'keyframe'>,
  targetId: number,
  targetRecord: SemanticEntityRecord,
  resource: CandidateResourceRef,
) {
  if (targetType === 'keyframe') {
    const { data } = await api.post<SemanticEntityRecord>(`/projects/${projectId}/entities/keyframes`, resourceKeyframeCandidatePayload(targetRecord, resource))
    return data
  }
  const { data } = await api.post<AssetSlotCandidate>(`/projects/${projectId}/entities/asset-slot-candidates`, resourceAssetCandidatePayload(targetId, resource))
  return data
}

function resourceAssetCandidatePayload(assetSlotId: number, resource: CandidateResourceRef) {
  const resourceId = validResourceId(resource.resourceId)
  if (resourceId === undefined) throw new Error('resource_id required')
  return {
    asset_slot_id: assetSlotId,
    resource_id: resourceId,
    status: 'candidate',
    source_type: resource.sourceJobId !== undefined ? 'job' : 'manual',
    ...(resource.sourceJobId !== undefined ? { source_id: resource.sourceJobId } : {}),
    note: resource.sourceJobId !== undefined ? `由 AI 助手生成任务 #${resource.sourceJobId} 加入候选` : `从资源库选择：${resource.name}`,
  }
}

function resourceKeyframeCandidatePayload(targetKeyframe: SemanticEntityRecord, resource: CandidateResourceRef) {
  const resourceId = validResourceId(resource.resourceId)
  if (resourceId === undefined) throw new Error('resource_id required')
  const targetTitle = stringField(targetKeyframe.title)
    || stringField(targetKeyframe.name)
    || stringField(targetKeyframe.label)
    || `画面锚点 #${targetKeyframe.ID}`
  return {
    production_id: nullablePositiveNumber(targetKeyframe.production_id),
    scene_moment_id: nullablePositiveNumber(targetKeyframe.scene_moment_id),
    content_unit_id: nullablePositiveNumber(targetKeyframe.content_unit_id),
    resource_id: resourceId,
    canvas_id: nullablePositiveNumber(targetKeyframe.canvas_id),
    title: `候选：${targetTitle}`,
    description: stringField(targetKeyframe.description),
    prompt: stringField(targetKeyframe.prompt),
    order: numberField(targetKeyframe.order ?? targetKeyframe.sort_order ?? targetKeyframe.sortOrder),
    status: 'candidate',
    metadata_json: JSON.stringify({
      source: resource.sourceJobId !== undefined ? 'ai_generated_keyframe_candidate' : 'resource_library_keyframe_candidate',
      target_keyframe_id: targetKeyframe.ID,
      resource_id: resourceId,
      ...(resource.sourceJobId !== undefined ? { source_job_id: resource.sourceJobId } : {}),
    }),
  }
}

function validResourceId(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0 ? value : undefined
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberField(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function nullablePositiveNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}
