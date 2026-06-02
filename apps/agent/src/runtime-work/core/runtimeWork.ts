import type {
  RuntimeWork,
  RuntimeWorkContinuationMode,
  RuntimeWorkExternalHandle,
  RuntimeWorkKind,
  RuntimeWorkMode,
  RuntimeWorkStartInput,
  RuntimeWorkStatus,
  RuntimeWorkWaitInput,
  RuntimeWorkWaitResult,
} from '@movscript/protocol'

export type {
  RuntimeWork,
  RuntimeWorkContinuationMode,
  RuntimeWorkExternalHandle,
  RuntimeWorkKind,
  RuntimeWorkMode,
  RuntimeWorkStartInput,
  RuntimeWorkStatus,
  RuntimeWorkWaitInput,
  RuntimeWorkWaitResult,
}

export function isTerminalRuntimeWorkStatus(status: RuntimeWorkStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timeout'
}
