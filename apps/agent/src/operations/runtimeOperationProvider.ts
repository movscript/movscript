import type { RuntimeOperation, RuntimeOperationKind, RuntimeOperationStartInput } from './runtimeOperation.js'

export interface RuntimeOperationProvider {
  readonly kind: RuntimeOperationKind
  start(input: RuntimeOperationStartInput): Promise<RuntimeOperation>
  observe(operation: RuntimeOperation, options?: { signal?: AbortSignal }): Promise<RuntimeOperation>
  cancel?(operation: RuntimeOperation, options?: { signal?: AbortSignal }): Promise<RuntimeOperation>
}

