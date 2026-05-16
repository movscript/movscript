import {
  executeRuntimeRun,
  type RuntimeRunExecutionDependencies,
} from './runtimeRunExecution.js'

export interface RuntimeRunExecutionBridge {
  executeRun: (runId: string, signal?: AbortSignal) => Promise<void>
}

export function createRuntimeRunExecutionBridge(input: RuntimeRunExecutionDependencies & {
  executeRun?: typeof executeRuntimeRun
}): RuntimeRunExecutionBridge {
  const executeRun = input.executeRun ?? executeRuntimeRun
  const {
    executeRun: _executeRun,
    ...dependencies
  } = input
  void _executeRun

  return {
    executeRun: (runId, signal) => executeRun({
      runId,
      signal,
      ...dependencies,
    }),
  }
}
