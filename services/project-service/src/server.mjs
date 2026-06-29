import { createServer } from 'node:http'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import {
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
} from '@movscript/runtime-contracts'
import { createNodeMovScriptEngine, NodeMovScriptEngineRegistry } from '@movscript/engine/node'
import { buildContentUnitBackendPromptById } from '@movscript/prompt'
import {
  PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT,
  PROJECT_SERVICE_CAPABILITIES_ENDPOINT,
  PROJECT_SERVICE_ASSET_CREATE_ENDPOINT,
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
  PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT,
  PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT,
  PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT,
  PROJECT_SERVICE_STORYBOARD_CREATE_ENDPOINT,
  PROJECT_SERVICE_STORYBOARD_TIMELINE_UPDATE_ENDPOINT,
  PROJECT_SERVICE_KEYFRAME_CREATE_ENDPOINT,
  PROJECT_SERVICE_TIMELINE_ASSEMBLY_CONTENT_UNIT_ENSURE_ENDPOINT,
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
  PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT,
  PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT,
  PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT,
  PROJECT_SERVICE_STORYBOARD_CREATE_ENDPOINT,
  PROJECT_SERVICE_STORYBOARD_TIMELINE_UPDATE_ENDPOINT,
  PROJECT_SERVICE_KEYFRAME_CREATE_ENDPOINT,
  PROJECT_SERVICE_TIMELINE_ASSEMBLY_CONTENT_UNIT_ENSURE_ENDPOINT,
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
  'project-standards',
  'project-scripts',
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
    run: (engine, input) => engine.workspaceService.upsertContentUnit(input),
  }],
  [PROJECT_SERVICE_CONTENT_UNIT_CREATE_ENDPOINT, {
    schema: 'movscript.project-content-unit-create.v1',
    run: (engine, input) => engine.createContentUnit(input),
  }],
  [PROJECT_SERVICE_CONTENT_UNIT_ENSURE_ENDPOINT, {
    schema: 'movscript.project-content-unit-ensure.v1',
    run: (engine, input) => engine.ensureContentUnitForEntity(input),
  }],
  [PROJECT_SERVICE_TIMELINE_ASSEMBLY_CONTENT_UNIT_ENSURE_ENDPOINT, {
    schema: 'movscript.project-timeline-assembly-content-unit-ensure.v1',
    run: (engine, input) => engine.ensureContentUnitForEntity(timelineAssemblyContentUnitInput(input)),
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
      return engine.createContentUnit(input)
    case 'ensureContentUnitForEntity':
      return engine.ensureContentUnitForEntity(input)
    case 'ensureTimelineAssemblyContentUnit':
      return engine.ensureContentUnitForEntity(timelineAssemblyContentUnitInput(input))
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
      timelineAssemblyCount: projectTimelineStatus.timeline_assembly_count,
      timeline_assembly_count: projectTimelineStatus.timeline_assembly_count,
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

function parseProjectContentCanvasFile(content, path) {
  try {
    return projectContentCanvasRecordFromInput(JSON.parse(content), { path })
  } catch (error) {
    if (error?.statusCode) throw error
    throw httpError(400, 'project_content_canvas_invalid', `content canvas file is invalid: ${path}`)
  }
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

function timelineAssemblyContentUnitInput(input) {
  return {
    ...input,
    targetKind: 'timeline_assembly',
    target_kind: undefined,
  }
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
  const projectTimelineStatus = await observeProjectServicePhase(
    context.requestScope,
    'deriveMs',
    async () => buildContentSourceWorkspaceProjectTimelineStatus(contentSnapshot),
  )
  return {
    schema: 'movscript.project-read-model.v1',
    status: overview.status,
    workspace: overview.workspace,
    sourceSummary: overview.source,
    productionSummary: overview.production,
    contentSummary: overview.content,
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
  const timelineNamespaceTargets = [...input.productions, ...input.segments]
  for (const timeline of input.data.editingTimelines ?? []) {
    const editingProject = timeline.mediaEditingProject
    const targetId = String(timeline.targetId)
    output[targetId] = editingProject
    output[`${timeline.targetKind}:${targetId}`] = editingProject
    if (timeline.targetRef !== undefined) {
      output[String(timeline.targetRef)] = editingProject
      output[`${timeline.targetKind}:${String(timeline.targetRef)}`] = editingProject
    }
    if (timeline.scopeKind !== undefined && timeline.scopeRef !== undefined) {
      output[`${timeline.scopeKind}:${String(timeline.scopeRef)}`] = editingProject
      output[`timeline_assembly:${timeline.scopeKind}:${String(timeline.scopeRef)}`] = editingProject
    }
    const targets = timeline.targetKind === 'scene_moment'
      ? input.sceneMoments
      : timeline.targetKind === 'timeline_assembly'
        ? timelineNamespaceTargets
        : input.productions
    const target = targets.find((item) =>
      String(item.id ?? item.record.ID ?? item.record.id ?? '') === targetId
      || (timeline.targetPath !== undefined && item.path === timeline.targetPath)
      || (timeline.scopePath !== undefined && item.path === timeline.scopePath))
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
  return service.initializeProject({
    title: stringValue(input.title) ?? basename(projectDir) ?? 'MovScript Project',
    ...(stringValue(input.projectId ?? input.project_id) ? { projectId: stringValue(input.projectId ?? input.project_id) } : {}),
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
    ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
    ...(metadata.projectUid ? { projectUid: metadata.projectUid } : {}),
  }
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

async function readJSONFile(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    return recordValue(parsed)
  } catch {
    return undefined
  }
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
