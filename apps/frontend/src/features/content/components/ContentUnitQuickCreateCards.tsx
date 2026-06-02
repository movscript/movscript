import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Boxes, Image, Plus } from 'lucide-react'

import {
  createSemanticEntity,
  semanticEntityConfig,
  type SemanticEntityConfig,
  type SemanticEntityPayload,
  type SemanticEntityRecord,
} from '@/shared/infrastructure/api/semanticEntities'
import { contentUnitKindOptions, trackKindLabel } from '@/features/content/domain/contentWorkbenchLabels'
import {
  keyframeFrameRoleLabel,
  keyframeFrameRoleOptions,
  keyframeOrderForRole,
  keyframeTitleForRole,
  nextKeyframeFrameRole,
  normalizeKeyframeFrameRole,
  type KeyframeFrameRole,
} from '@/features/content/domain/contentWorkbenchEditModel'
import { firstText, titleOfRecord } from '@/features/content/domain/contentWorkbenchRecordUtils'
import { apiErrorMessage } from '@/features/content/domain/contentWorkbenchStatus'
import { mergeMetadataJSON, parseMetadataJSON } from '@/features/content/domain/contentUnitPlanningMetadata'
import { toast } from '@/shared/ui/toastStore'
import {
  ContentWorkbenchQuickCreateActionButton,
  ContentWorkbenchQuickCreateActions,
  ContentWorkbenchQuickCreateCard,
  ContentWorkbenchQuickCreateInputField,
  ContentWorkbenchQuickCreateSelectField,
} from '@movscript/ui'

type WorkbenchRecord = SemanticEntityRecord & Record<string, any>

type ContentUnitQuickCreateMoment = {
  title: string
  segment?: WorkbenchRecord
  moment: WorkbenchRecord
  productionIds: number[]
  units: WorkbenchRecord[]
}

export function CreateContentUnitQuickCard({
  projectId,
  contentUnitConfig,
  selected,
  selectedUnit,
  defaults,
  queryKey,
  onSaved,
  onCancel,
}: {
  projectId?: number
  contentUnitConfig: SemanticEntityConfig
  selected: ContentUnitQuickCreateMoment
  selectedUnit?: WorkbenchRecord | null
  defaults?: Partial<SemanticEntityPayload> | null
  queryKey: readonly unknown[]
  onSaved: (record: SemanticEntityRecord) => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const kindOptions = useMemo(() => contentUnitKindOptions(contentUnitConfig), [contentUnitConfig])
  const defaultKind = firstText(defaults?.kind, 'shot')
  const defaultDurationSec = Number(defaults?.duration_sec) > 0 ? String(Number(defaults?.duration_sec)) : ''
  const [kind, setKind] = useState(kindOptions.some((option) => option.value === defaultKind) ? defaultKind : kindOptions[0]?.value ?? 'shot')
  const [durationSec, setDurationSec] = useState(defaultDurationSec)
  const selectedKindLabel = trackKindLabel(kind)
  const durationValue = Number(durationSec)
  const canCreate = Boolean(projectId) && Number.isFinite(durationValue) && durationValue > 0

  useEffect(() => {
    const nextKind = firstText(defaults?.kind, 'shot')
    setKind(kindOptions.some((option) => option.value === nextKind) ? nextKind : kindOptions[0]?.value ?? 'shot')
    setDurationSec(Number(defaults?.duration_sec) > 0 ? String(Number(defaults?.duration_sec)) : '')
  }, [defaults, kindOptions])

  const createUnit = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('missing project id')
      const order = selected.units.length + 1
      const title = firstText(defaults?.title, `未命名${selectedKindLabel} ${order}`)
      return createSemanticEntity(projectId, contentUnitConfig, {
        ...defaults,
        title,
        kind,
        duration_sec: durationValue,
        status: 'candidate',
        segment_id: selected.segment?.ID ?? null,
        scene_moment_id: selected.moment.ID,
        production_id: nullableNumber(selectedUnit?.production_id ?? selected.moment.production_id ?? selected.segment?.production_id ?? selected.productionIds[0]),
        script_block_id: nullableNumber(selectedUnit?.script_block_id ?? selected.moment.script_block_id ?? selected.segment?.script_block_id),
        order,
      })
    },
    onSuccess: async (record) => {
      await queryClient.invalidateQueries({ queryKey })
      if (projectId) queryClient.invalidateQueries({ queryKey: [contentUnitConfig.kind, projectId] })
      toast.success('制作项工作区已创建')
      onSaved(record)
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '创建制作项失败'))
    },
  })

  return (
    <ContentWorkbenchQuickCreateCard
      icon={Boxes}
      title="新建制作项"
      description={`${selected.title} · 候选工作区`}
      badge="需时长"
    >
      <ContentWorkbenchQuickCreateSelectField
        label="类型"
        value={kind}
        options={kindOptions}
        onChange={setKind}
      />

      <ContentWorkbenchQuickCreateInputField
        label="秒数"
        id={`create-content-unit-duration-${selected.moment.ID}`}
        type="number"
        min="0.1"
        step="0.1"
        value={durationSec}
        placeholder="例如 3"
        onChange={(event) => setDurationSec(event.target.value)}
      />

      <ContentWorkbenchQuickCreateActions>
        <ContentWorkbenchQuickCreateActionButton type="button" variant="outline" onClick={onCancel} disabled={createUnit.isPending}>
          取消
        </ContentWorkbenchQuickCreateActionButton>
        <ContentWorkbenchQuickCreateActionButton type="button" onClick={() => createUnit.mutate()} loading={createUnit.isPending} disabled={!canCreate || createUnit.isPending}>
          <Plus size={14} />
          创建
        </ContentWorkbenchQuickCreateActionButton>
      </ContentWorkbenchQuickCreateActions>
    </ContentWorkbenchQuickCreateCard>
  )
}

