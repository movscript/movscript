import {
  PROVIDER_SESSION_EVENT_V2_SCHEMA,
  type ProviderSessionEventV2,
} from '@movscript/agent-protocol'

export function parseProviderSessionEvent(data: string): ProviderSessionEventV2 | undefined {
  const value = JSON.parse(data) as ProviderSessionEventV2
  return value?.schema === PROVIDER_SESSION_EVENT_V2_SCHEMA
    ? value
    : undefined
}
