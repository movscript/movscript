import type { ApplyDraftInput } from '../../drafts/draftApply.js'
import type { AgentDraftStore } from '../../drafts/draftStore.js'
import type { JSONValue } from '../../state/types.js'

export interface DraftApplyPort {
  apply(input: {
    draftStore: AgentDraftStore
    applyInput: ApplyDraftInput & {
      backendAuthToken?: unknown
      backendAPIBaseURL?: unknown
    }
    now: () => string
    appliedBy?: string
  }): Promise<JSONValue>
}
