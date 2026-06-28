import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

const PROJECT_SOURCE_INTERPRET_ENDPOINT = '/v1/project/source/interpret'
const PROJECT_PROMPT_CONTEXT_ENDPOINT = '/v1/project/prompt/context'
const PROJECT_ENTITIES_QUERY_ENDPOINT = '/v1/project/entities/query'
const PROJECT_SETTINGS_QUERY_ENDPOINT = '/v1/project/settings/query'
const PROJECT_ASSETS_QUERY_ENDPOINT = '/v1/project/assets/query'
const PROJECT_CONTENT_WORKSPACE_SNAPSHOT_ENDPOINT = '/v1/project/content-workspace/snapshot'
const PROJECT_CONTENT_WORKSPACE_READ_ENDPOINT = '/v1/project/content-workspace/read'
const PROJECT_STANDARDS_UPSERT_ENDPOINT = '/v1/project/standards/upsert'
const PROJECT_SCRIPT_SOURCE_READ_ENDPOINT = '/v1/project/scripts/source/read'
const PROJECT_SCRIPT_UPSERT_ENDPOINT = '/v1/project/scripts/upsert'
const PROJECT_SETTING_UPSERT_ENDPOINT = '/v1/project/settings/upsert'
const PROJECT_SETTING_CREATE_ENDPOINT = '/v1/project/settings/create'
const PROJECT_SETTING_STATE_CREATE_ENDPOINT = '/v1/project/settings/states/create'
const PROJECT_ASSET_UPSERT_ENDPOINT = '/v1/project/assets/upsert'
const PROJECT_ASSET_CREATE_ENDPOINT = '/v1/project/assets/create'
const PROJECT_PRODUCTION_SNAPSHOT_SAVE_ENDPOINT = '/v1/project/productions/snapshot/save'
const PROJECT_CONTENT_UNIT_UPSERT_ENDPOINT = '/v1/project/content-units/upsert'
const PROJECT_CONTENT_UNIT_CREATE_ENDPOINT = '/v1/project/content-units/create'
const PROJECT_CONTENT_UNIT_ENSURE_ENDPOINT = '/v1/project/content-units/ensure'
const PROJECT_TIMELINE_ASSEMBLY_CONTENT_UNIT_ENSURE_ENDPOINT = '/v1/project/timeline-assemblies/content-unit/ensure'
const PROJECT_CONTENT_UNIT_EDIT_PROMPT_UPDATE_ENDPOINT = '/v1/project/content-units/edit-prompt/update'
const PROJECT_PRODUCTION_CREATE_ENDPOINT = '/v1/project/productions/create'
const PROJECT_SEGMENT_CREATE_ENDPOINT = '/v1/project/segments/create'
const PROJECT_SCENE_MOMENT_CREATE_ENDPOINT = '/v1/project/scene-moments/create'
const PROJECT_SCENE_MOMENT_SETTING_CONNECT_ENDPOINT = '/v1/project/scene-moments/settings/connect'
const PROJECT_EXPRESSION_UNIT_CREATE_ENDPOINT = '/v1/project/expression-units/create'
const PROJECT_EXPRESSION_UNIT_UPDATE_ENDPOINT = '/v1/project/expression-units/update'
const PROJECT_KEYFRAME_CREATE_ENDPOINT = '/v1/project/keyframes/create'
const PROJECT_STORYBOARD_CREATE_ENDPOINT = '/v1/project/storyboards/create'
const PROJECT_STORYBOARD_TIMELINE_UPDATE_ENDPOINT = '/v1/project/storyboards/timeline/update'
const PROJECT_AUDIO_CUE_CREATE_ENDPOINT = '/v1/project/audio-cues/create'
const PROJECT_AUDIO_CUE_UPDATE_ENDPOINT = '/v1/project/audio-cues/update'
const PROJECT_ENTITY_BASICS_UPDATE_ENDPOINT = '/v1/project/entities/basics/update'
const PROJECT_ENTITY_TRANSITION_UPDATE_ENDPOINT = '/v1/project/entities/transition/update'
const PROJECT_ENTITY_DELETE_ENDPOINT = '/v1/project/entities/delete'
const PROJECT_HIERARCHY_WRITE_ENDPOINT = '/v1/project/hierarchy/write'
const PROJECT_NAMESPACE_WRITE_ENDPOINT = '/v1/project/namespaces/write'
const PROJECT_CONTENT_CANVASES_LIST_ENDPOINT = '/v1/project/content-canvases/list'
const PROJECT_CONTENT_CANVAS_WRITE_ENDPOINT = '/v1/project/content-canvases/write'
const PROJECT_CONTENT_CANVAS_RENAME_ENDPOINT = '/v1/project/content-canvases/rename'
const PROJECT_CONTENT_CANVAS_RUN_ENDPOINT = '/v1/project/content-canvases/run'
const PROJECT_CONTENT_CANVAS_DELETE_ENDPOINT = '/v1/project/content-canvases/delete'
const PROJECT_WORKSPACE_CANDIDATE_SELECT_ENDPOINT = '/v1/project/workspace-candidates/select'
const PROJECT_WORKSPACE_CANDIDATE_APPEND_ENDPOINT = '/v1/project/workspace-candidates/append'
const PROJECT_WORKSPACE_ASSET_SLOT_CANDIDATE_CREATE_ENDPOINT = '/v1/project/workspace-candidates/asset-slots/create'
const PROJECT_WORKSPACE_KEYFRAME_CANDIDATE_CREATE_ENDPOINT = '/v1/project/workspace-candidates/keyframes/create'
const PROJECT_CONTENT_CANDIDATE_CREATE_ENDPOINT = '/v1/project/content-candidates/create'
const PROJECT_CONTENT_UNIT_CANDIDATE_SELECT_ENDPOINT = '/v1/project/content-unit-candidates/select'
const PROJECT_CONTENT_UNIT_CANDIDATE_DECIDE_ENDPOINT = '/v1/project/content-unit-candidates/decide'

