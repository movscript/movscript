import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Save, TestTube2, Trash2 } from 'lucide-react'
import {
  AgentDataBlock,
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
  AgentSettingsInput,
  AgentSettingsKeyValue,
  AgentSettingsPanel,
  AgentSettingsSelectTrigger,
  AgentSettingsStatusBadge,
  AgentSettingsToggleRow,
  AgentSettingsToneText,
  agentSettingsStatusRecipe,
} from '@movscript/ui/business/agent'
import { AppInlineError } from '@movscript/ui/business/app'
import { Select, SelectContent, SelectItem, SelectValue } from '@movscript/ui/primitives'
import { redactAgentTraceDebugText, type ProviderModelAPIKind } from '@movscript/core/agent'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import type { PublicModel } from '@/types'
import type { ProviderModelConfigPublic, ProviderModelTestResult } from '@/shared/infrastructure/providerSessionClient'
import { agentTestResultRecipe } from '@/features/agent/presentation/agentSemanticUi'
import { apiKindBaseURLPlaceholder } from '@/features/agent/application/agentSettingsProviderModel'
import { API_KIND_OPTIONS, NO_MODEL_VALUE } from '@/features/agent/presentation/agentSettingsPageModel'
import {
  ApiModeCapabilityMatrix,
  ApiModeMigrationGuide,
  ApiModeSwitchPlanPanel,
  ModelCompatibilityProbePanel,
} from '@/features/agent/components/AIAgentSettingsPageParts'
import type { ApiModeSwitchPlanItem, ModelCompatibilityProbe } from '@/features/agent/application/agentSettingsReadiness'

