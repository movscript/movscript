import type { SurfaceHostApi } from '@movscript/shared'

export interface LocalProjectContentAPIOptions {
  projectDir?: string
  projectId?: string | number
  projectUid?: string
}

type ProjectInput = Record<string, unknown>

export function ensureLocalProjectContentAPI(options: LocalProjectContentAPIOptions): SurfaceHostApi {
  const api = createLocalProjectContentAPI(options)
  const target = window as Window & { api?: SurfaceHostApi }
  target.api = {
    ...(target.api ?? {}),
    ...api,
  }
  return target.api
}

export function mergeLocalSurfaceHostAPI(api: SurfaceHostApi | undefined): void {
  if (!api) return
  const target = window as Window & { api?: SurfaceHostApi }
  target.api = {
    ...(target.api ?? {}),
    ...api,
  }
}

function createLocalProjectContentAPI(options: LocalProjectContentAPIOptions): SurfaceHostApi {
  const candidateAction = async (localEndpoint: string, input: ProjectInput) => {
    const projectDir = projectDirFromInput(input, options)
    const decisionStore = await requiredDecisionStoreConfig(input, options, projectDir)
    return projectCommand({
      localEndpoint,
      body: {
        projectDir,
        input,
        decisionStore,
      },
    })
  }
  const contentCanvasCommand = (localEndpoint: string, input: ProjectInput) => {
    const payload = contentCanvasProjectCommandInput(input)
    return projectCommand({
      localEndpoint,
      body: {
        ...payload,
        projectDir: projectDirFromInput(payload, options),
      },
    })
  }
  const projectSourceOperation = (localEndpoint: string, input: ProjectInput, useDecisionStore = true) => {
    const payload = payloadInput(input)
    const projectDir = projectDirFromInput({ ...recordValue(input), ...payload }, options)
    const decisionStore = useDecisionStore ? decisionStoreConfig(input, options) : undefined
    return projectCommand({
      localEndpoint,
      body: {
        ...payload,
        projectDir,
        ...(decisionStore ? { decisionStore } : {}),
      },
    })
  }
  const promptContext = async (input: ProjectInput, field: 'generationPrompt' | 'backendPrompt') => {
    const response = await projectCommand({
      localEndpoint: '/v1/project/prompt/context',
      body: {
        projectDir: projectDirFromInput(input, options),
        contentUnitId: recordValue(input).contentUnitId ?? recordValue(input).content_unit_id,
        ...localDecisionBody(input, options),
      },
    })
    return recordValue(response)[field] ?? response
  }

  return {
    queryMovScriptEngineWorkspaceEntities: (input) => projectSourceOperation('/v1/project/entities/query', { ...projectEnvelope(input), query: recordValue(input).query }),
    queryMovScriptEngineWorkspaceSettings: (input) => projectSourceOperation('/v1/project/settings/query', { ...projectEnvelope(input), query: recordValue(input).query }),
    queryMovScriptEngineWorkspaceAssets: (input) => projectSourceOperation('/v1/project/assets/query', { ...projectEnvelope(input), query: recordValue(input).query }),
    readMovScriptEngineWorkspaceScriptSource: (input) => projectSourceOperation('/v1/project/scripts/source/read', input) as Promise<string>,
    upsertMovScriptEngineWorkspaceScript: (input) => projectSourceOperation('/v1/project/scripts/upsert', input),
    readMovScriptEngineContentUnitGenerationPrompt: (input) => promptContext(input, 'generationPrompt'),
    buildMovScriptEngineContentUnitBackendPrompt: async (input) => {
      const result = await promptContext(input, 'backendPrompt')
      return isRecord(result) && isRecord(result.prompt)
        ? result as { ok?: boolean; prompt?: Record<string, unknown>; blockers?: unknown[] }
        : { ok: true, prompt: result as Record<string, unknown> }
    },
    loadMovScriptEngineContentWorkspaceSnapshot: (input) => projectSourceOperation('/v1/project/content-workspace/snapshot', projectEnvelope(input), false),
    loadMovScriptEngineContentWorkspace: (input) => projectSourceOperation('/v1/project/content-workspace/read', projectEnvelope(input), false),
    listMovScriptEngineContentCanvases: (input) => contentCanvasCommand('/v1/project/content-canvases/list', projectEnvelope(input)),
    writeMovScriptEngineContentCanvas: (input) => contentCanvasCommand('/v1/project/content-canvases/write', contentCanvasProjectCommandInput(input)),
    renameMovScriptEngineContentCanvas: (input) => contentCanvasCommand('/v1/project/content-canvases/rename', contentCanvasProjectCommandInput(input)),
    runMovScriptEngineContentCanvas: (input) => contentCanvasCommand('/v1/project/content-canvases/run', contentCanvasProjectCommandInput(input)),
    deleteMovScriptEngineContentCanvas: (input) => contentCanvasCommand('/v1/project/content-canvases/delete', contentCanvasProjectCommandInput(input)),
    createMovScriptEngineSetting: (input) => projectSourceOperation('/v1/project/settings/create', input),
    createMovScriptEngineSettingState: (input) => projectSourceOperation('/v1/project/settings/states/create', input),
    createMovScriptEngineAsset: (input) => projectSourceOperation('/v1/project/assets/create', input),
    updateMovScriptEngineEntityBasics: (input) => projectSourceOperation('/v1/project/entities/basics/update', input),
    deleteMovScriptEngineWorkspaceEntity: (input) => projectSourceOperation('/v1/project/entities/delete', input),
    connectMovScriptEngineSceneMomentSetting: (input) => projectSourceOperation('/v1/project/scene-moments/settings/connect', input),
    createMovScriptEngineProduction: (input) => projectSourceOperation('/v1/project/productions/create', input),
    createMovScriptEngineSegment: (input) => projectSourceOperation('/v1/project/segments/create', input),
    createMovScriptEngineSceneMoment: (input) => projectSourceOperation('/v1/project/scene-moments/create', input),
    createMovScriptEngineExpressionUnit: (input) => projectSourceOperation('/v1/project/expression-units/create', input),
    createMovScriptEngineKeyframe: (input) => projectSourceOperation('/v1/project/keyframes/create', input),
    createMovScriptEngineStoryboard: (input) => projectSourceOperation('/v1/project/storyboards/create', input),
    ensureMovScriptEngineContentUnitForEntity: (input) => {
      const payload = payloadInput(input)
      return projectSourceOperation(
        isTimelineAssemblyContentUnitInput(payload)
          ? '/v1/project/timeline-assemblies/content-unit/ensure'
          : '/v1/project/content-units/ensure',
        input,
      )
    },
    createMovScriptEngineContentCandidate: async (input) => {
      const result = await candidateAction('/v1/project/content-candidates/create', stripProjectEnvelope(input))
      return candidateRecordFromResult(result)
    },
    selectMovScriptEngineContentUnitCandidate: (input) => candidateAction('/v1/project/content-unit-candidates/select', stripProjectEnvelope(input)),
    decideMovScriptEngineContentUnitCandidate: (input) => candidateAction('/v1/project/content-unit-candidates/decide', stripProjectEnvelope(input)),
    updateMovScriptEngineContentUnitEditPrompt: (input) => projectSourceOperation('/v1/project/content-units/edit-prompt/update', input),
    updateMovScriptEngineExpressionUnit: (input) => projectSourceOperation('/v1/project/expression-units/update', input),
    updateMovScriptEngineAudioCue: (input) => projectSourceOperation('/v1/project/audio-cues/update', input),
    updateMovScriptEngineTransition: (input) => projectSourceOperation('/v1/project/entities/transition/update', input),
    updateMovScriptEngineStoryboardTimeline: (input) => projectSourceOperation('/v1/project/storyboards/timeline/update', input),
    writeMovScriptEngineHierarchyNode: (input) => {
      const payload = stripProjectEnvelope(input)
      return projectSourceOperation(isNamespaceHierarchyNodeInput(payload) ? '/v1/project/namespaces/write' : '/v1/project/hierarchy/write', input)
    },
    syncMovScriptEngineContentWorkspace: async (input) => {
      const response = await projectCommand({
        localEndpoint: '/v1/project/source/interpret',
        body: {
          ...projectEnvelope(input),
          projectDir: projectDirFromInput(recordValue(input), options),
        },
      })
      return recordValue(response).interpretation ?? response
    },
  }
}

