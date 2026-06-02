import { Clapperboard, Image, PackageCheck, Play, Plus, Route, Upload } from 'lucide-react'

import {
  type ContentUnitEditWorkspace,
  type ContentUnitInputDrawerTab,
  type ContentWorkbenchEditRecord,
  type KeyframeEditWorkspace,
} from '@/features/content/domain/contentWorkbenchEditModel'
import { firstText } from '@/features/content/domain/contentWorkbenchRecordUtils'
import type { Job, PublicModel } from '@/types'
import {
  ContentWorkbenchGenerationInputSection,
  ContentWorkbenchGenerationReadiness,
  ContentWorkbenchInputActionButton,
  ContentWorkbenchInputActionGroup,
  ContentWorkbenchInputCard,
  ContentWorkbenchInputCardGrid,
  ContentWorkbenchInputDrawer,
  ContentWorkbenchInputDrawerHeader,
  ContentWorkbenchInputDrawerPanel,
  ContentWorkbenchInputDrawerTab,
  ContentWorkbenchInputDrawerTabList,
  StatusBadge,
} from '@movscript/ui'
import { contentGapRecipe, contentOptionalReadinessRecipe, contentReadinessRecipe } from '@/features/content/presentation/contentSemanticUi'
import {
  ContentUnitStoryboardBriefEditor,
  ContentUnitVisualPlanEditor,
  type ContentUnitPlanningField,
} from './ContentUnitPlanningEditors'
import { ContentWorkbenchKeyframeEditor } from './ContentWorkbenchKeyframeEditor'

type ContentUnitGenerationInputRecord = ContentWorkbenchEditRecord & {
  label?: unknown
  slot_key?: unknown
}

