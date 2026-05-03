import type { AgentMemory } from './memory/types.js'
import type { AgentPlanTask, AgentTaskPlan, ToolCall } from './types.js'

export interface PlannedAgentRun {
  plan: AgentTaskPlan
  toolCalls: ToolCall[]
}

export function planAgentRun(message: string, memories: AgentMemory[] = []): PlannedAgentRun {
  const toolCalls = planToolCalls(message, memories)
  const tasks = buildPlanTasks(message, toolCalls)
  const now = new Date().toISOString()
  const intentText = stripInteractionCommand(message)

  return {
    toolCalls,
    plan: {
      id: makeLocalId('plan'),
      objective: trimForTool(intentText || message, 180),
      strategy: summarizeStrategy(tasks),
      tasks,
      createdAt: now,
      updatedAt: now,
    },
  }
}

export function planToolCalls(message: string, memories: AgentMemory[] = []): ToolCall[] {
  const calls: ToolCall[] = []
  const planningCommand = parseInteractionCommand(message)
  const intentText = stripInteractionCommand(message)

  if (planningCommand === 'inspect_context') {
    return calls
  }

  const applyDraft = planningCommand === 'apply_draft'
    ? inferApplyDraftCallFromCommand(intentText)
    : inferApplyDraftCall(message)
  if (applyDraft) {
    calls.push(applyDraft)
    return calls
  }

  if (planningCommand === 'list_drafts' || wantsDraftList(message)) {
    calls.push({
      name: 'movscript.list_drafts',
      args: {
        limit: 20,
      },
    })
    return calls
  }

  if (planningCommand === 'read_entity') {
    const readTarget = inferReadTarget(intentText)
    if (readTarget) {
      calls.push({
        name: 'movscript.read_entity',
        args: {
          entityType: readTarget.entityType,
          entityId: readTarget.entityId,
        },
      })
      return calls
    }
  }

  if (planningCommand === 'draft') {
    const memoryBlock = formatMemoryBlock(memories)
    const draftPrompt = intentText || message
    calls.push({
      name: 'movscript.create_draft',
      args: {
        kind: inferDraftKind(draftPrompt),
        title: inferDraftTitle(draftPrompt),
        content: [
          '这是 MovScript production runtime 第一阶段生成的本地草稿，不会写入项目实体，也不会触发生成任务。',
          memoryBlock ? `\n[必须遵循的相关记忆]\n${memoryBlock}` : '',
          '',
          `用户请求：${message.trim()}`,
        ].filter((line) => line !== '').join('\n'),
      },
    })
    return calls
  }

  if (planningCommand === 'project_structure') {
    calls.push({
      name: 'movscript.read_project_structure',
      args: {
        limit: 50,
      },
    })
    return calls
  }

  if (planningCommand === 'production_plan' || wantsProductionOrchestration(intentText)) {
    calls.push({
      name: 'movscript.read_project_structure',
      args: {
        limit: 50,
      },
    })
    return calls
  }

  if (wantsProjectStructure(intentText)) {
    calls.push({
      name: 'movscript.read_project_structure',
      args: {
        limit: 50,
      },
    })
  }

  if (planningCommand === 'search' || wantsProjectLookup(intentText)) {
    const readTarget = inferReadTarget(intentText)
    if (planningCommand !== 'search' && readTarget) {
      calls.push({
        name: 'movscript.read_entity',
        args: {
          entityType: readTarget.entityType,
          entityId: readTarget.entityId,
        },
      })
    } else {
      calls.push({
        name: 'movscript.search_entities',
        args: {
          query: trimForTool(intentText || message, 160),
          limit: 10,
        },
      })
    }
  }

  if (wantsDraft(intentText)) {
    const memoryBlock = formatMemoryBlock(memories)
    const draftPrompt = intentText || message
    calls.push({
      name: 'movscript.create_draft',
      args: {
        kind: inferDraftKind(draftPrompt),
        title: inferDraftTitle(draftPrompt),
        content: [
          '这是 MovScript production runtime 第一阶段生成的本地草稿，不会写入项目实体，也不会触发生成任务。',
          memoryBlock ? `\n[必须遵循的相关记忆]\n${memoryBlock}` : '',
          '',
          `用户请求：${message.trim()}`,
        ].filter((line) => line !== '').join('\n'),
      },
    })
  }

  return calls
}

