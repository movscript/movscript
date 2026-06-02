import type { RuntimeWork, RuntimeWorkKind, RuntimeWorkStartInput } from './runtimeWork.js'

export interface RuntimeWorkProvider {
  readonly kind: RuntimeWorkKind
  start(input: RuntimeWorkStartInput): Promise<RuntimeWork>
  observe(work: RuntimeWork, options?: { signal?: AbortSignal }): Promise<RuntimeWork>
  cancel?(work: RuntimeWork, options?: { signal?: AbortSignal }): Promise<RuntimeWork>
}