export function createMovScriptEngineAPI(ipcRenderer: IpcRenderer): Pick<
  ElectronAPI,
  | 'loadMovScriptEngineContentWorkspaceSnapshot'
  | 'loadMovScriptEngineContentWorkspace'
  | 'queryMovScriptEngineWorkspaceEntities'
  | 'queryMovScriptEngineWorkspaceSettings'
  | 'queryMovScriptEngineWorkspaceAssets'
  | 'upsertMovScriptEngineWorkspaceSetting'
  | 'upsertMovScriptEngineWorkspaceAsset'
  | 'upsertMovScriptEngineWorkspaceScript'
  | 'readMovScriptEngineWorkspaceScriptSource'
  | 'readMovScriptEngineContentUnitGenerationPrompt'
  | 'buildMovScriptEngineContentUnitBackendPrompt'
  | 'deleteMovScriptEngineWorkspaceEntity'
  | 'saveMovScriptEngineWorkspaceProductionSnapshot'
  | 'upsertMovScriptEngineWorkspaceProjectStandards'
  | 'upsertMovScriptEngineWorkspaceContentUnit'
  | 'listMovScriptEngineContentCanvases'
  | 'writeMovScriptEngineContentCanvas'
  | 'renameMovScriptEngineContentCanvas'
  | 'runMovScriptEngineContentCanvas'
  | 'deleteMovScriptEngineContentCanvas'
  | 'createMovScriptEngineContentUnit'
  | 'ensureMovScriptEngineContentUnitForEntity'
  | 'ensureMovScriptEngineTimelineAssemblyContentUnit'
  | 'createMovScriptEngineSetting'
  | 'createMovScriptEngineSettingState'
  | 'createMovScriptEngineAsset'
  | 'updateMovScriptEngineEntityBasics'
  | 'connectMovScriptEngineSceneMomentSetting'
  | 'createMovScriptEngineProduction'
  | 'createMovScriptEngineSegment'
  | 'createMovScriptEngineSceneMoment'
  | 'createMovScriptEngineExpressionUnit'
  | 'createMovScriptEngineKeyframe'
  | 'createMovScriptEngineStoryboard'
  | 'selectMovScriptEngineWorkspaceCandidate'
  | 'appendMovScriptEngineWorkspaceCandidate'
  | 'createMovScriptEngineWorkspaceAssetSlotCandidate'
  | 'createMovScriptEngineWorkspaceKeyframeCandidate'
  | 'createMovScriptEngineContentCandidate'
  | 'selectMovScriptEngineContentUnitCandidate'
  | 'decideMovScriptEngineContentUnitCandidate'
  | 'updateMovScriptEngineContentUnitEditPrompt'
  | 'updateMovScriptEngineExpressionUnit'
  | 'updateMovScriptEngineAudioCue'
  | 'updateMovScriptEngineTransition'
  | 'updateMovScriptEngineStoryboardTimeline'
  | 'writeMovScriptEngineHierarchyNode'
  | 'syncMovScriptEngineContentWorkspace'
  | 'onMovScriptEngineWorkspaceUpdated'
