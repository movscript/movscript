import type { SurfaceHostApi } from '@movscript/shared'

export interface LocalProjectContentAPIOptions {
  projectDir?: string
  projectId?: string | number
  projectUid?: string
  projectServiceBaseURL?: string
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
  const sourceCommand = (command: string, input: ProjectInput, useDecisionStore = true) => {
    const decisionStore = useDecisionStore ? decisionStoreConfig(input, options) : undefined
    return projectCommand({
      localEndpoint: '/local-api/project/source/command',
      servicePath: '/v1/project/source/command',
      projectServiceBaseURL: options.projectServiceBaseURL,
      body: {
        projectDir: projectDirFromInput(input, options),
        command,
        input,
        ...(decisionStore ? { decisionStore } : {}),
      },
    })
  }
  const candidateCommand = async (command: string, input: ProjectInput) => {
    const projectDir = projectDirFromInput(input, options)
    const decisionStore = await requiredDecisionStoreConfig(input, options, projectDir)
    return projectCommand({
      localEndpoint: '/local-api/project/candidates/command',
      servicePath: '/v1/project/candidates/command',
      projectServiceBaseURL: options.projectServiceBaseURL,
      body: {
        projectDir,
        command,
        input,
        decisionStore,
      },
    })
  }

  return {
    queryMovScriptEngineWorkspaceEntities: (input) => sourceCommand('queryEntities', { query: recordValue(input).query }),
    queryMovScriptEngineWorkspaceSettings: (input) => sourceCommand('querySettings', { query: recordValue(input).query }),
    queryMovScriptEngineWorkspaceAssets: (input) => sourceCommand('queryAssets', { query: recordValue(input).query }),
    readMovScriptEngineContentUnitGenerationPrompt: (input) => sourceCommand('readContentUnitGenerationPrompt', {
      contentUnitId: recordValue(input).contentUnitId,
    }),
    buildMovScriptEngineContentUnitBackendPrompt: async (input) => {
      const result = await sourceCommand('buildContentUnitBackendPrompt', {
        contentUnitId: recordValue(input).contentUnitId,
      })
      return isRecord(result) && isRecord(result.prompt)
        ? result as { ok?: boolean; prompt?: Record<string, unknown>; blockers?: unknown[] }
        : { ok: true, prompt: result as Record<string, unknown> }
    },
    loadMovScriptEngineContentWorkspaceSnapshot: (input) => sourceCommand('loadContentWorkspaceSnapshot', projectEnvelope(input)),
    loadMovScriptEngineContentWorkspace: (input) => sourceCommand('loadContentWorkspace', projectEnvelope(input)),
    createMovScriptEngineSetting: (input) => sourceCommand('createSetting', payloadInput(input)),
    createMovScriptEngineSettingState: (input) => sourceCommand('createSettingState', payloadInput(input)),
    createMovScriptEngineAsset: (input) => sourceCommand('createAsset', payloadInput(input)),
    updateMovScriptEngineEntityBasics: (input) => sourceCommand('updateEntityBasics', payloadInput(input)),
    deleteMovScriptEngineWorkspaceEntity: (input) => sourceCommand('deleteEntity', payloadInput(input)),
    connectMovScriptEngineSceneMomentSetting: (input) => sourceCommand('connectSceneMomentSetting', payloadInput(input)),
    createMovScriptEngineProduction: (input) => sourceCommand('createProduction', payloadInput(input)),
    createMovScriptEngineSegment: (input) => sourceCommand('createSegment', payloadInput(input)),
    createMovScriptEngineSceneMoment: (input) => sourceCommand('createSceneMoment', payloadInput(input)),
    createMovScriptEngineExpressionUnit: (input) => sourceCommand('createExpressionUnit', payloadInput(input)),
    createMovScriptEngineKeyframe: (input) => sourceCommand('createKeyframe', payloadInput(input)),
    createMovScriptEngineStoryboard: (input) => sourceCommand('createStoryboard', payloadInput(input)),
    ensureMovScriptEngineContentUnitForEntity: (input) => sourceCommand('ensureContentUnitForEntity', payloadInput(input)),
    createMovScriptEngineContentCandidate: async (input) => {
      const result = await candidateCommand('createContentCandidate', stripProjectEnvelope(input))
      return candidateRecordFromResult(result)
    },
    selectMovScriptEngineContentUnitCandidate: (input) => candidateCommand('selectContentUnitCandidate', stripProjectEnvelope(input)),
    updateMovScriptEngineContentUnitEditPrompt: (input) => sourceCommand('updateContentUnitEditPrompt', stripProjectEnvelope(input)),
    updateMovScriptEngineExpressionUnit: (input) => sourceCommand('updateExpressionUnit', stripProjectEnvelope(input)),
    updateMovScriptEngineAudioCue: (input) => sourceCommand('updateAudioCue', stripProjectEnvelope(input)),
    updateMovScriptEngineTransition: (input) => sourceCommand('updateEntityTransition', stripProjectEnvelope(input)),
    updateMovScriptEngineStoryboardTimeline: (input) => sourceCommand('updateStoryboardTimeline', stripProjectEnvelope(input)),
    writeMovScriptEngineHierarchyNode: (input) => sourceCommand('writeHierarchyNode', stripProjectEnvelope(input)),
    syncMovScriptEngineContentWorkspace: (input) => sourceCommand('syncContentWorkspace', projectEnvelope(input), false),
  }
}

async function projectCommand({
  localEndpoint,
  servicePath,
  projectServiceBaseURL,
  body,
}: {
  localEndpoint: string
  servicePath: string
  projectServiceBaseURL?: string
  body: Record<string, unknown>
}): Promise<unknown> {
  const url = projectServiceBaseURL ? `${projectServiceBaseURL}${servicePath}` : localEndpoint
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const record = recordValue(payload)
    const message = stringValue(record.message) ?? stringValue(record.error) ?? `Project Service request failed: ${response.status}`
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
    baseUrl: `${window.location.origin}/local-api/data`,
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
    localEndpoint: '/local-api/project/locator/resolve',
    servicePath: '/v1/project/locator/resolve',
    projectServiceBaseURL: options.projectServiceBaseURL,
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

function candidateRecordFromResult(result: unknown): unknown {
  const record = recordValue(result)
  return recordValue(record.record) ?? recordValue(record.candidate) ?? result
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
