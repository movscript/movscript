export const PROJECT_PROPOSAL_DRAFT_SCHEMA = 'movscript.project_proposal.v1'
export const PROJECT_PROPOSAL_SCOPE = 'project_proposal'

export type ProjectProposalCreativeReferenceAction = 'create' | 'update' | 'delete' | 'merge'
export type ProjectProposalAssetSlotAction = 'create' | 'update' | 'delete' | 'lock_asset'
export type ProjectProposalAction = ProjectProposalCreativeReferenceAction | ProjectProposalAssetSlotAction | 'reuse'
export type ProjectProposalEntity = 'creativeReferences' | 'assetSlots'

export interface ProjectProposalOperation {
  action: ProjectProposalAction | string
  entity: ProjectProposalEntity
  id?: number
  target_id?: number
  source_ids?: number[]
  payload?: Record<string, unknown>
}

export interface ProjectProposalDraftContent {
  schema: typeof PROJECT_PROPOSAL_DRAFT_SCHEMA
  scope: typeof PROJECT_PROPOSAL_SCOPE
  projectId?: number
  productionId?: number
  summary: string
  proposal: {
    creative_references: ProjectProposalOperation[]
    asset_slots: ProjectProposalOperation[]
  }
  operations: ProjectProposalOperation[]
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
  operations: [],
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
    operations: [],
    impact_notes: [],
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}

export function projectProposalActionLabel(action: unknown) {
  const value = typeof action === 'string' && action.trim() ? action.trim() : 'update'
  const labels: Record<string, string> = {
    create: '创建',
    update: '修改',
    delete: '删除',
    merge: '合并',
    lock_asset: '锁定素材',
    reuse: '复用',
  }
  return labels[value] ?? value
}

export function buildProjectProposalDraftContractPrompt(draftId: string) {
  return [
    `目标 draft：${draftId}`,
    'draft 定义：本地可审阅的项目提案快照，不是最终结果；只有用户 apply 后才写入正式后端实体。',
    '',
    '只允许写入这一种 JSON 结构。数组默认为空；只有存在真实变更时才添加节点：',
    JSON.stringify(PROJECT_PROPOSAL_EMPTY_SHAPE, null, 2),
    '',
    '节点字段规范：',
    '- creative_references 只接受 entity: "creativeReferences"，action 只允许 create、update、delete、merge。',
    '- asset_slots 只接受 entity: "assetSlots"，action 只允许 create、update、delete、lock_asset。',
    '- 新增用 create：不要写 id、target_id、source_ids；payload.name 必填。',
    '- 修改或删除已有实体用 update/delete：target_id 必须是真实存在的正整数。',
    '- 合并已有重复设定用 merge：target_id 是保留设定 ID，source_ids 是被合并设定 ID 数组；两者都必须是真实存在的正整数。',
    '- 锁定已有素材需求用 lock_asset：target_id 必须是真实存在的素材需求 ID；没有已有素材需求时改用 create。',
    '- operations 是兼容字段，保持 []；不要把变更同时写进 operations。',
    '',
    '生成规则：',
    '- 不要输出 action: "reuse"；纯复用或无需改动的判断写进 summary 或 impact_notes。',
    '- 不要输出占位 ID：禁止 0、"0"、空 source_ids、示例 ID 或猜测 ID。',
    '- 当前项目没有已有设定或素材需求时，只能生成 create，不能生成 merge、update、delete 或 lock_asset。',
    '- payload 只写后端实体字段和必要 rationale，不要写 lock: true 这类非协议字段。',
    '- 只修改本地 draft；完成后调用 movscript_validate_draft。',
  ].join('\n')
}
