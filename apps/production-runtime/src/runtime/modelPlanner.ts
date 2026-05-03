import type { JSONValue } from '../types.js'
import {
  buildBackendGatewayChatRequest,
  callBackendGatewayChat,
  resolveRuntimePlannerModelConfig,
  type RuntimeModelAuthContext,
} from './modelConfig.js'
import type { AgentInputEnvelope, AgentPlanTask, AgentTaskPlan, ToolCall } from './types.js'

export interface AgentModelPlanner {
  isEnabled(): boolean
  plan(envelope: AgentInputEnvelope, auth?: RuntimeModelAuthContext): Promise<ModelPlannerResult>
}

export interface ModelPlannerResult {
  plan: AgentTaskPlan
  toolCalls: ToolCall[]
  warnings: string[]
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ModelPlanTaskShape {
  title?: unknown
  description?: unknown
  agentRole?: unknown
  successCriteria?: unknown
  toolCalls?: unknown
}

interface ModelPlanShape {
  objective?: unknown
  strategy?: unknown
  tasks?: unknown
}

export class BackendModelPlanner implements AgentModelPlanner {
  isEnabled(): boolean {
    return !!resolvePlannerConfig()
  }

  async plan(envelope: AgentInputEnvelope, auth: RuntimeModelAuthContext = {}): Promise<ModelPlannerResult> {
    const config = resolvePlannerConfig()
    if (!config) throw new Error('model planner is not configured')

    const messages = buildPlannerMessages(envelope)
    const content = await callBackendGatewayChat(buildBackendGatewayChatRequest(config, messages, auth, {
      temperature: 0.1,
      jsonMode: true,
    }))
    const parsed = parseModelPlan(content)
    return normalizeModelPlan(parsed, envelope)
  }
}

export function createDefaultModelPlanner(): AgentModelPlanner | undefined {
  return new BackendModelPlanner()
}

function resolvePlannerConfig() {
  return resolveRuntimePlannerModelConfig()
}

function buildPlannerMessages(envelope: AgentInputEnvelope): ChatMessage[] {
  const availableTools = envelope.tools.available.map((tool) => ({
    name: tool.name,
    description: tool.description,
    risk: tool.risk,
    permission: tool.permission,
    approval: tool.approval,
    projectScoped: tool.projectScoped,
    inputSchema: tool.inputSchema,
  }))
  const blockedTools = envelope.tools.blocked.map((tool) => ({
    name: tool.name,
    reason: tool.unavailableReason,
  }))
  const skills = envelope.skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    instruction: skill.compiledInstruction || skill.instruction || skill.description,
    outputContract: skill.outputContract,
    toolHints: skill.toolHints,
  }))
  const context = {
    route: envelope.context.route,
    project: envelope.context.project,
    selection: envelope.context.selection,
    recentResources: envelope.context.recentResources.slice(0, 12),
    memories: envelope.memories.slice(-12),
  }

  return [
    {
      role: 'system',
      content: [
        'You are the MovScript local agent planner.',
        'Return ONLY compact JSON. Do not include markdown fences.',
        'Plan project work for a short drama and AI-assisted video production workspace.',
        'You may propose toolCalls only from availableTools. Never use blocked tools.',
        'Do not bypass policy, approvals, permissions, or project scope.',
        'For content creation, prefer creating a draft instead of writing formal project data.',
        'When the user asks for production orchestration or production preview planning, follow this workflow contract:',
        '1. Orchestration plans fragments/segments, scene moments, creative references, asset slots, content units, keyframes, and preview timeline items.',
        '2. Workers generate or prepare those materials as candidates or drafts first; they must not overwrite formal project data without approval.',
        '3. After materials are ready, managers enter production preview. AI may generate preview candidates to expose problems, then managers analyze preview results.',
        '4. Only after preview is accepted and no blocking asset gaps remain should formal content unit generation begin.',
        '5. Include gates, owners, dependencies, expected artifacts, and next actions for each stage.',
        'The JSON shape must be:',
        '{"objective":"...","strategy":"...","tasks":[{"title":"...","description":"...","agentRole":"planner|researcher|creator|reviewer|coordinator","successCriteria":"...","toolCalls":[{"name":"tool.name","args":{}}]}]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        userMessage: envelope.message.content,
        context,
        skills,
        availableTools,
        blockedTools,
        policy: envelope.policy,
      }),
    },
  ]
}

