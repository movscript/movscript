import { createElectronMovScriptWorkspaceService } from '@/shared/infrastructure/workspaceDomainRepository'
import { currentWorkspaceOwnerContext, currentWorkspaceProjectDir } from '@/shared/infrastructure/session/workspaceOwnerContext'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { api } from '@/shared/infrastructure/api'
import { publicModelId } from '@/shared/domain/modelDisplay'
import {
  buildContentUnitGenerationJobPayload,
  compiledContentUnitGenerationPromptText,
  compiledContentUnitGenerationPromptResourceIds,
  resolveGenerationJobTypeFromResourceCount,
  type ContentUnitGenerationOutputKind,
} from '@movscript/core/generation'
import type { ContentCandidateRecord } from '@movscript/core/content'
import type { PublicModel, RawResource } from '@/types'
import {
  loadContentSourceWorkspaceData,
  updateContentSourceWorkspaceExpressionUnit,
} from './contentSourceWorkspaceElectron'
import type {
  ContentCanvasContentCandidateCreateInput,
  ContentCanvasContentCandidateGenerateInput,
  ContentCanvasGenerationPromptPreview,
  ContentCanvasContentCandidateSelectInput,
  ContentCanvasWorkspaceGateway,
  ContentCanvasWorkspaceService,
} from '../application/contentCanvasWorkspaceGateway'

