import type {
  GeneratePlanTasksInput,
  GeneratePlanTasksResult,
} from '../orchestration/planGenerator.js'
import type { AgentStore } from '../state/store.js'
import type { AgentPlanSnapshot, CreatePlanInput } from '../state/types.js'
import { applyRuntimePlanCreationRequest } from './runtimePlanCreation.js'
import type { RuntimeRunCreationBridge } from './runtimeRunCreationBridge.js'
import type { RuntimeTaskEventBridge } from './runtimeTaskEventBridge.js'
import { isoNow, makeId } from './runtimeIdentity.js'

export interface RuntimePlanCreationBridge {
  createPlan: (input: CreatePlanInput) => Promise<AgentPlanSnapshot>
}

export function createRuntimePlanCreationBridge(input: {
  store: AgentStore
  generatePlanTasks: (input: GeneratePlanTasksInput) => Promise<GeneratePlanTasksResult>
  runCreation: RuntimeRunCreationBridge
  taskEvents: RuntimeTaskEventBridge
  getPlanSnapshot: (planId: string) => AgentPlanSnapshot
  createPlanRequest?: typeof applyRuntimePlanCreationRequest
}): RuntimePlanCreationBridge {
  const createPlanRequest = input.createPlanRequest ?? applyRuntimePlanCreationRequest
  return {
    createPlan: (planInput) => createPlanRequest({
      store: input.store,
      planInput,
      planId: makeId('plan'),
      now: isoNow(),
      generatePlanTasks: input.generatePlanTasks,
      createRun: (runInput) => input.runCreation.createRun(runInput),
      getPlanSnapshot: input.getPlanSnapshot,
      onTaskCreated: input.taskEvents.recordTaskProtocolEvents,
      onInlineTaskAssigned: input.taskEvents.recordTaskProtocolAndPlanEvent,
    }),
  }
}
