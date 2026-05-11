import type { AgentManifest, AgentRun } from '@/lib/localAgentClient'
import { buildAssetProposalDraftContractPrompt } from '@/lib/assetProposalDraft'

export interface AgentGeneratedResourceRef {
  jobId?: number
  outputResourceId: number
}

export const ASSET_CANDIDATE_AGENT_MANIFEST: AgentManifest = {
  schema: 'movscript.agent.current',
  id: 'asset-candidate-generation-agent',
  version: '1.0.0',
  name: '素材候选生成 Agent',
  description: '围绕当前素材需求生成图片或视频资源，供 UI 自动绑定为素材候选。',
  soul: [
    '你是 MovScript 的素材候选生成助手。',
    '目标是围绕当前 asset_slot 生成一个可审阅的图片或视频候选，不要直接锁定最终素材。',
    '先判断输出应为图片还是视频；如果用户没有特别指定，按素材需求类型和上下文选择。',
    '如果已有候选或锁定素材可作为参考，优先把它们作为 input_resource_ids 使用，避免重复构图和重复风格。',
    '生成必须调用 movscript_create_generation_job，并等待任务完成或返回可继续查询的 Job。',
    '完成时明确给出 jobId 和 output_resource_id；UI 会把生成资源绑定回当前素材需求的候选区。',
  ].join('\n'),
  skills: [
    {
      id: 'movscript.intent.asset-candidate-generation',
      name: 'Asset Candidate Generation',
      description: 'Generate reviewable visual candidates for asset slots.',
      enabled: true,
      priority: 780,
      appliesWhen: '素材候选, asset candidate, 生成素材, 图片候选, 视频候选',
      instruction: 'Use visual generation tools to create a resource for the selected asset slot. Do not mark the asset as locked; the UI will bind the generated resource as a candidate after the run completes.',
      outputContract: 'Return the final generation status, jobId, output_resource_id, and a concise reason why the candidate fits the asset slot.',
      toolHints: [
        'movscript_create_generation_job',
        'movscript_get_generation_job',
        'movscript_list_generation_jobs',
        'movscript_cancel_generation_job',
      ],
    },
  ],
  permissions: ['project.read', 'generation.create', 'generation.read'],
  tools: [
    { name: 'movscript_get_context_pack', mode: 'allow', approval: 'never' },
    { name: 'movscript_create_generation_job', mode: 'allow', approval: 'always' },
    { name: 'movscript_get_generation_job', mode: 'allow', approval: 'never' },
    { name: 'movscript_list_generation_jobs', mode: 'allow', approval: 'never' },
    { name: 'movscript_cancel_generation_job', mode: 'allow', approval: 'always' },
  ],
}

