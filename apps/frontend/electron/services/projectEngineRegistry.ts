import { resolveMovScriptProjectCwd } from '@movscript/core/workspace/node'
import { resolveMovScriptBackendSession } from '@movscript/core/backend/node'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  buildContentSourceWorkspaceData,
  loadContentSourceWorkspaceSnapshotFromEngine,
  type ContentCandidateRecord,
  type ContentSourceWorkspaceData,
  type ContentSourceWorkspaceSnapshot,
} from '@movscript/core/content'
import {
  createNodeMovScriptEngine,
  type NodeMovScriptEngine,
  NodeMovScriptEngineRegistry,
} from '@movscript/engine/node'
import type { MovScriptEngineContentUnitInput } from '@movscript/engine'
import { createMovScriptBackendDecisionStore } from '@movscript/workspace/repository'
import type { MovScriptWorkspaceService } from '@movscript/workspace'

import type {
  ElectronMovScriptEngineAudioCueInput,
  ElectronMovScriptEngineAssetCreateInput,
  ElectronMovScriptEngineContentCandidateCreateInput,
  ElectronMovScriptEngineContentCandidateSelectInput,
  ElectronMovScriptEngineContentUnitBackendPromptBuildInput,
  ElectronMovScriptEngineContentUnitCreateInput,
  ElectronMovScriptEngineContentUnitEnsureInput,
  ElectronMovScriptEngineContentUnitEditPromptInput,
  ElectronMovScriptEngineContentUnitGenerationPromptReadInput,
  ElectronMovScriptEngineEntityBasicsUpdateInput,
  ElectronMovScriptEngineExpressionUnitCreateInput,
  ElectronMovScriptEngineExpressionUnitInput,
  ElectronMovScriptEngineHierarchyNodeWriteInput,
  ElectronMovScriptEngineKeyframeInput,
  ElectronMovScriptEngineProductionCreateInput,
  ElectronMovScriptEngineProjectInput,
  ElectronMovScriptEngineSceneMomentCreateInput,
  ElectronMovScriptEngineSceneMomentSettingConnectInput,
  ElectronMovScriptEngineSegmentCreateInput,
  ElectronMovScriptEngineSettingCreateInput,
  ElectronMovScriptEngineSettingStateCreateInput,
  ElectronMovScriptEngineStoryboardInput,
  ElectronMovScriptEngineStoryboardTimelineInput,
  ElectronMovScriptEngineTransitionInput,
  ElectronMovScriptEngineWorkspaceCandidateCreateInput,
  ElectronMovScriptEngineWorkspaceDeleteEntityInput,
  ElectronMovScriptEngineWorkspaceQueryAssetsInput,
  ElectronMovScriptEngineWorkspaceQueryEntitiesInput,
  ElectronMovScriptEngineWorkspaceQuerySettingsInput,
  ElectronMovScriptEngineWorkspaceReadScriptSourceInput,
  ElectronMovScriptEngineWorkspaceSaveProductionSnapshotInput,
  ElectronMovScriptEngineWorkspaceAppendCandidateInput,
  ElectronMovScriptEngineWorkspaceSelectCandidateInput,
  ElectronMovScriptEngineWorkspaceUpsertAssetInput,
  ElectronMovScriptEngineWorkspaceUpsertContentUnitInput,
  ElectronMovScriptEngineWorkspaceUpsertProjectStandardsInput,
  ElectronMovScriptEngineWorkspaceUpsertScriptInput,
  ElectronMovScriptEngineWorkspaceUpsertSettingInput,
  ElectronMovScriptEngineWorkspaceUpdatedEvent,
} from '../../src/shared/contracts/electronApi'
import { resolveMovScriptHomeDir } from './movscriptHomeInput'
import { resolveDesktopWorkspaceContextPaths } from './workspaceRealm'

type NormalizedProjectEngineInput = {
  workspaceDir: string
  realm: { kind: 'local' | 'cloud'; id: string }
  userId?: number | string
  orgId?: number | string
  projectId?: number | string
}

class ProjectEngineRegistry {
  private readonly engines = new NodeMovScriptEngineRegistry((input) => {
    const context = engineContextByCacheKey.get(input.cacheKey ?? '')
    if (!context) return createNodeMovScriptEngine(input)
    return projectEngineFactoryForTest?.(context) ?? createNodeMovScriptEngine(input)
  })

