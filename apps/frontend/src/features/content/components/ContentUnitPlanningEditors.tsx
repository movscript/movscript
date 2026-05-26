import { Clapperboard, Route, Sparkles } from 'lucide-react'

import {
  ContentWorkbenchPlanningActionButton,
  ContentWorkbenchPlanningEditor,
  ContentWorkbenchPlanningFieldGrid,
  ContentWorkbenchPlanningHeader,
  ContentWorkbenchPlanningTextareaField,
  StatusBadge,
} from '@movscript/ui'
import { contentOptionalReadinessRecipe, contentReadinessRecipe } from '@/features/content/presentation/contentSemanticUi'

export type ContentUnitPlanningField =
  | 'visual_task_graph_space'
  | 'visual_task_graph_blocking'
  | 'visual_task_graph_camera_path'
  | 'visual_task_graph_beats'
  | 'visual_task_graph_props'
  | 'visual_task_graph_lighting'
  | 'visual_task_graph_risks'
  | 'storyboard_purpose'
  | 'storyboard_subject'
  | 'storyboard_composition'
  | 'storyboard_action_moment'
  | 'storyboard_emotion'
  | 'storyboard_keyframe_suggestions'

export interface ContentUnitVisualPlanEditorValue {
  space: string
  blocking: string
  cameraPath: string
  beats: string
  props: string
  lighting: string
  risks: string
}

export interface ContentUnitStoryboardBriefEditorValue {
  purpose: string
  subject: string
  composition: string
  actionMoment: string
  emotion: string
  keyframeSuggestions: string
}

export function ContentUnitStoryboardBriefEditor({
  unitId,
  value,
  ready,
  onFieldChange,
  onAiVisualTaskGraph,
}: {
  unitId: number
  value: ContentUnitStoryboardBriefEditorValue
  ready: boolean
  onFieldChange: (field: ContentUnitPlanningField, value: string) => void
  onAiVisualTaskGraph?: () => void
}) {
  return (
    <ContentWorkbenchPlanningEditor data-testid="content-workbench-storyboard-brief-editor">
      <ContentWorkbenchPlanningHeader
        icon={<Clapperboard size={14} />}
        title="故事板简述"
        description="先用结构化说明确认画面要讲什么，再推进关键帧或单张故事板图。"
        status={<StatusBadge {...contentReadinessRecipe(ready)}>{ready ? '已填写' : '待填写'}</StatusBadge>}
        action={onAiVisualTaskGraph ? (
            <ContentWorkbenchPlanningActionButton
              onClick={onAiVisualTaskGraph}
              data-testid="content-workbench-ai-visual-taskGraph"
            >
              <Sparkles size={14} />
              AI 起草
            </ContentWorkbenchPlanningActionButton>
          ) : undefined}
      />
      <ContentWorkbenchPlanningFieldGrid>
          <ContentWorkbenchPlanningTextareaField
            label="画面目的"
            htmlFor={`storyboard-purpose-${unitId}`}
            size="sm"
            value={value.purpose}
            placeholder="这一格故事板要让观众理解什么信息或情绪？"
            onChange={(event) => onFieldChange('storyboard_purpose', event.target.value)}
            data-testid="content-workbench-storyboard-purpose"
          />
        </ContentWorkbenchPlanningFieldGrid>
        <ContentWorkbenchPlanningFieldGrid columns="two">
            <ContentWorkbenchPlanningTextareaField
              label="主体"
              htmlFor={`storyboard-subject-${unitId}`}
              size="sm"
              value={value.subject}
              placeholder="人物、道具或环境主体。"
              onChange={(event) => onFieldChange('storyboard_subject', event.target.value)}
            />
            <ContentWorkbenchPlanningTextareaField
              label="构图"
              htmlFor={`storyboard-composition-${unitId}`}
              size="sm"
              value={value.composition}
              placeholder="主体位置、前中后景、留白和视线方向。"
              onChange={(event) => onFieldChange('storyboard_composition', event.target.value)}
              data-testid="content-workbench-storyboard-composition"
            />
        </ContentWorkbenchPlanningFieldGrid>
        <ContentWorkbenchPlanningFieldGrid columns="two">
            <ContentWorkbenchPlanningTextareaField
              label="动作瞬间"
              htmlFor={`storyboard-action-${unitId}`}
              size="sm"
              value={value.actionMoment}
              placeholder="故事板捕捉的动作节点或表演状态。"
              onChange={(event) => onFieldChange('storyboard_action_moment', event.target.value)}
            />
            <ContentWorkbenchPlanningTextareaField
              label="情绪状态"
              htmlFor={`storyboard-emotion-${unitId}`}
              size="sm"
              value={value.emotion}
              placeholder="人物情绪、氛围和观众感受。"
              onChange={(event) => onFieldChange('storyboard_emotion', event.target.value)}
            />
        </ContentWorkbenchPlanningFieldGrid>
        <ContentWorkbenchPlanningFieldGrid>
          <ContentWorkbenchPlanningTextareaField
            label="建议关键帧"
            htmlFor={`storyboard-keyframes-${unitId}`}
            size="lg"
            value={value.keyframeSuggestions}
            placeholder="一行一个建议，例如：首帧：旧伞遮住半张脸；尾帧：纸条落在水洼边。"
            onChange={(event) => onFieldChange('storyboard_keyframe_suggestions', event.target.value)}
            data-testid="content-workbench-storyboard-keyframe-suggestions"
          />
        </ContentWorkbenchPlanningFieldGrid>
    </ContentWorkbenchPlanningEditor>
  )
}

