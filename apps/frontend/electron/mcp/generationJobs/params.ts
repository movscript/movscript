export function defaultGenerationJobTitle(jobType: string): string {
  const labels: Record<string, string> = {
    image: '文生图',
    image_edit: '参考生图',
    video: '文生视频',
    video_i2v: '参考生视频',
    video_v2v: '视频迁移',
  }
  return `${labels[jobType] ?? '生成任务'}-${Math.floor(1000 + Math.random() * 9000)}`
}

export function generationOutputCount(args: Record<string, unknown>, submittedParams: Record<string, unknown> | undefined): number {
  const raw = args.output_count
    ?? args.outputCount
    ?? args.image_count
    ?? args.imageCount
    ?? submittedParams?.image_count
    ?? submittedParams?.max_images
  if (raw === undefined || raw === null || raw === '') return 1
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN
  if (!Number.isInteger(value) || value < 1 || value > 15) {
    throw new Error('output_count must be an integer between 1 and 15')
  }
  return value
}

export function singleOutputGenerationExtraParams(submittedParams: Record<string, unknown> | undefined): string | undefined {
  if (!submittedParams) return undefined
  const params = { ...submittedParams }
  delete params.image_count
  delete params.max_images
  delete params.sequential_image_generation
  const keys = Object.keys(params)
  return keys.length > 0 ? JSON.stringify(params) : undefined
}
