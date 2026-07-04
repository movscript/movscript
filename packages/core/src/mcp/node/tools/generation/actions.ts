import {
  formatResourceMention,
  parseResourceMentions,
  resourceIdsFromMentions,
} from '@movscript/workspace'
import { resolve } from 'node:path'
import { backendGet, backendList, backendPost } from '../../../../backend/node/client.js'
import {
  buildContentUnitGenerationOutputCandidate,
  buildContentUnitGenerationRequest,
  buildContentUnitGenerationPromptSnapshot,
  buildGenerationIntentForOutputKind,
  completeGenerationReferenceAssets,
  compiledContentUnitGenerationPromptReferenceAssets,
  compiledContentUnitGenerationPromptResourceIds,
  compiledContentUnitGenerationPromptText,
  contentUnitGenerationCandidateId,
  contentUnitGenerationFeatureKey,
  contentUnitGenerationSystemMonitorToolName,
  generationExecutionJobTypeForIntent,
  type ContentUnitGenerationCandidateCreatePlan,
  type GenerationIntentPayload,
} from '../../../../generation/index.js'
import {
  domainBuildContentUnitBackendPrompt,
  domainCreateContentCandidate,
  domainRegisterRawResourceAsContentUnitCandidate,
  readContentUnitCandidateVisibility,
} from '../domain/actions.js'
import { listModels } from '../model/actions.js'
import {
  requireMCPBackendBoundProject,
  resolveMCPProjectBindingLocator,
} from '../project/localProjectBinding.js'
import { getOptionalNumeric, getOptionalString, numericValues } from '../../../tools/shared/params.js'
import { isRecord } from '../../../tools/shared/record.js'
import {
  candidateIdFromArgs,
  createContentCandidatesSurface,
  createGenerationJobSurface,
  createPromptSurface,
  projectIdFromArgs,
} from '../surfaces.js'

type GenerationJobType =
  | 'image'
  | 'video'
  | 'audio'

type GenerationCapability =
  | 'image_generation'
  | 'video_generation'
  | 'audio_generation'

type GenerationOutputGroup = 'image' | 'video' | 'audio' | 'subtitle' | 'voice_profile' | 'json'

const generationCapabilities: GenerationCapability[] = [
  'image_generation',
  'video_generation',
  'audio_generation',
]

type AudioGenerationCapability = Extract<GenerationCapability, 'audio_generation'>

type BuiltGenerationRequest = {
  prompt: string
  refIds: number[]
  jobType: GenerationJobType
  generationIntent?: GenerationIntentPayload
  timeoutMs: number
  params: Record<string, unknown>
  explicitParamKeys: Set<string>
  defaultParamKeys: Set<string>
}

type ModelSelection = {
  modelId: string
  model?: Record<string, unknown>
}

type ParameterMode = 'strict' | 'compatible'

type ParamAuditItem = {
  key: string
  value?: unknown
  reason: string
  source?: 'explicit' | 'default' | 'compatible'
  mapped_to?: string
  mapped_value?: unknown
}

type PreparedGenerationParams = {
  aspectRatio?: string
  duration?: number
  extraParams: Record<string, unknown>
  audit: ParamAuditItem[]
}

type CompiledContentUnitPromptResult = {
  ok?: unknown
  prompt: Record<string, unknown>
  blockers?: unknown[]
}

type GenerationProjectScope = {
  projectDir?: string
  projectUid?: string
  projectTitle?: string
}

export async function generateImage(args: Record<string, unknown>): Promise<unknown> {
  const built = buildImageRequest(args)
  const selection = await resolveModelSelection(args, built.generationIntent?.capability ?? 'image_generation', 'image_generation', built.generationIntent?.operation)
  const submitted = await submitGenerationJob(args, selection, built, 'electron.generation.image')
  return withGenerationJobSurface(args, generationSubmitResult('image', submitted.job, 'generation_job_get', submitted.paramAudit))
}

export async function listGenerationCapabilities(args: Record<string, unknown>): Promise<unknown> {
  const includeModels = args.include_models === true
  const modelsByCapability: Record<string, unknown> = {}
  if (includeModels) {
    for (const capability of generationCapabilities) {
      const models = await modelsForCapability(capability)
      modelsByCapability[capability] = {
        count: models.length,
        models,
      }
    }
  }
  return {
    capabilities: generationCapabilities,
    count: generationCapabilities.length,
    ...(includeModels ? { models_by_capability: modelsByCapability } : {}),
  }
}

export async function prepareGeneration(args: Record<string, unknown>): Promise<unknown> {
  const capability = requiredGenerationCapability(args)
  const scope = generationScope(args)
  const explicitOperation = generationOperationArg(args)
  const operation = generationOperationForCapability(capability, explicitOperation)
  if (capability === 'audio_generation' && !operation) {
    throw new Error('audio_generation operation is required; choose text_to_speech, speech_to_text, speech_translate, speech_to_speech, music_generation, sound_effect_generation, voice_clone, voice_design, dubbing, voice_isolation, or forced_alignment')
  }
  let compiledContentUnit: CompiledContentUnitPromptResult | undefined
  if (scope === 'content_unit' && (isImageGenerationCapability(capability) || isVideoGenerationCapability(capability))) {
    const contentUnitId = requiredContentUnitId(args)
    compiledContentUnit = await compiledContentUnitPrompt(args, contentUnitId)
  }
  const referenceAssets = compiledContentUnit
    ? compiledContentUnitGenerationPromptReferenceAssets(compiledContentUnit.prompt)
    : generationReferenceAssetsForModelList(args)
  const outputKind = generationCapabilityOutputKind(capability)
  const models = await listModels({
    capability,
    ...(explicitOperation ? { operation } : {}),
    target_output: outputKind,
    resolve_intent: !explicitOperation && (isImageGenerationCapability(capability) || isVideoGenerationCapability(capability) || isAudioGenerationCapability(capability)),
    ...(referenceAssets.length > 0 ? { reference_assets: referenceAssets } : {}),
    provider_variants: args.provider_variants,
    include_provider_variants: args.include_provider_variants,
  })
  if (scope === 'content_unit' && (isImageGenerationCapability(capability) || isVideoGenerationCapability(capability))) {
    const contentUnitId = requiredContentUnitId(args)
    const compiled = compiledContentUnit ?? await compiledContentUnitPrompt(args, contentUnitId)
    const blockers = Array.isArray(compiled.blockers) ? compiled.blockers : compiled.prompt?.blockers ?? []
    return {
      status: compiled.ok === true ? 'ready' : 'blocked',
      capability,
      scope,
      contentUnitId,
      content_unit_id: contentUnitId,
      prompt: compiled.prompt,
      blockers,
      ...(isRecord(models) ? models : { models }),
      message: compiled.ok === true
        ? `Content unit ${String(contentUnitId)} is ready for ${capability} generation.`
        : `Content unit ${String(contentUnitId)} has unresolved prompt blockers.`,
    }
  }
  return {
    status: 'ready',
    capability,
    scope,
    ...(isRecord(models) ? models : { models }),
    message: `${capability} generation is ready to submit.`,
  }
}

export async function submitUnifiedGeneration(args: Record<string, unknown>): Promise<unknown> {
  const capability = requiredGenerationCapability(args)
  const scope = generationScope(args)
  const candidatePolicy = getOptionalString(args, 'candidate_policy') ?? (scope === 'content_unit' ? 'auto_create' : 'none')
  if (scope === 'content_unit') {
    if (isImageGenerationCapability(capability)) {
      return generationV2Result(await generateContentUnitImage(args), capability, scope, 'image', 'content_unit_candidate', candidatePolicy)
    }
    if (isVideoGenerationCapability(capability)) {
      return generationV2Result(await generateContentUnitVideo(args), capability, scope, 'video', 'content_unit_candidate', candidatePolicy)
    }
    throw new Error(`scope=content_unit is currently supported by image and video generation capabilities; got ${capability}`)
  }
  if (isAudioGenerationCapability(capability)) {
    return submitUnifiedAudioGeneration(args, capability, scope, candidatePolicy)
  }

  switch (capability) {
    case 'image_generation':
      return generationV2Result(await generateImage(args), capability, scope, 'image', 'raw_resource', candidatePolicy)
    case 'video_generation':
      return generationV2Result(await generateVideo(args), capability, scope, 'video', 'raw_resource', candidatePolicy)
    default:
      return assertNeverGenerationCapability(capability)
  }
}

async function submitUnifiedAudioGeneration(
  args: Record<string, unknown>,
  capability: AudioGenerationCapability,
  scope: ReturnType<typeof generationScope>,
  candidatePolicy: string,
): Promise<unknown> {
  const operation = generationOperationForCapability(capability, generationOperationArg(args))
  if (!operation) {
    throw new Error('audio_generation operation is required; choose text_to_speech, speech_to_text, speech_translate, speech_to_speech, music_generation, sound_effect_generation, voice_clone, voice_design, dubbing, voice_isolation, or forced_alignment')
  }
  const outputKind = audioOutputKindForOperation(operation)
  switch (operation) {
    case 'text_to_speech':
      return generationV2Result(await generateVoiceover(args), capability, scope, outputKind, 'raw_resource', candidatePolicy)
    case 'speech_to_text':
      return generationV2Result(await generateSubtitle(args), capability, scope, outputKind, 'raw_resource', candidatePolicy)
    case 'speech_translate':
      return generationV2Result(await generateSpeechTranslate(args), capability, scope, outputKind, 'raw_resource', candidatePolicy)
    case 'music_generation':
      return generationV2Result(await generateMusic(args), capability, scope, outputKind, 'raw_resource', candidatePolicy)
    case 'sound_effect_generation':
      return generationV2Result(await generateSfx(args), capability, scope, outputKind, 'raw_resource', candidatePolicy)
    case 'speech_to_speech':
      return generationV2Result(await generateSpeechToSpeech(args), capability, scope, outputKind, 'raw_resource', candidatePolicy)
    case 'voice_clone':
      return generationV2Result(await generateVoiceClone(args), capability, scope, outputKind, 'raw_resource', candidatePolicy)
    case 'voice_design':
      return generationV2Result(await generateVoiceDesign(args), capability, scope, outputKind, 'raw_resource', candidatePolicy)
    case 'dubbing':
      return generationV2Result(await generateDubbing(args), capability, scope, outputKind, 'raw_resource', candidatePolicy)
    case 'voice_isolation':
      return generationV2Result(await isolateVoice(args), capability, scope, outputKind, 'raw_resource', candidatePolicy)
    case 'forced_alignment':
      return generationV2Result(await alignSubtitle(args), capability, scope, outputKind, 'raw_resource', candidatePolicy)
    default:
      throw new Error(`unsupported audio_generation operation: ${operation}`)
  }
}