  get(input?: ElectronMovScriptEngineProjectInput): NodeMovScriptEngine {
    const context = normalizeProjectEngineInput(input)
    const key = projectEngineKey(context)
    const session = resolveMovScriptBackendSession({
      workspaceDir: context.workspaceDir,
      realm: context.realm,
      ...(context.userId !== undefined ? { userId: context.userId } : {}),
    })
    engineContextByCacheKey.set(key, context)
    return this.engines.get({
      cacheKey: key,
      projectDir: resolveMovScriptProjectCwd(context),
      ...(context.projectId !== undefined
        ? {
            decisionStore: createMovScriptBackendDecisionStore({
              baseUrl: session.baseURL,
              projectId: context.projectId,
              ...(session.token ? { token: session.token } : {}),
              ...backendDecisionStoreHeaders(context, session.userId),
            }),
          }
        : {}),
    })
  }

  invalidate(input?: ElectronMovScriptEngineProjectInput): void {
    const key = projectEngineKey(normalizeProjectEngineInput(input))
    this.engines.invalidate(key)
    engineContextByCacheKey.delete(key)
  }

  clear(): void {
    this.engines.clear()
    engineContextByCacheKey.clear()
  }
}

export const projectEngineRegistry = new ProjectEngineRegistry()
const engineContextByCacheKey = new Map<string, NormalizedProjectEngineInput>()
const projectOperationQueues = new Map<string, Promise<void>>()
let workspaceUpdateSequence = 0
let workspaceUpdatedBroadcaster: (event: ElectronMovScriptEngineWorkspaceUpdatedEvent) => void = broadcastProjectWorkspaceUpdated

let projectEngineFactoryForTest:
  | ((context: NormalizedProjectEngineInput) => NodeMovScriptEngine)
  | undefined

export function __setProjectEngineFactoryForTest(
  factory: ((context: NormalizedProjectEngineInput) => NodeMovScriptEngine) | undefined,
): () => void {
  const previous = projectEngineFactoryForTest
  projectEngineFactoryForTest = factory
  projectEngineRegistry.clear()
  return () => {
    projectEngineFactoryForTest = previous
    projectEngineRegistry.clear()
  }
}

export function __setProjectEngineWorkspaceUpdatedBroadcasterForTest(
  broadcaster: ((event: ElectronMovScriptEngineWorkspaceUpdatedEvent) => void) | undefined,
): () => void {
  const previous = workspaceUpdatedBroadcaster
  workspaceUpdatedBroadcaster = broadcaster ?? broadcastProjectWorkspaceUpdated
  return () => {
    workspaceUpdatedBroadcaster = previous
  }
}

export async function loadMovScriptEngineContentWorkspaceSnapshot(
  input: ElectronMovScriptEngineProjectInput,
): Promise<ContentSourceWorkspaceSnapshot> {
  const context = normalizeProjectEngineInput(input)
  const snapshot = await loadContentSourceWorkspaceSnapshotFromEngine(projectEngineRegistry.get(input))
  console.log('[movscript-engine] load content workspace snapshot', {
    projectId: input.projectId,
    movScriptHomeDir: context.workspaceDir,
    workspaceDir: context.workspaceDir,
    userId: input.userId,
    orgId: input.orgId,
    contentUnits: snapshot.contentUnits.length,
    indexDocuments: snapshot.indexDocuments.length,
    contentCandidateDocuments: snapshot.indexDocuments.filter((document) => document.path.endsWith('/content_candidate.json')).map((document) => ({
      path: document.path,
      id: isRecord(document.data) ? document.data.id : undefined,
      contentUnitRef: isRecord(document.data) ? document.data.content_unit_ref : undefined,
      status: isRecord(document.data) ? document.data.status : undefined,
    })),
    decisionContextDocuments: snapshot.indexDocuments.filter((document) => document.path.endsWith('/decision_context.json')).map((document) => ({
      path: document.path,
      targetRef: isRecord(document.data) ? document.data.target_ref : undefined,
      candidateCount: isRecord(document.data) && Array.isArray(document.data.candidates) ? document.data.candidates.length : undefined,
    })),
  })
  return snapshot
}

