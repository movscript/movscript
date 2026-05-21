import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Boxes, Image, Plus } from 'lucide-react'

import {
  createSemanticEntity,
  semanticEntityConfig,
  type SemanticEntityConfig,
  type SemanticEntityPayload,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import { contentUnitKindOptions, trackKindLabel } from '@/lib/contentWorkbenchLabels'
import {
  keyframeFrameRoleLabel,
  keyframeFrameRoleOptions,
  keyframeOrderForRole,
  keyframeTitleForRole,
  nextKeyframeFrameRole,
  normalizeKeyframeFrameRole,
  type KeyframeFrameRole,
} from '@/lib/contentWorkbenchEditModel'
import { firstText, titleOfRecord } from '@/lib/contentWorkbenchRecordUtils'
import { apiErrorMessage } from '@/lib/contentWorkbenchStatus'
import { mergeMetadataJSON, parseMetadataJSON } from '@/lib/contentUnitPlanningMetadata'
import { toast } from '@/store/toastStore'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { Input, Label } from '@movscript/ui'

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
  const [kind, setKind] = useState(kindOptions.some((option) => option.value === defaultKind) ? defaultKind : kindOptions[0]?.value ?? 'shot')
  const selectedKindLabel = trackKindLabel(kind)

  useEffect(() => {
    const nextKind = firstText(defaults?.kind, 'shot')
    setKind(kindOptions.some((option) => option.value === nextKind) ? nextKind : kindOptions[0]?.value ?? 'shot')
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
      toast.success('制作项草稿已创建')
      onSaved(record)
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '创建制作项失败'))
    },
  })

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-muted/25 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 type-body font-semibold text-foreground">
              <Boxes size={14} className="text-muted-foreground" />
              新建制作项
            </div>
            <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">
              {selected.title} · 候选草稿
            </p>
          </div>
          <Badge variant="outline">仅类型</Badge>
        </div>
      </div>

      <div className="p-4">
        <div className="space-y-1.5">
          <Label className="type-label text-muted-foreground">类型</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-10 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kindOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={createUnit.isPending}>
            取消
          </Button>
          <Button type="button" className="gap-2" onClick={() => createUnit.mutate()} loading={createUnit.isPending} disabled={!projectId || createUnit.isPending}>
            <Plus size={14} />
            创建
          </Button>
        </div>
      </div>
    </section>
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
    <section className="overflow-hidden rounded-lg border border-border bg-card" data-testid="content-workbench-create-keyframe-card">
      <div className="border-b border-border bg-muted/25 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 type-body font-semibold text-foreground">
              <Image size={14} className="text-muted-foreground" />
              新建关键帧
            </div>
            <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">
              {titleOfRecord(selectedUnit)} · 只需先确定首帧、中间帧或尾帧。
            </p>
          </div>
          <Badge variant="outline">标题可选</Badge>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label className="type-label text-muted-foreground">分类</Label>
          <Select value={frameRole} onValueChange={(value) => setFrameRole(normalizeKeyframeFrameRole(value, 'first'))}>
            <SelectTrigger className="h-10 bg-background" data-testid="content-workbench-create-keyframe-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keyframeFrameRoleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedRole ? <p className="type-caption leading-5 text-muted-foreground">{selectedRole.detail}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`create-keyframe-title-${selectedUnit.ID}`} className="type-label text-muted-foreground">标题（可选）</Label>
          <Input
            id={`create-keyframe-title-${selectedUnit.ID}`}
            value={title}
            placeholder={`${keyframeFrameRoleLabel(frameRole)} · ${titleOfRecord(selectedUnit)}`}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={createKeyframe.isPending}>
            取消
          </Button>
          <Button type="button" className="gap-2" onClick={() => createKeyframe.mutate()} loading={createKeyframe.isPending} disabled={!projectId || createKeyframe.isPending}>
            <Plus size={14} />
            创建
          </Button>
        </div>
      </div>
    </section>
  )
}

function nullableNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}