export const ASSET_PROPOSAL_AGENT_MANIFEST: AgentManifest = {
  schema: 'movscript.agent.current',
  id: 'asset-proposal-agent',
  version: '1.0.0',
  name: '素材候选提案 Agent',
  description: '围绕当前素材需求整理提示词、参考素材、生成计划和验收标准，生成可审阅 asset_proposal 草稿。',
  soul: [
    '你是 MovScript 的素材候选提案助手。',
    '目标是把“生成候选”之前的准备工作结构化成 asset_proposal draft，而不是立即生成图片或视频。',
    '必须围绕当前 asset_slot 整理：需求定位、可用参考资源、提示词、候选计划、风险和验收标准。',
    '不要调用生成工具，不要创建 generation job，不要绑定素材候选；生成动作必须等用户审阅 proposal 后再执行。',
    '如果上下文不足以写出可执行提示词，调用 movscript_request_user_input 补齐关键设定。',
  ].join('\n'),
  skills: [
    {
      id: 'movscript.intent.asset-proposal',
      name: 'Asset Candidate Proposal',
      description: 'Plan reviewable asset candidate generation before any media job is created.',
      enabled: true,
      priority: 860,
      appliesWhen: '素材提案, asset proposal, asset_proposal, 素材候选, 生成候选, 图片候选, 视频候选',
      instruction: 'Read and edit the page-owned asset_proposal draft. Produce concrete candidate plans with prompts, reference resources, model capability recommendations, risks, and acceptance criteria. Do not create generation jobs.',
      outputContract: 'Return the asset proposal draft id, asset slot id, planned candidate count, recommended output kinds, unresolved risks, and state that the draft is local and reviewable.',
      toolHints: [
        'movscript_get_context_pack',
        'movscript_read_draft',
        'movscript_edit_draft',
        'movscript_dry_apply_draft',
        'movscript_request_user_input',
      ],
    },
  ],
  permissions: ['project.read', 'draft.read', 'draft.write'],
  tools: [
    { name: 'movscript_get_context_pack', mode: 'allow', approval: 'never' },
    { name: 'movscript_read_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_edit_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_dry_apply_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
  ],
}

export function buildAssetProposalAssistantMessage(input: {
  draftId: string
  assetSlotId: number
  slotName: string
  slotKind: string
  description?: string
  promptHint?: string
  ownerLabel?: string
  referenceResourceIds?: number[]
  candidateCount?: number
}) {
  return [
    '请为当前素材需求编写一份可审阅的素材候选生成提案，不要直接生成媒体资源。',
    '',
    buildAssetProposalDraftContractPrompt(input.draftId),
    '',
    '当前素材需求：',
    `- ID：${input.assetSlotId}`,
    `- 名称：${input.slotName}`,
    `- 类型：${input.slotKind}`,
    input.description ? `- 说明：${input.description}` : undefined,
    input.promptHint ? `- 提示词线索：${input.promptHint}` : undefined,
    input.ownerLabel ? `- 归属：${input.ownerLabel}` : undefined,
    `- 已有候选数量：${input.candidateCount ?? 0}`,
    input.referenceResourceIds?.length ? `- 可参考资源 ID：${input.referenceResourceIds.join(', ')}` : '- 可参考资源 ID：暂无',
    '',
    '请读取目标 draft，完整替换为符合协议的 JSON。完成后校验 draft，并在最终回复中给出 draftId 和候选计划摘要。',
  ].filter(Boolean).join('\n')
}

export function selectLatestGeneratedResource(run?: AgentRun): AgentGeneratedResourceRef | undefined {
  if (!run?.steps?.length) return undefined
  const refs: AgentGeneratedResourceRef[] = []
  for (const step of run.steps) {
    if (step.type !== 'tool_call') continue
    if (step.toolName !== 'movscript_create_generation_job' && step.toolName !== 'movscript_get_generation_job') continue
    const ref = generatedResourceFromToolResult(step.result)
    if (ref) refs.push(ref)
  }
  return refs.at(-1)
}

function generatedResourceFromToolResult(result: unknown): AgentGeneratedResourceRef | undefined {
  const data = isRecord(result) && isRecord(result.data) ? result.data : result
  if (!isRecord(data)) return undefined

  const outputResourceId =
    numericField(data, 'output_resource_id') ??
    numericField(data, 'outputResourceId') ??
    numericField(readRecord(data, 'output_resource'), 'ID') ??
    numericField(readRecord(data, 'output_resource'), 'id') ??
    numericField(readRecord(data, 'outputResource'), 'ID') ??
    numericField(readRecord(data, 'outputResource'), 'id') ??
    numericField(readRecord(data, 'media'), 'id')

  if (!outputResourceId) return undefined
  const job = readRecord(data, 'job')
  return {
    outputResourceId,
    jobId: numericField(data, 'jobId') ?? numericField(data, 'job_id') ?? numericField(job, 'ID') ?? numericField(job, 'id'),
  }
}

function readRecord(source: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  if (!source) return undefined
  const value = source[key]
  return isRecord(value) ? value : undefined
}

function numericField(source: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!source) return undefined
  const value = source[key]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