function localDecisionBody(input: ProjectInput, options: LocalProjectContentAPIOptions): Record<string, unknown> {
  const decisionStore = decisionStoreConfig(input, options)
  return decisionStore ? { decisionStore } : {}
}

async function projectCommand({
  localEndpoint,
  body,
}: {
  localEndpoint: string
  body: Record<string, unknown>
}): Promise<unknown> {
  const response = await fetch(localEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const record = recordValue(payload)
    const message = stringValue(record.message) ?? stringValue(record.error) ?? `Project runtime request failed: ${response.status}`
    throw new Error(message)
  }
  return recordValue(payload).result ?? payload
}

function projectDirFromInput(input: ProjectInput, options: LocalProjectContentAPIOptions): string {
  const explicit = stringValue(input.projectDir ?? input.project_dir) ?? options.projectDir
  if (!explicit) throw new Error('projectDir is required for local project surface content API')
  return explicit
}

function decisionStoreConfig(input: ProjectInput, options: LocalProjectContentAPIOptions): Record<string, unknown> | undefined {
  const projectUid = stringValue(input.projectUid ?? input.project_uid)
    ?? options.projectUid
  if (!projectUid) return undefined
  return {
    kind: 'scoped-project-data',
    baseUrl: window.location.origin,
    projectUid,
    scopeKind: 'user',
    scopeId: 1,
  }
}

