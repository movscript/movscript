import type { ExecutableSpec, MovRuntime, ToolResult } from '@movscript/plugin-sdk'

interface PluginArgs {
  prompt: string
  model_id?: string
  reference_resource_ids?: string
  aspect_ratio?: string
  duration?: number | string
  quality?: string
  fps?: number | string
  seed?: number | string
  timeout_ms?: number | string
}

function buildRequest(args: PluginArgs) {
  const prompt = String(args.prompt ?? '').trim()
  if (!prompt) throw new Error('prompt 不能为空')

  const refIds = String(args.reference_resource_ids ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((id) => Number.isFinite(id) && id > 0)

  const jobType = refIds.length > 0 ? 'video_i2v' : 'video'
  const aspectRatio = String(args.aspect_ratio ?? '16:9')
  const duration = Number(args.duration ?? 5)
  const timeoutMs = Number(args.timeout_ms ?? 600_000)

  const extraParams: Record<string, unknown> = {
    quality: String(args.quality ?? 'standard'),
  }
  if (args.fps) extraParams.fps = Number(args.fps)
  if (args.seed) extraParams.seed = Number(args.seed)

  return { prompt, refIds, jobType, aspectRatio, duration, timeoutMs, extraParams }
}

export function compile(args: PluginArgs): ExecutableSpec {
  const { prompt, refIds, jobType, aspectRatio, duration, extraParams } = buildRequest(args)
  return {
    executor: 'ai_model',
    capability: jobType,
    featureKey: 'plugin.video_generator',
    modelId: String(args.model_id ?? '').trim() || undefined,
    prompt,
    inputResourceIds: refIds,
    aspectRatio,
    duration,
    params: extraParams,
  }
}

export async function run(mov: MovRuntime, args: PluginArgs): Promise<ToolResult> {
  const { prompt, refIds, jobType, aspectRatio, duration, timeoutMs, extraParams } = buildRequest(args)

  let modelId = String(args.model_id ?? '').trim()
  if (!modelId) {
    const models = await mov.models(jobType)
    if (models.length === 0) {
      const fallback = await mov.models('video')
      if (fallback.length === 0) throw new Error('没有可用的视频模型配置，请在管理后台添加')
      modelId = fallback[0].model_id || fallback[0].logical_model_id || ''
    } else {
      modelId = models[0].model_id || models[0].logical_model_id || ''
    }
  }
  if (!modelId) throw new Error('没有可用的视频模型 ID，请在管理后台检查模型配置')

  const job = await mov.generateMedia({
    model_id: modelId,
    job_type: jobType,
    feature_key: 'plugin.video_generator',
    prompt,
    input_resource_ids: refIds,
    aspect_ratio: aspectRatio,
    duration,
    extra_params: extraParams,
    timeout_ms: timeoutMs,
  }) as { ID: number; status: string; output_resource_ids?: number[] }

  const lines: string[] = [
    `视频生成完成 (Job #${job.ID})`,
    `状态: ${job.status}`,
  ]
  if (job.output_resource_ids?.length) lines.push(`输出资源 ID: ${job.output_resource_ids.join(', ')}`)
  if (refIds.length > 0) lines.push(`参考资源: ${refIds.join(', ')}`)

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    data: job,
  }
}
