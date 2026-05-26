import type { GenerationInputKind } from './types'

export type GenerationParamPreflightError = {
  code: string
  field: string
  message: string
  allowed_values?: Array<string | number | boolean>
  suggested_fix?: Record<string, string | number | boolean | null>
}

export type GenerationInputPreflightError = {
  code: 'INVALID_INPUT_COUNT'
  field: GenerationInputKind
  message: string
  required_min: number
  allowed_max: number
  actual_count: number
}
