import { useTranslation } from 'react-i18next'
import { Clipboard, Loader2, RefreshCw, Settings } from 'lucide-react'
import {
  AgentSettingsActionButton,
  AgentSettingsFormField,
  AgentSettingsFieldLabel,
  AgentSettingsHeaderActions,
  AgentSettingsHeaderContent,
  AgentSettingsHeaderCopy,
  AgentSettingsHeaderDescription,
  AgentSettingsHeaderTitle,
  AgentSettingsHeaderTitleRow,
  AgentSettingsIcon,
  AgentSettingsScopeBadge,
  AgentSettingsScopeRail,
  AgentSettingsSelectTrigger,
  AgentSettingsStatusBadge,
} from '@/features/agent/components/AgentSettingsUi'
import { Select, SelectContent, SelectItem, SelectValue } from '@movscript/ui/primitives'
import { agentConfigStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import type { ProviderProfileConfigOption } from '@/features/agent/application/agentSettingsProviderModel'

export function AIAgentSettingsHeaderSection({
  configured,
  providerProfileConfigs,
  selectedProviderProfileConfigId,
  statusCopied,
  refreshing,
  onProviderProfileConfigChange,
  onCopyStatus,
  onRefresh,
}: {
  configured: boolean
  providerProfileConfigs: ProviderProfileConfigOption[]
  selectedProviderProfileConfigId: string
  statusCopied: boolean
  refreshing: boolean
  onProviderProfileConfigChange: (value: string) => void
  onCopyStatus: () => void | Promise<void>
  onRefresh: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const configStatusRecipe = agentConfigStatusRecipe(configured)

  return (
    <AgentSettingsHeaderContent>
      <AgentSettingsHeaderCopy>
        <AgentSettingsHeaderTitleRow>
          <Settings size={18} />
          <AgentSettingsHeaderTitle>{t('agents.settings.title')}</AgentSettingsHeaderTitle>
          <AgentSettingsStatusBadge intent={configStatusRecipe.intent} emphasis={configStatusRecipe.emphasis}>
            {configured ? t('agents.settings.configured') : t('agents.settings.notConfigured')}
          </AgentSettingsStatusBadge>
        </AgentSettingsHeaderTitleRow>
        <AgentSettingsHeaderDescription>{t('agents.settings.description')}</AgentSettingsHeaderDescription>
        <AgentSettingsScopeRail data-testid="agent-settings-scope-boundary" hidden>
          <AgentSettingsScopeBadge>{t('agents.settings.scope.controlPlane')}</AgentSettingsScopeBadge>
          <AgentSettingsScopeBadge muted>{t('agents.settings.scope.futureRuns')}</AgentSettingsScopeBadge>
          <AgentSettingsScopeBadge muted>{t('agents.settings.scope.debugReadOnly')}</AgentSettingsScopeBadge>
        </AgentSettingsScopeRail>
      </AgentSettingsHeaderCopy>
      <AgentSettingsHeaderActions>
        <AgentSettingsFormField>
          <AgentSettingsFieldLabel>{t('agents.settings.providerProfileConfigLabel')}</AgentSettingsFieldLabel>
          <Select value={selectedProviderProfileConfigId} onValueChange={onProviderProfileConfigChange}>
            <AgentSettingsSelectTrigger data-testid="agent-settings-workspace-profile">
              <SelectValue placeholder={t('agents.settings.selectProviderProfileConfig')} />
            </AgentSettingsSelectTrigger>
            <SelectContent>
              {providerProfileConfigs.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.labelKey ? t(profile.labelKey) : profile.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </AgentSettingsFormField>
        <AgentSettingsActionButton variant="outline" onClick={onCopyStatus} data-testid="agent-settings-copy-status">
          <Clipboard size={14} />
          {statusCopied ? t('agents.settings.settingsStatusCopied') : t('agents.settings.copySettingsStatus')}
        </AgentSettingsActionButton>
        <AgentSettingsActionButton variant="outline" onClick={onRefresh} disabled={refreshing} data-testid="agent-settings-refresh">
          {refreshing ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <RefreshCw size={14} />}
          {t('agents.settings.refresh')}
        </AgentSettingsActionButton>
      </AgentSettingsHeaderActions>
    </AgentSettingsHeaderContent>
  )
}
