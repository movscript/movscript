import type { JSONValue } from '../../state/shared/types.js'

export interface RuntimeFocusContextPort {
  getFocusContext(options?: { signal?: AbortSignal }): Promise<JSONValue>
}
