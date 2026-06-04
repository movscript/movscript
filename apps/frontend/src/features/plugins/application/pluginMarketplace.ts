import type { ClientPluginManifest } from '@/features/plugins/application/clientPlugins'

export interface MarketplaceEntry {
  id: string
  name: string
  version: string
  description: string
  author: string
  tags: string[]
  downloads: number
  manifest: ClientPluginManifest
}

export const MARKETPLACE_PLUGINS: MarketplaceEntry[] = []
