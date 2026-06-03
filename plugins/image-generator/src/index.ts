import type {
  AgentToolCall,
  AgentToolHandlers,
  CanvasExecutableSpec,
  GenerateMediaJobType,
  GenerateMediaRequest,
  MovPluginHost,
  PluginRunResult,
} from '@movscript/plugin-sdk'

interface PluginArgs extends Record<string, unknown> {
  prompt?: string
  title?: string
  negative_prompt?: string
  model_id?: string
  reference_resource_ids?: string | number[]
  input_resource_ids?: number[]
  aspect_ratio?: string
  image_size?: string
  quality?: string
  steps?: number | string
  seed?: number | string
  extra_params?: Record<string, unknown>
  timeout_ms?: number | string
}

interface JobGetArgs extends Record<string, unknown> {
  jobId?: number | string
  job_id?: number | string
}

interface BuiltImageRequest {
  prompt: string
  refIds: number[]
  jobType: Extract<GenerateMediaJobType, 'image' | 'image_edit'>
  aspectRatio: string
  timeoutMs: number
  extraParams: Record<string, unknown>
}

function buildRequest(args: PluginArgs): BuiltImageRequest {
  const prompt = String(args.prompt ?? '').trim()
  if (!prompt) throw new Error('prompt 不能为空')

  const refIds = resourceIds(args.input_resource_ids) ?? resourceIds(args.reference_resource_ids) ?? []
  const jobType: BuiltImageRequest['jobType'] = refIds.length > 0 ? 'image_edit' : 'image'
  const aspectRatio = String(args.aspect_ratio ?? '1:1')
  const imageSize = String(args.image_size ?? '1024x1024')
  const timeoutMs = Number(args.timeout_ms ?? 180_000)

  const extraParams: Record<string, unknown> = { image_size: imageSize, ...(args.extra_params ?? {}) }
  if (args.quality !== undefined && args.quality !== null && String(args.quality).trim() !== '') {
    extraParams.quality = String(args.quality)
  }
  if (args.negative_prompt) extraParams.negative_prompt = String(args.negative_prompt)
  if (args.steps) extraParams.steps = Number(args.steps)
  if (args.seed) extraParams.seed = Number(args.seed)

  return { prompt, refIds, jobType, aspectRatio, timeoutMs, extraParams }
}

function compileImageGenerate(args: PluginArgs): CanvasExecutableSpec {
  const { prompt, refIds, jobType, aspectRatio, extraParams } = buildRequest(args)
  return {
    executor: 'ai_model',
    capability: jobType,
    featureKey: 'plugin.image_generator',
    modelId: String(args.model_id ?? '').trim() || undefined,
    prompt,
    inputResourceIds: refIds,
    aspectRatio,
    params: extraParams,
  }
}

async function resolveModelId(host: MovPluginHost, args: PluginArgs, jobType: BuiltImageRequest['jobType']): Promise<string> {
  let modelId = String(args.model_id ?? '').trim()
  if (modelId) return modelId
  const models = await host.generation.models(jobType)
  if (models.length === 0) {
    const fallback = await host.generation.models(jobType === 'image_edit' ? 'image' : 'image_edit')
    if (fallback.length === 0) throw new Error('没有可用的图像模型配置，请在管理后台添加')
    modelId = fallback[0].model_id || fallback[0].logical_model_id || ''
  } else {
    modelId = models[0].model_id || models[0].logical_model_id || ''
  }
  if (!modelId) throw new Error('没有可用的图像模型 ID，请在管理后台检查模型配置')
  return modelId
}

function generationRequest(args: PluginArgs, modelId: string, built: BuiltImageRequest): GenerateMediaRequest {
  return {
    model_id: modelId,
    ...(typeof args.title === 'string' && args.title.trim() ? { title: args.title.trim() } : {}),
    job_type: built.jobType,
    feature_key: 'plugin.image_generator',
    prompt: built.prompt,
    input_resource_ids: built.refIds,
    aspect_ratio: built.aspectRatio,
    extra_params: built.extraParams,
    timeout_ms: built.timeoutMs,
  }
}