export async function loadMovScriptEngineContentWorkspace(
  input: ElectronMovScriptEngineProjectInput,
): Promise<ContentSourceWorkspaceData> {
  const snapshot = await loadMovScriptEngineContentWorkspaceSnapshot(input)
  const data = buildContentSourceWorkspaceData(snapshot)
  console.log('[movscript-engine] build content workspace data', {
    projectId: input.projectId,
    userId: input.userId,
    orgId: input.orgId,
    previewMoments: data.previewMoments.length,
    previewExpressionUnitCandidates: data.previewMoments.flatMap((moment) => moment.expressionUnits).map((expressionUnit) => ({
      contentUnitId: expressionUnit.contentUnit.id,
      candidateCount: expressionUnit.contentUnit.candidates.length,
      candidateIds: expressionUnit.contentUnit.candidates.map((candidate) => candidate.id),
    })).filter((row) => row.candidateCount > 0),
    contentUnitCandidates: Object.entries(data.contentUnitCandidates).map(([contentUnitId, candidates]) => ({
      contentUnitId,
      candidateCount: candidates.length,
      candidateIds: candidates.map((candidate) => candidate.id),
    })).filter((row) => row.candidateCount > 0),
    assetReferenceCandidates: Object.values(data.assetReferenceUnits).map((unit) => ({
      contentUnitId: unit.contentUnitId,
      assetId: unit.assetId,
      candidateCount: unit.candidates.length,
      candidateIds: unit.candidates.map((candidate) => candidate.id),
    })).filter((row) => row.candidateCount > 0),
  })
  return data
}

export async function queryMovScriptEngineWorkspaceEntities(
  input: ElectronMovScriptEngineWorkspaceQueryEntitiesInput,
) {
  return projectEngineRegistry.get(input).workspaceService.queryEntities(input.query)
}

export async function queryMovScriptEngineWorkspaceSettings(
  input: ElectronMovScriptEngineWorkspaceQuerySettingsInput,
) {
  return projectEngineRegistry.get(input).workspaceService.querySettings(input.query)
}

export async function queryMovScriptEngineWorkspaceAssets(
  input: ElectronMovScriptEngineWorkspaceQueryAssetsInput,
) {
  return projectEngineRegistry.get(input).workspaceService.queryAssets(input.query)
}

export async function upsertMovScriptEngineWorkspaceSetting(
  input: ElectronMovScriptEngineWorkspaceUpsertSettingInput,
) {
  return workspaceMutation(input, (engine) => engine.workspaceService.upsertSetting(input.payload))
}

export async function upsertMovScriptEngineWorkspaceAsset(
  input: ElectronMovScriptEngineWorkspaceUpsertAssetInput,
) {
  return workspaceMutation(input, (engine) => engine.workspaceService.upsertAsset(input.payload))
}

export async function upsertMovScriptEngineWorkspaceScript(
  input: ElectronMovScriptEngineWorkspaceUpsertScriptInput,
) {
  return workspaceMutation(input, (engine) => engine.workspaceService.upsertScript(input.payload))
}

export async function readMovScriptEngineWorkspaceScriptSource(
  input: ElectronMovScriptEngineWorkspaceReadScriptSourceInput,
) {
  return projectEngineRegistry.get(input).workspaceService.readScriptSource(input.payload)
}

export async function readMovScriptEngineContentUnitGenerationPrompt(
  input: ElectronMovScriptEngineContentUnitGenerationPromptReadInput,
) {
  return projectEngineRegistry.get(input).workspaceService.readContentUnitGenerationPrompt(input.contentUnitId)
}

export async function buildMovScriptEngineContentUnitBackendPrompt(
  input: ElectronMovScriptEngineContentUnitBackendPromptBuildInput,
) {
  const result = await projectEngineRegistry.get(input).buildContentUnitBackendPrompt(input.contentUnitId)
  console.info('[movscript-engine] build content unit backend prompt', JSON.stringify({
    projectId: input.projectId,
    userId: input.userId,
    orgId: input.orgId,
    contentUnitId: input.contentUnitId,
    ok: result.ok,
    resourceIds: result.prompt.resource_ids,
    refs: result.prompt.refs,
    blockers: result.ok ? [] : result.blockers,
    textPreview: typeof result.prompt.text === 'string' ? result.prompt.text.slice(0, 240) : undefined,
  }))
  return result
}

export async function deleteMovScriptEngineWorkspaceEntity(
  input: ElectronMovScriptEngineWorkspaceDeleteEntityInput,
): Promise<void> {
  await workspaceMutation(input, (engine) => engine.workspaceService.deleteEntity(input.payload))
}

