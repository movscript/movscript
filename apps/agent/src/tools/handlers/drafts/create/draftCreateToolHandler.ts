import { isJSONRecord } from '../../../../shared/json/jsonValue.js'
import type { RuntimeToolHandler } from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import type { JSONValue } from '../../../../state/shared/types.js'
import { isValidAgentProjectId } from '../../../../context/runtime/runtimeContext.js'
import {
  createProposalDraft,
  extractPageContext,
  isStructuredProposalDraftKind,
} from '../../../../drafts/proposal/creation/proposalDraftCreationService.js'

export function createDraftCreateToolHandler(): RuntimeToolHandler {
  return {
    toolNames: ['draft_create'],
    async execute({ args, run, draftStore, proposalSnapshotHydrationPort, signal }) {
      if (args.proposal === true || args.proposalKind !== undefined || isStructuredProposalDraftKind(args.kind)) {
        return {
          result: await createProposalDraft(draftStore, run, proposalSnapshotHydrationPort, args, signal) as unknown as JSONValue,
        }
      }
      return {
        result: draftStore.createDraft({
          projectId: isValidAgentProjectId(args.projectId) ? args.projectId : undefined,
          kind: args.kind,
          title: args.title,
          content: args.content,
          source: {
            ...(isJSONRecord(args.source) ? args.source : {}),
            runId: run.id,
            threadId: run.threadId,
            ...extractPageContext(run),
          },
          target: args.target,
          seed: args.seed,
          createdByRunId: run.id,
          createdByThreadId: run.threadId,
          metadata: isJSONRecord(args.metadata) ? args.metadata : undefined,
        }) as unknown as JSONValue,
      }
    },
  }
}
