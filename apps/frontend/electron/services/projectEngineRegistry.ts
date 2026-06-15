import { resolveMovScriptProjectCwd } from '@movscript/core/workspace/node'
import { resolveMovScriptBackendSession } from '@movscript/core/backend/node'
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
import { createMovScriptBackendDecisionStore } from '@movscript/workspace/repository'
import type { MovScriptWorkspaceService } from '@movscript/workspace'

import type {
  ElectronMovScriptEngineAudioCueInput,
  ElectronMovScriptEngineContentCandidateCreateInput,
  ElectronMovScriptEngineContentCandidateSelectInput,
  ElectronMovScriptEngineContentUnitEditPromptInput,
  ElectronMovScriptEngineExpressionUnitInput,
  ElectronMovScriptEngineHierarchyNodeWriteInput,
  ElectronMovScriptEngineProjectInput,
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
} from '../../src/shared/contracts/electronApi'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import { writeMovScriptWorkspaceFile } from './movscriptWorkspaceFiles'

type NormalizedProjectEngineInput = {
  workspaceDir: string
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

export async function loadMovScriptEngineContentWorkspaceSnapshot(
  input: ElectronMovScriptEngineProjectInput,
): Promise<ContentSourceWorkspaceSnapshot> {
  const snapshot = await loadContentSourceWorkspaceSnapshotFromEngine(projectEngineRegistry.get(input))
  console.log('[movscript-engine] load content workspace snapshot', {
    projectId: input.projectId,
    workspaceDir: input.workspaceDir,
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
    previewShotCandidates: data.previewMoments.flatMap((moment) => moment.shots).map((shot) => ({
      contentUnitId: shot.contentUnit.id,
      candidateCount: shot.contentUnit.candidates.length,
      candidateIds: shot.contentUnit.candidates.map((candidate) => candidate.id),
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

export async function deleteMovScriptEngineWorkspaceEntity(
  input: ElectronMovScriptEngineWorkspaceDeleteEntityInput,
): Promise<void> {
  await workspaceMutation(input, (engine) => engine.workspaceService.deleteEntity(input.payload))
}

export async function saveMovScriptEngineWorkspaceProductionSnapshot(
  input: ElectronMovScriptEngineWorkspaceSaveProductionSnapshotInput,
) {
  return workspaceMutation(input, (engine) => engine.workspaceService.saveProductionSnapshot(input.payload))
}

export async function upsertMovScriptEngineWorkspaceProjectStandards(
  input: ElectronMovScriptEngineWorkspaceUpsertProjectStandardsInput,
) {
  return workspaceMutation(input, (engine) => engine.workspaceService.upsertProjectStandards(input.payload))
}

export async function upsertMovScriptEngineWorkspaceContentUnit(
  input: ElectronMovScriptEngineWorkspaceUpsertContentUnitInput,
) {
  return workspaceMutation(input, (engine) => engine.workspaceService.upsertContentUnit(input.payload))
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
  console.log('[movscript-engine] create content candidate backend request', {
    projectId: input.projectId,
    workspaceDir: input.workspaceDir,
    userId: input.userId,
    orgId: input.orgId,
    contentUnitId: input.contentUnitId,
    candidateId: input.candidateId,
    source: input.source,
    status: input.status,
    outputs: input.outputs,
  })
  const result = await projectEngineRegistry.get(input).workspaceService.createContentCandidate({
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
  projectEngineRegistry.invalidate(input)
  return result.record as ContentCandidateRecord
}

export async function selectMovScriptEngineContentUnitCandidate(
  input: ElectronMovScriptEngineContentCandidateSelectInput,
): Promise<void> {
  await projectEngineRegistry.get(input).workspaceService.selectContentUnitCandidate({
    contentUnitId: input.contentUnitId,
    candidateId: input.candidateId,
    ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
    reason: input.reason,
  })
  projectEngineRegistry.invalidate(input)
}

export async function updateMovScriptEngineContentUnitEditPrompt(
  input: ElectronMovScriptEngineContentUnitEditPromptInput,
): Promise<Awaited<ReturnType<MovScriptWorkspaceService['updateContentUnitEditPrompt']>>> {
  const result = await projectEngineRegistry.get(input).workspaceService.updateContentUnitEditPrompt({
    targetPath: input.targetPath,
    editPrompt: input.editPrompt,
  })
  projectEngineRegistry.invalidate(input)
  return result
}

export async function updateMovScriptEngineExpressionUnit(
  input: ElectronMovScriptEngineExpressionUnitInput,
): Promise<void> {
  await projectEngineRegistry.get(input).workspaceService.updateExpressionUnitSource({
    targetPath: input.targetPath,
    patch: input.patch,
  })
  projectEngineRegistry.invalidate(input)
}

export async function updateMovScriptEngineAudioCue(
  input: ElectronMovScriptEngineAudioCueInput,
): Promise<void> {
  await projectEngineRegistry.get(input).workspaceService.updateAudioCueSource({
    targetPath: input.targetPath,
    patch: input.patch,
  })
  projectEngineRegistry.invalidate(input)
}

export async function updateMovScriptEngineTransition(
  input: ElectronMovScriptEngineTransitionInput,
): Promise<void> {
  await projectEngineRegistry.get(input).workspaceService.updateEntityTransition({
    targetPath: input.targetPath,
    transition: input.transition,
  })
  projectEngineRegistry.invalidate(input)
}

export async function updateMovScriptEngineStoryboardTimeline(
  input: ElectronMovScriptEngineStoryboardTimelineInput,
): Promise<void> {
  await projectEngineRegistry.get(input).workspaceService.updateStoryboardTimeline({
    targetPath: input.targetPath,
    timeline: input.timeline,
  })
  projectEngineRegistry.invalidate(input)
}

export async function writeMovScriptEngineHierarchyNode(
  input: ElectronMovScriptEngineHierarchyNodeWriteInput,
): Promise<void> {
  await writeMovScriptWorkspaceFile({
    ...input,
    content: `${JSON.stringify(input.record, null, 2)}\n`,
    path: input.targetPath,
  })
  projectEngineRegistry.invalidate(input)
}

export async function syncMovScriptEngineContentWorkspace(
  input: ElectronMovScriptEngineProjectInput,
): Promise<void> {
  await projectEngineRegistry.get(input).interpret()
  projectEngineRegistry.invalidate(input)
}

async function workspaceMutation<T>(
  input: ElectronMovScriptEngineProjectInput,
  action: (engine: NodeMovScriptEngine) => Promise<T>,
): Promise<T> {
  try {
    return await action(projectEngineRegistry.get(input))
  } finally {
    projectEngineRegistry.invalidate(input)
  }
}

export function normalizeProjectEngineInput(
  input?: ElectronMovScriptEngineProjectInput,
): NormalizedProjectEngineInput {
  return {
    workspaceDir: input?.workspaceDir?.trim() || resolveDesktopDefaultMovScriptWorkspaceDir(),
    ...(input?.userId !== undefined ? { userId: input.userId } : {}),
    ...(input?.orgId !== undefined ? { orgId: input.orgId } : {}),
    ...(input?.projectId !== undefined ? { projectId: input.projectId } : {}),
  }
}

function projectEngineKey(input: NormalizedProjectEngineInput): string {
  return [
    input.workspaceDir,
    input.userId ?? '',
    input.orgId ?? '',
    input.projectId ?? '',
  ].map((part) => String(part)).join('\u001f')
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