export async function getUnifiedGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  const capability = optionalGenerationCapability(args)
  const scope = generationScope(args)
  const outputKind = outputKindArg(args, capability)
  if (scope === 'content_unit' && (outputKind === 'image' || outputKind === 'video')) {
    const result = outputKind === 'image'
      ? await getContentUnitImageGenerationJob({ ...args, outputKind })
      : await getContentUnitVideoGenerationJob({ ...args, outputKind })
    return generationV2Result(result, capability ?? outputKind, scope, outputKind, 'content_unit_candidate', getOptionalString(args, 'candidate_policy') ?? 'auto_create')
  }
  const kind = generationOutputJobGroup(outputKind)
  const result = withGenerationJobSurface(args, generationJobGetResult(kind, await getGenerationJob(normalizedJobId(args)), verbosityArg(args)))
  return generationV2Result(result, capability ?? outputKind, scope, outputKind, 'raw_resource', getOptionalString(args, 'candidate_policy') ?? 'none')
}

export async function getUnifiedGenerationJobs(args: Record<string, unknown>): Promise<unknown> {
  const jobIds = normalizedJobIds(args)
  const items: Record<string, unknown>[] = []
  const rawItems = Array.isArray(args.items) ? args.items : []
  for (let index = 0; index < jobIds.length; index += 1) {
    const jobId = jobIds[index]!
    const itemArgs = isRecord(rawItems[index]) ? { ...args, ...rawItems[index], jobId } : { ...args, jobId }
    try {
      const result = await getUnifiedGenerationJob(itemArgs)
      items.push({
        index,
        status: 'loaded',
        jobId,
        job_id: jobId,
        terminal: isRecord(result) ? result.terminal : undefined,
        outputResourceIds: isRecord(result) ? result.outputResourceIds : undefined,
        output_resource_ids: isRecord(result) ? result.output_resource_ids : undefined,
        result,
      })
    } catch (error) {
      items.push({
        index,
        status: 'error',
        jobId,
        job_id: jobId,
        terminal: true,
        error: errorMessage(error),
      })
    }
  }
  const successItems = items.filter((item) => item.status !== 'error')
  const failedItems = items.filter((item) => item.status === 'error')
  const terminalCount = items.filter((item) => item.terminal === true).length
  const outputResourceIds = Array.from(new Set(successItems.flatMap((item) => numericList(item.output_resource_ids))))
  return {
    status: failedItems.length === 0 ? 'loaded' : successItems.length > 0 ? 'partial_error' : 'error',
    total: jobIds.length,
    success_count: successItems.length,
    failed_count: failedItems.length,
    terminal_count: terminalCount,
    all_terminal: terminalCount === jobIds.length,
    output_resource_ids: outputResourceIds,
    outputResourceIds,
    items,
    message: `${successItems.length}/${jobIds.length} generation job(s) loaded.`,
  }
}

export async function registerGenerationResult(args: Record<string, unknown>): Promise<unknown> {
  const result = await domainRegisterRawResourceAsContentUnitCandidate(args)
  return {
    status: 'registered',
    candidate: result,
    message: 'Generation result registered as a content-unit candidate.',
  }
}

export async function generateContentUnitImage(args: Record<string, unknown>): Promise<unknown> {
  return generateContentUnitVisual(args, 'image')
}

export async function getImageGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  return withGenerationJobSurface(args, generationJobGetResult('image', await getGenerationJob(normalizedJobId(args)), verbosityArg(args)))
}

export async function getContentUnitImageGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  return getContentUnitVisualGenerationJob(args, 'image')
}

export async function getImageGenerationJobs(args: Record<string, unknown>): Promise<unknown> {
  return getGenerationJobs('image', args)
}

export async function generateVideo(args: Record<string, unknown>): Promise<unknown> {
  const built = buildVideoRequest(args)
  const selection = await resolveModelSelection(args, built.generationIntent?.capability ?? 'video_generation', 'video_generation', built.generationIntent?.operation)
  const submitted = await submitGenerationJob(args, selection, built, 'electron.generation.video')
  return withGenerationJobSurface(args, generationSubmitResult('video', submitted.job, 'generation_job_get', submitted.paramAudit))
}

export async function generateContentUnitVideo(args: Record<string, unknown>): Promise<unknown> {
  return generateContentUnitVisual(args, 'video')
}

export async function getVideoGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  return withGenerationJobSurface(args, generationJobGetResult('video', await getGenerationJob(normalizedJobId(args)), verbosityArg(args)))
}

export async function getContentUnitVideoGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  return getContentUnitVisualGenerationJob(args, 'video')
}

export async function getVideoGenerationJobs(args: Record<string, unknown>): Promise<unknown> {
  return getGenerationJobs('video', args)
}

export async function generateAudio(args: Record<string, unknown>): Promise<unknown> {
  return generateAudioLike(args, 'text_to_speech', 'electron.generation.audio')
}

export async function generateVoiceover(args: Record<string, unknown>): Promise<unknown> {
  return generateAudioLike(args, 'text_to_speech', 'electron.generation.voiceover')
}

export async function generateMusic(args: Record<string, unknown>): Promise<unknown> {
  return generateAudioLike(args, 'music_generation', 'electron.generation.music')
}

export async function generateSfx(args: Record<string, unknown>): Promise<unknown> {
  return generateAudioLike(args, 'sound_effect_generation', 'electron.generation.sound_effect')
}

export async function generateSpeechToSpeech(args: Record<string, unknown>): Promise<unknown> {
  return generateAudioLike(args, 'speech_to_speech', 'electron.generation.speech_to_speech')
}

export async function generateSubtitle(args: Record<string, unknown>): Promise<unknown> {
  return generateAudioLike(args, 'speech_to_text', 'electron.generation.subtitle')
}

export async function alignSubtitle(args: Record<string, unknown>): Promise<unknown> {
  return generateAudioLike(args, 'forced_alignment', 'electron.generation.forced_alignment')
}

export async function generateDubbing(args: Record<string, unknown>): Promise<unknown> {
  return generateAudioLike(args, 'dubbing', 'electron.generation.dubbing')
}

export async function generateSpeechTranslate(args: Record<string, unknown>): Promise<unknown> {
  return generateAudioLike(args, 'speech_translate', 'electron.generation.speech_translate')
}

export async function generateVoiceClone(args: Record<string, unknown>): Promise<unknown> {
  return generateAudioLike(args, 'voice_clone', 'electron.generation.voice_clone')
}

export async function generateVoiceDesign(args: Record<string, unknown>): Promise<unknown> {
  return generateAudioLike(args, 'voice_design', 'electron.generation.voice_design')
}

export async function isolateVoice(args: Record<string, unknown>): Promise<unknown> {
  return generateAudioLike(args, 'voice_isolation', 'electron.generation.voice_isolation')
}

async function generateAudioLike(
  args: Record<string, unknown>,
  operation: string,
  featureKey: string,
): Promise<unknown> {
  const built = buildAudioRequest(args, operation)
  const normalizedOperation = normalizeAudioGenerationOperation(operation) ?? operation
  const selection = await resolveModelSelectionWithFallback(args, 'audio_generation', 'audio_generation', normalizedOperation, normalizedOperation)
  const submitted = await submitGenerationJob(args, selection, built, featureKey)
  return withGenerationJobSurface(args, generationSubmitResult('audio', submitted.job, 'generation_job_get', submitted.paramAudit))
}

