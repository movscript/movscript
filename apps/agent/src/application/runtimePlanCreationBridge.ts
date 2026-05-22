import type {
  GeneratePlanTasksInput,
  GeneratePlanTasksResult,
} from '../orchestration/planGenerator.js'
import type { AgentStore } from '../state/store.js'
import type { AgentTaskGraphSnapshot, CreateTaskGraphInput } from '../state/types.js'
import { applyRuntimeTaskGraphCreationRequest } from './runtimePlanCreation.js'
import type { RuntimeRunCreationBridge } from './runtimeRunCreationBridge.js'
import type { RuntimeTaskEventBridge } from './runtimeTaskEventBridge.js'
import { isoNow, makeId } from './runtimeIdentity.js'

export interface RuntimeTaskGraphCreationBridge {
  createTaskGraph: (input: CreateTaskGraphInput) => Promise<AgentTaskGraphSnapshot>
}

export function createRuntimeTaskGraphCreationBridge(input: {
  store: AgentStore
  generatePlanTasks: (input: GeneratePlanTasksInput) => Promise<GeneratePlanTasksResult>
  runCreation: RuntimeRunCreationBridge
  taskEvents: RuntimeTaskEventBridge
  getTaskGraphSnapshot: (taskGraphId: string) => AgentTaskGraphSnapshot
  createTaskGraphRequest?: typeof applyRuntimeTaskGraphCreationRequest
}): RuntimeTaskGraphCreationBridge {
  const createTaskGraphRequest = input.createTaskGraphRequest ?? applyRuntimeTaskGraphCreationRequest
  return {
    createTaskGraph: (planInput) => createTaskGraphRequest({
      store: input.store,
      planInput,
      taskGraphId: makeId('taskGraph'),
      now: isoNow(),
      generatePlanTasks: input.generatePlanTasks,
      createRun: (runInput) => input.runCreation.createRun(runInput),
      getTaskGraphSnapshot: input.getTaskGraphSnapshot,
      onTaskCreated: input.taskEvents.recordTaskProtocolEvents,
      onInlineTaskAssigned: input.taskEvents.recordTaskProtocolAndPlanEvent,
    }),
  }
}
