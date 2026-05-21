import { resolveRuntimePlannerModelConfig, type RuntimeModelAuthContext } from '../model/modelConfig.js'
import { callModel, type ModelCallInput, type ModelCallResult } from '../model/modelClient.js'
import { cloneJSONValue, isJSONRecord, isRecord } from '../jsonValue.js'
import type { CreatePlanTaskInput, JSONValue } from '../state/types.js'

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
  assessment?: Record<string, JSONValue>
}

export async function generatePlanTasks(input: GeneratePlanTasksInput): Promise<GeneratePlanTasksResult> {
  const goal = normalizeNonEmptyString(input.goal)
  if (!goal) throw new Error('planner goal is required')
  const maxTasks = normalizePositiveInteger(input.maxTasks) ?? 6
  const modelConfig = input.modelConfig === undefined ? resolveRuntimePlannerModelConfig() : input.modelConfig
  if (!modelConfig) {
    return { tasks: [fallbackTask(goal)], source: 'fallback', warnings: ['planner model is not configured'], assessment: fallbackAssessment() }
  }

  try {
    const model = input.callModel ?? callModel
    const result = await model({
      messages: buildPlannerMessages(goal, input.title, maxTasks),
      config: modelConfig,
      auth: input.auth,
      jsonMode: true,
      temperature: 0.1,
    })
    const generated = normalizePlannerResponse(result.content, maxTasks)
    if (generated.tasks.length > 0) return { ...generated, source: 'model', warnings: [] }
    return { tasks: [fallbackTask(goal)], source: 'fallback', warnings: ['planner model returned no valid tasks'], assessment: fallbackAssessment() }
  } catch (error) {
    return {
      tasks: [fallbackTask(goal)],
      source: 'fallback',
      warnings: [`planner model failed: ${error instanceof Error ? error.message : String(error)}`],
      assessment: fallbackAssessment(),
    }
  }
}

function buildPlannerMessages(goal: string, title: string | undefined, maxTasks: number): ModelCallInput['messages'] {
  return [
    {
      role: 'system',
      content: [
        'You are a planning agent for a parent/worker subagent runtime.',
        'Before creating tasks, assess the goal difficulty and parallelism strategy.',
        'Return only JSON with this shape: {"assessment":{"difficulty":"simple|moderate|large","parallelStrategy":"planner_only|planner_with_sidecars|worker_split","rationale":"...","criticalPath":["..."],"nonDelegatedWork":["..."],"conflictRisks":["..."]},"tasks":[{"id":"task_short_id","title":"...","description":"...","deps":["task_other"],"metadata":{"executionMode":"planner|worker","parallelizable":true,"criticalPath":false,"writeScope":["path or module"],"expectedOutput":"...","reportFormat":"..."}}]}',
        `Create at most ${maxTasks} implementation tasks.`,
        'Use stable snake_case task ids prefixed with "task_".',
        'Dependencies must reference only earlier task ids.',
        'Use planner_only for simple, single-context, immediately blocking work; do not manufacture worker tasks for it.',
        'Use planner_with_sidecars when the planner should handle blocking discovery and workers can handle independent side tasks.',
        'Use worker_split only when tasks have clear boundaries, can be waited on, and do not fight over the same write scope.',
        'Mark immediate blockers and cross-cutting integration as metadata.executionMode="planner"; mark bounded parallel work as metadata.executionMode="worker".',
        'For worker tasks, include ownership/writeScope, expectedOutput, and reportFormat so the parent can integrate results safely.',
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

function normalizePlannerResponse(content: string | null, maxTasks: number): Pick<GeneratePlanTasksResult, 'tasks' | 'assessment'> {
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
    const metadata = normalizeTaskMetadata(rawTask)
    tasks.push({
      id,
      title,
      ...(normalizeNonEmptyString(rawTask.description) ? { description: normalizeNonEmptyString(rawTask.description) } : {}),
      ...(deps.length > 0 ? { deps } : {}),
      ...(metadata ? { metadata } : {}),
    })
    if (tasks.length >= maxTasks) break
  }
  const assessment = isRecord(parsed) && isJSONRecord(parsed.assessment)
    ? cloneJSONValue(parsed.assessment)
    : undefined
  return {
    tasks,
    ...(assessment ? { assessment } : {}),
  }
}

function fallbackAssessment(): Record<string, JSONValue> {
  return {
    difficulty: 'simple',
    parallelStrategy: 'planner_only',
    rationale: 'Planner model did not provide a usable decomposition, so the planner should execute the goal directly.',
    criticalPath: ['task_execute_goal'],
    nonDelegatedWork: ['Complete the requested goal in the planner run.'],
    conflictRisks: [],
  }
}

function fallbackTask(goal: string): CreatePlanTaskInput {
  return {
    id: 'task_execute_goal',
    title: titleFromGoal(goal),
    description: goal,
    metadata: {
      executionMode: 'planner',
      parallelizable: false,
      criticalPath: true,
      expectedOutput: 'Complete the requested goal directly in the planner run.',
      reportFormat: 'Summarize completed work, verification, blockers, and next steps.',
    },
  }
}

function normalizeTaskMetadata(rawTask: Record<string, unknown>): Record<string, JSONValue> | undefined {
  const metadata = isJSONRecord(rawTask.metadata) ? cloneJSONValue(rawTask.metadata) : {}
  const executionMode = rawTask.executionMode === 'planner' || rawTask.executionMode === 'worker'
    ? rawTask.executionMode
    : undefined
  const parallelizable = typeof rawTask.parallelizable === 'boolean' ? rawTask.parallelizable : undefined
  const criticalPath = typeof rawTask.criticalPath === 'boolean' ? rawTask.criticalPath : undefined
  const writeScope = normalizeStringList(rawTask.writeScope)
  const expectedOutput = normalizeNonEmptyString(rawTask.expectedOutput)
  const reportFormat = normalizeNonEmptyString(rawTask.reportFormat)
  const result = {
    ...metadata,
    ...(executionMode ? { executionMode } : {}),
    ...(parallelizable !== undefined ? { parallelizable } : {}),
    ...(criticalPath !== undefined ? { criticalPath } : {}),
    ...(writeScope.length > 0 ? { writeScope } : {}),
    ...(expectedOutput ? { expectedOutput } : {}),
    ...(reportFormat ? { reportFormat } : {}),
  }
  return Object.keys(result).length > 0 ? result : undefined
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
