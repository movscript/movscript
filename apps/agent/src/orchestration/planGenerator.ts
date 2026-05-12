import { resolveRuntimePlannerModelConfig, type RuntimeModelAuthContext } from '../model/modelConfig.js'
import { callModel, type ModelCallInput, type ModelCallResult } from '../model/modelClient.js'
import type { CreatePlanTaskInput } from '../state/types.js'

export interface GeneratePlanTasksInput {
  goal: string
  title?: string
  maxTasks?: number
  auth?: RuntimeModelAuthContext
  modelConfig?: ReturnType<typeof resolveRuntimePlannerModelConfig> | null
  callModel?: (input: ModelCallInput) => Promise<ModelCallResult>
}

export interface GeneratePlanTasksResult {
  tasks: CreatePlanTaskInput[]
  source: 'model' | 'fallback'
  warnings: string[]
}

export async function generatePlanTasks(input: GeneratePlanTasksInput): Promise<GeneratePlanTasksResult> {
  const goal = normalizeNonEmptyString(input.goal)
  if (!goal) throw new Error('planner goal is required')
  const maxTasks = normalizePositiveInteger(input.maxTasks) ?? 6
  const modelConfig = input.modelConfig === undefined ? resolveRuntimePlannerModelConfig() : input.modelConfig
  if (!modelConfig) {
    return { tasks: [fallbackTask(goal)], source: 'fallback', warnings: ['planner model is not configured'] }
  }

  try {
    const model = input.callModel ?? callModel
    const result = await model({
      messages: buildPlannerMessages(goal, input.title, maxTasks),
      config: modelConfig,
      auth: input.auth,
      jsonMode: true,
      temperature: 0.1,
      retry: { maxAttempts: 1 },
    })
    const tasks = normalizePlannerResponse(result.content, maxTasks)
    if (tasks.length > 0) return { tasks, source: 'model', warnings: [] }
    return { tasks: [fallbackTask(goal)], source: 'fallback', warnings: ['planner model returned no valid tasks'] }
  } catch (error) {
    return {
      tasks: [fallbackTask(goal)],
      source: 'fallback',
      warnings: [`planner model failed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }
}

function buildPlannerMessages(goal: string, title: string | undefined, maxTasks: number): ModelCallInput['messages'] {
  return [
    {
      role: 'system',
      content: [
        'You are a planning agent for a parent/worker subagent runtime.',
        'Return only JSON with this shape: {"tasks":[{"id":"task_short_id","title":"...","description":"...","deps":["task_other"]}]}',
        `Create at most ${maxTasks} implementation tasks.`,
        'Use stable snake_case task ids prefixed with "task_".',
        'Dependencies must reference only earlier task ids.',
        'Workers execute the tasks, so each task must be concrete and independently actionable.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        title ? `Plan title: ${title}` : undefined,
        `Goal: ${goal}`,
      ].filter((line): line is string => line !== undefined).join('\n'),
    },
  ]
}

function normalizePlannerResponse(content: string | null, maxTasks: number): CreatePlanTaskInput[] {
  const parsed = parseJSON(content)
  const rawTasks = isRecord(parsed) && Array.isArray(parsed.tasks) ? parsed.tasks : []
  const tasks: CreatePlanTaskInput[] = []
  const seen = new Set<string>()
  for (const rawTask of rawTasks) {
    if (!isRecord(rawTask)) continue
    const title = normalizeNonEmptyString(rawTask.title)
    if (!title) continue
    const id = normalizeTaskId(rawTask.id, title, seen)
    seen.add(id)
    const deps = normalizeStringList(rawTask.deps).filter((dep) => seen.has(dep))
    tasks.push({
      id,
      title,
      ...(normalizeNonEmptyString(rawTask.description) ? { description: normalizeNonEmptyString(rawTask.description) } : {}),
      ...(deps.length > 0 ? { deps } : {}),
    })
    if (tasks.length >= maxTasks) break
  }
  return tasks
}

function fallbackTask(goal: string): CreatePlanTaskInput {
  return {
    id: 'task_execute_goal',
    title: titleFromGoal(goal),
    description: goal,
  }
}

function titleFromGoal(goal: string): string {
  const compact = goal.replace(/\s+/g, ' ').trim()
  if (compact.length <= 80) return compact
  return `${compact.slice(0, 77)}...`
}

function normalizeTaskId(value: unknown, title: string, seen: Set<string>): string {
  const normalized = normalizeNonEmptyString(value)
    ?.toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const base = normalized?.startsWith('task_') ? normalized : `task_${normalized || slugTitle(title)}`
  let candidate = base
  let suffix = 2
  while (seen.has(candidate)) {
    candidate = `${base}_${suffix}`
    suffix += 1
  }
  return candidate
}

function slugTitle(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return slug || 'work'
}

function parseJSON(content: string | null): unknown {
  if (!content) return undefined
  try {
    return JSON.parse(content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return undefined
    try {
      return JSON.parse(match[0])
    } catch {
      return undefined
    }
  }
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => normalizeNonEmptyString(item) ? [normalizeNonEmptyString(item)!] : [])
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return undefined
  return Math.max(1, Math.floor(number))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
