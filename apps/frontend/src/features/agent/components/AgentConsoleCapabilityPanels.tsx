import { useEffect, useState } from 'react'
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
import type { AgentProfile, AgentRuntimeCapabilitySummary } from '@/features/agent/application/agentProfileModel'

export function AgentRuntimeCredentialPanel({
  profile,
  onCredentialSaved,
}: {
  profile?: AgentProfile
  onCredentialSaved?: () => void
}) {
  const credentialHint = profile?.credentialHint
  if (!profile || !credentialHint) return null
  return (
    <AgentConsolePanel
      title="Runtime 凭据"
      icon={<KeyRound size={14} />}
      action={
        <AgentConsolePanelActions>
          <AgentConsoleStatusBadge intent="warning" emphasis="soft">{credentialHint.env}</AgentConsoleStatusBadge>
        </AgentConsolePanelActions>
      }
    >
      <AgentRuntimeCredentialEditor
        providerKey={credentialHint.providerKey}
        providerKeys={credentialHint.providerKeys}
        providerLabel={profile.label}
        credentialLabel={credentialHint.label}
        credentialPlaceholder={credentialHint.placeholder}
        supportReason={credentialHint.support.reason}
        onSaved={onCredentialSaved}
      />
    </AgentConsolePanel>
  )
}

