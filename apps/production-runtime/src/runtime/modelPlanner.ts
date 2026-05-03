import type { JSONValue } from '../types.js'
import { resolveRuntimePlannerModelConfig } from './modelConfig.js'
import type { AgentInputEnvelope, AgentPlanTask, AgentTaskPlan, ToolCall } from './types.js'

export interface AgentModelPlanner {
  isEnabled(): boolean
  plan(envelope: AgentInputEnvelope): Promise<ModelPlannerResult>
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

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
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

const DEFAULT_GATEWAY_MODEL = 'movscript-default-chat'
const DEFAULT_GATEWAY_BASE_URL = 'http://127.0.0.1:8080/v1'
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

export class OpenAICompatibleModelPlanner implements AgentModelPlanner {
  isEnabled(): boolean {
    return !!resolvePlannerConfig()
  }

  async plan(envelope: AgentInputEnvelope): Promise<ModelPlannerResult> {
    const config = resolvePlannerConfig()
    if (!config) throw new Error('model planner is not configured')

    const messages = buildPlannerMessages(envelope)
    const content = await callOpenAICompatible(config, messages)
    const parsed = parseModelPlan(content)
    return normalizeModelPlan(parsed, envelope)
  }
}

export function createDefaultModelPlanner(): AgentModelPlanner | undefined {
  return new OpenAICompatibleModelPlanner()
}

function resolvePlannerConfig(): { apiKey: string; model: string; baseURL: string; provider: string } | undefined {
  const runtimeConfig = resolveRuntimePlannerModelConfig()
  if (runtimeConfig) {
    return {
      apiKey: runtimeConfig.apiKey,
      model: runtimeConfig.model,
      baseURL: runtimeConfig.baseURL,
      provider: 'runtime-openai-compatible',
    }
  }

  const gatewayKey = process.env.MOVSCRIPT_AGENT_GATEWAY_API_KEY || process.env.MOVSCRIPT_AGENT_GATEWAY_USER_ID
  if (gatewayKey) {
    return {
      apiKey: gatewayKey,
      model: process.env.MOVSCRIPT_AGENT_PLANNER_MODEL
        || process.env.MOVSCRIPT_AGENT_GATEWAY_MODEL
        || process.env.MOVSCRIPT_AGENT_OPENAI_MODEL
        || DEFAULT_GATEWAY_MODEL,
      baseURL: process.env.MOVSCRIPT_AGENT_GATEWAY_BASE_URL
        || process.env.MOVSCRIPT_AGENT_OPENAI_BASE_URL
        || DEFAULT_GATEWAY_BASE_URL,
      provider: 'movscript-model-gateway',
    }
  }

  const apiKey = process.env.MOVSCRIPT_AGENT_OPENAI_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) return undefined
  return {
    apiKey,
    model: process.env.MOVSCRIPT_AGENT_PLANNER_MODEL
      || process.env.MOVSCRIPT_AGENT_OPENAI_MODEL
      || DEFAULT_OPENAI_MODEL,
    baseURL: process.env.MOVSCRIPT_AGENT_OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
    provider: 'openai-compatible',
  }
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
        'When the user asks for production orchestration or project preview planning, follow this workflow contract:',
        '1. Orchestration plans fragments/segments, scene moments, creative references, asset slots, content units, keyframes, and preview timeline items.',
        '2. Workers generate or prepare those materials as candidates or drafts first; they must not overwrite formal project data without approval.',
        '3. After materials are ready, managers enter project preview. AI may generate preview candidates to expose problems, then managers analyze preview results.',
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

async function callOpenAICompatible(
  config: { apiKey: string; model: string; baseURL: string; provider: string },
  messages: ChatMessage[],
): Promise<string> {
  const res = await fetch(`${config.baseURL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages,
    }),
  })

  if (!res.ok) {
    throw new Error(`model planner HTTP ${res.status}: ${await res.text()}`)
  }

  const json = await res.json() as OpenAIChatResponse
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('model planner returned no content')
  return content
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
