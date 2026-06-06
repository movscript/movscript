import type { ProviderSessionStatusRecord } from '@/shared/infrastructure/providerSessionClient'

export type ProviderSessionStatusLightState = 'stopped' | 'waiting' | 'active'

export interface ProviderSessionStatusLight {
  state: ProviderSessionStatusLightState
  label: string
  detail: string
}

export const STOPPED_PROVIDER_SESSION_STATUS_LIGHT: ProviderSessionStatusLight = {
  state: 'stopped',
  label: '停止',
  detail: 'Provider 会话当前不会自行触发新的 run，需要新的用户输入。',
}

export function providerSessionStatusLightFromStatusRecord(
  record: ProviderSessionStatusRecord | undefined,
): ProviderSessionStatusLight | undefined {
  if (record?.status.kind !== 'status_light') return undefined
  return {
    state: record.status.state,
    label: record.status.label,
    detail: record.status.detail,
  }
}
