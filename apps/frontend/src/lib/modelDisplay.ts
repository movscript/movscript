import type { PublicModel } from '@/types'

export function publicModelLabel(model: PublicModel, includeProvider = false): string {
  const name = model.short_name?.trim() || model.display_name
  return includeProvider && model.provider_name ? `${model.provider_name} / ${name}` : name
}