export async function saveMovScriptEngineWorkspaceProductionSnapshot(
  input: ElectronMovScriptEngineWorkspaceSaveProductionSnapshotInput,
) {
  return workspaceMutation(input, (engine) => engine.saveProductionSnapshot(input.payload))
}

export async function upsertMovScriptEngineWorkspaceProjectStandards(
  input: ElectronMovScriptEngineWorkspaceUpsertProjectStandardsInput,
) {
  return workspaceMutation(input, (engine) => engine.workspaceService.upsertProjectStandards(input.payload))
}

export async function upsertMovScriptEngineWorkspaceContentUnit(
  input: ElectronMovScriptEngineWorkspaceUpsertContentUnitInput,
) {
  return workspaceMutation(input, (engine) => engine.createContentUnit(contentUnitInputFromWorkspacePayload(input.payload)))
}

export async function createMovScriptEngineContentUnit(
  input: ElectronMovScriptEngineContentUnitCreateInput,
) {
  return workspaceMutation(input, (engine) => engine.createContentUnit(input.payload), 'source-updated')
}

export async function ensureMovScriptEngineContentUnitForEntity(
  input: ElectronMovScriptEngineContentUnitEnsureInput,
) {
  return workspaceMutation(input, (engine) => engine.ensureContentUnitForEntity(input.payload), 'source-updated')
}

export async function createMovScriptEngineSetting(
  input: ElectronMovScriptEngineSettingCreateInput,
) {
  return workspaceMutation(input, (engine) => engine.createSetting(input.payload), 'source-updated')
}

export async function createMovScriptEngineSettingState(
  input: ElectronMovScriptEngineSettingStateCreateInput,
) {
  return workspaceMutation(input, (engine) => engine.createSettingState(input.payload), 'source-updated')
}

export async function createMovScriptEngineAsset(
  input: ElectronMovScriptEngineAssetCreateInput,
) {
  return workspaceMutation(input, (engine) => engine.createAsset(input.payload), 'source-updated')
}

export async function updateMovScriptEngineEntityBasics(
  input: ElectronMovScriptEngineEntityBasicsUpdateInput,
) {
  return workspaceMutation(input, (engine) => engine.updateEntityBasics(input.payload), 'source-updated')
}

export async function connectMovScriptEngineSceneMomentSetting(
  input: ElectronMovScriptEngineSceneMomentSettingConnectInput,
) {
  return workspaceMutation(input, (engine) => engine.connectSceneMomentSetting(input.payload), 'source-updated')
}

export async function createMovScriptEngineProduction(
  input: ElectronMovScriptEngineProductionCreateInput,
) {
  return workspaceMutation(input, (engine) => engine.createProduction(input.payload), 'source-updated')
}

export async function createMovScriptEngineSegment(
  input: ElectronMovScriptEngineSegmentCreateInput,
) {
  return workspaceMutation(input, (engine) => engine.createSegment(input.payload), 'source-updated')
}

export async function createMovScriptEngineSceneMoment(
  input: ElectronMovScriptEngineSceneMomentCreateInput,
) {
  return workspaceMutation(input, (engine) => engine.createSceneMoment(input.payload), 'source-updated')
}

export async function createMovScriptEngineExpressionUnit(
  input: ElectronMovScriptEngineExpressionUnitCreateInput,
) {
  return workspaceMutation(input, (engine) => engine.createExpressionUnit(input.payload), 'source-updated')
}

export async function createMovScriptEngineKeyframe(
  input: ElectronMovScriptEngineKeyframeInput,
) {
  return workspaceMutation(input, (engine) => engine.createKeyframe(input.payload), 'source-updated')
}

export async function createMovScriptEngineStoryboard(
  input: ElectronMovScriptEngineStoryboardInput,
) {
  return workspaceMutation(input, (engine) => engine.createStoryboard(input.payload), 'source-updated')
}

export async function selectMovScriptEngineWorkspaceCandidate(
  input: ElectronMovScriptEngineWorkspaceSelectCandidateInput,
) {
  return workspaceMutation(input, (engine) => engine.workspaceService.selectCandidate(input.payload))
}

export async function appendMovScriptEngineWorkspaceCandidate(
  input: ElectronMovScriptEngineWorkspaceAppendCandidateInput,
) {
  return workspaceMutation(input, (engine) => engine.workspaceService.appendCandidate(input.payload))
}

export async function createMovScriptEngineWorkspaceAssetSlotCandidate(
  input: ElectronMovScriptEngineWorkspaceCandidateCreateInput,
) {
  return workspaceMutation(input, (engine) => engine.workspaceService.createAssetSlotCandidate(input.payload))
}