async function generateContentUnitVisual(
  args: Record<string, unknown>,
  kind: 'image' | 'video',
): Promise<unknown> {
  const contentUnitId = requiredContentUnitId(args)
  const compiled = await compiledContentUnitPrompt(args, contentUnitId)
  if (compiled.ok !== true) {
    return {
      status: 'blocked',
      terminal: true,
      contentUnitId,
      content_unit_id: contentUnitId,
      prompt: compiled.prompt,
      blockers: Array.isArray(compiled.blockers) ? compiled.blockers : compiled.prompt?.blockers ?? [],
      surface: createPromptSurface(args, { contentUnitId, mode: 'edit', projectId: projectIdFromArgs(args) }),
      message: `Content unit ${String(contentUnitId)} ${kind} generation is blocked by unresolved prompt inputs.`,
    }
  }

  const prompt = compiledContentUnitGenerationPromptText(compiled.prompt)
  const compiledRefIds = positiveIntegerIds([
    ...compiledContentUnitGenerationPromptResourceIds(compiled.prompt),
    ...(resourceIds(args.input_resource_ids) ?? []),
    ...(resourceIds(args.reference_resource_ids) ?? []),
  ])
  const compiledReferenceAssets = compiledContentUnitGenerationPromptReferenceAssets(compiled.prompt)
  const contentUnitGenerationIntent = contentUnitGenerationIntentForCompiledPrompt(
    args,
    kind,
    compiledRefIds,
    compiledReferenceAssets,
  )
  const nextArgs: Record<string, unknown> = {
    ...args,
    generation_intent: contentUnitGenerationIntent,
    prompt,
    input_resource_ids: compiledRefIds,
  }
  if (kind === 'image' && getOptionalString(nextArgs, 'negative_prompt') === undefined) {
    const negative = typeof compiled.prompt.negative_text === 'string' ? compiled.prompt.negative_text.trim() : ''
    if (negative) nextArgs.negative_prompt = negative
  }

  const built = kind === 'image' ? buildImageRequest(nextArgs) : buildVideoRequest(nextArgs)
  const selection = kind === 'image'
    ? await resolveModelSelection(nextArgs, built.generationIntent?.capability ?? 'image_generation', 'image_generation', built.generationIntent?.operation)
    : await resolveModelSelection(nextArgs, built.generationIntent?.capability ?? 'video_generation', 'video_generation', built.generationIntent?.operation)
  const projectScope = await resolveGenerationProjectScope(args, { required: true })
  const sharedRequest = buildContentUnitGenerationRequest({
    contentUnitId,
    outputKind: kind,
    compiledPrompt: compiled.prompt,
    modelId: selection.modelId,
    additionalInputResourceIds: [
      ...(resourceIds(args.input_resource_ids) ?? []),
      ...(resourceIds(args.reference_resource_ids) ?? []),
    ],
    generationIntent: built.generationIntent,
    paramAudit: [],
  })
  const promptSnapshot = {
    ...sharedRequest.promptSnapshot,
    ...buildContentUnitGenerationPromptSnapshot({
      contentUnitId,
      outputKind: kind,
      modelId: selection.modelId,
      compiledPrompt: compiled.prompt,
      resourceIds: sharedRequest.inputResourceIds,
      paramAudit: [],
      modelParams: {},
    }),
  }
  const prepared = prepareGenerationParams(built, selection.model, parameterModeArg(nextArgs))
  const modelParams = submittedModelParams(prepared)
  Object.assign(promptSnapshot, buildContentUnitGenerationPromptSnapshot({
    contentUnitId,
    outputKind: kind,
    modelId: selection.modelId,
    compiledPrompt: compiled.prompt,
    resourceIds: sharedRequest.inputResourceIds,
    paramAudit: prepared.audit,
    modelParams,
  }))
  const submitted = await submitGenerationJob({
    ...args,
    title: getOptionalString(args, 'title') ?? `Content unit ${kind} generation`,
  }, selection, built, contentUnitGenerationFeatureKey(kind), {
    candidate_id: getOptionalString(args, 'candidate_id') ?? getOptionalString(args, 'candidateId'),
    output_kind: kind,
    prompt_snapshot: promptSnapshot,
    content_unit_id: contentUnitId,
  })
  const monitorTool = contentUnitGenerationSystemMonitorToolName(kind)
  const result = withGenerationJobSurface(args, generationSubmitResult(kind, submitted.job, monitorTool, prepared.audit), contentUnitId)
  const jobId = idField(result.job_id)
  const candidateId = getOptionalString(args, 'candidate_id') ?? getOptionalString(args, 'candidateId')
  return {
    ...result,
    generation_mode: 'content_unit_candidate',
    candidate_policy: 'auto_create_on_success',
    will_auto_select: false,
    requires_user_adoption: true,
    contentUnitId,
    content_unit_id: contentUnitId,
    prompt: compiled.prompt,
    compiled_prompt_text: prompt,
    provider_prompt_text: prompt,
    input_resource_ids: sharedRequest.inputResourceIds,
    inputResourceIds: sharedRequest.inputResourceIds,
    semantic_ref_replacements: semanticRefReplacements(compiled.prompt),
    provider_prompt_note: 'Data-service resolves MovScript resource tokens into ordered 图片N placeholders before adapter calls; resources are also passed through input_resource_ids and generation_intent.reference_assets.',
    monitor: {
      tool: monitorTool,
      args: {
        jobId,
        contentUnitId,
        content_unit_id: contentUnitId,
        ...(candidateId ? { candidateId, candidate_id: candidateId } : {}),
        outputKind: kind,
        output_kind: kind,
        projectDir: projectScope.projectDir,
        project_dir: projectScope.projectDir,
        ...(projectScope.projectUid ? { projectUid: projectScope.projectUid, project_uid: projectScope.projectUid } : {}),
        promptSnapshot,
        prompt_snapshot: promptSnapshot,
      },
    },
    secondary_surfaces: [
      createPromptSurface(args, { contentUnitId, mode: 'inspect', projectId: projectIdFromArgs(args) }),
    ],
    ...(candidateId ? { candidateId, candidate_id: candidateId } : {}),
    message: `Content unit ${String(contentUnitId)} ${kind} generation candidate job submitted (Job #${String(jobId)}). Candidate will be refreshed automatically when the job succeeds.`,
  }
}

async function getContentUnitVisualGenerationJob(
  args: Record<string, unknown>,
  kind: 'image' | 'video',
): Promise<unknown> {
  const contentUnitId = requiredContentUnitId(args)
  const job = await getGenerationJob(normalizedJobId(args))
  const base = generationJobGetResult(kind, job, verbosityArg(args))
  const status = stringField(base.status) ?? ''
  if (!isSuccessfulStatus(status)) {
    return {
      ...base,
      generation_mode: 'content_unit_candidate',
      candidate_policy: 'auto_create_on_success',
      will_auto_select: false,
      requires_user_adoption: true,
      contentUnitId,
      content_unit_id: contentUnitId,
      candidate_created: false,
      surface: createGenerationJobSurface(args, {
        jobId: normalizedJobId(args),
        contentUnitId,
        projectId: projectIdFromArgs(args),
      }),
      message: `${base.message}. Candidate will be created after a successful terminal result.`,
    }
  }

  const outputResourceIds = numericList(base.output_resource_ids)
  if (outputResourceIds.length === 0) {
    return {
      ...base,
      generation_mode: 'content_unit_candidate',
      candidate_policy: 'auto_create_on_success',
      will_auto_select: false,
      requires_user_adoption: true,
      contentUnitId,
      content_unit_id: contentUnitId,
      candidate_created: false,
      surface: createGenerationJobSurface(args, {
        jobId: normalizedJobId(args),
        contentUnitId,
        projectId: projectIdFromArgs(args),
      }),
      message: `${base.message}. No output resource is available for candidate creation yet.`,
    }
  }

  const candidates = []
  for (const resourceId of outputResourceIds) {
    const promptSnapshotValue = args.promptSnapshot ?? args.prompt_snapshot
    const promptSnapshot = isRecord(promptSnapshotValue) ? promptSnapshotValue : undefined
    const requestedCandidateId = getOptionalString(args, 'candidateId') ?? getOptionalString(args, 'candidate_id')
    const candidateId = requestedCandidateId ?? contentUnitGenerationCandidateId(kind, idField(base.job_id) ?? normalizedJobId(args), resourceId)
    const plan = buildContentUnitGenerationOutputCandidate({
      contentUnitId,
      outputKind: kind,
      job,
      resourceId,
      candidateId,
      ...(promptSnapshot ? { promptSnapshot } : {}),
    })
    const candidate = await domainCreateContentCandidate({
      ...args,
      ...plan,
    })
    candidates.push({
      candidateId,
      candidate_id: candidateId,
      content_unit_candidate: contentUnitCandidateRecordFromPlan(plan),
      resourceId,
      resource_id: resourceId,
      result: candidate,
    })
  }

  const visibility = await readContentUnitCandidateVisibility(args, contentUnitId).catch(() => undefined)
  const contentUnitCandidates = contentUnitCandidatesFromGenerationResults(candidates, visibility)
  const candidateCount = contentUnitCandidates.length > 0 ? contentUnitCandidates.length : candidates.length
  const visibilityFrontend = isRecord(visibility?.frontend) ? visibility.frontend : {}
  const frontend = {
    ...visibilityFrontend,
    visible_in_panel: candidateCount > 0 || visibilityFrontend.visible_in_panel === true,
  }
  const firstCandidate = candidates.length === 1 ? candidates[0] : undefined
  const firstCandidateId = firstCandidate ? stringField(firstCandidate.candidate_id ?? firstCandidate.candidateId) : undefined
  const firstResourceId = firstCandidate ? idField(firstCandidate.resource_id ?? firstCandidate.resourceId) : undefined
  return {
    ...base,
    generation_mode: 'content_unit_candidate',
    candidate_policy: 'auto_create_on_success',
    will_auto_select: false,
    requires_user_adoption: true,
    contentUnitId,
    content_unit_id: contentUnitId,
    candidate_created: true,
    candidates,
    surface: createContentCandidatesSurface(args, {
      contentUnitId,
      ...(firstCandidateId ?? candidateIdFromArgs(args) ? { candidateId: firstCandidateId ?? candidateIdFromArgs(args) } : {}),
      ...(firstResourceId !== undefined ? { resourceId: firstResourceId } : {}),
      projectId: projectIdFromArgs(args),
    }),
    secondary_surfaces: [
      createGenerationJobSurface(args, {
        jobId: normalizedJobId(args),
        contentUnitId,
        projectId: projectIdFromArgs(args),
      }),
    ],
    ...(visibility ?? {}),
    candidate_count: candidateCount,
    content_unit_candidates: contentUnitCandidates,
    frontend,
    message: `${base.message}. Created or refreshed ${candidates.length} content-unit candidate(s).`,
  }
}

function contentUnitCandidatesFromGenerationResults(
  createdCandidates: Array<Record<string, unknown>>,
  visibility: Record<string, unknown> | undefined,
): Record<string, unknown>[] {
  const visible = Array.isArray(visibility?.content_unit_candidates)
    ? visibility.content_unit_candidates.filter(isRecord)
    : []
  if (visible.length > 0) return visible

  const candidates: Record<string, unknown>[] = []
  for (const created of createdCandidates) {
    const createdCandidate = isRecord(created.content_unit_candidate) ? created.content_unit_candidate : undefined
    if (createdCandidate) {
      candidates.push(createdCandidate)
      continue
    }
    const result = isRecord(created.result) ? created.result : undefined
    const direct = Array.isArray(result?.content_unit_candidates)
      ? result.content_unit_candidates.filter(isRecord)
      : []
    if (direct.length > 0) {
      candidates.push(...direct)
      continue
    }
    const decisionContext = isRecord(result?.result) ? result.result : undefined
    const contextCandidates = Array.isArray(decisionContext?.candidates)
      ? decisionContext.candidates.filter(isRecord)
      : []
    candidates.push(...contextCandidates)
  }
  return candidates
}

