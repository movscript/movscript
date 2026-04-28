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

  return {
    toolCalls,
    plan: {
      id: makeLocalId('plan'),
      objective: trimForTool(message, 180),
      strategy: summarizeStrategy(tasks),
      tasks,
      createdAt: now,
      updatedAt: now,
    },
  }
}

export function planToolCalls(message: string, memories: AgentMemory[] = []): ToolCall[] {
  const calls: ToolCall[] = []

  if (wantsProjectLookup(message)) {
    const readTarget = inferReadTarget(message)
    if (readTarget) {
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
          query: trimForTool(message, 160),
          limit: 10,
        },
      })
    }
  }

  if (wantsDraft(message)) {
    const memoryBlock = formatMemoryBlock(memories)
    calls.push({
      name: 'movscript.create_draft',
      args: {
        kind: inferDraftKind(message),
        title: inferDraftTitle(message),
        content: [
          '这是 movscript-agent 第一阶段生成的本地草稿，不会写入项目实体，也不会触发生成任务。',
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
  const readCalls = toolCalls.filter((call) => call.name === 'movscript.read_entity' || call.name === 'movscript.search_entities')
  const draftCalls = toolCalls.filter((call) => call.name === 'movscript.create_draft')

  if (wantsPlanning(message) || toolCalls.length > 0) {
    tasks.push({
      id: makeLocalId('task'),
      title: wantsPlanning(message) ? '拆解目标和执行顺序' : '确认执行路径',
      description: '根据用户目标、当前项目上下文和可用记忆确定下一步。',
      agentRole: 'planner',
      status: 'pending',
      toolCalls: [],
      createdAt: now,
    })
  }

  if (readCalls.length > 0) {
    tasks.push({
      id: makeLocalId('task'),
      title: readCalls.some((call) => call.name === 'movscript.read_entity') ? '读取指定项目实体' : '检索项目内容',
      description: '调用项目工具获取和请求相关的剧本、分镜、镜头、素材或任务信息。',
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

export function formatMemoryBlock(memories: AgentMemory[], limit = 12): string {
  return memories
    .filter((memory) => memory.content.trim().length > 0)
    .slice(-limit)
    .map((memory) => `- ${memory.scope}/${memory.kind}: ${memory.content.trim()}`)
    .join('\n')
}

function wantsProjectLookup(message: string): boolean {
  return /查|找|搜索|检索|读取|查看|列出|有哪些|项目内容|剧本|设定|角色|资产|场景|分镜|镜头|任务|search|find|lookup|read|list|show|project|script|setting|asset|scene|storyboard|shot|task/i.test(message)
}

function wantsDraft(message: string): boolean {
  return /草稿|起草|写一版|写个|帮我写|生成.*稿|create.*draft|draft|proposal|outline/i.test(message)
}

function wantsPlanning(message: string): boolean {
  return /计划|规划|拆解|步骤|任务|子任务|执行路径|plan|planning|breakdown|task/i.test(message)
}

function inferReadTarget(message: string): { entityType: string; entityId: number } | undefined {
  const match = message.match(/(script|setting|asset|episode|scene|storyboard|shot|task|剧本|设定|资产|集|场景|分镜|镜头|任务)\s*#?\s*(\d+)/i)
  if (!match) return undefined
  return {
    entityType: normalizeEntityType(match[1]),
    entityId: Number(match[2]),
  }
}

function normalizeEntityType(value: string): string {
  const lower = value.toLowerCase()
  const map: Record<string, string> = {
    script: 'script',
    setting: 'setting',
    asset: 'asset',
    episode: 'episode',
    scene: 'scene',
    storyboard: 'storyboard',
    shot: 'shot',
    task: 'task',
    '剧本': 'script',
    '设定': 'setting',
    '资产': 'asset',
    '集': 'episode',
    '场景': 'scene',
    '分镜': 'storyboard',
    '镜头': 'shot',
    '任务': 'task',
  }
  return map[lower] ?? 'script'
}

function inferDraftKind(message: string): string {
  if (/镜头|shot/i.test(message)) return 'shot'
  if (/分镜|storyboard/i.test(message)) return 'storyboard'
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
