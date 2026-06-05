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
import {
  deleteAgentWorkspaceFile,
  listAgentWorkspaceFiles,
  readAgentWorkspaceFile,
  writeAgentWorkspaceFile,
} from '../../services/agentWorkspaceFiles'
import { getWorkspaceModelContract } from '../workspaceModelContract'
import { listModels } from '../modelCatalog'
import {
  generateImage,
  generateVideo,
  getImageGenerationJob,
  getVideoGenerationJob,
} from '../generationTools'
import { createProject, listProjects } from '../projectTools'
import { getObjectParam, getStringParam } from '../rpc/params'
import { listScripts } from '../scriptList'
import { locateScriptPassages } from '../scriptLocate'
import {
  queryAssetSlots,
  queryCreativeReferences,
  queryProductionContext,
} from '../semanticQuery'
import { queryShotLibrary } from '../shotLibrary'
import { queryResourceLibrary } from '../resourceLibrary'
import {
  annotateResourceImage,
  extractResourceVideoFramesForVision,
  readResourceImageForVision,
  uploadAgentImageResource,
} from '../resourceMedia'
import {
  listExternalResourceSources,
  searchExternalResources,
} from '../externalResources'
import { toolText } from '../responseFormat'
import type { MCPJSONValue } from '../types'

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
    case 'movscript_script_list':
      return toolText(await listScripts(args))
    case 'generation_model_list':
    case 'movscript_model_list':
      return toolText(await listModels(args))
    case 'generation_image_generate':
      return toolText(await generateImage(args))
    case 'generation_image_job_get':
      return toolText(await getImageGenerationJob(args))
    case 'generation_video_generate':
      return toolText(await generateVideo(args))
    case 'generation_video_job_get':
      return toolText(await getVideoGenerationJob(args))
    case 'movscript_script_locate':
      return toolText(await locateScriptPassages(args))
    case 'movscript_resource_library_query':
      return toolText(await queryResourceLibrary(args))
    case 'movscript_resource_image_read':
      return await readResourceImageForVision(args) as MCPJSONValue
    case 'movscript_resource_video_extract_frames':
      return await extractResourceVideoFramesForVision(args) as MCPJSONValue
    case 'movscript_resource_image_annotate':
      return await annotateResourceImage(args) as MCPJSONValue
    case 'movscript_resource_upload':
      return toolText(await uploadAgentImageResource(args))
    case 'movscript_shot_library_query':
      return toolText(await queryShotLibrary(args))
    case 'movscript_external_resource_source_list':
      return toolText(await listExternalResourceSources(args))
    case 'movscript_external_resource_search':
      return toolText(await searchExternalResources(args))
    case 'movscript_creative_reference_query':
      return toolText(await queryCreativeReferences(args))
    case 'movscript_asset_slot_query':
      return toolText(await queryAssetSlots(args))
    case 'movscript_production_context_query':
      return toolText(await queryProductionContext(args))
    case 'get_workspace_model':
      return toolText(await getWorkspaceModelContract(args))
    case 'workspace_file_list':
      return toolText(await listAgentWorkspaceFiles(normalizeWorkspaceFileInput(args)))
    case 'workspace_file_read':
      return toolText(await readAgentWorkspaceFile(normalizeWorkspaceFileInput(args)))
    case 'workspace_file_write':
      return toolText(await writeAgentWorkspaceFile(normalizeWorkspaceFileWriteInput(args)))
    case 'workspace_file_delete':
      await deleteAgentWorkspaceFile(normalizeWorkspaceFileInput(args))
      return toolText({ ok: true })
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
      throw new Error(`Unknown tool: ${name}`)
  }
}

function normalizeWorkspaceFileInput(args: Record<string, unknown>): { workspaceDir?: string; path?: string } {
  const path = typeof args.path === 'string' ? args.path : undefined
  const workspaceDir = typeof args.workspaceDir === 'string' ? args.workspaceDir : undefined
  return {
    ...(workspaceDir ? { workspaceDir } : {}),
    ...(path ? { path } : {}),
  }
}

function normalizeWorkspaceFileWriteInput(args: Record<string, unknown>): { workspaceDir?: string; path?: string; content: string } {
  const content = typeof args.content === 'string' ? args.content : undefined
  if (content === undefined) throw new Error('content is required')
  return {
    ...normalizeWorkspaceFileInput(args),
    content,
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
