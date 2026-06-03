import { MCPClient } from '../client/mcpClient.js'
import type { JSONValue, MCPResource, MCPTool } from '../../../shared/protocol/types.js'

export type MCPToolProviderStatus = 'available' | 'unavailable'

export interface MCPToolProviderRegistration {
  providerId: string
  endpoint: string
  label?: string
}

export interface MCPToolProviderView {
  providerId: string
  endpoint: string
  status: MCPToolProviderStatus
  registeredAt: string
  lastSeenAt: string
  label?: string
  toolCount?: number
  resourceCount?: number
  lastError?: string
}

interface MCPToolProviderRecord extends MCPToolProviderView {
  client: MCPClient
  tools?: MCPTool[]
  resources?: MCPResource[]
}

export class MCPToolProviderRegistry {
  private readonly providers = new Map<string, MCPToolProviderRecord>()

  constructor(defaultEndpoint?: string) {
    if (defaultEndpoint?.trim()) {
      this.register({
        providerId: 'default',
        endpoint: defaultEndpoint,
        label: 'Default MCP provider',
      })
    }
  }

  register(input: MCPToolProviderRegistration): MCPToolProviderView {
    const providerId = normalizeProviderId(input.providerId)
    const endpoint = normalizeEndpoint(input.endpoint)
    const now = new Date().toISOString()
    const existing = this.providers.get(providerId)
    const next: MCPToolProviderRecord = {
      providerId,
      endpoint,
      status: existing?.status ?? 'unavailable',
      registeredAt: existing?.registeredAt ?? now,
      lastSeenAt: now,
      ...(input.label?.trim() ? { label: input.label.trim() } : existing?.label ? { label: existing.label } : {}),
      client: existing?.endpoint === endpoint ? existing.client : new MCPClient({ endpoint }),
      ...(existing?.endpoint === endpoint && existing.tools ? { tools: existing.tools, toolCount: existing.tools.length } : {}),
      ...(existing?.endpoint === endpoint && existing.resources ? { resources: existing.resources, resourceCount: existing.resources.length } : {}),
    }
    this.providers.set(providerId, next)
    return providerView(next)
  }

  heartbeat(providerId: string): MCPToolProviderView {
    const record = this.requireProvider(providerId)
    record.lastSeenAt = new Date().toISOString()
    return providerView(record)
  }

  unregister(providerId: string): boolean {
    return this.providers.delete(normalizeProviderId(providerId))
  }

  listProviders(): MCPToolProviderView[] {
    return Array.from(this.providers.values()).map(providerView)
  }

  async initialize(options: { signal?: AbortSignal } = {}): Promise<JSONValue> {
    const providers = Array.from(this.providers.values())
    if (providers.length === 0) throw new Error('No MCP tool providers are registered')
    const errors: string[] = []
    for (const provider of providers) {
      try {
        const result = await provider.client.initialize(options)
        markProviderAvailable(provider)
        return result
      } catch (error) {
        errors.push(markProviderUnavailable(provider, error))
      }
    }
    throw new Error(`MCP tool providers unavailable: ${errors.join('; ')}`)
  }

  async listTools(): Promise<MCPTool[]> {
    const tools: MCPTool[] = []
    const errors: string[] = []
    for (const provider of this.providers.values()) {
      try {
        await provider.client.initialize()
        const providerTools = await provider.client.listTools()
        provider.tools = providerTools
        provider.toolCount = providerTools.length
        markProviderAvailable(provider)
        tools.push(...providerTools)
      } catch (error) {
        errors.push(markProviderUnavailable(provider, error))
      }
    }
    if (tools.length === 0 && errors.length > 0) {
      throw new Error(`MCP tools unavailable: ${errors.join('; ')}`)
    }
    return tools
  }

