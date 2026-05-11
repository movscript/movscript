export const PROJECT_PROPOSAL_DRAFT_SCHEMA = 'movscript.project_proposal.v1'
export const PROJECT_PROPOSAL_SCOPE = 'project_proposal'

export interface ProjectProposalMergeCandidate {
  source_id: number
  reason?: string
}

export interface ProjectProposalOwnerPatch {
  type?: string
  id?: number
  client_id?: string
}

export interface ProjectProposalCreativeReferencePatch {
  client_id?: string
  id?: number
  fields?: Record<string, unknown>
  merge_candidates?: ProjectProposalMergeCandidate[]
}

export interface ProjectProposalAssetSlotPatch {
  client_id?: string
  id?: number
  owner?: ProjectProposalOwnerPatch
  fields?: Record<string, unknown>
}

export interface ProjectProposalDraftContent {
  schema: typeof PROJECT_PROPOSAL_DRAFT_SCHEMA
  scope: typeof PROJECT_PROPOSAL_SCOPE
  projectId?: number
  productionId?: number
  summary: string
  proposal: {
    creative_references: ProjectProposalCreativeReferencePatch[]
    asset_slots: ProjectProposalAssetSlotPatch[]
  }
  impact_notes: string[]
  createdAt: string
}

const PROJECT_PROPOSAL_EMPTY_SHAPE = {
  schema: PROJECT_PROPOSAL_DRAFT_SCHEMA,
  scope: PROJECT_PROPOSAL_SCOPE,
  summary: '一句话概述这份可审阅项目提案',
  proposal: {
    creative_references: [],
    asset_slots: [],
  },
  impact_notes: [],
}

export function buildEmptyProjectProposalDraftContent(input: {
  projectId?: number
  productionId?: number
  createdAt?: string
  summary?: string
} = {}): ProjectProposalDraftContent {
  return {
    schema: PROJECT_PROPOSAL_DRAFT_SCHEMA,
    scope: PROJECT_PROPOSAL_SCOPE,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.productionId !== undefined ? { productionId: input.productionId } : {}),
    summary: input.summary ?? '',
    proposal: {
      creative_references: [],
      asset_slots: [],
    },
    impact_notes: [],
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}

export function buildProjectProposalDraftContractPrompt(draftId: string) {
  return [
    `目标 draft：${draftId}`,
    'draft 定义：本地可审阅的项目级设定/素材局部语义补丁，不是最终结果；只有用户 apply 后才写入正式后端实体。',
    'draft 会通过 merge 机制应用：没有出现在 draft 里的实体不变；实体里没有出现在 fields/owner/merge_candidates 里的字段不变。',
    '项目提案内部按两层组织：先整理 creative_references，再整理依附于这些设定资料的 asset_slots。',
    'creative_reference 描述“这个设定是什么”；asset_slot 描述“这个设定需要哪些可复用素材或视图”。',
    '人物主视图、侧视图、全身图、表情组、服装状态图、道具图等都应该作为 asset_slot，不要再建成新的 creative_reference。',
    '调整素材需求和设定资料的关系时，使用 asset_slot.owner 或 asset_slot.fields.creative_reference_id；owner.type 必须是 creative_reference。',
    '设定资料必须给出清晰定位：fields.name 要是可识别的专名或职能名，fields.kind 要明确类型，fields.description/summary 要写清身份、叙事功能、外观或空间特征、使用边界，以及它和当前制作/剧本的关系。',
    '素材需求必须给出清晰交付定位：fields.name 要说明对象和视图/用途，fields.usage 或 description 要写清要产出的画面、可复用场景、约束和验收依据。',
    '禁止只用模糊词当设定：不要单独输出“高级感”“神秘感”“氛围感”“年轻化”“有张力”“独特”“电影感”“赛博感”等空泛描述；如果使用风格词，必须同时补充可观察的具体要素。',
    '',
    '只允许写入这一种 JSON 结构。数组默认为空；只有存在真实变更时才添加节点：',
    JSON.stringify(PROJECT_PROPOSAL_EMPTY_SHAPE, null, 2),
    '',
    '节点字段规范：',
    '- creative_references 节点：{ client_id?, id?, fields?, merge_candidates? }。',
    '- asset_slots 节点：{ client_id?, id?, owner?, fields? }。',
    '- 没有 id 表示新增候选，fields.name 必填。',
    '- 有 id 表示把 fields/owner/merge_candidates 局部 merge 到已有实体，只修改提到的字段。',
    '- fields 只写要新增或修改的后端实体字段；缺失字段表示不修改。',
    '- merge_candidates 只允许放在已有 creative_reference 节点上，source_id 是被合并设定 ID。',
    '- owner 只允许表达素材需求归属，例如 { "type": "creative_reference", "id": 35 } 或 { "type": "creative_reference", "client_id": "cr_heroine" }。',
    '- 不要输出 action、entity、target_id、source_ids、payload 或 operations。',
    '',
    '生成规则：',
    '- 未提到的正式内容不会被修改；不要为了完整性复制全量项目状态。',
    '- 纯复用或无需改动的判断写进 summary 或 impact_notes。',
    '- 不要输出占位 ID：禁止 0、"0"、示例 ID 或猜测 ID。',
    '- 当前项目没有已有设定或素材需求时，只能写没有 id 的新增候选。',
    '- fields 里可以写必要 rationale、usage、relation 等审阅信息，但不要写 lock: true 这类非协议字段。',
    '- 每个新增 creative_reference 至少写清 name、kind、description/summary；描述要包含可被后续编排或生成复用的具体事实。',
    '- 每个新增 asset_slot 至少写清 name、kind、usage/description，并通过 owner 归属到具体 creative_reference。',
    '- 如果信息不足以具体定位，不要用空泛词补齐；在 impact_notes 写明缺失信息，或调用 movscript_request_user_input 询问。',
    '- 只修改本地 draft；完成后调用 movscript_validate_draft 和 movscript_simulate_draft_apply。',
    '- 如果模拟写入失败，依据 validation/backendError 修改 draft，然后再次 validate 和 simulate。',
  ].join('\n')
}
