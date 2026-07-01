import { createServer } from 'node:http'
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
} from '@movscript/runtime-contracts'
import { createNodeMovScriptEngine, NodeMovScriptEngineRegistry } from '@movscript/engine/node'
import {
  createMediaEditingProjectFromProductionTimelineClips,
} from '@movscript/editing'
import { buildContentUnitBackendPromptById } from '@movscript/prompt'
import {
  PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT,
  PROJECT_SERVICE_CAPABILITIES_ENDPOINT,
  PROJECT_SERVICE_ASSET_CREATE_ENDPOINT,
  PROJECT_SERVICE_ASSET_PROVIDER_CERTIFICATION_PATCH_ENDPOINT,
  PROJECT_SERVICE_ASSET_UPSERT_ENDPOINT,
  PROJECT_SERVICE_ASSETS_QUERY_ENDPOINT,
  PROJECT_SERVICE_AUDIO_CUE_CREATE_ENDPOINT,
  PROJECT_SERVICE_AUDIO_CUE_UPDATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVASES_LIST_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_DELETE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_RENAME_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_RUN_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_WRITE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_WORKSPACE_READ_ENDPOINT,
  PROJECT_SERVICE_CONTENT_WORKSPACE_SNAPSHOT_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_CREATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_EDIT_PROMPT_UPDATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_ENSURE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_UPSERT_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_DECIDE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_SELECT_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNITS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_ENTITY_BASICS_UPDATE_ENDPOINT,
  PROJECT_SERVICE_ENTITY_DELETE_ENDPOINT,
  PROJECT_SERVICE_ENTITY_TRANSITION_UPDATE_ENDPOINT,
  PROJECT_SERVICE_ENTITIES_QUERY_ENDPOINT,
  PROJECT_SERVICE_EXPRESSION_UNIT_CREATE_ENDPOINT,
  PROJECT_SERVICE_EXPRESSION_UNIT_UPDATE_ENDPOINT,
  PROJECT_SERVICE_HIERARCHY_WRITE_ENDPOINT,
  PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT,
  PROJECT_SERVICE_NAME,
  PROJECT_SERVICE_NAMESPACE_WRITE_ENDPOINT,
  PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_CREATE_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_SNAPSHOT_SAVE_ENDPOINT,
  PROJECT_SERVICE_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT,
  PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_SCRIPT_SOURCE_READ_ENDPOINT,
  PROJECT_SERVICE_SCRIPT_UPSERT_ENDPOINT,
  PROJECT_SERVICE_SCRIPT_VERSION_SNAPSHOT_ENDPOINT,
  PROJECT_SERVICE_SCENE_MOMENT_CREATE_ENDPOINT,
  PROJECT_SERVICE_SCENE_MOMENT_SETTING_CONNECT_ENDPOINT,
  PROJECT_SERVICE_SEGMENT_CREATE_ENDPOINT,
  PROJECT_SERVICE_SETTING_CREATE_ENDPOINT,
  PROJECT_SERVICE_SETTING_STATE_CREATE_ENDPOINT,
  PROJECT_SERVICE_SETTING_UPSERT_ENDPOINT,
  PROJECT_SERVICE_SETTINGS_QUERY_ENDPOINT,
  PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INSPECT_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT,
  PROJECT_SERVICE_SOURCE_OVERVIEW_ENDPOINT,
  PROJECT_SERVICE_SOURCE_PRODUCTION_WORK_PLAN_ENDPOINT,
  PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT,
  PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT,
  PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT,
  PROJECT_SERVICE_STORYBOARD_CREATE_ENDPOINT,
  PROJECT_SERVICE_STORYBOARD_TIMELINE_UPDATE_ENDPOINT,
  PROJECT_SERVICE_KEYFRAME_CREATE_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_RESOURCES_REFRESH_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_CREATE_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_DELETE_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_LIST_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_OPEN_ENDPOINT,
  PROJECT_SERVICE_WORKSPACE_ASSET_SLOT_CANDIDATE_CREATE_ENDPOINT,
  PROJECT_SERVICE_WORKSPACE_CANDIDATE_APPEND_ENDPOINT,
  PROJECT_SERVICE_WORKSPACE_CANDIDATE_SELECT_ENDPOINT,
  PROJECT_SERVICE_WORKSPACE_KEYFRAME_CANDIDATE_CREATE_ENDPOINT,
} from '@movscript/project'
import {
  queryMovScriptWorkspaceAssets,
  queryMovScriptWorkspaceEntities,
  queryMovScriptWorkspaceProductionContext,
  queryMovScriptWorkspaceSettings,
} from '@movscript/workspace'
import {
  interpretMovScriptWorkspace,
  overviewMovScriptWorkspace,
  inspectMovScriptWorkspace,
  planMovScriptWorkspaceRegeneration,
  resolveWorkspaceSource,
} from '@movscript/interpreter/node'
import {
  createNodeMovScriptWorkspaceFileRepository,
  createNodeMovScriptWorkspaceService,
} from '@movscript/workspace/node'
import {
  createMovScriptScopedProjectDataDecisionStore,
  normalizeDecisionContext,
} from '@movscript/workspace/repository'
import {
  buildContentSourceWorkspaceProjectTimelineStatus,
  buildContentSourceWorkspaceData,
  buildProjectContextSnapshot,
  contentSourceWorkspaceContentUnitStatusSummaries,
} from '@movscript/core/content'
import {
  loadContentSourceWorkspaceSnapshotFromEngine,
} from '@movscript/core/content/node'

