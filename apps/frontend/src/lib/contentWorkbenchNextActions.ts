export type ContentWorkbenchNextActionKey =
  | 'select_scene_moment'
  | 'ai_plan_units'
  | 'manual_add_unit'
  | 'select_unit'
  | 'complete_unit_prompt'
  | 'upload_missing_assets'
  | 'add_first_keyframe'
  | 'resolve_generation_context'
  | 'review_ai_drafts'
  | 'open_generation_canvas'
  | 'open_preview_workspace'
  | 'open_delivery_workspace'

export interface ContentWorkbenchNextActionView {
  key: ContentWorkbenchNextActionKey
  title: string
  detail: string
  tone: 'default' | 'warning' | 'success'
}

export interface ContentWorkbenchNextActionInput {
  hasSelectedMoment: boolean
  unitCount: number
  hasSelectedUnit: boolean
  hasUnitPrompt: boolean
  missingSlotCount: number
  keyframeCount: number
  pendingReviewDraftCount?: number
  missingGenerationContext?: Array<{ label: string; detail: string }>
  completedJobCount?: number
  previewItemCount?: number
  deliveryVersionCount?: number
}

export function buildContentWorkbenchNextActions(input: ContentWorkbenchNextActionInput): ContentWorkbenchNextActionView[] {
  if (!input.hasSelectedMoment) {
    return [{
      key: 'select_scene_moment',
      title: '选择一个情节',
      detail: '先从生产队列里选中情节，工作台才会显示制作项、画面锚点和生成检查。',
      tone: 'warning',
    }]
  }

  if (input.unitCount === 0) {
    return [
      {
        key: 'ai_plan_units',
        title: '让 AI 规划制作项',
        detail: '当前情节还没有制作项。建议先让 AI 生成 3-6 条候选，再人工确认。',
        tone: 'warning',
      },
      {
        key: 'manual_add_unit',
        title: '手动添加制作项',
        detail: '适合已经明确镜头、旁白、字幕卡或转场结构的情节。',
        tone: 'default',
      },
    ]
  }

  if (!input.hasSelectedUnit) {
    return [{
      key: 'select_unit',
      title: '选择制作项',
      detail: '从制作项轨道中选择一个目标，查看提示词、素材和关键帧状态。',
      tone: 'warning',
    }]
  }

  if (!input.hasUnitPrompt) {
    return [{
      key: 'complete_unit_prompt',
      title: '补齐制作项提示',
      detail: '当前制作项缺少描述或 prompt，AI 难以判断画面目标。',
      tone: 'warning',
    }]
  }

  if (input.missingSlotCount > 0) {
    return [{
      key: 'upload_missing_assets',
      title: '补齐素材缺口',
      detail: `${input.missingSlotCount} 个素材需求仍在阻塞当前制作项。`,
      tone: 'warning',
    }]
  }

  if (input.keyframeCount === 0) {
    return [{
      key: 'add_first_keyframe',
      title: '添加第一张关键帧',
      detail: '视频生成前建议至少补开头帧和结尾帧，用来约束画面状态变化。',
      tone: 'warning',
    }]
  }

  if (input.missingGenerationContext?.length) {
    return input.missingGenerationContext.slice(0, 3).map((item) => ({
      key: 'resolve_generation_context',
      title: item.label,
      detail: item.detail,
      tone: 'warning',
    }))
  }

  if (input.pendingReviewDraftCount && input.pendingReviewDraftCount > 0) {
    return [{
      key: 'review_ai_drafts',
      title: '审阅 AI 草案',
      detail: `${input.pendingReviewDraftCount} 个制作项草案还没有处理，建议先确认或忽略再进入生成计划。`,
      tone: 'warning',
    }]
  }

  if (input.completedJobCount && input.completedJobCount > 0) {
    if (!input.previewItemCount || input.previewItemCount === 0) {
      return [{
        key: 'open_preview_workspace',
        title: '检查预演挂载',
        detail: '已有生成记录，下一步在当前内容编排工作台核对预演挂载和连续性。',
        tone: 'success',
      }]
    }

    if (!input.deliveryVersionCount || input.deliveryVersionCount === 0) {
      return [{
        key: 'open_delivery_workspace',
        title: '进入交付工作台',
        detail: '预览时间线已有记录，下一步应整理交付版本。',
        tone: 'success',
      }]
    }
  }

  return [{
    key: 'open_generation_canvas',
    title: '打开生成画布',
    detail: '当前制作项的提示、素材输入和画面锚点已经具备，可以进入生成计划。',
    tone: 'success',
  }]
}
