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
  generationExecutionJobTypeForIntent,
  type ContentUnitGenerationOutputKind,
  type GenerationIntentPayload,
} from '@movscript/core/generation'
import type { ContentCandidateRecord } from '@movscript/core/content'
import type { PublicModel, RawResource } from '@movscript/shared'
import {
  loadContentSourceWorkspaceData,
  updateContentSourceWorkspaceExpressionUnit,
} from './contentSourceWorkspaceElectron'
import type {
  ContentCanvasContentCandidateCreateInput,
  ContentCanvasContentCandidateDecideInput,
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
    writeHierarchyNode: async (input) => {
      const writeHierarchyNode = readSurfaceHostApi()?.writeMovScriptEngineHierarchyNode
      if (!writeHierarchyNode) throw new Error('当前窗口没有 MovScript hierarchy node 写入能力')
      return writeHierarchyNode({
        ...currentSurfaceWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId,
        expectedWorkspaceVersions: { [input.targetPath]: null },
        targetPath: input.targetPath,
        record: input.record,
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
      const hostApi = readSurfaceHostApi()
      if (input.targetKind === 'timeline_assembly') {
        const ensureTimelineAssembly = hostApi?.ensureMovScriptEngineTimelineAssemblyContentUnit
        if (!ensureTimelineAssembly) throw new Error('当前窗口没有 MovScript timeline assembly content unit 确保能力')
        return ensureTimelineAssembly({
          ...currentSurfaceWorkspaceOwnerContext(),
          ...(projectDir ? { projectDir } : {}),
          projectId,
          expectedWorkspaceVersions: {},
          payload: timelineAssemblyContentUnitEnsurePayload(input),
        })
      }
      const ensureContentUnit = hostApi?.ensureMovScriptEngineContentUnitForEntity
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
      const generationIntent = completeCanvasContentUnitGenerationIntent(input.generationIntent, input.outputKind, inputResourceIds)
      const jobType = generationExecutionJobTypeForIntent(generationIntent, input.outputKind)
      const modelCapability = generationIntent.capability
      const resolvedModel = input.modelId
        ? undefined
        : await resolveContentUnitGenerationModel(modelCapability, input.outputKind, generationIntent.operation, generationIntent.reference_assets)
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
        generationIntent,
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
        generation_intent: payload.generation_intent,
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
    decideContentUnitCandidate: async (input: ContentCanvasContentCandidateDecideInput) => {
      const decideCandidate = readSurfaceHostApi()?.decideMovScriptEngineContentUnitCandidate
      if (!decideCandidate) throw new Error('当前窗口没有创作片段候选决策能力')
      const projectDir = currentSurfaceWorkspaceProjectDir()
      await decideCandidate({
        ...currentSurfaceWorkspaceOwnerContext(),
        ...(projectDir ? { projectDir } : {}),
        projectId: input.projectId,
        expectedWorkspaceVersions: {},
        contentUnitId: input.contentUnitId,
        candidateId: input.candidateId,
        resourceId: input.resourceId,
        decision: input.decision,
        reason: input.reason,
        metadata: input.metadata,
      })
    },
  }
}

function completeCanvasContentUnitGenerationIntent(
  intent: GenerationIntentPayload | undefined,
  outputKind: ContentUnitGenerationOutputKind,
  inputResourceIds: readonly number[],
): GenerationIntentPayload {
  if (!intent?.capability?.trim() || !intent.operation?.trim()) {
    throw new Error('生成候选需要显式选择模型能力和 operation')
  }
  const referenceAssets = completeCanvasReferenceAssets(intent.operation, intent.reference_assets, inputResourceIds)
  return {
    capability: intent.capability.trim(),
    operation: intent.operation.trim(),
    ...(referenceAssets.length > 0 ? { reference_assets: referenceAssets } : {}),
  }
}

function completeCanvasReferenceAssets(
  operation: string,
  existing: GenerationIntentPayload['reference_assets'] | undefined,
  inputResourceIds: readonly number[],
): NonNullable<GenerationIntentPayload['reference_assets']> {
  const raw = Array.isArray(existing) ? existing : []
  if (inputResourceIds.length === 0 && raw.length === 0) return []
  const maxLength = Math.max(inputResourceIds.length, raw.length)
  const out: NonNullable<GenerationIntentPayload['reference_assets']> = []
  for (let index = 0; index < maxLength; index += 1) {
    const current = raw[index]
    const role = current?.role?.trim() || referenceRoleForOperation(operation, index)
    const mediaType = current?.media_type?.trim() || referenceMediaTypeForOperation(operation, role)
    const resourceId = current?.resource_id ?? inputResourceIds[index]
    if (!role || resourceId === undefined) continue
    out.push({
      role,
      ...(mediaType ? { media_type: mediaType } : {}),
      resource_id: resourceId,
    })
  }
  return out
}

function referenceRoleForOperation(operation: string, index: number): string {
  switch (operation.trim()) {
    case 'first_frame_to_video':
      return index === 0 ? 'first_frame' : 'generic'
    case 'first_last_frame_to_video':
      return index === 0 ? 'first_frame' : index === 1 ? 'last_frame' : 'generic'
    case 'reference_to_video':
      return 'generic'
    case 'video_to_video':
      return 'reference_video'
    default:
      return 'generic'
  }
}

function referenceMediaTypeForOperation(operation: string, role: string): 'image' | 'video' | undefined {
  if (operation.trim() === 'video_to_video' || role === 'reference_video') return 'video'
  if (operation.trim() === 'reference_to_video' && role === 'generic') return undefined
  if (role === 'generic' || role === 'reference_image' || role === 'first_frame' || role === 'last_frame') return 'image'
  return undefined
}

function timelineAssemblyContentUnitEnsurePayload(input: {
  scopeKind?: string
  scopeRef?: string | number
  id?: string | number
  title?: string
  outputKind?: string
  prompt?: string
  negativePrompt?: string
  description?: string
  order?: number
  modelIntent?: Record<string, unknown>
}) {
  const scopeKind = input.scopeKind?.trim()
  const scopeRef = input.scopeRef
  if (!scopeKind || scopeRef === undefined || !String(scopeRef).trim()) {
    throw new Error('timeline assembly content unit requires scopeKind and scopeRef')
  }
  return {
    scopeKind,
    scopeRef,
    ...(input.id !== undefined ? { id: input.id } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.outputKind !== undefined ? { outputKind: input.outputKind } : {}),
    ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
    ...(input.negativePrompt !== undefined ? { negativePrompt: input.negativePrompt } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.order !== undefined ? { order: input.order } : {}),
    ...(input.modelIntent !== undefined ? { modelIntent: input.modelIntent } : {}),
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
    promptText: input.promptText,
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
  operation?: string,
  referenceAssets?: GenerationIntentPayload['reference_assets'],
): Promise<PublicModel> {
  const models = await listGenerationModels(capability, operation, referenceAssets)
  const fallbackModels = models.length > 0 || capability === fallbackCapability
    ? models
    : await listGenerationModels(fallbackCapability, operation, referenceAssets)
  const model = fallbackModels.find((item) => item.is_default) ?? fallbackModels[0]
  if (!model) throw new Error(`没有可用于 ${capability} 的生成模型`)
  return model
}

async function listGenerationModels(
  capability: string,
  operation?: string,
  referenceAssets?: GenerationIntentPayload['reference_assets'],
): Promise<PublicModel[]> {
  return api.get('/models', {
    params: {
      capability,
      ...(operation ? { operation } : {}),
      ...(referenceAssets && referenceAssets.length > 0 ? { reference_assets: JSON.stringify(referenceAssets.map((asset) => ({
        role: asset.role,
        ...(asset.media_type ? { media_type: asset.media_type } : {}),
      }))) } : {}),
    },
  }).then((response) => response.data as PublicModel[])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