export function ContentUnitVisualPlanEditor({
  unitId,
  value,
  ready,
  requiresKeyframe,
  onFieldChange,
  onAiVisualTaskGraph,
}: {
  unitId: number
  value: ContentUnitVisualPlanEditorValue
  ready: boolean
  requiresKeyframe: boolean
  onFieldChange: (field: ContentUnitPlanningField, value: string) => void
  onAiVisualTaskGraph?: () => void
}) {
  return (
    <ContentWorkbenchPlanningEditor data-testid="content-workbench-visual-taskGraph-editor">
      <ContentWorkbenchPlanningHeader
        icon={<Route size={14} />}
        title="视觉调度计划"
        description="调度图回答空间关系、相机路径和人物怎么走；关键帧回答最终画面长什么样。"
        status={<StatusBadge {...contentOptionalReadinessRecipe(ready, requiresKeyframe)}>{ready ? '已填写' : requiresKeyframe ? '建议补齐' : '可选'}</StatusBadge>}
        action={onAiVisualTaskGraph ? (
            <ContentWorkbenchPlanningActionButton
              onClick={onAiVisualTaskGraph}
              data-testid="content-workbench-ai-visual-taskGraph"
            >
              <Sparkles size={14} />
              AI 起草
            </ContentWorkbenchPlanningActionButton>
          ) : undefined}
      />
      <ContentWorkbenchPlanningFieldGrid>
          <ContentWorkbenchPlanningTextareaField
            label="空间关系"
            htmlFor={`visual-taskGraph-space-${unitId}`}
            value={value.space}
            placeholder="地点结构、人物/道具初始位置、前中后景关系。"
            onChange={(event) => onFieldChange('visual_task_graph_space', event.target.value)}
            data-testid="content-workbench-visual-taskGraph-space"
          />
        </ContentWorkbenchPlanningFieldGrid>
        <ContentWorkbenchPlanningFieldGrid>
          <ContentWorkbenchPlanningTextareaField
            label="人物走位 / 调度"
            htmlFor={`visual-taskGraph-blocking-${unitId}`}
            value={value.blocking}
            placeholder="人物从哪里来、在哪停、动作如何变化。"
            onChange={(event) => onFieldChange('visual_task_graph_blocking', event.target.value)}
            data-testid="content-workbench-visual-taskGraph-blocking"
          />
        </ContentWorkbenchPlanningFieldGrid>
        <ContentWorkbenchPlanningFieldGrid>
          <ContentWorkbenchPlanningTextareaField
            label="摄影机路径"
            htmlFor={`visual-taskGraph-camera-${unitId}`}
            value={value.cameraPath}
            placeholder="机位、镜头运动、焦点变化和落点。"
            onChange={(event) => onFieldChange('visual_task_graph_camera_path', event.target.value)}
            data-testid="content-workbench-visual-taskGraph-camera-path"
          />
        </ContentWorkbenchPlanningFieldGrid>
        <ContentWorkbenchPlanningFieldGrid columns="two">
            <ContentWorkbenchPlanningTextareaField
              label="停点 / 节奏"
              htmlFor={`visual-taskGraph-beats-${unitId}`}
              size="lg"
              value={value.beats}
              placeholder="一行一个 beat，例如：0-2s 纸条滑落。"
              onChange={(event) => onFieldChange('visual_task_graph_beats', event.target.value)}
              data-testid="content-workbench-visual-taskGraph-beats"
            />
            <ContentWorkbenchPlanningTextareaField
              label="道具位置"
              htmlFor={`visual-taskGraph-props-${unitId}`}
              size="lg"
              value={value.props}
              placeholder="一行一个道具或空间参照。"
              onChange={(event) => onFieldChange('visual_task_graph_props', event.target.value)}
            />
        </ContentWorkbenchPlanningFieldGrid>
        <ContentWorkbenchPlanningFieldGrid columns="two">
            <ContentWorkbenchPlanningTextareaField
              label="光线意图"
              htmlFor={`visual-taskGraph-lighting-${unitId}`}
              value={value.lighting}
              placeholder="主光、环境光、阴影、反光和情绪。"
              onChange={(event) => onFieldChange('visual_task_graph_lighting', event.target.value)}
              data-testid="content-workbench-visual-taskGraph-lighting"
            />
            <ContentWorkbenchPlanningTextareaField
              label="风险备注"
              htmlFor={`visual-taskGraph-risks-${unitId}`}
              value={value.risks}
              placeholder="连续性、道具准确性、模型容易误解的点。"
              onChange={(event) => onFieldChange('visual_task_graph_risks', event.target.value)}
            />
        </ContentWorkbenchPlanningFieldGrid>
    </ContentWorkbenchPlanningEditor>
  )
}
