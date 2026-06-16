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

export type AppServerAuthSource = 'model-provider' | 'local-home' | 'managed-home' | 'custom-config' | 'none'

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
  authSource: AppServerAuthSource
}

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
  onChange: (value: Pick<ProviderConfigDraft, 'authSource' | 'providerRef'>) => void
}) {
  const selectedProviderRef = value.startsWith('provider:') ? value.slice('provider:'.length) : ''
  const selectedProviderMissing = Boolean(selectedProviderRef) && !options.some((option) => option.id === selectedProviderRef)
  return (
    <AgentConsoleSelectField label="Provider" value={value} disabled={disabled} onChange={(event) => onChange(providerSelectionDraft(event.target.value, options))}>
      <option value="auth:local-home">复用本机 app-server 账号文件</option>
      <option value="auth:managed-home">复用 MovScript 托管账号文件</option>
      {selectedProviderMissing ? <option value={value}>已保存的 Model Provider：{selectedProviderRef}</option> : null}
      {options.map((option) => (
        <option key={option.id} value={`provider:${option.id}`}>
          {option.label} - {option.detail}
        </option>
      ))}
      <option value="auth:custom-config">手动维护 config.toml / auth.json</option>
      <option value="auth:none">不配置账号</option>
    </AgentConsoleSelectField>
  )
}

export function providerSelectionValue(draft: ProviderConfigDraft): string {
  return draft.authSource === 'model-provider' && draft.providerRef
    ? `provider:${draft.providerRef}`
    : `auth:${draft.authSource}`
}

export function providerSelectionDraft(value: string, options: ProviderOption[]): Pick<ProviderConfigDraft, 'authSource' | 'providerRef'> {
  if (value.startsWith('provider:')) {
    const providerRef = value.slice('provider:'.length)
    return {
      authSource: 'model-provider',
      providerRef: options.some((option) => option.id === providerRef) ? providerRef : options[0]?.id ?? '',
    }
  }
  const authSource = value.slice('auth:'.length)
  if (authSource === 'local-home' || authSource === 'managed-home' || authSource === 'custom-config' || authSource === 'none') {
    return { authSource, providerRef: options[0]?.id ?? '' }
  }
  return { authSource: 'local-home', providerRef: options[0]?.id ?? '' }
}

export function providerDisplayTitle(providerKey: string): string {
  return providerTitle(providerKey)
}

export function defaultProviderConfigDraft(): ProviderConfigDraft {
  return {
    providerRef: '',
    authSource: 'local-home',
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
  delete currentProvider.providerRef
  delete currentProvider.baseURL
  delete currentProvider.baseUrl
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
  return {
    providerRef: stringField(record.providerRef) ?? providerOptions[0]?.id ?? fallback.providerRef,
    authSource: appServerAuthSourceFromRecord(record),
  }
}

export function buildAppServerRecord(draft: ProviderConfigDraft, provider: ProviderOption | undefined, enabled: boolean, profile?: ProviderConfig['appServerProfile']): Record<string, unknown> {
  const base = {
    enabled,
    authSource: draft.authSource,
    ...(draft.authSource === 'model-provider' && draft.providerRef ? { providerRef: draft.providerRef } : {}),
    ...(profile?.compatibilityHomeEnvNames?.length ? { appServer: { compatibilityHomeEnvNames: profile.compatibilityHomeEnvNames } } : {}),
  }
  switch (draft.authSource) {
    case 'local-home':
      return {
        ...base,
        config: { mode: 'local-home' },
        auth: { mode: 'local-home' },
      }
    case 'managed-home':
      return {
        ...base,
        config: { mode: 'auto' },
        auth: { mode: 'auto' },
      }
    case 'model-provider':
      if (provider?.source === 'local' && provider.apiKey) {
        return {
          ...base,
          config: { mode: 'customApiKey' },
          auth: {
            mode: 'apiKey',
            apiKey: provider.apiKey,
            ...(provider.baseURL ? { baseURL: provider.baseURL } : {}),
          },
        }
      }
      return {
        ...base,
        baseURL: resolveBackendProviderBaseURL(),
        config: { mode: 'backendKey', modelProviderRef: draft.providerRef },
        auth: { mode: 'backendKey', modelProviderRef: draft.providerRef },
      }
    case 'custom-config':
      return {
        ...base,
        config: { mode: 'customConfig' },
        auth: { mode: 'customConfig' },
      }
    case 'none':
      return {
        ...base,
        config: { mode: 'none' },
        auth: { mode: 'none' },
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

function appServerAuthSourceFromRecord(record: Record<string, unknown>): AppServerAuthSource {
  const explicit = stringField(record.authSource)
  if (explicit === 'model-provider' || explicit === 'local-home' || explicit === 'managed-home' || explicit === 'custom-config' || explicit === 'none') {
    return explicit
  }
  const mode = stringField(recordField(record, 'config')?.mode) ?? stringField(recordField(record, 'auth')?.mode)
  if (mode === PROVIDER_LOCAL_HOME_COMPAT_MODE || mode === 'local-home') return 'local-home'
  if (mode === 'customApiKey' || mode === 'apiKey' || mode === 'backendKey' || mode === 'backend-api-key') return 'model-provider'
  if (mode === 'customConfig' || mode === 'custom-config' || mode === 'manual') return 'custom-config'
  if (mode === 'none') return 'none'
  return 'managed-home'
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
