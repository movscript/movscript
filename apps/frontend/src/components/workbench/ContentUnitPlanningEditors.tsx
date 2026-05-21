import { Clapperboard, Route, Sparkles } from 'lucide-react'

import { Badge, Button } from '@movscript/ui'
import { Label, Textarea } from '@movscript/ui'

export type ContentUnitPlanningField =
  | 'visual_plan_space'
  | 'visual_plan_blocking'
  | 'visual_plan_camera_path'
  | 'visual_plan_beats'
  | 'visual_plan_props'
  | 'visual_plan_lighting'
  | 'visual_plan_risks'
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
  onAiVisualPlan,
}: {
  unitId: number
  value: ContentUnitStoryboardBriefEditorValue
  ready: boolean
  onFieldChange: (field: ContentUnitPlanningField, value: string) => void
  onAiVisualPlan?: () => void
}) {
  return (
    <div className="space-y-3" data-testid="content-workbench-storyboard-brief-editor">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Clapperboard size={13} className="text-muted-foreground" />
            故事板简述
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            先用结构化说明确认画面要讲什么，再推进关键帧或单张故事板图。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge variant={ready ? 'success' : 'warning'}>{ready ? '已填写' : '待填写'}</Badge>
          {onAiVisualPlan ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={onAiVisualPlan}
              data-testid="content-workbench-ai-visual-plan"
            >
              <Sparkles size={13} />
              AI 起草
            </Button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`storyboard-purpose-${unitId}`} className="text-xs">画面目的</Label>
          <Textarea
            id={`storyboard-purpose-${unitId}`}
            className="min-h-[72px]"
            value={value.purpose}
            placeholder="这一格故事板要让观众理解什么信息或情绪？"
            onChange={(event) => onFieldChange('storyboard_purpose', event.target.value)}
            data-testid="content-workbench-storyboard-purpose"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`storyboard-subject-${unitId}`} className="text-xs">主体</Label>
            <Textarea
              id={`storyboard-subject-${unitId}`}
              className="min-h-[72px]"
              value={value.subject}
              placeholder="人物、道具或环境主体。"
              onChange={(event) => onFieldChange('storyboard_subject', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`storyboard-composition-${unitId}`} className="text-xs">构图</Label>
            <Textarea
              id={`storyboard-composition-${unitId}`}
              className="min-h-[72px]"
              value={value.composition}
              placeholder="主体位置、前中后景、留白和视线方向。"
              onChange={(event) => onFieldChange('storyboard_composition', event.target.value)}
              data-testid="content-workbench-storyboard-composition"
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`storyboard-action-${unitId}`} className="text-xs">动作瞬间</Label>
            <Textarea
              id={`storyboard-action-${unitId}`}
              className="min-h-[72px]"
              value={value.actionMoment}
              placeholder="故事板捕捉的动作节点或表演状态。"
              onChange={(event) => onFieldChange('storyboard_action_moment', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`storyboard-emotion-${unitId}`} className="text-xs">情绪状态</Label>
            <Textarea
              id={`storyboard-emotion-${unitId}`}
              className="min-h-[72px]"
              value={value.emotion}
              placeholder="人物情绪、氛围和观众感受。"
              onChange={(event) => onFieldChange('storyboard_emotion', event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`storyboard-keyframes-${unitId}`} className="text-xs">建议关键帧</Label>
          <Textarea
            id={`storyboard-keyframes-${unitId}`}
            className="min-h-[88px]"
            value={value.keyframeSuggestions}
            placeholder="一行一个建议，例如：首帧：旧伞遮住半张脸；尾帧：纸条落在水洼边。"
            onChange={(event) => onFieldChange('storyboard_keyframe_suggestions', event.target.value)}
            data-testid="content-workbench-storyboard-keyframe-suggestions"
          />
        </div>
      </div>
    </div>
  )
}

export function ContentUnitVisualPlanEditor({
  unitId,
  value,
  ready,
  requiresKeyframe,
  onFieldChange,
  onAiVisualPlan,
}: {
  unitId: number
  value: ContentUnitVisualPlanEditorValue
  ready: boolean
  requiresKeyframe: boolean
  onFieldChange: (field: ContentUnitPlanningField, value: string) => void
  onAiVisualPlan?: () => void
}) {
  return (
    <div className="space-y-3" data-testid="content-workbench-visual-plan-editor">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Route size={13} className="text-muted-foreground" />
            视觉调度计划
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            调度图回答空间关系、相机路径和人物怎么走；关键帧回答最终画面长什么样。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge variant={ready ? 'success' : requiresKeyframe ? 'warning' : 'outline'}>{ready ? '已填写' : requiresKeyframe ? '建议补齐' : '可选'}</Badge>
          {onAiVisualPlan ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={onAiVisualPlan}
              data-testid="content-workbench-ai-visual-plan"
            >
              <Sparkles size={13} />
              AI 起草
            </Button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`visual-plan-space-${unitId}`} className="text-xs">空间关系</Label>
          <Textarea
            id={`visual-plan-space-${unitId}`}
            className="min-h-[76px]"
            value={value.space}
            placeholder="地点结构、人物/道具初始位置、前中后景关系。"
            onChange={(event) => onFieldChange('visual_plan_space', event.target.value)}
            data-testid="content-workbench-visual-plan-space"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`visual-plan-blocking-${unitId}`} className="text-xs">人物走位 / 调度</Label>
          <Textarea
            id={`visual-plan-blocking-${unitId}`}
            className="min-h-[76px]"
            value={value.blocking}
            placeholder="人物从哪里来、在哪停、动作如何变化。"
            onChange={(event) => onFieldChange('visual_plan_blocking', event.target.value)}
            data-testid="content-workbench-visual-plan-blocking"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`visual-plan-camera-${unitId}`} className="text-xs">摄影机路径</Label>
          <Textarea
            id={`visual-plan-camera-${unitId}`}
            className="min-h-[76px]"
            value={value.cameraPath}
            placeholder="机位、镜头运动、焦点变化和落点。"
            onChange={(event) => onFieldChange('visual_plan_camera_path', event.target.value)}
            data-testid="content-workbench-visual-plan-camera-path"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`visual-plan-beats-${unitId}`} className="text-xs">停点 / 节奏</Label>
            <Textarea
              id={`visual-plan-beats-${unitId}`}
              className="min-h-[88px]"
              value={value.beats}
              placeholder="一行一个 beat，例如：0-2s 纸条滑落。"
              onChange={(event) => onFieldChange('visual_plan_beats', event.target.value)}
              data-testid="content-workbench-visual-plan-beats"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`visual-plan-props-${unitId}`} className="text-xs">道具位置</Label>
            <Textarea
              id={`visual-plan-props-${unitId}`}
              className="min-h-[88px]"
              value={value.props}
              placeholder="一行一个道具或空间参照。"
              onChange={(event) => onFieldChange('visual_plan_props', event.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`visual-plan-lighting-${unitId}`} className="text-xs">光线意图</Label>
            <Textarea
              id={`visual-plan-lighting-${unitId}`}
              className="min-h-[76px]"
              value={value.lighting}
              placeholder="主光、环境光、阴影、反光和情绪。"
              onChange={(event) => onFieldChange('visual_plan_lighting', event.target.value)}
              data-testid="content-workbench-visual-plan-lighting"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`visual-plan-risks-${unitId}`} className="text-xs">风险备注</Label>
            <Textarea
              id={`visual-plan-risks-${unitId}`}
              className="min-h-[76px]"
              value={value.risks}
              placeholder="连续性、道具准确性、模型容易误解的点。"
              onChange={(event) => onFieldChange('visual_plan_risks', event.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