> {
  return {
    loadMovScriptEngineContentWorkspaceSnapshot: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_CONTENT_WORKSPACE_SNAPSHOT_ENDPOINT, projectEnvelope(input), input),
    loadMovScriptEngineContentWorkspace: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_CONTENT_WORKSPACE_READ_ENDPOINT, projectEnvelope(input), input),
    queryMovScriptEngineWorkspaceEntities: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_ENTITIES_QUERY_ENDPOINT, queryInput(input), input),
    queryMovScriptEngineWorkspaceSettings: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_SETTINGS_QUERY_ENDPOINT, queryInput(input), input),
    queryMovScriptEngineWorkspaceAssets: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_ASSETS_QUERY_ENDPOINT, queryInput(input), input),
    upsertMovScriptEngineWorkspaceSetting: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_SETTING_UPSERT_ENDPOINT, payloadInput(input), input),
    upsertMovScriptEngineWorkspaceAsset: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_ASSET_UPSERT_ENDPOINT, payloadInput(input), input),
    upsertMovScriptEngineWorkspaceScript: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_SCRIPT_UPSERT_ENDPOINT, payloadInput(input), input),
    readMovScriptEngineWorkspaceScriptSource: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_SCRIPT_SOURCE_READ_ENDPOINT, payloadInput(input), input),
    readMovScriptEngineContentUnitGenerationPrompt: (input) => daemonProjectPromptContext(ipcRenderer, input, 'generationPrompt'),
    buildMovScriptEngineContentUnitBackendPrompt: async (input) => {
      const result = await daemonProjectPromptContext(ipcRenderer, input, 'backendPrompt')
      const record = recordValue(result)
      const output = optionalRecordValue(record.prompt)
        ? result
        : { ok: true as const, prompt: record }
      return output as Awaited<ReturnType<NonNullable<ElectronAPI['buildMovScriptEngineContentUnitBackendPrompt']>>>
    },
    deleteMovScriptEngineWorkspaceEntity: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_ENTITY_DELETE_ENDPOINT, payloadInput(input), input),
    saveMovScriptEngineWorkspaceProductionSnapshot: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_PRODUCTION_SNAPSHOT_SAVE_ENDPOINT, payloadInput(input), input),
    upsertMovScriptEngineWorkspaceProjectStandards: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_STANDARDS_UPSERT_ENDPOINT, payloadInput(input), input),
    upsertMovScriptEngineWorkspaceContentUnit: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_CONTENT_UNIT_UPSERT_ENDPOINT, payloadInput(input), input),
    listMovScriptEngineContentCanvases: (input) => daemonProjectContentCanvasRequest(ipcRenderer, PROJECT_CONTENT_CANVASES_LIST_ENDPOINT, input),
    writeMovScriptEngineContentCanvas: (input) => daemonProjectContentCanvasRequest(ipcRenderer, PROJECT_CONTENT_CANVAS_WRITE_ENDPOINT, input),
    renameMovScriptEngineContentCanvas: (input) => daemonProjectContentCanvasRequest(ipcRenderer, PROJECT_CONTENT_CANVAS_RENAME_ENDPOINT, input),
    runMovScriptEngineContentCanvas: (input) => daemonProjectContentCanvasRequest(ipcRenderer, PROJECT_CONTENT_CANVAS_RUN_ENDPOINT, input),
    deleteMovScriptEngineContentCanvas: (input) => daemonProjectContentCanvasRequest(ipcRenderer, PROJECT_CONTENT_CANVAS_DELETE_ENDPOINT, input),
    createMovScriptEngineContentUnit: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_CONTENT_UNIT_CREATE_ENDPOINT, payloadInput(input), input),
    ensureMovScriptEngineContentUnitForEntity: (input) => {
      const payload = payloadInput(input)
      return daemonProjectSourceOperation(
        ipcRenderer,
        isTimelineAssemblyContentUnitInput(payload) ? PROJECT_TIMELINE_ASSEMBLY_CONTENT_UNIT_ENSURE_ENDPOINT : PROJECT_CONTENT_UNIT_ENSURE_ENDPOINT,
        payload,
        input,
      )
    },
    ensureMovScriptEngineTimelineAssemblyContentUnit: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_TIMELINE_ASSEMBLY_CONTENT_UNIT_ENSURE_ENDPOINT, payloadInput(input), input),
    createMovScriptEngineSetting: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_SETTING_CREATE_ENDPOINT, payloadInput(input), input),
    createMovScriptEngineSettingState: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_SETTING_STATE_CREATE_ENDPOINT, payloadInput(input), input),
    createMovScriptEngineAsset: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_ASSET_CREATE_ENDPOINT, payloadInput(input), input),
    updateMovScriptEngineEntityBasics: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_ENTITY_BASICS_UPDATE_ENDPOINT, payloadInput(input), input),
    connectMovScriptEngineSceneMomentSetting: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_SCENE_MOMENT_SETTING_CONNECT_ENDPOINT, payloadInput(input), input),
    createMovScriptEngineProduction: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_PRODUCTION_CREATE_ENDPOINT, payloadInput(input), input),
    createMovScriptEngineSegment: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_SEGMENT_CREATE_ENDPOINT, payloadInput(input), input),
    createMovScriptEngineSceneMoment: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_SCENE_MOMENT_CREATE_ENDPOINT, payloadInput(input), input),
    createMovScriptEngineExpressionUnit: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_EXPRESSION_UNIT_CREATE_ENDPOINT, payloadInput(input), input),
    createMovScriptEngineKeyframe: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_KEYFRAME_CREATE_ENDPOINT, payloadInput(input), input),
    createMovScriptEngineStoryboard: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_STORYBOARD_CREATE_ENDPOINT, payloadInput(input), input),
    selectMovScriptEngineWorkspaceCandidate: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_WORKSPACE_CANDIDATE_SELECT_ENDPOINT, payloadInput(input), input),
    appendMovScriptEngineWorkspaceCandidate: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_WORKSPACE_CANDIDATE_APPEND_ENDPOINT, payloadInput(input), input),
    createMovScriptEngineWorkspaceAssetSlotCandidate: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_WORKSPACE_ASSET_SLOT_CANDIDATE_CREATE_ENDPOINT, payloadInput(input), input),
    createMovScriptEngineWorkspaceKeyframeCandidate: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_WORKSPACE_KEYFRAME_CANDIDATE_CREATE_ENDPOINT, payloadInput(input), input),
    createMovScriptEngineContentCandidate: (input) => daemonProjectCandidateAction(ipcRenderer, PROJECT_CONTENT_CANDIDATE_CREATE_ENDPOINT, stripProjectEnvelope(input), input),
    selectMovScriptEngineContentUnitCandidate: (input) => daemonProjectCandidateAction(ipcRenderer, PROJECT_CONTENT_UNIT_CANDIDATE_SELECT_ENDPOINT, stripProjectEnvelope(input), input),
    decideMovScriptEngineContentUnitCandidate: (input) => daemonProjectCandidateAction(ipcRenderer, PROJECT_CONTENT_UNIT_CANDIDATE_DECIDE_ENDPOINT, stripProjectEnvelope(input), input),
    updateMovScriptEngineContentUnitEditPrompt: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_CONTENT_UNIT_EDIT_PROMPT_UPDATE_ENDPOINT, stripProjectEnvelope(input), input),
    updateMovScriptEngineExpressionUnit: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_EXPRESSION_UNIT_UPDATE_ENDPOINT, stripProjectEnvelope(input), input),
    updateMovScriptEngineAudioCue: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_AUDIO_CUE_UPDATE_ENDPOINT, stripProjectEnvelope(input), input),
    updateMovScriptEngineTransition: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_ENTITY_TRANSITION_UPDATE_ENDPOINT, stripProjectEnvelope(input), input),
    updateMovScriptEngineStoryboardTimeline: (input) => daemonProjectSourceOperation(ipcRenderer, PROJECT_STORYBOARD_TIMELINE_UPDATE_ENDPOINT, stripProjectEnvelope(input), input),
    writeMovScriptEngineHierarchyNode: (input) => {
      const payload = stripProjectEnvelope(input)
      return daemonProjectSourceOperation(ipcRenderer, isNamespaceHierarchyNodeInput(payload) ? PROJECT_NAMESPACE_WRITE_ENDPOINT : PROJECT_HIERARCHY_WRITE_ENDPOINT, payload, input)
    },
    syncMovScriptEngineContentWorkspace: (input) => daemonProjectInterpretSource(ipcRenderer, input),
    onMovScriptEngineWorkspaceUpdated: (handler) => {
      const listener = (_event: unknown, event: Parameters<typeof handler>[0]) => handler(event)
      ipcRenderer.on('movscript:engine-workspace-updated', listener)
      return () => {
        ipcRenderer.removeListener('movscript:engine-workspace-updated', listener)
      }
    },
  }
}

