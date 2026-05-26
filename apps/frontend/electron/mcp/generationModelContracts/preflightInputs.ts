import { integerModelField } from '../modelContracts'
import { isRecord } from '../valueUtils'
import type { GenerationInputKind, GenerationInputRequirement, GenerationInputRequirements, GenerationModelParamContract } from './types'
import type { GenerationInputPreflightError } from './preflightTypes'

export function normalizeGenerationInputRequirements(value: unknown): GenerationInputRequirements {
  const source = isRecord(value) ? value : {}
  return {
    image: normalizeGenerationInputRequirement(source.image),
    video: normalizeGenerationInputRequirement(source.video),
  }
}

export function buildSubmittedGenerationInputs(jobType: string, inputCount: number): Record<GenerationInputKind, number> {
  return {
    image: generationInputKindForJobType(jobType) === 'image' ? inputCount : 0,
    video: generationInputKindForJobType(jobType) === 'video' ? inputCount : 0,
  }
}

export function preflightGenerationInputs(jobType: string, inputCount: number, modelParamContract: GenerationModelParamContract | undefined): GenerationInputPreflightError[] {
  if (!modelParamContract) return []
  const kind = generationInputKindForJobType(jobType)
  if (!kind) return []
  const requirement = modelParamContract.inputRequirements[kind]
  const errors: GenerationInputPreflightError[] = []
  if (inputCount < requirement.min) {
    errors.push({
      code: 'INVALID_INPUT_COUNT',
      field: kind,
      message: `${kind} generation input count is below the local model contract minimum`,
      required_min: requirement.min,
      allowed_max: requirement.max,
      actual_count: inputCount,
    })
  }
  if (requirement.max !== -1 && inputCount > requirement.max) {
    errors.push({
      code: 'INVALID_INPUT_COUNT',
      field: kind,
      message: `${kind} generation input count is above the local model contract maximum`,
      required_min: requirement.min,
      allowed_max: requirement.max,
      actual_count: inputCount,
    })
  }
  return errors
}

function normalizeGenerationInputRequirement(value: unknown): GenerationInputRequirement {
  const source = isRecord(value) ? value : {}
  const min = integerModelField(source, 'min', 0, 0)
  const max = integerModelField(source, 'max', -1, 0)
  if (max !== -1 && min > max) return { min: 0, max: 0 }
  return { min, max }
}

function generationInputKindForJobType(jobType: string): GenerationInputKind | undefined {
  if (jobType === 'image_edit' || jobType === 'video_i2v') return 'image'
  if (jobType === 'video_v2v') return 'video'
  return undefined
}