export async function createMovScriptEngineWorkspaceKeyframeCandidate(
  input: ElectronMovScriptEngineWorkspaceCandidateCreateInput,
) {
  return workspaceMutation(input, (engine) => engine.workspaceService.createKeyframeCandidate(input.payload))
}

export async function createMovScriptEngineContentCandidate(
  input: ElectronMovScriptEngineContentCandidateCreateInput,
): Promise<ContentCandidateRecord> {
  return workspaceMutation(input, async (engine) => {
    const context = normalizeProjectEngineInput(input)
    console.log('[movscript-engine] create content candidate backend request', {
      projectId: input.projectId,
      movScriptHomeDir: context.workspaceDir,
      workspaceDir: context.workspaceDir,
      userId: input.userId,
      orgId: input.orgId,
      contentUnitId: input.contentUnitId,
      candidateId: input.candidateId,
      source: input.source,
      status: input.status,
      outputs: input.outputs,
    })
    const result = await engine.createContentCandidate({
      contentUnitId: input.contentUnitId,
      candidateId: input.candidateId,
      source: input.source,
      status: input.status,
      producer: input.producer,
      outputs: input.outputs,
      promptSnapshot: input.promptSnapshot,
      createdAt: input.createdAt,
    })
    console.log('[movscript-engine] create content candidate backend saved', {
      projectId: input.projectId,
      userId: input.userId,
      orgId: input.orgId,
      contentUnitId: input.contentUnitId,
      candidateId: result.record.id,
      source: result.record.source,
      status: result.record.status,
      outputs: result.record.outputs,
    })
    return result.record as ContentCandidateRecord
  }, 'content-candidate-created')
}

export async function selectMovScriptEngineContentUnitCandidate(
  input: ElectronMovScriptEngineContentCandidateSelectInput,
): Promise<void> {
  await workspaceMutation(input, (engine) => engine.selectContentUnitCandidate({
    contentUnitId: input.contentUnitId,
    candidateId: input.candidateId,
    ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
    reason: input.reason,
  }), 'content-candidate-selected')
}

export async function updateMovScriptEngineContentUnitEditPrompt(
  input: ElectronMovScriptEngineContentUnitEditPromptInput,
): Promise<Awaited<ReturnType<MovScriptWorkspaceService['updateContentUnitEditPrompt']>>> {
  return workspaceMutation(input, (engine) => engine.updateContentUnitEditPrompt({
    targetPath: input.targetPath,
    editPrompt: input.editPrompt,
  }), 'source-updated')
}

export async function updateMovScriptEngineExpressionUnit(
  input: ElectronMovScriptEngineExpressionUnitInput,
): Promise<void> {
  await workspaceMutation(input, (engine) => engine.workspaceService.updateExpressionUnitSource({
    targetPath: input.targetPath,
    patch: input.patch,
  }), 'source-updated')
}

export async function updateMovScriptEngineAudioCue(
  input: ElectronMovScriptEngineAudioCueInput,
): Promise<void> {
  await workspaceMutation(input, (engine) => engine.workspaceService.updateAudioCueSource({
    targetPath: input.targetPath,
    patch: input.patch,
  }), 'source-updated')
}

export async function updateMovScriptEngineTransition(
  input: ElectronMovScriptEngineTransitionInput,
): Promise<void> {
  await workspaceMutation(input, (engine) => engine.workspaceService.updateEntityTransition({
    targetPath: input.targetPath,
    transition: input.transition,
  }), 'source-updated')
}

export async function updateMovScriptEngineStoryboardTimeline(
  input: ElectronMovScriptEngineStoryboardTimelineInput,
): Promise<void> {
  await workspaceMutation(input, (engine) => engine.workspaceService.updateStoryboardTimeline({
    targetPath: input.targetPath,
    timeline: input.timeline,
  }), 'source-updated')
}

export async function writeMovScriptEngineHierarchyNode(
  input: ElectronMovScriptEngineHierarchyNodeWriteInput,
): Promise<void> {
  await workspaceMutation(input, (engine) => engine.writeHierarchyNode({
    targetPath: input.targetPath,
    record: input.record,
  }).then(() => undefined), 'hierarchy-node-written')
}

