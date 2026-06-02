import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'

import {
  deleteSemanticEntity,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityRecord,
} from '@/shared/infrastructure/api/semanticEntities'
import { api } from '@/shared/infrastructure/api'
import {
  buildKeyframeGenerationPrompt,
  contentUnitEditCameraAngleOptions,
  contentUnitEditCameraMotionOptions,
  contentUnitEditWorkspaceEqualsRecord,
  contentUnitEditWorkspaceFromRecord,
  contentUnitEditPayload,
  contentUnitEditShotSizeOptions,
  keyframeEditWorkspaceEqualsRecord,
  keyframeEditWorkspaceFromRecord,
  keyframeEditPayload,
  keyframeHasOutput,
  keyframeHasRunningJob,
  type ContentUnitEditWorkspace,
  type ContentWorkbenchEditRecord,
  type ContentWorkbenchKeyframePromptRow,
  type ContentUnitInputDrawerTab,
  type KeyframeEditWorkspace,
} from '@/features/content/domain/contentWorkbenchEditModel'
import { trackKindLabel } from '@/features/content/domain/contentWorkbenchLabels'
import { byOrder, firstText, formatDuration, numberOf, titleOfRecord } from '@/features/content/domain/contentWorkbenchRecordUtils'
import { apiErrorMessage, contentUnitWorkStatus, normalizeAssetSlotStatus, statusLabel } from '@/features/content/domain/contentWorkbenchStatus'
import { contentGapRecipe, contentWorkbenchStatusRecipe } from '@/features/content/presentation/contentSemanticUi'
import { contentWorkbenchUnitRequiresKeyframe } from '@/features/content/domain/contentWorkbenchUnitTrack'
import {
  contentUnitStoryboardBriefPromptText,
  contentUnitVisualPlanPromptText,
  hasStructuredText,
} from '@/features/content/domain/contentUnitPlanningMetadata'
import { publicModelId } from '@/shared/domain/modelDisplay'
import { toast } from '@/shared/ui/toastStore'
import type { Job, PublicModel } from '@/types'
import {
  Badge,
  ContentWorkbenchEditorField,
  ContentWorkbenchEditorFieldGrid,
  ContentWorkbenchEditorSelectField,
  ContentWorkbenchUnitEditActionButton,
  ContentWorkbenchUnitEditActionRow,
  ContentWorkbenchUnitEditBlockerRow,
  ContentWorkbenchUnitEditEmptyState,
  ContentWorkbenchUnitEditGrid,
  ContentWorkbenchUnitEditRoot,
  ContentWorkbenchUnitEditSection,
  ContentWorkbenchUnitEditTextarea,
  ContentWorkbenchUnitSummaryHeader,
  Input,
  StatusBadge,
} from '@movscript/ui'
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
  onCreateAssetSlot?: () => void
  onCreateKeyframe?: () => void
  onOpenCanvas?: () => void
  onUploadMissingAssets?: () => void
  onDeleteUnit?: (unit: ContentUnitEditRecord) => void
}) {
  const queryClient = useQueryClient()
  const contentUnitConfig = useMemo(() => semanticEntityConfig('contentUnits'), [])
  const keyframeConfig = useMemo(() => semanticEntityConfig('keyframes'), [])
  const [workspace, setWorkspace] = useState<ContentUnitEditWorkspace>(() => contentUnitEditWorkspaceFromRecord(unit))
  const [activeInputDrawer, setActiveInputDrawer] = useState<ContentUnitInputDrawerTab>('generation')
  const [keyframeModelId, setKeyframeModelId] = useState('')
  const { data: imageModels = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', 'image', 'content-workbench-keyframe'],
    queryFn: () => api.get('/models?capability=image').then((r) => r.data),
  })
  useEffect(() => {
    if (keyframeModelId && imageModels.some((model) => publicModelId(model) === keyframeModelId)) return
    setKeyframeModelId(imageModels[0] ? publicModelId(imageModels[0]) : '')
  }, [imageModels, keyframeModelId])

  useEffect(() => {
    setWorkspace(contentUnitEditWorkspaceFromRecord(unit))
    setActiveInputDrawer('generation')
  }, [unit?.ID])

  const assetSlots = row && unit
    ? row.assetSlots.filter((slot) => slot.owner_type === 'content_unit' && Number(slot.owner_id) === unit.ID)
    : []
  const missingSlots = assetSlots.filter((slot) => normalizeAssetSlotStatus(slot.status) === 'missing')
  const keyframes = row && unit
    ? row.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unit.ID).slice().sort(byOrder)
    : []
  const visualPlanReady = hasStructuredText(
    workspace.visual_task_graph_space,
    workspace.visual_task_graph_blocking,
    workspace.visual_task_graph_camera_path,
    workspace.visual_task_graph_beats,
    workspace.visual_task_graph_lighting,
  )
  const storyboardBriefReady = hasStructuredText(
    workspace.storyboard_purpose,
    workspace.storyboard_subject,
    workspace.storyboard_composition,
    workspace.storyboard_action_moment,
    workspace.storyboard_keyframe_suggestions,
  )
  const requiresKeyframe = unit ? contentWorkbenchUnitRequiresKeyframe(unit.kind) : true
  const workStatus = unit ? contentUnitWorkStatus(unit, missingSlots) : 'blocked'
  const unchanged = unit ? contentUnitEditWorkspaceEqualsRecord(workspace, unit) : true
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<number | null>(null)
  const selectedKeyframe = keyframes.find((keyframe) => keyframe.ID === selectedKeyframeId) ?? keyframes[0] ?? null
  const [keyframeWorkspace, setKeyframeWorkspace] = useState<KeyframeEditWorkspace>(() => keyframeEditWorkspaceFromRecord(selectedKeyframe))
  const selectedModel = imageModels.find((model) => publicModelId(model) === keyframeModelId) ?? imageModels[0] ?? null
  const unfinishedKeyframes = keyframes.filter((keyframe) => !keyframeHasOutput(keyframe, jobs) && !keyframeHasRunningJob(keyframe, jobs))
  const keyframeUnchanged = selectedKeyframe ? keyframeEditWorkspaceEqualsRecord(keyframeWorkspace, selectedKeyframe) : true

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
    setKeyframeWorkspace(keyframeEditWorkspaceFromRecord(selectedKeyframe))
  }, [selectedKeyframe?.ID])

  const saveUnit = useMutation({
    mutationFn: async () => {
      if (!projectId || !unit) throw new Error('缺少制作项')
      return updateSemanticEntity(projectId, contentUnitConfig, unit.ID, contentUnitEditPayload(workspace))
    },
    onSuccess: async (saved) => {
      if (queryKey) await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: [contentUnitConfig.kind, projectId] })
      toast.success('制作项已保存')
      setWorkspace(contentUnitEditWorkspaceFromRecord(saved))
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
      return updateSemanticEntity(projectId, keyframeConfig, selectedKeyframe.ID, keyframeEditPayload(keyframeWorkspace))
    },
    onSuccess: async (saved) => {
      if (queryKey) await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: [keyframeConfig.kind, projectId] })
      toast.success('关键帧已保存')
      setSelectedKeyframeId(saved.ID)
      setKeyframeWorkspace(keyframeEditWorkspaceFromRecord(saved))
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
          visualTaskGraph: contentUnitVisualPlanPromptText(unit),
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

  function updateWorkspace(key: keyof ContentUnitEditWorkspace, value: string) {
    setWorkspace((current) => ({ ...current, [key]: value }))
  }

  function updateKeyframeWorkspace(key: keyof KeyframeEditWorkspace, value: string) {
    setKeyframeWorkspace((current) => ({ ...current, [key]: value }))
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
      <ContentWorkbenchUnitEditRoot data-testid="content-workbench-unit-edit-cards">
        <ContentWorkbenchUnitEditEmptyState title="先选择一个情节" detail="内容编辑卡片会跟随情节里的制作项显示。" />
      </ContentWorkbenchUnitEditRoot>
    )
  }

  if (!unit) {
    return (
      <ContentWorkbenchUnitEditRoot data-testid="content-workbench-unit-edit-cards">
        <ContentWorkbenchUnitEditEmptyState
          title="选择或创建制作项"
          detail="卡片内会编辑标题、时长、镜头参数、素材和关键帧输入。"
          action={(
            <ContentWorkbenchUnitEditActionRow>
              {row.units.slice().sort(byOrder).slice(0, 4).map((item) => (
                <ContentWorkbenchUnitEditActionButton key={item.ID} variant="outline" onClick={() => onSelectUnit(item.ID)}>
                  {titleOfRecord(item)}
                </ContentWorkbenchUnitEditActionButton>
              ))}
              <ContentWorkbenchUnitEditActionButton onClick={onCreateUnit}>
                <Plus size={14} />
                新建制作项
              </ContentWorkbenchUnitEditActionButton>
            </ContentWorkbenchUnitEditActionRow>
          )}
        />
      </ContentWorkbenchUnitEditRoot>
    )
  }

  return (
    <ContentWorkbenchUnitEditRoot data-testid="content-workbench-unit-edit-cards">
      <ContentWorkbenchUnitEditGrid compact={compact}>
        <ContentWorkbenchUnitEditSection data-testid="content-workbench-edit-summary-card">
          <ContentWorkbenchUnitSummaryHeader
            badges={(
              <>
                <StatusBadge {...contentWorkbenchStatusRecipe(workStatus)}>{statusLabel(workStatus)}</StatusBadge>
                <Badge variant="outline">{trackKindLabel(String(unit.kind ?? ''))}</Badge>
                <Badge variant={requiresKeyframe ? 'soft' : 'outline'}>{requiresKeyframe ? `${keyframes.length} 关键帧` : '无需关键帧'}</Badge>
              </>
            )}
            title={titleOfRecord(unit)}
            meta={`${firstText(unit.__scene_moment_title, row.title)} · ${formatDuration(numberOf(unit.duration_sec))}`}
            actions={(
              <>
              <ContentWorkbenchUnitEditActionButton
                variant="outline"
                tone="danger"
                disabled={!projectId || deleteUnit.isPending || saveUnit.isPending}
                loading={deleteUnit.isPending}
                onClick={removeUnit}
                data-testid="content-workbench-unit-edit-delete"
              >
                <Trash2 size={14} />
                删除
              </ContentWorkbenchUnitEditActionButton>
              <ContentWorkbenchUnitEditActionButton
                disabled={unchanged || saveUnit.isPending || deleteUnit.isPending || !projectId}
                loading={saveUnit.isPending}
                onClick={() => saveUnit.mutate()}
                data-testid="content-workbench-unit-edit-save"
              >
                <CheckCircle2 size={14} />
                保存
              </ContentWorkbenchUnitEditActionButton>
              </>
            )}
          />
          <ContentWorkbenchEditorFieldGrid variant="unit-title">
            <ContentWorkbenchEditorField label="标题" htmlFor={`content-unit-title-${unit.ID}`}>
              <Input id={`content-unit-title-${unit.ID}`} value={workspace.title} onChange={(event) => updateWorkspace('title', event.target.value)} />
            </ContentWorkbenchEditorField>
            <ContentWorkbenchEditorField label="时长秒" htmlFor={`content-unit-duration-${unit.ID}`}>
              <Input id={`content-unit-duration-${unit.ID}`} type="number" min="0" value={workspace.duration_sec} onChange={(event) => updateWorkspace('duration_sec', event.target.value)} />
            </ContentWorkbenchEditorField>
          </ContentWorkbenchEditorFieldGrid>
          <ContentWorkbenchEditorFieldGrid>
            <ContentWorkbenchEditorSelectField label="景别" value={workspace.shot_size} options={contentUnitEditShotSizeOptions} onChange={(value) => updateWorkspace('shot_size', value)} />
            <ContentWorkbenchEditorSelectField label="机位角度" value={workspace.camera_angle} options={contentUnitEditCameraAngleOptions} onChange={(value) => updateWorkspace('camera_angle', value)} />
            <ContentWorkbenchEditorSelectField label="运镜方式" value={workspace.camera_motion} options={contentUnitEditCameraMotionOptions} onChange={(value) => updateWorkspace('camera_motion', value)} />
          </ContentWorkbenchEditorFieldGrid>
          <ContentWorkbenchEditorFieldGrid>
            <ContentWorkbenchEditorField label="描述" htmlFor={`content-unit-description-${unit.ID}`}>
              <ContentWorkbenchUnitEditTextarea
                id={`content-unit-description-${unit.ID}`}
                compact={compact}
                value={workspace.description}
                onChange={(event) => updateWorkspace('description', event.target.value)}
              />
            </ContentWorkbenchEditorField>
            <ContentWorkbenchEditorField label="生成提示" htmlFor={`content-unit-prompt-${unit.ID}`}>
              <ContentWorkbenchUnitEditTextarea
                id={`content-unit-prompt-${unit.ID}`}
                compact={compact}
                value={workspace.prompt}
                onChange={(event) => updateWorkspace('prompt', event.target.value)}
              />
            </ContentWorkbenchEditorField>
          </ContentWorkbenchEditorFieldGrid>
          <ContentWorkbenchUnitEditBlockerRow>
            <StatusBadge {...contentGapRecipe(missingSlots.length)}>{missingSlots.length > 0 ? `${missingSlots.length} 个素材缺口` : '素材齐备'}</StatusBadge>
            <Badge variant={unfinishedKeyframes.length > 0 ? 'soft' : 'outline'}>{unfinishedKeyframes.length > 0 ? `${unfinishedKeyframes.length} 个关键帧待完成` : '关键帧齐备'}</Badge>
          </ContentWorkbenchUnitEditBlockerRow>
        </ContentWorkbenchUnitEditSection>

        <ContentUnitGenerationInputsPanel
          compact={compact}
          unit={unit}
          workspace={workspace}
          activeInputDrawer={activeInputDrawer}
          assetSlots={assetSlots}
          missingSlots={missingSlots}
          keyframes={keyframes}
          selectedKeyframe={selectedKeyframe}
          keyframeWorkspace={keyframeWorkspace}
          jobs={jobs}
          imageModels={imageModels}
          keyframeModelId={keyframeModelId}
          hasSelectedModel={Boolean(selectedModel)}
          unfinishedKeyframes={unfinishedKeyframes}
          requiresKeyframe={requiresKeyframe}
          visualPlanReady={visualPlanReady}
          storyboardBriefReady={storyboardBriefReady}
          reorderPending={reorderKeyframe.isPending}
          deletePending={deleteKeyframe.isPending}
          savePending={saveKeyframe.isPending}
          generatePending={generateKeyframes.isPending}
          keyframeUnchanged={keyframeUnchanged}
          onInputDrawerChange={setActiveInputDrawer}
          onWorkspaceChange={(field, value) => updateWorkspace(field, value)}
          onCreateAssetSlot={onCreateAssetSlot}
          onCreateKeyframe={onCreateKeyframe}
          onUploadMissingAssets={onUploadMissingAssets}
          onOpenCanvas={onOpenCanvas}
          onSelectKeyframe={setSelectedKeyframeId}
          onMoveKeyframe={(keyframe, direction) => reorderKeyframe.mutate({ keyframe: keyframe as ContentUnitEditRecord, direction })}
          onDeleteKeyframe={(keyframe) => removeKeyframe(keyframe as ContentUnitEditRecord)}
          onSaveKeyframe={() => saveKeyframe.mutate()}
          onKeyframeWorkspaceChange={updateKeyframeWorkspace}
          onKeyframeModelChange={setKeyframeModelId}
          onGenerateKeyframes={(targets) => generateKeyframes.mutate(targets as ContentUnitEditRecord[])}
        />
      </ContentWorkbenchUnitEditGrid>
    </ContentWorkbenchUnitEditRoot>
  )
}
