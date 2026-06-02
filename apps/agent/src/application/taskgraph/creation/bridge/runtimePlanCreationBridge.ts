import type {
  GeneratePlanTasksInput,
  GeneratePlanTasksResult,
} from '../../../../orchestration/model/planning/generation/planGenerator.js'
import type { AgentStore } from '../../../../state/store/core/store.js'
import type { AgentTaskGraphSnapshot, CreateTaskGraphInput } from '../../../../state/shared/types.js'
import { applyRuntimeTaskGraphCreationRequest } from '../flow/runtimePlanCreation.js'
import type { RuntimeRunCreationBridge } from '../../../run/creation/bridge/runtimeRunCreationBridge.js'
import type { RuntimeTaskEventBridge } from '../../task/events/bridge/runtimeTaskEventBridge.js'
import { isoNow, makeId } from '../../../../shared/runtime/runtimeIdentity.js'

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
