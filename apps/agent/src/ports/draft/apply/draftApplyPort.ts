import type { ApplyDraftInput } from '../../../drafts/apply/draftApply.js'
import type { AgentDraftStore } from '../../../drafts/store/draftStore.js'
import type { JSONValue } from '../../../state/shared/types.js'

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