export function buildPlanTasks(message: string, toolCalls: ToolCall[]): AgentPlanTask[] {
  const now = new Date().toISOString()
  const tasks: AgentPlanTask[] = []
  const planningCommand = parseInteractionCommand(message)
  const intentText = stripInteractionCommand(message)
  const structureCalls = toolCalls.filter((call) => call.name === 'movscript.read_project_structure')
  const readCalls = toolCalls.filter((call) => call.name === 'movscript.read_entity' || call.name === 'movscript.search_entities')
  const draftCalls = toolCalls.filter((call) => call.name === 'movscript.create_draft')
  const draftListCalls = toolCalls.filter((call) => call.name === 'movscript.list_drafts')
  const applyDraftCalls = toolCalls.filter((call) => call.name === 'movscript.apply_draft')

  if (planningCommand === 'production_plan' || wantsProductionOrchestration(intentText)) {
    return buildProductionOrchestrationTasks(now, structureCalls)
  }

  if (planningCommand === 'inspect_context') {
    tasks.push({
      id: makeLocalId('task'),
      title: '输出运行上下文',
      description: '将当前 route、project、selection、resources、attachments 和 memories 作为文本 JSON 返回，供前端自行渲染。',
      agentRole: 'coordinator',
      status: 'pending',
      toolCalls: [],
      createdAt: now,
      successCriteria: '助手消息是可解析 JSON，且不依赖专用 UI 组件表达。',
    })
    return tasks
  }

  if (wantsPlanning(intentText) || toolCalls.length > 0) {
    tasks.push({
      id: makeLocalId('task'),
      title: wantsPlanning(intentText) ? '拆解目标和执行顺序' : '确认执行路径',
      description: '根据用户目标、当前项目上下文和可用记忆确定下一步。',
      agentRole: 'planner',
      status: 'pending',
      toolCalls: [],
      createdAt: now,
    })
  }

  if (structureCalls.length > 0) {
    tasks.push({
      id: makeLocalId('task'),
      title: '读取项目结构',
      description: '读取剧本、设定、语义生产实体、素材位和管线节点的结构摘要。',
      agentRole: 'researcher',
      status: 'pending',
      toolCalls: structureCalls,
      createdAt: now,
      successCriteria: '获得足够的项目结构信息，用于判断进度、缺口和下一步。',
    })
  }

  if (readCalls.length > 0) {
    tasks.push({
      id: makeLocalId('task'),
      title: readCalls.some((call) => call.name === 'movscript.read_entity') ? '读取指定项目实体' : '检索项目内容',
      description: '调用项目工具获取和请求相关的剧本、语义生产实体、素材位或任务信息。',
      agentRole: 'researcher',
      status: 'pending',
      toolCalls: readCalls,
      createdAt: now,
    })
  }

  if (draftCalls.length > 0) {
    tasks.push({
      id: makeLocalId('task'),
      title: '生成可落地草稿',
      description: '基于用户请求、当前项目和相关记忆生成本地草稿。',
      agentRole: 'creator',
      status: 'pending',
      toolCalls: draftCalls,
      createdAt: now,
    })
  }

  if (draftListCalls.length > 0) {
    tasks.push({
      id: makeLocalId('task'),
      title: '列出现有草稿',
      description: '读取当前项目的 Agent 本地草稿，供用户审查。',
      agentRole: 'coordinator',
      status: 'pending',
      toolCalls: draftListCalls,
      createdAt: now,
    })
  }

  if (applyDraftCalls.length > 0) {
    tasks.push({
      id: makeLocalId('task'),
      title: '申请应用草稿',
      description: '准备草稿应用预览，并等待用户审批后再更新草稿生命周期。',
      agentRole: 'coordinator',
      status: 'pending',
      toolCalls: applyDraftCalls,
      createdAt: now,
    })
  }

  if (tasks.length === 0) {
    tasks.push({
      id: makeLocalId('task'),
      title: '直接回应',
      description: '当前请求不需要项目工具，整理上下文后直接回复。',
      agentRole: 'coordinator',
      status: 'pending',
      toolCalls: [],
      createdAt: now,
    })
  }

  return tasks
}

