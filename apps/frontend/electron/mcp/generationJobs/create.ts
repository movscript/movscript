import { backendPost } from '../backendClient'
import { getMCPContextSnapshot } from '../context/store'
import { getJobId } from '../generation'
import {
  buildGenerationParamValidationAudit,
  buildSubmittedGenerationInputs,
  getGenerationModelParamContract,
  inferGenerationJobType,
  normalizeGenerationExtraParams,
  preflightGenerationInputs,
  preflightGenerationParams,
  resolveGenerationModelRouteForMcp,
} from '../generationModelContracts'
import {
  defaultGenerationJobTitle,
  generationOutputCount,
  singleOutputGenerationExtraParams,
} from './params'
import {
  buildCompletedGenerationJobResult,
  buildQueuedGenerationJobResult,
} from './results'
import {
  clampNumber,
  getNumberArray,
  getOptionalNumeric,
  getOptionalString,
  getRequiredString,
} from './utils'
import { waitForGenerationJob } from './wait'

export async function createGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  const prompt = getRequiredString(args, 'prompt').trim()
  if (!prompt) throw new Error('prompt is required')

  const inputResourceIds = getNumberArray(args.input_resource_ids ?? args.inputResourceIds ?? args.reference_resource_ids)
  const jobType = inferGenerationJobType(args, inputResourceIds)
  const requestedModelId = getOptionalString(args, 'model_id') ?? getOptionalString(args, 'modelId')
  const legacyModelConfigId = getOptionalNumeric(args, 'model_config_id') ?? getOptionalNumeric(args, 'modelConfigId')
  const modelRoute = await resolveGenerationModelRouteForMcp(jobType, requestedModelId, legacyModelConfigId)
  const modelConfigId = modelRoute.modelConfigId
  if (!modelRoute.modelId) throw new Error(`没有可用的 ${jobType} model_id，请先在管理后台检查模型配置`)
  const projectId = getOptionalNumeric(args, 'projectId') ?? getMCPContextSnapshot().project?.id
  let aspectRatio = getOptionalString(args, 'aspect_ratio')
  const duration = getOptionalNumeric(args, 'duration')
  const sourceKey = getOptionalString(args, 'feature_key') ?? getOptionalString(args, 'featureKey') ?? 'agent.chat_generation'
  const modelParamContract = await getGenerationModelParamContract(modelConfigId, jobType)
  const supportedParamKeys = modelParamContract?.supportedParamKeys
  const extraParamAudit = normalizeGenerationExtraParams(args.extra_params, supportedParamKeys)
  const outputCount = generationOutputCount(args, extraParamAudit.submittedParams)
  const extraParams = outputCount > 1 ? singleOutputGenerationExtraParams(extraParamAudit.submittedParams) : extraParamAudit.extraParams
  if (aspectRatio && supportedParamKeys && !supportedParamKeys.has('aspect_ratio')) {
    aspectRatio = undefined
  }
  const submittedParamsForPreflight: Record<string, unknown> = {
    ...(extraParamAudit.submittedParams ?? {}),
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    ...(duration !== undefined ? { duration } : {}),
  }
  const preflightErrors = preflightGenerationParams(submittedParamsForPreflight, modelParamContract)
  const inputPreflightErrors = preflightGenerationInputs(jobType, inputResourceIds.length, modelParamContract)
  const paramValidation = buildGenerationParamValidationAudit(modelConfigId, modelParamContract, extraParamAudit, {
    aspectRatioRequested: getOptionalString(args, 'aspect_ratio'),
    aspectRatioSubmitted: aspectRatio,
    preflightErrors,
    submittedInputs: buildSubmittedGenerationInputs(jobType, inputResourceIds.length),
    inputPreflightErrors,
  })
  const title = getOptionalString(args, 'title') ?? defaultGenerationJobTitle(jobType)

  const createBody = (index: number) => ({
    model_id: modelRoute.modelId,
    job_type: jobType,
    feature_key: sourceKey,
    title: outputCount > 1 ? `${title}-${index + 1}/${outputCount}` : title,
    prompt,
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(extraParams ? { extra_params: extraParams } : {}),
    ...(inputResourceIds.length > 0 ? { input_resource_ids: inputResourceIds } : {}),
    ...(projectId ? { project_id: projectId } : {}),
  })

  const jobs = await Promise.all(Array.from({ length: outputCount }, (_, index) => backendPost('/jobs', createBody(index))))
  const initialJobId = getJobId(jobs[0])
  const wait = args.wait !== false && outputCount === 1
  if (!wait) {
    return buildQueuedGenerationJobResult({
      args,
      jobs,
      jobType,
      outputCount,
      projectId,
      paramValidation,
    })
  }
  if (!initialJobId) throw new Error('generation job was created without an ID')

  const timeoutMs = getOptionalNumeric(args, 'timeout_ms') ?? (jobType.startsWith('video') ? 600_000 : 180_000)
  const pollIntervalMs = clampNumber(getOptionalNumeric(args, 'poll_interval_ms') ?? 2500, 500, 15_000)
  const finalJob = await waitForGenerationJob(initialJobId, timeoutMs, pollIntervalMs)
  return buildCompletedGenerationJobResult({
    jobId: initialJobId,
    finalJob,
    paramValidation,
  })
}
