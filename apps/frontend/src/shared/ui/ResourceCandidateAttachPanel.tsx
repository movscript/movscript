import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import {
  GENERATED_BINDING_TARGETS,
  type GeneratedBindingTarget,
  attachedGeneratedCandidateIdsAfterResults,
  generatedBindingTargetLabel,
  generatedCandidateAttachSummary,
  generatedTargetRecordDescription,
  generatedTargetRecordId,
  generatedTargetRecordLabel,
  generatedTargetRecordMeta,
  generatedTargetSearchText,
  isGeneratedCandidateTargetRecord,
  pendingGeneratedCandidateAttachments,
} from '@/features/agent/domain/agentGeneratedResourceBinding'
import { assetCandidateSelectedResult, invalidateResourceMutationResult } from '@/features/resources/application/resourceMutationInvalidation'
import { resourceCandidateKeys } from '@/features/resources/application/resourceQueryKeys'
import {
  createWorkspaceAssetSlotCandidate,
  createWorkspaceKeyframeCandidate,
} from '@/shared/infrastructure/workspaceCandidateRepository'
import type { ResourceBindingOwnerType } from '@/types'
import {
  ResourceCandidateAttachBody,
  ResourceCandidateAttachControls,
  ResourceCandidateAttachFooter,
  ResourceCandidateAttachHeader,
  ResourceCandidateAttachMessage,
  ResourceCandidateAttachShell,
  ResourceCandidateAttachSubmit,
  ResourceCandidateEmpty,
  ResourceCandidateItem,
  ResourceCandidateList,
  ResourceCandidateSearchInput,
  ResourceCandidateSelectedTarget,
  ResourceCandidateTargetEmpty,
  ResourceCandidateTargetItem,
  ResourceCandidateTargetList,
  ResourceCandidateTargetTypeSelect
} from '@movscript/ui/business/resource'

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
    queryKey: resourceCandidateKeys.targets(projectId, targetConfig.entityKind),
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig(targetConfig.entityKind)),
    enabled: !!projectId && hasCandidateResources,
    staleTime: 30_000,
  })

  const normalizedQuery = targetQuery.trim().toLowerCase()
  const filteredTargets = targetRecords
    .filter((record) => isGeneratedCandidateTargetRecord(record, targetConfig.value))
    .filter((record) => generatedTargetRecordId(record) !== undefined)
    .filter((record) => !normalizedQuery || generatedTargetSearchText(record).includes(normalizedQuery))
    .slice(0, 80)
  const selectedTarget = targetId !== undefined ? filteredTargets.find((record) => generatedTargetRecordId(record) === targetId) : undefined
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
  const attachMessageTone = attachStatus === 'error' ? 'danger' : attachStatus === 'attached' ? 'success' : 'neutral'

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
      invalidateResourceMutationResult(queryClient, assetCandidateSelectedResult({ projectId }))
    }
    const allAttached = nextAttachedResourceIds.size >= candidateResources.length && candidateResources.length > 0
    setAttachStatus(allAttached && summary.failedCount === 0 ? 'attached' : summary.status)
    setAttachMessage(allAttached && summary.failedCount === 0
      ? `${targetLabel} 已累计加入 ${nextAttachedResourceIds.size} 个候选`
      : summary.message)
  }

  return (
    <ResourceCandidateAttachShell className={className}>
      <ResourceCandidateAttachHeader title="候选操作" count={candidateResources.length}>
        {showResourceList && (
          <ResourceCandidateList>
            {candidateResources.length === 0 ? (
              <ResourceCandidateEmpty>没有可加入的资源。</ResourceCandidateEmpty>
            ) : candidateResources.map((resource) => {
              const attached = attachedResourceIds.has(resource.id)
              return (
                <ResourceCandidateItem
                  key={resource.id}
                  active={attached}
                  name={resource.name}
                  badge={attached ? '已加入' : undefined}
                  meta={`#${resource.resourceId} · ${resource.type ?? 'resource'}`}
                />
              )
            })}
          </ResourceCandidateList>
        )}
      </ResourceCandidateAttachHeader>

      <ResourceCandidateAttachBody>
        <ResourceCandidateAttachControls compact={compact}>
          <ResourceCandidateTargetTypeSelect
            value={targetConfig.value}
            options={GENERATED_BINDING_TARGETS.map((target) => ({ value: target.value, label: target.label }))}
            onValueChange={(value) => {
              setTargetType(value as GeneratedBindingTarget)
              resetSelection()
            }}
            disabled={!projectId || candidateResources.length === 0 || attachStatus === 'attaching'}
          />
          <ResourceCandidateSearchInput
            value={targetQuery}
            onChange={(event) => {
              setTargetQuery(event.target.value)
              setTargetId(undefined)
              setAttachMessage('')
              if (attachStatus !== 'attaching') setAttachStatus('idle')
            }}
            placeholder={loadingTargets ? '正在加载目标对象...' : `搜索${generatedBindingTargetLabel(targetConfig.value)}`}
            disabled={!projectId || candidateResources.length === 0}
          />
        </ResourceCandidateAttachControls>

        <ResourceCandidateTargetList compact={compact}>
          {loadingTargets ? (
            <ResourceCandidateTargetEmpty>正在加载目标对象...</ResourceCandidateTargetEmpty>
          ) : filteredTargets.length === 0 ? (
            <ResourceCandidateTargetEmpty>
              {projectId ? '没有匹配的目标对象，请调整搜索条件。' : '请选择当前项目后再加入候选。'}
            </ResourceCandidateTargetEmpty>
          ) : filteredTargets.map((record) => {
            const recordId = generatedTargetRecordId(record)
            if (recordId === undefined) return null
            const selected = recordId === targetId
            const meta = generatedTargetRecordMeta(record)
            const description = generatedTargetRecordDescription(record)
            return (
              <ResourceCandidateTargetItem
                key={`${targetConfig.value}-${recordId}`}
                active={selected}
                title={generatedTargetRecordLabel(record)}
                idLabel={`#${recordId}`}
                meta={meta.length > 0 ? meta.join(' · ') : undefined}
                description={description || undefined}
                onClick={() => {
                  setTargetId(recordId)
                  setAttachMessage('')
                  if (attachStatus !== 'attaching') setAttachStatus('idle')
                }}
              />
            )
          })}
        </ResourceCandidateTargetList>

        {selectedTarget && (
          <ResourceCandidateSelectedTarget
            title={generatedTargetRecordLabel(selectedTarget)}
            meta={selectedTargetMeta.length > 0 ? selectedTargetMeta.join(' · ') : undefined}
            description={selectedTargetDescription || undefined}
          />
        )}

        <ResourceCandidateAttachMessage tone={attachMessageTone}>
          {attachMessage || helperMessage}
        </ResourceCandidateAttachMessage>
      </ResourceCandidateAttachBody>

      <ResourceCandidateAttachFooter>
        <ResourceCandidateAttachSubmit onClick={attachCandidates} disabled={!canAttach}>
          {attachStatus === 'attaching' ? '加入中' : attachStatus === 'attached' ? attachedLabel : attachStatus === 'partial' ? '重试未完成项' : actionLabel}
        </ResourceCandidateAttachSubmit>
      </ResourceCandidateAttachFooter>
    </ResourceCandidateAttachShell>
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
    return createWorkspaceKeyframeCandidate(projectId, resourceKeyframeCandidatePayload(targetRecord, resource))
  }
  return createWorkspaceAssetSlotCandidate(projectId, resourceAssetCandidatePayload(targetId, resource), targetRecord)
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
  const targetKeyframeId = generatedTargetRecordId(targetKeyframe)
  const targetTitle = stringField(targetKeyframe.title)
    || stringField(targetKeyframe.name)
    || stringField(targetKeyframe.label)
    || `画面锚点 #${targetKeyframeId ?? targetKeyframe.ID}`
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
      target_keyframe_id: targetKeyframeId ?? targetKeyframe.ID,
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
