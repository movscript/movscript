import {
  createSurfaceWorkspaceDomainService,
  currentSurfaceWorkspaceOwnerContext,
  currentSurfaceWorkspaceProjectDir,
  getSurfaceHostStateSnapshot,
  readSurfaceHostApi,
} from '@movscript/shared'
import { surfaceDataApi as api } from '@movscript/shared/surface-http'
import { publicAgentBackendModelId as publicModelId } from '@movscript/core/agent'
import {
  buildContentUnitGenerationJobPayload,
  compiledContentUnitGenerationPromptText,
  compiledContentUnitGenerationPromptResourceIds,
  resolveGenerationJobTypeFromResourceCount,
  type ContentUnitGenerationOutputKind,
} from '@movscript/core/generation'
import type { ContentCandidateRecord } from '@movscript/core/content'
import type { PublicModel, RawResource } from '@movscript/shared'
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

export function createElectronContentCanvasWorkspaceGateway(
  projectId: number,
  options: { projectDir?: string | null } = {},
): ContentCanvasWorkspaceGateway {
  const projectDir = options.projectDir?.trim() || currentSurfaceWorkspaceProjectDir()
  const projectContext = {
    projectId,
    ...(projectDir ? { projectDir } : {}),
  }
  const service = createSurfaceWorkspaceDomainService(projectContext)
  return {
    service,
    loadContentSourceWorkspaceData: (inputProjectId) => loadContentSourceWorkspaceData(inputProjectId, {
      ...currentSurfaceWorkspaceOwnerContext(),
      ...(projectDir ? { projectDir } : {}),
    }),
    createSetting: async (input) => {
      const createSetting = readSurfaceHostApi()?.createMovScriptEngineSetting
      if (!createSetting) throw new Error('当前窗口没有 MovScript setting 创建能力')
      return createSetting({
        ...currentSurfaceWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    createSettingState: async (input) => {
      const createSettingState = readSurfaceHostApi()?.createMovScriptEngineSettingState
      if (!createSettingState) throw new Error('当前窗口没有 MovScript setting state 创建能力')
      return createSettingState({
        ...currentSurfaceWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    createAsset: async (input) => {
      const createAsset = readSurfaceHostApi()?.createMovScriptEngineAsset
      if (!createAsset) throw new Error('当前窗口没有 MovScript asset 创建能力')
      return createAsset({
        ...currentSurfaceWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    updateEntityBasics: async (input) => {
      const updateEntityBasics = readSurfaceHostApi()?.updateMovScriptEngineEntityBasics
      if (!updateEntityBasics) throw new Error('当前窗口没有 MovScript entity basics 更新能力')
      return updateEntityBasics({
        ...currentSurfaceWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    deleteEntity: async (input) => {
      const deleteEntity = readSurfaceHostApi()?.deleteMovScriptEngineWorkspaceEntity
      if (!deleteEntity) throw new Error('当前窗口没有 MovScript workspace entity 删除能力')
      await deleteEntity({
        ...currentSurfaceWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    connectSceneMomentSetting: async (input) => {
      const connectSetting = readSurfaceHostApi()?.connectMovScriptEngineSceneMomentSetting
      if (!connectSetting) throw new Error('当前窗口没有 MovScript scene moment setting 连接能力')
      return connectSetting({
        ...currentSurfaceWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    createProduction: async (input) => {
      const createProduction = readSurfaceHostApi()?.createMovScriptEngineProduction
      if (!createProduction) throw new Error('当前窗口没有 MovScript production 创建能力')
      await createProduction({
        ...currentSurfaceWorkspaceOwnerContext(),
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
      const createSegment = readSurfaceHostApi()?.createMovScriptEngineSegment
      if (!createSegment) throw new Error('当前窗口没有 MovScript segment 创建能力')
      await createSegment({
        ...currentSurfaceWorkspaceOwnerContext(),
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
      const createSceneMoment = readSurfaceHostApi()?.createMovScriptEngineSceneMoment
      if (!createSceneMoment) throw new Error('当前窗口没有 MovScript scene moment 创建能力')
      await createSceneMoment({
        ...currentSurfaceWorkspaceOwnerContext(),
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
      const createExpressionUnit = readSurfaceHostApi()?.createMovScriptEngineExpressionUnit
      if (!createExpressionUnit) throw new Error('当前窗口没有 MovScript expression unit 创建能力')
      await createExpressionUnit({
        ...currentSurfaceWorkspaceOwnerContext(),
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
      const createKeyframe = readSurfaceHostApi()?.createMovScriptEngineKeyframe
      if (!createKeyframe) throw new Error('当前窗口没有 MovScript keyframe 创建能力')
      await createKeyframe({
        ...currentSurfaceWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    createStoryboard: async (input) => {
      const createStoryboard = readSurfaceHostApi()?.createMovScriptEngineStoryboard
      if (!createStoryboard) throw new Error('当前窗口没有 MovScript storyboard 创建能力')
      await createStoryboard({
        ...currentSurfaceWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    createContentUnit: async (input) => {
      const createContentUnit = readSurfaceHostApi()?.createMovScriptEngineContentUnit
      if (!createContentUnit) throw new Error('当前窗口没有 MovScript content unit 创建能力')
      return createContentUnit({
        ...currentSurfaceWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: {},
        payload: input,
      })
    },
    ensureContentUnitForEntity: async (input) => {
      const ensureContentUnit = readSurfaceHostApi()?.ensureMovScriptEngineContentUnitForEntity
      if (!ensureContentUnit) throw new Error('当前窗口没有 MovScript content unit 确保能力')
      return ensureContentUnit({
        ...currentSurfaceWorkspaceOwnerContext(),
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
      const resolvedModel = input.modelId ? undefined : await resolveContentUnitGenerationModel(jobType, input.outputKind)
      const modelId = input.modelId ?? (resolvedModel ? publicModelId(resolvedModel) : '')
      if (!modelId) throw new Error(`没有可用于 ${jobType} 的生成模型`)
      const supportedParams = input.supportedParams ?? resolvedModel?.supported_params
      const built = buildContentUnitGenerationJobPayload({
        projectId: input.projectId,
        contentUnitId: input.contentUnitId,
        outputKind: input.outputKind,
        compiledPrompt,
        modelId,
        params: input.params,
        supportedParams,
      })
      const payload = built.payload
      const response = await api.post(`/projects/${input.projectId}/content-units/${encodeURIComponent(input.contentUnitId)}/candidates/generate`, {
        candidate_id: input.candidateId,
        ...currentProjectDataCandidateContext(),
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
      const selectCandidate = readSurfaceHostApi()?.selectMovScriptEngineContentUnitCandidate
      if (!selectCandidate) throw new Error('当前窗口没有创作片段候选选择能力')
      const projectDir = currentSurfaceWorkspaceProjectDir()
      await selectCandidate({
        ...currentSurfaceWorkspaceOwnerContext(),
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
  const createCandidate = readSurfaceHostApi()?.createMovScriptEngineContentCandidate
  if (!createCandidate) throw new Error('当前窗口没有创作片段候选创建能力')
  const projectDir = currentSurfaceWorkspaceProjectDir()
  return createCandidate({
    ...currentSurfaceWorkspaceOwnerContext(),
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

function currentProjectDataCandidateContext(): Record<string, string> {
  const snapshot = getSurfaceHostStateSnapshot()
  const owner = currentSurfaceWorkspaceOwnerContext()
  const projectUid = snapshot.currentProject?.project_uid?.trim()
  const projectTitle = snapshot.currentProject?.name?.trim()
  const context: Record<string, string> = {}
  if (projectUid) context.project_uid = projectUid
  if (projectTitle) context.project_title = projectTitle
  if (owner.orgId !== undefined) {
    context.scope_kind = 'org'
    context.scope_id = String(owner.orgId)
  } else if (owner.userId !== undefined) {
    context.scope_kind = 'user'
    context.scope_id = String(owner.userId)
  }
  return context
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
  const buildPrompt = readSurfaceHostApi()?.buildMovScriptEngineContentUnitBackendPrompt
  if (!buildPrompt) {
    throw new Error('当前窗口没有创作片段提示词编译能力，请重启桌面窗口以加载最新 Electron bridge')
  }
  const result = await buildPrompt({
    ...currentSurfaceWorkspaceOwnerContext(),
    ...(currentSurfaceWorkspaceProjectDir() ? { projectDir: currentSurfaceWorkspaceProjectDir() } : {}),
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
