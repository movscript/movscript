import type { ProviderInstance } from '@admin/types'
import { isRelayGatewayProviderInstance } from './adminRelayGatewayMode'

export function isModelProviderAccountStartupInstance(instance: Pick<ProviderInstance, 'id' | 'type' | 'adapter' | 'ref'>): boolean {
  return !instance.ref && isRelayGatewayProviderInstance(instance)
}

export function modelProviderAccountStartupInstances<T extends Pick<ProviderInstance, 'id' | 'type' | 'adapter' | 'ref'>>(instances: T[]): T[] {
  return instances.filter(isModelProviderAccountStartupInstance)
}
