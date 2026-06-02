import type { AgentRun, JSONValue } from '../../state/shared/types.js'

export type CoreImageOutputFormat = 'jpeg' | 'png' | 'webp'
export type CoreImagePreset = 'vision_default' | 'vision_detail' | 'ui_screenshot' | 'thumbnail'

export interface CoreImageCropRect {
  left: number
  top: number
  width: number
  height: number
}

export interface CoreImageProcessingRequest {
  run: AgentRun
  resourceId?: number
  dataUrl?: string
  name?: string
  mimeType?: string
  preset?: CoreImagePreset
  maxDimension?: number
  format?: CoreImageOutputFormat
  quality?: number
  crop?: CoreImageCropRect
  signal?: AbortSignal
}

export interface CoreImageProcessingResult {
  status: 'processed'
  preset: CoreImagePreset
  source: {
    kind: 'backend_resource' | 'data_url'
    resourceId?: number
    mimeType?: string
    sizeBytes: number
    hash: string
  }
  original: {
    width?: number
    height?: number
    format?: string
    hasAlpha?: boolean
    orientation?: number
  }
  output: {
    width: number
    height: number
    format: CoreImageOutputFormat
    mimeType: string
    sizeBytes: number
    dataUrl: string
    quality?: number
    maxDimension: number
    crop?: CoreImageCropRect
    hash: string
  }
  warnings?: string[]
}

export interface CoreImageInspectionResult {
  status: 'inspected'
  source: CoreImageProcessingResult['source']
  image: CoreImageProcessingResult['original']
  warnings?: string[]
}

export interface CoreImageProcessingPort {
  inspect(input: CoreImageProcessingRequest): Promise<CoreImageInspectionResult>
  process(input: CoreImageProcessingRequest): Promise<CoreImageProcessingResult>
}

export type PublicCoreImageProcessingResult = Omit<CoreImageProcessingResult, 'output'> & {
  output: Omit<CoreImageProcessingResult['output'], 'dataUrl'> & {
    image_payload: 'sent_to_model_as_image_part'
  }
}

export function publicCoreImageProcessingResult(result: CoreImageProcessingResult): PublicCoreImageProcessingResult {
  const { dataUrl: _dataUrl, ...output } = result.output
  return {
    ...result,
    output: {
      ...output,
      image_payload: 'sent_to_model_as_image_part',
    },
  }
}

export function publicCoreImageInspectionResult(result: CoreImageInspectionResult): JSONValue {
  return result as unknown as JSONValue
}
