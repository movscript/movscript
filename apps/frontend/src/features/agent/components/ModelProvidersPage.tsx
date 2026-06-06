import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import {
  AgentConsoleActionButton,
  AgentConsoleCallout,
  AgentConsoleDescription,
  AgentConsoleFormField,
  AgentConsoleGrid,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
  AgentConsoleInlineError,
  AgentConsoleLocalToolActions,
  AgentConsoleLocalToolCard,
  AgentConsoleLocalToolControls,
  AgentConsoleLocalToolCopy,
  AgentConsoleLocalToolDetail,
  AgentConsoleLocalToolFields,
  AgentConsoleLocalToolHeader,
  AgentConsoleLocalToolTitle,
  AgentConsolePanel,
  AgentConsolePanelActions,
  AgentConsoleSavedText,
  AgentConsoleSelectField,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
  AgentConsoleToolbar,
  AgentPageShell,
  AgentPageShellBody,
  AgentPageShellHeader,
} from '@movscript/ui'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { fetchAgentBackendModels } from '@/features/agent/domain/agentModelCatalog'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import { providerSessionClient, type MovScriptWorkspaceConfig } from '@/shared/infrastructure/providerSessionClient'
import type { PublicModel } from '@/types'

type ModelProviderAPIKind = 'openai_responses' | 'openai_chat_completions' | 'anthropic_messages'

type WorkspaceModelProvider = {
  id: string
  label: string
  baseURL: string
  apiKey?: string
  defaultModel?: string
  apiKind: ModelProviderAPIKind
  enabled: boolean
}

type BackendModelProvider = {
  id: string
  label: string
  credentialId?: number
  modelCount: number
  models: string[]
  capabilities: string[]
  defaultModel?: string
}

const DEFAULT_PROVIDER: WorkspaceModelProvider = {
  id: 'openai',
  label: 'OpenAI',
  baseURL: 'https://api.openai.com/v1',
  defaultModel: 'gpt-5',
  apiKind: 'openai_responses',
  enabled: true,
}

const API_KIND_OPTIONS: Array<{ value: ModelProviderAPIKind; label: string }> = [
  { value: 'openai_responses', label: 'OpenAI Responses' },
  { value: 'openai_chat_completions', label: 'OpenAI Chat Completions' },
  { value: 'anthropic_messages', label: 'Anthropic Messages' },
]

