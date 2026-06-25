import { createServer } from 'node:http'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import {
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
} from '@movscript/runtime-contracts'
import { createNodeMovScriptEngine } from '@movscript/engine/node'
import { buildContentUnitBackendPromptById } from '@movscript/prompt'
import {
  PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT,
  PROJECT_SERVICE_CAPABILITIES_ENDPOINT,
  PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT,
  PROJECT_SERVICE_NAME,
  PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT,
  PROJECT_SERVICE_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT,
  PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INSPECT_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT,
  PROJECT_SERVICE_SOURCE_OVERVIEW_ENDPOINT,
  PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT,
  PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT,
} from '@movscript/project'
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
  buildContentSourceWorkspaceData,
  loadContentSourceWorkspaceSnapshotFromEngine,
} from '@movscript/core'

const DATA_SERVICE_NAME = 'movscript.data.service'

export {
  PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT,
  PROJECT_SERVICE_CAPABILITIES_ENDPOINT,
  PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT,
  PROJECT_SERVICE_NAME,
  PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT,
  PROJECT_SERVICE_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT,
  PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INSPECT_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT,
  PROJECT_SERVICE_SOURCE_OVERVIEW_ENDPOINT,
  PROJECT_SERVICE_SOURCE_REGENERATION_PLAN_ENDPOINT,
  PROJECT_SERVICE_SOURCE_SNAPSHOT_ENDPOINT,
} from '@movscript/project'

export const PROJECT_SERVICE_CAPABILITIES = Object.freeze([
  'project-read-model',
  'project-lifecycle',
  'project-locator',
  'project-resource-view',
  'domain-source',
  'candidate-view',
  'prompt-context',
  'interpret',
])

