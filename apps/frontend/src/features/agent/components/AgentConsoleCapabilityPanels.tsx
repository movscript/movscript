import { useEffect, useMemo, useState } from 'react'
import {
  KeyRound,
  PlugZap,
  Save,
  Trash2,
} from 'lucide-react'

import {
  AgentConsoleActionButton,
  AgentConsoleEmptyText,
  AgentConsoleFormField,
  AgentConsoleGrid,
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
  AgentConsoleStack,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
  AgentConsoleTestResult,
} from '@/features/agent/components/AgentConsoleUi'
import { useAgentControlCenter } from '@/features/agent/presentation/useAgentControlCenter'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'

export function AgentRuntimeCredentialPanel({
  provider,
  onCredentialSaved,
}: {
  provider?: ProviderConfig
  onCredentialSaved?: () => void
}) {
  if (!provider || provider.kind !== 'claude') return null
  return (
    <AgentConsolePanel
      title="SDK 凭据"
      icon={<KeyRound size={14} />}
      action={
        <AgentConsolePanelActions>
          <AgentConsoleStatusBadge intent="warning" emphasis="soft">ANTHROPIC_API_KEY</AgentConsoleStatusBadge>
        </AgentConsolePanelActions>
      }
    >
      <AgentRuntimeCredentialEditor
        providerId={provider.id}
        providerKind={provider.kind}
        providerLabel={provider.label}
        onSaved={onCredentialSaved}
      />
    </AgentConsolePanel>
  )
}

