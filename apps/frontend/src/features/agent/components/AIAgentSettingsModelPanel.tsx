import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Save, TestTube2, Trash2 } from 'lucide-react'
import { AgentDataBlock } from '@movscript/ui/business/agent'
import {
  AgentSettingsActionButton,
  AgentSettingsActionRow,
  AgentSettingsCallout,
  AgentSettingsCodeBlock,
  AgentSettingsFieldHelp,
  AgentSettingsFieldLabel,
  AgentSettingsFormField,
  AgentSettingsFormGrid,
  AgentSettingsIcon,
  AgentSettingsInlineNote,
  AgentSettingsKeyValue,
  AgentSettingsPanel,
  AgentSettingsSelectTrigger,
  AgentSettingsStatusBadge,
  AgentSettingsToggleRow,
  AgentSettingsToneText,
  agentSettingsStatusRecipe,
} from '@/features/agent/components/AgentSettingsUi'
import { AppInlineError } from '@movscript/ui/business/app'
import { Select, SelectContent, SelectItem, SelectValue } from '@movscript/ui/primitives'
import { redactAgentTraceDebugText } from '@movscript/core/agent'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import type { PublicModel } from '@/types'
import type { ProviderModelConfigPublic, ProviderModelTestResult } from '@movscript/core/agent/protocol'
import { agentTestResultRecipe } from '@/features/agent/presentation/agentSemanticUi'
import { NO_MODEL_VALUE } from '@/features/agent/presentation/agentSettingsPageModel'