export function createProjectServiceHandler(options = {}) {
  const serviceName = options.serviceName ?? PROJECT_SERVICE_NAME
  const capabilities = options.capabilities ?? PROJECT_SERVICE_CAPABILITIES
  const now = options.now ?? (() => new Date())
  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    try {
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
        const items = await readProjectResourceView({ projectDir, kind })
        writeJSON(response, 200, {
          schema: 'movscript.project-resource-view.v1',
          projectDir,
          kind,
          items,
        })
        return
      }
      if (request.method === 'POST' && url.pathname === PROJECT_SERVICE_CANDIDATE_COMMAND_ENDPOINT) {
        const body = await readJSONBody(request)
        const projectDir = projectDirFromBody(body)
        const command = stringValue(body.command)
        if (!command) {
          throw httpError(400, 'project_candidate_command_required', 'command is required')
        }
        const result = await executeProjectCandidateCommand({
          projectDir,
          command,
          input: recordValue(body.input) ?? {},
          decisionStore: decisionStoreFromBody(body),
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
        const decisionStore = decisionStoreFromBody(body)
        const contexts = await readCandidateContexts(decisionStore, contentUnitIds)
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
        const contentUnitId = contentUnitIdFromBody(body)
        const promptContext = await readProjectPromptContext({
          projectDir,
          contentUnitId,
          decisionStore: await optionalDecisionStoreFromBody(body, projectDir),
        })
        writeJSON(response, 200, {
          schema: 'movscript.project-prompt-context.v1',
          projectDir,
          contentUnitId,
          ...promptContext,
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
  const runtime = await startProjectService({ host, port })
  process.stdout.write(JSON.stringify({
    serviceName: PROJECT_SERVICE_NAME,
    url: runtime.url,
  }) + '\n')
  await waitForShutdown(runtime)
}

function writeJSON(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

async function readProjectSourceContext(request) {
  const body = await readJSONBody(request)
  const projectDir = projectDirFromBody(body)
  return {
    projectDir,
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

async function executeProjectSourceCommand({ projectDir, command, input, decisionStore }) {
  const engine = createNodeMovScriptEngine({ projectDir, ...(decisionStore ? { decisionStore } : {}) })
  switch (command) {
    case 'queryEntities':
      return engine.workspaceService.queryEntities(input.query)
    case 'querySettings':
      return engine.workspaceService.querySettings(input.query)
    case 'queryAssets':
      return engine.workspaceService.queryAssets(input.query)
    case 'readContentUnitGenerationPrompt':
      return engine.workspaceService.readContentUnitGenerationPrompt(requiredContentUnitId(input))
    case 'buildContentUnitBackendPrompt':
      return engine.buildContentUnitBackendPrompt(requiredContentUnitId(input))
    case 'loadContentWorkspaceSnapshot':
      return loadContentSourceWorkspaceSnapshotFromEngine(engine)
    case 'loadContentWorkspace':
      return buildContentSourceWorkspaceData(await loadContentSourceWorkspaceSnapshotFromEngine(engine))
    case 'upsertProjectStandards':
      return engine.workspaceService.upsertProjectStandards(input)
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
    case 'createContentUnit':
      return engine.createContentUnit(input)
    case 'ensureContentUnitForEntity':
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

async function readProjectReadModel(context, now) {
  const [
    overview,
    source,
    inspection,
  ] = await Promise.all([
    overviewMovScriptWorkspace({
      fileRepository: context.fileRepository,
      decisionStore: context.decisionStore,
      now,
    }),
    context.readModelOptions.includeSource
      ? resolveWorkspaceSource(context.fileRepository, context.sourceOptions)
      : undefined,
    context.readModelOptions.includeInspection
      ? inspectMovScriptWorkspace({
        fileRepository: context.fileRepository,
        decisionStore: context.decisionStore,
        now,
        ...context.inspectOptions,
      })
      : undefined,
  ])
  return {
    schema: 'movscript.project-read-model.v1',
    status: overview.status,
    workspace: overview.workspace,
    sourceSummary: overview.source,
    productionSummary: overview.production,
    contentSummary: overview.content,
    readiness: overview.readiness,
    overview,
    ...(source ? { source } : {}),
    ...(inspection ? { inspection } : {}),
  }
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

async function readProjectResourceView({ projectDir, kind }) {
  const engine = createNodeMovScriptEngine({ projectDir })
  if (kind === 'scripts') {
    const scripts = await engine.workspaceService.queryEntities({ entityKind: 'script' })
    return Promise.all(scripts.map(async (entity) => ({
      ...entity.record,
      entityKind: entity.entityKind,
      path: entity.path,
      source: await engine.workspaceService.readScriptSource({ record: entity.record, entity }),
    })))
  }
  if (kind === 'script-versions') {
    const versions = await engine.workspaceService.queryEntities({ entityKind: 'script_version' })
    return versions.map((entity) => ({
      ...entity.record,
      entityKind: entity.entityKind,
      path: entity.path,
    }))
  }

  const entityKind = projectResourceEntityKind(kind)
  const entities = await engine.workspaceService.queryEntities({
    entityKind,
    ...(entityKind === 'project' ? { limit: 1 } : {}),
  })
  return entities.map((entity) => ({
    ...entity.record,
    entityKind: entity.entityKind,
    path: entity.path,
  }))
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
  const engine = createNodeMovScriptEngine({ projectDir, decisionStore })
  switch (command) {
    case 'createContentCandidate':
      return engine.createContentCandidate(input)
    case 'selectContentUnitCandidate':
      return engine.selectContentUnitCandidate(input)
    case 'decideContentUnitCandidate':
      return engine.workspaceService.decideContentUnitCandidate(input)
    default:
      throw httpError(400, 'project_candidate_command_unsupported', `unsupported project candidate command: ${command}`)
  }
}

async function readCandidateContexts(decisionStore, contentUnitIds) {
  if (contentUnitIds.length === 1) {
    const context = await decisionStore.getContentUnitDecision({ contentUnitId: contentUnitIds[0] })
    return context ? [normalizeDecisionContext(context)] : []
  }
  const contexts = await decisionStore.getContentUnitDecisions({ contentUnitIds })
  return contentUnitIds
    .map((contentUnitId) => contexts.get(String(contentUnitId)))
    .filter(Boolean)
    .map((context) => normalizeDecisionContext(context))
}

async function readProjectPromptContext({ projectDir, contentUnitId, decisionStore }) {
  const workspaceService = createNodeMovScriptWorkspaceService({ projectDir, ...(decisionStore ? { decisionStore } : {}) })
  const index = await workspaceService.loadIndex()
  const decisionProvider = decisionStore ?? missingDecisionProvider()
  const [
    runtimePanel,
    generationPrompt,
    dependencyReport,
    selectionValidity,
    backendPrompt,
  ] = await Promise.all([
    workspaceService.readContentUnitRuntimePanel(contentUnitId),
    workspaceService.readContentUnitGenerationPrompt(contentUnitId),
    workspaceService.readContentUnitDependencyReport(contentUnitId),
    workspaceService.readContentUnitSelectionValidity(contentUnitId),
    buildContentUnitBackendPromptById({
      index,
      contentUnitId,
      decisionProvider,
    }),
  ])
  return {
    ...(runtimePanel ? { runtimePanel } : {}),
    ...(generationPrompt ? { generationPrompt } : {}),
    ...(dependencyReport ? { dependencyReport } : {}),
    ...(selectionValidity ? { selectionValidity } : {}),
    backendPrompt,
  }
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
  const scopeId = stringValue(body.scopeId ?? body.scope_id)
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
  const endpoint = findRuntimeEndpoint(snapshot, DATA_SERVICE_NAME)
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

function recordValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function stringRecord(value) {
  const record = recordValue(value)
  if (!record) return {}
  return Object.fromEntries(Object.entries(record)
    .filter(([, item]) => typeof item === 'string')
    .map(([key, item]) => [key, item]))
}

function httpError(statusCode, code, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

function writeProjectServiceError(response, error) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500
  writeJSON(response, statusCode, {
    error: error?.code ?? 'project_service_error',
    message: error?.message ?? 'project service error',
  })
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
