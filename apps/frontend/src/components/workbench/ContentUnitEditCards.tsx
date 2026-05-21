import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Plus, Sparkles, Trash2 } from 'lucide-react'

import {
  deleteSemanticEntity,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import { api } from '@/lib/api'
import {
  buildKeyframeGenerationPrompt,
  contentUnitEditCameraAngleOptions,
  contentUnitEditCameraMotionOptions,
  contentUnitEditDraftEqualsRecord,
  contentUnitEditDraftFromRecord,
  contentUnitEditPayload,
  contentUnitEditShotSizeOptions,
  contentUnitEditStatusOptions,
  keyframeEditDraftEqualsRecord,
  keyframeEditDraftFromRecord,
  keyframeEditPayload,
  keyframeHasOutput,
  keyframeHasRunningJob,
  type ContentUnitEditDraft,
  type ContentWorkbenchEditRecord,
  type ContentWorkbenchKeyframePromptRow,
  type ContentUnitInputDrawerTab,
  type KeyframeEditDraft,
} from '@/lib/contentWorkbenchEditModel'
import { trackKindLabel } from '@/lib/contentWorkbenchLabels'
import { byOrder, firstText, formatDuration, numberOf, titleOfRecord } from '@/lib/contentWorkbenchRecordUtils'
import { apiErrorMessage, contentUnitWorkStatus, normalizeAssetSlotStatus, statusLabel, statusVariant } from '@/lib/contentWorkbenchStatus'
import { contentWorkbenchUnitRequiresKeyframe } from '@/lib/contentWorkbenchUnitTrack'
import {
  contentUnitStoryboardBriefPromptText,
  contentUnitVisualPlanPromptText,
  hasStructuredText,
} from '@/lib/contentUnitPlanningMetadata'
import { publicModelId } from '@/lib/modelDisplay'
import { cn } from '@/lib/utils'
import { toast } from '@/store/toastStore'
import type { Job, PublicModel } from '@/types'
import { Badge, Button, Input, Label, Textarea } from '@movscript/ui'
import { ContentUnitEditSelect } from './ContentUnitEditControls'
import { ContentUnitGenerationInputsPanel } from './ContentUnitGenerationInputsPanel'

export type ContentUnitEditRecord = SemanticEntityRecord & ContentWorkbenchEditRecord & {
  description?: string
  prompt?: string
  title?: string
  name?: string
  kind?: string
  status?: string
  metadata_json?: string
  shot_size?: string
  camera_angle?: string
  camera_motion?: string
  owner_type?: string
  owner_id?: number
  content_unit_id?: number
  scene_moment_id?: number
  production_id?: number
  segment_id?: number
  duration_sec?: number
  resource_id?: number
  slot_key?: string
  __scene_moment_title?: unknown
}

export type ContentUnitEditRow = ContentWorkbenchKeyframePromptRow & {
  id: string
  units: ContentUnitEditRecord[]
  assetSlots: ContentUnitEditRecord[]
  keyframes: ContentUnitEditRecord[]
}

export function ContentUnitEditCards({
  projectId,
  queryKey,
  jobs = [],
  row,
  unit,
  compact = false,
  onSelectUnit,
  onCreateUnit,
  onAiSuggest,
  onAiVisualPlan,
  onCreateAssetSlot,
  onCreateKeyframe,
  onOpenCanvas,
  onUploadMissingAssets,
  onDeleteUnit,
}: {
  projectId?: number
  queryKey?: readonly unknown[]
  jobs?: Job[]
  row: ContentUnitEditRow | null
  unit: ContentUnitEditRecord | null
  compact?: boolean
  onSelectUnit: (unitId: number) => void
  onCreateUnit: () => void
  onAiSuggest?: () => void
  onAiVisualPlan?: () => void
  onCreateAssetSlot?: () => void
  onCreateKeyframe?: () => void
  onOpenCanvas?: () => void
  onUploadMissingAssets?: () => void
  onDeleteUnit?: (unit: ContentUnitEditRecord) => void
}) {
  const queryClient = useQueryClient()
  const contentUnitConfig = useMemo(() => semanticEntityConfig('contentUnits'), [])
  const keyframeConfig = useMemo(() => semanticEntityConfig('keyframes'), [])
  const [draft, setDraft] = useState<ContentUnitEditDraft>(() => contentUnitEditDraftFromRecord(unit))
  const [activeInputDrawer, setActiveInputDrawer] = useState<ContentUnitInputDrawerTab>('generation')
  const [keyframeModelId, setKeyframeModelId] = useState('')
  const { data: imageModels = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', 'image', 'content-workbench-keyframe'],
    queryFn: () => api.get('/models?capability=image&feature=ref_image_gen').then((r) => r.data),
  })
  useEffect(() => {
    if (keyframeModelId && imageModels.some((model) => publicModelId(model) === keyframeModelId)) return
    setKeyframeModelId(imageModels[0] ? publicModelId(imageModels[0]) : '')
  }, [imageModels, keyframeModelId])

  useEffect(() => {
    setDraft(contentUnitEditDraftFromRecord(unit))
    setActiveInputDrawer('generation')
  }, [unit?.ID])

  const assetSlots = row && unit
    ? row.assetSlots.filter((slot) => slot.owner_type === 'content_unit' && Number(slot.owner_id) === unit.ID)
    : []
  const missingSlots = assetSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
  const keyframes = row && unit
    ? row.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID).slice().sort(byOrder)
    : []
  const hasPrompt = Boolean(firstText(draft.prompt, draft.description))
  const visualPlanReady = hasStructuredText(
    draft.visual_plan_space,
    draft.visual_plan_blocking,
    draft.visual_plan_camera_path,
    draft.visual_plan_beats,
    draft.visual_plan_lighting,
  )
  const storyboardBriefReady = hasStructuredText(
    draft.storyboard_purpose,
    draft.storyboard_subject,
    draft.storyboard_composition,
    draft.storyboard_action_moment,
    draft.storyboard_keyframe_suggestions,
  )
  const requiresKeyframe = unit ? contentWorkbenchUnitRequiresKeyframe(unit.kind) : true
  const workStatus = unit ? contentUnitWorkStatus(unit, missingSlots) : 'blocked'
  const blockers = [
    hasPrompt ? '' : '缺提示',
    requiresKeyframe && !visualPlanReady ? '缺视觉调度' : '',
    requiresKeyframe && !storyboardBriefReady ? '缺故事板简述' : '',
    missingSlots.length > 0 ? `${missingSlots.length} 个素材缺口` : '',
    requiresKeyframe && keyframes.length === 0 ? '缺关键帧' : '',
  ].filter(Boolean)
  const unchanged = unit ? contentUnitEditDraftEqualsRecord(draft, unit) : true
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<number | null>(null)
  const selectedKeyframe = keyframes.find((keyframe) => keyframe.ID === selectedKeyframeId) ?? keyframes[0] ?? null
  const [keyframeDraft, setKeyframeDraft] = useState<KeyframeEditDraft>(() => keyframeEditDraftFromRecord(selectedKeyframe))
  const selectedModel = imageModels.find((model) => publicModelId(model) === keyframeModelId) ?? imageModels[0] ?? null
  const unfinishedKeyframes = keyframes.filter((keyframe) => !keyframeHasOutput(keyframe, jobs) && !keyframeHasRunningJob(keyframe, jobs))
  const keyframeUnchanged = selectedKeyframe ? keyframeEditDraftEqualsRecord(keyframeDraft, selectedKeyframe) : true

  useEffect(() => {
    if (keyframes.length === 0) {
      if (selectedKeyframeId !== null) setSelectedKeyframeId(null)
      return
    }
    if (!selectedKeyframeId || !keyframes.some((keyframe) => keyframe.ID === selectedKeyframeId)) {
      setSelectedKeyframeId(keyframes[0].ID)
    }
  }, [keyframes, selectedKeyframeId])

  useEffect(() => {
    setKeyframeDraft(keyframeEditDraftFromRecord(selectedKeyframe))
  }, [selectedKeyframe?.ID])

  const saveUnit = useMutation({
    mutationFn: async () => {
      if (!projectId || !unit) throw new Error('缺少制作项')
      return updateSemanticEntity(projectId, contentUnitConfig, unit.ID, contentUnitEditPayload(draft))
    },
    onSuccess: async (saved) => {
      if (queryKey) await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: [contentUnitConfig.kind, projectId] })
      toast.success('制作项已保存')
      setDraft(contentUnitEditDraftFromRecord(saved))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '制作项保存失败'))
    },
  })

  const deleteUnit = useMutation({
    mutationFn: async () => {
      if (!projectId || !unit) throw new Error('缺少制作项')
      return deleteSemanticEntity(projectId, contentUnitConfig, unit.ID)
    },
    onSuccess: async () => {
      if (queryKey) await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: [contentUnitConfig.kind, projectId] })
      toast.success('制作项已删除')
      if (unit) onDeleteUnit?.(unit)
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '制作项删除失败'))
    },
  })

  const saveKeyframe = useMutation({
    mutationFn: async () => {
      if (!projectId || !selectedKeyframe) throw new Error('缺少关键帧')
      return updateSemanticEntity(projectId, keyframeConfig, selectedKeyframe.ID, keyframeEditPayload(keyframeDraft))
    },
    onSuccess: async (saved) => {
      if (queryKey) await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: [keyframeConfig.kind, projectId] })
      toast.success('关键帧已保存')
      setSelectedKeyframeId(saved.ID)
      setKeyframeDraft(keyframeEditDraftFromRecord(saved))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '关键帧保存失败'))
    },
  })

  const deleteKeyframe = useMutation({
    mutationFn: async (keyframe: ContentUnitEditRecord) => {
      if (!projectId) throw new Error('缺少项目')
      return deleteSemanticEntity(projectId, keyframeConfig, keyframe.ID)
    },
    onSuccess: async (_result, keyframe) => {
      if (queryKey) await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: [keyframeConfig.kind, projectId] })
      toast.success('关键帧已删除')
      const next = keyframes.find((item) => item.ID !== keyframe.ID) ?? null
      setSelectedKeyframeId(next?.ID ?? null)
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '关键帧删除失败'))
    },
  })

  const reorderKeyframe = useMutation({
    mutationFn: async ({ keyframe, direction }: { keyframe: ContentUnitEditRecord; direction: 'up' | 'down' }) => {
      if (!projectId) throw new Error('缺少项目')
      const ordered = keyframes.slice().sort(byOrder)
      const index = ordered.findIndex((item) => item.ID === keyframe.ID)
      const swapIndex = direction === 'up' ? index - 1 : index + 1
      const swap = ordered[swapIndex]
      if (index < 0 || !swap) return []
      const currentOrder = numberOf(keyframe.order) || index + 1
      const swapOrder = numberOf(swap.order) || swapIndex + 1
      return Promise.all([
        updateSemanticEntity(projectId, keyframeConfig, keyframe.ID, { order: swapOrder }),
        updateSemanticEntity(projectId, keyframeConfig, swap.ID, { order: currentOrder }),
      ])
    },
    onSuccess: async () => {
      if (queryKey) await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: [keyframeConfig.kind, projectId] })
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '关键帧顺序更新失败'))
    },
  })

  const generateKeyframes = useMutation({
    mutationFn: async (targets: ContentUnitEditRecord[]) => {
      if (!projectId || !unit || !row) throw new Error('缺少制作项上下文')
      if (!selectedModel) throw new Error('没有可用的图像模型，请先配置图像模型')
      if (targets.length === 0) return []
      const modelId = publicModelId(selectedModel)
      const ordered = keyframes.slice().sort(byOrder)
      const created: Job[] = []
      for (const keyframe of targets) {
        const prompt = buildKeyframeGenerationPrompt({
          row,
          unit,
          keyframe,
          sequence: ordered,
          visualPlan: contentUnitVisualPlanPromptText(unit),
          storyboardBrief: contentUnitStoryboardBriefPromptText(unit),
        })
        const response = await api.post<Job>('/jobs', {
          project_id: projectId,
          model_id: modelId,
          job_type: 'image',
          feature_key: 'ref_image_gen',
          title: `${titleOfRecord(keyframe)} 关键帧生成`,
          prompt,
          aspect_ratio: '16:9',
          extra_params: JSON.stringify({
            source: 'content_workbench_keyframe',
            contentUnitId: unit.ID,
            content_unit_id: unit.ID,
            keyframeId: keyframe.ID,
            keyframe_id: keyframe.ID,
          }),
        }).then((r) => r.data)
        created.push(response)
      }
      return created
    },
    onSuccess: async (created) => {
      if (queryKey) await queryClient.invalidateQueries({ queryKey })
      toast.success(created.length > 1 ? `已创建 ${created.length} 个关键帧生成任务` : '关键帧生成任务已创建')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '关键帧生成失败'))
    },
  })

  function updateDraft(key: keyof ContentUnitEditDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function updateKeyframeDraft(key: keyof KeyframeEditDraft, value: string) {
    setKeyframeDraft((current) => ({ ...current, [key]: value }))
  }

  function removeUnit() {
    if (!unit) return
    if (!window.confirm(`确定删除制作项「${titleOfRecord(unit)}」吗？相关关键帧、素材需求或时间轴引用可能需要后续清理。`)) return
    deleteUnit.mutate()
  }

  function removeKeyframe(keyframe: ContentUnitEditRecord) {
    if (!window.confirm(`确定删除关键帧「${titleOfRecord(keyframe)}」吗？已生成的候选结果不会自动删除。`)) return
    deleteKeyframe.mutate(keyframe)
  }

  if (!row) {
    return (
      <div className="min-h-[180px] bg-background p-3" data-testid="content-workbench-unit-edit-cards">
        <div className="rounded-md border border-dashed border-border px-3 py-8 text-center type-body text-muted-foreground">
          <p className="font-medium text-foreground">先选择一个情节</p>
          <p className="mt-1 type-label leading-5">内容编辑卡片会跟随情节里的制作项显示。</p>
        </div>
      </div>
    )
  }

  if (!unit) {
    return (
      <div className="min-h-[180px] bg-background p-3" data-testid="content-workbench-unit-edit-cards">
        <div className="rounded-md border border-dashed border-border px-3 py-6 type-body text-muted-foreground">
          <p className="font-medium text-foreground">选择或创建制作项</p>
          <p className="mt-1 type-label leading-5">卡片内会编辑标题、时长、创作目标、prompt、素材和关键帧输入。</p>
          {row.units.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {row.units.slice().sort(byOrder).slice(0, 4).map((item) => (
                <Button key={item.ID} size="sm" variant="outline" onClick={() => onSelectUnit(item.ID)}>
                  {titleOfRecord(item)}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={onCreateUnit}>
              <Plus size={13} />
              新建制作项
            </Button>
            {onAiSuggest ? (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onAiSuggest}>
                <Sparkles size={13} />
                让 AI 规划
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[180px] bg-background p-3" data-testid="content-workbench-unit-edit-cards">
      <div className={cn('grid gap-3', compact ? '' : 'xl:grid-cols-[minmax(0,1.05fr)_minmax(300px,.95fr)]')}>
        <section className="rounded-md border border-border bg-card p-3" data-testid="content-workbench-edit-summary-card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(workStatus)}>{statusLabel(workStatus)}</Badge>
                <Badge variant="outline">{trackKindLabel(String(unit.kind ?? ''))}</Badge>
                <Badge variant={requiresKeyframe ? 'secondary' : 'outline'}>{requiresKeyframe ? `${keyframes.length} 关键帧` : '无需关键帧'}</Badge>
              </div>
              <h3 className="mt-2 truncate type-body font-semibold text-foreground">{titleOfRecord(unit)}</h3>
              <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">
                {firstText(unit.__scene_moment_title, row.title)} · {formatDuration(numberOf(unit.duration_sec))}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive"
                disabled={!projectId || deleteUnit.isPending || saveUnit.isPending}
                loading={deleteUnit.isPending}
                onClick={removeUnit}
                data-testid="content-workbench-unit-edit-delete"
              >
                <Trash2 size={13} />
                删除
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={unchanged || saveUnit.isPending || deleteUnit.isPending || !projectId}
                loading={saveUnit.isPending}
                onClick={() => saveUnit.mutate()}
                data-testid="content-workbench-unit-edit-save"
              >
                <CheckCircle2 size={13} />
                保存
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_112px]">
            <div className="space-y-1.5">
              <Label htmlFor={`content-unit-title-${unit.ID}`} className="type-label">标题</Label>
              <Input id={`content-unit-title-${unit.ID}`} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`content-unit-duration-${unit.ID}`} className="type-label">时长秒</Label>
              <Input id={`content-unit-duration-${unit.ID}`} type="number" min="0" value={draft.duration_sec} onChange={(event) => updateDraft('duration_sec', event.target.value)} />
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <ContentUnitEditSelect label="景别" value={draft.shot_size} options={contentUnitEditShotSizeOptions} onChange={(value) => updateDraft('shot_size', value)} />
            <ContentUnitEditSelect label="机位角度" value={draft.camera_angle} options={contentUnitEditCameraAngleOptions} onChange={(value) => updateDraft('camera_angle', value)} />
            <ContentUnitEditSelect label="运镜方式" value={draft.camera_motion} options={contentUnitEditCameraMotionOptions} onChange={(value) => updateDraft('camera_motion', value)} />
            <ContentUnitEditSelect label="状态" value={draft.status} options={contentUnitEditStatusOptions} onChange={(value) => updateDraft('status', value)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {blockers.length > 0 ? blockers.map((item) => (
              <Badge key={item} variant="warning">{item}</Badge>
            )) : <Badge variant="success">核心输入可用</Badge>}
          </div>
        </section>

        <ContentUnitGenerationInputsPanel
          compact={compact}
          unit={unit}
          draft={draft}
          activeInputDrawer={activeInputDrawer}
          assetSlots={assetSlots}
          missingSlots={missingSlots}
          keyframes={keyframes}
          selectedKeyframe={selectedKeyframe}
          keyframeDraft={keyframeDraft}
          jobs={jobs}
          imageModels={imageModels}
          keyframeModelId={keyframeModelId}
          hasSelectedModel={Boolean(selectedModel)}
          unfinishedKeyframes={unfinishedKeyframes}
          requiresKeyframe={requiresKeyframe}
          visualPlanReady={visualPlanReady}
          storyboardBriefReady={storyboardBriefReady}
          hasPrompt={hasPrompt}
          blockers={blockers}
          reorderPending={reorderKeyframe.isPending}
          deletePending={deleteKeyframe.isPending}
          savePending={saveKeyframe.isPending}
          generatePending={generateKeyframes.isPending}
          keyframeUnchanged={keyframeUnchanged}
          onInputDrawerChange={setActiveInputDrawer}
          onDraftChange={(field, value) => updateDraft(field, value)}
          onCreateAssetSlot={onCreateAssetSlot}
          onCreateKeyframe={onCreateKeyframe}
          onUploadMissingAssets={onUploadMissingAssets}
          onOpenCanvas={onOpenCanvas}
          onAiVisualPlan={onAiVisualPlan}
          onSelectKeyframe={setSelectedKeyframeId}
          onMoveKeyframe={(keyframe, direction) => reorderKeyframe.mutate({ keyframe: keyframe as ContentUnitEditRecord, direction })}
          onDeleteKeyframe={(keyframe) => removeKeyframe(keyframe as ContentUnitEditRecord)}
          onSaveKeyframe={() => saveKeyframe.mutate()}
          onKeyframeDraftChange={updateKeyframeDraft}
          onKeyframeModelChange={setKeyframeModelId}
          onGenerateKeyframes={(targets) => generateKeyframes.mutate(targets as ContentUnitEditRecord[])}
        />

        <section className={cn('rounded-md border border-border bg-card p-3', compact ? '' : 'xl:col-span-2')} data-testid="content-workbench-edit-goal-card">
          <div className={cn('grid gap-3', compact ? '' : 'lg:grid-cols-2')}>
            <div className="space-y-1.5">
              <Label htmlFor={`content-unit-description-${unit.ID}`} className="type-label">要做什么</Label>
              <Textarea
                id={`content-unit-description-${unit.ID}`}
                className="min-h-[120px]"
                value={draft.description}
                placeholder="描述这个内容单元要完成的叙事、动作、信息或声音目标。"
                onChange={(event) => updateDraft('description', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`content-unit-prompt-${unit.ID}`} className="type-label">创作提示</Label>
              <Textarea
                id={`content-unit-prompt-${unit.ID}`}
                className="min-h-[120px]"
                value={draft.prompt}
                placeholder="写给生成模型的提示词，包含画面、动作、风格、限制和参考。"
                onChange={(event) => updateDraft('prompt', event.target.value)}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
