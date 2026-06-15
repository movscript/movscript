import type { ProviderSessionStatusLight } from '@movscript/core/agent'

export const STOPPED_PROVIDER_SESSION_STATUS_LIGHT: ProviderSessionStatusLight = {
  state: 'stopped',
  label: '停止',
  detail: 'Runtime 会话当前不会自行触发新的 run，需要新的用户输入。',
}