export function AgentCapabilityHealthPanel({
  capabilityHealth,
  loading,
}: {
  capabilityHealth: ReturnType<typeof useAgentControlCenter>['capabilityHealth']
  loading: boolean
}) {
  return (
    <AgentConsolePanel
      title="当前 Agent 能力健康"
      icon={<PlugZap size={14} />}
      action={
        <AgentConsolePanelActions>
          {loading && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
          <AgentConsoleStatusBadge intent={capabilityHealth.warningCount > 0 ? 'warning' : capabilityHealth.checkedProviderCount > 0 ? 'success' : 'neutral'} emphasis="soft">
            {capabilityHealth.checkedProviderCount > 0 ? `${capabilityHealth.checkedProviderCount} 个已检查` : '等待当前 Agent'}
          </AgentConsoleStatusBadge>
        </AgentConsolePanelActions>
      }
    >
      {capabilityHealth.providers.length === 0 ? (
        <AgentConsoleEmptyText>当前 Agent 连接可用后，这里会汇总 Tools、Skills、Plugins 和 MCP 状态。</AgentConsoleEmptyText>
      ) : (
        <AgentConsoleGrid columns="single">
          {capabilityHealth.providers.map((provider) => (
            <AgentCapabilityHealthCard key={provider.providerId} provider={provider} />
          ))}
        </AgentConsoleGrid>
      )}
    </AgentConsolePanel>
  )
}

function AgentCapabilityHealthCard({
  provider,
}: {
  provider: ReturnType<typeof useAgentControlCenter>['capabilityHealth']['providers'][number]
}) {
  return (
    <AgentConsoleLocalToolCard invalid={!provider.ok}>
      <AgentConsoleLocalToolHeader>
        <AgentConsoleLocalToolCopy>
          <AgentConsoleLocalToolTitle>{provider.providerLabel}</AgentConsoleLocalToolTitle>
          <AgentConsoleLocalToolDetail>{provider.providerKind} / {provider.providerId}</AgentConsoleLocalToolDetail>
        </AgentConsoleLocalToolCopy>
        <AgentConsoleLocalToolControls>
          <AgentConsoleStatusBadge intent={provider.ok ? 'success' : 'warning'} emphasis="soft">
            {provider.ok ? '能力正常' : `${provider.warningCount} 项需关注`}
          </AgentConsoleStatusBadge>
        </AgentConsoleLocalToolControls>
      </AgentConsoleLocalToolHeader>
      <AgentConsoleLocalToolFields>
        <AgentConsoleStack>
          {provider.credential ? (
            <AgentConsoleTestResult tone={provider.credential.ok ? 'success' : 'warning'}>
              SDK 凭据：{provider.credential.configured ? '已配置' : '未配置'} / {provider.credential.source} / {provider.credential.env}
              {provider.credential.modelEndpointBaseURL ? ` / ${provider.credential.modelEndpointBaseURL}` : ''}
            </AgentConsoleTestResult>
          ) : null}
          <AgentConsoleTestResult tone={provider.blockedToolCount > 0 ? 'warning' : 'success'}>
            Tools：{provider.toolCount} 可用 / {provider.blockedToolCount} 受限
          </AgentConsoleTestResult>
          <AgentConsoleTestResult tone="success">
            Skills：{provider.skillCount} / Plugins：{provider.pluginCount}
          </AgentConsoleTestResult>
          <AgentConsoleTestResult tone={provider.mcpServerCount > 0 ? 'success' : 'neutral'}>
            MCP：{provider.mcpServerCount} servers / {provider.mcpToolCount} tools
          </AgentConsoleTestResult>
          {provider.warnings.map((warning) => (
            <AgentConsoleTestResult key={warning} tone="warning">
              {warning}
            </AgentConsoleTestResult>
          ))}
        </AgentConsoleStack>
      </AgentConsoleLocalToolFields>
    </AgentConsoleLocalToolCard>
  )
}

function AgentRuntimeCredentialEditor({
  providerId,
  providerKind,
  providerLabel,
  onSaved,
}: {
  providerId: string
  providerKind: string
  providerLabel: string
  onSaved?: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [savedProviderKeys, setSavedProviderKeys] = useState<string[]>([])
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const providerKeys = useMemo(() => runtimeCredentialProviderKeys(providerId, providerKind), [providerId, providerKind])
  const configured = providerKeys.some((key) => savedProviderKeys.includes(key))
  const canSave = apiKey.trim().length > 0

  useEffect(() => {
    void refreshSavedKeys()
  }, [providerKeys.join('|')])

  async function refreshSavedKeys() {
    const electronApi = readElectronApi()
    if (!electronApi?.getAppSettingsSecrets) return
    setChecking(true)
    try {
      const secrets = await electronApi.getAppSettingsSecrets()
      setSavedProviderKeys(Object.keys(secrets.agentRuntimeApiKeys ?? {}))
    } catch (readError) {
      setError(errorMessage(readError))
    } finally {
      setChecking(false)
    }
  }

  async function saveKey(nextKey: string | null) {
    const electronApi = readElectronApi()
    if (!electronApi?.setAgentRuntimeApiKey) throw new Error('当前运行环境不支持保存 SDK 凭据。')
    const result = await electronApi.setAgentRuntimeApiKey({
      providerKey: providerId || providerKind,
      providerKeys,
      apiKey: nextKey,
    })
    console.log('[Movscript Claude credential flow] console.saveAgentRuntimeApiKey', JSON.stringify({
      providerId,
      providerKind,
      providerKeys,
      hasApiKey: Boolean(nextKey?.trim()),
      savedProviderKeys: Object.keys(result.agentRuntimeApiKeys),
    }))
    setSavedProviderKeys(Object.keys(result.agentRuntimeApiKeys))
  }

  async function submit() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await saveKey(apiKey.trim())
      setApiKey('')
      setMessage('Claude API Key 已保存。')
      onSaved?.()
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function clear() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await saveKey(null)
      setApiKey('')
      setMessage('Claude API Key 已移除。')
      onSaved?.()
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AgentConsoleStack>
      <AgentConsoleTestResult tone={configured ? 'success' : 'warning'}>
        {providerLabel} API Key：{checking ? '检查中...' : configured ? '已保存' : '未保存'}
        {savedProviderKeys.length > 0 ? ` / ${savedProviderKeys.join(', ')}` : ''}
      </AgentConsoleTestResult>
      <AgentConsoleFormField
        label={<><KeyRound size={12} /> Claude API Key</>}
        type="password"
        value={apiKey}
        placeholder="sk-ant-..."
        autoComplete="off"
        onChange={(event) => setApiKey(event.currentTarget.value)}
      />
      <AgentConsoleLocalToolActions>
        <AgentConsoleActionButton type="button" size="sm" variant="solid" onClick={() => void submit()} disabled={saving || !canSave}>
          <Save size={14} />
          {saving ? '保存中...' : '保存'}
        </AgentConsoleActionButton>
        <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void clear()} disabled={saving}>
          <Trash2 size={14} />
          移除
        </AgentConsoleActionButton>
      </AgentConsoleLocalToolActions>
      {message ? <AgentConsoleTestResult tone="success">{message}</AgentConsoleTestResult> : null}
      {error ? <AgentConsoleInlineError>{error}</AgentConsoleInlineError> : null}
    </AgentConsoleStack>
  )
}

function runtimeCredentialProviderKeys(providerId: string | undefined, providerKind: string | undefined): string[] {
  const keys = [providerId, providerKind]
  if (providerKind === 'claude') {
    keys.push('claude', 'claude-code', 'claude-sdk')
  }
  return Array.from(new Set(keys.filter((key): key is string => Boolean(key?.trim()))))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
