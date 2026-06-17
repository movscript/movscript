import type { MCPTool } from '../../protocol/types.js'
import { focusTools } from '../../tools/focus/definitions.js'
import { domainTools } from '../../tools/domain/definitions.js'
import { editingTools } from '../../tools/editing/definitions.js'
import { projectTools } from '../../tools/project/index.js'
import { modelTools } from '../../tools/model/definitions.js'
import { generationTools } from '../../tools/generation/definitions.js'
import { shotLibraryTools } from '../../tools/shot-library/definitions.js'
import { resourceLibraryTools } from '../../tools/resource-library/definitions.js'
import { resourceMediaTools } from '../../tools/resource-media/definitions.js'
import { externalResourceTools } from '../../tools/external-resources/definitions.js'
import { artifactTools } from '../../tools/artifact/definitions.js'

export function listTools(): MCPTool[] {
  const baseProjectTools = projectTools()
  const baseGenerationTools = generationTools()
  const baseResourceLibraryTools = resourceLibraryTools()
  const baseResourceMediaTools = resourceMediaTools()
  const baseShotLibraryTools = shotLibraryTools()
  const baseExternalResourceTools = externalResourceTools()
  return [
    ...systemTools({
      focus: focusTools(),
      models: modelTools(),
      generation: baseGenerationTools,
      resourceLibrary: baseResourceLibraryTools,
      resourceMedia: baseResourceMediaTools,
      shotLibrary: baseShotLibraryTools,
      externalResources: baseExternalResourceTools,
      project: baseProjectTools,
    }),
    ...domainTools(),
    ...editingTools(),
    ...artifactTools(),
    ...focusTools(),
    ...modelTools(),
    ...baseResourceLibraryTools,
    ...baseResourceMediaTools,
    ...baseShotLibraryTools,
    ...baseExternalResourceTools,
    ...baseGenerationTools,
    ...baseProjectTools,
  ]
}

function systemTools(input: {
  focus: MCPTool[]
  models: MCPTool[]
  generation: MCPTool[]
  resourceLibrary: MCPTool[]
  resourceMedia: MCPTool[]
  shotLibrary: MCPTool[]
  externalResources: MCPTool[]
  project: MCPTool[]
}): MCPTool[] {
  return [
    ...renameTools(input.focus, { movscript_focus_get: 'system_focus_get' }),
    ...renameTools(input.project, { movscript_project_create: 'system_project_create' }),
    ...renameTools(input.models, { generation_model_list: 'system_model_list' }),
    ...renameTools(input.generation, {
      generation_image_generate: 'system_generate_image',
      generation_image_job_get: 'system_generate_image_job_get',
      generation_image_job_get_batch: 'system_generate_image_job_get_batch',
      generation_video_generate: 'system_generate_video',
      generation_video_job_get: 'system_generate_video_job_get',
      generation_video_job_get_batch: 'system_generate_video_job_get_batch',
      generation_audio_generate: 'generation_audio_generate',
      generation_voiceover_generate: 'system_generate_voiceover',
      generation_music_generate: 'system_generate_music',
      generation_sfx_generate: 'system_generate_sfx',
      generation_subtitle_generate: 'system_generate_subtitle',
      generation_subtitle_align: 'system_align_subtitle',
      generation_subtitle_translate: 'system_translate_subtitle',
      generation_audio_job_get: 'generation_audio_job_get',
      generation_audio_job_get_batch: 'generation_audio_job_get_batch',
    }),
    ...renameTools(input.resourceLibrary, { movscript_resource_library_query: 'system_resource_library_query' }),
    ...renameTools(input.resourceMedia, {
      movscript_resource_image_read: 'system_resource_image_read',
      movscript_resource_image_transform_to_resource: 'system_resource_image_transform_to_resource',
      movscript_resource_video_extract_frames: 'system_resource_video_extract_frames',
      movscript_resource_video_probe: 'system_resource_video_probe',
      movscript_resource_video_extract_frame_to_resource: 'system_resource_video_extract_frame_to_resource',
      movscript_resource_video_extract_frames_to_resources: 'system_resource_video_extract_frames_to_resources',
      movscript_resource_video_trim_to_resource: 'system_resource_video_trim_to_resource',
      movscript_resource_video_compose_to_resource: 'system_resource_video_compose_to_resource',
      movscript_resource_video_concat_to_resource: 'system_resource_video_concat_to_resource',
      movscript_resource_video_contact_sheet_to_resource: 'system_resource_video_contact_sheet_to_resource',
      movscript_resource_video_extract_audio_to_resource: 'system_resource_video_extract_audio_to_resource',
      movscript_resource_image_annotate: 'system_resource_image_annotate',
      movscript_resource_upload: 'system_resource_upload',
      movscript_resource_upload_batch: 'system_resource_upload_batch',
    }),
    ...renameTools(input.shotLibrary, {
      movscript_shot_library_query: 'system_shot_library_query',
      movscript_shot_group_create: 'system_shot_group_create',
      movscript_shot_group_get: 'system_shot_group_get',
      movscript_shot_group_add_shots: 'system_shot_group_add_shots',
      movscript_video_shot_cuts_analyze: 'system_video_shot_cuts_analyze',
    }),
    ...renameTools(input.externalResources, {
      movscript_external_resource_source_list: 'system_external_resource_source_list',
      movscript_external_resource_search: 'system_external_resource_search',
    }),
  ]
}

function renameTools(tools: MCPTool[], names: Record<string, string>): MCPTool[] {
  return tools
    .filter((tool) => names[tool.name])
    .map((tool) => ({
      ...tool,
      name: names[tool.name]!,
      description: `${tool.description} New system-level alias for ${tool.name}.`,
    }))
}