export function AIAgentSettingsModelPanel({
  effectiveConfig,
  selectedModelId,
  setSelectedModelId,
  textModels,
  modelValueMissing,
  useForChat,
  setUseForChat,
  useForPlanner,
  setUseForPlanner,
  modelRouteIssues,
  selectedModel,
  legacyDirectModelConfig,
  canSaveModelConfig,
  saving,
  hasUnsavedChanges,
  onSave,
  testing,
  onTest,
  modelConfigClearConfirming,
  clearingModelConfig,
  onClearModelConfig,
  saveError,
  testError,
  testResult,
}: {
  effectiveConfig: ProviderModelConfigPublic | null
  selectedModelId: string
  setSelectedModelId: Dispatch<SetStateAction<string>>
  textModels: PublicModel[]
  modelValueMissing: boolean
  useForChat: boolean
  setUseForChat: Dispatch<SetStateAction<boolean>>
  useForPlanner: boolean
  setUseForPlanner: Dispatch<SetStateAction<boolean>>
  modelRouteIssues: string[]
  selectedModel?: PublicModel
  legacyDirectModelConfig: boolean
  canSaveModelConfig: boolean
  saving: boolean
  hasUnsavedChanges: boolean
  onSave: () => void | Promise<void>
  testing: boolean
  onTest: () => void | Promise<void>
  modelConfigClearConfirming: boolean
  clearingModelConfig: boolean
  onClearModelConfig: () => void | Promise<void>
  saveError: string | null
  testError: string | null
  testResult: ProviderModelTestResult | null
}) {
  const { t } = useTranslation()

  return (
    <AgentSettingsPanel
      id="agent-settings-model"
      title={t('agents.settings.modelPanel')}
    >
      <AgentSettingsFieldHelp>{t('agents.settings.sectionDescriptions.model')}</AgentSettingsFieldHelp>
      <AgentSettingsCallout compact tone={legacyDirectModelConfig ? 'warning' : 'neutral'}>
        {legacyDirectModelConfig
          ? t('agents.settings.legacyDirectModelConfigNotice')
          : t('agents.settings.modelCatalogOnlyNotice')}
      </AgentSettingsCallout>

      <AgentSettingsFormField>
        <AgentSettingsFieldLabel>
          {t('agents.settings.modelLabel')}
        </AgentSettingsFieldLabel>
        <Select value={selectedModelId} onValueChange={setSelectedModelId}>
          <AgentSettingsSelectTrigger>
            <SelectValue placeholder={t('agents.settings.selectModel')} />
          </AgentSettingsSelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MODEL_VALUE} disabled>{t('agents.settings.selectModel')}</SelectItem>
            {textModels.length === 0 ? (
              <SelectItem value="__empty_text_models" disabled>{t('agents.settings.noTextModels')}</SelectItem>
            ) : textModels.map((model) => (
              <SelectItem key={model.id} value={publicModelId(model)}>
                {publicModelLabel(model, true)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <AgentSettingsFieldHelp>
          {t('agents.settings.modelHelp')}
        </AgentSettingsFieldHelp>
        {modelValueMissing && (
          <AgentSettingsToneText tone="danger">
            {t('agents.settings.modelRequired')}
          </AgentSettingsToneText>
        )}
      </AgentSettingsFormField>

      <AgentSettingsFormGrid columns="two">
        <AgentSettingsToggleRow checked={useForChat} onChange={setUseForChat} title={t('agents.settings.useForChat')} description={t('agents.settings.useForChatHelp')} />
        <AgentSettingsToggleRow checked={useForPlanner} onChange={setUseForPlanner} title={t('agents.settings.useForPlanner')} description={t('agents.settings.useForPlannerHelp')} />
      </AgentSettingsFormGrid>
      {modelRouteIssues.length > 0 && (
        <AgentSettingsCallout tone="warning" compact>
          {modelRouteIssues.map((issue) => t(`agents.settings.modelRouteIssues.${issue}`)).join('\n')}
        </AgentSettingsCallout>
      )}
      {selectedModel && (
        <AgentSettingsFormGrid columns="two">
          <AgentSettingsKeyValue label={t('agents.settings.fields.modelId')} value={publicModelId(selectedModel)} />
          <AgentSettingsKeyValue label={t('agents.settings.fields.capabilities')} value={selectedModel.capabilities.join(', ') || '-'} />
          <AgentSettingsKeyValue label={t('agents.settings.fields.provider')} value={selectedModel.provider_name || '-'} />
        </AgentSettingsFormGrid>
      )}
      <AgentSettingsActionRow>
        <AgentSettingsActionButton onClick={onSave} disabled={!canSaveModelConfig || saving || modelRouteIssues.length > 0}>
          {saving ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
          {hasUnsavedChanges ? t('agents.settings.save') : t('agents.settings.saved')}
        </AgentSettingsActionButton>
        <AgentSettingsActionButton variant="outline" onClick={onTest} disabled={!canSaveModelConfig || testing || modelRouteIssues.length > 0}>
          {testing ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <TestTube2 size={14} />}
          {t('agents.settings.test')}
        </AgentSettingsActionButton>
        <AgentSettingsActionButton
          variant={modelConfigClearConfirming ? 'solid' : 'outline'}
          onClick={onClearModelConfig}
          disabled={clearingModelConfig || (!effectiveConfig?.configured && !hasUnsavedChanges)}
          data-testid="agent-settings-clear-model-config"
          intent={modelConfigClearConfirming ? 'danger' : 'neutral'}
        >
          {clearingModelConfig ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Trash2 size={14} />}
          {modelConfigClearConfirming ? t('agents.settings.clearModelConfigConfirm') : t('agents.settings.clearModelConfig')}
        </AgentSettingsActionButton>
      </AgentSettingsActionRow>
      {saveError && <AppInlineError>{saveError}</AppInlineError>}
      {testError && <AppInlineError>{testError}</AppInlineError>}
      {testResult && (
        <AgentDataBlock>
          <AgentSettingsActionRow>
            <AgentSettingsStatusBadge intent={agentTestResultRecipe(testResult.ok).intent} emphasis={agentTestResultRecipe(testResult.ok).emphasis}>
              {testResult.ok ? t('agents.settings.testOk') : t('agents.settings.testFailed')}
            </AgentSettingsStatusBadge>
            <AgentSettingsInlineNote>{redactAgentTraceDebugText(testResult.model)}</AgentSettingsInlineNote>
            <AgentSettingsInlineNote>{testResult.latencyMs}ms</AgentSettingsInlineNote>
          </AgentSettingsActionRow>
          <AgentSettingsCodeBlock>
            {testResult.content ? redactAgentTraceDebugText(testResult.content) : '-'}
          </AgentSettingsCodeBlock>
        </AgentDataBlock>
      )}
    </AgentSettingsPanel>
  )
}