export default function ModelProvidersPage() {
  const workspaceConfigQuery = useQuery({
    queryKey: ['workspace-model-providers-config'],
    queryFn: () => providerSessionClient.getWorkspaceConfig(),
    retry: false,
  })
  const backendModelsQuery = useQuery({
    queryKey: ['workspace-model-providers-backend-models'],
    queryFn: () => fetchAgentBackendModels(),
    retry: false,
  })
  const [providers, setProviders] = useState<WorkspaceModelProvider[]>([])
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, string>>({})

  useEffect(() => {
    if (workspaceConfigQuery.data) setProviders(normalizeWorkspaceModelProviders(workspaceConfigQuery.data))
  }, [workspaceConfigQuery.data])

  const backendProviders = useMemo(() => groupBackendModelProviders(backendModelsQuery.data ?? []), [backendModelsQuery.data])
  const enabledCount = backendProviders.length + providers.filter((provider) => provider.enabled).length
  const invalidCount = providers.filter((provider) => provider.enabled && !modelProviderIsValid(provider)).length
  const canSave = invalidCount === 0

  function patchProvider(id: string, patch: Partial<WorkspaceModelProvider>) {
    setProviders((current) => current.map((provider) => provider.id === id ? { ...provider, ...patch } : provider))
    setSaved(false)
  }

  function addProvider() {
    const id = uniqueProviderId(providers)
    setProviders((current) => [
      ...current,
      {
        id,
        label: 'Local Provider',
        baseURL: DEFAULT_PROVIDER.baseURL,
        defaultModel: DEFAULT_PROVIDER.defaultModel,
        apiKind: DEFAULT_PROVIDER.apiKind,
        enabled: true,
      },
    ])
    setSaved(false)
  }

  function removeProvider(id: string) {
    setProviders((current) => current.filter((provider) => provider.id !== id))
    setSaved(false)
  }

  async function save() {
    if (!canSave || saving) return
    setSaveError(null)
    setSaving(true)
    try {
      await providerSessionClient.saveWorkspaceConfig({ modelProviders: providers.map(modelProviderToConfigRecord) })
      await workspaceConfigQuery.refetch()
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } catch (error) {
      setSaveError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function testProvider(provider: WorkspaceModelProvider) {
    const result = modelProviderIsValid(provider)
      ? `配置可用：${provider.apiKind} / ${provider.baseURL}`
      : '需要填写有效 Base URL；启用的 provider 也需要 API Key。'
    setTestResults((current) => ({ ...current, [provider.id]: result }))
  }

  return (
    <AgentPageShell data-testid="model-providers-page">
      <AgentPageShellHeader>
        <AgentConsoleHeader>
          <AgentConsoleHeaderCopy>
            <AgentConsoleHeaderTitleRow>
              <Database size={18} />
              <AgentConsoleHeaderTitle>Model Providers</AgentConsoleHeaderTitle>
              <AgentConsoleStatusBadge intent={enabledCount > 0 ? 'success' : 'warning'} emphasis="soft">
              {enabledCount} 个可用
            </AgentConsoleStatusBadge>
              {(workspaceConfigQuery.isLoading || backendModelsQuery.isLoading) && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              展示后端已提供的模型供应商，并管理当前 workspace 额外保存的本地 Base URL、API Key 和默认模型路由。
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void Promise.all([workspaceConfigQuery.refetch(), backendModelsQuery.refetch()])}>
              <RefreshCw size={14} />
              刷新
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={addProvider}>
              <Plus size={14} />
              添加 Provider
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" onClick={() => void save()} disabled={!canSave || saving}>
              <Save size={14} />
              {saving ? '保存中...' : '保存'}
            </AgentConsoleActionButton>
          </AgentConsoleHeaderActions>
        </AgentConsoleHeader>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentPageShellBody>
        <AgentConsolePanel
          title="Backend Providers"
          icon={<Database size={14} />}
          action={(
            <AgentConsolePanelActions>
              <AgentConsoleStatusBadge intent={backendProviders.length > 0 ? 'success' : 'warning'} emphasis="soft">
                {backendProviders.length > 0 ? `${backendProviders.length} 个供应商` : '未发现'}
              </AgentConsoleStatusBadge>
            </AgentConsolePanelActions>
          )}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <AgentConsoleDescription>
                Backend Providers 来自后端模型目录和凭证配置。这里不展示 API Key，Agent 只引用 provider 和模型路由。
              </AgentConsoleDescription>
              <AgentConsoleToolbar>
                <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                  backend / models
                </AgentConsoleStatusBadge>
              </AgentConsoleToolbar>
            </div>

            {backendModelsQuery.error ? <AgentConsoleInlineError>{errorMessage(backendModelsQuery.error)}</AgentConsoleInlineError> : null}
            {!backendModelsQuery.error && backendProviders.length === 0 ? (
              <AgentConsoleCallout tone="warning" compact>
                后端当前没有返回可用模型。可以先添加 Local Provider，或回到后台配置模型凭证。
              </AgentConsoleCallout>
            ) : null}

            <AgentConsoleGrid columns="server">
              {backendProviders.map((provider) => (
                <AgentConsoleLocalToolCard key={provider.id}>
                  <AgentConsoleLocalToolHeader>
                    <AgentConsoleLocalToolCopy>
                      <AgentConsoleLocalToolTitle>{provider.label}</AgentConsoleLocalToolTitle>
                      <AgentConsoleLocalToolDetail>
                        {provider.modelCount} 个模型{provider.credentialId ? ` / credential #${provider.credentialId}` : ''}
                      </AgentConsoleLocalToolDetail>
                    </AgentConsoleLocalToolCopy>
                    <AgentConsoleLocalToolControls>
                      <AgentConsoleStatusBadge intent="success" emphasis="soft">Backend</AgentConsoleStatusBadge>
                      <AgentConsoleStatusBadge intent="neutral" emphasis="soft">只读</AgentConsoleStatusBadge>
                    </AgentConsoleLocalToolControls>
                  </AgentConsoleLocalToolHeader>
                  <AgentConsoleLocalToolFields>
                    <AgentConsoleCallout compact>
                      默认模型：{provider.defaultModel ?? provider.models[0] ?? '-'}
                    </AgentConsoleCallout>
                    <AgentConsoleCallout compact>
                      能力：{provider.capabilities.length > 0 ? provider.capabilities.join(', ') : '未声明'}
                    </AgentConsoleCallout>
                    <AgentConsoleCallout compact>
                      模型：{provider.models.slice(0, 5).join(', ')}{provider.models.length > 5 ? ` 等 ${provider.models.length} 个` : ''}
                    </AgentConsoleCallout>
                  </AgentConsoleLocalToolFields>
                </AgentConsoleLocalToolCard>
              ))}
            </AgentConsoleGrid>
          </div>
        </AgentConsolePanel>

        <AgentConsolePanel
          title="Local Providers"
          icon={<Database size={14} />}
          action={(
            <AgentConsolePanelActions>
              {saved && <AgentConsoleSavedText>已保存</AgentConsoleSavedText>}
              <AgentConsoleStatusBadge intent={invalidCount > 0 ? 'warning' : 'success'} emphasis="soft">
                {invalidCount > 0 ? `${invalidCount} 项需补全` : `${providers.filter((provider) => provider.enabled).length} 个启用`}
              </AgentConsoleStatusBadge>
            </AgentConsolePanelActions>
          )}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <AgentConsoleDescription>
                Local Providers 只保存在当前 provider profile config 中，用于接入后端目录之外的模型服务。
              </AgentConsoleDescription>
              <AgentConsoleToolbar>
                <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                  provider profile config / modelProviders
                </AgentConsoleStatusBadge>
              </AgentConsoleToolbar>
            </div>

            {workspaceConfigQuery.error ? <AgentConsoleInlineError>{errorMessage(workspaceConfigQuery.error)}</AgentConsoleInlineError> : null}
            {saveError ? <AgentConsoleCallout tone="danger" compact>保存失败：{saveError}</AgentConsoleCallout> : null}
            {invalidCount > 0 ? <AgentConsoleCallout tone="warning" compact>启用的 Local Provider 需要有效 Base URL 和 API Key。</AgentConsoleCallout> : null}
            {providers.length === 0 ? (
              <AgentConsoleCallout compact>
                当前 workspace 没有本地 provider；Agent 仍可以选择后端提供的 Backend Provider。
              </AgentConsoleCallout>
            ) : null}

            <AgentConsoleGrid columns="server">
              {providers.map((provider) => (
                <AgentConsoleLocalToolCard key={provider.id} invalid={provider.enabled && !modelProviderIsValid(provider)}>
                  <AgentConsoleLocalToolHeader>
                    <AgentConsoleLocalToolCopy>
                      <AgentConsoleLocalToolTitle>{provider.label || provider.id}</AgentConsoleLocalToolTitle>
                      <AgentConsoleLocalToolDetail>{provider.apiKind} / {provider.baseURL || '未设置 Base URL'}</AgentConsoleLocalToolDetail>
                    </AgentConsoleLocalToolCopy>
                    <AgentConsoleLocalToolControls>
                      <AgentConsoleStatusBadge intent={provider.enabled ? 'success' : 'neutral'} emphasis="soft">
                        {provider.enabled ? '启用' : '停用'}
                      </AgentConsoleStatusBadge>
                      <input
                        type="checkbox"
                        checked={provider.enabled}
                        onChange={(event) => patchProvider(provider.id, { enabled: event.target.checked })}
                        aria-label={`${provider.label} enabled`}
                      />
                    </AgentConsoleLocalToolControls>
                  </AgentConsoleLocalToolHeader>
                  <AgentConsoleLocalToolFields disabled={!provider.enabled}>
                    <AgentConsoleFormField label="显示名称" value={provider.label} onChange={(event) => patchProvider(provider.id, { label: event.target.value })} />
                    <AgentConsoleFormField label="Base URL" value={provider.baseURL} onChange={(event) => patchProvider(provider.id, { baseURL: event.target.value })} placeholder="https://api.openai.com/v1" />
                    <AgentConsoleFormField label="API Key" type="password" value={provider.apiKey ?? ''} onChange={(event) => patchProvider(provider.id, { apiKey: event.target.value })} placeholder="sk-..." />
                    <AgentConsoleFormField label="默认模型" value={provider.defaultModel ?? ''} onChange={(event) => patchProvider(provider.id, { defaultModel: event.target.value })} placeholder="gpt-5" />
                    <AgentConsoleSelectField label="API Mode" value={provider.apiKind} onChange={(event) => patchProvider(provider.id, { apiKind: event.target.value as ModelProviderAPIKind })}>
                      {API_KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </AgentConsoleSelectField>
                    {testResults[provider.id] ? <AgentConsoleCallout compact>{testResults[provider.id]}</AgentConsoleCallout> : null}
                  </AgentConsoleLocalToolFields>
                  <AgentConsoleLocalToolActions>
                    <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => testProvider(provider)}>
                      验证配置
                    </AgentConsoleActionButton>
                    <AgentConsoleActionButton type="button" size="sm" variant="outline" intent="danger" onClick={() => removeProvider(provider.id)}>
                      <Trash2 size={14} />
                      删除
                    </AgentConsoleActionButton>
                  </AgentConsoleLocalToolActions>
                </AgentConsoleLocalToolCard>
              ))}
            </AgentConsoleGrid>
          </div>
        </AgentConsolePanel>
      </AgentPageShellBody>
    </AgentPageShell>
  )
}

function normalizeWorkspaceModelProviders(config: MovScriptWorkspaceConfig): WorkspaceModelProvider[] {
  const providers = Array.isArray(config.modelProviders)
    ? config.modelProviders.map(modelProviderFromRecord).filter((provider): provider is WorkspaceModelProvider => Boolean(provider))
    : []
  return providers
}

function groupBackendModelProviders(models: PublicModel[]): BackendModelProvider[] {
  const providers = new Map<string, {
    label: string
    credentialId?: number
    models: PublicModel[]
    capabilities: Set<string>
  }>()
  for (const model of models) {
    const credentialId = typeof model.credential_id === 'number' ? model.credential_id : undefined
    const key = credentialId ? `backend:${credentialId}` : `backend:${model.provider_name ?? 'default'}`
    const current = providers.get(key) ?? {
      label: model.provider_name?.trim() || 'Backend Provider',
      ...(credentialId ? { credentialId } : {}),
      models: [],
      capabilities: new Set<string>(),
    }
    current.models.push(model)
    for (const capability of model.capabilities ?? []) current.capabilities.add(capability)
    providers.set(key, current)
  }
  return Array.from(providers.entries()).map(([id, provider]) => {
    const defaultModel = provider.models.find((model) => model.is_default) ?? provider.models[0]
    return {
      id,
      label: provider.label,
      ...(provider.credentialId ? { credentialId: provider.credentialId } : {}),
      modelCount: provider.models.length,
      models: provider.models.map((model) => `${publicModelLabel(model)} (${publicModelId(model)})`),
      capabilities: Array.from(provider.capabilities).sort(),
      ...(defaultModel ? { defaultModel: `${publicModelLabel(defaultModel)} (${publicModelId(defaultModel)})` } : {}),
    }
  })
}

function modelProviderFromRecord(record: Record<string, unknown>): WorkspaceModelProvider | undefined {
  const id = stringField(record.id)
  if (!id) return undefined
  const apiKind = modelProviderAPIKind(stringField(record.apiKind))
  return {
    id,
    label: stringField(record.label) ?? id,
    baseURL: stringField(record.baseURL) ?? '',
    ...(stringField(record.apiKey) ? { apiKey: stringField(record.apiKey) } : {}),
    ...(stringField(record.defaultModel) ? { defaultModel: stringField(record.defaultModel) } : {}),
    apiKind,
    enabled: record.enabled !== false,
  }
}

function modelProviderToConfigRecord(provider: WorkspaceModelProvider): Record<string, unknown> {
  return {
    id: provider.id,
    label: provider.label,
    baseURL: provider.baseURL,
    ...(provider.apiKey?.trim() ? { apiKey: provider.apiKey.trim() } : {}),
    ...(provider.defaultModel?.trim() ? { defaultModel: provider.defaultModel.trim() } : {}),
    apiKind: provider.apiKind,
    enabled: provider.enabled,
  }
}

function modelProviderAPIKind(value: string | undefined): ModelProviderAPIKind {
  return value === 'openai_chat_completions' || value === 'anthropic_messages' ? value : 'openai_responses'
}

function modelProviderIsValid(provider: WorkspaceModelProvider): boolean {
  if (!provider.enabled) return true
  return isHTTPURL(provider.baseURL) && Boolean(provider.apiKey?.trim())
}

function isHTTPURL(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function uniqueProviderId(providers: WorkspaceModelProvider[]): string {
  const ids = new Set(providers.map((provider) => provider.id))
  let index = providers.length + 1
  let id = `provider-${index}`
  while (ids.has(id)) {
    index += 1
    id = `provider-${index}`
  }
  return id
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