function contentUnitCandidateRecordFromPlan(plan: ContentUnitGenerationCandidateCreatePlan): Record<string, unknown> {
  return {
    id: plan.candidateId,
    source: plan.source,
    status: plan.status,
    producer: plan.producer,
    outputs: plan.outputs,
    prompt_snapshot: plan.promptSnapshot,
    created_at: plan.createdAt,
  }
}

export async function getAudioGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  return withGenerationJobSurface(args, generationJobGetResult('audio', await getGenerationJob(normalizedJobId(args)), verbosityArg(args)))
}

export async function getAudioGenerationJobs(args: Record<string, unknown>): Promise<unknown> {
  return getGenerationJobs('audio', args)
}

function buildImageRequest(args: Record<string, unknown>): BuiltGenerationRequest {
  const { prompt, refIds } = promptAndResourceIds(args)
  const generationIntent = generationIntentArg(args, 'image', refIds)
  const params = extraParamsArg(args.extra_params)
  const explicitParamKeys = new Set(Object.keys(params))
  const defaultParamKeys = new Set<string>()

  assignStringParam(args, params, explicitParamKeys, 'image_size')
  assignDefaultParam(params, defaultParamKeys, 'image_size', '1024x1024')
  assignStringParam(args, params, explicitParamKeys, 'aspect_ratio')
  assignDefaultParam(params, defaultParamKeys, 'aspect_ratio', '1:1')
  const quality = getOptionalString(args, 'quality')
  if (quality) {
    params.quality = quality
    explicitParamKeys.add('quality')
  }
  const negativePrompt = getOptionalString(args, 'negative_prompt')
  if (negativePrompt) {
    params.negative_prompt = negativePrompt
    explicitParamKeys.add('negative_prompt')
  }
  const steps = getOptionalNumeric(args, 'steps')
  if (steps !== undefined) {
    params.steps = steps
    explicitParamKeys.add('steps')
  }
  const seed = getOptionalNumeric(args, 'seed')
  if (seed !== undefined) {
    params.seed = seed
    explicitParamKeys.add('seed')
  }

  return {
    prompt,
    refIds,
    jobType: generationExecutionJobTypeForIntent(generationIntent, 'image') as GenerationJobType,
    generationIntent,
    timeoutMs: getOptionalNumeric(args, 'timeout_ms') ?? 180_000,
    params,
    explicitParamKeys,
    defaultParamKeys,
  }
}

function buildVideoRequest(args: Record<string, unknown>): BuiltGenerationRequest {
  const { prompt, refIds } = promptAndResourceIds(args)
  const generationIntent = generationIntentArg(args, 'video', refIds)
  const params = { ...extraParamsArg(args.extra_params) }
  const explicitParamKeys = new Set(Object.keys(params))
  const defaultParamKeys = new Set<string>()
  assignStringParam(args, params, explicitParamKeys, 'aspect_ratio')
  assignDefaultParam(params, defaultParamKeys, 'aspect_ratio', '16:9')
  const duration = getOptionalNumeric(args, 'duration')
  if (duration !== undefined) {
    params.duration = duration
    explicitParamKeys.add('duration')
  } else {
    assignDefaultParam(params, defaultParamKeys, 'duration', 5)
  }
  const quality = getOptionalString(args, 'quality')
  if (quality) {
    params.quality = quality
    explicitParamKeys.add('quality')
  }
  const fps = getOptionalNumeric(args, 'fps')
  if (fps !== undefined) {
    params.fps = fps
    explicitParamKeys.add('fps')
  }
  const seed = getOptionalNumeric(args, 'seed')
  if (seed !== undefined) {
    params.seed = seed
    explicitParamKeys.add('seed')
  }

  return {
    prompt,
    refIds,
    jobType: generationExecutionJobTypeForIntent(generationIntent, 'video') as GenerationJobType,
    generationIntent,
    timeoutMs: getOptionalNumeric(args, 'timeout_ms') ?? 600_000,
    params,
    explicitParamKeys,
    defaultParamKeys,
  }
}

function contentUnitGenerationIntentForCompiledPrompt(
  args: Record<string, unknown>,
  outputKind: 'image' | 'video',
  inputResourceIds: readonly number[],
  promptReferenceAssets: GenerationIntentPayload['reference_assets'] = [],
): GenerationIntentPayload {
  const explicitIntent = args.generation_intent ?? args.generationIntent
  const explicitCapability = isRecord(explicitIntent) ? getOptionalString(explicitIntent, 'capability') : undefined
  const operation = generationOperationArg(args)
  const explicitReferenceAssetInput = explicitGenerationReferenceAssetInput(args)
  const explicitReferenceAssets = explicitReferenceAssetInput === undefined
    ? undefined
    : generationReferenceAssetsPayload(explicitReferenceAssetInput, inputResourceIds).reference_assets ?? []
  const referenceAssets = completeGenerationReferenceAssets({
    operation,
    existing: explicitReferenceAssets ?? promptReferenceAssets,
    inputResourceIds,
  })
  const completedIntent = buildGenerationIntentForOutputKind({
    outputKind,
    operation,
    referenceAssets,
  })
  if (!completedIntent?.operation?.trim()) {
    throw new Error('content-unit generation requires a generation operation')
  }
  return {
    capability: explicitCapability ?? completedIntent.capability,
    operation: completedIntent.operation,
    ...(completedIntent.reference_assets?.length ? { reference_assets: completedIntent.reference_assets } : {}),
  }
}

function explicitGenerationReferenceAssetInput(args: Record<string, unknown>): unknown | undefined {
  const explicitIntent = args.generation_intent ?? args.generationIntent
  if (isRecord(explicitIntent)) {
    if (explicitIntent.reference_assets !== undefined) return explicitIntent.reference_assets
    if (explicitIntent.referenceAssets !== undefined) return explicitIntent.referenceAssets
  }
  if (args.reference_assets !== undefined) return args.reference_assets
  if (args.referenceAssets !== undefined) return args.referenceAssets
  return undefined
}

function generationIntentArg(
  args: Record<string, unknown>,
  outputKind: 'image' | 'video',
  refIds: readonly number[],
): GenerationIntentPayload {
  const explicit = args.generation_intent ?? args.generationIntent
  const topLevelOperation = getOptionalString(args, 'operation') ?? getOptionalString(args, 'model_operation')
  if (isRecord(explicit)) {
    const capability = getOptionalString(explicit, 'capability') ?? (outputKind === 'image' ? 'image_generation' : 'video_generation')
    const operation = getOptionalString(explicit, 'operation') ?? topLevelOperation
    const rawReferenceAssets = explicit.reference_assets ?? explicit.referenceAssets
    const payload = generationReferenceAssetsPayload(rawReferenceAssets, refIds)
    const inferredOperation = operation ?? inferredVisualGenerationOperation(outputKind, payload.reference_assets)
    if (capability && inferredOperation) {
      return {
        capability,
        operation: inferredOperation,
        ...payload,
      }
    }
  }
  const payload = generationReferenceAssetsPayload(args.reference_assets ?? args.referenceAssets, refIds)
  const operation = topLevelOperation ?? inferredVisualGenerationOperation(outputKind, payload.reference_assets)
  return {
    capability: outputKind === 'image' ? 'image_generation' : 'video_generation',
    operation,
    ...payload,
  }
}

function inferredVisualGenerationOperation(
  outputKind: 'image' | 'video',
  referenceAssets: GenerationIntentPayload['reference_assets'] | undefined,
): string {
  const refs = referenceAssets ?? []
  if (outputKind === 'image') {
    if (refs.length === 0) return 'text_to_image'
    if (refs.some((ref) => ref.role === 'target_image' || ref.role === 'mask')) return 'edit_image'
    return 'reference_to_image'
  }
  if (refs.length === 0) return 'prompt_to_video'
  const hasFirst = refs.some((ref) => ref.media_type === 'image' && ref.role === 'first_frame')
  const hasLast = refs.some((ref) => ref.media_type === 'image' && ref.role === 'last_frame')
  const hasVideo = refs.some((ref) => ref.media_type === 'video')
  const hasAudio = refs.some((ref) => ref.media_type === 'audio')
  const hasImage = refs.some((ref) => ref.media_type === 'image')
  if (hasFirst && hasLast) return 'first_last_frame_to_video'
  if (hasFirst) return 'first_frame_to_video'
  if (hasVideo && !hasImage && !hasAudio) {
    return refs.some((ref) => ref.media_type === 'video' && ref.role === 'target_video') ? 'edit_video' : 'reference_to_video'
  }
  if (hasImage && !hasVideo && !hasAudio) return 'image_to_video'
  return 'reference_to_video'
}

function audioGenerationIntentArg(
  args: Record<string, unknown>,
  fallbackOperation: string,
  refIds: readonly number[],
): GenerationIntentPayload | undefined {
  const explicit = args.generation_intent ?? args.generationIntent
  const topLevelOperation = getOptionalString(args, 'operation') ?? getOptionalString(args, 'model_operation')
  if (isRecord(explicit)) {
    const capability = normalizeGenerationCapability(getOptionalString(explicit, 'capability') ?? '') ?? 'audio_generation'
    if (!isAudioGenerationCapability(capability)) throw new Error(`unsupported audio generation capability: ${capability}`)
    const operation = generationOperationForCapability(capability, getOptionalString(explicit, 'operation') ?? topLevelOperation ?? fallbackOperation)
    const rawReferenceAssets = explicit.reference_assets ?? explicit.referenceAssets
    if (!operation) throw new Error(`unsupported audio_generation operation: ${getOptionalString(explicit, 'operation') ?? topLevelOperation ?? fallbackOperation}`)
    return {
      capability: 'audio_generation',
      operation,
      ...audioGenerationReferenceAssetsPayload(rawReferenceAssets, refIds, operation),
    }
  }
  const capability = optionalGenerationCapability(args)
  const operation = capability && isAudioGenerationCapability(capability)
    ? generationOperationForCapability(capability, topLevelOperation ?? fallbackOperation)
    : normalizeAudioGenerationOperation(topLevelOperation ?? fallbackOperation)
  if (!operation) throw new Error(`unsupported audio_generation operation: ${topLevelOperation ?? fallbackOperation}`)
  const rawReferenceAssets = args.reference_assets ?? args.referenceAssets
  return {
    capability: 'audio_generation',
    operation,
    ...audioGenerationReferenceAssetsPayload(rawReferenceAssets, refIds, operation),
  }
}