function buildProductionOrchestrationTasks(now: string, structureCalls: ToolCall[]): AgentPlanTask[] {
  const tasks: AgentPlanTask[] = [
    {
      id: makeLocalId('task'),
      title: '读取项目事实源',
      description: '读取当前项目的剧本、设定、片段、情节、创作资料、素材位、内容单元、关键帧、预演时间线和管线节点，先确认已有事实和缺口。',
      agentRole: 'planner',
      status: 'pending',
      toolCalls: structureCalls,
      createdAt: now,
      successCriteria: '得到足够的项目结构摘要，能判断哪些制作对象已存在、哪些对象需要生成或补齐。',
    },
    {
      id: makeLocalId('task'),
      title: '规划制作对象清单',
      description: '把编排阶段拆成可审查的对象：片段、情节、创作资料、素材位、内容单元、关键帧候选和预演时间线，并标注来源、负责人、阻塞关系和验收口径。',
      agentRole: 'planner',
      status: 'pending',
      toolCalls: [],
      createdAt: now,
      successCriteria: '输出完整对象清单，管理人员能看出每个对象为什么需要、由谁处理、完成后交付到哪里。',
    },
    {
      id: makeLocalId('task'),
      title: '分派工作人员生成素材',
      description: '按对象类型安排 worker：资料整理、素材准备、内容单元草稿、关键帧候选、预演时间线；所有产物先进入候选或本地草稿，不直接覆盖正式项目数据。',
      agentRole: 'coordinator',
      status: 'pending',
      toolCalls: [],
      createdAt: now,
      successCriteria: '形成工作人员任务队列，明确每个任务的输入、输出、依赖、是否需要 AI 生成和人工确认门禁。',
    },
    {
      id: makeLocalId('task'),
      title: '管理人员项目预演',
      description: '素材准备完成后进入项目预演，汇总时间线、关键帧和素材缺口，允许 AI 先自动生成候选以快速暴露问题，再交由管理人员分析预演结果。',
      agentRole: 'reviewer',
      status: 'pending',
      toolCalls: [],
      createdAt: now,
      successCriteria: '给出预演检查项：叙事连续性、素材可用性、内容单元覆盖率、关键帧一致性、风险和返工点。',
    },
    {
      id: makeLocalId('task'),
      title: '进入正式内容单元生成',
      description: '只有当预演无阻塞并被确认后，才启动真实内容单元生成；否则把问题退回对应 worker 任务或素材缺口。',
      agentRole: 'coordinator',
      status: 'pending',
      toolCalls: [],
      createdAt: now,
      successCriteria: '明确 ready_for_production 门禁和下一步生成策略，避免在素材或预演未确认时开始正式生成。',
    },
  ]

  if (structureCalls.length === 0) {
    tasks[0] = {
      ...tasks[0],
      status: 'skipped',
      successCriteria: '当前没有可执行的项目结构读取工具；用前端提供的页面事实先生成规划草案。',
    }
  }

  return tasks
}