async function daemonProjectContentCanvasRequest(
  ipcRenderer: IpcRenderer,
  endpoint: string,
  input: unknown,
): Promise<any> {
  const runtimeConfig = await ipcRenderer.invoke('app:get-runtime-config')
  return postDaemonProjectGateway(runtimeConfig, endpoint, {
    ...projectCommandEnvelope(input, runtimeConfig),
    ...recordValue(input),
  })
}

async function daemonProjectSourceOperation(
  ipcRenderer: IpcRenderer,
  endpoint: string,
  input: unknown,
  envelopeInput: unknown = input,
): Promise<any> {
  const runtimeConfig = await ipcRenderer.invoke('app:get-runtime-config')
  const payload = await postDaemonProjectGateway(runtimeConfig, endpoint, {
    ...projectCommandEnvelope(envelopeInput, runtimeConfig),
    ...recordValue(input),
  })
  return recordValue(payload).result ?? payload
}

async function daemonProjectPromptContext(
  ipcRenderer: IpcRenderer,
  input: unknown,
  field: 'generationPrompt' | 'backendPrompt',
): Promise<any> {
  const runtimeConfig = await ipcRenderer.invoke('app:get-runtime-config')
  const payload = await postDaemonProjectGateway(runtimeConfig, PROJECT_PROMPT_CONTEXT_ENDPOINT, {
    ...projectCommandEnvelope(input, runtimeConfig),
    contentUnitId: recordValue(input).contentUnitId ?? recordValue(input).content_unit_id,
  })
  return recordValue(payload)[field] ?? payload
}

