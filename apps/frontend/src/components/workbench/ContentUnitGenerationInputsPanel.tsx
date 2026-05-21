import { Clapperboard, Image, PackageCheck, Play, Plus, Route, Upload } from 'lucide-react'

import {
  type ContentUnitEditDraft,
  type ContentUnitInputDrawerTab,
  type ContentWorkbenchEditRecord,
  type KeyframeEditDraft,
} from '@/lib/contentWorkbenchEditModel'
import { firstText } from '@/lib/contentWorkbenchRecordUtils'
import { cn } from '@/lib/utils'
import type { Job, PublicModel } from '@/types'
import { Badge, Button } from '@movscript/ui'
import { ContentUnitGenerationInputCard } from './ContentUnitEditControls'
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
  draft,
  activeInputDrawer,
  assetSlots,
  missingSlots,
  keyframes,
  selectedKeyframe,
  keyframeDraft,
  jobs,
  imageModels,
  keyframeModelId,
  hasSelectedModel,
  unfinishedKeyframes,
  requiresKeyframe,
  visualPlanReady,
  storyboardBriefReady,
  hasPrompt,
  blockers,
  reorderPending,
  deletePending,
  savePending,
  generatePending,
  keyframeUnchanged,
  onInputDrawerChange,
  onDraftChange,
  onCreateAssetSlot,
  onCreateKeyframe,
  onUploadMissingAssets,
  onOpenCanvas,
  onAiVisualPlan,
  onSelectKeyframe,
  onMoveKeyframe,
  onDeleteKeyframe,
  onSaveKeyframe,
  onKeyframeDraftChange,
  onKeyframeModelChange,
  onGenerateKeyframes,
}: {
  compact?: boolean
  unit: ContentWorkbenchEditRecord
  draft: ContentUnitEditDraft
  activeInputDrawer: ContentUnitInputDrawerTab
  assetSlots: ContentUnitGenerationInputRecord[]
  missingSlots: ContentUnitGenerationInputRecord[]
  keyframes: ContentWorkbenchEditRecord[]
  selectedKeyframe: ContentWorkbenchEditRecord | null
  keyframeDraft: KeyframeEditDraft
  jobs: Job[]
  imageModels: PublicModel[]
  keyframeModelId: string
  hasSelectedModel: boolean
  unfinishedKeyframes: ContentWorkbenchEditRecord[]
  requiresKeyframe: boolean
  visualPlanReady: boolean
  storyboardBriefReady: boolean
  hasPrompt: boolean
  blockers: string[]
  reorderPending: boolean
  deletePending: boolean
  savePending: boolean
  generatePending: boolean
  keyframeUnchanged: boolean
  onInputDrawerChange: (tab: ContentUnitInputDrawerTab) => void
  onDraftChange: (field: ContentUnitPlanningField, value: string) => void
  onCreateAssetSlot?: () => void
  onCreateKeyframe?: () => void
  onUploadMissingAssets?: () => void
  onOpenCanvas?: () => void
  onAiVisualPlan?: () => void
  onSelectKeyframe: (keyframeId: number) => void
  onMoveKeyframe: (keyframe: ContentWorkbenchEditRecord, direction: 'up' | 'down') => void
  onDeleteKeyframe: (keyframe: ContentWorkbenchEditRecord) => void
  onSaveKeyframe: () => void
  onKeyframeDraftChange: (key: keyof KeyframeEditDraft, value: string) => void
  onKeyframeModelChange: (modelId: string) => void
  onGenerateKeyframes: (targets: ContentWorkbenchEditRecord[]) => void
}) {
  return (
    <>
      <section className="rounded-md border border-border bg-card p-3" data-testid="content-workbench-edit-inputs-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="type-body font-semibold text-foreground">生成输入</p>
            <p className="mt-1 type-label leading-5 text-muted-foreground">调度图、故事板、关键帧、素材需求和生成画布都绑定到当前制作项。</p>
          </div>
          <Badge variant={missingSlots.length > 0 ? 'warning' : 'success'}>{assetSlots.length} 素材 / {missingSlots.length} 缺口</Badge>
        </div>
        <div className="mt-3 grid gap-2" data-testid="content-workbench-generation-input-cards">
          <ContentUnitGenerationInputCard
            testId="content-workbench-blocking-input-card"
            icon={Route}
            title="调度图"
            badge={visualPlanReady ? '已填写' : requiresKeyframe ? '建议补齐' : '非视觉项'}
            badgeVariant={visualPlanReady ? 'success' : requiresKeyframe ? 'warning' : 'secondary'}
            detail={visualPlanReady ? firstText(draft.visual_plan_blocking, draft.visual_plan_camera_path, draft.visual_plan_space) : requiresKeyframe ? '空间、相机路径、人物、道具、光位和停点。' : '当前制作项不强制调度图。'}
            status={visualPlanReady ? '可用于生成' : '待填写'}
            tone={visualPlanReady ? 'success' : requiresKeyframe ? 'warning' : 'default'}
            onOpen={() => onInputDrawerChange('blocking')}
          />
          <ContentUnitGenerationInputCard
            testId="content-workbench-storyboard-input-card"
            icon={Clapperboard}
            title="故事板"
            badge={storyboardBriefReady ? '已填写' : '建议补齐'}
            badgeVariant={storyboardBriefReady ? 'success' : 'warning'}
            detail={storyboardBriefReady ? firstText(draft.storyboard_purpose, draft.storyboard_composition, draft.storyboard_action_moment) : '单张叙事确认图，用于先判断画面是否讲对。'}
            status={storyboardBriefReady ? '可用于关键帧' : '待填写'}
            tone={storyboardBriefReady ? 'success' : 'warning'}
            onOpen={() => onInputDrawerChange('storyboard')}
          />
          <ContentUnitGenerationInputCard
            testId="content-workbench-keyframe-input-card"
            icon={Image}
            title="关键帧"
            badge={requiresKeyframe ? `${keyframes.length} 帧` : '非必需'}
            badgeVariant={requiresKeyframe && keyframes.length === 0 ? 'warning' : 'success'}
            detail={keyframes[0] ? keyframes.slice(0, 2).map(recordTitle).join('、') : requiresKeyframe ? '建议补首帧和尾帧。' : '当前类型不强制关键帧。'}
            status={keyframes.length > 0 ? '已有锚点' : '待创建'}
            tone={requiresKeyframe && keyframes.length === 0 ? 'warning' : 'success'}
            onOpen={() => onInputDrawerChange('keyframes')}
            action={onCreateKeyframe ? (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onCreateKeyframe}>
                <Plus size={13} />
                添加
              </Button>
            ) : undefined}
          />
          <ContentUnitGenerationInputCard
            testId="content-workbench-asset-input-card"
            icon={PackageCheck}
            title="素材需求"
            badge={`${assetSlots.length} 项`}
            badgeVariant={missingSlots.length > 0 ? 'warning' : 'success'}
            detail={missingSlots[0] ? `优先补齐：${recordTitle(missingSlots[0])}` : '没有显性素材缺口。'}
            status={missingSlots.length > 0 ? `${missingSlots.length} 缺口` : '可用'}
            tone={missingSlots.length > 0 ? 'warning' : 'success'}
            onOpen={() => onInputDrawerChange('generation')}
            action={(
              <span className="flex flex-wrap gap-2">
                {missingSlots.length > 0 && onUploadMissingAssets ? (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={onUploadMissingAssets}>
                    <Upload size={13} />
                    上传
                  </Button>
                ) : null}
                {onCreateAssetSlot ? (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={onCreateAssetSlot}>
                    <Plus size={13} />
                    添加
                  </Button>
                ) : null}
              </span>
            )}
          />
          <ContentUnitGenerationInputCard
            testId="content-workbench-canvas-input-card"
            icon={Play}
            title="生成画布"
            badge="执行"
            badgeVariant="secondary"
            detail="把当前制作项和已补输入带入生成流程。"
            status="可打开"
            tone="default"
            onOpen={() => onInputDrawerChange('generation')}
            action={onOpenCanvas ? (
              <Button size="sm" className="gap-1.5" onClick={onOpenCanvas}>
                <Play size={13} />
                打开
              </Button>
            ) : undefined}
          />
        </div>
      </section>

      <section className={cn('rounded-md border border-border bg-muted/20 p-3', compact ? '' : 'xl:col-span-2')} data-testid="content-workbench-input-drawer">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="type-body font-semibold text-foreground">{compact ? '制作输入' : '输入抽屉'}</p>
            <p className="mt-1 type-label leading-5 text-muted-foreground">
              {compact
                ? '当前制作项的生成、关键帧、故事板和调度图都在右侧 Inspector 内编辑。'
                : '在当前制作项内切换生成、关键帧、故事板和调度图，不打断上方内容编辑。'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="制作项输入类型">
            {[
              { key: 'generation', label: '生成' },
              { key: 'keyframes', label: '关键帧' },
              { key: 'storyboard', label: '故事板' },
              { key: 'blocking', label: '调度图' },
            ].map((tab) => (
              <Button
                key={tab.key}
                type="button"
                size="sm"
                variant={activeInputDrawer === tab.key ? 'secondary' : 'ghost'}
               
                role="tab"
                aria-selected={activeInputDrawer === tab.key}
                data-testid={`content-workbench-input-drawer-tab-${tab.key}`}
                onClick={() => onInputDrawerChange(tab.key as ContentUnitInputDrawerTab)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-md border border-border bg-card p-3" data-testid={`content-workbench-input-drawer-panel-${activeInputDrawer}`}>
          {activeInputDrawer === 'generation' ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <p className="type-label font-medium text-foreground">生成准备</p>
                <p className="mt-1 type-label leading-5 text-muted-foreground">
                  {blockers.length > 0 ? `先处理：${blockers.join('、')}` : '当前制作项已有可进入生成的核心输入。'}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant={hasPrompt ? 'success' : 'warning'}>{hasPrompt ? '有提示' : '缺提示'}</Badge>
                  <Badge variant={visualPlanReady ? 'success' : 'warning'}>{visualPlanReady ? '有视觉调度' : '缺视觉调度'}</Badge>
                  <Badge variant={storyboardBriefReady ? 'success' : 'warning'}>{storyboardBriefReady ? '有故事板简述' : '缺故事板简述'}</Badge>
                  <Badge variant={missingSlots.length > 0 ? 'warning' : 'success'}>{missingSlots.length > 0 ? `${missingSlots.length} 素材缺口` : '素材可用'}</Badge>
                  <Badge variant={requiresKeyframe && keyframes.length === 0 ? 'warning' : 'success'}>{requiresKeyframe ? `${keyframes.length} 关键帧` : '无需关键帧'}</Badge>
                </div>
              </div>
              {onOpenCanvas ? (
                <Button size="sm" className="gap-1.5 self-start" onClick={onOpenCanvas}>
                  <Play size={13} />
                  打开生成画布
                </Button>
              ) : null}
            </div>
          ) : null}

          {activeInputDrawer === 'keyframes' ? (
            <ContentWorkbenchKeyframeEditor
              compact={compact}
              keyframes={keyframes}
              selectedKeyframe={selectedKeyframe}
              keyframeDraft={keyframeDraft}
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
              onDraftChange={onKeyframeDraftChange}
              onModelChange={onKeyframeModelChange}
              onGenerateKeyframes={onGenerateKeyframes}
            />
          ) : null}

          {activeInputDrawer === 'storyboard' ? (
            <ContentUnitStoryboardBriefEditor
              unitId={unit.ID}
              value={{
                purpose: draft.storyboard_purpose,
                subject: draft.storyboard_subject,
                composition: draft.storyboard_composition,
                actionMoment: draft.storyboard_action_moment,
                emotion: draft.storyboard_emotion,
                keyframeSuggestions: draft.storyboard_keyframe_suggestions,
              }}
              ready={storyboardBriefReady}
              onFieldChange={onDraftChange}
              onAiVisualPlan={onAiVisualPlan}
            />
          ) : null}

          {activeInputDrawer === 'blocking' ? (
            <ContentUnitVisualPlanEditor
              unitId={unit.ID}
              value={{
                space: draft.visual_plan_space,
                blocking: draft.visual_plan_blocking,
                cameraPath: draft.visual_plan_camera_path,
                beats: draft.visual_plan_beats,
                props: draft.visual_plan_props,
                lighting: draft.visual_plan_lighting,
                risks: draft.visual_plan_risks,
              }}
              ready={visualPlanReady}
              requiresKeyframe={requiresKeyframe}
              onFieldChange={onDraftChange}
              onAiVisualPlan={onAiVisualPlan}
            />
          ) : null}
        </div>
      </section>
    </>
  )
}

function recordTitle(record: ContentUnitGenerationInputRecord) {
  return firstText(record.title, record.name, record.label, record.slot_key, `${record.kind || '记录'} #${record.ID}`)
}