export function createElectronContentCanvasWorkspaceGateway(projectId: number): ContentCanvasWorkspaceGateway {
  const projectDir = currentWorkspaceProjectDir()
  const projectContext = {
    projectId,
    ...(projectDir ? { projectDir } : {}),
  }
  const service = createElectronMovScriptWorkspaceService(projectContext)
  return {
    service,
    loadContentSourceWorkspaceData: (inputProjectId) => loadContentSourceWorkspaceData(inputProjectId, {
      ...currentWorkspaceOwnerContext(),
      ...(projectDir ? { projectDir } : {}),
    }),
    createSetting: async (input) => {
      const createSetting = readElectronApi()?.createMovScriptEngineSetting
      if (!createSetting) throw new Error('当前窗口没有 MovScript setting 创建能力')
      return createSetting({
        ...currentWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    createSettingState: async (input) => {
      const createSettingState = readElectronApi()?.createMovScriptEngineSettingState
      if (!createSettingState) throw new Error('当前窗口没有 MovScript setting state 创建能力')
      return createSettingState({
        ...currentWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    createAsset: async (input) => {
      const createAsset = readElectronApi()?.createMovScriptEngineAsset
      if (!createAsset) throw new Error('当前窗口没有 MovScript asset 创建能力')
      return createAsset({
        ...currentWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    updateEntityBasics: async (input) => {
      const updateEntityBasics = readElectronApi()?.updateMovScriptEngineEntityBasics
      if (!updateEntityBasics) throw new Error('当前窗口没有 MovScript entity basics 更新能力')
      return updateEntityBasics({
        ...currentWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    connectSceneMomentSetting: async (input) => {
      const connectSetting = readElectronApi()?.connectMovScriptEngineSceneMomentSetting
      if (!connectSetting) throw new Error('当前窗口没有 MovScript scene moment setting 连接能力')
      return connectSetting({
        ...currentWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    createProduction: async (input) => {
      const createProduction = readElectronApi()?.createMovScriptEngineProduction
      if (!createProduction) throw new Error('当前窗口没有 MovScript production 创建能力')
      await createProduction({
        ...currentWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: {
          id: input.id,
          title: input.title,
        },
      })
    },
    createSegment: async (input) => {
      const createSegment = readElectronApi()?.createMovScriptEngineSegment
      if (!createSegment) throw new Error('当前窗口没有 MovScript segment 创建能力')
      await createSegment({
        ...currentWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: {
          productionId: input.productionId,
          id: input.id,
          title: input.title,
          kind: 'emotional_function',
          summary: `从制作「${input.productionTitle}」创建。`,
        },
      })
    },
    createSceneMoment: async (input) => {
      const createSceneMoment = readElectronApi()?.createMovScriptEngineSceneMoment
      if (!createSceneMoment) throw new Error('当前窗口没有 MovScript scene moment 创建能力')
      await createSceneMoment({
        ...currentWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: {
          productionId: input.productionId,
          segmentId: input.segmentId,
          id: input.id,
          title: input.title,
          actionText: `从情绪段「${input.segmentTitle}」创建。`,
        },
      })
    },
    createExpressionUnit: async (input) => {
      const createExpressionUnit = readElectronApi()?.createMovScriptEngineExpressionUnit
      if (!createExpressionUnit) throw new Error('当前窗口没有 MovScript expression unit 创建能力')
      await createExpressionUnit({
        ...currentWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: {
          productionId: input.productionId,
          segmentId: input.segmentId,
          sceneMomentId: input.sceneMomentId,
          id: input.id,
          kind: input.kind,
          text: input.text,
          title: input.title,
          intent: `从情节「${input.sceneMomentTitle}」创建。`,
        },
      })
    },
    createKeyframe: async (input) => {
      const createKeyframe = readElectronApi()?.createMovScriptEngineKeyframe
      if (!createKeyframe) throw new Error('当前窗口没有 MovScript keyframe 创建能力')
      await createKeyframe({
        ...currentWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    createStoryboard: async (input) => {
      const createStoryboard = readElectronApi()?.createMovScriptEngineStoryboard
      if (!createStoryboard) throw new Error('当前窗口没有 MovScript storyboard 创建能力')
      await createStoryboard({
        ...currentWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    ensureContentUnitForEntity: async (input) => {
      const ensureContentUnit = readElectronApi()?.ensureMovScriptEngineContentUnitForEntity
      if (!ensureContentUnit) throw new Error('当前窗口没有 MovScript content unit 确保能力')
      return ensureContentUnit({
        ...currentWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    updateExpressionUnit: async (input) => {
      await updateContentSourceWorkspaceExpressionUnit(input)
    },
    uploadResource: async (input) => {
      const formData = new FormData()
      formData.append('file', input.file)
      const resource = await api.post('/resources/upload', formData).then((response) => response.data as RawResource)
      return {
        id: resource.ID,
        name: resource.name,
        type: resource.type,
        mimeType: resource.mime_type,
      }
    },
    createContentUnitCandidate: async (input: ContentCanvasContentCandidateCreateInput) => createBackendContentCandidate(input),
    previewContentUnitGenerationPrompt: async (input: ContentCanvasContentCandidateGenerateInput) => (
      previewContentUnitGenerationPromptForCanvas(service, input)
    ),
    generateContentUnitCandidate: async (input: ContentCanvasContentCandidateGenerateInput) => {
      const compiledPrompt = await readContentUnitGenerationPromptForCanvas(service, input)
      const blockers = promptBlockers(compiledPrompt)
      if (blockers.length) throw new Error(`提示词引用尚未解析：${blockers.map(promptBlockerLabel).join('；')}`)
      const inputResourceIds = compiledContentUnitGenerationPromptResourceIds(compiledPrompt)
      const jobType = resolveGenerationJobTypeFromResourceCount({
        outputType: input.outputKind,
        inputResourceCount: inputResourceIds.length,
      })
      const modelId = input.modelId ?? publicModelId(await resolveContentUnitGenerationModel(jobType, input.outputKind))
      const built = buildContentUnitGenerationJobPayload({
        projectId: input.projectId,
        contentUnitId: input.contentUnitId,
        outputKind: input.outputKind,
        compiledPrompt,
        modelId,
        params: input.params,
      })
      const payload = built.payload
      const response = await api.post(`/projects/${input.projectId}/content-units/${encodeURIComponent(input.contentUnitId)}/candidates/generate`, {
        candidate_id: input.candidateId,
        output_kind: input.outputKind,
        model_id: payload.model_id,
        job_type: payload.job_type,
        title: payload.title,
        prompt: payload.prompt,
        extra_params: payload.extra_params,
        aspect_ratio: payload.aspect_ratio,
        duration: payload.duration,
        input_resource_ids: payload.input_resource_ids,
        prompt_snapshot: built.promptSnapshot,
      }).then((result) => result.data as { candidate: ContentCandidateRecord })
      return response.candidate
    },
    selectContentUnitCandidate: async (input: ContentCanvasContentCandidateSelectInput) => {
      const selectCandidate = readElectronApi()?.selectMovScriptEngineContentUnitCandidate
      if (!selectCandidate) throw new Error('当前窗口没有创作片段候选选择能力')
      const projectDir = currentWorkspaceProjectDir()
      await selectCandidate({
        ...currentWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId: input.projectId,
        expectedWorkspaceVersions: {},
        contentUnitId: input.contentUnitId,
        candidateId: input.candidateId,
        resourceId: input.resourceId,
        reason: input.reason,
      })
    },
  }
}

async function createBackendContentCandidate(input: ContentCanvasContentCandidateCreateInput) {
  const createCandidate = readElectronApi()?.createMovScriptEngineContentCandidate
  if (!createCandidate) throw new Error('当前窗口没有创作片段候选创建能力')
  const projectDir = currentWorkspaceProjectDir()
  return createCandidate({
    ...currentWorkspaceOwnerContext(),
    ...(projectDir ? { projectDir } : {}),
    projectId: input.projectId,
    expectedWorkspaceVersions: {},
    contentUnitId: input.contentUnitId,
    candidateId: input.candidateId,
    source: input.source,
    status: input.status,
    producer: input.producer,
    outputs: input.outputs,
    promptSnapshot: input.promptSnapshot,
    createdAt: input.createdAt,
  })
}

async function readContentUnitGenerationPromptForCanvas(
  _service: ContentCanvasWorkspaceService,
  input: ContentCanvasContentCandidateGenerateInput,
): Promise<Record<string, unknown>> {
  const backendPrompt = await buildContentUnitBackendPromptForCanvas(input)
  return { ...backendPrompt, __contentCanvasPromptSource: 'backend' }
}

async function previewContentUnitGenerationPromptForCanvas(
  service: ContentCanvasWorkspaceService,
  input: ContentCanvasContentCandidateGenerateInput,
): Promise<ContentCanvasGenerationPromptPreview> {
  const prompt = await readContentUnitGenerationPromptForCanvas(service, input)
  console.info('[content-canvas] compiled prompt source', JSON.stringify({
    contentUnitId: input.contentUnitId,
    source: prompt.__contentCanvasPromptSource,
    blockerCount: promptBlockers(prompt).length,
    resourceIds: prompt.resource_ids,
    replacements: prompt.replacements,
    refs: prompt.refs,
  }))
  return {
    text: compiledContentUnitGenerationPromptText(prompt),
    compiledText: typeof prompt.text === 'string' ? prompt.text : undefined,
    resourceIds: compiledContentUnitGenerationPromptResourceIds(prompt),
    replacements: Array.isArray(prompt.replacements) ? prompt.replacements.filter(isRecord) : [],
    blockers: promptBlockers(prompt),
  }
}

async function buildContentUnitBackendPromptForCanvas(
  input: ContentCanvasContentCandidateGenerateInput,
): Promise<Record<string, unknown>> {
  const buildPrompt = readElectronApi()?.buildMovScriptEngineContentUnitBackendPrompt
  if (!buildPrompt) {
    throw new Error('当前窗口没有创作片段提示词编译能力，请重启桌面窗口以加载最新 Electron bridge')
  }
  const result = await buildPrompt({
    ...currentWorkspaceOwnerContext(),
    ...(currentWorkspaceProjectDir() ? { projectDir: currentWorkspaceProjectDir() } : {}),
    projectId: input.projectId,
    contentUnitId: input.contentUnitId,
  })
  return {
    ...result.prompt,
    ...(result.ok ? {} : { blockers: result.blockers }),
  }
}

function promptBlockers(prompt: Record<string, unknown>): Array<Record<string, unknown>> {
  const blockers = Array.isArray(prompt.blockers) ? prompt.blockers.filter(isRecord) : []
  return blockers
}

function promptBlockerLabel(blocker: Record<string, unknown>): string {
  const message = stringValue(blocker.message)
  if (message) return message
  const ref = stringValue(blocker.ref)
  if (ref) return ref
  return stringValue(blocker.code) ?? '未解析引用'
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

async function resolveContentUnitGenerationModel(
  capability: string,
  fallbackCapability: ContentUnitGenerationOutputKind,
): Promise<PublicModel> {
  const models = await listGenerationModels(capability)
  const fallbackModels = models.length > 0 || capability === fallbackCapability
    ? models
    : await listGenerationModels(fallbackCapability)
  const model = fallbackModels.find((item) => item.is_default) ?? fallbackModels[0]
  if (!model) throw new Error(`没有可用于 ${capability} 的生成模型`)
  return model
}

async function listGenerationModels(capability: string): Promise<PublicModel[]> {
  return api.get('/models', { params: { capability } }).then((response) => response.data as PublicModel[])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