export function CreateKeyframeQuickCard({
  projectId,
  keyframeConfig,
  selectedUnit,
  defaults,
  existingKeyframes,
  queryKey,
  onSaved,
  onCancel,
}: {
  projectId?: number
  keyframeConfig: SemanticEntityConfig
  selectedUnit: WorkbenchRecord
  defaults: Partial<SemanticEntityPayload>
  existingKeyframes: WorkbenchRecord[]
  queryKey: readonly unknown[]
  onSaved: (record: SemanticEntityRecord) => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const defaultRole = normalizeKeyframeFrameRole(parseMetadataJSON(defaults.metadata_json).frame_role, nextKeyframeFrameRole(existingKeyframes))
  const [frameRole, setFrameRole] = useState<KeyframeFrameRole>(defaultRole)
  const [title, setTitle] = useState('')

  useEffect(() => {
    setFrameRole(defaultRole)
    setTitle('')
  }, [defaultRole, selectedUnit.ID])

  const createKeyframe = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('missing project id')
      const order = keyframeOrderForRole(frameRole, existingKeyframes)
      return createSemanticEntity(projectId, keyframeConfig, {
        ...defaults,
        title: keyframeTitleForRole(frameRole, selectedUnit, title),
        order,
        status: firstText(defaults.status, 'candidate'),
        metadata_json: JSON.stringify(mergeMetadataJSON(defaults.metadata_json, {
          frame_role: frameRole,
          frame_role_label: keyframeFrameRoleLabel(frameRole),
        })),
      })
    },
    onSuccess: async (record) => {
      await queryClient.invalidateQueries({ queryKey })
      if (projectId) queryClient.invalidateQueries({ queryKey: [keyframeConfig.kind, projectId] })
      toast.success('关键帧已创建')
      onSaved(record)
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '创建关键帧失败'))
    },
  })

  const selectedRole = keyframeFrameRoleOptions.find((option) => option.value === frameRole) ?? keyframeFrameRoleOptions[0]

  return (
    <ContentWorkbenchQuickCreateCard
      icon={Image}
      title="新建关键帧"
      description={`${titleOfRecord(selectedUnit)} · 只需先确定首帧、中间帧或尾帧。`}
      badge="标题可选"
      data-testid="content-workbench-create-keyframe-card"
    >
      <ContentWorkbenchQuickCreateSelectField
        label="分类"
        value={frameRole}
        options={keyframeFrameRoleOptions}
        onChange={(value) => setFrameRole(normalizeKeyframeFrameRole(value, 'first'))}
        detail={selectedRole?.detail}
        triggerTestId="content-workbench-create-keyframe-role"
      />

      <ContentWorkbenchQuickCreateInputField
        label="标题（可选）"
        id={`create-keyframe-title-${selectedUnit.ID}`}
        value={title}
        placeholder={`${keyframeFrameRoleLabel(frameRole)} · ${titleOfRecord(selectedUnit)}`}
        onChange={(event) => setTitle(event.target.value)}
      />

      <ContentWorkbenchQuickCreateActions>
        <ContentWorkbenchQuickCreateActionButton type="button" variant="outline" onClick={onCancel} disabled={createKeyframe.isPending}>
          取消
        </ContentWorkbenchQuickCreateActionButton>
        <ContentWorkbenchQuickCreateActionButton type="button" onClick={() => createKeyframe.mutate()} loading={createKeyframe.isPending} disabled={!projectId || createKeyframe.isPending}>
          <Plus size={14} />
          创建
        </ContentWorkbenchQuickCreateActionButton>
      </ContentWorkbenchQuickCreateActions>
    </ContentWorkbenchQuickCreateCard>
  )
}

function nullableNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}