export function AgentCapabilityHealthPanel({
  profile,
  capabilityHealth,
  loading,
}: {
  profile?: AgentProfile
  capabilityHealth: ReturnType<typeof useAgentControlCenter>['capabilityHealth']
  loading: boolean
}) {
  const summary = profile?.runtimeBackend.capabilitySummary
  const hasRuntimeContract = Boolean(summary)
  return (
    <AgentConsolePanel
      title="Runtime 能力与运行探测"
      icon={<PlugZap size={14} />}
      action={
        <AgentConsolePanelActions>
          {loading && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
          <AgentConsoleStatusBadge intent={summary ? runtimeCapabilityStatusIntent(summary) : capabilityHealth.warningCount > 0 ? 'warning' : capabilityHealth.checkedProviderCount > 0 ? 'success' : 'neutral'} emphasis="soft">
            {summary ? `Contract ${summary.supportedCount}/${summary.totalCount}` : capabilityHealth.checkedProviderCount > 0 ? `Probe ${capabilityHealth.checkedProviderCount} checked` : '等待当前 Agent'}
          </AgentConsoleStatusBadge>
        </AgentConsolePanelActions>
      }
    >
      {!hasRuntimeContract && capabilityHealth.providers.length === 0 ? (
        <AgentConsoleEmptyText>当前 Agent 连接可用后，这里会先展示 Runtime contract，再汇总 probe health。</AgentConsoleEmptyText>
      ) : (
        <AgentConsoleGrid columns="single">
          {profile ? <AgentRuntimeCapabilitySupportCard profile={profile} /> : null}
          {capabilityHealth.providers.length === 0 ? (
            <AgentConsoleEmptyText>Runtime contract 已加载；运行探测同步后会补充 Tools、Skills、Plugins 和 MCP 健康状态。</AgentConsoleEmptyText>
          ) : null}
          {capabilityHealth.providers.map((provider) => (
            <AgentCapabilityHealthCard key={provider.providerId} provider={provider} profile={profile} />
          ))}
        </AgentConsoleGrid>
      )}
    </AgentConsolePanel>
  )
}

function AgentCapabilityHealthCard({
  provider,
  profile,
}: {
  provider: ReturnType<typeof useAgentControlCenter>['capabilityHealth']['providers'][number]
  profile?: AgentProfile
}) {
  return (
    <AgentConsoleLocalToolCard invalid={!provider.ok}>
      <AgentConsoleLocalToolHeader>
        <AgentConsoleLocalToolCopy>
          <AgentConsoleLocalToolTitle>{provider.providerLabel}</AgentConsoleLocalToolTitle>
          <AgentConsoleLocalToolDetail>{runtimeProbeHealthDetail(provider.providerId, profile)}</AgentConsoleLocalToolDetail>
        </AgentConsoleLocalToolCopy>
        <AgentConsoleLocalToolControls>
          <AgentConsoleStatusBadge intent={provider.ok ? 'success' : 'warning'} emphasis="soft">
            {provider.ok ? 'Probe 正常' : `${provider.warningCount} 项 probe 告警`}
          </AgentConsoleStatusBadge>
        </AgentConsoleLocalToolControls>
      </AgentConsoleLocalToolHeader>
      <AgentConsoleLocalToolFields>
        <AgentConsoleStack>
          {provider.credential ? (
            <AgentConsoleTestResult tone={provider.credential.ok ? 'success' : 'warning'}>
              Probe 凭据：{provider.credential.configured ? '已配置' : '未配置'} / {provider.credential.source} / {provider.credential.env}
              {provider.credential.modelEndpointBaseURL ? ` / ${provider.credential.modelEndpointBaseURL}` : ''}
            </AgentConsoleTestResult>
          ) : null}
          <AgentConsoleTestResult tone={provider.blockedToolCount > 0 ? 'warning' : 'success'}>
            Probe Tools：{provider.toolCount} 可用 / {provider.blockedToolCount} 受限
          </AgentConsoleTestResult>
          <AgentConsoleTestResult tone="success">
            Probe Skills：{provider.skillCount} / Plugins：{provider.pluginCount}
          </AgentConsoleTestResult>
          <AgentConsoleTestResult tone={provider.mcpServerCount > 0 ? 'success' : 'neutral'}>
            Probe MCP：{provider.mcpServerCount} servers / {provider.mcpToolCount} tools
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

function AgentRuntimeCapabilitySupportCard({ profile }: { profile: AgentProfile }) {
  const summary = profile.runtimeBackend.capabilitySummary
  return (
    <AgentConsoleLocalToolCard invalid={summary.status === 'unavailable'}>
      <AgentConsoleLocalToolHeader>
        <AgentConsoleLocalToolCopy>
          <AgentConsoleLocalToolTitle>{profile.runtimeBackend.label}</AgentConsoleLocalToolTitle>
          <AgentConsoleLocalToolDetail>Runtime contract / {profile.connectionLabel}</AgentConsoleLocalToolDetail>
        </AgentConsoleLocalToolCopy>
        <AgentConsoleLocalToolControls>
          <AgentConsoleStatusBadge intent={runtimeCapabilityStatusIntent(summary)} emphasis="soft">
            {runtimeCapabilityStatusLabel(summary)}
          </AgentConsoleStatusBadge>
        </AgentConsoleLocalToolControls>
      </AgentConsoleLocalToolHeader>
      <AgentConsoleLocalToolFields>
        <AgentConsoleTestResult tone={runtimeCapabilityTone(summary)}>
          Contract：{summary.supportedCount}/{summary.totalCount} 项能力完整支持
          {summary.limitedCount > 0 ? ` / ${summary.limitedCount} 项受限` : ''}
        </AgentConsoleTestResult>
        {summary.limitedReasons.slice(0, 2).map((reason) => (
          <AgentConsoleTestResult key={reason} tone="warning">
            {reason}
          </AgentConsoleTestResult>
        ))}
      </AgentConsoleLocalToolFields>
    </AgentConsoleLocalToolCard>
  )
}

function runtimeProbeHealthDetail(providerId: string, profile: AgentProfile | undefined): string {
  if (!profile) return providerId
  return `Probe health / ${profile.runtimeBackend.label} / ${profile.routeKey}`
}

function runtimeCapabilityStatusIntent(summary: AgentRuntimeCapabilitySummary): 'success' | 'warning' | 'neutral' {
  if (summary.status === 'supported') return 'success'
  if (summary.status === 'limited') return 'warning'
  return 'neutral'
}

function runtimeCapabilityStatusLabel(summary: AgentRuntimeCapabilitySummary): string {
  if (summary.status === 'supported') return '能力完整'
  if (summary.status === 'limited') return `${summary.limitedCount} 项受限`
  return '未声明'
}

function runtimeCapabilityTone(summary: AgentRuntimeCapabilitySummary): 'success' | 'warning' | 'neutral' {
  if (summary.status === 'supported') return 'success'
  if (summary.status === 'limited') return 'warning'
  return 'neutral'
}

function AgentRuntimeCredentialEditor({
  providerKey,
  providerKeys,
  providerLabel,
  credentialLabel,
  credentialPlaceholder,
  supportReason,
  onSaved,
}: {
  providerKey: string
  providerKeys: string[]
  providerLabel: string
  credentialLabel: string
  credentialPlaceholder: string
  supportReason?: string
  onSaved?: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [savedProviderKeys, setSavedProviderKeys] = useState<string[]>([])
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const configured = providerKeys.some((key) => savedProviderKeys.includes(key))
  const canSave = apiKey.trim().length > 0

  useEffect(() => {
    void refreshSavedKeys()
  }, [providerKeys.join('|')])

  async function refreshSavedKeys() {
    const electronApi = readElectronApi()
    if (!electronApi?.getAgentRuntimeCredentialSummary) return
    setChecking(true)
    try {
      const summary = await electronApi.getAgentRuntimeCredentialSummary()
      setSavedProviderKeys(summary.savedProviderKeys)
    } catch (readError) {
      setError(errorMessage(readError))
    } finally {
      setChecking(false)
    }
  }

  async function saveKey(nextKey: string | null) {
    const electronApi = readElectronApi()
    if (!electronApi?.setAgentRuntimeApiKey) throw new Error('当前运行环境不支持保存 Runtime 凭据。')
    const result = await electronApi.setAgentRuntimeApiKey({
      providerKey,
      providerKeys,
      apiKey: nextKey,
    })
    console.log('[Movscript runtime credential flow] console.saveAgentRuntimeApiKey', JSON.stringify({
      providerKey,
      providerKeys,
      hasApiKey: Boolean(nextKey?.trim()),
      savedProviderKeys: result.savedProviderKeys,
    }))
    setSavedProviderKeys(result.savedProviderKeys)
  }

  async function submit() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await saveKey(apiKey.trim())
      setApiKey('')
      setMessage(`${credentialLabel} 已保存。`)
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
      setMessage(`${credentialLabel} 已移除。`)
      onSaved?.()
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AgentConsoleStack>
      {supportReason ? <AgentConsoleTestResult tone="warning">{supportReason}</AgentConsoleTestResult> : null}
      <AgentConsoleTestResult tone={configured ? 'success' : 'warning'}>
        {providerLabel} {credentialLabel}：{checking ? '检查中...' : configured ? '已保存' : '未保存'}
        {savedProviderKeys.length > 0 ? ` / ${savedProviderKeys.join(', ')}` : ''}
      </AgentConsoleTestResult>
      <AgentConsoleFormField
        label={<><KeyRound size={12} /> {credentialLabel}</>}
        type="password"
        value={apiKey}
        placeholder={credentialPlaceholder}
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
