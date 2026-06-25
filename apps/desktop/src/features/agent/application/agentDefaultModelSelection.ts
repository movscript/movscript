import { selectDefaultAgentProviderModel } from '@/features/agent/application/defaultAgentProvider'
import { publicModelId } from '@/shared/domain/modelDisplay'
import type { PublicModel } from '@/types'

export function selectDefaultAgentModel(models: PublicModel[]): PublicModel | undefined {
  return selectDefaultAgentProviderModel(models)
}

export function resolveAgentModelId(input: {
  models: PublicModel[]
  selectedModelId?: string | null
}): string | null {
  const explicit = input.selectedModelId
  if (explicit !== undefined && explicit !== null && input.models.some((model) => publicModelId(model) === explicit)) {
    return explicit
  }
  const defaultModel = selectDefaultAgentModel(input.models)
  return defaultModel ? publicModelId(defaultModel) : null
}
