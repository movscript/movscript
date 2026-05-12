import type { AgentManifest, AgentSkillManifest, AgentToolGrant } from './agentManifest.js'

interface ModeConfig {
  id: string
  version?: string
  name: string
  description?: string
  soul?: string
  defaultSkillIds: string[]
  permissions: string[]
  tools: AgentToolGrant[]
}

const MODE_CONFIGS: ReadonlyArray<readonly [string, ModeConfig]> = [
  ['chat', {
    id: 'movscript.mode.chat',
    name: 'MovScript Chat Mode',
    description: 'General collaborative chat mode.',
    soul: '你是 MovScript 的协作助手。优先给出可执行回答；需要更多上下文时，先问清楚再展开。',
    defaultSkillIds: [],
    permissions: ['agent.input'],
    tools: [],
  }],
  ['plan', {
    id: 'movscript.mode.plan',
    name: 'MovScript Plan Mode',
    description: 'Plan-oriented collaboration mode.',
    soul: '你是 MovScript 的计划助手。先拆解目标、依赖、风险和下一步行动，再给出简洁计划。',
    defaultSkillIds: ['movscript.intent.mode.plan'],
    permissions: ['agent.input'],
    tools: [],
  }],
  ['create', {
    id: 'movscript.mode.create',
    name: 'MovScript Create Mode',
    description: 'Creation-oriented collaboration mode.',
    soul: '你是 MovScript 的创作助手。偏向产出可直接使用的内容、草稿、文案或结构化结果。',
    defaultSkillIds: ['movscript.intent.mode.create'],
    permissions: ['agent.input'],
    tools: [],
  }],
  ['review', {
    id: 'movscript.mode.review',
    name: 'MovScript Review Mode',
    description: 'Review-oriented collaboration mode.',
    soul: '你是 MovScript 的审阅助手。优先发现问题、缺口、风险和返工点，并给出修改建议。',
    defaultSkillIds: ['movscript.intent.mode.review'],
    permissions: ['agent.input'],
    tools: [],
  }],
  ['project-orchestration', {
    id: 'movscript.mode.project-orchestration',
    name: '项目提案助手',
    description: '整理项目级设定、素材需求和跨制作引用，生成可审阅的设定/素材草稿。',
    soul: `你是项目级提案助手。你的目标是帮助用户治理项目设定和素材需求，并把最终草稿收敛为可审阅的设定/素材提案。

只写本地 draft，不直接改正式项目实体。
draft 是可审阅的局部语义补丁，不是最终结果，也不是 operation log。
draft 会通过 merge 机制应用；没有写进 draft 的实体和字段不会被修改。
项目提案内部按两层组织：先整理设定资料本体，再整理依附于设定资料的素材/视图需求。
输出只围绕设定资料和素材需求的新增、局部修改、设定资料合并建议，以及素材需求归属调整。
不要要求删除、锁定或生成执行类 operation；不需要改的内容写进 summary/impact_notes，不要复制到 proposal 节点里。
不要生成制作项、关键帧、台词终稿、运镜表或 prompt。制作编排只引用项目编排的结果。`,
    defaultSkillIds: ['movscript.intent.project-proposal'],
    permissions: ['project.read', 'draft.read', 'draft.write'],
    tools: [
      { name: 'movscript_get_current_context', mode: 'allow', approval: 'never' },
      { name: 'movscript_create_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_get_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_list_drafts', mode: 'allow', approval: 'never' },
      { name: 'movscript_update_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_read_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
    ],
  }],
  ['production-orchestration', {
    id: 'movscript.mode.production-orchestration',
    name: '制作提案助手',
    description: '在项目提案之后生成可审阅的制作情绪段与情景草稿。',
    soul: `你是制作级提案助手。你的职责是把当前制作拆成情绪段、情景和可审阅的制作结构，并把每个情景引用到项目级设定和素材需求上。

这是双阶段提案流程的第二阶段。第一阶段 project_proposal 负责设定资料和素材需求本体；第二阶段 production_proposal 只消费项目编排结果。
必须先读取上游 project_proposal draft，再读取当前制作和剧本上下文，然后才能写 production_proposal。
如果发现需要新增或修正项目级设定、项目级素材需求，不要在 production_proposal 里直接创建；应提示用户回到项目编排或使用上游项目提案处理。
production_proposal 只能写本地 draft，不直接改正式项目实体。
每个制作节点使用 action: create | reuse | update；reuse/update 必须带已有实体 ID。`,
    defaultSkillIds: ['movscript.intent.production-proposal'],
    permissions: ['project.read', 'draft.read', 'draft.write'],
    tools: [
      { name: 'movscript_get_current_context', mode: 'allow', approval: 'never' },
      { name: 'movscript_create_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_get_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_list_drafts', mode: 'allow', approval: 'never' },
      { name: 'movscript_update_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_read_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
    ],
  }],
  ['dual-orchestration', {
    id: 'movscript.mode.dual-orchestration',
    name: '双阶段提案助手',
    description: '同时维护项目提案和制作提案两个本地草稿。',
    soul: `你是双阶段提案助手。你必须同时维护两个本地草稿：project_proposal 和 production_proposal。
先完成 project_proposal，再基于它完成 production_proposal。
不要直接改正式项目实体；所有输出都要先落到本地草稿。
project_proposal 是项目级设定和素材需求的局部合并补丁；production_proposal 是制作级结构与情景的审阅草稿。
如果其中任一步信息不足，先使用 movscript_request_user_input 补齐，再继续。`,
    defaultSkillIds: ['movscript.intent.dual-orchestration'],
    permissions: ['project.read', 'draft.read', 'draft.write'],
    tools: [
      { name: 'movscript_get_current_context', mode: 'allow', approval: 'never' },
      { name: 'movscript_create_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_get_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_list_drafts', mode: 'allow', approval: 'never' },
      { name: 'movscript_update_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_read_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
    ],
  }],
  ['asset-proposal', {
    id: 'movscript.mode.asset-proposal',
    name: '素材候选提案 Agent',
    description: '围绕当前素材需求整理提示词、参考素材、生成计划和验收标准，生成可审阅 asset_proposal 草稿。',
    soul: `你是 MovScript 的素材候选提案助手。
目标是把“生成候选”之前的准备工作结构化成 asset_proposal draft，而不是立即生成图片或视频。
必须围绕当前 asset_slot 整理：需求定位、可用参考资源、提示词、候选计划、风险和验收标准。
不要调用生成工具，不要创建 generation job，不要绑定素材候选；生成动作必须等用户审阅 proposal 后再执行。
如果上下文不足以写出可执行提示词，调用 movscript_request_user_input 补齐关键设定。`,
    defaultSkillIds: ['movscript.intent.asset-proposal'],
    permissions: ['project.read', 'draft.read', 'draft.write'],
    tools: [
      { name: 'movscript_get_current_context', mode: 'allow', approval: 'never' },
      { name: 'movscript_read_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
    ],
  }],
  ['content-unit-proposal', {
    id: 'movscript.mode.content-unit-proposal',
    name: '内容单元提案助手',
    description: '基于当前情景上下文生成可审阅的内容单元提案。',
    soul: `你是 MovScript 的内容单元提案助手。你的任务是基于当前选中的情景、制作上下文和用户补充，提出 3-6 条尚未创建的内容单元提案。

只返回可解析 JSON，不要 Markdown 代码块或额外说明。
JSON 结构必须是 {"units": [...]}。
每个 unit 可包含 title、kind、description、prompt、duration_sec、shot_size、camera_angle、camera_motion。
kind 只能使用 shot、visual_segment、caption_card、narration、transition、music_beat、product_showcase。
避免与已有内容单元重复；每条建议聚焦一个清晰动作、信息揭示、情绪节拍或转场功能。`,
    defaultSkillIds: ['movscript.intent.content-unit-proposal'],
    permissions: ['agent.input', 'project.read'],
    tools: [
      { name: 'movscript_get_current_context', mode: 'allow', approval: 'never' },
      { name: 'movscript_create_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_get_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_list_drafts', mode: 'allow', approval: 'never' },
      { name: 'movscript_update_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_read_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
    ],
  }],
  ['content-unit-media-proposal', {
    id: 'movscript.mode.content-unit-media-proposal',
    name: '内容单元媒体提案助手',
    description: '围绕内容单元生成关键帧或视频计划。',
    soul: '你是内容单元媒体提案助手。你的任务是围绕当前 content_unit draft 生成关键帧或视频计划，而不是直接生成最终媒体资源。',
    defaultSkillIds: ['movscript.intent.content-unit-media-proposal'],
    permissions: ['agent.input', 'project.read'],
    tools: [
      { name: 'movscript_get_current_context', mode: 'allow', approval: 'never' },
      { name: 'movscript_create_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_get_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_list_drafts', mode: 'allow', approval: 'never' },
      { name: 'movscript_update_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_read_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
    ],
  }],
  ['asset-candidate-generation', {
    id: 'movscript.mode.asset-candidate-generation',
    name: '素材候选生成 Agent',
    description: '围绕当前素材需求生成图片或视频资源，供 UI 自动绑定为素材候选。',
    soul: '你是 MovScript 的素材候选生成助手。目标是围绕当前 asset_slot 生成一个可审阅的图片或视频候选，不要直接锁定最终素材。先判断输出应为图片还是视频；如果用户没有特别指定，按素材需求类型和上下文选择。',
    defaultSkillIds: ['movscript.intent.asset-candidate-generation'],
    permissions: ['project.read', 'generation.create', 'generation.read'],
    tools: [
      { name: 'movscript_get_current_context', mode: 'allow', approval: 'never' },
      { name: 'movscript_create_generation_job', mode: 'allow', approval: 'always' },
      { name: 'movscript_get_generation_job', mode: 'allow', approval: 'never' },
      { name: 'movscript_list_generation_jobs', mode: 'allow', approval: 'never' },
      { name: 'movscript_cancel_generation_job', mode: 'allow', approval: 'always' },
    ],
  }],
  ['creative-workbench', {
    id: 'movscript.mode.creative-workbench',
    name: 'MovScript Creative Workbench',
    description: 'Brainstorm and refine story material for a selected insight.',
    soul: '你是 MovScript 项目头脑风暴助手。请先和用户多轮讨论、追问、收敛创意；不要急着改页面。只有当用户明确要求“写入页面 / 应用 / 定稿 / 使用这个版本”时，再输出可写入的结果。',
    defaultSkillIds: ['movscript.intent.creative-workbench'],
    permissions: ['project.read', 'draft.read', 'draft.write'],
    tools: [
      { name: 'movscript_get_current_context', mode: 'allow', approval: 'never' },
      { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
    ],
  }],
  ['script-split', {
    id: 'movscript.mode.script-split',
    name: '一键制作 Agent',
    description: '把剧本或提示词转成可写入 MovScript 的制作方案、设定上下文和制作决策草稿。',
    soul: '你是 MovScript 的一键制作专用 Agent 会话。你的任务是把用户提供的剧本、brief 或提示词拆成可制作的剧本段，并判断每一段是否应该新建、更新或跳过一个制作。',
    defaultSkillIds: ['movscript.intent.script-split'],
    permissions: ['project.read', 'draft.read', 'draft.write'],
    tools: [
      { name: 'movscript_get_current_context', mode: 'allow', approval: 'never' },
      { name: 'movscript_create_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_get_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_list_drafts', mode: 'allow', approval: 'never' },
      { name: 'movscript_update_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_read_draft', mode: 'allow', approval: 'never' },
      { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
    ],
  }],
  ['setting-prep', {
    id: 'movscript.mode.setting-prep',
    name: '设定准备助手',
    description: '补齐设定资料、指出冲突并整理可直接用于制作的稳定描述。',
    soul: '你是 MovScript 的设定准备助手。你的任务是帮助用户补齐设定、指出冲突、整理可直接用于制作的稳定描述。',
    defaultSkillIds: ['movscript.intent.setting-prep'],
    permissions: ['project.read', 'draft.read', 'draft.write'],
    tools: [
      { name: 'movscript_get_current_context', mode: 'allow', approval: 'never' },
      { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
    ],
  }],
]

const MODES = new Map<string, ModeConfig>(MODE_CONFIGS)

export function resolveModeAgentManifest(
  mode?: string,
  base?: AgentManifest,
  skillCatalog: AgentSkillManifest[] = [],
): AgentManifest | undefined {
  const key = typeof mode === 'string' ? mode.trim() : ''
  if (!key) return undefined
  const config = MODES.get(key)
  if (!config) return undefined
  const modeManifest = buildModeManifest(config, skillCatalog)
  if (!base) return modeManifest
  return {
    ...base,
    id: modeManifest.id,
    version: modeManifest.version,
    name: modeManifest.name,
    description: modeManifest.description ?? base.description,
    soul: modeManifest.soul ?? base.soul,
    skills: mergeSkills(base.skills, modeManifest.skills),
    permissions: mergeStrings(base.permissions, modeManifest.permissions),
    tools: mergeTools(base.tools, modeManifest.tools),
    metadata: {
      ...(base.metadata ?? {}),
      mode: key,
      baseAgentId: base.id,
    },
  }
}

function buildModeManifest(config: ModeConfig, skillCatalog: AgentSkillManifest[]): AgentManifest {
  const catalogById = new Map(skillCatalog.map((s) => [s.id, s]))
  const skills: AgentSkillManifest[] = []
  for (const id of config.defaultSkillIds) {
    const entry = catalogById.get(id)
    if (entry) skills.push(entry)
  }
  return {
    schema: 'movscript.agent.current',
    id: config.id,
    version: config.version ?? '1.0.0',
    name: config.name,
    ...(config.description ? { description: config.description } : {}),
    ...(config.soul ? { soul: config.soul } : {}),
    skills,
    permissions: config.permissions,
    tools: config.tools,
  }
}

function mergeStrings(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right]))
}

function mergeSkills(left: AgentSkillManifest[], right: AgentSkillManifest[]): AgentSkillManifest[] {
  const byId = new Map<string, AgentSkillManifest>()
  for (const item of left) byId.set(item.id, item)
  for (const item of right) byId.set(item.id, item)
  return Array.from(byId.values())
}

function mergeTools(left: AgentManifest['tools'], right: AgentManifest['tools']): AgentManifest['tools'] {
  const byName = new Map<string, AgentManifest['tools'][number]>()
  for (const item of left) byName.set(item.name, item)
  for (const item of right) byName.set(item.name, item)
  return Array.from(byName.values())
}
