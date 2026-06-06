import { getFocus } from './focus/actions'
import {
  workspaceBuild,
  workspaceGetModel,
  workspaceReview,
} from './workspace/actions.js'
import { listModels } from './model/actions'
import {
  generateImage,
  generateVideo,
  getImageGenerationJob,
  getVideoGenerationJob,
} from './generation/actions'
import { createProject } from './project/projects.js'
import { getObjectParam, getStringParam } from '../../protocol/params.js'
import { queryShotLibrary } from './shot-library/actions'
import { queryResourceLibrary } from './resource-library/actions'
import {
  annotateResourceImage,
  extractResourceVideoFramesForVision,
  readResourceImageForVision,
  uploadAgentImageResource,
} from './resource-media/actions'
import {
  listExternalResourceSources,
  searchExternalResources,
} from './external-resources/actions'
import { toolText } from '../../protocol/index.js'
import type { MCPJSONValue } from '../../protocol/types.js'

export async function callTool(params: MCPJSONValue | undefined): Promise<MCPJSONValue> {
  const name = getStringParam(params, 'name')
  const args = getObjectParam(params, 'arguments')

  switch (name) {
    case 'movscript_focus_get':
      return toolText(getFocus())
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
    case 'movscript_workspace_get_model':
      return toolText(await workspaceGetModel(args))
    case 'movscript_workspace_review':
      return toolText(await workspaceReview(args))
    case 'movscript_workspace_build':
      return toolText(await workspaceBuild(args))
    case 'movscript_project_create':
      return toolText(await createProject(args))
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