async function daemonProjectInterpretSource(
  ipcRenderer: IpcRenderer,
  input: unknown,
): Promise<any> {
  const runtimeConfig = await ipcRenderer.invoke('app:get-runtime-config')
  const payload = await postDaemonProjectGateway(runtimeConfig, PROJECT_SOURCE_INTERPRET_ENDPOINT, {
    ...projectCommandEnvelope(input, runtimeConfig),
    ...projectEnvelope(input),
  })
  return recordValue(payload).interpretation ?? payload
}

async function daemonProjectCandidateAction(
  ipcRenderer: IpcRenderer,
  endpoint: string,
  input: unknown,
  envelopeInput: unknown = input,
): Promise<any> {
  const runtimeConfig = await ipcRenderer.invoke('app:get-runtime-config')
  const payload = await postDaemonProjectGateway(runtimeConfig, endpoint, {
    ...projectCommandEnvelope(envelopeInput, runtimeConfig),
    input: recordValue(input),
  })
  return candidateRecordFromResult(recordValue(payload).result ?? payload)
}

async function postDaemonProjectGateway(
  runtimeConfig: unknown,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${daemonGatewayBaseURL(runtimeConfig)}${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const record = recordValue(payload)
    const message = stringValue(record.message)
      ?? stringValue(record.error)
      ?? `Daemon Project Service request failed with HTTP ${response.status}`
    throw new Error(message)
  }
  return payload
}

function projectCommandEnvelope(input: unknown, runtimeConfig: unknown): Record<string, unknown> {
  const source = recordValue(input)
  const runtime = recordValue(runtimeConfig)
  const projectDir = stringValue(source.projectDir ?? source.project_dir)
  if (!projectDir) throw new Error('projectDir is required for daemon Project Service source commands')
  const movScriptHomeDir = stringValue(runtime.movScriptHomeDir ?? runtime.movscript_home_dir ?? runtime.workspaceDir ?? runtime.workspace_dir)
  const projectUid = stringValue(source.projectUid ?? source.project_uid)
  const orgId = source.orgId ?? source.org_id
  const userId = source.userId ?? source.user_id
  const scopeKind = stringValue(source.scopeKind ?? source.scope_kind)
    ?? (orgId !== undefined && orgId !== null ? 'org' : userId !== undefined && userId !== null ? 'user' : undefined)
  const scopeId = source.scopeId ?? source.scope_id ?? (scopeKind === 'org' ? orgId : scopeKind === 'user' ? userId : undefined)
  return {
    projectDir,
    ...(movScriptHomeDir ? { movScriptHomeDir, workspaceDir: movScriptHomeDir } : {}),
    ...(projectUid ? { projectUid } : {}),
    ...(scopeKind ? { scopeKind } : {}),
    ...(scopeId !== undefined && scopeId !== null ? { scopeId } : {}),
  }
}