export function ContentUnitGenerationInputsPanel({
  compact = false,
  unit,
  workspace,
  activeInputDrawer,
  assetSlots,
  missingSlots,
  keyframes,
  selectedKeyframe,
  keyframeWorkspace,
  jobs,
  imageModels,
  keyframeModelId,
  hasSelectedModel,
  unfinishedKeyframes,
  requiresKeyframe,
  visualPlanReady,
  storyboardBriefReady,
  reorderPending,
  deletePending,
  savePending,
  generatePending,
  keyframeUnchanged,
  onInputDrawerChange,
  onWorkspaceChange,
  onCreateAssetSlot,
  onCreateKeyframe,
  onUploadMissingAssets,
  onOpenCanvas,
  onSelectKeyframe,
  onMoveKeyframe,
  onDeleteKeyframe,
  onSaveKeyframe,
  onKeyframeWorkspaceChange,
  onKeyframeModelChange,
  onGenerateKeyframes,
}: {
  compact?: boolean
  unit: ContentWorkbenchEditRecord
  workspace: ContentUnitEditWorkspace
  activeInputDrawer: ContentUnitInputDrawerTab
  assetSlots: ContentUnitGenerationInputRecord[]
  missingSlots: ContentUnitGenerationInputRecord[]
  keyframes: ContentWorkbenchEditRecord[]
  selectedKeyframe: ContentWorkbenchEditRecord | null
  keyframeWorkspace: KeyframeEditWorkspace
  jobs: Job[]
  imageModels: PublicModel[]
  keyframeModelId: string
  hasSelectedModel: boolean
  unfinishedKeyframes: ContentWorkbenchEditRecord[]
  requiresKeyframe: boolean
  visualPlanReady: boolean
  storyboardBriefReady: boolean
  reorderPending: boolean
  deletePending: boolean
  savePending: boolean
  generatePending: boolean
  keyframeUnchanged: boolean
  onInputDrawerChange: (tab: ContentUnitInputDrawerTab) => void
  onWorkspaceChange: (field: ContentUnitPlanningField, value: string) => void
  onCreateAssetSlot?: () => void
  onCreateKeyframe?: () => void
  onUploadMissingAssets?: () => void
  onOpenCanvas?: () => void
  onSelectKeyframe: (keyframeId: number) => void
  onMoveKeyframe: (keyframe: ContentWorkbenchEditRecord, direction: 'up' | 'down') => void
  onDeleteKeyframe: (keyframe: ContentWorkbenchEditRecord) => void
  onSaveKeyframe: () => void
  onKeyframeWorkspaceChange: (key: keyof KeyframeEditWorkspace, value: string) => void
  onKeyframeModelChange: (modelId: string) => void
  onGenerateKeyframes: (targets: ContentWorkbenchEditRecord[]) => void
}) {
  const visualPlanTone = inputToneFromRecipe(contentOptionalReadinessRecipe(visualPlanReady, requiresKeyframe))
  const storyboardTone = inputToneFromRecipe(contentReadinessRecipe(storyboardBriefReady))
  const keyframeTone = inputToneFromRecipe(contentOptionalReadinessRecipe(keyframes.length > 0, requiresKeyframe))

  return (
    <>
      <ContentWorkbenchGenerationInputSection
        action={<StatusBadge {...contentGapRecipe(missingSlots.length)}>{assetSlots.length} 素材 / {missingSlots.length} 缺口</StatusBadge>}
      >
        <ContentWorkbenchInputCardGrid>
          <ContentWorkbenchInputCard
            data-testid="content-workbench-blocking-input-card"
            icon={<Route size={14} />}
            title="调度图"
            badge={visualPlanReady ? '已填写' : requiresKeyframe ? '建议补齐' : '非视觉项'}
            badgeTone={visualPlanTone}
            detail={visualPlanReady ? firstText(workspace.visual_task_graph_blocking, workspace.visual_task_graph_camera_path, workspace.visual_task_graph_space) : requiresKeyframe ? '空间、相机路径、人物、道具、光位和停点。' : '当前制作项不强制调度图。'}
            status={visualPlanReady ? '可用于生成' : '待填写'}
            tone={visualPlanTone}
            onOpen={() => onInputDrawerChange('blocking')}
          />
          <ContentWorkbenchInputCard
            data-testid="content-workbench-storyboard-input-card"
            icon={<Clapperboard size={14} />}
            title="故事板"
            badge={storyboardBriefReady ? '已填写' : '建议补齐'}
            badgeTone={storyboardTone}
            detail={storyboardBriefReady ? firstText(workspace.storyboard_purpose, workspace.storyboard_composition, workspace.storyboard_action_moment) : '单张叙事确认图，用于先判断画面是否讲对。'}
            status={storyboardBriefReady ? '可用于关键帧' : '待填写'}
            tone={storyboardTone}
            onOpen={() => onInputDrawerChange('storyboard')}
          />
          <ContentWorkbenchInputCard
            data-testid="content-workbench-keyframe-input-card"
            icon={<Image size={14} />}
            title="关键帧"
            badge={requiresKeyframe ? `${keyframes.length} 帧` : '非必需'}
            badgeTone={keyframeTone}
            detail={keyframes[0] ? keyframes.slice(0, 2).map(recordTitle).join('、') : requiresKeyframe ? '建议补首帧和尾帧。' : '当前类型不强制关键帧。'}
            status={keyframes.length > 0 ? '已有锚点' : '待创建'}
            tone={keyframeTone}
            onOpen={() => onInputDrawerChange('keyframes')}
            action={onCreateKeyframe ? (
              <ContentWorkbenchInputActionButton variant="outline" onClick={onCreateKeyframe}>
                <Plus size={14} />
                添加
              </ContentWorkbenchInputActionButton>
            ) : undefined}
          />
          <ContentWorkbenchInputCard
            data-testid="content-workbench-asset-input-card"
            icon={<PackageCheck size={14} />}
            title="素材需求"
            badge={`${assetSlots.length} 项`}
            badgeTone={missingSlots.length > 0 ? 'warning' : 'success'}
            detail={missingSlots[0] ? `优先补齐：${recordTitle(missingSlots[0])}` : '没有显性素材缺口。'}
            status={missingSlots.length > 0 ? `${missingSlots.length} 缺口` : '可用'}
            tone={missingSlots.length > 0 ? 'warning' : 'success'}
            onOpen={() => onInputDrawerChange('generation')}
            action={(
              <ContentWorkbenchInputActionGroup>
                {missingSlots.length > 0 && onUploadMissingAssets ? (
                  <ContentWorkbenchInputActionButton variant="outline" onClick={onUploadMissingAssets}>
                    <Upload size={14} />
                    上传
                  </ContentWorkbenchInputActionButton>
                ) : null}
                {onCreateAssetSlot ? (
                  <ContentWorkbenchInputActionButton variant="outline" onClick={onCreateAssetSlot}>
                    <Plus size={14} />
                    添加
                  </ContentWorkbenchInputActionButton>
                ) : null}
              </ContentWorkbenchInputActionGroup>
            )}
          />
          <ContentWorkbenchInputCard
            data-testid="content-workbench-canvas-input-card"
            icon={<Play size={14} />}
            title="生成画布"
            badge="执行"
            badgeTone="neutral"
            detail="把当前制作项和已补输入带入生成流程。"
            status="可打开"
            tone="default"
            onOpen={() => onInputDrawerChange('generation')}
            action={onOpenCanvas ? (
              <ContentWorkbenchInputActionButton onClick={onOpenCanvas}>
                <Play size={14} />
                打开
              </ContentWorkbenchInputActionButton>
            ) : undefined}
          />
        </ContentWorkbenchInputCardGrid>
      </ContentWorkbenchGenerationInputSection>

      <ContentWorkbenchInputDrawer compact={compact}>
        <ContentWorkbenchInputDrawerHeader
          title={compact ? '制作输入' : '输入抽屉'}
          description={compact
            ? '当前制作项的生成、关键帧、故事板和调度图都在右侧 Inspector 内编辑。'
            : '在当前制作项内切换生成、关键帧、故事板和调度图，不打断上方内容编辑。'}
          tabs={(
            <ContentWorkbenchInputDrawerTabList>
              {[
                { key: 'generation', label: '生成' },
                { key: 'keyframes', label: '关键帧' },
                { key: 'storyboard', label: '故事板' },
                { key: 'blocking', label: '调度图' },
              ].map((tab) => (
                <ContentWorkbenchInputDrawerTab
                  key={tab.key}
                  active={activeInputDrawer === tab.key}
                  data-testid={`content-workbench-input-drawer-tab-${tab.key}`}
                  onClick={() => onInputDrawerChange(tab.key as ContentUnitInputDrawerTab)}
                >
                  {tab.label}
                </ContentWorkbenchInputDrawerTab>
              ))}
            </ContentWorkbenchInputDrawerTabList>
          )}
        />

        <ContentWorkbenchInputDrawerPanel data-testid={`content-workbench-input-drawer-panel-${activeInputDrawer}`}>
          {activeInputDrawer === 'generation' ? (
            <ContentWorkbenchGenerationReadiness
              summary="当前制作项输入在上方卡片管理，可继续打开生成画布。"
              action={onOpenCanvas ? (
                <ContentWorkbenchInputActionButton onClick={onOpenCanvas}>
                  <Play size={14} />
                  打开生成画布
                </ContentWorkbenchInputActionButton>
              ) : undefined}
            />
          ) : null}

          {activeInputDrawer === 'keyframes' ? (
            <ContentWorkbenchKeyframeEditor
              compact={compact}
              keyframes={keyframes}
              selectedKeyframe={selectedKeyframe}
              keyframeWorkspace={keyframeWorkspace}
              jobs={jobs}
              unit={unit}
              requiresKeyframe={requiresKeyframe}
              imageModels={imageModels}
              keyframeModelId={keyframeModelId}
              hasSelectedModel={hasSelectedModel}
              unfinishedKeyframes={unfinishedKeyframes}
              reorderPending={reorderPending}
              deletePending={deletePending}
              savePending={savePending}
              generatePending={generatePending}
              keyframeUnchanged={keyframeUnchanged}
              onCreateKeyframe={onCreateKeyframe}
              onSelectKeyframe={onSelectKeyframe}
              onMoveKeyframe={onMoveKeyframe}
              onDeleteKeyframe={onDeleteKeyframe}
              onSaveKeyframe={onSaveKeyframe}
              onWorkspaceChange={onKeyframeWorkspaceChange}
              onModelChange={onKeyframeModelChange}
              onGenerateKeyframes={onGenerateKeyframes}
            />
          ) : null}

          {activeInputDrawer === 'storyboard' ? (
            <ContentUnitStoryboardBriefEditor
              unitId={unit.ID}
              value={{
                purpose: workspace.storyboard_purpose,
                subject: workspace.storyboard_subject,
                composition: workspace.storyboard_composition,
                actionMoment: workspace.storyboard_action_moment,
                emotion: workspace.storyboard_emotion,
                keyframeSuggestions: workspace.storyboard_keyframe_suggestions,
              }}
              ready={storyboardBriefReady}
              onFieldChange={onWorkspaceChange}
            />
          ) : null}

          {activeInputDrawer === 'blocking' ? (
            <ContentUnitVisualPlanEditor
              unitId={unit.ID}
              value={{
                space: workspace.visual_task_graph_space,
                blocking: workspace.visual_task_graph_blocking,
                cameraPath: workspace.visual_task_graph_camera_path,
                beats: workspace.visual_task_graph_beats,
                props: workspace.visual_task_graph_props,
                lighting: workspace.visual_task_graph_lighting,
                risks: workspace.visual_task_graph_risks,
              }}
              ready={visualPlanReady}
              requiresKeyframe={requiresKeyframe}
              onFieldChange={onWorkspaceChange}
            />
          ) : null}
        </ContentWorkbenchInputDrawerPanel>
      </ContentWorkbenchInputDrawer>
    </>
  )
}

function recordTitle(record: ContentUnitGenerationInputRecord) {
  return firstText(record.title, record.name, record.label, record.slot_key, `${record.kind || '记录'} #${record.ID}`)
}

function inputToneFromRecipe(recipe: { intent: string }): 'default' | 'neutral' | 'success' | 'warning' {
  if (recipe.intent === 'success') return 'success'
  if (recipe.intent === 'warning') return 'warning'
  if (recipe.intent === 'neutral') return 'neutral'
  return 'default'
}
