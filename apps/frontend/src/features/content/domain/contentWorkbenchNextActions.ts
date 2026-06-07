export type ContentWorkbenchNextActionKey =
  | 'select_scene_moment'
  | 'manual_add_unit'
  | 'select_unit'
  | 'complete_unit_prompt'
  | 'upload_missing_assets'
  | 'add_first_keyframe'
  | 'resolve_generation_context'
  | 'review_ai_workspaces'
  | 'open_generation_canvas'
  | 'inspect_preview_mount'

export type ContentWorkbenchNextActionState = 'required' | 'optional' | 'available'

export interface ContentWorkbenchNextActionView {
  key: ContentWorkbenchNextActionKey
  title: string
  detail: string
  state: ContentWorkbenchNextActionState
}

export interface ContentWorkbenchNextActionInput {
  hasSelectedMoment: boolean
  unitCount: number
  hasSelectedUnit: boolean
  hasUnitPrompt: boolean
  missingSlotCount: number
  keyframeCount: number
  requiresKeyframe?: boolean
  pendingReviewWorkspaceCount?: number
  missingGenerationContext?: Array<{ label: string; detail: string }>
  completedJobCount?: number
  previewItemCount?: number
}

export function buildContentWorkbenchNextActions(input: ContentWorkbenchNextActionInput): ContentWorkbenchNextActionView[] {
  if (!input.hasSelectedMoment) {
    return [{
      key: 'select_scene_moment',
      title: '选择一个情节',
      detail: '先从生产队列里选中情节，工作台才会显示制作项、画面锚点和生成检查。',
      state: 'required',
    }]
  }

  if (input.unitCount === 0) {
    return [
      {
        key: 'manual_add_unit',
        title: '手动添加制作项',
        detail: '当前情节还没有制作项。先添加镜头、旁白、字幕卡或转场条目。',
        state: 'required',
      },
    ]
  }

  if (!input.hasSelectedUnit) {
    return [{
      key: 'select_unit',
      title: '选择制作项',
      detail: '从制作项轨道中选择一个目标，查看提示词、素材和关键帧状态。',
      state: 'required',
    }]
  }

  if (!input.hasUnitPrompt) {
    return [{
      key: 'complete_unit_prompt',
      title: '补齐制作项提示',
      detail: '当前制作项缺少描述或 prompt，AI 难以判断画面目标。',
      state: 'required',
    }]
  }

  if (input.missingSlotCount > 0) {
    return [{
      key: 'upload_missing_assets',
      title: '补齐素材缺口',
      detail: `${input.missingSlotCount} 个素材需求仍在阻塞当前制作项。`,
      state: 'required',
    }]
  }

  if ((input.requiresKeyframe ?? true) && input.keyframeCount === 0) {
    return [{
      key: 'add_first_keyframe',
      title: '添加关键帧',
      detail: '先选择首帧、中间帧或尾帧；标题可以稍后补充。',
      state: 'required',
    }]
  }

  if (input.missingGenerationContext?.length) {
    return input.missingGenerationContext.slice(0, 3).map((item) => ({
      key: 'resolve_generation_context',
      title: item.label,
      detail: item.detail,
      state: 'required',
    }))
  }

  if (input.pendingReviewWorkspaceCount && input.pendingReviewWorkspaceCount > 0) {
    return [{
      key: 'review_ai_workspaces',
      title: '审阅 AI 草案',
      detail: `${input.pendingReviewWorkspaceCount} 个制作项草案还没有处理，建议先确认或忽略再进入生成计划。`,
      state: 'required',
    }]
  }

  if (input.completedJobCount && input.completedJobCount > 0) {
    if (!input.previewItemCount || input.previewItemCount === 0) {
      return [{
        key: 'inspect_preview_mount',
        title: '检查预览挂载',
        detail: '已有生成记录，下一步在内容编排工作台核对预览挂载和连续性。',
        state: 'available',
      }]
    }

  }

  return [{
    key: 'open_generation_canvas',
    title: '打开生成画布',
    detail: '当前制作项的提示、素材输入和画面锚点已经具备，可以进入生成计划。',
    state: 'available',
  }]
}
