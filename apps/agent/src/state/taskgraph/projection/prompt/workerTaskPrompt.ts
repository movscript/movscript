import type { AgentTaskGraph, AgentTask } from '../../../shared/types.js'
import { subagentNameFromTask } from '../../../subagent/identity/subagentIdentity.js'

export const WORKER_TASK_INSTRUCTIONS = 'Execute this worker task and report durable artifacts, blockers, and completion status.'

export function formatWorkerTaskMessage(taskGraph: AgentTaskGraph, task: AgentTask): string {
  return [
    `TaskGraph: ${taskGraph.title}`,
    subagentNameFromTask(task) ? `Subagent name: ${subagentNameFromTask(task)}` : undefined,
    `Task: ${task.title}`,
    task.description ? `Description: ${task.description}` : undefined,
    task.deps.length > 0 ? `Dependencies: ${task.deps.join(', ')}` : undefined,
    '',
    WORKER_TASK_INSTRUCTIONS,
  ].filter((line): line is string => line !== undefined).join('\n')
}
