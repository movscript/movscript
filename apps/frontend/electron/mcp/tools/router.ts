import {
  getMCPFocusSnapshot,
} from '../context/store'
import {
  attachAssetSlotCandidate,
  attachKeyframeCandidate,
} from '../candidateAttach'
import {
  applyDraftReview,
  previewApplyDraftReview,
} from '../draftReviewApply'
import { getDraftModelContract } from '../draftModelContract'
import {
  callComfyUITool,
  callWebUITool,
} from '../generationConnectors'
import {
  cancelGenerationJob,
  createGenerationJob,
  getGenerationJob,
  listGenerationJobs,
  waitGenerationJobs,
} from '../generationJobs'
import { listModels } from '../modelCatalog'
import { createProject, listProjects } from '../projectTools'
import { getObjectParam, getStringParam } from '../rpc/params'
import { locateScriptPassages } from '../scriptLocate'
import {
  queryAssetSlots,
  queryCreativeReferences,
  queryProductionContext,
} from '../semanticQuery'
import { toolText } from '../responseFormat'
import type { MCPJSONValue } from '../types'

export async function callTool(params: MCPJSONValue | undefined): Promise<MCPJSONValue> {
  const name = getStringParam(params, 'name')
  const args = getObjectParam(params, 'arguments')

  switch (name) {
    case 'movscript_focus_get':
      return toolText(getFocus())
    case 'movscript_project_list':
      return toolText(await listProjects(args))
    case 'movscript_script_locate':
      return toolText(await locateScriptPassages(args))
    case 'movscript_creative_reference_query':
      return toolText(await queryCreativeReferences(args))
    case 'movscript_asset_slot_query':
      return toolText(await queryAssetSlots(args))
    case 'movscript_production_context_query':
      return toolText(await queryProductionContext(args))
    case 'draft_model_get':
      return toolText(await getDraftModelContract(args))
    case 'movscript_project_create':
      return toolText(await createProject(args))
    case 'generation_model_list':
      return toolText(await listModels(args))
    case 'tool_comfyui':
      return toolText(await callComfyUITool(args))
    case 'tool_webui':
      return toolText(await callWebUITool(args))
    case 'generation_job_create':
      return toolText(await createGenerationJob(args))
    case 'candidate_asset_slot_attach':
      return toolText(await attachAssetSlotCandidate(args))
    case 'candidate_keyframe_attach':
      return toolText(await attachKeyframeCandidate(args))
    case 'generation_job_get':
      return toolText(await getGenerationJob(args))
    case 'generation_job_wait':
      return toolText(await waitGenerationJobs(args))
    case 'generation_job_list':
      return toolText(await listGenerationJobs(args))
    case 'generation_job_cancel':
      return toolText(await cancelGenerationJob(args))
    case 'draft_review_apply':
      return toolText(await applyDraftReview(args))
    case 'draft_review_apply_preview':
      return toolText(await previewApplyDraftReview(args))
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

function getFocus(): unknown {
  const startedAt = Date.now()
  const focusMs = Date.now() - startedAt
  return {
    focus: getMCPFocusSnapshot(),
    timings: {
      totalMs: focusMs,
      focusMs,
    },
  }
}