async function runCanvasImageGenerate(host: MovPluginHost, args: PluginArgs): Promise<PluginRunResult> {
  const built = buildRequest(args)
  const modelId = await resolveModelId(host, args, built.jobType)
  const job = await host.generation.submit(generationRequest(args, modelId, built))

  const lines: string[] = [
    `图像生成任务已提交 (Job #${job.id || 'unknown'})`,
    `状态: ${job.status}`,
  ]
  if (job.outputResourceIds?.length) lines.push(`输出资源 ID: ${job.outputResourceIds.join(', ')}`)
  if (built.refIds.length > 0) lines.push(`参考资源: ${built.refIds.join(', ')}`)

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    data: job,
  }
}

async function runImageGenerateAgentTool(host: MovPluginHost, args: PluginArgs): Promise<PluginRunResult> {
  const built = buildRequest(args)
  const modelId = await resolveModelId(host, args, built.jobType)
  const job = await host.generation.submit(generationRequest(args, modelId, built))
  const jobId = Number(job.id)
  if (!Number.isInteger(jobId) || jobId <= 0) throw new Error('生成任务创建后没有返回有效 Job ID')

  return {
    content: [{ type: 'text', text: `图像生成任务已提交 (Job #${jobId})` }],
    data: {
      status: 'submitted',
      terminal: false,
      jobId,
      job_id: jobId,
      monitor: {
        tool: 'generation_image_job_get',
        args: { jobId },
      },
      job,
    },
  }
}

async function runImageJobGetAgentTool(host: MovPluginHost, args: JobGetArgs): Promise<PluginRunResult> {
  const jobId = normalizedJobId(args)
  const job = await host.generation.getJob(jobId)
  const terminal = isTerminalStatus(job.status)
  const outputResourceIds = job.outputResourceIds ?? []
  const lines = [
    `图像生成任务 Job #${jobId} 状态: ${job.status}`,
    ...(outputResourceIds.length > 0 ? [`输出资源 ID: ${outputResourceIds.join(', ')}`] : []),
  ]
  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    data: {
      status: job.status,
      terminal,
      jobId,
      job_id: jobId,
      outputResourceIds,
      output_resource_ids: outputResourceIds,
      job,
    },
  }
}

export const agentTools: AgentToolHandlers = {
  generation_image_generate: {
    compile: compileImageGenerate,
    run: runImageGenerateAgentTool,
  },
  generation_image_job_get: {
    run: runImageJobGetAgentTool,
  },
}

export function compile(args: PluginArgs): CanvasExecutableSpec {
  return compileImageGenerate(args)
}

export async function run(host: MovPluginHost, args: PluginArgs): Promise<PluginRunResult> {
  return runCanvasImageGenerate(host, args)
}

export async function runAgentTool(host: MovPluginHost, call: AgentToolCall): Promise<PluginRunResult> {
  const handler = agentTools[call.name]
  if (!handler) throw new Error(`未知插件工具: ${call.name}`)
  return await handler.run(host, call.args)
}

function resourceIds(value: PluginArgs['reference_resource_ids'] | PluginArgs['input_resource_ids']): number[] | undefined {
  if (Array.isArray(value)) {
    const ids = value
      .map((item) => Number(item))
      .filter((id) => Number.isFinite(id) && id > 0)
      .map((id) => Math.floor(id))
    return Array.from(new Set(ids))
  }
  if (typeof value !== 'string') return undefined
  const ids = value
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((id) => Number.isFinite(id) && id > 0)
    .map((id) => Math.floor(id))
  return Array.from(new Set(ids))
}

function normalizedJobId(args: JobGetArgs): number {
  const value = args.jobId ?? args.job_id
  const jobId = Number(value)
  if (!Number.isInteger(jobId) || jobId <= 0) throw new Error('jobId 必须是正整数')
  return jobId
}

function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.trim().toLowerCase())
}

const TERMINAL_STATUSES = new Set(['succeeded', 'succeed', 'success', 'completed', 'complete', 'done', 'finished', 'failed', 'failure', 'error', 'cancelled', 'canceled'])
