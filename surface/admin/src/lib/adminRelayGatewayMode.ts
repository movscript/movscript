import type { ProviderInstance } from '@admin/types'

export const RELAY_GATEWAY_PROVIDER_INSTANCE_ID = 'ai_gateway:relay-gateway'

export function isRelayGatewayProviderInstance(instance: Pick<ProviderInstance, 'id' | 'type' | 'adapter'>): boolean {
  return instance.id === RELAY_GATEWAY_PROVIDER_INSTANCE_ID || (instance.type === 'ai_gateway' && instance.adapter === 'relay-gateway')
}

export function hasRelayGatewayProviderInstance(instances: Pick<ProviderInstance, 'id' | 'type' | 'adapter'>[]): boolean {
  return instances.some(isRelayGatewayProviderInstance)
}
