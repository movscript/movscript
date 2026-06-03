import type { ClientPluginManifest } from '@/features/plugins/application/clientPlugins'
import {
  BUILTIN_MOVSCRIPT_IMAGE_GENERATOR_PLUGIN_ID,
  BUILTIN_MOVSCRIPT_VIDEO_GENERATOR_PLUGIN_ID,
  movScriptImageGeneratorManifest,
  movScriptVideoGeneratorManifest,
} from '@/features/plugins/application/builtinClientPlugins'

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

export const MARKETPLACE_PLUGINS: MarketplaceEntry[] = [{
  id: BUILTIN_MOVSCRIPT_IMAGE_GENERATOR_PLUGIN_ID,
  name: '图像生成器',
  version: '1.0.0',
  description: 'Bundled MovScript image generation provider plugin for the agent generation harness.',
  author: 'MovScript',
  tags: ['provider', 'generation', 'image', 'movscript'],
  downloads: 0,
  manifest: movScriptImageGeneratorManifest(),
}, {
  id: BUILTIN_MOVSCRIPT_VIDEO_GENERATOR_PLUGIN_ID,
  name: '视频生成器',
  version: '1.0.0',
  description: 'Bundled MovScript video generation provider plugin for the agent generation harness.',
  author: 'MovScript',
  tags: ['provider', 'generation', 'video', 'movscript'],
  downloads: 0,
  manifest: movScriptVideoGeneratorManifest(),
}]
