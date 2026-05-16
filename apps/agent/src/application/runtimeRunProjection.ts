import type { AgentStore } from '../state/store.js'
import type { AgentRun } from '../state/types.js'
import { toProductRun } from '../state/runStreamView.js'
import { requireRuntimeRun } from './runtimeStoreLookup.js'

export function listRuntimeRuns(input: {
  store: Pick<AgentStore, 'listRuns'>
}): AgentRun[] {
  return input.store.listRuns().map(toProductRun)
}

export function listRuntimeRunsByParent(input: {
  store: Pick<AgentStore, 'listRuns'>
  parentRunId: string
}): AgentRun[] {
  return input.store.listRuns({ parentRunId: input.parentRunId }).map(toProductRun)
}

export function getRuntimeRun(input: {
  store: Pick<AgentStore, 'getRun'>
  runId: string
}): AgentRun | undefined {
  const run = input.store.getRun(input.runId)
  return run ? toProductRun(run) : undefined
}

export function getRuntimeChildRuns(input: {
  store: Pick<AgentStore, 'getRun' | 'listChildRuns'>
  parentRunId: string
}): AgentRun[] {
  requireRuntimeRun(input.store, input.parentRunId)
  return input.store.listChildRuns(input.parentRunId).map(toProductRun)
}