function parseModelPlan(content: string): ModelPlanShape {
  try {
    const parsed = JSON.parse(content)
    if (!isRecord(parsed)) throw new Error('planner JSON root must be an object')
    return parsed
  } catch (error) {
    throw new Error(`invalid model planner JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function normalizeModelPlan(input: ModelPlanShape, envelope: AgentInputEnvelope): ModelPlannerResult {
  const warnings: string[] = []
  const availableToolNames = new Set(envelope.tools.available.map((tool) => tool.name))
  const now = new Date().toISOString()
  const tasksInput = Array.isArray(input.tasks) ? input.tasks : []
  const tasks: AgentPlanTask[] = []

  for (const item of tasksInput) {
    if (!isRecord(item)) continue
    const task = normalizeTask(item, availableToolNames, warnings, now)
    if (task) tasks.push(task)
  }

  if (tasks.length === 0) {
    tasks.push({
      id: makeLocalId('task'),
      title: '直接回应',
      description: '模型 planner 没有返回可执行子任务，交由 coordinator 直接回应。',
      agentRole: 'coordinator',
      status: 'pending',
      toolCalls: [],
      createdAt: now,
      successCriteria: '给用户一个明确、可执行的回复。',
    })
    warnings.push('model planner returned no valid tasks')
  }

  const objective = nonEmptyString(input.objective) ?? trimForPlan(envelope.message.content, 180)
  const strategy = nonEmptyString(input.strategy) ?? summarizeStrategy(tasks)
  const plan: AgentTaskPlan = {
    id: makeLocalId('plan'),
    objective,
    strategy,
    tasks,
    createdAt: now,
    updatedAt: now,
  }

  return {
    plan,
    toolCalls: tasks.flatMap((task) => task.toolCalls),
    warnings,
  }
}

function normalizeTask(
  item: ModelPlanTaskShape,
  availableToolNames: Set<string>,
  warnings: string[],
  now: string,
): AgentPlanTask | undefined {
  const title = nonEmptyString(item.title)
  const description = nonEmptyString(item.description) ?? ''
  if (!title && !description) return undefined

  return {
    id: makeLocalId('task'),
    title: title ?? trimForPlan(description, 64),
    description,
    agentRole: normalizeAgentRole(item.agentRole),
    status: 'pending',
    toolCalls: normalizeToolCalls(item.toolCalls, availableToolNames, warnings),
    createdAt: now,
    ...(nonEmptyString(item.successCriteria) ? { successCriteria: nonEmptyString(item.successCriteria) } : {}),
  }
}

function normalizeToolCalls(value: unknown, availableToolNames: Set<string>, warnings: string[]): ToolCall[] {
  if (!Array.isArray(value)) return []
  const calls: ToolCall[] = []
  for (const item of value.slice(0, 8)) {
    if (!isRecord(item)) continue
    const name = nonEmptyString(item.name)
    if (!name) continue
    if (!availableToolNames.has(name)) {
      warnings.push(`model planner proposed unavailable tool: ${name}`)
      continue
    }
    calls.push({
      name,
      ...(isJSONRecord(item.args) ? { args: item.args } : {}),
    })
  }
  return calls
}

function normalizeAgentRole(value: unknown): string {
  const role = nonEmptyString(value)
  if (!role) return 'coordinator'
  return /^[a-z][a-z0-9_-]{0,31}$/i.test(role) ? role : 'coordinator'
}

function summarizeStrategy(tasks: AgentPlanTask[]): string {
  if (tasks.length === 1) return `${tasks[0].agentRole} 处理：${tasks[0].title}`
  return tasks.map((task, index) => `${index + 1}. ${task.agentRole}: ${task.title}`).join('\n')
}

function trimForPlan(value: string, maxLength: number): string {
  const text = value.trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text
}

function makeLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isJSONRecord(value: unknown): value is Record<string, JSONValue> {
  if (!isRecord(value)) return false
  return Object.values(value).every(isJSONValue)
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  return isJSONRecord(value)
}