export async function syncMovScriptEngineContentWorkspace(
  input: ElectronMovScriptEngineProjectInput,
): Promise<void> {
  await workspaceMutation(input, (engine) => engine.interpret().then(() => undefined), 'interpret-synced', {
    interpretBeforeWrite: false,
    requireExpectedWorkspaceVersions: false,
  })
}

async function workspaceMutation<T>(
  input: ElectronMovScriptEngineProjectInput,
  action: (engine: NodeMovScriptEngine) => Promise<T>,
  reason: ElectronMovScriptEngineWorkspaceUpdatedEvent['reason'] = 'workspace-mutated',
  options: { interpretBeforeWrite?: boolean; requireExpectedWorkspaceVersions?: boolean } = {},
): Promise<T> {
  return enqueueProjectEngineOperation(input, async () => {
    try {
      const engine = projectEngineRegistry.get(input)
      if (options.interpretBeforeWrite ?? true) await engine.interpret()
      await assertExpectedWorkspaceVersions(engine, input.expectedWorkspaceVersions, options.requireExpectedWorkspaceVersions ?? true)
      const result = await action(engine)
      projectEngineRegistry.invalidate(input)
      emitProjectWorkspaceUpdated(input, reason)
      return result
    } catch (error) {
      projectEngineRegistry.invalidate(input)
      throw error
    }
  })
}

export function normalizeProjectEngineInput(
  input?: ElectronMovScriptEngineProjectInput,
): NormalizedProjectEngineInput {
  const paths = resolveDesktopWorkspaceContextPaths({
    workspaceDir: resolveMovScriptHomeDir(input),
    workspaceContext: {
      scope: input?.projectId !== undefined ? 'project' : 'global',
      ...(input?.userId !== undefined ? { userId: input.userId } : {}),
      ...(input?.orgId !== undefined ? { orgId: input.orgId } : {}),
      ...(input?.projectId !== undefined ? { projectId: input.projectId } : {}),
    },
  })
  return {
    workspaceDir: paths.workspaceDir,
    realm: paths.context.realm,
    ...(paths.context.userId !== undefined ? { userId: paths.context.userId } : {}),
    ...(paths.context.orgId !== undefined ? { orgId: paths.context.orgId } : {}),
    ...(paths.context.projectId !== undefined ? { projectId: paths.context.projectId } : {}),
  }
}

function projectEngineKey(input: NormalizedProjectEngineInput): string {
  return [
    input.workspaceDir,
    input.realm.kind,
    input.realm.id,
    input.userId ?? '',
    input.orgId ?? '',
    input.projectId ?? '',
  ].map((part) => String(part)).join('\u001f')
}

function enqueueProjectEngineOperation<T>(
  input: ElectronMovScriptEngineProjectInput,
  action: () => Promise<T>,
): Promise<T> {
  const key = projectEngineKey(normalizeProjectEngineInput(input))
  const previous = projectOperationQueues.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(action)
  const tail = current.then(() => undefined, () => undefined)
  projectOperationQueues.set(key, tail)
  void tail.finally(() => {
    if (projectOperationQueues.get(key) === tail) projectOperationQueues.delete(key)
  })
  return current
}

function emitProjectWorkspaceUpdated(
  input: ElectronMovScriptEngineProjectInput,
  reason: ElectronMovScriptEngineWorkspaceUpdatedEvent['reason'],
): void {
  const context = normalizeProjectEngineInput(input)
  workspaceUpdatedBroadcaster({
    type: 'MovScriptEngineWorkspaceUpdated',
    reason,
    sequence: ++workspaceUpdateSequence,
    updatedAt: new Date().toISOString(),
    movScriptHomeDir: context.workspaceDir,
    workspaceDir: context.workspaceDir,
    ...(context.userId !== undefined ? { userId: context.userId } : {}),
    ...(context.orgId !== undefined ? { orgId: context.orgId } : {}),
    ...(context.projectId !== undefined ? { projectId: context.projectId } : {}),
  })
}

function broadcastProjectWorkspaceUpdated(event: ElectronMovScriptEngineWorkspaceUpdatedEvent): void {
  void import('electron').then((electron) => {
    const browserWindow = (electron as { BrowserWindow?: { getAllWindows?: () => Array<{ isDestroyed: () => boolean; webContents: { send: (channel: string, event: ElectronMovScriptEngineWorkspaceUpdatedEvent) => void } }> } }).BrowserWindow
    const windows = typeof browserWindow?.getAllWindows === 'function' ? browserWindow.getAllWindows() : []
    for (const win of windows) {
      if (!win.isDestroyed()) win.webContents.send('movscript:engine-workspace-updated', event)
    }
  }).catch(() => undefined)
}

