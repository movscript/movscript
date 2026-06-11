import type {
  ProviderSessionStatusLightState,
  ProviderSessionStatusRecord,
} from './protocol.js'

export type { ProviderSessionStatusLightState } from './protocol.js'

export interface ProviderSessionStatusLight {
  state: ProviderSessionStatusLightState
  label: string
  detail: string
}

export function providerSessionStatusLightFromStatusRecord(
  record: Pick<ProviderSessionStatusRecord, 'status'> | undefined,
): ProviderSessionStatusLight | undefined {
  if (record?.status.kind !== 'status_light') return undefined
  return {
    state: record.status.state,
    label: record.status.label,
    detail: record.status.detail,
  }
}

export function providerSessionStatusLightPriority(light: ProviderSessionStatusLight): number {
  if (light.state === 'error') return 3
  if (light.state === 'active') return 2
  if (light.state === 'waiting') return 1
  return 0
}

export function selectProviderSessionStatusLight<TLight extends ProviderSessionStatusLight>(
  lights: readonly (TLight | undefined)[],
  fallback: TLight,
): TLight {
  return lights.reduce<TLight | undefined>((selected, light) => {
    if (!light) return selected
    if (!selected) return light
    return providerSessionStatusLightPriority(light) > providerSessionStatusLightPriority(selected) ? light : selected
  }, undefined) ?? fallback
}

export function providerSessionStatusLightForTargetKeys<TLight extends ProviderSessionStatusLight>(
  providerSessionStatusLightsByTarget: Record<string, TLight | undefined>,
  targetKeys: readonly string[],
  fallback: TLight,
): TLight {
  return selectProviderSessionStatusLight(
    targetKeys.map((targetKey) => providerSessionStatusLightsByTarget[targetKey]),
    fallback,
  )
}
