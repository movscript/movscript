import { getFocus } from './focus/actions'
import {
  artifactGetStream,
  artifactUploadExport,
  artifactUploadHlsStream,
} from './artifact/actions.js'
import {
  domainAppendCandidate,
  domainBuildContentUnitBackendPrompt,
  domainCertifyAssetProvider,
  domainInterpretContentUnitArtifact,
  domainInterpret,
  domainCreateAssetSlotCandidate,
  domainCreateContentCandidate,
  domainCreateContentCandidateBatch,
  domainDecideContentUnitCandidate,
  domainProductionStatusSummary,
  domainCreateKeyframeCandidate,
  domainDeleteEntity,
  domainGetModel,
  domainInspect,
  domainOverview,
  domainQueryAssets,
  domainQueryEntities,
  domainQueryProductionContext,
  domainQueryRemoteAssetGroups,
  domainQueryRemoteAssets,
  domainQuerySettings,
  domainReadContentWorkspace,
  domainReadContentWorkspaceSnapshot,
  domainReadContentUnitDependencyReport,
  domainReadContentUnitGenerationPrompt,
  domainReadContentUnitRuntimePanel,
  domainReadContentUnitSelectionValidity,
  domainReadPreviewTimeline,
  domainReadProjectContextSnapshot,
  domainReadProductionTimeline,
  domainReadProductionEditPlan,
  domainReadSceneMomentEditPlan,
  domainCreateEditingProjectContext,
  domainReadSceneMomentTimeline,
  domainReadProductionWorkPlan,
  domainReadScriptSource,
  domainRegenerationPlan,
  domainRegisterRawResourceAsContentUnitCandidate,
  domainReview,
  domainSelectCandidate,
  domainSelectContentUnitCandidate,
  domainSelectContentUnitCandidateBatch,
  domainSnapshotScriptVersion,
  domainUnlockCandidate,
  domainUpdateCandidate,
  domainUpdateContentUnitPrompt,
  domainUpdateEntityTransition,
  domainUpdateStoryboardTimeline,
  domainUpsertAudioCue,
  domainUpsertAsset,
  domainUpsertContentUnit,
  domainUpsertExpressionUnit,
  domainUpsertKeyframe,
  domainUpsertProjectStandards,
  domainUpsertProduction,
  domainUpsertProductionTree,
  domainUpsertTimelineNamespaceTree,
  domainUpsertScript,
  domainUpsertSceneMoment,
  domainUpsertSegment,
  domainUpsertSetting,
  domainUpsertSettingState,
  domainUpsertSettingTree,
  domainUpsertStoryboard,
} from './domain/actions.js'
import {
  editingProjectCreate,
  editingProjectAddAsset,
  editingProjectCreateFromEditDecisions,
  editingProjectCreateFromEditPlan,
  editingProjectGet,
  editingProjectRemoveAsset,
  editingProjectSave,
  editingProjectUpdateSettings,
  editingExportCreateCandidate,
  editingExportImportResource,
  editingExportPublishHls,
  editingExportSaveLocal,
  editingRuntimeCapabilitiesGet,
  editingTaskCancel,
  editingTaskGet,
  editingTaskHlsCreate,
  editingTaskLogsGet,
  editingTaskReframeCreate,
  editingTaskRenderCreate,
  editingTaskTranscodeCreate,
  editingTimelineAddClip,
  editingTimelineAddTrack,
  editingTimelineApplyCommands,
  editingTimelineDeleteClip,
  editingTimelineMoveClip,
  editingTimelineRemoveTrack,
  editingTimelineSplitClip,
  editingTimelineUpdateClip,
  editingTimelineValidate,
  editingVideoCompose,
} from './editing/actions.js'
import { listModels } from './model/actions'
import {
  getUnifiedGenerationJob,
  getUnifiedGenerationJobs,
  listGenerationCapabilities,
  prepareGeneration,
  registerGenerationResult,
  submitUnifiedGeneration,
} from './generation/actions'
import { createProject, fetchLocalProject, initLocalProject } from './project/projects.js'
import { getObjectParam, getStringParam } from '../../protocol/params.js'
import {
  addShotsToGroup,
  analyzeVideoShotCuts,
  createShotGroup,
  getShotGroup,
  queryShotLibrary,
} from './shot-library/actions'
import { openResourceLibrary, queryResourceLibrary } from './resource-library/actions'
import {
  annotateResourceImage,
  composeResourceVideosToResource,
  createResourceVideoContactSheetToResource,
  extractResourceVideoAudioToResource,
  extractResourceVideoFrameToResource,
  extractResourceVideoFramesForVision,
  extractResourceVideoFramesToResources,
  probeResourceVideo,
  readResourceImageForVision,
  transformResourceImageToResource,
  trimResourceVideoToResource,
  uploadAgentImageResource,
  uploadAgentImageResources,
} from './resource-media/actions'
import {
  listExternalResourceSources,
  searchExternalResources,
} from './external-resources/actions'
import { toolText } from '../../protocol/index.js'
import type { MCPJSONValue } from '../../protocol/types.js'
import { summarizeWorkspaceInterpretForAgent } from './domain/interpretSummary.js'

