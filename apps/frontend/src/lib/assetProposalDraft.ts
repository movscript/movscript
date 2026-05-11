export const ASSET_PROPOSAL_DRAFT_SCHEMA = 'movscript.asset_proposal.v1'
export const ASSET_PROPOSAL_SCOPE = 'asset_proposal'

export type AssetProposalOutputKind = 'image' | 'video' | 'audio' | 'text' | 'file'

export interface AssetProposalReferenceResource {
  resource_id: number
  role: 'locked' | 'candidate' | 'slot_resource' | 'context' | 'style' | 'negative'
  reason?: string
}

export interface AssetProposalCandidatePlan {
  client_id?: string
  output_kind: AssetProposalOutputKind
  prompt: string
  negative_prompt?: string
  aspect_ratio?: string
  duration?: number
  model_capability?: 'image' | 'image_edit' | 'video' | 'video_i2v'
  input_resource_ids: number[]
  rationale?: string
  acceptance_criteria: string[]
  risks?: string[]
}

export interface AssetProposalDraftContent {
  schema: typeof ASSET_PROPOSAL_DRAFT_SCHEMA
  scope: typeof ASSET_PROPOSAL_SCOPE
  projectId?: number
  assetSlotId: number
  summary: string
  slot: {
    id: number
    name: string
    kind: string
    description?: string
    prompt_hint?: string
    owner_label?: string
  }
  context: {
    reference_resources: AssetProposalReferenceResource[]
    notes: string[]
  }
  proposal: {
    candidate_plans: AssetProposalCandidatePlan[]
  }
  next_actions: string[]
  createdAt: string
}

const ASSET_PROPOSAL_EMPTY_SHAPE = {
  schema: ASSET_PROPOSAL_DRAFT_SCHEMA,
  scope: ASSET_PROPOSAL_SCOPE,
  assetSlotId: 0,
  summary: '一句话概述这份素材候选提案',
  slot: {
    id: 0,
    name: '素材需求名称',
    kind: 'image',
  },
  context: {
    reference_resources: [],
    notes: [],
  },
  proposal: {
    candidate_plans: [],
  },
  next_actions: [],
}

export function buildEmptyAssetProposalDraftContent(input: {
  projectId?: number
  assetSlotId: number
  slotName: string
  slotKind: string
  description?: string
  promptHint?: string
  ownerLabel?: string
  referenceResourceIds?: number[]
  createdAt?: string
}): AssetProposalDraftContent {
  return {
    schema: ASSET_PROPOSAL_DRAFT_SCHEMA,
    scope: ASSET_PROPOSAL_SCOPE,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    assetSlotId: input.assetSlotId,
    summary: '',
    slot: {
      id: input.assetSlotId,
      name: input.slotName,
      kind: input.slotKind,
      ...(input.description ? { description: input.description } : {}),
      ...(input.promptHint ? { prompt_hint: input.promptHint } : {}),
      ...(input.ownerLabel ? { owner_label: input.ownerLabel } : {}),
    },
    context: {
      reference_resources: (input.referenceResourceIds ?? []).map((resourceId) => ({
        resource_id: resourceId,
        role: 'context' as const,
      })),
      notes: [],
    },
    proposal: {
      candidate_plans: [],
    },
    next_actions: [],
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}

export function buildAssetProposalDraftContractPrompt(draftId: string) {
  return [
    `目标 draft：${draftId}`,
    'draft 定义：本地可审阅的素材候选生成提案，不是最终生成结果；它只规划提示词、参考素材、候选方案和验收标准。',
    '不要直接调用生成工具，不要直接创建 generation job，不要直接绑定 asset-slot-candidates。生成候选是用户审阅 proposal 后的下游动作。',
    '你必须先基于当前素材需求、已有候选、锁定素材、项目上下文和用户补充信息，整理候选生成前置工作。',
    '',
    '只允许写入这一种 JSON 结构：',
    JSON.stringify(ASSET_PROPOSAL_EMPTY_SHAPE, null, 2),
    '',
    '字段规范：',
    '- assetSlotId 和 slot.id 必须等于当前素材需求 ID。',
    '- context.reference_resources 只放可作为生成参考的资源 ID；role 取 locked、candidate、slot_resource、context、style、negative。',
    '- proposal.candidate_plans 是候选生成计划数组；每个计划至少包含 output_kind、prompt、input_resource_ids、acceptance_criteria。',
    '- output_kind 通常是 image 或 video；除非素材需求明确要求音频/文本/文件，否则不要切换到其他类型。',
    '- model_capability 用来表达建议的模型能力：image、image_edit、video、video_i2v。',
    '- prompt 必须是可直接进入生成模型的完整提示词，不能只写“参考已有设定”。',
    '- acceptance_criteria 必须写成用户能审阅候选是否合格的具体标准。',
    '- risks 写缺失信息、可能重复构图、参考素材不足、风格不确定等风险。',
    '',
    '生成规则：',
    '- 先整合素材需求本身的 name、kind、description、prompt_hint 和归属信息。',
    '- 如果有已有候选或锁定素材，优先作为 input_resource_ids，并说明它们承担的参考角色。',
    '- 参考素材不足时也要给出可执行的纯文生图/文生视频方案，同时在 risks 或 next_actions 说明限制。',
    '- 不要用“高级感、电影感、氛围感、神秘、年轻化”等空泛词单独描述；若使用风格词，必须补充可观察元素、构图、主体、材质、光线或动作。',
    '- 为同一素材需求可给 1-3 个候选计划，计划之间应体现明确差异，例如主视图、情绪版、动作版、视频版。',
    '- 如果信息不足以安全规划，调用 movscript_request_user_input；不要编造关键设定。',
    '- 完成后调用 movscript_read_draft 和 movscript_dry_apply_draft 或 movscript_validate_draft；如果校验失败，修改 draft 后再次校验。',
  ].join('\n')
}