const DATA_SERVICE_NAME = 'movscript.data.service'
const LOCAL_NODE_GATEWAY_SERVICE = 'movscript.local-node.gateway'
const CONTENT_CANVAS_DIRECTORY = 'content_canvases'
const CONTENT_CANVAS_FILE_NAME = 'canvas.json'
const CONTENT_CANVAS_SCHEMA = 'movscript.content_canvas.v1'
const CONTENT_CANVASES_SCHEMA = 'movscript.content_canvases.v1'
const CONTENT_CANVAS_TITLE_MAX_LENGTH = 80
const CONTENT_CANVAS_TITLE_INVALID_PATTERN = /[<>:"/\\|?*\u0000-\u001F]/
const PROJECT_SERVICE_ENGINE_CACHE_LIMIT = 32
const PROJECT_SERVICE_ENGINE_CACHE_SEPARATOR = '\u001f'
const projectServiceEngineRegistry = new NodeMovScriptEngineRegistry()
const projectServiceEngineCacheKeys = []

export {
  PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT,
  PROJECT_SERVICE_CAPABILITIES_ENDPOINT,
  PROJECT_SERVICE_ASSET_CREATE_ENDPOINT,
  PROJECT_SERVICE_ASSET_PROVIDER_CERTIFICATION_PATCH_ENDPOINT,
  PROJECT_SERVICE_ASSET_UPSERT_ENDPOINT,
  PROJECT_SERVICE_ASSETS_QUERY_ENDPOINT,
  PROJECT_SERVICE_AUDIO_CUE_CREATE_ENDPOINT,
  PROJECT_SERVICE_AUDIO_CUE_UPDATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVASES_LIST_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_DELETE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_RENAME_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_RUN_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_WRITE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_WORKSPACE_READ_ENDPOINT,
  PROJECT_SERVICE_CONTENT_WORKSPACE_SNAPSHOT_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_CREATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_EDIT_PROMPT_UPDATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_ENSURE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_UPSERT_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_DECIDE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_SELECT_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNITS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_ENTITY_BASICS_UPDATE_ENDPOINT,
  PROJECT_SERVICE_ENTITY_DELETE_ENDPOINT,
  PROJECT_SERVICE_ENTITY_TRANSITION_UPDATE_ENDPOINT,
  PROJECT_SERVICE_ENTITIES_QUERY_ENDPOINT,
  PROJECT_SERVICE_EXPRESSION_UNIT_CREATE_ENDPOINT,
  PROJECT_SERVICE_EXPRESSION_UNIT_UPDATE_ENDPOINT,
  PROJECT_SERVICE_HIERARCHY_WRITE_ENDPOINT,
  PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT,
  PROJECT_SERVICE_NAME,
  PROJECT_SERVICE_NAMESPACE_WRITE_ENDPOINT,
  PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_CREATE_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_SNAPSHOT_SAVE_ENDPOINT,
  PROJECT_SERVICE_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT,
  PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_SCRIPT_SOURCE_READ_ENDPOINT,
  PROJECT_SERVICE_SCRIPT_UPSERT_ENDPOINT,
  PROJECT_SERVICE_SCRIPT_VERSION_SNAPSHOT_ENDPOINT,
  PROJECT_SERVICE_SCENE_MOMENT_CREATE_ENDPOINT,
  PROJECT_SERVICE_SCENE_MOMENT_SETTING_CONNECT_ENDPOINT,
  PROJECT_SERVICE_SEGMENT_CREATE_ENDPOINT,
  PROJECT_SERVICE_SETTING_CREATE_ENDPOINT,
  PROJECT_SERVICE_SETTING_STATE_CREATE_ENDPOINT,
  PROJECT_SERVICE_SETTING_UPSERT_ENDPOINT,
  PROJECT_SERVICE_SETTINGS_QUERY_ENDPOINT,
  PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INSPECT_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT,
  PROJECT_SERVICE_SOURCE_OVERVIEW_ENDPOINT,
  PROJECT_SERVICE_SOURCE_PRODUCTION_WORK_PLAN_ENDPOINT,
  PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT,
  PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT,
  PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT,
  PROJECT_SERVICE_STORYBOARD_CREATE_ENDPOINT,
  PROJECT_SERVICE_STORYBOARD_TIMELINE_UPDATE_ENDPOINT,
  PROJECT_SERVICE_KEYFRAME_CREATE_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_RESOURCES_REFRESH_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_CREATE_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_DELETE_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_LIST_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_OPEN_ENDPOINT,
  PROJECT_SERVICE_WORKSPACE_ASSET_SLOT_CANDIDATE_CREATE_ENDPOINT,
  PROJECT_SERVICE_WORKSPACE_CANDIDATE_APPEND_ENDPOINT,
  PROJECT_SERVICE_WORKSPACE_CANDIDATE_SELECT_ENDPOINT,
  PROJECT_SERVICE_WORKSPACE_KEYFRAME_CANDIDATE_CREATE_ENDPOINT,
} from '@movscript/project'

export const PROJECT_SERVICE_CAPABILITIES = Object.freeze([
  'project-read-model',
  'project-home-read-model',
  'project-standards-read-model',
  'project-content-canvas-read-model',
  'project-scripts-read-model',
  'project-content-units-read-model',
  'project-lifecycle',
  'project-locator',
  'project-resource-view',
  'project-resource-view-debug-compat',
  'domain-source',
  'candidate-view',
  'prompt-context',
  'interpret',
  'content-canvas-run',
  'production-editing-workspaces',
  'production-editing-resources',
  'project-standards',
  'project-scripts',
  'production-work-plan',
  'workspace-candidate-actions',
  'content-candidate-actions',
])

const PROJECT_SOURCE_OPERATION_ROUTES = new Map([
  [PROJECT_SERVICE_ENTITIES_QUERY_ENDPOINT, {
    schema: 'movscript.project-entities-query.v1',
    run: (engine, input) => engine.workspaceService.queryEntities(input.query),
  }],
  [PROJECT_SERVICE_SETTINGS_QUERY_ENDPOINT, {
    schema: 'movscript.project-settings-query.v1',
    run: (engine, input) => engine.workspaceService.querySettings(input.query),
  }],
  [PROJECT_SERVICE_ASSETS_QUERY_ENDPOINT, {
    schema: 'movscript.project-assets-query.v1',
    run: (engine, input) => engine.workspaceService.queryAssets(input.query),
  }],
  [PROJECT_SERVICE_CONTENT_WORKSPACE_SNAPSHOT_ENDPOINT, {
    schema: 'movscript.project-content-workspace-snapshot.v1',
    run: (engine) => loadContentSourceWorkspaceSnapshotFromEngine(engine),
  }],
  [PROJECT_SERVICE_CONTENT_WORKSPACE_READ_ENDPOINT, {
    schema: 'movscript.project-content-workspace-read.v1',
    run: async (engine) => buildContentSourceWorkspaceData(await loadContentSourceWorkspaceSnapshotFromEngine(engine)),
  }],
  [PROJECT_SERVICE_SETTING_UPSERT_ENDPOINT, {
    schema: 'movscript.project-setting-upsert.v1',
    run: (engine, input) => engine.workspaceService.upsertSetting(input),
  }],
  [PROJECT_SERVICE_SETTING_CREATE_ENDPOINT, {
    schema: 'movscript.project-setting-create.v1',
    run: (engine, input) => engine.createSetting(input),
  }],
  [PROJECT_SERVICE_SETTING_STATE_CREATE_ENDPOINT, {
    schema: 'movscript.project-setting-state-create.v1',
    run: (engine, input) => engine.createSettingState(input),
  }],
  [PROJECT_SERVICE_ASSET_UPSERT_ENDPOINT, {
    schema: 'movscript.project-asset-upsert.v1',
    run: (engine, input) => engine.workspaceService.upsertAsset(input),
  }],
  [PROJECT_SERVICE_ASSET_CREATE_ENDPOINT, {
    schema: 'movscript.project-asset-create.v1',
    run: (engine, input) => engine.createAsset(input),
  }],
  [PROJECT_SERVICE_PRODUCTION_SNAPSHOT_SAVE_ENDPOINT, {
    schema: 'movscript.project-production-snapshot-save.v1',
    run: (engine, input) => engine.workspaceService.saveProductionSnapshot(input),
  }],
  [PROJECT_SERVICE_CONTENT_UNIT_UPSERT_ENDPOINT, {
    schema: 'movscript.project-content-unit-upsert.v1',
    run: (engine, input) => {
      rejectRemovedNamespacePlaybackContentUnitInput(input)
      return engine.workspaceService.upsertContentUnit(input)
    },
  }],
  [PROJECT_SERVICE_CONTENT_UNIT_CREATE_ENDPOINT, {
    schema: 'movscript.project-content-unit-create.v1',
    run: (engine, input) => {
      rejectRemovedNamespacePlaybackContentUnitInput(input)
      return engine.createContentUnit(input)
    },
  }],
  [PROJECT_SERVICE_CONTENT_UNIT_ENSURE_ENDPOINT, {
    schema: 'movscript.project-content-unit-ensure.v1',
    run: (engine, input) => {
      rejectRemovedNamespacePlaybackContentUnitInput(input)
      return engine.ensureContentUnitForEntity(input)
    },
  }],
  [PROJECT_SERVICE_CONTENT_UNIT_EDIT_PROMPT_UPDATE_ENDPOINT, {
    schema: 'movscript.project-content-unit-edit-prompt-update.v1',
    run: (engine, input) => engine.workspaceService.updateContentUnitEditPrompt(input),
  }],
  [PROJECT_SERVICE_PRODUCTION_CREATE_ENDPOINT, {
    schema: 'movscript.project-production-create.v1',
    run: (engine, input) => engine.createProduction(input),
  }],
  [PROJECT_SERVICE_SEGMENT_CREATE_ENDPOINT, {
    schema: 'movscript.project-segment-create.v1',
    run: (engine, input) => engine.createSegment(input),
  }],
  [PROJECT_SERVICE_SCENE_MOMENT_CREATE_ENDPOINT, {
    schema: 'movscript.project-scene-moment-create.v1',
    run: (engine, input) => engine.createSceneMoment(input),
  }],
  [PROJECT_SERVICE_SCENE_MOMENT_SETTING_CONNECT_ENDPOINT, {
    schema: 'movscript.project-scene-moment-setting-connect.v1',
    run: (engine, input) => engine.connectSceneMomentSetting(input),
  }],
  [PROJECT_SERVICE_EXPRESSION_UNIT_CREATE_ENDPOINT, {
    schema: 'movscript.project-expression-unit-create.v1',
    run: (engine, input) => engine.createExpressionUnit(input),
  }],
  [PROJECT_SERVICE_EXPRESSION_UNIT_UPDATE_ENDPOINT, {
    schema: 'movscript.project-expression-unit-update.v1',
    run: (engine, input) => engine.workspaceService.updateExpressionUnitSource(input),
  }],
  [PROJECT_SERVICE_KEYFRAME_CREATE_ENDPOINT, {
    schema: 'movscript.project-keyframe-create.v1',
    run: (engine, input) => engine.createKeyframe(input),
  }],
  [PROJECT_SERVICE_STORYBOARD_CREATE_ENDPOINT, {
    schema: 'movscript.project-storyboard-create.v1',
    run: (engine, input) => engine.createStoryboard(input),
  }],
  [PROJECT_SERVICE_STORYBOARD_TIMELINE_UPDATE_ENDPOINT, {
    schema: 'movscript.project-storyboard-timeline-update.v1',
    run: (engine, input) => engine.workspaceService.updateStoryboardTimeline(input),
  }],
  [PROJECT_SERVICE_AUDIO_CUE_CREATE_ENDPOINT, {
    schema: 'movscript.project-audio-cue-create.v1',
    run: (engine, input) => engine.createAudioCue(input),
  }],
  [PROJECT_SERVICE_AUDIO_CUE_UPDATE_ENDPOINT, {
    schema: 'movscript.project-audio-cue-update.v1',
    run: (engine, input) => engine.workspaceService.updateAudioCueSource(input),
  }],
  [PROJECT_SERVICE_ENTITY_BASICS_UPDATE_ENDPOINT, {
    schema: 'movscript.project-entity-basics-update.v1',
    run: (engine, input) => engine.updateEntityBasics(input),
  }],
  [PROJECT_SERVICE_ENTITY_TRANSITION_UPDATE_ENDPOINT, {
    schema: 'movscript.project-entity-transition-update.v1',
    run: (engine, input) => engine.workspaceService.updateEntityTransition(input),
  }],
  [PROJECT_SERVICE_ENTITY_DELETE_ENDPOINT, {
    schema: 'movscript.project-entity-delete.v1',
    run: async (engine, input) => {
      await engine.workspaceService.deleteEntity(input)
      return { status: 'deleted' }
    },
  }],
  [PROJECT_SERVICE_HIERARCHY_WRITE_ENDPOINT, {
    schema: 'movscript.project-hierarchy-write.v1',
    run: (engine, input) => engine.writeHierarchyNode(input),
  }],
  [PROJECT_SERVICE_NAMESPACE_WRITE_ENDPOINT, {
    schema: 'movscript.project-namespace-write.v1',
    run: (engine, input) => engine.writeHierarchyNode(namespaceHierarchyNodeInput(input)),
  }],
  [PROJECT_SERVICE_WORKSPACE_CANDIDATE_SELECT_ENDPOINT, {
    schema: 'movscript.project-workspace-candidate-select.v1',
    run: (engine, input) => engine.workspaceService.selectCandidate(input),
  }],
  [PROJECT_SERVICE_WORKSPACE_CANDIDATE_APPEND_ENDPOINT, {
    schema: 'movscript.project-workspace-candidate-append.v1',
    run: (engine, input) => engine.workspaceService.appendCandidate(input),
  }],
  [PROJECT_SERVICE_WORKSPACE_ASSET_SLOT_CANDIDATE_CREATE_ENDPOINT, {
    schema: 'movscript.project-workspace-asset-slot-candidate-create.v1',
    run: (engine, input) => engine.workspaceService.createAssetSlotCandidate(input),
  }],
  [PROJECT_SERVICE_WORKSPACE_KEYFRAME_CANDIDATE_CREATE_ENDPOINT, {
    schema: 'movscript.project-workspace-keyframe-candidate-create.v1',
    run: (engine, input) => engine.workspaceService.createKeyframeCandidate(input),
  }],
])

export function createProjectServiceHandler(options = {}) {
  const serviceName = options.serviceName ?? PROJECT_SERVICE_NAME
  const capabilities = options.capabilities ?? PROJECT_SERVICE_CAPABILITIES
  const now = options.now ?? (() => new Date())
  const logger = options.logger
  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const requestScope = createProjectServiceRequestScope({ request, url, logger })
    request.__projectServiceRequestScope = requestScope
    response.__projectServiceRequestScope = requestScope
    try {
      if (request.method === 'OPTIONS') {
        writeCORSPreflight(response)
        return
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        writeJSON(response, 200, {
          status: 'ok',
          serviceName,
          capabilities,
        })
        return
      }
      if (request.method === 'GET' && url.pathname === PROJECT_SERVICE_CAPABILITIES_ENDPOINT) {
        writeJSON(response, 200, {
          serviceName,
          capabilities,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const source = await resolveWorkspaceSource(context.fileRepository, context.sourceOptions)
        writeJSON(response, 200, {
          schema: 'movscript.project-source-snapshot.v1',
          projectDir: context.projectDir,
          source,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_SOURCE_INSPECT_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const inspection = await inspectMovScriptWorkspace({
          fileRepository: context.fileRepository,
          decisionStore: context.decisionStore,
          now: now(),
          ...context.inspectOptions,
        })
        writeJSON(response, 200, {
          schema: 'movscript.project-source-inspection.v1',
          projectDir: context.projectDir,
          inspection,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_SOURCE_OVERVIEW_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const overview = await overviewMovScriptWorkspace({
          fileRepository: context.fileRepository,
          decisionStore: context.decisionStore,
          now: now(),
        })
        writeJSON(response, 200, {
          schema: 'movscript.project-read-model-overview.v1',
          projectDir: context.projectDir,
          overview,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_READ_MODEL_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const projectReadModel = await readProjectReadModel(context, now())
        writeJSON(response, 200, {
          schema: 'movscript.project-read-model.v1',
          projectDir: context.projectDir,
          projectReadModel,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const projectHomeReadModel = await readProjectHomeReadModel(context, now())
        writeJSON(response, 200, {
          schema: 'movscript.project-home-read-model.v1',
          projectDir: context.projectDir,
          projectHomeReadModel,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const projectStandardsReadModel = await readProjectStandardsReadModel(context, now())
        writeJSON(response, 200, {
          schema: 'movscript.project-standards-read-model.v1',
          projectDir: context.projectDir,
          projectStandardsReadModel,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_CONTENT_CANVAS_READ_MODEL_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const projectContentCanvasReadModel = await readProjectContentCanvasReadModel(context, now())
        writeJSON(response, 200, {
          schema: 'movscript.project-content-canvas-read-model.v1',
          projectDir: context.projectDir,
          projectContentCanvasReadModel,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const projectScriptsReadModel = await readProjectScriptsReadModel(context, now())
        writeJSON(response, 200, {
          schema: 'movscript.project-scripts-read-model.v1',
          projectDir: context.projectDir,
          projectScriptsReadModel,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_CONTENT_UNITS_READ_MODEL_ENDPOINT) {
        const body = await readJSONBody(request)
        const projectDir = projectDirFromBody(body)
        const contentUnitIds = readModelContentUnitIdsFromBody(body)
        const projectContentUnitsReadModel = await readProjectContentUnitsReadModel({
          projectDir,
          body,
          contentUnitIds,
          decisionStore: await optionalDecisionStoreFromBody(body, projectDir),
          requestScope: request.__projectServiceRequestScope,
          now: now(),
        })
        writeJSON(response, 200, {
          schema: 'movscript.project-content-units-read-model.v1',
          projectDir,
          projectContentUnitsReadModel,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const interpretation = await interpretMovScriptWorkspace({
          fileRepository: context.fileRepository,
          decisionStore: context.decisionStore,
          now: now(),
          debugArtifacts: context.debugArtifacts,
        })
        writeJSON(response, 200, {
          schema: 'movscript.project-source-interpretation.v1',
          projectDir: context.projectDir,
          interpretation,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const regenerationPlan = await planMovScriptWorkspaceRegeneration({
          fileRepository: context.fileRepository,
          decisionStore: context.decisionStore,
          now: now(),
        })
        writeJSON(response, 200, {
          schema: 'movscript.project-source-regeneration-plan.v1',
          projectDir: context.projectDir,
          regenerationPlan,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_SOURCE_PRODUCTION_WORK_PLAN_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const engine = createProjectWorkspaceEngine(context)
        const productionWorkPlan = await engine.productionWorkPlan()
        writeJSON(response, 200, {
          schema: 'movscript.project-source-production-work-plan.v1',
          projectDir: context.projectDir,
          productionWorkPlan,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const engine = createProjectWorkspaceEngine(context)
        writeJSON(response, 200, projectSourceOperationEnvelope(
          context.projectDir,
          await engine.workspaceService.upsertProjectStandards(projectSourceOperationInput(context.body)),
          'movscript.project-standards-upsert.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_SCRIPT_SOURCE_READ_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const engine = createProjectWorkspaceEngine(context)
        writeJSON(response, 200, projectSourceOperationEnvelope(
          context.projectDir,
          await engine.workspaceService.readScriptSource(projectSourceOperationInput(context.body)),
          'movscript.project-script-source-read.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_SCRIPT_UPSERT_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const engine = createProjectWorkspaceEngine(context)
        writeJSON(response, 200, projectSourceOperationEnvelope(
          context.projectDir,
          await engine.workspaceService.upsertScript(projectSourceOperationInput(context.body)),
          'movscript.project-script-upsert.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_SCRIPT_VERSION_SNAPSHOT_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const engine = createProjectWorkspaceEngine(context)
        writeJSON(response, 200, projectSourceOperationEnvelope(
          context.projectDir,
          await engine.workspaceService.snapshotScriptVersionFromMarkdown(projectSourceOperationInput(context.body)),
          'movscript.project-script-version-snapshot.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_ASSET_PROVIDER_CERTIFICATION_PATCH_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        writeJSON(response, 200, projectSourceOperationEnvelope(
          context.projectDir,
          await patchProjectAssetProviderCertification(context.fileRepository, projectSourceOperationInput(context.body)),
          'movscript.project-asset-provider-certification-patch.v1',
        ))
        return
      }
      const sourceOperation = PROJECT_SOURCE_OPERATION_ROUTES.get(url.pathname)
      if (request.method === 'POST' && sourceOperation) {
        const context = await readProjectSourceContext(request)
        const engine = createProjectWorkspaceEngine(context)
        writeJSON(response, 200, projectSourceOperationEnvelope(
          context.projectDir,
          await sourceOperation.run(engine, projectSourceOperationInput(context.body)),
          sourceOperation.schema,
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_CONTENT_CANVASES_LIST_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        writeJSON(response, 200, projectContentCanvasEnvelope(
          context.projectDir,
          await listProjectContentCanvases(context.fileRepository),
          'movscript.project-content-canvases-list.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_CONTENT_CANVAS_WRITE_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        writeJSON(response, 200, projectContentCanvasEnvelope(
          context.projectDir,
          await writeProjectContentCanvas(context.fileRepository, context.body),
          'movscript.project-content-canvas-write.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_CONTENT_CANVAS_RENAME_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        writeJSON(response, 200, projectContentCanvasEnvelope(
          context.projectDir,
          await renameProjectContentCanvas(context.fileRepository, context.body),
          'movscript.project-content-canvas-rename.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_CONTENT_CANVAS_RUN_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        const engine = createProjectWorkspaceEngine(context)
        writeJSON(response, 200, projectContentCanvasEnvelope(
          context.projectDir,
          await runProjectContentCanvas({
            projectDir: context.projectDir,
            fileRepository: context.fileRepository,
            engine,
            input: context.body,
            now: now(),
          }),
          'movscript.project-content-canvas-run.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_CONTENT_CANVAS_DELETE_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        writeJSON(response, 200, projectContentCanvasEnvelope(
          context.projectDir,
          await deleteProjectContentCanvas(context.fileRepository, context.body),
          'movscript.project-content-canvas-delete.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_PRODUCTION_EDITING_RESOURCES_REFRESH_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        writeJSON(response, 200, projectProductionEditingEnvelope(
          context.projectDir,
          await refreshProjectProductionEditingResources({
            projectDir: context.projectDir,
            body: context.body,
            input: projectSourceOperationInput(context.body),
            decisionStore: context.decisionStore,
            requestScope: context.requestScope,
            now: now(),
          }),
          'movscript.production_editing_resources_refresh.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_LIST_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        writeJSON(response, 200, projectProductionEditingEnvelope(
          context.projectDir,
          await listProjectProductionEditingWorkspaces({
            projectDir: context.projectDir,
            input: projectSourceOperationInput(context.body),
          }),
          'movscript.production_editing_workspaces_list.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_CREATE_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        writeJSON(response, 200, projectProductionEditingEnvelope(
          context.projectDir,
          await createProjectProductionEditingWorkspace({
            projectDir: context.projectDir,
            fileRepository: context.fileRepository,
            body: context.body,
            input: projectSourceOperationInput(context.body),
            decisionStore: context.decisionStore,
            requestScope: context.requestScope,
            now: now(),
          }),
          'movscript.production_editing_workspace_create.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_OPEN_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        writeJSON(response, 200, projectProductionEditingEnvelope(
          context.projectDir,
          await openProjectProductionEditingWorkspace({
            projectDir: context.projectDir,
            body: context.body,
            input: projectSourceOperationInput(context.body),
            decisionStore: context.decisionStore,
            requestScope: context.requestScope,
            now: now(),
          }),
          'movscript.production_editing_workspace_open.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_DELETE_ENDPOINT) {
        const context = await readProjectSourceContext(request)
        writeJSON(response, 200, projectProductionEditingEnvelope(
          context.projectDir,
          await deleteProjectProductionEditingWorkspace({
            projectDir: context.projectDir,
            input: projectSourceOperationInput(context.body),
          }),
          'movscript.production_editing_workspace_delete.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT) {
        const body = await readJSONBody(request)
        const projectDir = projectDirFromBody(body)
        const command = stringValue(body.command)
        if (!command) {
          throw httpError(400, 'project_source_command_required', 'command is required')
        }
        const result = await executeProjectSourceCommand({
          projectDir,
          command,
          input: recordValue(body.input) ?? {},
          decisionStore: await optionalDecisionStoreFromBody(body, projectDir),
          now: now(),
        })
        writeJSON(response, 200, {
          schema: 'movscript.project-source-command-result.v1',
          projectDir,
          command,
          result,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT) {
        const body = await readJSONBody(request)
        const projectDir = projectDirFromBody(body)
        const command = stringValue(body.command)
        if (!command) {
          throw httpError(400, 'project_lifecycle_command_required', 'command is required')
        }
        const result = await executeProjectLifecycleCommand({
          projectDir,
          command,
          input: recordValue(body.input) ?? {},
          now: now(),
        })
        writeJSON(response, 200, {
          schema: 'movscript.project-lifecycle-command-result.v1',
          projectDir,
          command,
          result,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT) {
        const body = await readJSONBody(request)
        const projectDir = projectDirFromBody(body)
        const locator = await resolveProjectLocator({
          projectDir,
          workspaceDir: pathStringValue(body.workspaceDir ?? body.workspace_dir),
          projectUid: stringValue(body.projectUid ?? body.project_uid),
        })
        writeJSON(response, 200, {
          schema: 'movscript.project-locator.v1',
          projectDir,
          locator,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT) {
        const body = await readJSONBody(request)
        const projectDir = projectDirFromBody(body)
        const kind = stringValue(body.kind)
        if (!kind) {
          throw httpError(400, 'project_resource_kind_required', 'kind is required')
        }
        const items = await readProjectResourceView({ projectDir, kind, body, requestScope: request.__projectServiceRequestScope })
        writeJSON(response, 200, {
          schema: 'movscript.project-resource-view.v1',
          projectDir,
          kind,
          usage: 'debug_compat',
          viewMode: 'debug_compat',
          view_mode: 'debug_compat',
          preferredEndpoint: preferredProjectReadModelEndpointForResourceKind(kind),
          preferred_endpoint: preferredProjectReadModelEndpointForResourceKind(kind),
          items,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT) {
        const context = await readProjectCandidateActionContext(request)
        writeJSON(response, 200, projectCandidateActionEnvelope(
          context.projectDir,
          await executeProjectCandidateAction(context, 'createContentCandidate'),
          'movscript.project-content-candidate-create.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_SELECT_ENDPOINT) {
        const context = await readProjectCandidateActionContext(request)
        writeJSON(response, 200, projectCandidateActionEnvelope(
          context.projectDir,
          await executeProjectCandidateAction(context, 'selectContentUnitCandidate'),
          'movscript.project-content-unit-candidate-select.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_DECIDE_ENDPOINT) {
        const context = await readProjectCandidateActionContext(request)
        writeJSON(response, 200, projectCandidateActionEnvelope(
          context.projectDir,
          await executeProjectCandidateAction(context, 'decideContentUnitCandidate'),
          'movscript.project-content-unit-candidate-decide.v1',
        ))
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT) {
        const body = await readJSONBody(request)
        const projectDir = projectDirFromBody(body)
        const command = stringValue(body.command)
        if (!command) {
          throw httpError(400, 'project_candidate_command_required', 'command is required')
        }
        const decisionStore = await optionalDecisionStoreFromBody(body, projectDir)
        if (!decisionStore) {
          throw httpError(400, 'project_candidate_decision_store_required', 'decisionStore or projectUid is required')
        }
        const result = await executeProjectCandidateCommand({
          projectDir,
          command,
          input: recordValue(body.input) ?? {},
          decisionStore,
        })
        writeJSON(response, 200, {
          schema: 'movscript.project-candidate-command-result.v1',
          projectDir,
          command,
          result,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT) {
        const body = await readJSONBody(request)
        const projectDir = projectDirFromBody(body)
        const contentUnitIds = contentUnitIdsFromBody(body)
        const decisionStore = await optionalDecisionStoreFromBody(body, projectDir)
        if (!decisionStore) {
          throw httpError(400, 'project_candidate_decision_store_required', 'decisionStore or projectUid is required')
        }
        const contexts = await readCandidateContexts(decisionStore, contentUnitIds, request.__projectServiceRequestScope)
        writeJSON(response, 200, {
          schema: 'movscript.project-candidate-view.v1',
          projectDir,
          ...(contentUnitIds.length === 1 ? { contentUnitId: contentUnitIds[0] } : {}),
          contentUnitIds,
          contexts,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT) {
        const body = await readJSONBody(request)
        const projectDir = projectDirFromBody(body)
        const contentUnitIds = promptContextContentUnitIdsFromBody(body)
        const promptContexts = await readProjectPromptContexts({
          projectDir,
          body,
          contentUnitIds,
          include: promptContextIncludeFromBody(body),
          promptText: stringValue(body.promptText ?? body.prompt_text),
          decisionStore: await optionalDecisionStoreFromBody(body, projectDir),
          requestScope: request.__projectServiceRequestScope,
        })
        const singleContext = promptContexts.length === 1 ? promptContexts[0] : undefined
        writeJSON(response, 200, {
          schema: 'movscript.project-prompt-context.v1',
          projectDir,
          ...(singleContext ? {
            contentUnitId: singleContext.contentUnitId,
            ...singleContext.context,
          } : {}),
          contentUnitIds,
          contexts: promptContexts,
        })
        return
      }
      writeJSON(response, 404, {
        error: 'not_found',
      })
    } catch (error) {
      writeProjectServiceError(response, error)
    }
  }
}

export function startProjectService(options = {}) {
  const host = options.host ?? '127.0.0.1'
  const port = Number(options.port ?? 0)
  const server = createServer(createProjectServiceHandler(options))
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      const address = server.address()
      const actualPort = typeof address === 'object' && address ? address.port : port
      resolve({
        server,
        host,
        port: actualPort,
        url: `http://${host}:${actualPort}`,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close(error => error ? closeReject(error) : closeResolve())
        }),
      })
    })
  })
}

export async function runProjectServiceCLI(argv = [], env = process.env) {
  const command = argv[0] ?? 'serve'
  if (command !== 'serve') {
    throw new Error(`unsupported project-service command: ${command}`)
  }
  const host = env.MOVSCRIPT_PROJECT_SERVICE_HOST || '127.0.0.1'
  const port = Number(env.MOVSCRIPT_PROJECT_SERVICE_PORT || env.PORT || 0)
  const logger = env.MOVSCRIPT_PROJECT_SERVICE_PERF_LOG === '0' ? undefined : projectServiceConsoleLogger
  const runtime = await startProjectService({ host, port, logger })
  process.stdout.write(JSON.stringify({
    serviceName: PROJECT_SERVICE_NAME,
    url: runtime.url,
  }) + '\n')
  await waitForShutdown(runtime)
}

function writeJSON(response, statusCode, payload) {
  const body = JSON.stringify(payload)
  const scope = response.__projectServiceRequestScope
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    ...projectServiceCORSHeaders(),
  }
  if (scope?.requestId) headers['x-request-id'] = scope.requestId
  response.writeHead(statusCode, {
    ...headers,
  })
  response.end(body)
  logProjectServiceRequest(scope, {
    statusCode,
    responseBytes: Buffer.byteLength(body),
  })
}

function createProjectServiceRequestScope({ request, url, logger }) {
  const routeKind = projectServiceObservedRouteKind(url.pathname)
  return {
    logger: typeof logger === 'function' ? logger : undefined,
    observed: Boolean(routeKind),
    requestId: projectServiceRequestId(request),
    method: request.method ?? 'GET',
    endpoint: url.pathname,
    routeKind,
    startedAtMs: Date.now(),
  }
}

function projectServiceRequestId(request) {
  const header = request.headers?.['x-request-id']
  const explicit = Array.isArray(header) ? header[0] : header
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim()
  return `ps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function projectServiceObservedRouteKind(pathname) {
  if (pathname === PROJECT_SERVICE_READ_MODEL_ENDPOINT
    || pathname === PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT
    || pathname === PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT
    || pathname === PROJECT_SERVICE_CONTENT_CANVAS_READ_MODEL_ENDPOINT
    || pathname === PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT
    || pathname === PROJECT_SERVICE_CONTENT_UNITS_READ_MODEL_ENDPOINT) {
    return 'read-model'
  }
  if (pathname === PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT) return 'prompt'
  if (pathname === PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT) return 'resource'
  if (pathname === PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT
    || pathname === PROJECT_SERVICE_SOURCE_INSPECT_ENDPOINT
    || pathname === PROJECT_SERVICE_SOURCE_OVERVIEW_ENDPOINT
    || pathname === PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT
    || pathname === PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT
    || pathname === PROJECT_SERVICE_SOURCE_PRODUCTION_WORK_PLAN_ENDPOINT
    || pathname === PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT
    || PROJECT_SOURCE_OPERATION_ROUTES.has(pathname)) {
    return 'source'
  }
  return undefined
}

function logProjectServiceRequest(scope, fields) {
  if (!scope?.observed || !scope.logger) return
  scope.logger({
    event: 'project_service.request',
    requestId: scope.requestId,
    method: scope.method,
    endpoint: scope.endpoint,
    routeKind: scope.routeKind,
    durationMs: Math.max(0, Date.now() - scope.startedAtMs),
    ...projectServiceMetricsForLog(scope.metrics),
    ...fields,
  })
}

function projectServiceConsoleLogger(event) {
  process.stderr.write(`${JSON.stringify(event)}\n`)
}

function addProjectServiceMetric(scope, key, value) {
  if (!scope) return
  scope.metrics = scope.metrics ?? {}
  if (typeof value === 'number' && Number.isFinite(value)) {
    scope.metrics[key] = Number(scope.metrics[key] ?? 0) + value
    return
  }
  scope.metrics[key] = value
}

function setProjectServiceMetric(scope, key, value) {
  if (!scope) return
  scope.metrics = scope.metrics ?? {}
  scope.metrics[key] = value
}

async function observeProjectServicePhase(scope, metricKey, operation) {
  const startedAtMs = Date.now()
  try {
    return await operation()
  } finally {
    addProjectServiceMetric(scope, metricKey, Date.now() - startedAtMs)
  }
}

function projectServiceMetricsForLog(metrics = {}) {
  return Object.fromEntries(Object.entries(metrics).map(([key, value]) => [
    key,
    typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value * 10) / 10
      : value,
  ]))
}

function writeCORSPreflight(response) {
  response.writeHead(204, {
    ...projectServiceCORSHeaders(),
    'content-length': '0',
  })
  response.end()
}

function projectServiceCORSHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, x-user-id, x-org-id',
    'access-control-allow-private-network': 'true',
    'access-control-max-age': '86400',
    vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
  }
}

async function readProjectSourceContext(request) {
  const body = await readJSONBody(request)
  const projectDir = projectDirFromBody(body)
  return {
    body,
    projectDir,
    requestScope: request.__projectServiceRequestScope,
    fileRepository: createNodeMovScriptWorkspaceFileRepository(projectDir),
    decisionStore: await optionalDecisionStoreFromBody(body, projectDir),
    debugArtifacts: body.debugArtifacts !== false && body.debug_artifacts !== false,
    inspectOptions: {
      ...(stringValue(body.commit) ? { commit: stringValue(body.commit) } : {}),
      ...(stringValue(body.checkpointHash ?? body.checkpoint_hash) ? {
        checkpointHash: stringValue(body.checkpointHash ?? body.checkpoint_hash),
      } : {}),
    },
    sourceOptions: {
      includeContentUnitDecisionDocuments: body.includeContentUnitDecisionDocuments === true
        || body.include_content_unit_decision_documents === true,
    },
    readModelOptions: {
      includeSource: body.includeSource === true || body.include_source === true,
      includeInspection: body.includeInspection === true || body.include_inspection === true,
    },
  }
}

function projectContentCanvasEnvelope(projectDir, result, fallbackSchema) {
  const record = recordValue(result) ?? {}
  return {
    ...record,
    schema: stringValue(record.schema) ?? fallbackSchema,
    projectDir,
  }
}

function projectProductionEditingEnvelope(projectDir, result, fallbackSchema) {
  const record = recordValue(result) ?? {}
  return {
    ...record,
    schema: stringValue(record.schema) ?? fallbackSchema,
    projectDir,
    project_dir: projectDir,
  }
}

function projectSourceOperationEnvelope(projectDir, result, fallbackSchema) {
  return {
    schema: fallbackSchema,
    projectDir,
    result,
  }
}

function createProjectWorkspaceEngine(context) {
  const cacheKey = projectWorkspaceEngineCacheKey(context)
  const cacheHit = projectServiceEngineCacheKeys.includes(cacheKey)
  setProjectServiceMetric(context.requestScope, 'cacheHit', cacheHit)
  setProjectServiceMetric(context.requestScope, 'engineCacheHit', cacheHit)
  rememberProjectWorkspaceEngineCacheKey(cacheKey)
  return projectServiceEngineRegistry.get({
    cacheKey,
    projectDir: context.projectDir,
    ...(context.decisionStore ? { decisionStore: context.decisionStore } : {}),
  })
}

function rememberProjectWorkspaceEngineCacheKey(cacheKey) {
  const existingIndex = projectServiceEngineCacheKeys.indexOf(cacheKey)
  if (existingIndex >= 0) projectServiceEngineCacheKeys.splice(existingIndex, 1)
  projectServiceEngineCacheKeys.push(cacheKey)
  while (projectServiceEngineCacheKeys.length > PROJECT_SERVICE_ENGINE_CACHE_LIMIT) {
    const evicted = projectServiceEngineCacheKeys.shift()
    if (evicted) projectServiceEngineRegistry.invalidate(evicted)
  }
}

function projectWorkspaceEngineCacheKey(context) {
  return [
    context.projectDir,
    decisionStoreCacheKeyFromBody(context.body),
  ].join(PROJECT_SERVICE_ENGINE_CACHE_SEPARATOR)
}

function decisionStoreCacheKeyFromBody(body = {}) {
  const explicit = recordValue(body.decisionStore ?? body.decision_store)
  if (explicit) {
    return stableJSONString({
      kind: explicit.kind,
      baseUrl: explicit.baseUrl ?? explicit.base_url,
      projectUid: explicit.projectUid ?? explicit.project_uid,
      scopeKind: explicit.scopeKind ?? explicit.scope_kind,
      scopeId: explicit.scopeId ?? explicit.scope_id,
      token: explicit.token,
      headers: explicit.headers,
    })
  }
  return stableJSONString({
    projectUid: body.projectUid ?? body.project_uid,
    dataServiceBaseURL: body.dataServiceBaseURL ?? body.dataServiceBaseUrl ?? body.data_service_base_url,
    scopeKind: body.scopeKind ?? body.scope_kind,
    scopeId: body.scopeId ?? body.scope_id,
    movScriptHomeDir: body.movScriptHomeDir ?? body.movscript_home_dir ?? body.workspaceDir ?? body.workspace_dir,
  })
}

function stableJSONString(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSONString).join(',')}]`
  if (!recordValue(value)) return JSON.stringify(value)
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJSONString(value[key])}`).join(',')}}`
}

function projectSourceOperationInput(body) {
  const explicit = recordValue(body.input)
  if (explicit) return explicit
  const {
    projectDir: _projectDir,
    project_dir: _project_dir,
    projectId: _projectId,
    project_id: _project_id,
    projectUid: _projectUid,
    project_uid: _project_uid,
    userId: _userId,
    user_id: _user_id,
    orgId: _orgId,
    org_id: _org_id,
    scopeId: _scopeId,
    scope_id: _scope_id,
    movScriptHomeDir: _movScriptHomeDir,
    movscript_home_dir: _movscript_home_dir,
    workspaceDir: _workspaceDir,
    workspace_dir: _workspace_dir,
    decisionStore: _decisionStore,
    decision_store: _decision_store,
    context: _context,
    command: _command,
    includeSource: _includeSource,
    include_source: _include_source,
    includeInspection: _includeInspection,
    include_inspection: _include_inspection,
    includeContentUnitDecisionDocuments: _includeContentUnitDecisionDocuments,
    include_content_unit_decision_documents: _include_content_unit_decision_documents,
    debugArtifacts: _debugArtifacts,
    debug_artifacts: _debug_artifacts,
    commit: _commit,
    checkpointHash: _checkpointHash,
    checkpoint_hash: _checkpoint_hash,
    expectedWorkspaceVersions: _expectedWorkspaceVersions,
    expected_workspace_versions: _expected_workspace_versions,
    ...input
  } = body
  return input
}

async function executeProjectSourceCommand({ projectDir, command, input, decisionStore, now = new Date() }) {
  const fileRepository = createNodeMovScriptWorkspaceFileRepository(projectDir)
  const engine = createNodeMovScriptEngine({ projectDir, ...(decisionStore ? { decisionStore } : {}) })
  switch (command) {
    case 'queryEntities':
      return engine.workspaceService.queryEntities(input.query)
    case 'querySettings':
      return engine.workspaceService.querySettings(input.query)
    case 'queryAssets':
      return engine.workspaceService.queryAssets(input.query)
    case 'readScriptSource':
      return engine.workspaceService.readScriptSource(input)
    case 'readContentUnitGenerationPrompt':
      return engine.workspaceService.readContentUnitGenerationPrompt(requiredContentUnitId(input))
    case 'buildContentUnitBackendPrompt':
      return engine.buildContentUnitBackendPrompt(requiredContentUnitId(input))
    case 'loadContentWorkspaceSnapshot':
      return loadContentSourceWorkspaceSnapshotFromEngine(engine)
    case 'loadContentWorkspace':
      return buildContentSourceWorkspaceData(await loadContentSourceWorkspaceSnapshotFromEngine(engine))
    case 'listContentCanvases':
      return listProjectContentCanvases(fileRepository)
    case 'writeContentCanvas':
      return writeProjectContentCanvas(fileRepository, input)
    case 'renameContentCanvas':
      return renameProjectContentCanvas(fileRepository, input)
    case 'runContentCanvas':
      return runProjectContentCanvas({ projectDir, fileRepository, engine, input, now })
    case 'deleteContentCanvas':
      return deleteProjectContentCanvas(fileRepository, input)
    case 'upsertProjectStandards':
      return engine.workspaceService.upsertProjectStandards(input)
    case 'upsertSetting':
      return engine.workspaceService.upsertSetting(input)
    case 'upsertAsset':
      return engine.workspaceService.upsertAsset(input)
    case 'createSetting':
      return engine.createSetting(input)
    case 'createSettingState':
      return engine.createSettingState(input)
    case 'createAsset':
      return engine.createAsset(input)
    case 'upsertScript':
      return engine.workspaceService.upsertScript(input)
    case 'snapshotScriptVersionFromMarkdown':
      return engine.workspaceService.snapshotScriptVersionFromMarkdown(input)
    case 'saveProductionSnapshot':
      return engine.workspaceService.saveProductionSnapshot(input)
    case 'upsertContentUnit':
      rejectRemovedNamespacePlaybackContentUnitInput(input)
      return engine.workspaceService.upsertContentUnit(input)
    case 'selectCandidate':
      return engine.workspaceService.selectCandidate(input)
    case 'appendCandidate':
      return engine.workspaceService.appendCandidate(input)
    case 'createAssetSlotCandidate':
      return engine.workspaceService.createAssetSlotCandidate(input)
    case 'createKeyframeCandidate':
      return engine.workspaceService.createKeyframeCandidate(input)
    case 'createContentUnit':
      rejectRemovedNamespacePlaybackContentUnitInput(input)
      return engine.createContentUnit(input)
    case 'ensureContentUnitForEntity':
      rejectRemovedNamespacePlaybackContentUnitInput(input)
      return engine.ensureContentUnitForEntity(input)
    case 'createProduction':
      return engine.createProduction(input)
    case 'createSegment':
      return engine.createSegment(input)
    case 'createSceneMoment':
      return engine.createSceneMoment(input)
    case 'createStoryboard':
      return engine.createStoryboard(input)
    case 'createKeyframe':
      return engine.createKeyframe(input)
    case 'createAudioCue':
      return engine.createAudioCue(input)
    case 'createExpressionUnit':
      return engine.createExpressionUnit(input)
    case 'updateContentUnitEditPrompt':
      return engine.workspaceService.updateContentUnitEditPrompt(input)
    case 'updateExpressionUnit':
      return engine.workspaceService.updateExpressionUnitSource(input)
    case 'updateAudioCue':
      return engine.workspaceService.updateAudioCueSource(input)
    case 'updateEntityBasics':
      return engine.updateEntityBasics(input)
    case 'connectSceneMomentSetting':
      return engine.connectSceneMomentSetting(input)
    case 'updateEntityTransition':
      return engine.workspaceService.updateEntityTransition(input)
    case 'updateStoryboardTimeline':
      return engine.workspaceService.updateStoryboardTimeline(input)
    case 'writeHierarchyNode':
      return engine.writeHierarchyNode(input)
    case 'writeNamespaceNode':
      return engine.writeHierarchyNode(namespaceHierarchyNodeInput(input))
    case 'syncContentWorkspace':
      return engine.interpret()
    case 'deleteEntity':
      await engine.workspaceService.deleteEntity(input)
      return { status: 'deleted' }
    default:
      throw httpError(400, 'project_source_command_unsupported', `unsupported project source command: ${command}`)
  }
}

function requiredContentUnitId(input) {
  const contentUnitId = input.contentUnitId ?? input.content_unit_id
  if (typeof contentUnitId === 'string' && contentUnitId.trim()) return contentUnitId.trim()
  if (typeof contentUnitId === 'number' && Number.isFinite(contentUnitId)) return contentUnitId
  throw httpError(400, 'project_content_unit_required', 'contentUnitId is required')
}

async function listProjectContentCanvases(fileRepository) {
  const root = await fileRepository.list({ path: CONTENT_CANVAS_DIRECTORY })
  const canvases = []
  for (const entry of root.entries) {
    if (entry.kind !== 'directory') continue
    const path = `${entry.path}/${CONTENT_CANVAS_FILE_NAME}`
    const file = await fileRepository.read({ path }).catch((error) => {
      if (isNotFoundError(error)) return undefined
      throw error
    })
    if (!file) continue
    const record = parseProjectContentCanvasFile(file.content, path)
    canvases.push({
      canvasKind: 'content',
      canvas_kind: 'content',
      owner: 'project-service',
      path: file.path,
      version: file.version,
      updatedAt: file.updatedAt,
      record,
    })
  }
  canvases.sort((left, right) => {
    const updated = String(right.record.updated_at ?? '').localeCompare(String(left.record.updated_at ?? ''))
    return updated || String(left.record.title ?? left.record.id).localeCompare(String(right.record.title ?? right.record.id))
  })
  return {
    schema: CONTENT_CANVASES_SCHEMA,
    canvases,
  }
}

async function writeProjectContentCanvas(fileRepository, input) {
  const record = projectContentCanvasRecordFromInput(input)
  const titleValidationError = validateProjectContentCanvasTitle(record.title)
  if (titleValidationError) throw titleValidationError
  const path = contentCanvasProjectFilePath(record.id)
  const source = recordValue(input) ?? {}
  const expectedVersion = stringValue(source.expectedVersion ?? source.expected_version)
  const written = await fileRepository.write({
    path,
    content: `${JSON.stringify(record, null, 2)}\n`,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  })
  return {
    status: 'written',
    canvasKind: 'content',
    canvas_kind: 'content',
    path: written.path,
    version: written.version,
    title: record.title,
    normalizedTitle: record.title,
    record,
    diagnostics: [],
  }
}

async function patchProjectAssetProviderCertification(fileRepository, input) {
  const source = recordValue(input) ?? {}
  const path = normalizeProjectAssetSourcePath(source.assetPath ?? source.asset_path ?? source.path)
  const provider = stringValue(source.provider ?? source.provider_id ?? source.providerId)
  if (!provider) throw httpError(400, 'project_asset_provider_required', 'provider is required')
  const certification = recordValue(source.certification)
  if (!certification) throw httpError(400, 'project_asset_certification_required', 'certification is required')
  const file = await fileRepository.read({ path }).catch((error) => {
    if (isNotFoundError(error)) return undefined
    throw error
  })
  const current = file ? parseJSONObjectFile(file.content, path) : recordValue(source.fallbackRecord ?? source.fallback_record)
  if (!current) throw httpError(404, 'project_asset_source_not_found', `asset source not found: ${path}`)
  const providerCertifications = recordValue(current.provider_certifications)
    ? { ...current.provider_certifications }
    : {}
  const storageKey = stringValue(source.storageKey ?? source.storage_key) ?? providerCertificationStorageKey(provider, certification)
  providerCertifications[storageKey] = certification
  const next = {
    ...current,
    provider_certifications: providerCertifications,
  }
  const expectedVersion = stringValue(source.expectedVersion ?? source.expected_version)
  const written = await fileRepository.write({
    path,
    content: `${JSON.stringify(next, null, 2)}\n`,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  })
  return {
    status: 'patched',
    path: written.path,
    version: written.version,
    provider,
    provider_id: provider,
    storage_key: storageKey,
    certification,
    record: next,
  }
}

async function renameProjectContentCanvas(fileRepository, input) {
  const source = recordValue(input) ?? {}
  const id = stringValue(source.id ?? source.canvasId ?? source.canvas_id)
  if (!id) throw httpError(400, 'project_content_canvas_id_required', 'canvas id is required')
  const title = normalizeProjectContentCanvasTitle(source.title ?? source.name)
  const titleValidationError = validateProjectContentCanvasTitle(title)
  if (titleValidationError) throw titleValidationError
  const path = contentCanvasProjectFilePath(id)
  const file = await fileRepository.read({ path }).catch((error) => {
    if (isNotFoundError(error)) return undefined
    throw error
  })
  if (!file) throw httpError(404, 'project_content_canvas_not_found', `content canvas not found: ${id}`)
  const current = parseProjectContentCanvasFile(file.content, path)
  const now = new Date().toISOString()
  const record = {
    ...current,
    title,
    name: title,
    updated_at: now,
  }
  const expectedVersion = stringValue(source.expectedVersion ?? source.expected_version)
  const written = await fileRepository.write({
    path,
    content: `${JSON.stringify(record, null, 2)}\n`,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  })
  return {
    status: 'renamed',
    canvasKind: 'content',
    canvas_kind: 'content',
    path: written.path,
    version: written.version,
    title,
    normalizedTitle: title,
    record,
    diagnostics: [],
  }
}

async function runProjectContentCanvas({ projectDir, fileRepository, engine, input, now }) {
  const source = recordValue(input) ?? {}
  const canvasId = stringValue(source.id ?? source.canvasId ?? source.canvas_id)
  if (!canvasId) throw httpError(400, 'project_content_canvas_id_required', 'canvas id is required')
  const canvas = await readProjectContentCanvas(fileRepository, canvasId)
  const interpretation = await engine.interpret()
  const contentSnapshot = await loadContentSourceWorkspaceSnapshotFromEngine(engine)
  const contentData = buildContentSourceWorkspaceData(contentSnapshot)
  const contentUnitSummaries = contentSourceWorkspaceContentUnitStatusSummaries(contentSnapshot)
  const affectedContentUnitIds = contentCanvasRunAffectedContentUnitIds(canvas.record, contentSnapshot)
  const candidateImpact = contentCanvasRunCandidateImpact({
    affectedContentUnitIds,
    contentUnitSummaries,
    contentData,
  })
  const projectTimelineStatus = buildContentSourceWorkspaceProjectTimelineStatus(contentSnapshot, contentUnitSummaries)
  const operationId = `content-canvas-run:${contentCanvasProjectPathSegment(canvas.record.id)}:${now.getTime()}`
  return {
    schema: 'movscript.content_canvas_run.v1',
    status: 'completed',
    operationId,
    operation_id: operationId,
    canvasId: canvas.record.id,
    canvas_id: canvas.record.id,
    canvas: {
      canvasKind: 'content',
      canvas_kind: 'content',
      owner: 'project-service',
      path: canvas.path,
      version: canvas.version,
      record: canvas.record,
    },
    trace: {
      projectDir,
      command: 'runContentCanvas',
      interpretationId: interpretation?.manifest?.interpretationId,
      interpretation_id: interpretation?.manifest?.interpretationId,
      editorStatePath: interpretation?.manifest?.output?.editorStatePath,
      completedAt: now.toISOString(),
      completed_at: now.toISOString(),
    },
    readModel: {
      schema: 'movscript.content_canvas_run_read_model_summary.v1',
      status: projectTimelineStatus.status,
      timelineNamespaceCount: projectTimelineStatus.timeline_namespace_count,
      timeline_namespace_count: projectTimelineStatus.timeline_namespace_count,
      systemPrimitives: projectTimelineStatus.system_primitives,
      system_primitives: projectTimelineStatus.system_primitives,
    },
    candidateImpact,
    candidate_impact: candidateImpact,
  }
}

async function deleteProjectContentCanvas(fileRepository, input) {
  const id = stringValue(input.id ?? input.canvasId ?? input.canvas_id)
  if (!id) throw httpError(400, 'project_content_canvas_id_required', 'canvas id is required')
  const path = contentCanvasProjectFilePath(id)
  await fileRepository.delete({ path })
  return {
    status: 'deleted',
    canvasKind: 'content',
    canvas_kind: 'content',
    path,
  }
}

async function readProjectContentCanvas(fileRepository, id) {
  const path = contentCanvasProjectFilePath(id)
  const file = await fileRepository.read({ path }).catch((error) => {
    if (isNotFoundError(error)) return undefined
    throw error
  })
  if (!file) throw httpError(404, 'project_content_canvas_not_found', `content canvas not found: ${id}`)
  return {
    canvasKind: 'content',
    canvas_kind: 'content',
    owner: 'project-service',
    path: file.path,
    version: file.version,
    updatedAt: file.updatedAt,
    record: parseProjectContentCanvasFile(file.content, path),
  }
}

async function exportBackendProjectWorkspace({ projectDir, fileRepository, input }) {
  const resolved = await backendProjectWorkspaceForExport({ projectDir, fileRepository, input })
  const backendProject = resolved.backendProject
  const backend = stringValue(backendProject.backend) ?? stringValue(input.backend) ?? stringValue(resolved.materialized?.backend) ?? 'unknown'
  const projectId = stringValue(backendProject.project_id ?? backendProject.projectId)
    ?? projectEditingPathSegment(stringValue(backendProject.title) ?? backend)
  const targetRef = backendProjectTargetRefFromInput(input)
    ?? stringValue(recordValue(backendProject.source)?.target_ref ?? recordValue(backendProject.source)?.targetRef)
  const exportDirectory = backendProjectWorkspaceExportDirectory(projectDir, input, backendProject, targetRef)
  const overwrite = input.overwrite === true
  const files = backendProjectWorkspaceExportFiles({
    backendProject,
    materialized: resolved.materialized,
  })
  const writtenFiles = []
  for (const file of files) {
    const relativePath = safeBackendProjectFilePath(file.path)
    const absolutePath = resolve(exportDirectory, ...relativePath.split('/'))
    assertPathInsideDirectory(exportDirectory, absolutePath)
    if (!overwrite && await pathExists(absolutePath)) {
      throw httpError(409, 'project_backend_project_export_file_exists', `backend project export file already exists: ${relativePath}`)
    }
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, file.content, 'utf8')
    writtenFiles.push({
      path: relativePath,
      absolute_path: absolutePath,
      role: file.role,
      ...(file.language ? { language: file.language } : {}),
      bytes: Buffer.byteLength(file.content, 'utf8'),
    })
  }
  return {
    schema: 'movscript.production_editing.backend_project_export_result.v1',
    status: 'exported',
    backend,
    project_id: projectId,
    title: stringValue(backendProject.title),
    export_directory: exportDirectory,
    file_count: writtenFiles.length,
    files: writtenFiles,
    entrypoint: stringValue(backendProject.entrypoint),
    entrypoint_path: backendProject.entrypoint
      ? resolve(exportDirectory, ...safeBackendProjectFilePath(backendProject.entrypoint).split('/'))
      : undefined,
    source: targetRef ? { target_ref: targetRef } : undefined,
    materialized: Boolean(resolved.materialized),
    persisted: Boolean(resolved.materialized?.persisted),
    rendered: false,
    candidate_created: false,
    service_owner: 'project-service',
  }
}

async function refreshProjectProductionEditingResources({ projectDir, body = {}, input = {}, decisionStore, requestScope, now }) {
  const productionId = productionEditingProductionId(input)
  const engine = createProjectWorkspaceEngine({ projectDir, decisionStore, body, requestScope })
  const index = await observeProjectServicePhase(requestScope, 'indexLoadMs', () => engine.workspaceService.loadIndex())
  const productionContext = queryMovScriptWorkspaceProductionContext(index, {
    productionId,
    include: ['productions', 'storyboards', 'keyframes', 'content_units'],
    limit: 5000,
  })
  const production = (productionContext.productions ?? []).find((entity) => sameLooseId(entity.id ?? entity.record?.id ?? entity.record?.ID, productionId))
  const contentUnits = (productionContext.content_units ?? [])
    .filter((entity) => productionEditingContentUnitKind(entity) !== undefined)
    .filter((entity) => productionEditingContentUnitMatchesProduction(entity, productionId, productionContext))
  const contentUnitIds = contentUnits
    .map((entity) => productionEditingContentUnitId(entity))
    .filter(Boolean)
  const decisionContexts = decisionStore && contentUnitIds.length > 0
    ? await readCandidateContexts(decisionStore, contentUnitIds, requestScope)
    : []
  const decisionContextByContentUnitId = projectDecisionContextsByContentUnitId(decisionContexts)
  const items = contentUnits.map((entity) => {
    const id = productionEditingContentUnitId(entity)
    return productionEditingResourceItem({
      entity,
      productionId,
      decisionContext: id ? decisionContextByContentUnitId.get(id) : undefined,
    })
  })
  const refreshedAt = now.toISOString()
  const resources = {
    schema: 'movscript.production_editing_resources.v1',
    projectDir,
    project_dir: projectDir,
    productionId,
    production_id: productionId,
    refreshedAt,
    refreshed_at: refreshedAt,
    sourceHash: productionEditingResourceSourceHash(items),
    source_hash: productionEditingResourceSourceHash(items),
    production: production ? projectHomeRecord(production) : undefined,
    items,
    counts: {
      items: items.length,
      asset: items.filter((item) => item.kind === 'asset').length,
      keyframe: items.filter((item) => item.kind === 'keyframe').length,
      storyboard: items.filter((item) => item.kind === 'storyboard').length,
      selected: items.filter((item) => item.selectedResourceId !== undefined || item.selected_resource_id !== undefined).length,
    },
  }
  await writeProjectJSONFile(productionEditingResourcesPath(projectDir, productionId), resources)
  return {
    schema: 'movscript.production_editing_resources_refresh.v1',
    status: 'ok',
    productionId,
    production_id: productionId,
    resources,
  }
}

async function listProjectProductionEditingWorkspaces({ projectDir, input = {} }) {
  const productionId = productionEditingProductionId(input)
  const page = Math.max(1, Math.floor(numberValue(input.page) ?? 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(numberValue(input.pageSize ?? input.page_size) ?? 20)))
  const query = stringValue(input.query)?.toLowerCase()
  const kind = productionEditingOptionalWorkspaceKind(input.kind ?? input.workspaceKind ?? input.workspace_kind)
  const workspaces = await readProjectProductionEditingWorkspaces(projectDir, productionId)
  const filtered = workspaces.filter((workspace) => {
    if (kind && workspace.kind !== kind) return false
    if (!query) return true
    return [
      workspace.workspaceId,
      workspace.workspace_id,
      workspace.title,
      workspace.kind,
      workspace.editingProjectId,
      workspace.editing_project_id,
    ].some((value) => String(value ?? '').toLowerCase().includes(query))
  })
  const start = (page - 1) * pageSize
  const paged = filtered.slice(start, start + pageSize)
  return {
    schema: 'movscript.production_editing_workspaces_list.v1',
    status: 'ok',
    productionId,
    production_id: productionId,
    workspaces: paged,
    pagination: {
      page,
      pageSize,
      page_size: pageSize,
      total: filtered.length,
      total_unfiltered: workspaces.length,
      hasNextPage: start + pageSize < filtered.length,
      has_next_page: start + pageSize < filtered.length,
    },
  }
}

async function createProjectProductionEditingWorkspace({ projectDir, fileRepository, body = {}, input = {}, decisionStore, requestScope, now }) {
  const productionId = productionEditingProductionId(input)
  const kind = productionEditingWorkspaceKind(input.kind ?? input.workspaceKind ?? input.workspace_kind)
  const workspaceId = productionEditingWorkspaceId(input, kind, now)
  const workspaceDirectory = productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId)
  const workspacePath = productionEditingWorkspacePath(projectDir, productionId, workspaceId)
  const exists = await pathExists(workspacePath)
  if (exists && input.overwrite !== true) {
    throw httpError(409, 'project_production_editing_workspace_exists', `production editing workspace already exists: ${workspaceId}`)
  }
  const resourceRefresh = await refreshProjectProductionEditingResources({
    projectDir,
    body,
    input: { ...input, productionId },
    decisionStore,
    requestScope,
    now,
  })
  const resources = resourceRefresh.resources
  const title = stringValue(input.title ?? input.name)
    ?? `${kind === 'remotion' ? 'Remotion' : '系统剪辑'} ${productionId}`
  const createdAt = now.toISOString()
  const baseWorkspace = {
    schema: 'movscript.production_editing_workspace.v1',
    version: 1,
    workspaceId,
    workspace_id: workspaceId,
    kind,
    productionId,
    production_id: productionId,
    title,
    status: 'ready',
    createdAt,
    created_at: createdAt,
    updatedAt: createdAt,
    updated_at: createdAt,
    rootPath: workspaceDirectory,
    root_path: workspaceDirectory,
    seedSourceHash: resources.sourceHash,
    seed_source_hash: resources.sourceHash,
    lastSeenResourceSourceHash: resources.sourceHash,
    last_seen_resource_source_hash: resources.sourceHash,
    resourceSourceHash: resources.sourceHash,
    resource_source_hash: resources.sourceHash,
    stale: false,
    staleHints: [],
    stale_hints: [],
    resourceSnapshotPath: productionEditingWorkspaceResourceSnapshotPath(projectDir, productionId, workspaceId),
    resource_snapshot_path: productionEditingWorkspaceResourceSnapshotPath(projectDir, productionId, workspaceId),
    autoImportRenderResult: true,
    auto_import_render_result: true,
    candidateDecisionRequired: true,
    candidate_decision_required: true,
  }
  await writeProjectJSONFile(productionEditingWorkspaceResourceSnapshotPath(projectDir, productionId, workspaceId), resources)
  let workspace
  let mediaEditingProject
  let exportResult
  if (kind === 'system_editing') {
    const editingProjectId = stringValue(input.editingProjectId ?? input.editing_project_id) ?? workspaceId
    mediaEditingProject = createProductionBoundMediaEditingProject({
      input,
      projectId: productionEditingProjectId(input, body),
      productionId,
      productionPath: stringValue(resources.production?.__workspace_path ?? resources.production?.path),
      workspaceId,
      workspaceDirectory,
      editingProjectId,
      title,
      resources,
      now,
    })
    const mediaEditingProjectPath = productionEditingWorkspaceMediaProjectPath(projectDir, productionId, workspaceId)
    await writeProjectJSONFile(mediaEditingProjectPath, {
      schema: 'movscript.media_editing_project.v1',
      editingProject: mediaEditingProject,
      editing_project: mediaEditingProject,
    })
    workspace = pruneUndefinedRecord({
      ...baseWorkspace,
      editingProjectId,
      editing_project_id: editingProjectId,
      mediaEditingProjectProjectId: mediaEditingProject.projectId,
      media_editing_project_project_id: mediaEditingProject.projectId,
      mediaEditingProjectPath,
      media_editing_project_path: mediaEditingProjectPath,
    })
  } else {
    const projectDirectory = productionEditingRemotionProjectDirectory(projectDir, productionId, workspaceId)
    await mkdir(projectDirectory, { recursive: true })
    if (productionEditingShouldMaterializeRemotion(input)) {
      exportResult = await exportBackendProjectWorkspace({
        projectDir,
        fileRepository,
        input: {
          ...input,
          backend: 'remotion',
          exportDirectory: projectDirectory,
          export_directory: projectDirectory,
          overwrite: input.overwrite === true,
        },
      })
    } else {
      exportResult = await writeProductionEditingRemotionStarterProject({
        projectDirectory,
        input,
        productionId,
        workspaceId,
        title,
        resources,
      })
    }
    const compositionId = stringValue(input.compositionId ?? input.composition_id) ?? 'MovScriptRoughCut'
    const defaultRenderCommand = `npx remotion render src/Root.tsx ${compositionId} out/rough-cut.mp4`
    workspace = pruneUndefinedRecord({
      ...baseWorkspace,
      backend: 'remotion',
      projectDirectory,
      project_directory: projectDirectory,
      entrypoint: stringValue(exportResult?.entrypoint ?? input.entrypoint) ?? 'src/Root.tsx',
      compositionId,
      composition_id: compositionId,
      previewCommand: input.previewCommand ?? input.preview_command ?? 'npx remotion studio',
      preview_command: input.previewCommand ?? input.preview_command ?? 'npx remotion studio',
      renderCommand: input.renderCommand ?? input.render_command ?? defaultRenderCommand,
      render_command: input.renderCommand ?? input.render_command ?? defaultRenderCommand,
      ...(exportResult ? { exportResult, export_result: exportResult } : {}),
    })
  }
  workspace = withProductionEditingWorkspaceStaleState(workspace, resources.sourceHash)
  await writeProjectJSONFile(workspacePath, workspace)
  const handoffEnvelope = await productionEditingWorkspaceHandoffEnvelope(workspace, { projectDir, mediaEditingProject })
  return {
    schema: 'movscript.production_editing_workspace_create.v1',
    status: 'created',
    productionId,
    production_id: productionId,
    workspace,
    stale: workspace.stale === true,
    staleHints: workspace.staleHints,
    stale_hints: workspace.stale_hints,
    ...handoffEnvelope,
    ...(mediaEditingProject ? { mediaEditingProject, media_editing_project: mediaEditingProject } : {}),
    resources,
  }
}

async function openProjectProductionEditingWorkspace({ projectDir, body = {}, input = {}, decisionStore, requestScope, now }) {
  const productionId = productionEditingProductionId(input)
  const workspaceId = requiredProductionEditingWorkspaceId(input)
  const workspacePath = productionEditingWorkspacePath(projectDir, productionId, workspaceId)
  const workspace = await readJSONFile(workspacePath)
  if (!workspace) {
    return {
      schema: 'movscript.production_editing_workspace_open.v1',
      status: 'not_found',
      productionId,
      production_id: productionId,
      workspaceId,
      workspace_id: workspaceId,
    }
  }
  const mediaEditingProject = await readProjectProductionEditingWorkspaceMediaProject(projectDir, productionId, workspaceId)
  const resourceRefresh = await refreshProjectProductionEditingResources({
    projectDir,
    body,
    input: { ...input, productionId },
    decisionStore,
    requestScope,
    now,
  })
  const resources = resourceRefresh.resources
  const openedAt = now.toISOString()
  const staleWorkspace = withProductionEditingWorkspaceStaleState(workspace, resources.sourceHash)
  const updatedWorkspace = pruneUndefinedRecord({
    ...staleWorkspace,
    lastOpenedAt: openedAt,
    last_opened_at: openedAt,
    updatedAt: openedAt,
    updated_at: openedAt,
    ...(mediaEditingProject?.projectId ? {
      mediaEditingProjectProjectId: mediaEditingProject.projectId,
      media_editing_project_project_id: mediaEditingProject.projectId,
    } : {}),
  })
  await writeProjectJSONFile(workspacePath, updatedWorkspace)
  await writeProjectJSONFile(productionEditingWorkspaceResourceSnapshotPath(projectDir, productionId, workspaceId), resources)
  const handoffEnvelope = await productionEditingWorkspaceHandoffEnvelope(updatedWorkspace, { projectDir, mediaEditingProject })
  return {
    schema: 'movscript.production_editing_workspace_open.v1',
    status: 'ready',
    productionId,
    production_id: productionId,
    workspace: updatedWorkspace,
    stale: updatedWorkspace.stale === true,
    staleHints: updatedWorkspace.staleHints,
    stale_hints: updatedWorkspace.stale_hints,
    ...handoffEnvelope,
    ...(mediaEditingProject ? { mediaEditingProject, media_editing_project: mediaEditingProject } : {}),
    resources,
    open_action: productionEditingWorkspaceOpenAction(updatedWorkspace, mediaEditingProject),
  }
}

async function deleteProjectProductionEditingWorkspace({ projectDir, input = {} }) {
  const productionId = productionEditingProductionId(input)
  const workspaceId = requiredProductionEditingWorkspaceId(input)
  const workspaceDirectory = productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId)
  const existed = await pathExists(workspaceDirectory)
  if (existed) await rm(workspaceDirectory, { recursive: true, force: true })
  return {
    schema: 'movscript.production_editing_workspace_delete.v1',
    status: existed ? 'deleted' : 'not_found',
    productionId,
    production_id: productionId,
    workspaceId,
    workspace_id: workspaceId,
    workspaceDirectory,
    workspace_directory: workspaceDirectory,
  }
}

async function backendProjectWorkspaceForExport({ input }) {
  const inlineProject = recordValue(input.backendProject ?? input.backend_project)
  if (inlineProject) return { backendProject: inlineProject }

  const compileResult = recordValue(input.compileResult ?? input.compile_result)
  const resultProject = recordValue(compileResult?.backend_project)
  if (resultProject) {
    return { backendProject: resultProject }
  }

  throw httpError(400, 'project_backend_project_required', 'backendProject or compileResult.backend_project is required to materialize a backend editing workspace')
}

function backendProjectWorkspaceExportDirectory(projectDir, input, backendProject, targetRef) {
  const explicit = pathStringValue(input.exportDirectory ?? input.export_directory ?? input.outputDir ?? input.output_dir)
  if (explicit) return explicit
  const backend = stringValue(backendProject.backend) ?? stringValue(input.backend) ?? 'backend'
  const projectId = stringValue(backendProject.project_id ?? backendProject.projectId)
    ?? projectEditingPathSegment(stringValue(backendProject.title) ?? backend)
  const targetSegment = projectEditingPathSegment(targetRef ?? stringValue(recordValue(backendProject.source)?.target_ref) ?? projectId)
  return resolve(projectDir, 'backend_projects', targetSegment, projectEditingPathSegment(backend), projectEditingPathSegment(projectId))
}

function backendProjectTargetRefFromInput(input) {
  const record = recordValue(input)
  if (!record) return undefined
  const source = recordValue(record.source)
  return stringValue(
    record.targetRef
    ?? record.target_ref
    ?? source?.targetRef
    ?? source?.target_ref,
  )
}

function productionEditingProductionId(input) {
  const productionId = idValue(input.productionId ?? input.production_id ?? input.scopeRef ?? input.scope_ref)
  if (productionId !== undefined) return String(productionId)
  throw httpError(400, 'project_production_editing_production_required', 'productionId is required')
}

function productionEditingProjectId(input, body = {}) {
  return stringValue(
    input.mediaProjectId
    ?? input.media_project_id
    ?? body.mediaProjectId
    ?? body.media_project_id
    ?? input.projectId
    ?? input.project_id
    ?? body.projectId
    ?? body.project_id,
  )
    ?? 'movscript_project'
}

function productionEditingWorkspaceKind(value) {
  const kind = productionEditingOptionalWorkspaceKind(value)
  if (kind) return kind
  throw httpError(400, 'project_production_editing_workspace_kind_required', 'workspace kind is required')
}

function productionEditingOptionalWorkspaceKind(value) {
  const raw = stringValue(value)
  if (!raw) return undefined
  if (raw === 'system_editing' || raw === 'remotion') return raw
  throw httpError(400, 'project_production_editing_workspace_kind_invalid', `unsupported production editing workspace kind: ${raw}`)
}

function productionEditingWorkspaceId(input, kind, now) {
  return stringValue(input.workspaceId ?? input.workspace_id)
    ?? `${kind}_${projectEditingPathSegment(productionEditingProductionId(input))}_${now.getTime().toString(36)}`
}

function requiredProductionEditingWorkspaceId(input) {
  const workspaceId = stringValue(input.workspaceId ?? input.workspace_id)
  if (workspaceId) return workspaceId
  throw httpError(400, 'project_production_editing_workspace_id_required', 'workspaceId is required')
}

function productionEditingWorkspaceRoot(projectDir, productionId) {
  return resolve(projectDir, 'editing_projects', 'productions', projectEditingPathSegment(productionId))
}

function productionEditingResourcesPath(projectDir, productionId) {
  return resolve(productionEditingWorkspaceRoot(projectDir, productionId), 'resources.json')
}

function productionEditingWorkspacesDirectory(projectDir, productionId) {
  return resolve(productionEditingWorkspaceRoot(projectDir, productionId), 'workspaces')
}

function productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId) {
  return resolve(productionEditingWorkspacesDirectory(projectDir, productionId), projectEditingPathSegment(workspaceId))
}

function productionEditingWorkspacePath(projectDir, productionId, workspaceId) {
  return resolve(productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId), 'workspace.json')
}

function productionEditingWorkspaceResourceSnapshotPath(projectDir, productionId, workspaceId) {
  return resolve(productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId), 'resources.snapshot.json')
}

function productionEditingWorkspaceMediaProjectPath(projectDir, productionId, workspaceId) {
  return resolve(productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId), 'media-editing-project.json')
}

function productionEditingRemotionProjectDirectory(projectDir, productionId, workspaceId) {
  return resolve(productionEditingWorkspaceDirectory(projectDir, productionId, workspaceId), 'remotion')
}

function withProductionEditingWorkspaceStaleState(workspace, currentResourceSourceHash) {
  const seedSourceHash = productionEditingWorkspaceSeedSourceHash(workspace)
  const lastSeenResourceSourceHash = stringValue(currentResourceSourceHash)
    ?? stringValue(workspace.lastSeenResourceSourceHash ?? workspace.last_seen_resource_source_hash)
    ?? seedSourceHash
  const stale = Boolean(seedSourceHash && lastSeenResourceSourceHash && seedSourceHash !== lastSeenResourceSourceHash)
  const staleHints = stale
    ? [{
        code: 'production_resources_changed',
        message: 'Production resources changed since this workspace was seeded. Create a new workspace version or import changes in the handoff skill.',
        seedSourceHash,
        seed_source_hash: seedSourceHash,
        lastSeenResourceSourceHash,
        last_seen_resource_source_hash: lastSeenResourceSourceHash,
      }]
    : []
  return pruneUndefinedRecord({
    ...workspace,
    seedSourceHash,
    seed_source_hash: seedSourceHash,
    lastSeenResourceSourceHash,
    last_seen_resource_source_hash: lastSeenResourceSourceHash,
    resourceSourceHash: seedSourceHash,
    resource_source_hash: seedSourceHash,
    stale,
    staleHints,
    stale_hints: staleHints,
  })
}

function productionEditingWorkspaceSeedSourceHash(workspace) {
  return stringValue(
    workspace.seedSourceHash
    ?? workspace.seed_source_hash
    ?? workspace.resourceSourceHash
    ?? workspace.resource_source_hash,
  )
}

async function readProjectProductionEditingWorkspaces(projectDir, productionId) {
  const directory = productionEditingWorkspacesDirectory(projectDir, productionId)
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (isNotFoundError(error)) return []
    throw error
  })
  const workspaces = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const workspace = await readJSONFile(resolve(directory, entry.name, 'workspace.json'))
    if (workspace) workspaces.push(withProductionEditingWorkspaceStaleState(workspace))
  }
  return workspaces.sort((left, right) => {
    const leftTime = Date.parse(stringValue(left.updatedAt ?? left.updated_at) ?? '')
    const rightTime = Date.parse(stringValue(right.updatedAt ?? right.updated_at) ?? '')
    const leftSort = Number.isFinite(leftTime) ? leftTime : 0
    const rightSort = Number.isFinite(rightTime) ? rightTime : 0
    return rightSort - leftSort || String(left.workspaceId ?? left.workspace_id ?? '').localeCompare(String(right.workspaceId ?? right.workspace_id ?? ''))
  })
}

async function readProjectProductionEditingWorkspaceMediaProject(projectDir, productionId, workspaceId) {
  const envelope = await readJSONFile(productionEditingWorkspaceMediaProjectPath(projectDir, productionId, workspaceId))
  const project = recordValue(envelope?.editingProject ?? envelope?.editing_project)
  return project ?? undefined
}

function createProductionBoundMediaEditingProject({
  input,
  projectId,
  productionId,
  productionPath,
  workspaceId,
  workspaceDirectory,
  editingProjectId,
  title,
  resources,
  now,
}) {
  const project = createMediaEditingProjectFromProductionTimelineClips({
    productionId,
    productionPath,
    scopeKind: 'production',
    scopeRef: productionId,
    id: editingProjectId,
    projectId,
    title,
    clips: [],
    now: now.toISOString(),
    fps: numberValue(input.fps),
    width: numberValue(input.width),
    height: numberValue(input.height),
  })
  return {
    ...project,
    workspace: {
      workspaceId,
      rootPath: workspaceDirectory,
      productionId,
      autoImportRenderResult: true,
      candidateDecisionRequired: true,
    },
    provenance: {
      ...(recordValue(project.provenance) ?? {}),
      sourceHash: resources.sourceHash,
      targetKind: 'production',
      targetRef: productionId,
      scopeKind: 'production',
      scopeRef: productionId,
      productionPath,
    },
  }
}

function productionEditingShouldMaterializeRemotion(input) {
  return Boolean(
    recordValue(input.backendProject ?? input.backend_project)
    || recordValue(input.compileResult ?? input.compile_result),
  )
}

async function writeProductionEditingRemotionStarterProject({
  projectDirectory,
  input,
  productionId,
  workspaceId,
  title,
  resources,
}) {
  const compositionId = stringValue(input.compositionId ?? input.composition_id) ?? 'MovScriptRoughCut'
  const width = Math.floor(numberValue(input.width) ?? 1920)
  const height = Math.floor(numberValue(input.height) ?? 1080)
  const fps = Math.floor(numberValue(input.fps) ?? 30)
  const durationInFrames = Math.max(150, Math.min(3600, (resources.items?.length ?? 0) * 90 || 150))
  const seed = {
    schema: 'movscript.production_editing.remotion_seed.v1',
    productionId,
    production_id: productionId,
    workspaceId,
    workspace_id: workspaceId,
    title,
    compositionId,
    composition_id: compositionId,
    width,
    height,
    fps,
    durationInFrames,
    duration_in_frames: durationInFrames,
    resources: {
      schema: resources.schema,
      refreshedAt: resources.refreshedAt,
      refreshed_at: resources.refreshed_at,
      sourceHash: resources.sourceHash,
      source_hash: resources.source_hash,
      counts: resources.counts,
      items: Array.isArray(resources.items) ? resources.items : [],
    },
  }
  const files = [
    {
      path: 'package.json',
      role: 'package',
      language: 'json',
      content: `${JSON.stringify(productionEditingRemotionPackageJson(workspaceId, compositionId), null, 2)}\n`,
    },
    {
      path: 'src/Root.tsx',
      role: 'entrypoint',
      language: 'tsx',
      content: productionEditingRemotionRootTsx(compositionId),
    },
    {
      path: 'src/MovScriptProduction.tsx',
      role: 'source',
      language: 'tsx',
      content: productionEditingRemotionCompositionTsx(),
    },
    {
      path: 'src/production-seed.ts',
      role: 'data',
      language: 'ts',
      content: `export const productionSeed = ${JSON.stringify(seed, null, 2)} as const;\n`,
    },
    {
      path: 'movscript-remotion-workspace.json',
      role: 'metadata',
      language: 'json',
      content: `${JSON.stringify(seed, null, 2)}\n`,
    },
  ]
  const writtenFiles = []
  for (const file of files) {
    const relativePath = safeBackendProjectFilePath(file.path)
    const absolutePath = resolve(projectDirectory, ...relativePath.split('/'))
    assertPathInsideDirectory(projectDirectory, absolutePath)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, file.content, 'utf8')
    writtenFiles.push({
      path: relativePath,
      absolute_path: absolutePath,
      role: file.role,
      language: file.language,
      bytes: Buffer.byteLength(file.content, 'utf8'),
    })
  }
  return {
    schema: 'movscript.production_editing.remotion_project_scaffold.v1',
    status: 'created',
    backend: 'remotion',
    project_id: workspaceId,
    title,
    export_directory: projectDirectory,
    file_count: writtenFiles.length,
    files: writtenFiles,
    entrypoint: 'src/Root.tsx',
    entrypoint_path: resolve(projectDirectory, 'src', 'Root.tsx'),
    composition_id: compositionId,
    rendered: false,
    candidate_created: false,
    scaffolded: true,
    service_owner: 'project-service',
  }
}

function productionEditingRemotionPackageJson(workspaceId, compositionId) {
  return {
    private: true,
    name: projectEditingPathSegment(`movscript-remotion-${workspaceId}`).toLowerCase().replace(/_/g, '-'),
    scripts: {
      studio: 'remotion studio src/Root.tsx',
      render: `remotion render src/Root.tsx ${compositionId} out/rough-cut.mp4`,
    },
    dependencies: {
      '@remotion/cli': 'latest',
      remotion: 'latest',
      react: 'latest',
      'react-dom': 'latest',
    },
    devDependencies: {
      typescript: 'latest',
    },
  }
}

function productionEditingRemotionRootTsx(compositionId) {
  return `import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { MovScriptProduction } from './MovScriptProduction';
import { productionSeed } from './production-seed';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={${JSON.stringify(compositionId)}}
      component={MovScriptProduction}
      width={productionSeed.width}
      height={productionSeed.height}
      fps={productionSeed.fps}
      durationInFrames={productionSeed.durationInFrames}
      defaultProps={{ seed: productionSeed }}
    />
  );
};

registerRoot(RemotionRoot);
`
}

function productionEditingRemotionCompositionTsx() {
  return `import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { productionSeed } from './production-seed';

type ProductionSeed = typeof productionSeed;
type ResourceItem = ProductionSeed['resources']['items'][number];

export const MovScriptProduction: React.FC<{ seed: ProductionSeed }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = seed.resources.items;
  const intro = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
  const progress = interpolate(frame, [0, Math.max(1, seed.durationInFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={styles.stage}>
      <div style={{ ...styles.backplate, opacity: 0.5 + intro * 0.35 }} />
      <main style={{ ...styles.content, transform: \`translateY(\${(1 - intro) * 24}px)\` }}>
        <p style={styles.eyebrow}>MovScript Production Editing</p>
        <h1 style={styles.title}>{seed.title}</h1>
        <p style={styles.meta}>
          {seed.productionId} · {items.length} resources · {seed.width}x{seed.height}@{seed.fps}
        </p>
        <section style={styles.grid}>
          {items.slice(0, 6).map((item, index) => (
            <ResourceCard key={String(item.id ?? item.contentUnitId ?? index)} item={item} index={index} />
          ))}
          {items.length === 0 ? <div style={styles.empty}>No production resources yet</div> : null}
        </section>
      </main>
      <div style={styles.progressTrack}>
        <div style={{ ...styles.progressFill, width: \`\${progress * 100}%\` }} />
      </div>
    </AbsoluteFill>
  );
};

const ResourceCard: React.FC<{ item: ResourceItem; index: number }> = ({ item, index }) => {
  const label = item.title ?? item.contentUnitId ?? item.id ?? \`Resource \${index + 1}\`;
  const detail = [
    item.kind,
    item.mediaKind ?? item.media_kind,
    item.selectedResourceId ?? item.selected_resource_id ? \`resource \${item.selectedResourceId ?? item.selected_resource_id}\` : undefined,
  ].filter(Boolean).join(' · ');

  return (
    <article style={styles.card}>
      <div style={styles.cardIndex}>{String(index + 1).padStart(2, '0')}</div>
      <div>
        <h2 style={styles.cardTitle}>{String(label)}</h2>
        <p style={styles.cardDetail}>{detail || 'available content unit'}</p>
      </div>
    </article>
  );
};

const styles: Record<string, React.CSSProperties> = {
  stage: {
    background: '#101014',
    color: '#f7f2ea',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: 'hidden',
  },
  backplate: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(135deg, #202436 0%, #101014 45%, #263126 100%)',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    padding: 72,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 20,
  },
  eyebrow: {
    margin: 0,
    color: '#9bd6c5',
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: 0,
  },
  title: {
    margin: 0,
    maxWidth: 1320,
    fontSize: 88,
    lineHeight: 1.02,
    fontWeight: 800,
    letterSpacing: 0,
  },
  meta: {
    margin: 0,
    color: '#c9c2b8',
    fontSize: 30,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 14,
    maxWidth: 1280,
    marginTop: 18,
  },
  card: {
    minHeight: 126,
    border: '1px solid rgba(247, 242, 234, 0.18)',
    background: 'rgba(247, 242, 234, 0.08)',
    borderRadius: 8,
    padding: 22,
    display: 'grid',
    gridTemplateColumns: '54px 1fr',
    gap: 16,
    alignItems: 'start',
  },
  cardIndex: {
    color: '#f1c75b',
    fontSize: 26,
    fontWeight: 800,
  },
  cardTitle: {
    margin: 0,
    fontSize: 26,
    lineHeight: 1.15,
    fontWeight: 750,
  },
  cardDetail: {
    margin: '8px 0 0',
    color: '#c9c2b8',
    fontSize: 20,
    lineHeight: 1.25,
  },
  empty: {
    border: '1px solid rgba(247, 242, 234, 0.18)',
    borderRadius: 8,
    padding: 24,
    color: '#c9c2b8',
    fontSize: 24,
  },
  progressTrack: {
    position: 'absolute',
    left: 72,
    right: 72,
    bottom: 54,
    height: 6,
    background: 'rgba(247, 242, 234, 0.18)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#9bd6c5',
  },
};
`
}

function productionEditingWorkspaceOpenAction(workspace, mediaEditingProject) {
  const kind = stringValue(workspace.kind)
  if (kind === 'remotion') {
    return pruneUndefinedRecord({
      kind: 'media_pipeline_task_request',
      taskType: 'backend_project_preview',
      task_type: 'backend_project_preview',
      backend: 'remotion',
      projectDirectory: stringValue(workspace.projectDirectory ?? workspace.project_directory),
      project_directory: stringValue(workspace.projectDirectory ?? workspace.project_directory),
      entrypoint: stringValue(workspace.entrypoint),
      compositionId: stringValue(workspace.compositionId ?? workspace.composition_id),
      composition_id: stringValue(workspace.compositionId ?? workspace.composition_id),
      previewCommand: workspace.previewCommand ?? workspace.preview_command,
      preview_command: workspace.previewCommand ?? workspace.preview_command,
    })
  }
  const editingProjectId = stringValue(workspace.editingProjectId ?? workspace.editing_project_id)
  const editingProjectProjectId = stringValue(workspace.mediaEditingProjectProjectId ?? workspace.media_editing_project_project_id)
    ?? stringValue(mediaEditingProject?.projectId ?? mediaEditingProject?.project_id)
  return pruneUndefinedRecord({
    kind: 'desktop_route',
    route: editingProjectId ? productionEditingSystemRoute(editingProjectId, editingProjectProjectId) : '/editing',
    editingProjectId,
    editing_project_id: editingProjectId,
    editingProjectProjectId,
    editing_project_project_id: editingProjectProjectId,
    workspaceId: stringValue(workspace.workspaceId ?? workspace.workspace_id),
    workspace_id: stringValue(workspace.workspaceId ?? workspace.workspace_id),
  })
}

async function productionEditingWorkspaceHandoffEnvelope(workspace, { projectDir, mediaEditingProject } = {}) {
  const handoff = productionEditingWorkspaceHandoff(workspace, mediaEditingProject)
  const handoffPreflight = await productionEditingWorkspaceHandoffPreflight(workspace, { projectDir, mediaEditingProject })
  return {
    handoff,
    handoff_preflight: handoffPreflight,
    handoffPreflight,
  }
}

function productionEditingWorkspaceHandoff(workspace, mediaEditingProject) {
  const kind = stringValue(workspace.kind)
  const workspaceId = stringValue(workspace.workspaceId ?? workspace.workspace_id)
  const productionId = stringValue(workspace.productionId ?? workspace.production_id)
  const mediaProjectId = stringValue(workspace.mediaEditingProjectProjectId ?? workspace.media_editing_project_project_id)
    ?? stringValue(mediaEditingProject?.projectId ?? mediaEditingProject?.project_id)
  return pruneUndefinedRecord({
    fromSkill: 'production-editing',
    from_skill: 'production-editing',
    toSkill: kind === 'remotion' ? 'remotion' : 'system_edit',
    to_skill: kind === 'remotion' ? 'remotion' : 'system_edit',
    reason: 'workspace_ready',
    workspaceKind: kind,
    workspace_kind: kind,
    workspaceId,
    workspace_id: workspaceId,
    requiredContext: pruneUndefinedRecord({
      mediaProjectId,
      media_project_id: mediaProjectId,
      projectId: mediaProjectId,
      project_id: mediaProjectId,
      productionId,
      production_id: productionId,
      workspaceId,
      workspace_id: workspaceId,
      projectDirectory: workspace.projectDirectory ?? workspace.project_directory,
      project_directory: workspace.projectDirectory ?? workspace.project_directory,
      mediaEditingProjectId: workspace.editingProjectId ?? workspace.editing_project_id,
      media_editing_project_id: workspace.editingProjectId ?? workspace.editing_project_id,
      manifestPath: workspace.manifestPath ?? workspace.manifest_path,
      manifest_path: workspace.manifestPath ?? workspace.manifest_path,
    }),
  })
}

async function productionEditingWorkspaceHandoffPreflight(workspace, { projectDir, mediaEditingProject } = {}) {
  const kind = stringValue(workspace.kind)
  const agentSkill = await productionEditingWorkspaceAgentSkillStatus(kind, { projectDir })
  const projectRuntime = await productionEditingWorkspaceProjectRuntimeStatus(workspace, { mediaEditingProject })
  const blockers = [
    ...productionEditingAgentSkillBlockers(agentSkill),
    ...(Array.isArray(projectRuntime.blockers) ? projectRuntime.blockers : []),
  ]
  const warnings = [
    ...(Array.isArray(projectRuntime.warnings) ? projectRuntime.warnings : []),
  ]
  return {
    schema: 'movscript.production_editing_handoff_preflight.v1',
    workspaceKind: kind,
    workspace_kind: kind,
    ready: agentSkill.status === 'available' && blockers.length === 0,
    blockers,
    warnings,
    agentSkill,
    agent_skill: agentSkill,
    projectRuntime,
    project_runtime: projectRuntime,
  }
}

async function productionEditingWorkspaceAgentSkillStatus(kind, { projectDir } = {}) {
  const skillName = kind === 'remotion' ? 'remotion' : 'system_edit'
  const skillDirectory = kind === 'remotion' ? 'remotion' : 'system-edit'
  if (kind === 'remotion') {
    return productionEditingEnsureCodexSkill({ projectDir, skillName, skillDirectory })
  }
  return {
    status: 'available',
    provider: 'unknown',
    skillName,
    skill_name: skillName,
    skillDirectory,
    skill_directory: skillDirectory,
    source: 'movscript_plugin_bundled_skill',
  }
}

function productionEditingAgentSkillBlockers(agentSkill) {
  if (!agentSkill || agentSkill.status === 'available') return []
  const skillName = stringValue(agentSkill.skillName ?? agentSkill.skill_name) ?? 'workspace skill'
  if (agentSkill.status === 'installed_restart_required') {
    return [{
      code: 'REMOTION_SKILL_INSTALL_RESTART_REQUIRED',
      message: `${skillName} skill was installed, but the current agent session may need restart or skill reindex before handoff.`,
      installAction: agentSkill.installAction,
      install_action: agentSkill.install_action,
    }]
  }
  if (agentSkill.status === 'install_failed') {
    return [{
      code: 'REMOTION_SKILL_INSTALL_FAILED',
      message: `${skillName} skill installation failed.`,
      error: agentSkill.error,
      installAction: agentSkill.installAction,
      install_action: agentSkill.install_action,
    }]
  }
  return [{
    code: 'REMOTION_SKILL_MISSING',
    message: `${skillName} skill is missing and could not be installed automatically.`,
    installAction: agentSkill.installAction,
    install_action: agentSkill.install_action,
  }]
}

async function productionEditingEnsureCodexSkill({ projectDir, skillName, skillDirectory }) {
  const targetDir = stringValue(projectDir)
    ? resolve(projectDir, '.codex', 'skills', 'plugins', 'movscript_movscript-bundled', skillDirectory)
    : undefined
  const targetSkillPath = targetDir ? resolve(targetDir, 'SKILL.md') : undefined
  if (targetSkillPath && await pathExists(targetSkillPath)) {
    return {
      status: 'available',
      provider: 'codex',
      skillName,
      skill_name: skillName,
      skillDirectory,
      skill_directory: skillDirectory,
      source: 'project_codex_skill',
      path: targetSkillPath,
    }
  }
  const sourceDir = await productionEditingBundledSkillSourceDirectory(skillDirectory)
  if (!sourceDir || !targetDir || !targetSkillPath) {
    return {
      status: 'missing',
      provider: 'codex',
      skillName,
      skill_name: skillName,
      skillDirectory,
      skill_directory: skillDirectory,
      source: sourceDir ? 'movscript_plugin_bundled_skill' : 'missing_bundled_skill',
      installAction: {
        kind: 'manual_instruction',
        requiresRestart: true,
        instruction: `Install the MovScript ${skillName} skill into the current Codex project and restart or reindex Codex skills.`,
      },
      install_action: {
        kind: 'manual_instruction',
        requires_restart: true,
        instruction: `Install the MovScript ${skillName} skill into the current Codex project and restart or reindex Codex skills.`,
      },
    }
  }
  try {
    await mkdir(dirname(targetDir), { recursive: true })
    await cp(sourceDir, targetDir, { recursive: true, force: true })
    return {
      status: 'installed_restart_required',
      provider: 'codex',
      skillName,
      skill_name: skillName,
      skillDirectory,
      skill_directory: skillDirectory,
      source: 'movscript_plugin_bundled_skill',
      sourcePath: sourceDir,
      source_path: sourceDir,
      path: targetSkillPath,
      installAction: {
        kind: 'codex_skill_install',
        command: `Installed MovScript ${skillName} skill at ${targetSkillPath}. Restart Codex or reload skills before handing off.`,
        requiresRestart: true,
      },
      install_action: {
        kind: 'codex_skill_install',
        command: `Installed MovScript ${skillName} skill at ${targetSkillPath}. Restart Codex or reload skills before handing off.`,
        requires_restart: true,
      },
    }
  } catch (error) {
    return {
      status: 'install_failed',
      provider: 'codex',
      skillName,
      skill_name: skillName,
      skillDirectory,
      skill_directory: skillDirectory,
      source: 'movscript_plugin_bundled_skill',
      sourcePath: sourceDir,
      source_path: sourceDir,
      path: targetSkillPath,
      error: errorMessage(error),
      installAction: {
        kind: 'manual_instruction',
        requiresRestart: true,
        instruction: `Copy ${sourceDir} to ${targetDir}, then restart or reindex Codex skills.`,
      },
      install_action: {
        kind: 'manual_instruction',
        requires_restart: true,
        instruction: `Copy ${sourceDir} to ${targetDir}, then restart or reindex Codex skills.`,
      },
    }
  }
}

async function productionEditingBundledSkillSourceDirectory(skillDirectory) {
  const candidates = [
    resolve(import.meta.dirname, '..', 'skills', skillDirectory),
    resolve(import.meta.dirname, '..', '..', '..', 'apps', 'plugin', 'skills', skillDirectory),
    resolve(process.cwd(), 'apps', 'plugin', 'skills', skillDirectory),
    resolve(process.cwd(), 'plugins', 'movscript', 'skills', skillDirectory),
  ]
  for (const candidate of candidates) {
    if (await pathExists(resolve(candidate, 'SKILL.md'))) return candidate
  }
  return undefined
}

async function productionEditingWorkspaceProjectRuntimeStatus(workspace, { mediaEditingProject } = {}) {
  const kind = stringValue(workspace.kind)
  if (kind === 'remotion') return productionEditingRemotionProjectRuntimeStatus(workspace)
  const mediaEditingProjectPath = stringValue(workspace.mediaEditingProjectPath ?? workspace.media_editing_project_path)
  const hasMediaEditingProject = Boolean(mediaEditingProject)
    || (mediaEditingProjectPath ? await pathExists(mediaEditingProjectPath) : false)
  if (hasMediaEditingProject) {
    return {
      status: 'ready',
      ready: true,
      backend: 'system_editing',
      mediaEditingProjectPath,
      media_editing_project_path: mediaEditingProjectPath,
    }
  }
  return {
    status: 'blocked',
    ready: false,
    backend: 'system_editing',
    mediaEditingProjectPath,
    media_editing_project_path: mediaEditingProjectPath,
    blockers: [{
      code: 'SYSTEM_EDITING_MEDIA_PROJECT_MISSING',
      message: 'The system_editing workspace is missing its MediaEditingProject file.',
      mediaEditingProjectPath,
      media_editing_project_path: mediaEditingProjectPath,
    }],
  }
}

async function productionEditingRemotionProjectRuntimeStatus(workspace) {
  const projectDirectory = stringValue(workspace.projectDirectory ?? workspace.project_directory)
  const entrypoint = stringValue(workspace.entrypoint) ?? 'src/Root.tsx'
  const blockers = []
  const checks = []
  if (!projectDirectory) {
    blockers.push({
      code: 'REMOTION_PROJECT_DIRECTORY_MISSING',
      message: 'The Remotion workspace is missing projectDirectory.',
    })
  } else {
    const requiredFiles = ['package.json', entrypoint, 'movscript-remotion-workspace.json']
    for (const file of requiredFiles) {
      let relativePath
      try {
        relativePath = safeBackendProjectFilePath(file)
      } catch (error) {
        blockers.push({
          code: 'REMOTION_PROJECT_FILE_PATH_INVALID',
          message: errorMessage(error),
          path: file,
        })
        continue
      }
      const absolutePath = resolve(projectDirectory, ...relativePath.split('/'))
      const exists = await pathExists(absolutePath)
      checks.push({
        path: relativePath,
        absolutePath,
        absolute_path: absolutePath,
        exists,
      })
      if (!exists) {
        blockers.push({
          code: 'REMOTION_PROJECT_FILES_MISSING',
          message: `The Remotion workspace is missing required project file: ${relativePath}`,
          path: relativePath,
          absolutePath,
          absolute_path: absolutePath,
          projectDirectory,
          project_directory: projectDirectory,
        })
      }
    }
  }
  return {
    status: blockers.length > 0 ? 'blocked' : 'ready',
    ready: blockers.length === 0,
    backend: 'remotion',
    projectDirectory,
    project_directory: projectDirectory,
    entrypoint,
    checks,
    blockers,
  }
}

function productionEditingSystemRoute(editingProjectId, projectId) {
  const base = `/editing/${encodeURIComponent(editingProjectId)}`
  return projectId ? `${base}?projectId=${encodeURIComponent(projectId)}` : base
}

function productionEditingContentUnitKind(entity) {
  const type = stringValue(entity?.record?.content_unit_type ?? entity?.record?.contentUnitType)
  if (type === 'asset_ref') return 'asset'
  if (type === 'keyframe_ref') return 'keyframe'
  if (type === 'storyboard_ref') return 'storyboard'
  return undefined
}

function productionEditingContentUnitId(entity) {
  return contentUnitRefValue(entity?.id ?? entity?.record?.id ?? entity?.record?.ID ?? pathSegmentAfter(entity?.path, 'content_units'))
}

function productionEditingContentUnitMatchesProduction(entity, productionId, productionContext) {
  const kind = productionEditingContentUnitKind(entity)
  if (kind === 'asset') return true
  const record = recordValue(entity?.record) ?? {}
  const values = [
    entity?.path,
    record.production_id,
    record.productionId,
    record.target_ref,
    record.targetRef,
    record.scope_ref,
    record.scopeRef,
    record.scene_moment_ref,
    record.sceneMomentRef,
    record.expression_unit_ref,
    record.expressionUnitRef,
    record.storyboard_ref,
    record.storyboardRef,
    record.keyframe_ref,
    record.keyframeRef,
  ].filter((value) => value !== undefined && value !== null)
  if (values.some((value) => productionEditingValueReferencesProduction(value, productionId))) return true
  if (kind === 'keyframe') {
    return productionEditingRefMatchesScopedEntity(record.keyframe_ref ?? record.keyframeRef, productionContext.keyframes ?? [], productionId)
  }
  if (kind === 'storyboard') {
    return productionEditingRefMatchesScopedEntity(record.storyboard_ref ?? record.storyboardRef, productionContext.storyboards ?? [], productionId)
  }
  return false
}

function productionEditingValueReferencesProduction(value, productionId) {
  const text = String(value)
  return sameLooseId(text, productionId)
    || text.includes(`productions/${productionId}`)
    || text.includes(`production:${productionId}`)
}

function productionEditingRefMatchesScopedEntity(ref, entities, productionId) {
  const refText = stringValue(ref)
  if (!refText) return false
  return entities.some((entity) => {
    const candidates = [
      entity.id,
      entity.record?.id,
      entity.record?.ID,
      entity.path,
    ].filter((value) => value !== undefined && value !== null)
    return candidates.some((candidate) => sameLooseId(candidate, refText) || String(candidate).endsWith(`/${refText}`))
      && productionEditingValueReferencesProduction(entity.path, productionId)
  })
}

function productionEditingResourceItem({ entity, productionId, decisionContext }) {
  const record = recordValue(entity?.record) ?? {}
  const contentUnitId = productionEditingContentUnitId(entity) ?? String(record.id ?? entity?.path ?? 'content_unit')
  const contentUnitType = stringValue(record.content_unit_type ?? record.contentUnitType) ?? 'content_unit'
  const kind = productionEditingContentUnitKind(entity) ?? 'asset'
  const selection = recordValue(decisionContext?.selection)
  const selectedCandidateId = stringValue(selection?.candidate_id ?? selection?.candidateId)
  const selectedResourceId = numberValue(selection?.resource_id ?? selection?.resourceId)
  const candidates = Array.isArray(decisionContext?.candidates) ? decisionContext.candidates.filter(recordValue) : []
  const resourceIds = uniqueNumbers([
    selectedResourceId,
    ...candidates.flatMap((candidate) => productionEditingCandidateResourceIds(candidate)),
  ])
  const mediaKind = productionEditingMediaKind(record.output_kind ?? record.outputKind)
    ?? productionEditingMediaKind(candidates.flatMap((candidate) => productionEditingCandidateOutputKinds(candidate)).find(Boolean))
  return pruneUndefinedRecord({
    id: `${kind}:${contentUnitId}`,
    kind,
    contentUnitId,
    content_unit_id: contentUnitId,
    contentUnitType,
    content_unit_type: contentUnitType,
    title: stringValue(record.title ?? record.name) ?? contentUnitId,
    scopeRef: productionId,
    scope_ref: productionId,
    sourcePath: stringValue(entity?.path),
    source_path: stringValue(entity?.path),
    assetRef: stringValue(record.asset_ref ?? record.assetRef),
    asset_ref: stringValue(record.asset_ref ?? record.assetRef),
    keyframeRef: stringValue(record.keyframe_ref ?? record.keyframeRef),
    keyframe_ref: stringValue(record.keyframe_ref ?? record.keyframeRef),
    storyboardRef: stringValue(record.storyboard_ref ?? record.storyboardRef),
    storyboard_ref: stringValue(record.storyboard_ref ?? record.storyboardRef),
    selectedCandidateId,
    selected_candidate_id: selectedCandidateId,
    candidateIds: candidates.map((candidate) => stringValue(candidate.id ?? candidate.candidate_id ?? candidate.candidateId)).filter(Boolean),
    candidate_ids: candidates.map((candidate) => stringValue(candidate.id ?? candidate.candidate_id ?? candidate.candidateId)).filter(Boolean),
    selectedResourceId,
    selected_resource_id: selectedResourceId,
    resourceIds,
    resource_ids: resourceIds,
    mediaKind,
    media_kind: mediaKind,
    thumbnailResourceId: mediaKind === 'image' ? selectedResourceId ?? resourceIds[0] : undefined,
    thumbnail_resource_id: mediaKind === 'image' ? selectedResourceId ?? resourceIds[0] : undefined,
    stale: stringValue(selection?.stale_policy ?? selection?.stalePolicy) === 'stale',
  })
}

function productionEditingCandidateResourceIds(candidate) {
  const outputs = Array.isArray(candidate.outputs) ? candidate.outputs.filter(recordValue) : []
  return [
    numberValue(candidate.resource_id ?? candidate.resourceId),
    ...outputs.map((output) => numberValue(output.resource_id ?? output.resourceId)),
  ].filter((value) => value !== undefined)
}

function productionEditingCandidateOutputKinds(candidate) {
  const outputs = Array.isArray(candidate.outputs) ? candidate.outputs.filter(recordValue) : []
  return [
    candidate.kind,
    candidate.output_kind,
    candidate.outputKind,
    candidate.resource_kind,
    candidate.resourceKind,
    ...outputs.map((output) => output.kind ?? output.output_kind ?? output.outputKind),
  ]
}

function productionEditingMediaKind(value) {
  const text = stringValue(value)
  if (!text) return undefined
  if (text.includes('image') || text.includes('frame') || text === 'asset_ref' || text === 'keyframe_ref') return 'image'
  if (text.includes('video') || text === 'storyboard_ref') return 'video'
  if (text.includes('audio')) return 'audio'
  return 'file'
}

function productionEditingResourceSourceHash(items) {
  return stableJSONString(items.map((item) => ({
    id: item.id,
    selectedCandidateId: item.selectedCandidateId,
    selectedResourceId: item.selectedResourceId,
    resourceIds: item.resourceIds,
  })))
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => typeof value === 'number' && Number.isFinite(value)))]
}

function sameLooseId(left, right) {
  return String(left ?? '').trim() === String(right ?? '').trim()
}

function backendProjectWorkspaceExportFiles({ backendProject, materialized }) {
  const projectFiles = Array.isArray(backendProject.files)
    ? backendProject.files
        .map((file) => recordValue(file))
        .filter(Boolean)
        .map((file) => ({
          path: stringValue(file.path),
          role: stringValue(file.role) ?? 'source',
          language: stringValue(file.language),
          content: typeof file.content === 'string' ? file.content : undefined,
        }))
        .filter((file) => file.path && file.content !== undefined)
    : []
  const existingPaths = new Set(projectFiles.map((file) => safeBackendProjectFilePath(file.path)))
  const extraFiles = []
  const mediaEditingProject = recordValue(backendProject.media_editing_project)
    ?? recordValue(materialized?.media_editing_project)
  if (mediaEditingProject && !existingPaths.has('media-editing-project.json')) {
    extraFiles.push({
      path: 'media-editing-project.json',
      role: 'source',
      language: 'json',
      content: `${JSON.stringify(mediaEditingProject, null, 2)}\n`,
    })
  }
  extraFiles.push({
    path: 'movscript-backend-project.json',
    role: 'metadata',
    language: 'json',
    content: `${JSON.stringify(backendProject, null, 2)}\n`,
  })
  extraFiles.push({
    path: 'export-manifest.json',
    role: 'metadata',
    language: 'json',
    content: `${JSON.stringify({
      schema: 'movscript.production_editing.backend_project_export_manifest.v1',
      backend: backendProject.backend,
      project_id: backendProject.project_id,
      title: backendProject.title,
      entrypoint: backendProject.entrypoint,
      file_count: projectFiles.length + extraFiles.length + 1,
      rendered: false,
      candidate_created: false,
    }, null, 2)}\n`,
  })
  return [...projectFiles, ...extraFiles]
}

function safeBackendProjectFilePath(value) {
  const raw = stringValue(value)
  if (!raw) throw httpError(400, 'project_backend_project_file_path_required', 'backend project file path is required')
  if (isAbsolute(raw)) {
    throw httpError(400, 'project_backend_project_file_path_invalid', `backend project file path must be relative: ${raw}`)
  }
  const normalized = raw.replace(/\\/g, '/')
  const parts = normalized.split('/').filter((part) => part && part !== '.')
  if (parts.length === 0 || parts.some((part) => part === '..')) {
    throw httpError(400, 'project_backend_project_file_path_invalid', `backend project file path is invalid: ${raw}`)
  }
  return parts.join('/')
}

function assertPathInsideDirectory(directory, path) {
  const relativePath = relative(directory, path)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw httpError(400, 'project_backend_project_file_path_invalid', 'backend project export attempted to write outside exportDirectory')
  }
}

async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (isNotFoundError(error)) return false
    throw error
  }
}

function parseProjectContentCanvasFile(content, path) {
  try {
    return projectContentCanvasRecordFromInput(JSON.parse(content), { path })
  } catch (error) {
    if (error?.statusCode) throw error
    throw httpError(400, 'project_content_canvas_invalid', `content canvas file is invalid: ${path}`)
  }
}

function projectEditingPathSegment(value) {
  const safe = String(value ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return safe || 'project'
}

function contentCanvasRunAffectedContentUnitIds(canvasRecord, snapshot) {
  const nodeRefs = new Set()
  for (const node of Array.isArray(canvasRecord.nodes) ? canvasRecord.nodes : []) {
    const nodeId = stringValue(node.node_id ?? node.nodeId ?? node.id)
    const kind = stringValue(node.kind)
    if (!nodeId) continue
    const suffix = contentCanvasNodeIdSuffix(nodeId)
    nodeRefs.add(nodeId)
    nodeRefs.add(suffix)
    if (kind) {
      nodeRefs.add(`${kind}:${suffix}`)
      nodeRefs.add(`${kind}:${nodeId}`)
    }
  }
  const affected = []
  for (const unit of snapshot.contentUnits ?? []) {
    const unitId = idValue(unit.id ?? unit.record?.id ?? pathSegmentAfter(unit.path, 'content_units'))
    if (unitId === undefined) continue
    const refs = contentUnitRunRefs(unit)
    if (refs.some((ref) => nodeRefs.has(ref) || nodeRefs.has(contentCanvasNodeIdSuffix(ref)))) {
      affected.push(String(unitId))
    }
  }
  return affected
}

function contentUnitRunRefs(unit) {
  const record = recordValue(unit.record) ?? {}
  const id = idValue(unit.id ?? record.id ?? pathSegmentAfter(unit.path, 'content_units'))
  const refs = [
    id,
    id !== undefined ? `content_unit:${id}` : undefined,
    unit.path,
    id !== undefined ? `content_units/${id}` : undefined,
    record.target_ref,
    record.targetRef,
    record.expression_unit_ref,
    record.expressionUnitRef,
    record.storyboard_ref,
    record.storyboardRef,
    record.keyframe_ref,
    record.keyframeRef,
    record.audio_cue_ref,
    record.audioCueRef,
    record.asset_ref,
    record.assetRef,
    record.scene_moment_ref,
    record.sceneMomentRef,
  ].map(idValue).filter((value) => value !== undefined).map(String)
  return [...new Set(refs.flatMap((ref) => [ref, contentCanvasNodeIdSuffix(ref)]))]
}

function contentCanvasNodeIdSuffix(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const colonParts = text.split(':').filter(Boolean)
  if (colonParts.length > 1) return colonParts[colonParts.length - 1]
  const slashParts = text.split('/').filter(Boolean)
  return slashParts[slashParts.length - 1] ?? text
}

function contentCanvasRunCandidateImpact({ affectedContentUnitIds, contentUnitSummaries, contentData }) {
  const affected = new Set(affectedContentUnitIds.map(String))
  const summaries = contentUnitSummaries.filter((summary) => {
    if (affected.size === 0) return false
    return affected.has(String(summary.content_unit_id))
  })
  const candidateCounts = Object.fromEntries(summaries.map((summary) => [
    String(summary.content_unit_id),
    numberValue(summary.candidate_count) ?? 0,
  ]))
  const selectedContentUnitIds = summaries
    .filter((summary) => summary.selected_candidate !== undefined)
    .map((summary) => String(summary.content_unit_id))
  const missingSelectionContentUnitIds = summaries
    .filter((summary) => Array.isArray(summary.blocking_refs) && summary.blocking_refs.includes('selection_missing'))
    .map((summary) => String(summary.content_unit_id))
  return {
    schema: 'movscript.content_canvas_candidate_impact.v1',
    affectedContentUnitIds: summaries.map((summary) => String(summary.content_unit_id)),
    affected_content_unit_ids: summaries.map((summary) => String(summary.content_unit_id)),
    affectedContentUnitCount: summaries.length,
    affected_content_unit_count: summaries.length,
    candidateCounts: candidateCounts,
    candidate_counts: candidateCounts,
    selectedContentUnitIds,
    selected_content_unit_ids: selectedContentUnitIds,
    missingSelectionContentUnitIds,
    missing_selection_content_unit_ids: missingSelectionContentUnitIds,
    totalCandidateCount: summaries.reduce((sum, summary) => sum + (numberValue(summary.candidate_count) ?? 0), 0),
    total_candidate_count: summaries.reduce((sum, summary) => sum + (numberValue(summary.candidate_count) ?? 0), 0),
    workspaceCandidateMapCount: Object.keys(recordValue(contentData.contentUnitCandidates) ?? {}).length,
    workspace_candidate_map_count: Object.keys(recordValue(contentData.contentUnitCandidates) ?? {}).length,
  }
}

function projectContentCanvasRecordFromInput(input, options = {}) {
  const source = recordValue(input)
  const record = source ? recordValue(source.canvas ?? source.record) ?? source : undefined
  if (!record) throw httpError(400, 'project_content_canvas_required', 'content canvas record is required')
  const id = stringValue(record.id ?? record.canvasId ?? record.canvas_id)
    ?? contentCanvasProjectIdFromPath(options.path)
    ?? createProjectContentCanvasId()
  const updatedAt = stringValue(record.updated_at ?? record.updatedAt) ?? new Date().toISOString()
  const titleInput = contentCanvasTitleInput(record)
  const title = titleInput === undefined
    ? contentCanvasTitleFromProjectPath(options.path) ?? 'Untitled Canvas'
    : normalizeProjectContentCanvasTitle(titleInput)
  return pruneUndefinedRecord({
    schema: CONTENT_CANVAS_SCHEMA,
    kind: 'content_canvas',
    canvasKind: 'content',
    canvas_kind: 'content',
    id,
    title,
    name: title,
    scope: projectContentCanvasScope(record.scope),
    nodes: projectContentCanvasNodes(record.nodes),
    groups: projectContentCanvasGroups(record.groups ?? record.group_nodes ?? record.groupNodes),
    layouts: projectContentCanvasLayouts(record.layouts ?? record.node_layouts ?? record.nodeLayouts),
    updated_at: updatedAt,
    created_at: stringValue(record.created_at ?? record.createdAt),
  })
}

function contentCanvasTitleInput(record) {
  if (Object.prototype.hasOwnProperty.call(record, 'title')) return record.title
  if (Object.prototype.hasOwnProperty.call(record, 'name')) return record.name
  return undefined
}

function normalizeProjectContentCanvasTitle(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function validateProjectContentCanvasTitle(title) {
  if (!title) return httpError(400, 'project_content_canvas_title_required', 'content canvas title is required')
  if (title.length > CONTENT_CANVAS_TITLE_MAX_LENGTH) {
    return httpError(400, 'project_content_canvas_title_too_long', `content canvas title must be at most ${CONTENT_CANVAS_TITLE_MAX_LENGTH} characters`)
  }
  if (CONTENT_CANVAS_TITLE_INVALID_PATTERN.test(title)) {
    return httpError(400, 'project_content_canvas_title_invalid', 'content canvas title contains unsupported characters')
  }
  return undefined
}

function projectContentCanvasScope(value) {
  const scope = recordValue(value)
  if (!scope || scope.kind === 'global') return { kind: 'global' }
  if (scope.kind !== 'production') return { kind: 'global' }
  const productionId = stringValue(scope.production_id ?? scope.productionId)
  if (!productionId) return { kind: 'global' }
  return pruneUndefinedRecord({
    kind: 'production',
    production_id: productionId,
    production_title: stringValue(scope.production_title ?? scope.productionTitle),
    production_node_id: stringValue(scope.production_node_id ?? scope.productionNodeId),
    production_path: stringValue(scope.production_path ?? scope.productionPath),
  })
}

function projectContentCanvasNodes(value) {
  const values = Array.isArray(value)
    ? value
    : Object.values(recordValue(value) ?? {})
  return values
    .map(projectContentCanvasNode)
    .filter(Boolean)
    .sort((left, right) => left.node_id.localeCompare(right.node_id))
}

function projectContentCanvasNode(value) {
  const node = recordValue(value)
  if (!node) return undefined
  const nodeId = stringValue(node.node_id ?? node.nodeId ?? node.id)
  if (!nodeId) return undefined
  return pruneUndefinedRecord({
    node_id: nodeId,
    kind: stringValue(node.kind),
    added_at: stringValue(node.added_at ?? node.addedAt),
  })
}

function projectContentCanvasGroups(value) {
  const values = Array.isArray(value)
    ? value
    : Object.values(recordValue(value) ?? {})
  return values
    .map(projectContentCanvasGroup)
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id))
}

function projectContentCanvasGroup(value) {
  const group = recordValue(value)
  if (!group) return undefined
  const id = stringValue(group.id ?? group.groupId ?? group.group_id)
  if (!id) return undefined
  const memberNodeIds = uniqueStringValues(group.member_node_ids ?? group.memberNodeIds ?? group.nodes ?? group.node_ids ?? group.nodeIds)
  if (memberNodeIds.length < 2) return undefined
  return pruneUndefinedRecord({
    id,
    title: stringValue(group.title ?? group.name ?? group.label),
    member_node_ids: memberNodeIds,
    created_at: stringValue(group.created_at ?? group.createdAt),
    updated_at: stringValue(group.updated_at ?? group.updatedAt),
  })
}

function projectContentCanvasLayouts(value) {
  const layouts = recordValue(value)
  if (!layouts) return {}
  return Object.fromEntries(Object.entries(layouts)
    .map(([nodeId, layout]) => [nodeId, projectContentCanvasLayout(layout)])
    .filter(([, layout]) => Boolean(layout)))
}

function projectContentCanvasLayout(value) {
  const layout = recordValue(value)
  if (!layout) return undefined
  const x = numberValue(layout.x)
  const y = numberValue(layout.y)
  const width = numberValue(layout.width)
  const height = numberValue(layout.height)
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined
  return pruneUndefinedRecord({
    x,
    y,
    width,
    height,
    manual: layout.manual === true,
    source: stringValue(layout.source),
    updated_at: stringValue(layout.updated_at ?? layout.updatedAt),
  })
}

function uniqueStringValues(value) {
  if (!Array.isArray(value)) return []
  const output = []
  const seen = new Set()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const next = item.trim()
    if (!next || seen.has(next)) continue
    seen.add(next)
    output.push(next)
  }
  return output
}

function contentCanvasProjectFilePath(id) {
  return `${CONTENT_CANVAS_DIRECTORY}/${contentCanvasProjectPathSegment(id)}/${CONTENT_CANVAS_FILE_NAME}`
}

function contentCanvasProjectPathSegment(id) {
  const safe = String(id).trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return safe || 'canvas'
}

function contentCanvasProjectIdFromPath(path) {
  const segment = contentCanvasProjectPathSegmentFromPath(path)
  return segment ? String(segment).trim() : undefined
}

function contentCanvasTitleFromProjectPath(path) {
  const segment = contentCanvasProjectPathSegmentFromPath(path)
  if (!segment) return undefined
  return segment
    .replace(/^canvas[_-]?/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    || undefined
}

function contentCanvasProjectPathSegmentFromPath(path) {
  const parts = String(path ?? '').split(/[\\/]+/).filter(Boolean)
  const candidate = parts.at(-1) === CONTENT_CANVAS_FILE_NAME ? parts.at(-2) : parts.at(-1)
  return stringValue(candidate)
}

function createProjectContentCanvasId() {
  return `canvas:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
}

function rejectRemovedNamespacePlaybackContentUnitInput(input) {
  const payload = recordValue(input.payload ?? input.record ?? input.entity) ?? {}
  const contentUnitType = stringValue(input.contentUnitType ?? input.content_unit_type ?? payload.contentUnitType ?? payload.content_unit_type)
  const targetKind = stringValue(input.targetKind ?? input.target_kind ?? payload.targetKind ?? payload.target_kind)
  const targetCategory = stringValue(input.targetCategory ?? input.target_category ?? payload.targetCategory ?? payload.target_category)
  if (contentUnitType !== 'timeline_assembly_ref' && targetKind !== 'timeline_assembly' && targetCategory !== 'timeline_assembly') return
  throw httpError(400, 'namespace_playback_content_unit_removed', 'Namespace-scope playback content units are removed; create or open a production editing workspace for production-level playback.')
}

function namespaceHierarchyNodeInput(input) {
  const targetPath = stringValue(input.targetPath ?? input.target_path)
  if (!targetPath) {
    throw httpError(400, 'project_namespace_target_path_required', 'targetPath is required for writeNamespaceNode')
  }
  const category = stringValue(input.category ?? input.domainCategory ?? input.domain_category)
  if (category !== 'timeline_namespace' && category !== 'setting_namespace') {
    throw httpError(400, 'project_namespace_category_unsupported', 'category must be timeline_namespace or setting_namespace')
  }
  const entityKind = namespaceEntityKindFromPath(targetPath)
  if (!entityKind || !namespaceCategoryAllowsEntityKind(category, entityKind)) {
    throw httpError(400, 'project_namespace_target_path_unsupported', `targetPath is not valid for ${category}`)
  }
  const record = recordValue(input.record) ?? {}
  const namespaceKind = stringValue(
    input.namespaceKind
    ?? input.namespace_kind
    ?? input.domainKind
    ?? input.domain_kind
    ?? input.kind
    ?? record.namespace_kind
    ?? record.namespaceKind
    ?? record.timeline_namespace_kind
    ?? record.timelineNamespaceKind
    ?? record.setting_namespace_kind
    ?? record.settingNamespaceKind,
  )
  if (!namespaceKind) {
    throw httpError(400, 'project_namespace_kind_required', 'namespace kind is required for writeNamespaceNode')
  }
  return {
    targetPath,
    record: pruneUndefinedRecord({
      ...record,
      schema: `movscript.${entityKind}.v1`,
      kind: entityKind,
      id: idValue(input.id ?? record.id) ?? namespaceEntityIdFromPath(targetPath, entityKind),
      title: stringValue(input.title ?? record.title),
      project_id: idValue(input.projectId ?? input.project_id ?? record.project_id),
      order: numberValue(input.order ?? record.order),
      intent: stringValue(input.intent ?? record.intent),
      namespace_kind: namespaceKind,
      ...(category === 'timeline_namespace' ? { timeline_namespace_kind: namespaceKind } : {}),
      ...(category === 'setting_namespace' ? { setting_namespace_kind: namespaceKind } : {}),
    }),
  }
}

function namespaceCategoryAllowsEntityKind(category, entityKind) {
  if (category === 'timeline_namespace') return entityKind === 'production' || entityKind === 'segment'
  if (category === 'setting_namespace') return entityKind === 'setting' || entityKind === 'setting_state'
  return false
}

function namespaceEntityKindFromPath(path) {
  if (path.endsWith('/production.json')) return 'production'
  if (path.endsWith('/segment.json')) return 'segment'
  if (path.endsWith('/setting.json')) return 'setting'
  if (path.endsWith('/setting_state.json')) return 'setting_state'
  return undefined
}

function namespaceEntityIdFromPath(targetPath, entityKind) {
  const collection = {
    production: 'timeline',
    segment: 'segments',
    setting: 'settings',
    setting_state: 'states',
  }[entityKind]
  return pathSegmentAfter(targetPath, collection) ?? targetPath.split('/').filter(Boolean).at(-2)
}

async function readProjectReadModel(context, now) {
  const engine = createProjectWorkspaceEngine(context)
  const [
    overview,
    contentSnapshot,
    source,
    inspection,
  ] = await Promise.all([
    observeProjectServicePhase(context.requestScope, 'deriveMs', () => overviewMovScriptWorkspace({
      fileRepository: context.fileRepository,
      decisionStore: context.decisionStore,
      now,
    })),
    observeProjectServicePhase(context.requestScope, 'deriveMs', () => loadContentSourceWorkspaceSnapshotFromEngine(engine)),
    context.readModelOptions.includeSource
      ? observeProjectServicePhase(context.requestScope, 'deriveMs', () => resolveWorkspaceSource(context.fileRepository, context.sourceOptions))
      : undefined,
    context.readModelOptions.includeInspection
      ? observeProjectServicePhase(context.requestScope, 'deriveMs', () => inspectMovScriptWorkspace({
        fileRepository: context.fileRepository,
        decisionStore: context.decisionStore,
        now,
        ...context.inspectOptions,
      }))
      : undefined,
  ])
  const contentData = buildContentSourceWorkspaceData(contentSnapshot)
  const contentUnitSummaries = contentSourceWorkspaceContentUnitStatusSummaries(contentSnapshot)
  const contentUnitCandidates = contentCanvasCandidatesFromContentWorkspace(contentData)
  const projectTimelineStatus = await observeProjectServicePhase(
    context.requestScope,
    'deriveMs',
    async () => buildContentSourceWorkspaceProjectTimelineStatus(contentSnapshot, contentUnitSummaries),
  )
  return {
    schema: 'movscript.project-read-model.v1',
    status: overview.status,
    workspace: overview.workspace,
    sourceSummary: overview.source,
    productionSummary: overview.production,
    contentSummary: overview.content,
    contentUnits: sortProjectCanvasEntities(contentSnapshot.contentUnits),
    contentUnitSummaries,
    content_unit_summaries: contentUnitSummaries,
    contentUnitCandidates,
    content_unit_candidates: contentUnitCandidates,
    readiness: overview.readiness,
    projectTimelineStatus,
    project_timeline_status: projectTimelineStatus,
    overview,
    ...(source ? { source } : {}),
    ...(inspection ? { inspection } : {}),
  }
}

async function readProjectHomeReadModel(context, now) {
  const engine = createProjectWorkspaceEngine(context)
  const index = await observeProjectServicePhase(context.requestScope, 'indexLoadMs', () => engine.workspaceService.loadIndex())
  return observeProjectServicePhase(context.requestScope, 'deriveMs', async () => {
    const project = queryMovScriptWorkspaceEntities(index, { entityKind: 'project', limit: 1 })[0]
    const scripts = queryMovScriptWorkspaceEntities(index, { entityKind: 'script', limit: 500 })
      .map((entity) => projectHomeRecord(entity))
    const settings = queryMovScriptWorkspaceSettings(index, { limit: 500 })
      .map((entity) => projectHomeRecord(entity))
    const assets = queryMovScriptWorkspaceAssets(index, { limit: 500 }).assets
      .map((entity) => projectHomeRecord(entity))
    const productionContext = queryMovScriptWorkspaceProductionContext(index, {
      include: ['productions', 'scene_moments', 'content_units'],
      limit: 1000,
    })
    const productions = (productionContext.productions ?? []).map((entity) => projectHomeRecord(entity))
    const sceneMoments = (productionContext.scene_moments ?? []).map((entity) => projectHomeRecord(entity))
    const contentUnits = (productionContext.content_units ?? []).map((entity) => projectHomeRecord(entity))
    return {
      schema: 'movscript.project-home-read-model.v1',
      generatedAt: now.toISOString(),
      projectDir: context.projectDir,
      workspace: {
        projectId: stringValue(project?.record.project_id ?? project?.record.projectId ?? project?.id),
        title: stringValue(project?.record.title ?? project?.record.name),
        documentCount: index.documents.length,
      },
      project: project ? projectHomeRecord(project) : undefined,
      scripts,
      settings,
      assets,
      productions,
      sceneMoments,
      contentUnits,
      counts: {
        scripts: scripts.length,
        settings: settings.length,
        assets: assets.length,
        productions: productions.length,
        sceneMoments: sceneMoments.length,
        contentUnits: contentUnits.length,
        library: scripts.length + settings.length + assets.length,
        pipeline: productions.length + sceneMoments.length + contentUnits.length,
        total: scripts.length + settings.length + assets.length + productions.length + sceneMoments.length + contentUnits.length,
      },
    }
  })
}

async function readProjectStandardsReadModel(context, now) {
  const engine = createProjectWorkspaceEngine(context)
  const index = await observeProjectServicePhase(context.requestScope, 'indexLoadMs', () => engine.workspaceService.loadIndex())
  return observeProjectServicePhase(context.requestScope, 'deriveMs', async () => {
    const project = queryMovScriptWorkspaceEntities(index, { entityKind: 'project', limit: 1 })[0]
    const settings = queryMovScriptWorkspaceSettings(index, { limit: 500 })
      .map((entity) => projectHomeRecord(entity))
    const assets = queryMovScriptWorkspaceAssets(index, { limit: 500 }).assets
      .map((entity) => projectHomeRecord(entity))
    const productionContext = queryMovScriptWorkspaceProductionContext(index, {
      include: ['productions', 'segments', 'scene_moments', 'content_units'],
      limit: 1000,
    })
    const productions = (productionContext.productions ?? []).map((entity) => projectHomeRecord(entity))
    const segments = (productionContext.segments ?? []).map((entity) => projectHomeRecord(entity))
    const sceneMoments = (productionContext.scene_moments ?? []).map((entity) => projectHomeRecord(entity))
    const contentUnits = (productionContext.content_units ?? []).map((entity) => projectHomeRecord(entity))
    return {
      schema: 'movscript.project-standards-read-model.v1',
      generatedAt: now.toISOString(),
      projectDir: context.projectDir,
      workspace: {
        projectId: stringValue(project?.record.project_id ?? project?.record.projectId ?? project?.id),
        title: stringValue(project?.record.title ?? project?.record.name),
        documentCount: index.documents.length,
      },
      project: project ? projectHomeRecord(project) : null,
      settings,
      assetSlots: assets,
      productions,
      segments,
      sceneMoments,
      contentUnits,
      creativeRelationships: [],
      settingUsages: [],
      assetSlotCandidates: [],
      counts: {
        settings: settings.length,
        assetSlots: assets.length,
        productions: productions.length,
        segments: segments.length,
        sceneMoments: sceneMoments.length,
        contentUnits: contentUnits.length,
        total: settings.length + assets.length + productions.length + segments.length + sceneMoments.length + contentUnits.length,
      },
    }
  })
}

async function readProjectContentCanvasReadModel(context, now) {
  const engine = createProjectWorkspaceEngine(context)
  const [
    index,
    contentSnapshot,
  ] = await Promise.all([
    observeProjectServicePhase(context.requestScope, 'indexLoadMs', () => engine.workspaceService.loadIndex()),
    observeProjectServicePhase(context.requestScope, 'deriveMs', () => loadContentSourceWorkspaceSnapshotFromEngine(engine)),
  ])
  return observeProjectServicePhase(context.requestScope, 'deriveMs', async () => {
    const contentData = buildContentSourceWorkspaceData(contentSnapshot)
    const project = queryMovScriptWorkspaceEntities(index, { entityKind: 'project', limit: 1 })[0] ?? null
    const projectId = contentCanvasProjectId(context, project)
    const contentUnitCandidates = contentCanvasCandidatesFromContentWorkspace(contentData)
    const editingProjectsByNodeId = contentCanvasEditingProjectsByNodeId({
      data: contentData,
      sceneMoments: contentSnapshot.sceneMoments,
      productions: contentSnapshot.productions,
      segments: contentSnapshot.segments,
      projectId,
    })
    return {
    schema: 'movscript.project-content-canvas-read-model.v1',
    generatedAt: now.toISOString(),
    projectDir: context.projectDir,
    workspace: {
      projectId: stringValue(project?.record.project_id ?? project?.record.projectId ?? project?.id),
      title: stringValue(project?.record.title ?? project?.record.name),
      documentCount: index.documents.length,
    },
    projectId,
    project,
    productions: sortProjectCanvasEntities(contentSnapshot.productions),
    segments: sortProjectCanvasEntities(contentSnapshot.segments),
    sceneMoments: sortProjectCanvasEntities(contentSnapshot.sceneMoments),
    storyboards: sortProjectCanvasEntities(contentSnapshot.storyboards),
    expressionUnits: sortProjectCanvasEntities(contentSnapshot.expressionUnits),
    contentUnits: sortProjectCanvasEntities(contentSnapshot.contentUnits),
    keyframes: sortProjectCanvasEntities(contentSnapshot.keyframes),
    settings: sortProjectCanvasEntities(contentSnapshot.settings),
    settingStates: sortProjectCanvasEntities(contentSnapshot.settingStates),
    audioCues: sortProjectCanvasEntities(contentSnapshot.audioCues),
    assets: sortProjectCanvasEntities(contentSnapshot.assets),
    contentUnitCandidates,
    domainGraph: contentData.domainGraph,
    editingProjectsByNodeId,
    assetReferenceUnits: contentData.assetReferenceUnits,
    productionWorkPlan: contentData.productionWorkPlan,
    counts: {
      productions: contentSnapshot.productions.length,
      segments: contentSnapshot.segments.length,
      sceneMoments: contentSnapshot.sceneMoments.length,
      expressionUnits: contentSnapshot.expressionUnits.length,
      contentUnits: contentSnapshot.contentUnits.length,
      settings: contentSnapshot.settings.length,
      assets: contentSnapshot.assets.length,
      candidates: Object.values(contentUnitCandidates).reduce((total, candidates) => total + candidates.length, 0),
      editingProjects: Object.keys(editingProjectsByNodeId).length,
    },
  }
  })
}

async function readProjectScriptsReadModel(context, now) {
  const engine = createProjectWorkspaceEngine(context)
  const index = await observeProjectServicePhase(context.requestScope, 'indexLoadMs', () => engine.workspaceService.loadIndex())
  return observeProjectServicePhase(context.requestScope, 'deriveMs', async () => {
    const project = queryMovScriptWorkspaceEntities(index, { entityKind: 'project', limit: 1 })[0]
    const versions = queryMovScriptWorkspaceEntities(index, { entityKind: 'script_version', limit: 1000 })
      .map((entity) => projectScriptVersionSummaryRecord(entity))
    const versionsByScriptRef = projectScriptVersionsByScriptRef(versions)
    const scripts = queryMovScriptWorkspaceEntities(index, { entityKind: 'script', limit: 500 })
      .map((entity) => projectScriptSummaryRecord(entity, versionsByScriptRef))
    return {
      schema: 'movscript.project-scripts-read-model.v1',
      generatedAt: now.toISOString(),
      projectDir: context.projectDir,
      workspace: {
        projectId: stringValue(project?.record.project_id ?? project?.record.projectId ?? project?.id),
        title: stringValue(project?.record.title ?? project?.record.name),
        documentCount: index.documents.length,
      },
      project: project ? projectHomeRecord(project) : null,
      scripts,
      versions,
      counts: {
        scripts: scripts.length,
        versions: versions.length,
        total: scripts.length + versions.length,
      },
    }
  })
}

async function readProjectContentUnitsReadModel({ projectDir, body = {}, contentUnitIds, decisionStore, requestScope, now }) {
  const engine = createProjectWorkspaceEngine({ projectDir, decisionStore, body, requestScope })
  const index = await observeProjectServicePhase(requestScope, 'indexLoadMs', () => engine.workspaceService.loadIndex())
  const decisionContexts = decisionStore
    ? await readCandidateContexts(decisionStore, contentUnitIds, requestScope)
    : []
  const decisionContextByContentUnitId = projectDecisionContextsByContentUnitId(decisionContexts)
  return observeProjectServicePhase(requestScope, 'deriveMs', async () => {
    const contentUnitsById = new Map(queryMovScriptWorkspaceEntities(index, { entityKind: 'content_unit', limit: 5000 })
      .flatMap((entity) => projectContentUnitRefValues(entity).map((ref) => [ref, entity])))
    const contentUnits = contentUnitIds.map((contentUnitId) => {
      const ref = contentUnitRefValue(contentUnitId)
      const entity = ref ? contentUnitsById.get(ref) : undefined
      return projectContentUnitReadModelRecord({
        contentUnitId,
        entity,
        decisionContext: ref ? decisionContextByContentUnitId.get(ref) : undefined,
      })
    })
    return {
      schema: 'movscript.project-content-units-read-model.v1',
      generatedAt: now.toISOString(),
      projectDir,
      contentUnitIds,
      contentUnits,
      counts: {
        requested: contentUnitIds.length,
        contentUnits: contentUnits.length,
        candidates: contentUnits.reduce((total, unit) => total + unit.candidates.length, 0),
        selected: contentUnits.filter((unit) => unit.selectionState === 'selected').length,
      },
    }
  })
}

function contentCanvasProjectId(context, project) {
  return numberValue(context.body?.projectId ?? context.body?.project_id)
    ?? numberValue(project?.record.ID ?? project?.record.id ?? project?.record.project_id ?? project?.record.projectId ?? project?.id)
    ?? 1
}

function contentCanvasCandidatesFromContentWorkspace(data) {
  const output = {}
  for (const [contentUnitId, candidates] of Object.entries(data.contentUnitCandidates ?? {})) {
    appendContentCanvasCandidates(output, contentUnitId, candidates.map(contentCanvasCandidateFromPreview))
  }
  for (const moment of data.previewMoments ?? []) {
    for (const expressionUnit of moment.expressionUnits ?? []) {
      const contentUnitId = expressionUnit.contentUnit?.id
      if (contentUnitId === undefined || contentUnitId === null) continue
      appendContentCanvasCandidates(output, String(contentUnitId), (expressionUnit.contentUnit.candidates ?? []).map(contentCanvasCandidateFromPreview))
    }
  }
  for (const assetUnit of Object.values(data.assetReferenceUnits ?? {})) {
    if (!assetUnit?.contentUnitId) continue
    appendContentCanvasCandidates(output, String(assetUnit.contentUnitId), (assetUnit.candidates ?? []).map(contentCanvasCandidateFromPreview))
  }
  return output
}

function contentCanvasCandidateFromPreview(candidate) {
  return {
    id: String(candidate.id),
    title: stringValue(candidate.title) ?? String(candidate.id),
    resourceId: numberValue(candidate.resourceId ?? candidate.resource_id),
    resourceKind: stringValue(candidate.resourceKind ?? candidate.resource_kind),
    artifactRef: stringValue(candidate.artifactRef ?? candidate.artifact_ref),
    inputHash: stringValue(candidate.inputHash ?? candidate.input_hash),
    source: stringValue(candidate.source ?? candidate.model) ?? '',
    status: stringValue(candidate.status),
    decisionStatus: stringValue(candidate.decisionStatus ?? candidate.decision_status),
    decisionReason: stringValue(candidate.decisionReason ?? candidate.decision_reason),
    producer: recordValue(candidate.producer),
    outputs: Array.isArray(candidate.outputs) ? candidate.outputs : undefined,
    promptSnapshot: recordValue(candidate.promptSnapshot ?? candidate.prompt_snapshot),
    createdAt: stringValue(candidate.createdAt ?? candidate.created_at),
    selected: Boolean(candidate.selected),
    notes: stringValue(candidate.note ?? candidate.notes ?? candidate.inputHash ?? candidate.input_hash) ?? '',
  }
}

function appendContentCanvasCandidates(output, contentUnitId, candidates) {
  const byId = new Map((output[contentUnitId] ?? []).map((candidate) => [contentCanvasCandidateMergeKey(candidate), candidate]))
  for (const candidate of candidates) byId.set(contentCanvasCandidateMergeKey(candidate), candidate)
  output[contentUnitId] = [...byId.values()]
}

function contentCanvasCandidateMergeKey(candidate) {
  return [
    candidate.id,
    candidate.resourceId ?? '',
    candidate.artifactRef ?? '',
    candidate.inputHash ?? '',
    candidate.source ?? '',
  ].join(':')
}

function contentCanvasEditingProjectsByNodeId(input) {
  const output = {}
  for (const timeline of input.data.editingTimelines ?? []) {
    const editingProject = timeline.mediaEditingProject
    const targetId = String(timeline.targetId)
    output[targetId] = editingProject
    output[`${timeline.targetKind}:${targetId}`] = editingProject
    if (timeline.targetRef !== undefined) {
      output[String(timeline.targetRef)] = editingProject
      output[`${timeline.targetKind}:${String(timeline.targetRef)}`] = editingProject
    }
    const targets = timeline.targetKind === 'scene_moment'
      ? input.sceneMoments
      : input.productions
    const target = targets.find((item) =>
      String(item.id ?? item.record.ID ?? item.record.id ?? '') === targetId
      || (timeline.targetPath !== undefined && item.path === timeline.targetPath)
    )
    if (target) output[contentCanvasNodeIdForEntity(target, input.projectId)] = editingProject
  }
  return output
}

function contentCanvasNodeIdForEntity(entity, projectId) {
  return `${contentCanvasKind(entity)}:${contentCanvasEntityKey(entity, projectId)}`
}

function contentCanvasKind(entity) {
  if (entity.entityKind === 'asset') return 'asset'
  if (entity.entityKind === 'setting_state') return 'state'
  return entity.entityKind
}

function contentCanvasEntityKey(entity, projectId) {
  if (entity.entityKind === 'project') return String(entity.id ?? entity.record.project_id ?? projectId)
  return idValue(entity.id ?? entity.record.ID ?? entity.record.id) ?? `${entity.entityKind}:${entity.path}`
}

function sortProjectCanvasEntities(items) {
  return [...items].sort((left, right) => {
    const leftOrder = numberValue(left.record.order)
    const rightOrder = numberValue(right.record.order)
    if (leftOrder !== undefined || rightOrder !== undefined) return (leftOrder ?? 0) - (rightOrder ?? 0)
    return projectCanvasEntityTitle(left).localeCompare(projectCanvasEntityTitle(right), 'zh-CN')
  })
}

function projectCanvasEntityTitle(entity) {
  return String(entity.record.title ?? entity.record.name ?? entity.record.label ?? entity.id ?? entity.path)
}

function projectHomeRecord(entity) {
  return {
    ...entity.record,
    __workspace_entity_type: entity.entityKind,
    __workspace_path: entity.path,
    ...(entity.id !== undefined ? { id: entity.id } : {}),
    ...(entity.clientId !== undefined ? { client_id: entity.clientId } : {}),
    ...(entity.schema !== undefined ? { schema: entity.schema } : {}),
  }
}

const PROJECT_SCRIPT_SOURCE_FIELDS = new Set(['source', 'content', 'raw_source', 'blocks'])

function projectScriptSummaryRecord(entity, versionsByScriptRef) {
  const record = stripProjectScriptSourceFields(entity.record)
  const sourceRef = stringValue(entity.record.source_ref ?? entity.record.sourceRef) ?? 'script.md'
  const sourcePath = projectScriptSourcePath(entity, sourceRef)
  const scriptRefs = projectScriptRefValues(entity, record)
  const matchingVersions = uniqueProjectScriptVersions(scriptRefs.flatMap((ref) => versionsByScriptRef.get(ref) ?? []))
    .sort(compareProjectScriptVersionsDescending)
  const latestVersion = matchingVersions[0]
  const inlineBodyLength = projectScriptInlineBodyLength(entity.record)
  const bodyLength = numberValue(entity.record.bodyLength ?? entity.record.body_length ?? entity.record.sourceLength ?? entity.record.source_length)
    ?? inlineBodyLength
  const currentVersion = latestVersion ? projectScriptCurrentVersionSummary(latestVersion) : undefined
  return pruneUndefinedRecord({
    ...record,
    entityKind: entity.entityKind,
    path: entity.path,
    __workspace_entity_type: entity.entityKind,
    __workspace_path: entity.path,
    ...(entity.id !== undefined ? { id: entity.id } : {}),
    ...(entity.clientId !== undefined ? { client_id: entity.clientId } : {}),
    sourceRef,
    source_ref: sourceRef,
    sourcePath,
    source_path: sourcePath,
    bodyLength,
    body_length: bodyLength,
    sourceLoaded: false,
    source_loaded: false,
    versionCount: matchingVersions.length,
    version_count: matchingVersions.length,
    currentVersion,
    current_version: currentVersion,
  })
}

function projectScriptVersionSummaryRecord(entity) {
  const record = stripProjectScriptSourceFields(entity.record)
  return pruneUndefinedRecord({
    ...record,
    entityKind: entity.entityKind,
    path: entity.path,
    __workspace_entity_type: entity.entityKind,
    __workspace_path: entity.path,
    ...(entity.id !== undefined ? { id: entity.id } : {}),
    ...(entity.clientId !== undefined ? { client_id: entity.clientId } : {}),
    bodyLength: projectScriptInlineBodyLength(entity.record),
    body_length: projectScriptInlineBodyLength(entity.record),
    sourceLoaded: false,
    source_loaded: false,
  })
}

function stripProjectScriptSourceFields(record) {
  const output = {}
  for (const [key, value] of Object.entries(record ?? {})) {
    if (PROJECT_SCRIPT_SOURCE_FIELDS.has(key)) continue
    output[key] = value
  }
  return output
}

function projectScriptSourcePath(entity, sourceRef) {
  const scriptPath = stringValue(entity.path)
  if (!scriptPath) return undefined
  return `${scriptPath.replace(/\/script\.json$/, '')}/${sourceRef}`.replace(/\/+/g, '/')
}

function projectScriptInlineBodyLength(record) {
  const source = stringValue(record?.content ?? record?.raw_source ?? record?.source)
  return source ? source.length : undefined
}

function projectScriptVersionsByScriptRef(versions) {
  const output = new Map()
  for (const version of versions) {
    for (const ref of projectScriptVersionRefValues(version)) {
      const items = output.get(ref) ?? []
      items.push(version)
      output.set(ref, items)
    }
  }
  return output
}

function projectScriptVersionRefValues(version) {
  const refs = [
    version.script_id,
    version.scriptId,
    version.script_ref,
    version.scriptRef,
    version.record?.script_id,
    version.record?.scriptId,
    version.record?.script_ref,
    version.record?.scriptRef,
    pathSegmentAfter(version.path, 'scripts'),
  ].map(scriptRefValue).filter(Boolean)
  return [...new Set(refs)]
}

function projectScriptRefValues(entity, record) {
  const refs = [
    entity.id,
    entity.clientId,
    record.ID,
    record.id,
    record.script_id,
    record.scriptId,
    record.script_ref,
    record.scriptRef,
    pathSegmentAfter(entity.path, 'scripts'),
  ].map(scriptRefValue).filter(Boolean)
  return [...new Set(refs)]
}

function scriptRefValue(value) {
  const ref = idValue(value)
  if (ref === undefined) return undefined
  const text = String(ref)
  return text.startsWith('script_') ? text.replace(/^script_/, '') : text
}

function uniqueProjectScriptVersions(versions) {
  const output = []
  const seen = new Set()
  for (const version of versions) {
    const key = String(version.path ?? version.id ?? version.ID ?? output.length)
    if (seen.has(key)) continue
    seen.add(key)
    output.push(version)
  }
  return output
}

function compareProjectScriptVersionsDescending(left, right) {
  const leftNumber = numberValue(left.version_number ?? left.versionNumber ?? left.ID ?? left.id) ?? 0
  const rightNumber = numberValue(right.version_number ?? right.versionNumber ?? right.ID ?? right.id) ?? 0
  if (leftNumber !== rightNumber) return rightNumber - leftNumber
  return String(right.UpdatedAt ?? right.updated_at ?? '').localeCompare(String(left.UpdatedAt ?? left.updated_at ?? ''))
}

function projectScriptCurrentVersionSummary(version) {
  return pruneUndefinedRecord({
    id: idValue(version.id ?? version.ID),
    ID: idValue(version.ID ?? version.id),
    version_number: numberValue(version.version_number ?? version.versionNumber),
    version_label: stringValue(version.version_label ?? version.versionLabel),
    title: stringValue(version.title),
    UpdatedAt: stringValue(version.UpdatedAt ?? version.updated_at),
    updated_at: stringValue(version.updated_at ?? version.UpdatedAt),
  })
}

function projectDecisionContextsByContentUnitId(contexts) {
  const output = new Map()
  for (const context of contexts) {
    for (const ref of projectDecisionContextContentUnitRefs(context)) {
      output.set(ref, context)
    }
  }
  return output
}

function projectDecisionContextContentUnitRefs(context) {
  return [
    context.contentUnitId,
    context.content_unit_id,
    context.target_ref,
    context.targetRef,
  ].flatMap((value) => [
    contentUnitRefValue(value),
    contentUnitRefValue(pathSegmentAfter(value, 'content_units')),
  ]).filter(Boolean)
}

function projectContentUnitReadModelRecord({ contentUnitId, entity, decisionContext }) {
  const record = recordValue(entity?.record) ?? {}
  const id = contentUnitRefValue(entity?.id ?? record.id ?? record.ID ?? contentUnitId) ?? String(contentUnitId)
  const candidates = projectContentUnitCandidateSummaries(decisionContext)
  const selection = recordValue(decisionContext?.selection)
  return {
    id,
    title: stringValue(record.title ?? record.name) ?? id,
    type: stringValue(record.content_unit_type ?? record.contentUnitType ?? record.target_kind ?? record.targetKind) ?? 'content_unit',
    outputKind: stringValue(record.output_kind ?? record.outputKind) ?? projectContentUnitOutputKindFromCandidates(candidates) ?? 'unknown',
    path: stringValue(entity?.path ?? record.__workspace_path ?? record.path) ?? `content_units/${id}/content_unit.json`,
    editPrompt: projectContentUnitEditPrompt(record),
    selectionState: projectContentUnitSelectionState({ entity, candidates, selection }),
    candidates,
    record: projectContentUnitReadModelMetadata(record),
  }
}

function projectContentUnitCandidateSummaries(decisionContext) {
  const selection = recordValue(decisionContext?.selection)
  const selectedCandidateId = stringValue(selection?.candidate_id ?? selection?.candidateId)
  const candidates = Array.isArray(decisionContext?.candidates) ? decisionContext.candidates.filter(recordValue) : []
  return candidates.map((candidate) => projectContentUnitCandidateSummary(candidate, selectedCandidateId, selection))
}

function projectContentUnitCandidateSummary(candidate, selectedCandidateId, selection) {
  const id = stringValue(candidate.id ?? candidate.candidate_id ?? candidate.candidateId)
    ?? String(candidate.id ?? candidate.candidate_id ?? candidate.candidateId ?? 'candidate')
  const selected = selectedCandidateId !== undefined && String(selectedCandidateId) === String(id)
  return pruneUndefinedRecord({
    id,
    title: stringValue(candidate.title ?? candidate.name) ?? id,
    model: stringValue(candidate.model ?? candidate.model_id ?? candidate.provider) ?? '',
    note: stringValue(candidate.note ?? candidate.notes ?? candidate.reason ?? candidate.input_hash ?? candidate.inputHash) ?? '',
    selected,
    resourceId: numberValue(candidate.resource_id ?? candidate.resourceId ?? (selected ? selection?.resource_id ?? selection?.resourceId : undefined)),
    resourceKind: stringValue(candidate.resource_kind ?? candidate.resourceKind),
    status: stringValue(candidate.status),
    decisionStatus: stringValue(candidate.decision_status ?? candidate.decisionStatus),
  })
}

function projectContentUnitSelectionState({ entity, candidates, selection }) {
  if (selection?.candidate_id !== undefined || selection?.candidateId !== undefined) return 'selected'
  if (candidates.length > 0) return 'ready'
  return entity ? 'needs_candidate' : 'ready'
}

function projectContentUnitOutputKindFromCandidates(candidates) {
  return candidates.map((candidate) => stringValue(candidate.resourceKind)).find(Boolean)
}

function projectContentUnitEditPrompt(record) {
  const prompt = recordValue(record.edit_prompt ?? record.editPrompt)
  return stringValue(prompt?.text ?? prompt?.prompt ?? prompt) ?? stringValue(record.prompt ?? record.description) ?? ''
}

function projectContentUnitReadModelMetadata(record) {
  return pruneUndefinedRecord({
    id: idValue(record.id ?? record.ID),
    title: stringValue(record.title ?? record.name),
    content_unit_type: stringValue(record.content_unit_type ?? record.contentUnitType),
    output_kind: stringValue(record.output_kind ?? record.outputKind),
    target_kind: stringValue(record.target_kind ?? record.targetKind),
    target_ref: stringValue(record.target_ref ?? record.targetRef),
  })
}

function projectContentUnitRefValues(entity) {
  const record = recordValue(entity?.record) ?? {}
  const refs = [
    entity?.id,
    entity?.clientId,
    record.ID,
    record.id,
    record.content_unit_id,
    record.contentUnitId,
    pathSegmentAfter(entity?.path, 'content_units'),
  ].map(contentUnitRefValue).filter(Boolean)
  return [...new Set(refs)]
}

function contentUnitRefValue(value) {
  const ref = idValue(value)
  if (ref === undefined) return undefined
  const text = String(ref).trim()
  if (!text) return undefined
  const suffix = pathSegmentAfter(text, 'content_units')
  const normalized = suffix || text
  return normalized.startsWith('content_unit_') ? normalized.replace(/^content_unit_/, '') : normalized
}

async function executeProjectLifecycleCommand({ projectDir, command, input, now }) {
  switch (command) {
    case 'openProject':
      return openLocalProject(projectDir, now)
    case 'createProject':
      return createLocalProject(projectDir, input, now)
    case 'importProject':
      return importLocalProject(projectDir, input, now)
    default:
      throw httpError(400, 'project_lifecycle_command_unsupported', `unsupported project lifecycle command: ${command}`)
  }
}

async function resolveProjectLocator({ projectDir, workspaceDir, projectUid }) {
  const metadata = await readLocalProjectMetadata(projectDir)
  return {
    status: metadata.hasMetadata ? 'ready' : 'missing_metadata',
    projectDir,
    projectPath: projectDir,
    localProjectId: metadata.projectId,
    local_project_id: metadata.projectId,
    ...(workspaceDir ? { workspaceDir } : {}),
    ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
    ...(metadata.projectUid ?? projectUid ? { projectUid: metadata.projectUid ?? projectUid } : {}),
    ...(metadata.title ? { projectTitle: metadata.title } : {}),
    ...(metadata.description ? { description: metadata.description } : {}),
  }
}

async function readProjectResourceView({ projectDir, kind, body = {}, requestScope }) {
  const engine = createProjectWorkspaceEngine({ projectDir, body, requestScope })
  if (kind === 'project-context') {
    const [records, index] = await Promise.all([
      observeProjectServicePhase(requestScope, 'deriveMs', () => engine.workspaceService.queryEntities({ entityKind: 'project_standards', limit: 1 })),
      observeProjectServicePhase(requestScope, 'indexLoadMs', () => engine.workspaceService.loadIndex()),
    ])
    return [buildProjectContextSnapshot({
      standardsEntity: records[0],
      namespaceVocabulary: index.namespaceVocabulary,
    })]
  }
  if (isProjectDomainResourceKind(kind)) {
    const index = await observeProjectServicePhase(requestScope, 'indexLoadMs', () => engine.workspaceService.loadIndex())
    return observeProjectServicePhase(requestScope, 'deriveMs', async () => projectDomainResourceItems(index, kind))
  }
  if (kind === 'scripts') {
    const scripts = await observeProjectServicePhase(requestScope, 'deriveMs', () => engine.workspaceService.queryEntities({ entityKind: 'script' }))
    return observeProjectServicePhase(requestScope, 'deriveMs', () => Promise.all(scripts.map(async (entity) => ({
      ...entity.record,
      entityKind: entity.entityKind,
      path: entity.path,
      source: await engine.workspaceService.readScriptSource({ record: entity.record, entity }),
    }))))
  }
  if (kind === 'script-versions') {
    const versions = await observeProjectServicePhase(requestScope, 'deriveMs', () => engine.workspaceService.queryEntities({ entityKind: 'script_version' }))
    return observeProjectServicePhase(requestScope, 'deriveMs', async () => versions.map((entity) => ({
      ...entity.record,
      entityKind: entity.entityKind,
      path: entity.path,
    })))
  }

  const entityKind = projectResourceEntityKind(kind)
  const index = await observeProjectServicePhase(requestScope, 'indexLoadMs', () => engine.workspaceService.loadIndex())
  const domainNodeByPath = new Map(index.domainNodes.map((node) => [node.path, node]).filter(([path]) => typeof path === 'string'))
  const entities = await observeProjectServicePhase(requestScope, 'deriveMs', () => engine.workspaceService.queryEntities({
    entityKind,
    ...(entityKind === 'project' ? { limit: 1 } : {}),
  }))
  return observeProjectServicePhase(requestScope, 'deriveMs', async () => entities.map((entity) => projectEntityResourceItem(entity, domainNodeByPath.get(entity.path), kind)))
}

function isProjectDomainResourceKind(kind) {
  return kind === 'namespace-vocabulary'
    || kind === 'timeline-namespaces'
    || kind === 'setting-namespaces'
    || kind === 'system-primitives'
    || kind === 'domain-nodes'
    || kind === 'domain-edges'
}

function projectDomainResourceItems(index, kind) {
  if (kind === 'namespace-vocabulary') {
    return projectNamespaceVocabularyResourceItems(index.namespaceVocabulary)
  }
  if (kind === 'domain-edges') {
    return index.domainEdges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      origin: edge.origin,
      ...(edge.field ? { field: edge.field } : {}),
    }))
  }
  const nodes = index.domainNodes.filter((node) => {
    if (kind === 'timeline-namespaces') return node.category === 'timeline_namespace'
    if (kind === 'setting-namespaces') return node.category === 'setting_namespace'
    if (kind === 'system-primitives') return node.category === 'system_primitive'
    return true
  })
  return nodes.map((node) => projectDomainNodeResourceItem(node))
}

function preferredProjectReadModelEndpointForResourceKind(kind) {
  switch (kind) {
    case 'scripts':
    case 'script-versions':
      return PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT
    case 'settings':
    case 'setting-states':
    case 'assets':
    case 'project-context':
    case 'namespace-vocabulary':
    case 'setting-namespaces':
    case 'system-primitives':
      return PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT
    case 'content-units':
      return PROJECT_SERVICE_CONTENT_UNITS_READ_MODEL_ENDPOINT
    case 'productions':
    case 'segments':
    case 'scene-moments':
    case 'storyboards':
    case 'expression-units':
    case 'keyframes':
    case 'audio-cues':
    case 'timeline-namespaces':
    case 'domain-nodes':
    case 'domain-edges':
      return PROJECT_SERVICE_CONTENT_CANVAS_READ_MODEL_ENDPOINT
    default:
      return PROJECT_SERVICE_READ_MODEL_ENDPOINT
  }
}

function projectNamespaceVocabularyResourceItems(vocabulary) {
  return [
    {
      id: 'timeline',
      category: 'timeline_namespace',
      timelineTemplate: vocabulary.timelineTemplate,
      timelineNamespaces: vocabulary.timelineNamespaces,
      namespaces: vocabulary.timelineNamespaces,
      diagnostics: vocabulary.diagnostics,
    },
    {
      id: 'setting',
      category: 'setting_namespace',
      settingNamespaces: vocabulary.settingNamespaces,
      namespaces: vocabulary.settingNamespaces,
      diagnostics: vocabulary.diagnostics,
    },
  ]
}

function projectDomainNodeResourceItem(node) {
  return {
    id: node.id,
    title: node.title,
    path: node.path,
    category: node.category,
    kind: node.kind,
    order: node.order,
    entityKind: node.metadata?.entityKind,
    metadata: node.metadata,
  }
}

function projectEntityResourceItem(entity, domainNode, resourceKind) {
  const projection = legacyResourceKindProjection(resourceKind)
  return {
    ...entity.record,
    entityKind: entity.entityKind,
    path: entity.path,
    ...(projection ? {
      resourceKind,
      legacyAlias: true,
      preferredResourceKind: projection.preferredResourceKind,
    } : {}),
    ...(domainNode ? {
      domainCategory: domainNode.category,
      domainKind: domainNode.kind,
      domainNode: projectDomainNodeResourceItem(domainNode),
    } : {}),
  }
}

function legacyResourceKindProjection(kind) {
  switch (kind) {
    case 'episodes':
    case 'productions':
    case 'scenes':
    case 'segments':
      return { preferredResourceKind: 'timeline-namespaces' }
    case 'settings':
    case 'setting-states':
    case 'states':
      return { preferredResourceKind: 'setting-namespaces' }
    default:
      return undefined
  }
}

function projectResourceEntityKind(kind) {
  switch (kind) {
    case 'summary':
      return 'project'
    case 'assets':
    case 'assests':
      return 'asset'
    case 'episodes':
    case 'productions':
      return 'production'
    case 'scenes':
    case 'segments':
      return 'segment'
    case 'storyboards':
      return 'storyboard'
    case 'content-units':
      return 'content_unit'
    case 'settings':
      return 'setting'
    case 'setting-states':
    case 'states':
      return 'setting_state'
    default:
      throw httpError(400, 'project_resource_kind_unsupported', `unsupported project resource kind: ${kind}`)
  }
}

async function openLocalProject(projectDir, now) {
  const projectStat = await stat(projectDir).catch(() => undefined)
  if (!projectStat?.isDirectory()) {
    throw httpError(400, 'project_dir_not_found', 'projectDir must be an existing directory')
  }
  const metadata = await readLocalProjectMetadata(projectDir)
  return {
    status: metadata.hasMetadata ? 'ready' : 'missing_metadata',
    projectDir,
    projectPath: projectDir,
    localProjectId: metadata.projectId,
    local_project_id: metadata.projectId,
    projectId: metadata.projectId,
    projectUid: metadata.projectUid,
    project: localProjectSummary(projectDir, metadata, now),
    locator: localProjectLocator(projectDir, metadata),
  }
}

async function createLocalProject(projectDir, input, now) {
  await mkdir(projectDir, { recursive: true })
  const metadata = await readLocalProjectMetadata(projectDir)
  if (metadata.hasMetadata && input.overwrite !== true) {
    throw httpError(409, 'project_lifecycle_project_exists', 'project metadata already exists; set overwrite to true to replace it')
  }
  const initialized = await initializeLocalProject(projectDir, input)
  return localProjectInitializedResult('created', projectDir, initialized, now)
}

async function importLocalProject(projectDir, input, now) {
  const projectStat = await stat(projectDir).catch(() => undefined)
  if (!projectStat?.isDirectory()) {
    throw httpError(400, 'project_dir_not_found', 'projectDir must be an existing directory')
  }
  const initialized = await initializeLocalProject(projectDir, {
    ...input,
    title: stringValue(input.title) ?? basename(projectDir) ?? 'MovScript Project',
  })
  return localProjectInitializedResult('imported', projectDir, initialized, now)
}

async function initializeLocalProject(projectDir, input) {
  const service = createNodeMovScriptWorkspaceService({ projectDir })
  const localProjectId = localProjectIdValue(input)
  return service.initializeProject({
    title: stringValue(input.title) ?? basename(projectDir) ?? 'MovScript Project',
    ...(localProjectId ? {
      localProjectId,
      local_project_id: localProjectId,
      projectId: localProjectId,
      project_id: localProjectId,
    } : {}),
    ...(stringValue(input.projectUid ?? input.project_uid) ? { projectUid: stringValue(input.projectUid ?? input.project_uid) } : {}),
    ...(stringValue(input.language) ? { language: stringValue(input.language) } : {}),
    ...(recordValue(input.standards) ? { standards: recordValue(input.standards) } : {}),
    overwrite: input.overwrite === true,
  })
}

function localProjectInitializedResult(status, projectDir, initialized, now) {
  const metadata = {
    hasMetadata: true,
    projectId: initialized.projectId,
    projectUid: initialized.projectUid,
    title: localProjectTitleFromInitialized(projectDir, initialized),
    updatedAt: now.toISOString(),
  }
  return {
    status,
    projectDir,
    projectPath: projectDir,
    localProjectId: initialized.projectId,
    local_project_id: initialized.projectId,
    projectId: initialized.projectId,
    projectUid: initialized.projectUid,
    project: localProjectSummary(projectDir, metadata, now),
    locator: localProjectLocator(projectDir, metadata),
    initializedFiles: initialized.files.map((file) => ({
      path: file.path,
      status: file.status,
    })),
    standardSkillFiles: initialized.standardSkillFiles,
  }
}

function localProjectTitleFromInitialized(projectDir, initialized) {
  const workspaceFile = initialized.files.find((file) => file.path === 'workspace.json')
  return stringValue(workspaceFile?.record?.title) ?? basename(projectDir) ?? 'MovScript Project'
}

async function readLocalProjectMetadata(projectDir) {
  const workspace = await readJSONFile(resolve(projectDir, 'workspace.json'))
  const project = await readJSONFile(resolve(projectDir, 'project.json'))
  const hasMetadata = Boolean(recordValue(workspace) || recordValue(project))
  return {
    hasMetadata,
    projectId: stringValue(workspace?.project_id ?? workspace?.projectId ?? project?.project_id ?? project?.projectId ?? project?.id),
    projectUid: stringValue(workspace?.project_uid ?? workspace?.projectUid ?? project?.project_uid ?? project?.projectUid),
    title: stringValue(project?.title ?? project?.name ?? workspace?.title ?? workspace?.name),
    description: stringValue(project?.description ?? workspace?.description),
    updatedAt: stringValue(workspace?.updated_at ?? workspace?.updatedAt ?? project?.updated_at ?? project?.updatedAt),
  }
}

function localProjectSummary(projectDir, metadata, now) {
  return {
    id: metadata.projectId,
    localProjectId: metadata.projectId,
    local_project_id: metadata.projectId,
    uid: metadata.projectUid,
    projectUid: metadata.projectUid,
    project_uid: metadata.projectUid,
    name: metadata.title || basename(projectDir) || 'Local Project',
    description: metadata.description || projectDir,
    projectDir,
    projectPath: projectDir,
    workspacePath: projectDir,
    local: true,
    updatedAt: metadata.updatedAt || now.toISOString(),
  }
}

function localProjectLocator(projectDir, metadata) {
  return {
    projectDir,
    ...(metadata.projectId ? { localProjectId: metadata.projectId, local_project_id: metadata.projectId } : {}),
    ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
    ...(metadata.projectUid ? { projectUid: metadata.projectUid } : {}),
  }
}

function localProjectIdValue(input) {
  return stringValue(input.localProjectId ?? input.local_project_id ?? input.projectId ?? input.project_id)
}

async function executeProjectCandidateCommand({ projectDir, command, input, decisionStore }) {
  return executeProjectCandidateAction({ projectDir, input, decisionStore }, command)
}

async function executeProjectCandidateAction({ projectDir, input, decisionStore }, action) {
  const engine = createNodeMovScriptEngine({ projectDir, decisionStore })
  switch (action) {
    case 'createContentCandidate':
      return engine.createContentCandidate(input)
    case 'selectContentUnitCandidate':
      return engine.selectContentUnitCandidate(input)
    case 'decideContentUnitCandidate':
      return engine.workspaceService.decideContentUnitCandidate(input)
    default:
      throw httpError(400, 'project_candidate_command_unsupported', `unsupported project candidate command: ${action}`)
  }
}

async function readProjectCandidateActionContext(request) {
  const body = await readJSONBody(request)
  const projectDir = projectDirFromBody(body)
  const decisionStore = await optionalDecisionStoreFromBody(body, projectDir)
  if (!decisionStore) {
    throw httpError(400, 'project_candidate_decision_store_required', 'decisionStore or projectUid is required')
  }
  return {
    projectDir,
    input: recordValue(body.input) ?? {},
    decisionStore,
  }
}

function projectCandidateActionEnvelope(projectDir, result, schema) {
  return {
    schema,
    projectDir,
    result,
  }
}

async function readCandidateContexts(decisionStore, contentUnitIds, requestScope) {
  if (contentUnitIds.length === 1) {
    const context = await observeProjectServicePhase(
      requestScope,
      'decisionMs',
      () => decisionStore.getContentUnitDecision({ contentUnitId: contentUnitIds[0] }),
    )
    return context ? [normalizeDecisionContext(context)] : []
  }
  const contexts = await observeProjectServicePhase(
    requestScope,
    'decisionMs',
    () => decisionStore.getContentUnitDecisions({ contentUnitIds }),
  )
  return contentUnitIds
    .map((contentUnitId) => contexts.get(String(contentUnitId)))
    .filter(Boolean)
    .map((context) => normalizeDecisionContext(context))
}

async function readProjectPromptContexts({ projectDir, body = {}, contentUnitIds, include, promptText, decisionStore, requestScope }) {
  const engine = createProjectWorkspaceEngine({ projectDir, decisionStore, body, requestScope })
  const workspaceService = engine.workspaceService
  const decisionProvider = decisionStore ?? missingDecisionProvider()
  const index = include.has('backendPrompt')
    ? await observeProjectServicePhase(requestScope, 'indexLoadMs', () => workspaceService.loadIndex())
    : undefined
  return Promise.all(contentUnitIds.map(async (contentUnitId) => ({
    contentUnitId,
    context: await readProjectPromptContext({
      workspaceService,
      index,
      contentUnitId,
      include,
      promptText,
      decisionProvider,
      requestScope,
    }),
  })))
}

async function readProjectPromptContext({ workspaceService, index, contentUnitId, include, promptText, decisionProvider, requestScope }) {
  const [
    runtimePanel,
    generationPrompt,
    dependencyReport,
    selectionValidity,
    backendPrompt,
  ] = await Promise.all([
    include.has('runtimePanel') ? observeProjectServicePhase(requestScope, 'deriveMs', () => workspaceService.readContentUnitRuntimePanel(contentUnitId)) : undefined,
    include.has('generationPrompt') ? observeProjectServicePhase(requestScope, 'deriveMs', () => workspaceService.readContentUnitGenerationPrompt(contentUnitId)) : undefined,
    include.has('dependencyReport') ? observeProjectServicePhase(requestScope, 'deriveMs', () => workspaceService.readContentUnitDependencyReport(contentUnitId)) : undefined,
    include.has('selectionValidity') ? observeProjectServicePhase(requestScope, 'deriveMs', () => workspaceService.readContentUnitSelectionValidity(contentUnitId)) : undefined,
    include.has('backendPrompt') ? observeProjectServicePhase(requestScope, 'decisionMs', () => buildContentUnitBackendPromptById({
      index,
      contentUnitId,
      decisionProvider,
      ...(promptText !== undefined ? { promptText } : {}),
    })) : undefined,
  ])
  return {
    ...(runtimePanel ? { runtimePanel } : {}),
    ...(generationPrompt ? { generationPrompt } : {}),
    ...(dependencyReport ? { dependencyReport } : {}),
    ...(selectionValidity ? { selectionValidity } : {}),
    backendPrompt,
  }
}

function promptContextIncludeFromBody(body) {
  const raw = Array.isArray(body.include)
    ? body.include
    : Array.isArray(body.includes)
      ? body.includes
      : []
  const allowed = new Set([
    'runtimePanel',
    'generationPrompt',
    'dependencyReport',
    'selectionValidity',
    'backendPrompt',
  ])
  const include = new Set(raw.filter((item) => typeof item === 'string' && allowed.has(item)))
  if (include.size === 0) {
    return allowed
  }
  return include
}

function missingDecisionProvider() {
  return {
    async getContentUnitDecision() {
      return undefined
    },
  }
}

function decisionStoreFromBody(body) {
  const config = recordValue(body.decisionStore ?? body.decision_store)
  if (!config) {
    throw httpError(400, 'project_candidate_decision_store_required', 'decisionStore is required')
  }
  if (config.kind !== 'scoped-project-data') {
    throw httpError(400, 'project_candidate_decision_store_unsupported', 'only scoped-project-data decisionStore is supported')
  }
  const baseUrl = stringValue(config.baseUrl ?? config.base_url)
  const projectUid = stringValue(config.projectUid ?? config.project_uid)
  if (!baseUrl || !projectUid) {
    throw httpError(400, 'project_candidate_decision_store_invalid', 'decisionStore.baseUrl and decisionStore.projectUid are required')
  }
  return createMovScriptScopedProjectDataDecisionStore({
    baseUrl,
    projectUid,
    ...(stringValue(config.title) ? { title: stringValue(config.title) } : {}),
    ...(config.scopeKind === 'user' || config.scopeKind === 'org' ? { scopeKind: config.scopeKind } : {}),
    ...(config.scopeId !== undefined || config.scope_id !== undefined ? { scopeId: config.scopeId ?? config.scope_id } : {}),
    ...(stringValue(config.token) ? { token: stringValue(config.token) } : {}),
    ...(recordValue(config.headers) ? { headers: stringRecord(config.headers) } : {}),
  })
}

async function optionalDecisionStoreFromBody(body, projectDir) {
  if (recordValue(body.decisionStore ?? body.decision_store)) return decisionStoreFromBody(body)
  return inferLocalProjectDecisionStore(body, projectDir)
}

async function inferLocalProjectDecisionStore(body, projectDir) {
  const metadata = await readLocalProjectMetadata(projectDir).catch(() => undefined)
  const projectUid = stringValue(body.projectUid ?? body.project_uid)
    ?? metadata?.projectUid
  if (!projectUid) return undefined
  const baseUrl = inferredDataServiceBaseURL(body)
  if (!baseUrl) return undefined
  const scopeKind = body.scopeKind === 'org' || body.scope_kind === 'org' ? 'org' : 'user'
  const scopeId = idValue(body.scopeId ?? body.scope_id)
    ?? (scopeKind === 'user' ? '1' : undefined)
  if (scopeId === undefined) return undefined
  return createMovScriptScopedProjectDataDecisionStore({
    baseUrl,
    projectUid,
    ...(metadata?.title ? { title: metadata.title } : {}),
    scopeKind,
    scopeId,
  })
}

function inferredDataServiceBaseURL(body) {
  const explicit = normalizeHTTPBaseURL(
    stringValue(body.dataServiceBaseURL ?? body.dataServiceBaseUrl ?? body.data_service_base_url)
      ?? stringValue(process.env.MOVSCRIPT_DATA_SERVICE_URL)
      ?? stringValue(process.env.MOVSCRIPT_DATA_SERVICE_BASE_URL),
  )
  if (explicit) return explicit
  const homeDir = stringValue(body.movScriptHomeDir ?? body.movscript_home_dir ?? body.workspaceDir ?? body.workspace_dir)
    ?? resolveMovScriptHomeDir({ env: process.env })
  const snapshot = readRuntimeHomeSnapshot(homeDir)
  const endpoint = findRuntimeEndpoint(snapshot, LOCAL_NODE_GATEWAY_SERVICE)
    ?? findRuntimeService(snapshot, LOCAL_NODE_GATEWAY_SERVICE)?.endpoint
    ?? findRuntimeEndpoint(snapshot, DATA_SERVICE_NAME)
    ?? findRuntimeService(snapshot, DATA_SERVICE_NAME)?.endpoint
  return normalizeHTTPBaseURL(endpointURL(endpoint))
}

function endpointURL(endpoint) {
  if (!endpoint) return undefined
  if (endpoint.url) return endpoint.url
  if (endpoint.baseURL) return endpoint.baseURL
  if (endpoint.port) return `http://127.0.0.1:${endpoint.port}`
  return undefined
}

function normalizeHTTPBaseURL(value) {
  const trimmed = stringValue(value)?.replace(/\/+$/, '')
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.toString().replace(/\/+$/, '')
  } catch {
    return undefined
  }
}

function contentUnitIdsFromBody(body) {
  const contentUnitId = body.contentUnitId ?? body.content_unit_id
  if (contentUnitId !== undefined && contentUnitId !== null) return [contentUnitId]
  const contentUnitIds = Array.isArray(body.contentUnitIds)
    ? body.contentUnitIds
    : Array.isArray(body.content_unit_ids)
      ? body.content_unit_ids
      : []
  const ids = contentUnitIds.filter((item) => typeof item === 'string' || typeof item === 'number')
  if (ids.length === 0) {
    throw httpError(400, 'project_candidate_content_unit_required', 'contentUnitId or contentUnitIds is required')
  }
  return ids
}

function readModelContentUnitIdsFromBody(body) {
  const contentUnitId = body.contentUnitId ?? body.content_unit_id
  if (typeof contentUnitId === 'string' && contentUnitId.trim()) return [contentUnitId.trim()]
  if (typeof contentUnitId === 'number' && Number.isFinite(contentUnitId)) return [contentUnitId]
  const contentUnitIds = Array.isArray(body.contentUnitIds)
    ? body.contentUnitIds
    : Array.isArray(body.content_unit_ids)
      ? body.content_unit_ids
      : []
  const ids = contentUnitIds
    .filter((item) => typeof item === 'string' || typeof item === 'number')
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== '')
  if (ids.length === 0) {
    throw httpError(400, 'project_content_units_read_model_ids_required', 'contentUnitId or contentUnitIds is required')
  }
  return [...new Set(ids.map((item) => String(item)))].slice(0, 200)
}

function promptContextContentUnitIdsFromBody(body) {
  const contentUnitId = body.contentUnitId ?? body.content_unit_id
  if (typeof contentUnitId === 'string' && contentUnitId.trim()) return [contentUnitId.trim()]
  if (typeof contentUnitId === 'number' && Number.isFinite(contentUnitId)) return [contentUnitId]
  const contentUnitIds = Array.isArray(body.contentUnitIds)
    ? body.contentUnitIds
    : Array.isArray(body.content_unit_ids)
      ? body.content_unit_ids
      : []
  const ids = contentUnitIds
    .map((item) => {
      if (typeof item === 'string' && item.trim()) return item.trim()
      if (typeof item === 'number' && Number.isFinite(item)) return item
      return undefined
    })
    .filter((item) => item !== undefined)
  if (ids.length === 0) {
    throw httpError(400, 'project_prompt_content_unit_required', 'contentUnitId or contentUnitIds is required')
  }
  return ids
}

function contentUnitIdFromBody(body) {
  const contentUnitId = body.contentUnitId ?? body.content_unit_id
  if (typeof contentUnitId === 'string' && contentUnitId.trim()) return contentUnitId.trim()
  if (typeof contentUnitId === 'number' && Number.isFinite(contentUnitId)) return contentUnitId
  throw httpError(400, 'project_prompt_content_unit_required', 'contentUnitId is required')
}

function projectDirFromBody(body) {
  const projectDir = typeof body.projectDir === 'string'
    ? body.projectDir
    : typeof body.project_dir === 'string'
      ? body.project_dir
      : undefined
  if (!projectDir || !projectDir.trim()) {
    throw httpError(400, 'project_dir_required', 'projectDir is required')
  }
  return resolve(projectDir)
}

function pathStringValue(value) {
  const raw = stringValue(value)
  return raw ? resolve(raw) : undefined
}

function normalizeProjectAssetSourcePath(value) {
  const raw = stringValue(value)
  if (!raw) throw httpError(400, 'project_asset_path_required', 'assetPath is required')
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.includes('..') || !normalized.endsWith('/asset.json') || !parts.includes('assets')) {
    throw httpError(400, 'project_asset_path_invalid', 'assetPath must point to a project asset.json file')
  }
  return normalized
}

function parseJSONObjectFile(content, path) {
  try {
    const parsed = JSON.parse(content)
    const record = recordValue(parsed)
    if (record) return record
  } catch {
    // handled below with a path-specific error
  }
  throw httpError(400, 'project_source_json_invalid', `source JSON is invalid: ${path}`)
}

async function readJSONFile(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    return recordValue(parsed)
  } catch {
    return undefined
  }
}

async function writeProjectJSONFile(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readJSONBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw httpError(400, 'invalid_json', 'request body must be valid JSON')
  }
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function providerCertificationStorageKey(provider, certification) {
  const model = stringValue(certification.model ?? certification.public_model_id ?? certification.publicModelId ?? certification.provider_model_id ?? certification.providerModelId)
  return model ? `${provider}::model:${model}` : provider
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function idValue(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function numberValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function recordValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function pathSegmentAfter(path, segment) {
  const parts = String(path ?? '').split('/').filter(Boolean)
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function pruneUndefinedRecord(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== ''))
}

function stringRecord(value) {
  const record = recordValue(value)
  if (!record) return {}
  return Object.fromEntries(Object.entries(record)
    .filter(([, item]) => typeof item === 'string')
    .map(([key, item]) => [key, item]))
}

function isNotFoundError(error) {
  return typeof error === 'object' && error !== null && error.code === 'ENOENT'
}

function httpError(statusCode, code, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

function writeProjectServiceError(response, error) {
  if (isWorkspaceFileVersionConflict(error)) {
    writeJSON(response, 409, {
      error: 'project_workspace_file_version_conflict',
      message: 'workspace file changed before the write could be committed',
    })
    return
  }
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500
  writeJSON(response, statusCode, {
    error: error?.code ?? 'project_service_error',
    message: error?.message ?? 'project service error',
  })
}

function isWorkspaceFileVersionConflict(error) {
  return error instanceof Error && /^workspace file changed:/.test(error.message)
}

function waitForShutdown(runtime) {
  return new Promise(resolve => {
    let closing = false
    const close = async () => {
      if (closing) return
      closing = true
      await runtime.close()
      resolve()
    }
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
  })
}
