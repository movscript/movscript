import type { CanvasNodeData, NodeType, ParamDef, PublicModel } from '@/types'

type GenerationOutputType = 'image' | 'video' | 'text'

const ASPECT_RATIO_PARAM: ParamDef = {
  key: 'aspect_ratio',
  label: 'Aspect ratio',
  type: 'select',
  options: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  default: '1:1',
}

const SEED_PARAM: ParamDef = {
  key: 'seed',
  label: 'Seed',
  type: 'number',
  min: -1,
  max: 2147483647,
  step: 1,
}

const IMAGE_QUALITY_PARAM: ParamDef = {
  key: 'quality',
  label: 'Quality',
  type: 'select',
  options: ['standard', 'high'],
  default: 'standard',
}

const IMAGE_STRENGTH_PARAM: ParamDef = {
  key: 'guidance_scale',
  label: 'Guidance',
  type: 'number',
  min: 1,
  max: 20,
  step: 0.5,
  default: 7,
}

const DURATION_PARAM: ParamDef = {
  key: 'duration',
  label: 'Duration',
  type: 'number',
  min: 1,
  max: 30,
  step: 1,
  default: 5,
}

const VIDEO_RESOLUTION_PARAM: ParamDef = {
  key: 'resolution',
  label: 'Resolution',
  type: 'select',
  options: ['480p', '720p', '1080p'],
  default: '720p',
}

const CAMERA_FIXED_PARAM: ParamDef = {
  key: 'camera_fixed',
  label: 'Fixed camera',
  type: 'boolean',
  default: false,
}

const TEXT_TEMPERATURE_PARAM: ParamDef = {
  key: 'temperature',
  label: 'Temperature',
  type: 'number',
  min: 0,
  max: 2,
  step: 0.1,
  default: 0.7,
}

const TEXT_MAX_TOKENS_PARAM: ParamDef = {
  key: 'max_tokens',
  label: 'Max tokens',
  type: 'number',
  min: 256,
  max: 200000,
  step: 256,
  default: 4096,
}

const VIEW_COUNT_PARAM: ParamDef = {
  key: 'max_images',
  label: 'Views',
  type: 'select',
  options: ['3', '4', '6'],
  default: '4',
}

const PRESERVE_IDENTITY_PARAM: ParamDef = {
  key: 'preserve_identity',
  label: 'Preserve identity',
  type: 'boolean',
  default: true,
}

const COMMON_IMAGE_PARAMS = [ASPECT_RATIO_PARAM, IMAGE_QUALITY_PARAM, IMAGE_STRENGTH_PARAM, SEED_PARAM]
const COMMON_VIDEO_PARAMS = [ASPECT_RATIO_PARAM, DURATION_PARAM, VIDEO_RESOLUTION_PARAM, CAMERA_FIXED_PARAM, SEED_PARAM]
const COMMON_TEXT_PARAMS = [TEXT_TEMPERATURE_PARAM, TEXT_MAX_TOKENS_PARAM]

const NODE_PARAM_DEFS: Partial<Record<NodeType, ParamDef[]>> = {
  image: COMMON_IMAGE_PARAMS,
  ref_image_gen: COMMON_IMAGE_PARAMS,
  style_transfer: [ASPECT_RATIO_PARAM, IMAGE_STRENGTH_PARAM, PRESERVE_IDENTITY_PARAM, SEED_PARAM],
  multi_angle: [ASPECT_RATIO_PARAM, VIEW_COUNT_PARAM, IMAGE_QUALITY_PARAM, SEED_PARAM],
  video: COMMON_VIDEO_PARAMS,
  ref_video_gen: COMMON_VIDEO_PARAMS,
  motion_imitation: [ASPECT_RATIO_PARAM, DURATION_PARAM, VIDEO_RESOLUTION_PARAM, PRESERVE_IDENTITY_PARAM, SEED_PARAM],
  text: COMMON_TEXT_PARAMS,
  text_gen: COMMON_TEXT_PARAMS,
}

export function canvasGenerationParamDefs(nodeType: NodeType | string, outputType?: GenerationOutputType, model?: PublicModel | null): ParamDef[] {
  if (model?.supported_params && model.supported_params.length > 0) return model.supported_params
  if (nodeType === 'ai_gen') {
    if (outputType === 'video') return COMMON_VIDEO_PARAMS
    if (outputType === 'text') return COMMON_TEXT_PARAMS
    return COMMON_IMAGE_PARAMS
  }
  return NODE_PARAM_DEFS[nodeType as NodeType] ?? []
}

export function canvasParamValue(data: CanvasNodeData, param: ParamDef): string | number | boolean {
  const value = data.params?.[param.key]
  if (value === undefined || value === null || value === '') return param.default ?? ''
  if (param.type === 'boolean') return value === true || value === 'true'
  if (param.type === 'number') return typeof value === 'number' ? value : Number(value)
  return String(value)
}

export function canvasParamValues(data: CanvasNodeData, params: ParamDef[]): Record<string, string | number | boolean> {
  return Object.fromEntries(params.map((param) => [param.key, canvasParamValue(data, param)]))
}

export function canvasDefaultParamValues(params: ParamDef[]): Record<string, unknown> {
  return Object.fromEntries(
    params
      .filter((param) => param.default !== undefined)
      .map((param) => [param.key, param.default])
  )
}

export function updateCanvasParam(data: CanvasNodeData, key: string, value: string | number | boolean): Record<string, unknown> {
  const next = { ...(data.params ?? {}) }
  if (value === '' || value === undefined || value === null) {
    delete next[key]
  } else {
    next[key] = value
  }
  return next
}
