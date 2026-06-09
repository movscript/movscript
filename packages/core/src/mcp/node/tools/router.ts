import { getFocus } from './focus/actions'
import {
  workspaceBuild,
  workspaceGetModel,
  workspaceReview,
} from './workspace/actions.js'
import {
  domainAppendCandidate,
  domainBuildContentUnitArtifact,
  domainBuild,
  domainCompile,
  domainCreateAssetSlotCandidate,
  domainCreateContentCandidate,
  domainCreateKeyframeCandidate,
  domainDeleteEntity,
  domainGetModel,
  domainInspect,
  domainOverview,
  domainQueryAssets,
  domainQueryEntities,
  domainQueryProductionContext,
  domainQuerySettings,
  domainReadContentUnitDependencyReport,
  domainReadContentUnitInputVersion,
  domainReadContentUnitRuntimePanel,
  domainReadContentUnitSelectionValidity,
  domainReadPreviewTimeline,
  domainReadScriptSource,
  domainRegenerationPlan,
  domainReview,
  domainSelectCandidate,
  domainSelectContentUnitCandidate,
  domainSnapshotScriptVersion,
  domainUnlockCandidate,
  domainUpdateCandidate,
  domainUpdateContentUnitPrompt,
  domainUpdateEntityTransition,
  domainUpdateStoryboardTimeline,
  domainUpdateStoryboardShotPlans,
  domainUpsertAsset,
  domainUpsertContentUnit,
  domainUpsertProjectStandards,
  domainUpsertScript,
  domainUpsertSetting,
} from './domain/actions.js'
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
    case 'system_focus_get':
    case 'movscript_focus_get':
      return toolText(getFocus())
    case 'system_model_list':
    case 'generation_model_list':
    case 'movscript_model_list':
      return toolText(await listModels(args))
    case 'system_generate_image':
    case 'generation_image_generate':
      return toolText(await generateImage(args))
    case 'system_generate_image_job_get':
    case 'generation_image_job_get':
      return toolText(await getImageGenerationJob(args))
    case 'system_generate_video':
    case 'generation_video_generate':
      return toolText(await generateVideo(args))
    case 'system_generate_video_job_get':
    case 'generation_video_job_get':
      return toolText(await getVideoGenerationJob(args))
    case 'system_resource_library_query':
    case 'movscript_resource_library_query':
      return toolText(await queryResourceLibrary(args))
    case 'system_resource_image_read':
    case 'movscript_resource_image_read':
      return await readResourceImageForVision(args) as MCPJSONValue
    case 'system_resource_video_extract_frames':
    case 'movscript_resource_video_extract_frames':
      return await extractResourceVideoFramesForVision(args) as MCPJSONValue
    case 'system_resource_image_annotate':
    case 'movscript_resource_image_annotate':
      return await annotateResourceImage(args) as MCPJSONValue
    case 'system_resource_upload':
    case 'movscript_resource_upload':
      return toolText(await uploadAgentImageResource(args))
    case 'system_shot_library_query':
    case 'movscript_shot_library_query':
      return toolText(await queryShotLibrary(args))
    case 'system_external_resource_source_list':
    case 'movscript_external_resource_source_list':
      return toolText(await listExternalResourceSources(args))
    case 'system_external_resource_search':
    case 'movscript_external_resource_search':
      return toolText(await searchExternalResources(args))
    case 'domain_get_model':
      return toolText(await domainGetModel(args))
    case 'domain_query_entities':
      return toolText(await domainQueryEntities(args))
    case 'domain_query_settings':
      return toolText(await domainQuerySettings(args))
    case 'domain_query_assets':
      return toolText(await domainQueryAssets(args))
    case 'domain_query_production_context':
      return toolText(await domainQueryProductionContext(args))
    case 'domain_build_content_unit_artifact':
      return toolText(await domainBuildContentUnitArtifact(args))
    case 'domain_read_preview_timeline':
      return toolText(await domainReadPreviewTimeline(args))
    case 'domain_read_content_unit_runtime_panel':
      return toolText(await domainReadContentUnitRuntimePanel(args))
    case 'domain_read_content_unit_input_version':
      return toolText(await domainReadContentUnitInputVersion(args))
    case 'domain_read_content_unit_dependency_report':
      return toolText(await domainReadContentUnitDependencyReport(args))
    case 'domain_read_content_unit_selection_validity':
      return toolText(await domainReadContentUnitSelectionValidity(args))
    case 'domain_upsert_project_standards':
      return toolText(await domainUpsertProjectStandards(args))
    case 'domain_upsert_setting':
      return toolText(await domainUpsertSetting(args))
    case 'domain_upsert_asset':
      return toolText(await domainUpsertAsset(args))
    case 'domain_upsert_script':
      return toolText(await domainUpsertScript(args))
    case 'domain_read_script_source':
      return toolText(await domainReadScriptSource(args))
    case 'domain_snapshot_script_version':
      return toolText(await domainSnapshotScriptVersion(args))
    case 'domain_upsert_content_unit':
      return toolText(await domainUpsertContentUnit(args))
    case 'domain_update_content_unit_prompt':
      return toolText(await domainUpdateContentUnitPrompt(args))
    case 'domain_update_entity_transition':
      return toolText(await domainUpdateEntityTransition(args))
    case 'domain_update_storyboard_timeline':
      return toolText(await domainUpdateStoryboardTimeline(args))
    case 'domain_update_storyboard_shot_plans':
      return toolText(await domainUpdateStoryboardShotPlans(args))
    case 'domain_append_candidate':
      return toolText(await domainAppendCandidate(args))
    case 'domain_create_content_candidate':
      return toolText(await domainCreateContentCandidate(args))
    case 'domain_create_asset_slot_candidate':
      return toolText(await domainCreateAssetSlotCandidate(args))
    case 'domain_create_keyframe_candidate':
      return toolText(await domainCreateKeyframeCandidate(args))
    case 'domain_select_content_unit_candidate':
      return toolText(await domainSelectContentUnitCandidate(args))
    case 'domain_select_candidate':
      return toolText(await domainSelectCandidate(args))
    case 'domain_update_candidate':
      return toolText(await domainUpdateCandidate(args))
    case 'domain_unlock_candidate':
      return toolText(await domainUnlockCandidate(args))
    case 'domain_delete_entity':
      return toolText(await domainDeleteEntity(args))
    case 'domain_overview':
      return toolText(await domainOverview(args))
    case 'domain_inspect':
      return toolText(await domainInspect(args))
    case 'domain_review':
      return toolText(await domainReview(args))
    case 'domain_compile':
      return toolText(await domainCompile(args))
    case 'domain_build':
      return toolText(await domainBuild(args))
    case 'domain_regeneration_plan':
      return toolText(await domainRegenerationPlan(args))
    case 'movscript_workspace_get_model':
      return toolText(await workspaceGetModel(args))
    case 'movscript_workspace_review':
      return toolText(await workspaceReview(args))
    case 'movscript_workspace_build':
      return toolText(await workspaceBuild(args))
    case 'system_project_create':
    case 'movscript_project_create':
      return toolText(await createProject(args))
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