function daemonGatewayBaseURL(runtimeConfig: unknown): string {
  const record = recordValue(runtimeConfig)
  const baseURL = stringValue(record.gatewayBaseURL)
    ?? stringValue(record.daemonGatewayBaseURL)
    ?? stringValue(record.apiBaseURL)
  if (!baseURL) throw new Error('Daemon gateway endpoint is not available in Desktop runtime config')
  return baseURL.replace(/\/+$/, '')
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function optionalRecordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function queryInput(input: unknown): Record<string, unknown> {
  return { query: recordValue(input).query }
}

function payloadInput(input: unknown): Record<string, unknown> {
  const record = recordValue(input)
  return optionalRecordValue(record.payload) ?? stripProjectEnvelope(record)
}

function projectEnvelope(input: unknown): Record<string, unknown> {
  const record = recordValue(input)
  return {
    ...(record.projectId !== undefined ? { projectId: record.projectId } : {}),
    ...(record.project_id !== undefined ? { project_id: record.project_id } : {}),
    ...(record.projectDir !== undefined ? { projectDir: record.projectDir } : {}),
    ...(record.project_dir !== undefined ? { project_dir: record.project_dir } : {}),
    ...(record.projectUid !== undefined ? { projectUid: record.projectUid } : {}),
    ...(record.project_uid !== undefined ? { project_uid: record.project_uid } : {}),
    ...(record.userId !== undefined ? { userId: record.userId } : {}),
    ...(record.user_id !== undefined ? { user_id: record.user_id } : {}),
    ...(record.orgId !== undefined ? { orgId: record.orgId } : {}),
    ...(record.org_id !== undefined ? { org_id: record.org_id } : {}),
  }
}

function stripProjectEnvelope(input: unknown): Record<string, unknown> {
  const record = recordValue(input)
  const {
    projectId: _projectId,
    project_id: _project_id,
    projectDir: _projectDir,
    project_dir: _project_dir,
    projectUid: _projectUid,
    project_uid: _project_uid,
    userId: _userId,
    user_id: _user_id,
    orgId: _orgId,
    org_id: _org_id,
    scopeKind: _scopeKind,
    scope_kind: _scope_kind,
    scopeId: _scopeId,
    scope_id: _scope_id,
    expectedWorkspaceVersions: _expectedWorkspaceVersions,
    expected_workspace_versions: _expected_workspace_versions,
    ...rest
  } = record
  return rest
}

function candidateRecordFromResult(result: unknown): unknown {
  const record = recordValue(result)
  return optionalRecordValue(record.record) ?? optionalRecordValue(record.candidate) ?? result
}

function isTimelineAssemblyContentUnitInput(input: Record<string, unknown>): boolean {
  const targetKind = stringValue(input.targetKind ?? input.target_kind)
  const contentUnitType = stringValue(input.contentUnitType ?? input.content_unit_type)
  const targetRef = stringValue(input.targetRef ?? input.target_ref)
  return targetKind === 'timeline_assembly'
    || contentUnitType === 'timeline_assembly_ref'
    || Boolean(targetRef?.startsWith('timeline_assembly:'))
}

function isNamespaceHierarchyNodeInput(input: Record<string, unknown>): boolean {
  const targetPath = stringValue(input.targetPath ?? input.target_path)
  const record = recordValue(input.record)
  if (!targetPath || !namespaceEntityKindFromPath(targetPath)) return false
  const category = stringValue(input.category ?? input.domainCategory ?? input.domain_category)
  if (category === 'timeline_namespace' || category === 'setting_namespace') return true
  return Boolean(stringValue(
    input.namespaceKind
    ?? input.namespace_kind
    ?? input.domainKind
    ?? input.domain_kind
    ?? record.namespace_kind
    ?? record.namespaceKind
    ?? record.timeline_namespace_kind
    ?? record.timelineNamespaceKind
    ?? record.setting_namespace_kind
    ?? record.settingNamespaceKind,
  ))
}

function namespaceEntityKindFromPath(path: string): string | undefined {
  if (path.endsWith('/production.json')) return 'production'
  if (path.endsWith('/segment.json')) return 'segment'
  if (path.endsWith('/setting.json')) return 'setting'
  if (path.endsWith('/setting_state.json')) return 'setting_state'
  return undefined
}