async function assertExpectedWorkspaceVersions(
  engine: NodeMovScriptEngine,
  expectedVersions: Record<string, string | null> | undefined,
  required: boolean,
): Promise<void> {
  if (!expectedVersions) {
    if (required) throw new Error('expectedWorkspaceVersions is required')
    return
  }
  for (const [path, expectedVersion] of Object.entries(expectedVersions)) {
    const currentVersion = await readWorkspaceFileVersion(engine.projectDir, path)
    if (currentVersion !== expectedVersion) {
      throw new Error(`workspace file changed: ${path}`)
    }
  }
}

async function readWorkspaceFileVersion(projectDir: string, path: string): Promise<string | null> {
  const absolutePath = resolve(projectDir, path)
  if (!isInsideProjectDir(projectDir, absolutePath)) throw new Error('workspace path must stay inside the project workspace root')
  const fileStat = await stat(absolutePath).catch((error: unknown) => {
    if (isNotFoundError(error)) return undefined
    throw error
  })
	  return fileStat ? workspaceFileVersion(Number(fileStat.mtimeMs), fileStat.size) : null
}

function workspaceFileVersion(mtimeMs: number, size: number): string {
  return `${Math.trunc(mtimeMs)}:${size}`
}

function isInsideProjectDir(projectDir: string, absolutePath: string): boolean {
  const normalizedRoot = resolve(projectDir)
  return absolutePath === normalizedRoot || absolutePath.startsWith(`${normalizedRoot}/`)
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}

function backendDecisionStoreHeaders(
  context: NormalizedProjectEngineInput,
  sessionUserId: string | undefined,
): { headers?: Record<string, string> } {
  const headers: Record<string, string> = {}
  if (sessionUserId) headers['X-User-ID'] = sessionUserId
  if (context.orgId !== undefined) headers['X-Org-ID'] = String(context.orgId)
  return Object.keys(headers).length ? { headers } : {}
}

function contentUnitInputFromWorkspacePayload(payload: MovScriptWorkspaceService['upsertContentUnit'] extends (input: infer Input) => unknown ? Input : never): MovScriptEngineContentUnitInput {
  const unit = isRecord((payload as { unit?: unknown }).unit) ? (payload as { unit: Record<string, unknown> }).unit : {}
  const editPrompt = isRecord(unit.edit_prompt) ? unit.edit_prompt : undefined
  const modelIntent = isRecord(unit.model_intent) ? unit.model_intent : undefined
  return {
    id: idValue(unit.id ?? unit.ID ?? unit.client_id),
    title: stringValue(unit.title),
    kind: stringValue(unit.kind),
    contentUnitType: stringValue(unit.content_unit_type ?? unit.contentUnitType),
    outputKind: stringValue(unit.output_kind ?? unit.outputKind),
    targetKind: stringValue(unit.target_kind ?? unit.targetKind),
    targetRef: idValue(unit.target_ref ?? unit.targetRef),
    generationRole: stringValue(unit.generation_role ?? unit.generationRole),
    assetRef: idValue(unit.asset_ref ?? unit.assetRef),
    productionId: idValue(unit.production_ref ?? unit.productionId ?? unit.production_id),
    segmentId: idValue(unit.segment_ref ?? unit.segmentId ?? unit.segment_id),
    sceneMomentId: idValue(unit.scene_moment_ref ?? unit.sceneMomentId ?? unit.scene_moment_id),
    expressionUnitId: idValue(unit.expression_unit_ref ?? unit.expressionUnitId ?? unit.expression_unit_id),
    storyboardId: idValue(unit.storyboard_ref ?? unit.storyboardId ?? unit.storyboard_id),
    keyframeId: idValue(unit.keyframe_ref ?? unit.keyframeId ?? unit.keyframe_id),
    audioCueId: idValue(unit.audio_cue_ref ?? unit.audioCueId ?? unit.audio_cue_id),
    prompt: stringValue(unit.prompt) ?? stringValue(editPrompt?.text),
    negativePrompt: stringValue(unit.negative_prompt ?? unit.negativePrompt) ?? stringValue(editPrompt?.negative_text),
    description: stringValue(unit.description),
    order: numberValue(unit.order),
    ...(modelIntent ? { modelIntent } : {}),
  }
}

function idValue(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
