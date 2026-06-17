import type { GenerationParamValue } from './jobPayload.js'

export type GenerationOutputType = 'image' | 'video' | 'audio' | 'text'
export type GenerationParamControlType = 'select' | 'number' | 'boolean' | 'string'

export interface GenerationParamDef {
  key: string
  label: string
  type: GenerationParamControlType
  options?: string[]
  default?: GenerationParamValue
  min?: number
  max?: number
  step?: number
  json_schema?: Record<string, unknown>
  conflicts_with?: string[]
  conditional_enum?: Array<{
    when_param: string
    when_value: GenerationParamValue
    options: string[]
  }>
  conditional_const?: Array<{
    when_param: string
    when_value: GenerationParamValue
    value: GenerationParamValue
  }>
  requires_value?: Array<{
    param: string
    value: GenerationParamValue
  }>
}

export interface GenerationParamModelLike {
  supported_params?: GenerationParamDef[]
}

export interface CanvasGenerationParamNodeDataLike {
  params?: Record<string, unknown> | null
}

const ASPECT_RATIO_PARAM: GenerationParamDef = {
  key: 'aspect_ratio',
  label: 'Aspect ratio',
  type: 'select',
  options: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  default: '1:1',
}

const SEED_PARAM: GenerationParamDef = {
  key: 'seed',
  label: 'Seed',
  type: 'number',
  min: -1,
  max: 2147483647,
  step: 1,
}

const IMAGE_QUALITY_PARAM: GenerationParamDef = {
  key: 'quality',
  label: 'Quality',
  type: 'select',
  options: ['standard', 'high'],
  default: 'standard',
}

const IMAGE_STRENGTH_PARAM: GenerationParamDef = {
  key: 'guidance_scale',
  label: 'Guidance',
  type: 'number',
  min: 1,
  max: 20,
  step: 0.5,
  default: 7,
}

const DURATION_PARAM: GenerationParamDef = {
  key: 'duration',
  label: 'Duration',
  type: 'number',
  min: 1,
  max: 30,
  step: 1,
  default: 5,
}

const VIDEO_RESOLUTION_PARAM: GenerationParamDef = {
  key: 'resolution',
  label: 'Resolution',
  type: 'select',
  options: ['480p', '720p', '1080p'],
  default: '720p',
}

const CAMERA_FIXED_PARAM: GenerationParamDef = {
  key: 'camera_fixed',
  label: 'Fixed camera',
  type: 'boolean',
  default: false,
}

const TEXT_TEMPERATURE_PARAM: GenerationParamDef = {
  key: 'temperature',
  label: 'Temperature',
  type: 'number',
  min: 0,
  max: 2,
  step: 0.1,
  default: 0.7,
}

const TEXT_MAX_TOKENS_PARAM: GenerationParamDef = {
  key: 'max_tokens',
  label: 'Max tokens',
  type: 'number',
  min: 256,
  max: 200000,
  step: 256,
  default: 4096,
}

const AUDIO_VOICE_PARAM: GenerationParamDef = {
  key: 'voice',
  label: 'Voice',
  type: 'string',
  default: '',
}

const AUDIO_FORMAT_PARAM: GenerationParamDef = {
  key: 'response_format',
  label: 'Audio format',
  type: 'select',
  options: ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'],
  default: 'mp3',
}

const AUDIO_SPEED_PARAM: GenerationParamDef = {
  key: 'speed',
  label: 'Speed',
  type: 'number',
  min: 0.25,
  max: 4,
  step: 0.01,
  default: 1,
}

const VIEW_COUNT_PARAM: GenerationParamDef = {
  key: 'max_images',
  label: 'Views',
  type: 'select',
  options: ['3', '4', '6'],
  default: '4',
}

const PRESERVE_IDENTITY_PARAM: GenerationParamDef = {
  key: 'preserve_identity',
  label: 'Preserve identity',
  type: 'boolean',
  default: true,
}

const COMMON_IMAGE_PARAMS = [ASPECT_RATIO_PARAM, IMAGE_QUALITY_PARAM, IMAGE_STRENGTH_PARAM, SEED_PARAM]
const COMMON_VIDEO_PARAMS = [ASPECT_RATIO_PARAM, DURATION_PARAM, VIDEO_RESOLUTION_PARAM, CAMERA_FIXED_PARAM, SEED_PARAM]
const COMMON_AUDIO_PARAMS = [AUDIO_VOICE_PARAM, AUDIO_FORMAT_PARAM, AUDIO_SPEED_PARAM]
const COMMON_TEXT_PARAMS = [TEXT_TEMPERATURE_PARAM, TEXT_MAX_TOKENS_PARAM]

const NODE_PARAM_DEFS: Record<string, GenerationParamDef[] | undefined> = {
  image: COMMON_IMAGE_PARAMS,
  ref_image_gen: COMMON_IMAGE_PARAMS,
  style_transfer: [ASPECT_RATIO_PARAM, IMAGE_STRENGTH_PARAM, PRESERVE_IDENTITY_PARAM, SEED_PARAM],
  multi_angle: [ASPECT_RATIO_PARAM, VIEW_COUNT_PARAM, IMAGE_QUALITY_PARAM, SEED_PARAM],
  video: COMMON_VIDEO_PARAMS,
  ref_video_gen: COMMON_VIDEO_PARAMS,
  motion_imitation: [ASPECT_RATIO_PARAM, DURATION_PARAM, VIDEO_RESOLUTION_PARAM, PRESERVE_IDENTITY_PARAM, SEED_PARAM],
  audio_tts: COMMON_AUDIO_PARAMS,
  audio_gen: COMMON_AUDIO_PARAMS,
  text: COMMON_TEXT_PARAMS,
  text_gen: COMMON_TEXT_PARAMS,
}

export function canvasGenerationParamDefs(
  nodeType: string,
  outputType?: GenerationOutputType,
  model?: GenerationParamModelLike | null,
): GenerationParamDef[] {
  if (model?.supported_params && model.supported_params.length > 0) return model.supported_params
  if (nodeType === 'ai_gen') {
    if (outputType === 'video') return COMMON_VIDEO_PARAMS
    if (outputType === 'audio') return COMMON_AUDIO_PARAMS
    if (outputType === 'text') return COMMON_TEXT_PARAMS
    return COMMON_IMAGE_PARAMS
  }
  return NODE_PARAM_DEFS[nodeType] ?? []
}

export function canvasParamValue(
  data: CanvasGenerationParamNodeDataLike,
  param: GenerationParamDef,
): GenerationParamValue {
  const value = data.params?.[param.key]
  if (value === undefined || value === null || value === '') return param.default ?? ''
  if (param.type === 'boolean') return value === true || value === 'true'
  if (param.type === 'number') return typeof value === 'number' ? value : Number(value)
  return String(value)
}

export function canvasParamValues(
  data: CanvasGenerationParamNodeDataLike,
  params: GenerationParamDef[],
): Record<string, GenerationParamValue> {
  return Object.fromEntries(params.map((param) => [param.key, canvasParamValue(data, param)]))
}

export function canvasDefaultParamValues(params: GenerationParamDef[]): Record<string, unknown> {
  return Object.fromEntries(
    params
      .filter((param) => param.default !== undefined)
      .map((param) => [param.key, param.default]),
  )
}

export function updateCanvasParam(
  data: CanvasGenerationParamNodeDataLike,
  key: string,
  value: GenerationParamValue,
): Record<string, unknown> {
  const next = { ...(data.params ?? {}) }
  if (value === '' || value === undefined || value === null) {
    delete next[key]
  } else {
    next[key] = value
  }
  return next
}
