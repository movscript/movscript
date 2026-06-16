import type { ProviderInstance } from '@/types'

export const NEW_API_GATEWAY_PROVIDER_INSTANCE_ID = 'ai_gateway:new-api'

export function isNewAPIGatewayProviderInstance(instance: Pick<ProviderInstance, 'id' | 'type' | 'adapter'>): boolean {
  return instance.id === NEW_API_GATEWAY_PROVIDER_INSTANCE_ID || (instance.type === 'ai_gateway' && instance.adapter === 'new-api')
}

export function hasNewAPIGatewayProviderInstance(instances: Pick<ProviderInstance, 'id' | 'type' | 'adapter'>[]): boolean {
  return instances.some(isNewAPIGatewayProviderInstance)
}