  async listResources(): Promise<MCPResource[]> {
    const resources: MCPResource[] = []
    const errors: string[] = []
    for (const provider of this.providers.values()) {
      try {
        await provider.client.initialize()
        const providerResources = await provider.client.listResources()
        provider.resources = providerResources
        provider.resourceCount = providerResources.length
        markProviderAvailable(provider)
        resources.push(...providerResources)
      } catch (error) {
        errors.push(markProviderUnavailable(provider, error))
      }
    }
    if (resources.length === 0 && errors.length > 0) {
      throw new Error(`MCP resources unavailable: ${errors.join('; ')}`)
    }
    return resources
  }

  async readResource(uri: string): Promise<JSONValue> {
    const providers = Array.from(this.providers.values())
    if (providers.length === 0) throw new Error('No MCP tool providers are registered')
    const errors: string[] = []
    for (const provider of providers) {
      try {
        await provider.client.initialize()
        const result = await provider.client.readResource(uri)
        markProviderAvailable(provider)
        return result
      } catch (error) {
        errors.push(markProviderUnavailable(provider, error))
      }
    }
    throw new Error(`MCP resource read failed for ${uri}: ${errors.join('; ')}`)
  }

  async callTool(name: string, args: Record<string, JSONValue> = {}, options: { signal?: AbortSignal } = {}): Promise<JSONValue> {
    const providers = await this.providersForTool(name)
    if (providers.length === 0) throw new Error(`No MCP tool provider is registered for ${name}`)
    const errors: string[] = []
    for (const provider of providers) {
      try {
        await provider.client.initialize(options)
        const result = await provider.client.callTool(name, args, options)
        markProviderAvailable(provider)
        return result
      } catch (error) {
        errors.push(markProviderUnavailable(provider, error))
      }
    }
    throw new Error(`MCP tool ${name} failed: ${errors.join('; ')}`)
  }

  private async providersForTool(name: string): Promise<MCPToolProviderRecord[]> {
    const providers = Array.from(this.providers.values())
    if (providers.length === 0) return []
    const known = providers.filter((provider) => provider.tools?.some((tool) => tool.name === name))
    if (known.length > 0) return known
    await this.listTools().catch(() => undefined)
    const refreshed = providers.filter((provider) => provider.tools?.some((tool) => tool.name === name))
    return refreshed.length > 0 ? refreshed : providers
  }

  private requireProvider(providerId: string): MCPToolProviderRecord {
    const normalized = normalizeProviderId(providerId)
    const provider = this.providers.get(normalized)
    if (!provider) throw new Error(`MCP tool provider not found: ${normalized}`)
    return provider
  }
}

function markProviderAvailable(provider: MCPToolProviderRecord): void {
  provider.status = 'available'
  provider.lastSeenAt = new Date().toISOString()
  delete provider.lastError
}

function markProviderUnavailable(provider: MCPToolProviderRecord, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  provider.status = 'unavailable'
  provider.lastSeenAt = new Date().toISOString()
  provider.lastError = message
  return `${provider.providerId}: ${message}`
}

function providerView(provider: MCPToolProviderRecord): MCPToolProviderView {
  return {
    providerId: provider.providerId,
    endpoint: provider.endpoint,
    status: provider.status,
    registeredAt: provider.registeredAt,
    lastSeenAt: provider.lastSeenAt,
    ...(provider.label ? { label: provider.label } : {}),
    ...(provider.toolCount !== undefined ? { toolCount: provider.toolCount } : {}),
    ...(provider.resourceCount !== undefined ? { resourceCount: provider.resourceCount } : {}),
    ...(provider.lastError ? { lastError: provider.lastError } : {}),
  }
}

function normalizeProviderId(value: string): string {
  const providerId = value.trim()
  if (!providerId) throw new Error('MCP tool provider id is required')
  return providerId
}

function normalizeEndpoint(value: string): string {
  const endpoint = value.trim().replace(/\/+$/, '')
  if (!endpoint) throw new Error('MCP tool provider endpoint is required')
  const url = new URL(endpoint)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('MCP tool provider endpoint must use http or https')
  }
  return endpoint
}