function generationReferenceAssetsPayload(value: unknown, refIds: readonly number[]): Pick<GenerationIntentPayload, 'reference_assets'> {
  const explicit = Array.isArray(value) ? value.filter(isRecord) : []
  const source: Array<{
    reference_id?: string
    source_kind?: string
    source_id?: string | number
    source_ref?: string | number
    role: string
    media_type?: string
    resource_id?: number
  }> = explicit.length > 0
    ? explicit.map((item, index) => ({
        ...(stringField(item.reference_id ?? item.referenceId) ? { reference_id: stringField(item.reference_id ?? item.referenceId)! } : {}),
        ...(stringField(item.source_kind ?? item.sourceKind) ? { source_kind: stringField(item.source_kind ?? item.sourceKind)! } : {}),
        ...(stringOrNumberField(item.source_id ?? item.sourceId) !== undefined ? { source_id: stringOrNumberField(item.source_id ?? item.sourceId)! } : {}),
        ...(stringOrNumberField(item.source_ref ?? item.sourceRef) !== undefined ? { source_ref: stringOrNumberField(item.source_ref ?? item.sourceRef)! } : {}),
        role: getOptionalString(item, 'role') ?? 'generic',
        media_type: getOptionalString(item, 'media_type') ?? getOptionalString(item, 'mediaType'),
        resource_id: idField(item.resource_id ?? item.resourceId) ?? refIds[index],
      }))
    : refIds.map((resourceId) => ({ role: 'generic', resource_id: resourceId }))
  const complete = source.filter((item) => item.role.trim() && item.resource_id !== undefined)
  if (complete.some((item) => !item.media_type?.trim())) {
    throw new Error('reference_assets media_type is required for every input resource; pass typed reference_assets instead of bare reference_resource_ids')
  }
  const referenceAssets = complete.map((item) => ({
    ...(item.reference_id ? { reference_id: item.reference_id } : {}),
    ...(item.source_kind ? { source_kind: item.source_kind } : {}),
    ...(item.source_id !== undefined ? { source_id: item.source_id } : {}),
    ...(item.source_ref !== undefined ? { source_ref: item.source_ref } : {}),
    role: item.role.trim(),
    media_type: item.media_type!.trim(),
    resource_id: item.resource_id!,
  }))
  return referenceAssets.length > 0 ? { reference_assets: referenceAssets } : {}
}

function generationOperationArg(args: Record<string, unknown>): string | undefined {
  const explicit = args.generation_intent ?? args.generationIntent
  if (isRecord(explicit)) {
    const operation = getOptionalString(explicit, 'operation')
    if (operation) return operation
  }
  return getOptionalString(args, 'operation') ?? getOptionalString(args, 'model_operation')
}

function generationReferenceAssetsForModelList(args: Record<string, unknown>): Array<{ role: string; media_type?: string }> {
  const explicit = args.generation_intent ?? args.generationIntent
  const raw = isRecord(explicit) && (explicit.reference_assets !== undefined || explicit.referenceAssets !== undefined)
    ? explicit.reference_assets ?? explicit.referenceAssets
    : args.reference_assets ?? args.referenceAssets
  const refs = Array.isArray(raw) ? raw.filter(isRecord) : []
  if (refs.length === 0) return []
  return refs
    .map((item) => {
      const role = getOptionalString(item, 'role') ?? 'generic'
      const mediaType = getOptionalString(item, 'media_type') ?? getOptionalString(item, 'mediaType')
      return {
        role,
        ...(mediaType ? { media_type: mediaType } : {}),
      }
    })
    .filter((item) => item.role.trim())
}

function buildAudioRequest(args: Record<string, unknown>, operation: string = 'text_to_speech'): BuiltGenerationRequest {
  const { prompt, refIds } = promptAndResourceIds(args)
  const normalizedOperation = normalizeAudioGenerationOperation(operation) ?? operation
  const generationIntent = audioGenerationIntentArg(args, normalizedOperation, refIds)
  const params = { ...extraParamsArg(args.extra_params) }
  const explicitParamKeys = new Set(Object.keys(params))
  const defaultParamKeys = new Set<string>()
  assignStringParam(args, params, explicitParamKeys, 'voice')
  assignStringParam(args, params, explicitParamKeys, 'language')
  assignStringParam(args, params, explicitParamKeys, 'model')
  assignStringParam(args, params, explicitParamKeys, 'audio_format')
  assignStringParam(args, params, explicitParamKeys, 'response_format')
  assignStringParam(args, params, explicitParamKeys, 'output_format')
  assignStringParam(args, params, explicitParamKeys, 'instructions')
  assignStringParam(args, params, explicitParamKeys, 'target_language')
  assignStringParam(args, params, explicitParamKeys, 'source_language')
  assignStringParam(args, params, explicitParamKeys, 'subtitle_format')
  assignStringParam(args, params, explicitParamKeys, 'style')
  const speed = getOptionalNumeric(args, 'speed')
  if (speed !== undefined) {
    params.speed = speed
    explicitParamKeys.add('speed')
  }

  return {
    prompt,
    refIds,
    jobType: 'audio',
    generationIntent,
    timeoutMs: getOptionalNumeric(args, 'timeout_ms') ?? 180_000,
    params,
    explicitParamKeys,
    defaultParamKeys,
  }
}

async function resolveModelSelection(args: Record<string, unknown>, primaryCapability: string, fallbackCapability: string, operation?: string): Promise<ModelSelection> {
  return resolveModelSelectionWithFallback(args, primaryCapability, fallbackCapability, operation, operation)
}

async function resolveModelSelectionWithFallback(
  args: Record<string, unknown>,
  primaryCapability: string,
  fallbackCapability: string,
  operation?: string,
  fallbackOperation: string | undefined = operation,
): Promise<ModelSelection> {
  const explicit = getOptionalString(args, 'model_id')
  if (explicit) {
    const models = await generationModelsForCapabilityQueries([
      { capability: primaryCapability, operation },
      { capability: fallbackCapability, operation: fallbackOperation },
    ])
    const model = models.find((model) => modelMatchesPublicId(model, explicit))
    return { modelId: explicit, model }
  }

  const primary = await generationModelsForCapability(primaryCapability, operation)
  const fallback = primary.length > 0 ? primary : await generationModelsForCapability(fallbackCapability, fallbackOperation)
  const modelId = modelPublicId(fallback[0])
  if (!modelId) throw new Error(`No enabled generation model is configured for ${primaryCapability}`)
  const model = isRecord(fallback[0]) ? fallback[0] : undefined
  return { modelId, model }
}

async function generationModelsForCapability(capability: string, operation?: string): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams()
  params.set('capability', capability)
  if (operation) params.set('operation', operation)
  const models = await backendList(`/models?${params.toString()}`)
  return models.filter(isRecord)
}