async function requiredDecisionStoreConfig(
  input: ProjectInput,
  options: LocalProjectContentAPIOptions,
  projectDir: string,
): Promise<Record<string, unknown>> {
  const decisionStore = decisionStoreConfig(input, options)
    ?? await inferDecisionStoreConfig(options, projectDir)
  if (!decisionStore) {
    throw new Error('projectUid is required for local project candidate writes')
  }
  return decisionStore
}

async function inferDecisionStoreConfig(
  options: LocalProjectContentAPIOptions,
  projectDir: string,
): Promise<Record<string, unknown> | undefined> {
  const locatorResponse = await projectCommand({
    localEndpoint: '/v1/project/locator/resolve',
    body: { projectDir },
  }).catch(() => undefined)
  const locator = recordValue(recordValue(locatorResponse).locator ?? locatorResponse)
  const projectUid = stringValue(locator.projectUid ?? locator.project_uid)
  return projectUid ? decisionStoreConfig({ projectUid }, options) : undefined
}

function payloadInput(input: unknown): ProjectInput {
  const record = recordValue(input)
  return recordValue(record.payload) ?? stripProjectEnvelope(record)
}

function projectEnvelope(input: unknown): ProjectInput {
  const record = recordValue(input)
  return {
    ...(record.projectId !== undefined ? { projectId: record.projectId } : {}),
    ...(record.projectDir !== undefined ? { projectDir: record.projectDir } : {}),
  }
}

function stripProjectEnvelope(input: unknown): ProjectInput {
  const record = recordValue(input)
  const {
    projectId: _projectId,
    project_id: _project_id,
    projectDir: _projectDir,
    project_dir: _project_dir,
    userId: _userId,
    user_id: _user_id,
    orgId: _orgId,
    org_id: _org_id,
    expectedWorkspaceVersions: _expectedWorkspaceVersions,
    expected_workspace_versions: _expected_workspace_versions,
    ...rest
  } = record
  return rest
}

function contentCanvasProjectCommandInput(input: unknown): ProjectInput {
  const record = recordValue(input)
  return {
    ...stripProjectEnvelope(record),
    ...(record.projectId !== undefined ? { projectId: record.projectId } : {}),
    ...(record.project_id !== undefined ? { project_id: record.project_id } : {}),
    ...(record.projectDir !== undefined ? { projectDir: record.projectDir } : {}),
    ...(record.project_dir !== undefined ? { project_dir: record.project_dir } : {}),
  }
}

function candidateRecordFromResult(result: unknown): unknown {
  const record = recordValue(result)
  return recordValue(record.record) ?? recordValue(record.candidate) ?? result
}

function isTimelineAssemblyContentUnitInput(input: ProjectInput): boolean {
  const targetKind = stringValue(input.targetKind ?? input.target_kind)
  const contentUnitType = stringValue(input.contentUnitType ?? input.content_unit_type)
  const targetRef = stringValue(input.targetRef ?? input.target_ref)
  return targetKind === 'timeline_assembly'
    || contentUnitType === 'timeline_assembly_ref'
    || Boolean(targetRef?.startsWith('timeline_assembly:'))
}

function isNamespaceHierarchyNodeInput(input: ProjectInput): boolean {
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

function recordValue(value: unknown): ProjectInput {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ProjectInput : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}
