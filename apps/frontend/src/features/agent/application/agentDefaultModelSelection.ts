import { selectDefaultAgentProviderModel } from '@/features/agent/application/defaultAgentProvider'
import type { PublicModel } from '@/types'

export function selectDefaultAgentModel(models: PublicModel[]): PublicModel | undefined {
  return selectDefaultAgentProviderModel(models)
}

export function resolveAgentModelId(input: {
  models: PublicModel[]
  selectedModelId?: number | null
}): number | null {
  const explicit = input.selectedModelId
  if (explicit !== undefined && explicit !== null && input.models.some((model) => model.id === explicit)) {
    return explicit
  }
  return selectDefaultAgentModel(input.models)?.id ?? null
}