export async function callTool(params: MCPJSONValue | undefined): Promise<MCPJSONValue> {
  const name = getStringParam(params, 'name')
  const args = getObjectParam(params, 'arguments')

  switch (name) {
    case 'movscript_focus_get':
      return toolText(getFocus())
    case 'system_model_list':
    case 'generation_model_list':
    case 'movscript_model_list':
      return toolText(await listModels(args))
    case 'generation_capability_list':
      return toolText(await listGenerationCapabilities(args))
    case 'generation_prepare':
      return toolText(await prepareGeneration(args))
    case 'generation_submit':
      return toolText(await submitUnifiedGeneration(args))
    case 'generation_job_get':
      return toolText(await getUnifiedGenerationJob(args))
    case 'generation_job_get_batch':
      return toolText(await getUnifiedGenerationJobs(args))
    case 'generation_result_register':
      return toolText(await registerGenerationResult(args))
    case 'system_resource_library_query':
    case 'movscript_resource_library_query':
      return toolText(await queryResourceLibrary(args))
    case 'system_resource_library_open':
    case 'movscript_resource_library_open':
      return toolText(openResourceLibrary(args))
    case 'system_resource_image_read':
    case 'movscript_resource_image_read':
      return await readResourceImageForVision(args) as MCPJSONValue
    case 'system_resource_image_transform_to_resource':
    case 'movscript_resource_image_transform_to_resource':
      return toolText(await transformResourceImageToResource(args))
    case 'system_resource_video_extract_frames':
    case 'movscript_resource_video_extract_frames':
      return await extractResourceVideoFramesForVision(args) as MCPJSONValue
    case 'system_resource_video_probe':
    case 'movscript_resource_video_probe':
      return toolText(await probeResourceVideo(args))
    case 'system_resource_video_extract_frame_to_resource':
    case 'movscript_resource_video_extract_frame_to_resource':
      return toolText(await extractResourceVideoFrameToResource(args))
    case 'system_resource_video_extract_frames_to_resources':
    case 'movscript_resource_video_extract_frames_to_resources':
      return toolText(await extractResourceVideoFramesToResources(args))
    case 'system_resource_video_trim_to_resource':
    case 'movscript_resource_video_trim_to_resource':
      return toolText(await trimResourceVideoToResource(args))
    case 'system_resource_video_compose_to_resource':
    case 'system_resource_video_concat_to_resource':
    case 'movscript_resource_video_compose_to_resource':
    case 'movscript_resource_video_concat_to_resource':
      return toolText(await composeResourceVideosToResource(args))
    case 'system_resource_video_contact_sheet_to_resource':
    case 'movscript_resource_video_contact_sheet_to_resource':
      return toolText(await createResourceVideoContactSheetToResource(args))
    case 'system_resource_video_extract_audio_to_resource':
    case 'movscript_resource_video_extract_audio_to_resource':
      return toolText(await extractResourceVideoAudioToResource(args))
    case 'system_resource_image_annotate':
    case 'movscript_resource_image_annotate':
      return await annotateResourceImage(args) as MCPJSONValue
    case 'system_resource_upload':
    case 'movscript_resource_upload':
      return toolText(await uploadAgentImageResource(args))
    case 'system_resource_upload_batch':
    case 'movscript_resource_upload_batch':
      return toolText(await uploadAgentImageResources(args))
    case 'system_shot_library_query':
    case 'movscript_shot_library_query':
      return toolText(await queryShotLibrary(args))
    case 'system_shot_group_create':
    case 'movscript_shot_group_create':
      return toolText(await createShotGroup(args))
    case 'system_shot_group_get':
    case 'movscript_shot_group_get':
      return toolText(await getShotGroup(args))
    case 'system_shot_group_add_shots':
    case 'movscript_shot_group_add_shots':
      return toolText(await addShotsToGroup(args))
    case 'system_video_shot_cuts_analyze':
    case 'movscript_video_shot_cuts_analyze':
      return toolText(await analyzeVideoShotCuts(args))
    case 'system_external_resource_source_list':
    case 'movscript_external_resource_source_list':
      return toolText(await listExternalResourceSources(args))
    case 'system_external_resource_search':
    case 'movscript_external_resource_search':
      return toolText(await searchExternalResources(args))
    case 'system_artifact_upload_export':
      return toolText(await artifactUploadExport(args))
    case 'system_artifact_upload_hls_stream':
      return toolText(await artifactUploadHlsStream(args))
    case 'system_artifact_get_stream':
      return toolText(await artifactGetStream(args))
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
    case 'domain_read_content_workspace':
      return toolText(await domainReadContentWorkspace(args))
    case 'domain_read_content_workspace_snapshot':
      return toolText(await domainReadContentWorkspaceSnapshot(args))
    case 'domain_read_project_context_snapshot':
      return toolText(await domainReadProjectContextSnapshot(args))
    case 'domain_derive_content_unit_artifact':
      return toolText(await domainInterpretContentUnitArtifact(args))
    case 'domain_build_content_unit_backend_prompt':
      return toolText(await domainBuildContentUnitBackendPrompt(args))
    case 'domain_read_preview_timeline':
      return toolText(await domainReadPreviewTimeline(args))
    case 'domain_read_production_timeline':
      return toolText(await domainReadProductionTimeline(args))
    case 'domain_read_scene_moment_edit_plan':
      return toolText(await domainReadSceneMomentEditPlan(args))
    case 'domain_read_production_edit_plan':
      return toolText(await domainReadProductionEditPlan(args))
    case 'domain_create_editing_project_context':
      return toolText(await domainCreateEditingProjectContext(args))
    case 'domain_read_scene_moment_timeline':
      return toolText(await domainReadSceneMomentTimeline(args))
    case 'domain_read_content_unit_runtime_panel':
      return toolText(await domainReadContentUnitRuntimePanel(args))
    case 'domain_read_content_unit_generation_prompt':
    case 'domain_read_content_unit_input_version':
      return toolText(await domainReadContentUnitGenerationPrompt(args))
    case 'domain_read_content_unit_dependency_report':
      return toolText(await domainReadContentUnitDependencyReport(args))
    case 'domain_read_content_unit_selection_validity':
      return toolText(await domainReadContentUnitSelectionValidity(args))
    case 'domain_upsert_project_standards':
      return toolText(await domainUpsertProjectStandards(args))
    case 'domain_upsert_setting':
      return toolText(await domainUpsertSetting(args))
    case 'domain_upsert_setting_state':
      return toolText(await domainUpsertSettingState(args))
    case 'domain_upsert_setting_tree':
      return toolText(await domainUpsertSettingTree(args))
    case 'domain_upsert_asset':
      return toolText(await domainUpsertAsset(args))
    case 'domain_certify_asset_provider':
    case 'domain_certify_asset_seedance2':
      return toolText(await domainCertifyAssetProvider(args))
    case 'domain_query_remote_asset_groups':
      return toolText(await domainQueryRemoteAssetGroups(args))
    case 'domain_query_remote_assets':
      return toolText(await domainQueryRemoteAssets(args))
    case 'domain_upsert_script':
      return toolText(await domainUpsertScript(args))
    case 'domain_read_script_source':
      return toolText(await domainReadScriptSource(args))
    case 'domain_snapshot_script_version':
      return toolText(await domainSnapshotScriptVersion(args))
    case 'domain_upsert_content_unit':
      return toolText(await domainUpsertContentUnit(args))
    case 'domain_upsert_production':
      return toolText(await domainUpsertProduction(args))
    case 'domain_upsert_production_tree':
      return toolText(await domainUpsertProductionTree(args))
    case 'domain_upsert_timeline_namespace_tree':
      return toolText(await domainUpsertTimelineNamespaceTree(args))
    case 'domain_upsert_segment':
      return toolText(await domainUpsertSegment(args))
    case 'domain_upsert_scene_moment':
      return toolText(await domainUpsertSceneMoment(args))
    case 'domain_upsert_keyframe':
      return toolText(await domainUpsertKeyframe(args))
    case 'domain_upsert_storyboard':
      return toolText(await domainUpsertStoryboard(args))
    case 'domain_upsert_audio_cue':
      return toolText(await domainUpsertAudioCue(args))
    case 'domain_upsert_expression_unit':
      return toolText(await domainUpsertExpressionUnit(args))
    case 'domain_update_content_unit_prompt':
      return toolText(await domainUpdateContentUnitPrompt(args))
    case 'domain_update_entity_transition':
      return toolText(await domainUpdateEntityTransition(args))
    case 'domain_update_storyboard_timeline':
      return toolText(await domainUpdateStoryboardTimeline(args))
    case 'domain_append_candidate':
      return toolText(await domainAppendCandidate(args))
    case 'domain_create_content_candidate':
      return toolText(await domainCreateContentCandidate(args))
    case 'domain_register_raw_resource_as_content_unit_candidate':
      return toolText(await domainRegisterRawResourceAsContentUnitCandidate(args))
    case 'domain_create_content_candidate_batch':
      return toolText(await domainCreateContentCandidateBatch(args))
    case 'domain_create_asset_slot_candidate':
      return toolText(await domainCreateAssetSlotCandidate(args))
    case 'domain_create_keyframe_candidate':
      return toolText(await domainCreateKeyframeCandidate(args))
    case 'domain_select_content_unit_candidate':
      return toolText(await domainSelectContentUnitCandidate(args))
    case 'domain_select_content_unit_candidate_batch':
      return toolText(await domainSelectContentUnitCandidateBatch(args))
    case 'domain_decide_content_unit_candidate':
      return toolText(await domainDecideContentUnitCandidate(args))
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
    case 'domain_read_production_work_plan':
      return toolText(await domainReadProductionWorkPlan(args))
    case 'domain_production_status_summary':
      return toolText(await domainProductionStatusSummary(args))
    case 'domain_inspect':
      return toolText(await domainInspect(args))
    case 'domain_review':
      return toolText(await domainReview(args))
    case 'domain_interpret':
      return interpretToolText(await domainInterpret(args))
    case 'domain_regeneration_plan':
      return toolText(await domainRegenerationPlan(args))
    case 'editing_project_create':
      return toolText(await editingProjectCreate(args))
    case 'editing_project_create_from_edit_plan':
      return toolText(await editingProjectCreateFromEditPlan(args))
    case 'editing_project_create_from_edit_decisions':
      return toolText(await editingProjectCreateFromEditDecisions(args))
    case 'editing_video_compose':
      return toolText(await editingVideoCompose(args))
    case 'editing_project_add_asset':
      return toolText(await editingProjectAddAsset(args))
    case 'editing_project_remove_asset':
      return toolText(await editingProjectRemoveAsset(args))
    case 'editing_project_get':
      return toolText(await editingProjectGet(args))
    case 'editing_project_update_settings':
      return toolText(await editingProjectUpdateSettings(args))
    case 'editing_project_save':
      return toolText(await editingProjectSave(args))
    case 'editing_timeline_apply_commands':
      return toolText(await editingTimelineApplyCommands(args))
    case 'editing_timeline_add_track':
      return toolText(await editingTimelineAddTrack(args))
    case 'editing_timeline_remove_track':
      return toolText(await editingTimelineRemoveTrack(args))
    case 'editing_timeline_add_clip':
      return toolText(await editingTimelineAddClip(args))
    case 'editing_timeline_update_clip':
      return toolText(await editingTimelineUpdateClip(args))
    case 'editing_timeline_split_clip':
      return toolText(await editingTimelineSplitClip(args))
    case 'editing_timeline_move_clip':
      return toolText(await editingTimelineMoveClip(args))
    case 'editing_timeline_delete_clip':
      return toolText(await editingTimelineDeleteClip(args))
    case 'editing_timeline_validate':
      return toolText(await editingTimelineValidate(args))
    case 'editing_runtime_capabilities_get':
      return toolText(await editingRuntimeCapabilitiesGet(args))
    case 'editing_task_render_create':
      return toolText(await editingTaskRenderCreate(args))
    case 'editing_task_hls_create':
      return toolText(await editingTaskHlsCreate(args))
    case 'editing_task_transcode_create':
      return toolText(await editingTaskTranscodeCreate(args))
    case 'editing_task_reframe_create':
      return toolText(await editingTaskReframeCreate(args))
    case 'editing_task_get':
      return toolText(await editingTaskGet(args))
    case 'editing_task_cancel':
      return toolText(await editingTaskCancel(args))
    case 'editing_task_logs_get':
      return toolText(await editingTaskLogsGet(args))
    case 'editing_export_import_resource':
      return toolText(await editingExportImportResource(args))
    case 'editing_export_save_local':
      return toolText(await editingExportSaveLocal(args))
    case 'editing_export_publish_hls':
      return toolText(await editingExportPublishHls(args))
    case 'editing_export_create_candidate':
      return toolText(await editingExportCreateCandidate(args))
    case 'system_project_create':
    case 'movscript_project_create':
      return toolText(await createProject(args))
    case 'system_project_init':
    case 'movscript_project_init':
      return toolText(await initLocalProject(args))
    case 'system_project_fetch':
    case 'system_project_open':
    case 'movscript_project_open':
    case 'movscript_project_fetch':
      return toolText(await fetchLocalProject(args))
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

function interpretToolText(value: unknown): MCPJSONValue {
  return toolText(value, summarizeWorkspaceInterpretForAgent(value))
}
