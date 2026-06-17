import { AgentConsoleSelectField } from '@/features/agent/components/AgentConsoleUi'
import {
  appServerKey,
  normalizedProviderKey,
  providerRouteForKey,
  providerRouteKey,
  providerTitle,
} from '@/features/agent/application/providerRoutes'
import { publicModelId } from '@/shared/domain/modelDisplay'
import { getAPIBaseURL } from '@/shared/infrastructure/config'
import type {
  ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
import type {
  MovScriptWorkspaceConfig,
  ProviderSessionClient,
} from '@/shared/infrastructure/providerSessionClient'
import type { PublicModel } from '@/types'

export type AppServerConfigSource = 'local-machine' | 'custom-service' | 'backend'

export const PROVIDER_LOCAL_HOME_COMPAT_MODE = ['local', 'Codex'].join('')

export type ProviderOption = {
  id: string
  label: string
  source: 'backend' | 'local'
  detail: string
  apiKey?: string
  baseURL?: string
  defaultModel?: string
  apiKind?: string
}

export type ProviderConfigDraft = {
  providerRef: string
  source: AppServerConfigSource
}

export type AgentModelSourceMode = AppServerConfigSource

export function activeProviderKeyFromPath(pathname: string, providers: ProviderConfig[]): string | undefined {
  const key = pathname.match(/^\/agents\/([^/?#]+)/)?.[1]
  if (!key) return undefined
  const decoded = normalizedProviderKey(safeDecodeURIComponent(key))
  return providers.some((provider) => providerMatchesRouteKey(provider, decoded))
    ? decoded
    : undefined
}

export function providerMatchesRouteKey(provider: ProviderConfig, key: string): boolean {
  const decoded = normalizedProviderKey(key)
  return providerRouteKey(provider) === decoded
    || appServerKey(provider) === decoded
    || normalizedProviderKey(provider.kind) === decoded
}

export function providerRoute(providerKey: string): string {
  return providerRouteForKey(providerKey)
}

export function buildProviderOptions(config: MovScriptWorkspaceConfig | undefined, backendModels: PublicModel[]): ProviderOption[] {
  const options: ProviderOption[] = []
  for (const provider of groupBackendProviders(backendModels)) options.push(provider)
  const localProviders = Array.isArray(config?.modelProviders) ? config.modelProviders : []
  for (const record of localProviders) {
    const id = stringField(record.id)
    if (!id || record.enabled === false) continue
    const baseURL = stringField(record.baseURL)
    const defaultModel = stringField(record.defaultModel)
    const apiKind = stringField(record.apiKind)
    options.push({
      id: `local:${id}`,
      label: stringField(record.label) ?? id,
      source: 'local',
      detail: `${apiKind ?? 'api'} / ${baseURL ?? '未设置 Base URL'}`,
      ...(stringField(record.apiKey) ? { apiKey: stringField(record.apiKey) } : {}),
      ...(baseURL ? { baseURL } : {}),
      ...(defaultModel ? { defaultModel } : {}),
      ...(apiKind ? { apiKind } : {}),
    })
  }
  return options
}

export function ProviderSelect({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string
  options: ProviderOption[]
  disabled: boolean
  onChange: (value: Pick<ProviderConfigDraft, 'source' | 'providerRef'>) => void
}) {
  const selectedProviderRef = value.startsWith('provider:') ? value.slice('provider:'.length) : ''
  const selectedProviderMissing = Boolean(selectedProviderRef) && !options.some((option) => option.id === selectedProviderRef)
  const backendOptions = options.filter((option) => option.source === 'backend')
  const localOptions = options.filter((option) => option.source === 'local')
  return (
    <AgentConsoleSelectField label="配置来源" value={value} disabled={disabled} onChange={(event) => onChange(providerSelectionDraft(event.target.value, options))}>
      <option value="source:local-machine">本机 - 复用本机账号文件</option>
      {localOptions.map((option) => (
        <option key={option.id} value={`provider:${option.id}`}>
          自定义 - {providerOptionChoiceDetail(option)}
        </option>
      ))}
      {backendOptions.map((option) => (
        <option key={option.id} value={`provider:${option.id}`}>
          后端 - {providerOptionChoiceDetail(option)}
        </option>
      ))}
      {selectedProviderMissing ? <option value={value}>已保存的 Model Provider：{selectedProviderRef}</option> : null}
    </AgentConsoleSelectField>
  )
}

export function providerDraftSourceMode(draft: ProviderConfigDraft, provider?: ProviderOption): AgentModelSourceMode {
  if (provider && draft.source === 'backend' && provider.source !== 'backend') return 'custom-service'
  if (provider && draft.source === 'custom-service' && provider.source === 'backend') return 'backend'
  return draft.source
}

export function providerSourceModeLabel(mode: AgentModelSourceMode): string {
  switch (mode) {
    case 'backend':
      return '后端'
    case 'local-machine':
      return '本机'
    case 'custom-service':
      return '自定义'
  }
}

export function providerSourceModeDescription(mode: AgentModelSourceMode, provider?: ProviderOption): string {
  switch (mode) {
    case 'backend':
      return provider
        ? `把 MovScript 后端网关写入托管配置，当前选择 ${provider.label}。`
        : '把 MovScript 后端网关写入托管配置。'
    case 'local-machine':
      return '从这台机器已有账号文件读取账号，并同步到 MovScript 托管配置。'
    case 'custom-service':
      return provider
        ? `把自定义兼容服务写入托管配置：${provider.label}。`
        : '把自定义兼容服务写入托管配置。'
  }
}

export function providerSelectionValue(draft: ProviderConfigDraft): string {
  return draft.source !== 'local-machine' && draft.providerRef
    ? `provider:${draft.providerRef}`
    : `source:${draft.source}`
}

export function providerSelectionDraft(value: string, options: ProviderOption[]): Pick<ProviderConfigDraft, 'source' | 'providerRef'> {
  if (value.startsWith('provider:')) {
    const providerRef = value.slice('provider:'.length)
    const option = options.find((item) => item.id === providerRef) ?? options[0]
    return {
      source: option?.source === 'backend' ? 'backend' : 'custom-service',
      providerRef: option?.id ?? '',
    }
  }
  const source = value.slice('source:'.length)
  if (source === 'local-machine' || source === 'custom-service' || source === 'backend') {
    return { source, providerRef: defaultProviderRefForSource(source, options) }
  }
  return { source: 'local-machine', providerRef: defaultProviderRefForSource('local-machine', options) }
}

export function providerDisplayTitle(providerKey: string): string {
  return providerTitle(providerKey)
}

export function defaultProviderConfigDraft(): ProviderConfigDraft {
  return {
    providerRef: '',
    source: 'local-machine',
  }
}

export function fallbackAppServerProvider(providerKey: string): ProviderConfig {
  const key = normalizedProviderKey(providerKey)
  const title = providerDisplayTitle(key)
  return {
    id: key,
    kind: key,
    protocol: 'app-server',
    messageAdapter: 'thread-turn-item',
    label: `MovScript ${title}`,
    enabled: true,
    appServerProfile: {
      id: `${key}-movscript-home`,
      label: `MovScript ${title}`,
      providerKey: key,
      home: `.${key}`,
      lifecycle: 'movscript-owned',
    },
  }
}

export async function saveProviderConfig(client: ProviderSessionClient, key: string, record: Record<string, unknown>, currentConfig: MovScriptWorkspaceConfig | undefined): Promise<void> {
  const config = currentConfig ?? await client.getWorkspaceConfig()
  const currentProvider = isRecord(config.providers?.[key]) ? { ...config.providers[key] } : {}
  delete currentProvider.authSource
  delete currentProvider.configSource
  delete currentProvider.providerRef
  delete currentProvider.baseURL
  delete currentProvider.baseUrl
  delete currentProvider.defaultModel
  delete currentProvider.home
  delete currentProvider.workspaceDir
  await client.saveWorkspaceConfig({
    providers: {
      ...(isRecord(config.providers) ? config.providers : {}),
      [key]: {
        ...currentProvider,
        ...record,
      },
    },
  })
}

export function providerConfigDraftFromWorkspaceConfig(
  config: MovScriptWorkspaceConfig | undefined,
  key: string,
  fallback: ProviderConfigDraft,
  providerOptions: ProviderOption[],
): ProviderConfigDraft {
  const record = isRecord(config?.providers?.[key]) ? config.providers[key] : {}
  const source = appServerConfigSourceFromRecord(record)
  return {
    providerRef: stringField(record.providerRef) ?? defaultProviderRefForSource(source, providerOptions) ?? fallback.providerRef,
    source,
  }
}

export function buildAppServerRecord(draft: ProviderConfigDraft, provider: ProviderOption | undefined, enabled: boolean, profile?: ProviderConfig['appServerProfile']): Record<string, unknown> {
  const base = {
    enabled,
    configSource: draft.source,
    ...(draft.source !== 'local-machine' && draft.providerRef ? { providerRef: draft.providerRef } : {}),
    ...(profile?.compatibilityHomeEnvNames?.length ? { appServer: { compatibilityHomeEnvNames: profile.compatibilityHomeEnvNames } } : {}),
  }
  switch (draft.source) {
    case 'local-machine':
      return {
        ...base,
        config: { mode: 'local-home' },
        auth: { mode: 'local-home' },
      }
    case 'custom-service':
      return {
        ...base,
        ...(provider?.baseURL ? { baseURL: provider.baseURL } : {}),
        ...(provider?.defaultModel ? { defaultModel: provider.defaultModel } : {}),
        config: { mode: 'customApiKey', ...(provider?.baseURL ? { baseURL: provider.baseURL } : {}) },
        auth: {
          mode: 'apiKey',
          ...(provider?.apiKey ? { apiKey: provider.apiKey } : {}),
          ...(provider?.baseURL ? { baseURL: provider.baseURL } : {}),
        },
      }
    case 'backend':
      return {
        ...base,
        baseURL: resolveBackendProviderBaseURL(),
        config: { mode: 'backendKey', modelProviderRef: draft.providerRef },
        auth: { mode: 'backendKey', modelProviderRef: draft.providerRef },
      }
  }
}

function groupBackendProviders(models: PublicModel[]): ProviderOption[] {
  const groups = new Map<string, { label: string; models: PublicModel[]; capabilities: Set<string> }>()
  for (const model of models) {
    const key = `backend:${model.credential_id}`
    const group = groups.get(key) ?? {
      label: model.provider_name?.trim() || 'Backend Provider',
      models: [],
      capabilities: new Set<string>(),
    }
    group.models.push(model)
    for (const capability of model.capabilities ?? []) group.capabilities.add(capability)
    groups.set(key, group)
  }
  return Array.from(groups.entries()).map(([id, group]) => {
    const defaultModel = group.models.find((model) => model.is_default) ?? group.models[0]
    return {
      id,
      label: group.label,
      source: 'backend',
      detail: `${group.models.length} models / ${Array.from(group.capabilities).join(', ') || 'capability pending'}`,
      ...(defaultModel ? { defaultModel: publicModelId(defaultModel) } : {}),
    }
  })
}

function providerOptionChoiceDetail(option: ProviderOption): string {
  return `${option.label} (${option.detail})`
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function resolveBackendProviderBaseURL(): string {
  return `${getAPIBaseURL()}/v1`
}

function appServerConfigSourceFromRecord(record: Record<string, unknown>): AppServerConfigSource {
  const explicit = stringField(record.configSource)
  if (explicit === 'local-machine' || explicit === 'custom-service' || explicit === 'backend') return explicit
  const legacyAuthSource = stringField(record.authSource)
  if (legacyAuthSource === 'local-home' || legacyAuthSource === 'managed-home' || legacyAuthSource === 'custom-config' || legacyAuthSource === 'none') return 'local-machine'
  if (legacyAuthSource === 'model-provider') {
    return stringField(record.providerRef)?.startsWith('backend:') ? 'backend' : 'custom-service'
  }
  const mode = stringField(recordField(record, 'config')?.mode) ?? stringField(recordField(record, 'auth')?.mode)
  if (mode === PROVIDER_LOCAL_HOME_COMPAT_MODE || mode === 'local-home') return 'local-machine'
  if (mode === 'backendKey' || mode === 'backend-api-key') return 'backend'
  if (mode === 'customApiKey' || mode === 'apiKey') return 'custom-service'
  return 'local-machine'
}

function defaultProviderRefForSource(source: AppServerConfigSource, options: ProviderOption[]): string {
  if (source === 'backend') return options.find((option) => option.source === 'backend')?.id ?? options[0]?.id ?? ''
  if (source === 'custom-service') return options.find((option) => option.source === 'local')?.id ?? options[0]?.id ?? ''
  return options[0]?.id ?? ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function recordField(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  return isRecord(value[key]) ? value[key] : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