async function generationModelsForCapabilityQueries(queries: Array<{ capability: string; operation?: string }>): Promise<Record<string, unknown>[]> {
  const byId = new Map<string, Record<string, unknown>>()
  const seen = new Set<string>()
  for (const query of queries) {
    const key = `${query.capability}\u0000${query.operation ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    for (const model of await generationModelsForCapability(query.capability, query.operation)) {
      const id = String(idField(model.id) ?? idField(model.ID) ?? modelPublicId(model) ?? byId.size)
      if (!byId.has(id)) byId.set(id, model)
    }
  }
  return Array.from(byId.values())
}

async function modelsForCapability(capability: string, operation?: string): Promise<unknown[]> {
  const result = await listModels({ capability, operation })
  return isRecord(result) && Array.isArray(result.models) ? result.models : []
}

async function modelsForCapabilities(capabilities: string[], operation?: string): Promise<Record<string, unknown>[]> {
  return modelsForCapabilityQueries(capabilities.map((capability) => ({ capability, operation })))
}

async function modelsForCapabilityQueries(queries: Array<{ capability: string; operation?: string }>): Promise<Record<string, unknown>[]> {
  const byId = new Map<string, Record<string, unknown>>()
  const seen = new Set<string>()
  for (const query of queries) {
    const key = `${query.capability}\u0000${query.operation ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    for (const model of await modelsForCapability(query.capability, query.operation)) {
      if (!isRecord(model)) continue
      const key = String(idField(model.id) ?? idField(model.ID) ?? modelPublicId(model) ?? byId.size)
      if (!byId.has(key)) byId.set(key, model)
    }
  }
  return Array.from(byId.values())
}

async function submitGenerationJob(
  args: Record<string, unknown>,
  selection: ModelSelection,
  built: BuiltGenerationRequest,
  featureKey: string,
  contentUnitCandidate?: Record<string, unknown>,
): Promise<{ job: Record<string, unknown>; paramAudit: ParamAuditItem[]; modelParams: Record<string, unknown> }> {
  const prepared = prepareGenerationParams(built, selection.model, parameterModeArg(args))
  const modelParams = submittedModelParams(prepared)
  const projectScope = await resolveGenerationProjectScope(args, { required: contentUnitCandidate !== undefined })
  const body: Record<string, unknown> = {
    model_id: selection.modelId,
    job_type: built.jobType,
    generation_intent: built.generationIntent,
    feature_key: featureKey,
    prompt: built.prompt,
    input_resource_ids: built.refIds,
    extra_params: JSON.stringify(prepared.extraParams),
  }
  if (projectScope.projectUid) body.project_uid = projectScope.projectUid
  if (projectScope.projectTitle) body.project_title = projectScope.projectTitle
  if (projectScope.projectDir) body.project_dir = projectScope.projectDir
  if (prepared.aspectRatio !== undefined) body.aspect_ratio = prepared.aspectRatio
  if (prepared.duration !== undefined) body.duration = prepared.duration
  const title = getOptionalString(args, 'title')
  if (title) body.title = title
  if (contentUnitCandidate) {
    body.content_unit_candidate = {
      ...contentUnitCandidate,
      ...(projectScope.projectUid ? { project_uid: projectScope.projectUid } : {}),
    }
  }
  const projectContext = projectScope.projectDir || projectScope.projectUid || projectScope.projectTitle
    ? {
        ...(projectScope.projectDir ? { dir: projectScope.projectDir } : {}),
        ...(projectScope.projectUid ? { uid: projectScope.projectUid } : {}),
        ...(projectScope.projectTitle ? { title: projectScope.projectTitle } : {}),
      }
    : undefined
  body.request_context = JSON.stringify({
    ...(projectContext ? { project: projectContext } : {}),
    ...(contentUnitCandidate ? { content_unit_candidate: contentUnitCandidate } : {}),
  })

  const job = await backendPost('/jobs', body)
  if (!isRecord(job)) throw new Error('Generation job create returned an invalid response')
  return { job: normalizeJob(job), paramAudit: prepared.audit, modelParams }
}

async function getGenerationJob(jobId: number): Promise<Record<string, unknown>> {
  const job = await backendGet(`/jobs/${jobId}`)
  if (!isRecord(job)) throw new Error('Generation job get returned an invalid response')
  return normalizeJob(job)
}

function submittedModelParams(prepared: PreparedGenerationParams): Record<string, unknown> {
  return {
    ...prepared.extraParams,
    ...(prepared.aspectRatio !== undefined ? { aspect_ratio: prepared.aspectRatio } : {}),
    ...(prepared.duration !== undefined ? { duration: prepared.duration } : {}),
  }
}

async function resolveGenerationProjectScope(
  args: Record<string, unknown>,
  options: { required?: boolean } = {},
): Promise<GenerationProjectScope> {
  const rawDir = getOptionalString(args, 'projectDir')
    ?? getOptionalString(args, 'project_dir')
    ?? getOptionalString(args, 'projectPath')
    ?? getOptionalString(args, 'project_path')
    ?? getOptionalString(args, 'cwd')
  const explicitProjectUid = getOptionalString(args, 'projectUid') ?? getOptionalString(args, 'project_uid')
  const explicitProjectTitle = getOptionalString(args, 'projectTitle') ?? getOptionalString(args, 'project_title')
  if (!rawDir) {
    if (options.required) throw new Error('projectDir or cwd is required for project-scoped generation tools')
    return {
      ...(explicitProjectUid ? { projectUid: explicitProjectUid } : {}),
      ...(explicitProjectTitle ? { projectTitle: explicitProjectTitle } : {}),
    }
  }
  const projectDir = resolve(rawDir)
  if (options.required) {
    const binding = await requireMCPBackendBoundProject({ projectDir, ...(explicitProjectUid ? { projectUid: explicitProjectUid } : {}) })
    return {
      projectDir,
      projectUid: binding.projectUid,
      projectTitle: explicitProjectTitle ?? binding.projectTitle,
    }
  }
  const locator = await resolveMCPProjectBindingLocator({
    projectDir,
    ...(explicitProjectUid ? { projectUid: explicitProjectUid } : {}),
  }).catch(() => undefined)
  return {
    projectDir: locator?.projectDir ?? projectDir,
    projectUid: locator?.projectUid ?? explicitProjectUid,
    projectTitle: explicitProjectTitle ?? locator?.projectTitle,
  }
}

function generationSubmitResult(kind: 'image' | 'video' | 'audio', job: Record<string, unknown>, monitorTool: string, paramAudit: ParamAuditItem[] = []): Record<string, unknown> {
  const jobId = idField(job.id) ?? idField(job.ID)
  if (jobId === undefined) throw new Error('Generation job create did not return a valid job id')
  const kindLabel = generationKindLabel(kind)
  return {
    status: 'submitted',
    terminal: false,
    jobId,
    job_id: jobId,
    monitor: { tool: monitorTool, args: { jobId } },
    message: `${kindLabel} generation job submitted (Job #${jobId})`,
    job,
    ...(paramAudit.length > 0 ? { param_audit: paramAudit, paramAudit } : {}),
  }
}

function generationJobGetResult(kind: 'image' | 'video' | 'audio', job: Record<string, unknown>, verbosity: 'summary' | 'debug' = 'debug'): Record<string, unknown> {
  const jobId = idField(job.id) ?? idField(job.ID)
  if (jobId === undefined) throw new Error('Generation job response does not include a valid job id')
  const status = stringField(job.status) ?? 'unknown'
  const outputResourceIds = outputResourceIdsFromJob(job)
  const result: Record<string, unknown> = {
    status,
    terminal: isTerminalStatus(status),
    jobId,
    job_id: jobId,
    provider_status: stringField(job.provider_status ?? job.providerStatus ?? job.external_status ?? job.externalStatus),
    outputResourceIds,
    output_resource_ids: outputResourceIds,
    ...(outputResourceIds[0] ? { output_resource_id: outputResourceIds[0], outputResourceId: outputResourceIds[0] } : {}),
    next_run_at: stringField(job.next_run_at ?? job.nextRunAt),
    error_summary: errorSummary(job),
    message: `${generationKindLabel(kind)} generation job #${jobId} status: ${status}`,
  }
  if (verbosity !== 'summary') result.job = job
  return result
}

function withGenerationJobSurface(
  args: Record<string, unknown>,
  result: Record<string, unknown>,
  contentUnitId?: string | number,
): Record<string, unknown> {
  const jobId = idField(result.job_id ?? result.jobId)
  if (jobId === undefined) return result
  return {
    ...result,
    surface: createGenerationJobSurface(args, {
      jobId,
      ...(contentUnitId !== undefined ? { contentUnitId } : {}),
      projectId: projectIdFromArgs(args),
    }),
  }
}

async function getGenerationJobs(kind: 'image' | 'video' | 'audio', args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const jobIds = normalizedJobIds(args)
  const items: Record<string, unknown>[] = []
  for (let index = 0; index < jobIds.length; index += 1) {
    const jobId = jobIds[index]!
    try {
      const result = withGenerationJobSurface(args, generationJobGetResult(kind, await getGenerationJob(jobId), verbosityArg(args)))
      items.push({
        index,
        status: 'loaded',
        jobId,
        job_id: jobId,
        terminal: result.terminal,
        outputResourceIds: result.outputResourceIds,
        output_resource_ids: result.output_resource_ids,
        result,
      })
    } catch (error) {
      items.push({
        index,
        status: 'error',
        jobId,
        job_id: jobId,
        terminal: true,
        error: errorMessage(error),
      })
    }
  }
  const successItems = items.filter((item) => item.status !== 'error')
  const failedItems = items.filter((item) => item.status === 'error')
  const terminalCount = items.filter((item) => item.terminal === true).length
  const outputResourceIds = Array.from(new Set(successItems.flatMap((item) => numericList(item.output_resource_ids))))
  return {
    status: failedItems.length === 0 ? 'loaded' : successItems.length > 0 ? 'partial_error' : 'error',
    total: jobIds.length,
    success_count: successItems.length,
    failed_count: failedItems.length,
    terminal_count: terminalCount,
    all_terminal: terminalCount === jobIds.length,
    output_resource_ids: outputResourceIds,
    outputResourceIds,
    items,
    message: `${successItems.length}/${jobIds.length} ${kind} generation job(s) loaded.`,
  }
}

function generationKindLabel(kind: 'image' | 'video' | 'audio'): string {
  if (kind === 'image') return 'Image'
  if (kind === 'video') return 'Video'
  return 'Audio'
}

function normalizeJob(job: Record<string, unknown>): Record<string, unknown> {
  const outputResourceIds = outputResourceIdsFromJob(job)
  return {
    ...job,
    ...(outputResourceIds.length > 0 ? { outputResourceIds, output_resource_ids: outputResourceIds } : {}),
  }
}

function outputResourceIdsFromJob(job: Record<string, unknown>): number[] {
  const ids: number[] = []
  appendId(ids, job.output_resource_id)
  appendId(ids, job.outputResourceId)
  appendId(ids, isRecord(job.output_resource) ? job.output_resource.id ?? job.output_resource.ID : undefined)
  appendId(ids, isRecord(job.outputResource) ? job.outputResource.id ?? job.outputResource.ID : undefined)
  appendIds(ids, job.output_resource_ids)
  appendIds(ids, job.outputResourceIds)
  return Array.from(new Set(ids))
}

function requiredGenerationCapability(args: Record<string, unknown>): GenerationCapability {
  const capability = optionalGenerationCapability(args)
  if (!capability) throw new Error('capability is required')
  return capability
}

function optionalGenerationCapability(args: Record<string, unknown>): GenerationCapability | undefined {
  const raw = getOptionalString(args, 'capability')
  if (!raw) return undefined
  const normalized = normalizeGenerationCapability(raw)
  if (!normalized) throw new Error(`unsupported generation capability: ${raw}`)
  return normalized
}

function normalizeGenerationCapability(value: string): GenerationCapability | undefined {
  const normalized = value.trim().toLowerCase().replace(/-/g, '_')
  switch (normalized) {
    case 'image_generation':
    case 'video_generation':
    case 'audio_generation':
      return normalized
    default:
      return undefined
  }
}

function generationOperationForCapability(capability: GenerationCapability, explicitOperation?: string): string | undefined {
  if (isAudioGenerationCapability(capability)) return normalizeAudioGenerationOperation(explicitOperation)
  if (explicitOperation?.trim()) return explicitOperation.trim()
  return undefined
}

function normalizeAudioGenerationOperation(operation: string | undefined): string | undefined {
  const normalized = operation?.trim().toLowerCase().replace(/-/g, '_')
  switch (normalized) {
    case 'text_to_speech':
      return 'text_to_speech'
    case 'speech_to_text':
      return 'speech_to_text'
    case 'speech_translate':
      return 'speech_translate'
    case 'speech_to_speech':
      return 'speech_to_speech'
    case 'music_generation':
      return 'music_generation'
    case 'sound_effect_generation':
      return 'sound_effect_generation'
    case 'voice_clone':
      return 'voice_clone'
    case 'voice_design':
      return 'voice_design'
    case 'dubbing':
      return 'dubbing'
    case 'voice_isolation':
      return 'voice_isolation'
    case 'forced_alignment':
      return 'forced_alignment'
    default:
      return undefined
  }
}

function audioGenerationReferenceAssetsPayload(
  value: unknown,
  refIds: readonly number[],
  operation: string,
): Pick<GenerationIntentPayload, 'reference_assets'> {
  if (value !== undefined) return generationReferenceAssetsPayload(value, refIds)
  const assets = defaultAudioReferenceAssets(operation, refIds)
  return assets.length > 0 ? { reference_assets: assets } : {}
}

function defaultAudioReferenceAssets(
  operation: string,
  refIds: readonly number[],
): NonNullable<GenerationIntentPayload['reference_assets']> {
  const normalizedOperation = normalizeAudioGenerationOperation(operation) ?? operation
  if (refIds.length === 0) return []
  const defaults = defaultAudioReferenceRoleAndMedia(normalizedOperation)
  return refIds.map((resourceId, index) => ({
    role: index === 0 ? defaults.role : defaults.additionalRole,
    media_type: defaults.mediaType,
    resource_id: resourceId,
  }))
}

function defaultAudioReferenceRoleAndMedia(operation: string): { role: string; additionalRole: string; mediaType: string } {
  switch (operation) {
    case 'speech_to_text':
    case 'speech_translate':
    case 'forced_alignment':
      return { role: 'source_audio', additionalRole: 'reference_audio', mediaType: 'audio' }
    case 'speech_to_speech':
      return { role: 'speech_audio', additionalRole: 'reference_audio', mediaType: 'audio' }
    case 'voice_clone':
      return { role: 'voice_sample', additionalRole: 'voice_sample', mediaType: 'audio' }
    default:
      return { role: 'reference_audio', additionalRole: 'reference_audio', mediaType: 'audio' }
  }
}

function generationScope(args: Record<string, unknown>): 'free' | 'content_unit' | 'asset' | 'storyboard' | 'keyframe' {
  const raw = getOptionalString(args, 'scope')
  if (raw === 'content_unit' || raw === 'asset' || raw === 'storyboard' || raw === 'keyframe') return raw
  return 'free'
}

function outputKindArg(args: Record<string, unknown>, capability?: GenerationCapability | string): GenerationOutputGroup {
  const raw = getOptionalString(args, 'outputKind') ?? getOptionalString(args, 'output_kind')
  if (raw === 'image' || raw === 'video' || raw === 'audio' || raw === 'subtitle' || raw === 'voice_profile' || raw === 'json') return raw
  return generationCapabilityOutputKind(capability)
}

function generationCapabilityOutputKind(capability?: GenerationCapability | string): GenerationOutputGroup {
  if (isImageGenerationCapability(capability)) return 'image'
  if (isVideoGenerationCapability(capability)) return 'video'
  return 'audio'
}

function audioOutputKindForOperation(operation: string | undefined): GenerationOutputGroup {
  switch (operation) {
    case 'speech_to_text':
    case 'speech_translate':
    case 'forced_alignment':
      return 'subtitle'
    case 'voice_clone':
    case 'voice_design':
      return 'voice_profile'
    default:
      return 'audio'
  }
}

function isImageGenerationCapability(capability: unknown): capability is Extract<GenerationCapability, 'image_generation'> {
  return capability === 'image_generation'
}

function isVideoGenerationCapability(capability: unknown): capability is Extract<GenerationCapability, 'video_generation'> {
  return capability === 'video_generation'
}

function isAudioGenerationCapability(capability: unknown): capability is AudioGenerationCapability {
  return capability === 'audio_generation'
}

function generationOutputJobGroup(outputKind: GenerationOutputGroup): 'image' | 'video' | 'audio' {
  if (outputKind === 'image') return 'image'
  if (outputKind === 'video') return 'video'
  return 'audio'
}

function generationV2Result(
  rawResult: unknown,
  capability: GenerationCapability | string,
  scope: ReturnType<typeof generationScope>,
  outputKind: GenerationOutputGroup,
  generationMode: string,
  candidatePolicy: string,
): unknown {
  if (!isRecord(rawResult)) {
    return {
      status: 'unknown',
      capability,
      scope,
      output_kind: outputKind,
      outputKind,
      generation_mode: generationMode,
      candidate_policy: candidatePolicy,
      result: rawResult,
    }
  }
  const jobId = idField(rawResult.job_id ?? rawResult.jobId)
  const monitorArgs = {
    ...(isRecord(rawResult.monitor) && isRecord(rawResult.monitor.args) ? rawResult.monitor.args : {}),
    ...(jobId !== undefined ? { jobId, job_id: jobId } : {}),
    capability,
    scope,
    outputKind,
    output_kind: outputKind,
  }
  return {
    ...rawResult,
    capability,
    scope,
    output_kind: outputKind,
    outputKind,
    generation_mode: stringField(rawResult.generation_mode) ?? generationMode,
    candidate_policy: stringField(rawResult.candidate_policy) ?? candidatePolicy,
    monitor: jobId !== undefined
      ? {
          tool: 'generation_job_get',
          args: monitorArgs,
        }
      : rawResult.monitor,
  }
}

function assertNeverGenerationCapability(value: never): never {
  throw new Error(`unsupported generation capability: ${String(value)}`)
}

function promptArg(args: Record<string, unknown>): string {
  const prompt = getOptionalString(args, 'prompt')
  if (!prompt) throw new Error('prompt is required')
  return prompt
}

function promptAndResourceIds(args: Record<string, unknown>): { prompt: string; refIds: number[] } {
  const rawPrompt = promptArg(args)
  return {
    prompt: normalizePromptResourceMentions(rawPrompt),
    refIds: positiveIntegerIds([
      ...resourceIdsFromMentions(rawPrompt),
      ...(resourceIds(args.input_resource_ids) ?? []),
      ...(resourceIds(args.reference_resource_ids) ?? []),
    ]),
  }
}

function normalizePromptResourceMentions(prompt: string): string {
  const mentions = parseResourceMentions(prompt)
  if (mentions.length === 0) return prompt
  let normalized = ''
  let lastIndex = 0
  for (const mention of mentions) {
    normalized += prompt.slice(lastIndex, mention.index)
    normalized += formatResourceMention(mention.id, {
      ...(mention.mediaType ? { mediaType: mention.mediaType } : {}),
      ...(mention.role ? { role: mention.role } : {}),
    })
    lastIndex = mention.index + mention.token.length
  }
  return normalized + prompt.slice(lastIndex)
}

function requiredContentUnitId(args: Record<string, unknown>): string | number {
  const value = args.contentUnitId ?? args.content_unit_id
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error('contentUnitId is required')
}

async function compiledContentUnitPrompt(args: Record<string, unknown>, contentUnitId: string | number): Promise<CompiledContentUnitPromptResult> {
  const result = await domainBuildContentUnitBackendPrompt({ ...args, contentUnitId })
  if (!isRecord(result)) throw new Error('content unit prompt compiler returned an invalid response')
  const prompt = isRecord(result.prompt) ? result.prompt : undefined
  if (!prompt) throw new Error('content unit prompt compiler did not return prompt data')
  return {
    ok: result.ok,
    prompt,
    ...(Array.isArray(result.blockers) ? { blockers: result.blockers } : {}),
  }
}

function resourceIds(value: unknown): number[] | undefined {
  if (typeof value === 'string') {
    const ids = value.split(',').map((item) => Number(item.trim()))
    return positiveIntegerIds(ids)
  }
  const values = numericValues(value)
  return values ? positiveIntegerIds(values) : undefined
}

function positiveIntegerIds(values: number[]): number[] {
  return Array.from(new Set(values.filter((id) => Number.isFinite(id) && id > 0).map((id) => Math.floor(id))))
}

function extraParamsArg(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return { ...value }
  if (typeof value === 'string' && value.trim()) {
    const parsed = JSON.parse(value) as unknown
    if (!isRecord(parsed)) throw new Error('extra_params must be an object')
    return { ...parsed }
  }
  return {}
}

function assignStringParam(args: Record<string, unknown>, params: Record<string, unknown>, explicitParamKeys: Set<string>, key: string): void {
  const value = getOptionalString(args, key)
  if (!value) return
  params[key] = value
  explicitParamKeys.add(key)
}

function assignDefaultParam(params: Record<string, unknown>, defaultParamKeys: Set<string>, key: string, value: unknown): void {
  if (params[key] !== undefined && params[key] !== null && params[key] !== '') return
  params[key] = value
  defaultParamKeys.add(key)
}

function parameterModeArg(args: Record<string, unknown>): ParameterMode {
  const raw = getOptionalString(args, 'parameter_mode') ?? getOptionalString(args, 'param_mode')
  return raw === 'strict' ? 'strict' : 'compatible'
}

function verbosityArg(args: Record<string, unknown>): 'summary' | 'debug' {
  const raw = getOptionalString(args, 'verbosity')
  return raw === 'summary' ? 'summary' : 'debug'
}

function semanticRefReplacements(prompt: Record<string, unknown>): unknown[] {
  const replacements = prompt.replacements ?? prompt.semantic_ref_replacements ?? prompt.ref_replacements
  return Array.isArray(replacements) ? replacements : []
}

function errorSummary(job: Record<string, unknown>): string | undefined {
  const direct = stringField(job.error_summary ?? job.errorSummary ?? job.error ?? job.error_message ?? job.errorMessage)
  if (direct) return direct
  const error = isRecord(job.error) ? job.error : undefined
  return stringField(error?.message)
}

function prepareGenerationParams(
  built: BuiltGenerationRequest,
  model: Record<string, unknown> | undefined,
  mode: ParameterMode,
): PreparedGenerationParams {
  const supported = supportedParamMap(model, built.generationIntent?.operation)
  const hasContract = supported !== undefined
  const output: Record<string, unknown> = {}
  const audit: ParamAuditItem[] = []
  const pending = { ...built.params }

  if (
    hasContract &&
    mode === 'compatible' &&
    !supported.has('aspect_ratio') &&
    supported.has('image_size') &&
    pending.aspect_ratio !== undefined &&
    (pending.image_size === undefined || built.defaultParamKeys.has('image_size'))
  ) {
    const mapped = aspectRatioToImageSize(String(pending.aspect_ratio), supported.get('image_size'))
    if (mapped) {
      pending.image_size = mapped
      built.defaultParamKeys.delete('image_size')
      audit.push({
        key: 'aspect_ratio',
        value: pending.aspect_ratio,
        reason: 'mapped_unsupported_aspect_ratio_to_image_size',
        source: paramSource(built, 'aspect_ratio'),
        mapped_to: 'image_size',
        mapped_value: mapped,
      })
    }
  }

  for (const [key, value] of Object.entries(pending)) {
    const source = paramSource(built, key)
    if (value === undefined || value === null || value === '') continue

    const paramDef = hasContract ? supported.get(key) : undefined
    if (hasContract && !paramDef) {
      if (mode === 'strict' && source === 'explicit') {
        throw unsupportedMCPParamError(key, model, supported)
      }
      audit.push({ key, value, reason: 'dropped_unsupported_parameter', source })
      continue
    }

    const normalized = normalizeParamValue(value, paramDef)
    const checked = hasContract && paramDef ? compatibleParamValue(key, normalized, paramDef, source, mode, model, supported, audit) : normalized
    if (checked === undefined) continue
    output[key] = checked
  }

  const { aspect_ratio, duration, ...extraParams } = output
  return {
    aspectRatio: typeof aspect_ratio === 'string' ? aspect_ratio : undefined,
    duration: numericDuration(duration),
    extraParams,
    audit,
  }
}

function compatibleParamValue(
  key: string,
  value: unknown,
  paramDef: Record<string, unknown>,
  source: 'explicit' | 'default' | 'compatible',
  mode: ParameterMode,
  model: Record<string, unknown> | undefined,
  supported: Map<string, Record<string, unknown>>,
  audit: ParamAuditItem[],
): unknown {
  const options = Array.isArray(paramDef.options) ? paramDef.options.filter((item): item is string => typeof item === 'string') : []
  if (options.length > 0 && typeof value === 'string' && !options.includes(value)) {
    if (mode === 'strict' && source === 'explicit') {
      throw invalidMCPParamOptionError(key, value, model, options)
    }
    const fallback = typeof paramDef.default === 'string' && options.includes(paramDef.default) ? paramDef.default : options[0]
    audit.push({ key, value, reason: 'replaced_invalid_option', source, mapped_value: fallback })
    return fallback
  }

  const type = typeof paramDef.type === 'string' ? paramDef.type : ''
  if (type === 'number' && typeof value === 'number') {
    const min = typeof paramDef.min === 'number' ? paramDef.min : undefined
    const max = typeof paramDef.max === 'number' ? paramDef.max : undefined
    const clamped = Math.min(max ?? value, Math.max(min ?? value, value))
    if (clamped !== value) {
      if (mode === 'strict' && source === 'explicit') {
        throw new Error(`parameter "${key}" is outside the supported range for model "${modelDisplay(model)}"`)
      }
      audit.push({ key, value, reason: 'clamped_numeric_range', source, mapped_value: clamped })
    }
    return clamped
  }

  return value
}

function supportedParamMap(model: Record<string, unknown> | undefined, operation?: string): Map<string, Record<string, unknown>> | undefined {
  if (!model) return undefined
  const operationKey = operation?.trim() || stringField(model.inferred_operation)
  const paramsByOperation = isRecord(model.supported_params_by_operation) ? model.supported_params_by_operation : undefined
  const params = operationKey && Array.isArray(paramsByOperation?.[operationKey]) ? paramsByOperation[operationKey] : undefined
  if (params) {
    return paramMapFromDefinitions(params)
  }
  const keysByOperation = isRecord(model.supported_param_keys_by_operation) ? model.supported_param_keys_by_operation : undefined
  const operationKeys = operationKey && Array.isArray(keysByOperation?.[operationKey]) ? keysByOperation[operationKey] : undefined
  if (operationKeys) {
    return new Map(operationKeys.flatMap((item) => {
      const key = stringField(item)
      return key ? [[key, { key }]] : []
    }))
  }
  const schemasByOperation = isRecord(model.params_schema_by_operation) ? model.params_schema_by_operation : undefined
  const schema = operationKey && isRecord(schemasByOperation?.[operationKey]) ? schemasByOperation[operationKey] : undefined
  const properties = isRecord(schema?.properties) ? schema.properties : undefined
  if (properties) {
    return new Map(Object.keys(properties).map((key) => [key, { key, ...(isRecord(properties[key]) ? properties[key] : {}) }]))
  }
  if (Array.isArray(model.supported_params)) {
    return paramMapFromDefinitions(model.supported_params)
  }
  return undefined
}

function paramMapFromDefinitions(params: unknown[]): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>()
  for (const item of params) {
    if (!isRecord(item)) continue
    const key = stringField(item.key)
    if (key) out.set(key, item)
  }
  return out
}