export function AIAgentSettingsModelPanel({
  selectedApiKind,
  setSelectedApiKind,
  baseURL,
  setBaseURL,
  modelBaseURLHasSecret,
  onStripModelBaseURLSecrets,
  usesManualModelId,
  baseURLValue,
  usesBackendCompatibleBaseURL,
  modelApiKey,
  setModelApiKey,
  effectiveConfig,
  usesModelCatalog,
  selectedModelId,
  setSelectedModelId,
  directModelId,
  setDirectModelId,
  textModels,
  modelValueMissing,
  directModelIdHasSecret,
  useForChat,
  setUseForChat,
  useForPlanner,
  setUseForPlanner,
  modelRouteIssues,
  modelCompatibilityProbes,
  apiModeSwitchTaskGraph,
  selectedModel,
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
  onSwitchToResponses,
}: {
  selectedApiKind: ProviderModelAPIKind
  setSelectedApiKind: Dispatch<SetStateAction<ProviderModelAPIKind>>
  baseURL: string
  setBaseURL: Dispatch<SetStateAction<string>>
  modelBaseURLHasSecret: boolean
  onStripModelBaseURLSecrets: () => void
  usesManualModelId: boolean
  baseURLValue: string
  usesBackendCompatibleBaseURL: boolean
  modelApiKey: string
  setModelApiKey: Dispatch<SetStateAction<string>>
  effectiveConfig: ProviderModelConfigPublic | null
  usesModelCatalog: boolean
  selectedModelId: string
  setSelectedModelId: Dispatch<SetStateAction<string>>
  directModelId: string
  setDirectModelId: Dispatch<SetStateAction<string>>
  textModels: PublicModel[]
  modelValueMissing: boolean
  directModelIdHasSecret: boolean
  useForChat: boolean
  setUseForChat: Dispatch<SetStateAction<boolean>>
  useForPlanner: boolean
  setUseForPlanner: Dispatch<SetStateAction<boolean>>
  modelRouteIssues: string[]
  modelCompatibilityProbes: ModelCompatibilityProbe[]
  apiModeSwitchTaskGraph: ApiModeSwitchPlanItem[]
  selectedModel?: PublicModel
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
  onSwitchToResponses: () => void
}) {
  const { t } = useTranslation()

  return (
    <AgentSettingsPanel
      id="agent-settings-model"
      title={t('agents.settings.modelPanel')}
    >
      <AgentSettingsFieldHelp>{t('agents.settings.sectionDescriptions.model')}</AgentSettingsFieldHelp>
      <ApiModeCapabilityMatrix apiKind={selectedApiKind} t={t} />
      <AgentSettingsFormGrid columns="model">
        <AgentSettingsFormField>
          <AgentSettingsFieldLabel>{t('agents.settings.apiKindLabel')}</AgentSettingsFieldLabel>
          <Select
            value={selectedApiKind}
            onValueChange={(value) => {
              const apiKind = value as ProviderModelAPIKind
              setSelectedApiKind(apiKind)
            }}
          >
            <AgentSettingsSelectTrigger>
              <SelectValue placeholder={t('agents.settings.selectApiKind')} />
            </AgentSettingsSelectTrigger>
            <SelectContent>
              {API_KIND_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AgentSettingsFieldHelp>
            {t(API_KIND_OPTIONS.find((option) => option.value === selectedApiKind)?.descriptionKey ?? API_KIND_OPTIONS[0].descriptionKey)}
          </AgentSettingsFieldHelp>
        </AgentSettingsFormField>

        <AgentSettingsFormField>
          <AgentSettingsFieldLabel>{t('agents.settings.baseUrlLabel')}</AgentSettingsFieldLabel>
          <AgentSettingsInput
            value={baseURL}
            onChange={(event) => setBaseURL(event.target.value)}
            placeholder={apiKindBaseURLPlaceholder(selectedApiKind)}
          />
          <AgentSettingsFieldHelp>{t('agents.settings.baseUrlHelp')}</AgentSettingsFieldHelp>
          {modelBaseURLHasSecret && (
            <AgentSettingsCallout data-testid="agent-settings-base-url-secret-warning" tone="danger" compact>
              {t('agents.settings.baseUrlSecretsBlocked')}
              <AgentSettingsActionButton
                size="xs"
                variant="outline"
                onClick={onStripModelBaseURLSecrets}
                data-testid="agent-settings-strip-base-url-secrets"
              >
                {t('agents.settings.quickFixes.stripSensitiveBaseURLQuery')}
              </AgentSettingsActionButton>
            </AgentSettingsCallout>
          )}
          {usesManualModelId && baseURLValue && !usesBackendCompatibleBaseURL && (
            <AgentSettingsFormField>
              <AgentSettingsFieldLabel>{t('agents.settings.providerApiKeyLabel')}</AgentSettingsFieldLabel>
              <AgentSettingsInput
                value={modelApiKey}
                onChange={(event) => setModelApiKey(event.target.value)}
                placeholder={effectiveConfig?.apiKeyConfigured ? t('agents.settings.providerApiKeyConfiguredPlaceholder') : t('agents.settings.providerApiKeyPlaceholder')}
                type="password"
                autoComplete="off"
                data-testid="agent-settings-provider-api-key"
              />
              <AgentSettingsFieldHelp>{t('agents.settings.providerCredentialHelp')}</AgentSettingsFieldHelp>
            </AgentSettingsFormField>
          )}
        </AgentSettingsFormField>
      </AgentSettingsFormGrid>

      <AgentSettingsFormField>
        <AgentSettingsFieldLabel>
          {usesModelCatalog ? t('agents.settings.modelLabel') : t('agents.settings.providerModelIdLabel')}
        </AgentSettingsFieldLabel>
        {usesModelCatalog ? (
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
        ) : (
          <AgentSettingsInput
            value={directModelId}
            onChange={(event) => setDirectModelId(event.target.value)}
            placeholder={t('agents.settings.providerModelIdPlaceholder')}
            data-testid="agent-settings-provider-model-id"
          />
        )}
        <AgentSettingsFieldHelp>
          {usesModelCatalog ? t('agents.settings.modelHelp') : t('agents.settings.providerModelIdHelp')}
        </AgentSettingsFieldHelp>
        {modelValueMissing && (
          <AgentSettingsToneText tone="danger">
            {t('agents.settings.modelRequired')}
          </AgentSettingsToneText>
        )}
        {directModelIdHasSecret && (
          <AgentSettingsCallout data-testid="agent-settings-provider-model-id-secret-warning" tone="danger" compact>
            {t('agents.settings.modelIdSecretsBlocked')}
          </AgentSettingsCallout>
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
      <ModelCompatibilityProbePanel probes={modelCompatibilityProbes} />
      <ApiModeMigrationGuide
        apiKind={selectedApiKind}
        onSwitchToResponses={onSwitchToResponses}
      />
      <ApiModeSwitchPlanPanel apiKind={selectedApiKind} items={apiModeSwitchTaskGraph} />
      {usesModelCatalog && selectedModel && (
        <AgentSettingsFormGrid columns="two">
          <AgentSettingsKeyValue label={t('agents.settings.fields.modelId')} value={publicModelId(selectedModel)} />
          <AgentSettingsKeyValue label={t('agents.settings.fields.capabilities')} value={selectedModel.capabilities.join(', ') || '-'} />
          <AgentSettingsKeyValue label={t('agents.settings.fields.provider')} value={selectedModel.provider_name || '-'} />
          <AgentSettingsKeyValue label={t('agents.settings.fields.configId')} value={`#${selectedModel.id}`} />
        </AgentSettingsFormGrid>
      )}
      <AgentSettingsActionRow>
        <AgentSettingsActionButton onClick={onSave} disabled={!canSaveModelConfig || saving || modelRouteIssues.length > 0 || modelBaseURLHasSecret}>
          {saving ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
          {hasUnsavedChanges ? t('agents.settings.save') : t('agents.settings.saved')}
        </AgentSettingsActionButton>
        <AgentSettingsActionButton variant="outline" onClick={onTest} disabled={!canSaveModelConfig || testing || modelRouteIssues.length > 0 || modelBaseURLHasSecret}>
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
