import type { ExecutableSpec, MovRuntime, ToolResult } from '@movscript/plugin-sdk'

interface PluginArgs {
  prompt: string
  negative_prompt?: string
  model_config_id?: number | string
  reference_resource_ids?: string
  aspect_ratio?: string
  image_size?: string
  quality?: string
  steps?: number | string
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

  const isEdit = refIds.length > 0
  const aspectRatio = String(args.aspect_ratio ?? '1:1')
  const imageSize = String(args.image_size ?? '1024x1024')
  const quality = String(args.quality ?? 'standard')
  const timeoutMs = Number(args.timeout_ms ?? 180_000)

  const extraParams: Record<string, unknown> = { image_size: imageSize, quality }
  if (args.negative_prompt) extraParams.negative_prompt = String(args.negative_prompt)
  if (args.steps) extraParams.steps = Number(args.steps)
  if (args.seed) extraParams.seed = Number(args.seed)

  return { prompt, refIds, isEdit, aspectRatio, timeoutMs, extraParams }
}

export function compile(args: PluginArgs): ExecutableSpec {
  const { prompt, refIds, isEdit, aspectRatio, extraParams } = buildRequest(args)
  const modelConfigId = Number(args.model_config_id)
  return {
    executor: 'ai_model',
    capability: isEdit ? 'image_edit' : 'image',
    featureKey: 'plugin.image_generator',
    modelDbId: Number.isFinite(modelConfigId) ? modelConfigId : undefined,
    prompt,
    inputResourceIds: refIds,
    aspectRatio,
    params: extraParams,
  }
}

export async function run(mov: MovRuntime, args: PluginArgs): Promise<ToolResult> {
  const { prompt, refIds, isEdit, aspectRatio, timeoutMs, extraParams } = buildRequest(args)

  let modelConfigId = Number(args.model_config_id)
  if (!modelConfigId || !Number.isFinite(modelConfigId)) {
    const capability = isEdit ? 'image_edit' : 'image'
    const models = await mov.models(capability)
    if (models.length === 0) {
      const fallback = await mov.models(isEdit ? 'image' : 'image_edit')
      if (fallback.length === 0) throw new Error('没有可用的图像模型配置，请在管理后台添加')
      modelConfigId = fallback[0].id
    } else {
      modelConfigId = models[0].id
    }
  }

  const job = await mov.generateMedia({
    model_config_id: modelConfigId,
    job_type: isEdit ? 'image_edit' : 'image',
    feature_key: 'plugin.image_generator',
    prompt,
    input_resource_ids: refIds,
    aspect_ratio: aspectRatio,
    extra_params: extraParams,
    timeout_ms: timeoutMs,
  }) as { ID: number; status: string; output_resource_ids?: number[] }

  const lines: string[] = [
    `图像生成完成 (Job #${job.ID})`,
    `状态: ${job.status}`,
  ]
  if (job.output_resource_ids?.length) lines.push(`输出资源 ID: ${job.output_resource_ids.join(', ')}`)
  if (isEdit) lines.push(`参考图: ${refIds.join(', ')}`)

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    data: job,
  }
}
