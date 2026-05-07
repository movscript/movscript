import type { ModelCallInput, ModelCallResult } from './modelClient.js'
import { callModel } from './modelClient.js'
import type { ConfiguredRuntimeModelConfig } from './modelConfig.js'

export const RUNTIME_MODEL_CAPABILITIES = ['reasoning', 'text', 'multimodal'] as const

export type RuntimeModelCapability = typeof RUNTIME_MODEL_CAPABILITIES[number]

export type RuntimeModelRouteSource =
  | 'configured'
  | 'chat-config-fallback'
  | 'unconfigured'

export interface RuntimeModelCapabilityRoute {
  capability: RuntimeModelCapability
  provider: ConfiguredRuntimeModelConfig['provider']
  config: ConfiguredRuntimeModelConfig
  source: RuntimeModelRouteSource
}

export interface RuntimeModelCapabilityRoutePublic {
  capability: RuntimeModelCapability
  configured: boolean
  provider?: ConfiguredRuntimeModelConfig['provider']
  modelConfigId?: number
  model?: string
  source: RuntimeModelRouteSource
}

export type ModelCapabilityCallInput = Omit<ModelCallInput, 'config'> & {
  capability: RuntimeModelCapability
}

export interface MultimodalModelAsset {
  kind: 'image' | 'audio' | 'video'
  mimeType?: string
  uri?: string
  data?: string
}

export interface MultimodalAnalysisInput {
  prompt: string
  assets: MultimodalModelAsset[]
  signal?: AbortSignal
}

export interface MultimodalAnalysisResult {
  summary: string
  observations: string[]
  confidence: number
  route: RuntimeModelCapabilityRoutePublic
}

export interface RuntimeModelRouter {
  resolve(capability: RuntimeModelCapability): RuntimeModelCapabilityRoute | undefined
  describe(): RuntimeModelCapabilityRoutePublic[]
  call(input: ModelCapabilityCallInput): Promise<ModelCallResult>
  analyzeMultimodal(input: MultimodalAnalysisInput): Promise<MultimodalAnalysisResult>
}

export function createDefaultRuntimeModelRouter(config?: ConfiguredRuntimeModelConfig): RuntimeModelRouter {
  return new DefaultRuntimeModelRouter(config)
}

export function describeRuntimeModelCapabilities(config?: ConfiguredRuntimeModelConfig): RuntimeModelCapabilityRoutePublic[] {
  return createDefaultRuntimeModelRouter(config).describe()
}

class DefaultRuntimeModelRouter implements RuntimeModelRouter {
  constructor(private readonly config?: ConfiguredRuntimeModelConfig) {}

  resolve(capability: RuntimeModelCapability): RuntimeModelCapabilityRoute | undefined {
    if (!this.config) return undefined
    return {
      capability,
      provider: this.config.provider,
      config: this.config,
      source: 'chat-config-fallback',
    }
  }

  describe(): RuntimeModelCapabilityRoutePublic[] {
    return RUNTIME_MODEL_CAPABILITIES.map((capability) => {
      const route = this.resolve(capability)
      if (!route) {
        return {
          capability,
          configured: false,
          source: 'unconfigured',
        }
      }
      return {
        capability,
        configured: true,
        provider: route.provider,
        modelConfigId: route.config.modelConfigId,
        model: route.config.model,
        source: route.source,
      }
    })
  }

  async call(input: ModelCapabilityCallInput): Promise<ModelCallResult> {
    const route = this.resolve(input.capability)
    if (!route) {
      throw new Error(`no ${input.capability} model route configured`)
    }
    const { capability: _capability, ...modelInput } = input
    return callModel({
      ...modelInput,
      config: route.config,
    })
  }

  async analyzeMultimodal(input: MultimodalAnalysisInput): Promise<MultimodalAnalysisResult> {
    const route = this.resolve('multimodal')
    if (!route) {
      throw new Error('no multimodal model route configured')
    }
    return {
      summary: [
        'Multimodal routing is configured, but the concrete multimodal adapter is not implemented yet.',
        `Received ${input.assets.length} asset(s).`,
      ].join(' '),
      observations: [],
      confidence: 0,
      route: {
        capability: route.capability,
        configured: true,
        provider: route.provider,
        modelConfigId: route.config.modelConfigId,
        model: route.config.model,
        source: route.source,
      },
    }
  }
}
