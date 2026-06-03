import {
  getMCPFocusSnapshot,
} from '../context/store'
import {
  attachAssetSlotCandidate,
  attachKeyframeCandidate,
} from '../candidateAttach'
import {
  applyWorkspaceReview,
  previewApplyWorkspaceReview,
} from '../workspaceReviewApply'
import { getWorkspaceModelContract } from '../workspaceModelContract'
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
import { callMCPPluginTool, findMCPPluginTool } from '../pluginTools'

export async function callTool(params: MCPJSONValue | undefined): Promise<MCPJSONValue> {
  const name = getStringParam(params, 'name')
  const args = getObjectParam(params, 'arguments')

  switch (name) {
    case 'get_focus_context':
      return toolText(getFocus())
    case 'movscript_focus_get':
      return toolText(getFocus())
    case 'movscript_project_list':
      return toolText(await listProjects(args))
    case 'generation_model_list':
    case 'movscript_model_list':
      return toolText(await listModels(args))
    case 'movscript_script_locate':
      return toolText(await locateScriptPassages(args))
    case 'movscript_creative_reference_query':
      return toolText(await queryCreativeReferences(args))
    case 'movscript_asset_slot_query':
      return toolText(await queryAssetSlots(args))
    case 'movscript_production_context_query':
      return toolText(await queryProductionContext(args))
    case 'get_workspace_model':
      return toolText(await getWorkspaceModelContract(args))
    case 'movscript_project_create':
      return toolText(await createProject(args))
    case 'candidate_asset_slot_attach':
      return toolText(await attachAssetSlotCandidate(args))
    case 'candidate_keyframe_attach':
      return toolText(await attachKeyframeCandidate(args))
    case 'workspace_review_apply':
      return toolText(await applyWorkspaceReview(args))
    case 'workspace_review_apply_preview':
      return toolText(await previewApplyWorkspaceReview(args))
    default:
      {
        const pluginTool = findMCPPluginTool(name)
        if (pluginTool) {
          return toolText(await callMCPPluginTool({
            pluginId: pluginTool.pluginId,
            toolName: name,
            args,
          }))
        }
      }
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