function aspectRatioToImageSize(aspectRatio: string, imageSizeParam: Record<string, unknown> | undefined): string | undefined {
  const options = Array.isArray(imageSizeParam?.options) ? imageSizeParam.options.filter((item): item is string => typeof item === 'string') : []
  const byRatio: Record<string, string[]> = {
    '1:1': ['2048x2048', '1024x1024', '4096x4096'],
    '4:3': ['2304x1728'],
    '3:4': ['1728x2304'],
    '16:9': ['2848x1600', '1792x1024', '1536x1024', '1280x720'],
    '9:16': ['1600x2848', '1024x1792', '1024x1536', '720x1280'],
  }
  for (const candidate of byRatio[aspectRatio] ?? []) {
    if (options.includes(candidate)) return candidate
  }
  return undefined
}

function normalizeParamValue(value: unknown, paramDef: Record<string, unknown> | undefined): unknown {
  if (!paramDef) return value
  if (paramDef.type === 'number' && typeof value === 'string' && value.trim()) {
    const number = Number(value)
    return Number.isFinite(number) ? number : value
  }
  if (paramDef.type === 'boolean' && typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return value
}

function numericDuration(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function paramSource(built: BuiltGenerationRequest, key: string): 'explicit' | 'default' | 'compatible' {
  if (built.explicitParamKeys.has(key)) return 'explicit'
  if (built.defaultParamKeys.has(key)) return 'default'
  return 'compatible'
}

function unsupportedMCPParamError(key: string, model: Record<string, unknown> | undefined, supported: Map<string, Record<string, unknown>>): Error {
  const allowed = Array.from(supported.keys()).sort()
  const err = new Error(`parameter "${key}" is not supported by model "${modelDisplay(model)}"; supported parameters: ${allowed.join(', ') || '(none)'}`)
  Object.assign(err, {
    code: 'UNSUPPORTED_PARAMETER',
    field: key,
    supported_params: allowed,
  })
  return err
}

function invalidMCPParamOptionError(key: string, value: unknown, model: Record<string, unknown> | undefined, options: string[]): Error {
  const err = new Error(`parameter "${key}" value ${JSON.stringify(value)} is not supported by model "${modelDisplay(model)}"; allowed values: ${options.join(', ')}`)
  Object.assign(err, {
    code: 'INVALID_PARAMETER_OPTION',
    field: key,
    allowed_values: options,
  })
  return err
}

function normalizedJobId(args: Record<string, unknown>): number {
  const jobId = getOptionalNumeric(args, 'jobId') ?? getOptionalNumeric(args, 'job_id')
  if (jobId === undefined || !Number.isInteger(jobId) || jobId <= 0) throw new Error('jobId must be a positive integer')
  return jobId
}

function normalizedJobIds(args: Record<string, unknown>): number[] {
  const rawIds = Array.isArray(args.jobIds)
    ? args.jobIds
    : Array.isArray(args.job_ids)
      ? args.job_ids
      : undefined
  const ids = rawIds
    ? rawIds.map((value) => idField(value)).filter((value): value is number => value !== undefined)
    : Array.isArray(args.items)
      ? args.items.map((item) => isRecord(item) ? normalizedJobId(item) : undefined).filter((value): value is number => value !== undefined)
      : []
  const unique = Array.from(new Set(ids))
  if (unique.length === 0) throw new Error('jobIds must contain at least one positive integer')
  return unique
}

function modelPublicId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  return stringField(value.model_id) ?? stringField(value.logical_model_id) ?? stringField(value.model_def_id)
}

function modelMatchesPublicId(model: Record<string, unknown>, publicId: string): boolean {
  const ids = [
    modelPublicId(model),
    stringField(model.model_id),
    stringField(model.logical_model_id),
    stringField(model.model_def_id),
    idField(model.id) !== undefined ? `backend.model.${idField(model.id)}` : undefined,
    idField(model.ID) !== undefined ? `backend.model.${idField(model.ID)}` : undefined,
  ]
  return ids.includes(publicId)
}

function modelDisplay(model: Record<string, unknown> | undefined): string {
  return stringField(model?.display_name)
    ?? stringField(model?.short_name)
    ?? (model ? modelPublicId(model) : undefined)
    ?? 'selected model'
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringOrNumberField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return stringField(value)
}

function idField(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(number) && number > 0 ? number : undefined
}

function appendId(ids: number[], value: unknown): void {
  const id = idField(value)
  if (id !== undefined) ids.push(id)
}

function appendIds(ids: number[], value: unknown): void {
  if (!Array.isArray(value)) return
  for (const item of value) appendId(ids, item)
}

function numericList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map(idField).filter((item): item is number => item !== undefined)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.trim().toLowerCase())
}

function isSuccessfulStatus(status: string): boolean {
  return SUCCESS_STATUSES.has(status.trim().toLowerCase())
}

const TERMINAL_STATUSES = new Set(['succeeded', 'succeed', 'success', 'completed', 'complete', 'done', 'finished', 'failed', 'failure', 'error', 'cancelled', 'canceled'])
const SUCCESS_STATUSES = new Set(['succeeded', 'succeed', 'success', 'completed', 'complete', 'done', 'finished'])
