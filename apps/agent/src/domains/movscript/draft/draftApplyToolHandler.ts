import { buildApplyDraftPreview } from '../../../drafts/draftApply.js'
import { validateDraft, type AgentDraftStore } from '../../../drafts/draftStore.js'
import { isJSONRecord } from '../../../jsonValue.js'
import type { RuntimeToolHandler } from '../../../ports/runtime/runtimeToolHandlerPort.js'
import type { DraftApplyPreviewPort } from '../../../ports/draft/draftApplyPreviewPort.js'
import type { AgentRun, JSONValue } from '../../../state/types.js'

export function createMovscriptDraftApplyToolHandler(): RuntimeToolHandler {
  return {
    toolNames: ['draft_apply_preview', 'draft_apply'],
    async execute({ call, args, run, draftStore, draftApplyPort, draftApplyPreviewPort }) {
      if (call.name === 'draft_apply_preview') {
        const draftId = stringField(draftRefArg(args) as JSONValue | undefined)
        if (!draftId) throw new Error('preview_draft_apply requires draftId')
        const draft = draftStore.getDraft(draftId)
        if (!draft) throw new Error(`draft not found: ${draftId}`)
        return {
          result: await previewDraftApply(draftStore, draftApplyPreviewPort, draft, args),
        }
      }

      if (call.name === 'draft_apply') {
        const draftId = stringField(draftRefArg(args) as JSONValue | undefined)
        if (!draftId) throw new Error('apply_draft requires draftId')
        const draft = draftStore.getDraft(draftId)
        if (!draft) throw new Error(`draft not found: ${draftId}`)
        const validation = validateDraft(draft)
        if (!validation.ok) {
          return {
            result: {
              ok: false,
              stage: 'local_validation',
              draftId,
              validation,
              message: 'Draft failed local validation. Patch the draft and validate again before applying.',
            } as unknown as JSONValue,
          }
        }
        const user = userFromRunContext(run)
        const result = await draftApplyPort.apply({
          draftStore,
          applyInput: {
            draftId,
            target: isJSONRecord(args.target) ? args.target : draft.target,
            targetEntityType: args.targetEntityType ?? args.target_entity_type,
            targetEntityId: args.targetEntityId ?? args.target_entity_id,
            targetField: args.targetField ?? args.target_field,
            currentValue: args.currentValue ?? args.current_value,
            proposedValue: args.proposedValue ?? args.proposed_value,
            appliedByUserId: args.appliedByUserId ?? args.applied_by_user_id ?? user?.id,
            ...(typeof run.metadata?.backendAuthToken === 'string' ? { backendAuthToken: run.metadata.backendAuthToken } : {}),
            ...(typeof run.metadata?.backendAPIBaseURL === 'string' ? { backendAPIBaseURL: run.metadata.backendAPIBaseURL } : {}),
          },
          now: () => new Date().toISOString(),
          appliedBy: 'movscript-agent',
        })
        return {
          result: {
            ok: true,
            stage: 'apply',
            validation,
            ...(isJSONRecord(result) ? result : { result }),
          } as unknown as JSONValue,
        }
      }

      return undefined
    },
  }
}

async function previewDraftApply(
  draftStore: AgentDraftStore,
  draftApplyPreviewPort: DraftApplyPreviewPort,
  draft: NonNullable<ReturnType<AgentDraftStore['getDraft']>>,
  args: Record<string, JSONValue>,
): Promise<JSONValue> {
  const validation = validateDraft(draft)
  if (!validation.ok) {
    return {
      ok: false,
      stage: 'local_validation',
      draftId: draft.id,
      validation,
      message: 'Draft failed local validation. Update the draft and preview again.',
    } as unknown as JSONValue
  }
  if (draft.kind === 'asset_proposal' || draft.kind === 'content_unit_proposal') {
    return {
      ok: true,
      stage: 'local_validation',
      draftId: draft.id,
      validation,
      message: 'Draft is locally valid. Backend apply preview is intentionally not performed for this proposal kind yet.',
    } as unknown as JSONValue
  }
  const preview = buildApplyDraftPreview(draftStore, {
    draftId: draft.id,
    target: isJSONRecord(args.target) ? args.target : draft.target,
    targetEntityType: args.targetEntityType ?? args.target_entity_type,
    targetEntityId: args.targetEntityId ?? args.target_entity_id,
    targetField: args.targetField ?? args.target_field,
    currentValue: args.currentValue ?? args.current_value,
    proposedValue: args.proposedValue ?? args.proposed_value,
  })
  const backendPreview = await draftApplyPreviewPort.previewApplyReview(preview.review)
  if (backendPreview.ok) {
    return {
      ok: true,
      stage: 'backend_apply_preview',
      draftId: draft.id,
      validation,
      review: preview.review,
      backendApply: backendPreview.backendApply,
    } as unknown as JSONValue
  }
  return {
    ok: false,
    stage: 'backend_apply_preview',
    draftId: draft.id,
    validation,
    error: backendPreview.error,
    ...(backendPreview.backendError !== undefined ? { backendError: backendPreview.backendError } : {}),
    message: 'Backend apply preview failed. Update the draft and preview again.',
  } as unknown as JSONValue
}

function draftRefArg(args: Record<string, JSONValue>): unknown {
  return draftRefStringField(args.draftRef)
    ?? draftRefStringField(args.draft_ref)
    ?? draftRefStringField(args.draftId)
    ?? draftRefStringField(args.draft_id)
    ?? draftRefStringField(args.id)
}

function draftRefStringField(value: JSONValue | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return stringField(value)
}

function stringField(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function userFromRunContext(run: AgentRun): Record<string, JSONValue> | undefined {
  const context = isJSONRecord(run.metadata?.context) ? run.metadata.context : undefined
  return isJSONRecord(context?.user) ? context.user : undefined
}