function parseInteractionCommand(message: string): 'production_plan' | 'draft' | 'inspect_context' | 'project_structure' | 'list_drafts' | 'apply_draft' | 'search' | 'read_entity' | undefined {
  const firstToken = message.trim().split(/\s+/, 1)[0]
  if (firstToken === '/production_plan' || firstToken === '/project_plan') return 'production_plan'
  if (firstToken === '/draft') return 'draft'
  if (firstToken === '/inspect_context' || firstToken === '/context') return 'inspect_context'
  if (firstToken === '/project_structure') return 'project_structure'
  if (firstToken === '/list_drafts' || firstToken === '/drafts') return 'list_drafts'
  if (firstToken === '/apply_draft') return 'apply_draft'
  if (firstToken === '/search') return 'search'
  if (firstToken === '/read_entity') return 'read_entity'
  return undefined
}

function stripInteractionCommand(message: string): string {
  return message.trim().replace(/^\/[a-zA-Z0-9_-]+\s*/, '').trim()
}

export function formatMemoryBlock(memories: AgentMemory[], limit = 12): string {
  return memories
    .filter((memory) => memory.content.trim().length > 0)
    .slice(-limit)
    .map((memory) => `- ${memory.scope}/${memory.kind}: ${memory.content.trim()}`)
    .join('\n')
}

function wantsProjectLookup(message: string): boolean {
  return /查|找|搜索|检索|读取|查看|列出|有哪些|项目内容|剧本|设定|角色|资产|素材位|资产位|场景|情节|分镜|镜头|内容单元|关键帧|任务|search|find|lookup|read|list|show|project|script|setting|asset|asset_slot|segment|scene|scene_moment|storyboard|storyboard_line|content_unit|shot|keyframe|task/i.test(message)
}

function wantsDraft(message: string): boolean {
  return /草稿|起草|写一版|写个|帮我写|生成.*稿|create.*draft|draft|proposal|outline/i.test(message)
}

function wantsDraftList(message: string): boolean {
  return /(列出|查看|有哪些|已有|现有|list|show).*(草稿|draft)|草稿.*(列表|有哪些|已有|现有|list|show)/i.test(message)
}

function wantsProjectStructure(message: string): boolean {
  return /当前项目|项目进度|进度|还差|缺口|规划|下一步|段落|情节|场景|分镜|镜头|内容单元|素材位|资产位|管线|segment|scene|scene_moment|storyboard|storyboard_line|content_unit|shot|asset_slot|pipeline|project status|project progress|gap|missing/i.test(message)
}

function wantsProductionOrchestration(message: string): boolean {
  return /制作编排|编排阶段|制作预演|预演结果|工作人员|管理人员|素材准备|正式.*内容单元|内容单元.*生成|production orchestration|production preview|production plan|preview result|worker|manager/i.test(message)
}

function inferApplyDraftCall(message: string): ToolCall | undefined {
  if (!/(应用|采纳|接受|确认|保存|写入|apply|accept|save).*(草稿|draft)|草稿.*(应用|采纳|接受|确认|保存|写入|apply|accept|save)/i.test(message)) {
    return undefined
  }
  const draftId = inferDraftId(message)
  if (!draftId) return undefined
  const target = inferApplyTarget(message)
  return {
    name: 'movscript.apply_draft',
    args: {
      draftId,
      ...(target.entityType ? { targetEntityType: target.entityType } : {}),
      ...(target.entityId !== undefined ? { targetEntityId: target.entityId } : {}),
      ...(target.field ? { targetField: target.field } : {}),
    },
  }
}

function inferApplyDraftCallFromCommand(message: string): ToolCall | undefined {
  const draftId = inferDraftId(message)
  if (!draftId) return undefined
  const target = inferApplyTarget(message)
  return {
    name: 'movscript.apply_draft',
    args: {
      draftId,
      ...(target.entityType ? { targetEntityType: target.entityType } : {}),
      ...(target.entityId !== undefined ? { targetEntityId: target.entityId } : {}),
      ...(target.field ? { targetField: target.field } : {}),
    },
  }
}

function inferDraftId(message: string): string | undefined {
  const explicit = message.match(/draft_[a-z0-9_]+/i)
  if (explicit) return explicit[0]
  const hash = message.match(/草稿\s*#\s*([a-z0-9_-]+)/i)
  return hash?.[1]
}

function inferApplyTarget(message: string): { entityType?: string; entityId?: number; field?: string } {
  const readTarget = inferReadTarget(message)
  const fieldMatch = message.match(/(?:字段|field)\s*[:：]?\s*([a-zA-Z_][a-zA-Z0-9_]*)/)
  return {
    ...(readTarget ? { entityType: readTarget.entityType, entityId: readTarget.entityId } : {}),
    ...(fieldMatch?.[1] ? { field: fieldMatch[1] } : {}),
  }
}

function wantsPlanning(message: string): boolean {
  return /计划|规划|拆解|步骤|任务|子任务|执行路径|plan|planning|breakdown|task/i.test(message)
}

function inferReadTarget(message: string): { entityType: string; entityId: number } | undefined {
  const match = message.match(/(script|setting|asset_slot|asset-slot|asset|segment|episode|scene_moment|scene-moment|scene|storyboard_line|storyboard-line|storyboard_script|storyboard-script|storyboard|content_unit|content-unit|shot|keyframe|task|剧本|设定|素材位|资产位|资产|段落|集|情节|场景|分镜行|分镜脚本|分镜|内容单元|镜头|关键帧|任务)\s*#?\s*(\d+)/i)
  if (!match) return undefined
  return {
    entityType: normalizeEntityType(match[1]),
    entityId: Number(match[2]),
  }
}

function normalizeEntityType(value: string): string {
  const lower = value.toLowerCase().replace(/-/g, '_')
  const map: Record<string, string> = {
    script: 'script',
    setting: 'setting',
    asset: 'asset_slot',
    asset_slot: 'asset_slot',
    episode: 'segment',
    segment: 'segment',
    scene: 'scene_moment',
    scene_moment: 'scene_moment',
    storyboard: 'storyboard_line',
    storyboard_script: 'storyboard_script',
    storyboard_line: 'storyboard_line',
    shot: 'content_unit',
    content_unit: 'content_unit',
    keyframe: 'keyframe',
    task: 'task',
    '剧本': 'script',
    '设定': 'setting',
    '资产': 'asset_slot',
    '素材位': 'asset_slot',
    '资产位': 'asset_slot',
    '集': 'segment',
    '段落': 'segment',
    '场景': 'scene_moment',
    '情节': 'scene_moment',
    '分镜': 'storyboard_line',
    '分镜行': 'storyboard_line',
    '分镜脚本': 'storyboard_script',
    '镜头': 'content_unit',
    '内容单元': 'content_unit',
    '关键帧': 'keyframe',
    '任务': 'task',
  }
  return map[lower] ?? 'script'
}

function inferDraftKind(message: string): string {
  if (/素材位|资产位|asset[_ -]?slot|asset/i.test(message)) return 'asset_slot'
  if (/镜头|内容单元|shot|content[_ -]?unit/i.test(message)) return 'content_unit'
  if (/分镜|storyboard/i.test(message)) return 'storyboard_line'
  if (/任务|task/i.test(message)) return 'task'
  if (/提示词|prompt/i.test(message)) return 'prompt'
  if (/设定|setting|角色/.test(message)) return 'setting'
  if (/剧本|script/.test(message)) return 'script'
  return 'note'
}

function inferDraftTitle(message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim()
  return trimForTool(normalized || 'Agent draft', 48)
}

function trimForTool(value: string, maxLength: number): string {
  const text = value.trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text
}

function summarizeStrategy(tasks: AgentPlanTask[]): string {
  if (tasks.length === 1) return `${tasks[0].agentRole} 处理：${tasks[0].title}`
  return tasks.map((task, index) => `${index + 1}. ${task.agentRole}: ${task.title}`).join('\n')
}

function makeLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
