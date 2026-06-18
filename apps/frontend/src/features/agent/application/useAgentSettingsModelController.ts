import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  redactAgentTraceDebugText,
} from '@movscript/core/agent'
import { fetchAgentBackendModels } from '@/features/agent/application/agentModelCatalogApi'
import { agentModelKeys } from '@/features/agent/application/agentModelQueryKeys'
import { agentSettingsKeys } from '@/features/agent/application/agentQueryKeys'
import {
  buildProviderModelOperationPlan,
  buildProviderModelTestRequest,
  clearedProviderModelWorkspaceDraft,
  modelDisplayName,
  providerConfigModelHasSecret,
  providerConfigUsesModelCatalog,
  providerModelSettingsHasUnsavedChanges,
  providerModelValue,
  providerModelWorkspaceDraftFromConfig,
  selectedProviderModel,
  storedProviderModelWorkspaceId,
  type ProviderModelWorkspaceDraft,
} from '@/features/agent/application/agentSettingsProviderModel'
import {
  buildModelRouteIssues,
} from '@/features/agent/application/agentSettingsReadiness'
import {
  DEFAULT_API_KIND,
  NO_MODEL_VALUE,
  modelAuditSummaryValues,
  settingsErrorMessage,
} from '@/features/agent/presentation/agentSettingsPageModel'
import type { AgentSettingsAuditEntry } from '@/features/agent/state/agentStore'
import type {
  ProviderSessionClient,
  ProviderModelConfigPublic,
  ProviderModelTestResult,
} from '@/shared/infrastructure/providerSessionClient'
import { publicModelLabel } from '@/shared/domain/modelDisplay'
import { publicModelId } from '@/shared/domain/modelDisplay'
import type { PublicModel } from '@/types'

interface UseAgentSettingsModelControllerInput {
  client: ProviderSessionClient
  providerProfileConfigId: string
  recordSettingsAudit: (entry: Omit<AgentSettingsAuditEntry, 'id' | 'createdAt'> & { createdAt?: string }) => void
  storedModelId: string | null | undefined
  updateAgentSettings: (settings: { modelId: string | null }) => void
}

export function useAgentSettingsModelController({
  client,
  providerProfileConfigId,
  recordSettingsAudit,
  storedModelId,
  updateAgentSettings,
}: UseAgentSettingsModelControllerInput) {
  const { t } = useTranslation()
  const [selectedModelId, setSelectedModelId] = useState<string>(NO_MODEL_VALUE)
  const [useForChat, setUseForChat] = useState(true)
  const [useForPlanner, setUseForPlanner] = useState(true)
  const [testMessage, setTestMessage] = useState(t('agents.settings.testMessageDefault'))
  const [saving, setSaving] = useState(false)
  const [clearingModelConfig, setClearingModelConfig] = useState(false)
  const [modelConfigClearConfirming, setModelConfigClearConfirming] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedConfig, setSavedConfig] = useState<ProviderModelConfigPublic | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ProviderModelTestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const configQuery = useQuery({
    queryKey: agentSettingsKeys.providerModelConfig(providerProfileConfigId, client.baseURL),
    queryFn: () => client.getProviderModelConfig(),
    retry: false,
  })

  const modelsQuery = useQuery<PublicModel[]>({
    queryKey: agentModelKeys.backendCatalog('default-backend'),
    queryFn: () => fetchAgentBackendModels(),
  })

  const textModels = modelsQuery.data ?? []
  const selectedModel = useMemo(() => selectedProviderModel(textModels, selectedModelId), [selectedModelId, textModels])
  const providerModelConfigValue = selectedModel ? publicModelId(selectedModel) : ''
  const modelValueMissing = !providerModelConfigValue
  const canSaveModelConfig = Boolean(providerModelConfigValue)
  const effectiveConfig = savedConfig ?? configQuery.data ?? null
  const legacyDirectModelConfig = Boolean(effectiveConfig?.configured && !providerConfigUsesModelCatalog(effectiveConfig))
  const modelRoutes = effectiveConfig?.capabilities ?? []
  const savedDirectModelIdHasSecret = providerConfigModelHasSecret(effectiveConfig)
  const effectiveModelValue = useMemo(() => (
    effectiveConfig?.configured ? providerModelValue(textModels, effectiveConfig) : NO_MODEL_VALUE
  ), [effectiveConfig, textModels])
  const configuredModelLabel = effectiveConfig?.configured
    ? redactAgentTraceDebugText(modelDisplayName(textModels, effectiveConfig))
    : t('agents.settings.notConfigured')
  const modelCredentialStatus = effectiveConfig?.credentialStatus
  const modelCredentialAcceptedEnv = modelCredentialStatus?.acceptedEnv?.join(', ') || 'model settings API key'
  const modelCredentialStatusLabel = modelCredentialStatus?.required
    ? modelCredentialStatus.configured
      ? t('agents.settings.modelCredentialStatus.configured', { env: modelCredentialStatus.sourceEnv.join(', ') })
      : t('agents.settings.modelCredentialStatus.missing', { env: modelCredentialAcceptedEnv })
    : t('agents.settings.modelCredentialStatus.notRequired')
  const hasUnsavedChanges = providerModelSettingsHasUnsavedChanges({
    effectiveConfig,
    providerModelConfigValue,
    effectiveModelValue,
    useForChat,
    useForPlanner,
    canSaveModelConfig,
  })
  const modelRouteIssues = useMemo(() => buildModelRouteIssues({ useForChat, useForPlanner }), [useForChat, useForPlanner])

  function applyWorkspaceDraft(draft: ProviderModelWorkspaceDraft) {
    setSelectedModelId(draft.selectedModelId)
    setUseForChat(draft.useForChat)
    setUseForPlanner(draft.useForPlanner)
  }

  function resetWorkspaceFromEffectiveConfig() {
    if (!effectiveConfig?.configured) return false
    applyWorkspaceDraft(providerModelWorkspaceDraftFromConfig({
      config: effectiveConfig,
      models: textModels,
      noModelValue: NO_MODEL_VALUE,
    }))
    return true
  }

  useEffect(() => {
    if (!configQuery.data) return
    if (configQuery.data.configured) {
      applyWorkspaceDraft(providerModelWorkspaceDraftFromConfig({
        config: configQuery.data,
        models: textModels,
        noModelValue: NO_MODEL_VALUE,
      }))
      return
    }
    const nextStoredModelId = storedProviderModelWorkspaceId(textModels, storedModelId)
    if (nextStoredModelId) setSelectedModelId(nextStoredModelId)
  }, [configQuery.data, storedModelId, textModels])

  useEffect(() => {
    setModelConfigClearConfirming(false)
  }, [providerModelConfigValue, useForChat, useForPlanner])

  function recordModelOperationFailure(operation: string, error: string) {
    recordSettingsAudit({
      action: 'settings_operation_failed',
      target: 'model',
      summary: t('agents.settings.auditSummaries.operationFailed', {
        operation,
        error: redactAgentTraceDebugText(error),
      }),
    })
  }

  function buildModelOperationPlan() {
    return buildProviderModelOperationPlan({
      selectedModel,
      usesModelCatalog: true,
      model: providerModelConfigValue,
      apiKind: DEFAULT_API_KIND,
      baseURL: '',
      apiKey: '',
      useForChat,
      useForPlanner,
    })
  }

  function modelAuditValues() {
    return modelAuditSummaryValues({
      t,
      useForChat,
      useForPlanner,
      selectedModelLabel: selectedModel ? publicModelLabel(selectedModel, true) : undefined,
    })
  }

  async function saveSettings() {
    if (!providerModelConfigValue) return
    setSaving(true)
    setSaveError(null)
    setTestResult(null)
    setTestError(null)
    try {
      const modelOperationPlan = buildModelOperationPlan()
      const nextConfig = await client.saveProviderModelConfig(modelOperationPlan.request)
      setSavedConfig(nextConfig)
      updateAgentSettings({ modelId: modelOperationPlan.storedModelId })
      await configQuery.refetch()
      recordSettingsAudit({
        action: 'model_saved',
        target: 'model',
        summary: t('agents.settings.auditSummaries.modelSaved', modelAuditValues()),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setSaveError(message)
      recordModelOperationFailure(t('agents.settings.modelPanel'), message)
    } finally {
      setSaving(false)
    }
  }

  async function testSettings() {
    if (!providerModelConfigValue) return
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    setSaveError(null)
    try {
      const modelOperationPlan = buildModelOperationPlan()
      await client.saveProviderModelConfig(modelOperationPlan.request)
      updateAgentSettings({ modelId: modelOperationPlan.storedModelId })
      await client.ensureRunning()
      const result = await client.testModelConfig(buildProviderModelTestRequest({
        request: modelOperationPlan.request,
        message: testMessage,
        fallbackMessage: t('agents.settings.testMessageDefault'),
      }))
      setTestResult(result)
      await configQuery.refetch()
      recordSettingsAudit({
        action: 'model_tested',
        target: 'model',
        summary: t('agents.settings.auditSummaries.modelTested', modelAuditValues()),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setTestError(message)
      recordModelOperationFailure(t('agents.settings.test'), message)
    } finally {
      setTesting(false)
    }
  }

  async function clearModelConfig() {
    if (!effectiveConfig?.configured && !hasUnsavedChanges) return
    if (!modelConfigClearConfirming) {
      setModelConfigClearConfirming(true)
      setSaveError(null)
      setTestError(null)
      return
    }
    setClearingModelConfig(true)
    setSaveError(null)
    setTestError(null)
    setTestResult(null)
    try {
      const nextConfig = await client.clearProviderModelConfig()
      setSavedConfig(nextConfig)
      applyWorkspaceDraft(clearedProviderModelWorkspaceDraft({ noModelValue: NO_MODEL_VALUE }))
      setModelConfigClearConfirming(false)
      updateAgentSettings({ modelId: null })
      await configQuery.refetch()
      recordSettingsAudit({
        action: 'model_cleared',
        target: 'model',
        summary: t('agents.settings.auditSummaries.modelCleared'),
      })
    } catch (error) {
      const message = settingsErrorMessage(error)
      setSaveError(message)
      recordModelOperationFailure(t('agents.settings.clearModelConfig'), message)
    } finally {
      setClearingModelConfig(false)
    }
  }

  function resetTransientState() {
    setSavedConfig(null)
    setTestResult(null)
    setTestError(null)
    setSaveError(null)
  }

  return {
    canSaveModelConfig,
    clearModelConfig,
    clearingModelConfig,
    configQuery,
    configuredModelLabel,
    effectiveConfig,
    effectiveModelValue,
    hasUnsavedChanges,
    modelConfigClearConfirming,
    modelCredentialAcceptedEnv,
    modelCredentialStatus,
    modelCredentialStatusLabel,
    modelRouteIssues,
    modelRoutes,
    modelValueMissing,
    modelsQuery,
    providerModelConfigValue,
    resetTransientState,
    resetWorkspaceFromEffectiveConfig,
    saveError,
    saveSettings,
    savedDirectModelIdHasSecret,
    selectedModel,
    selectedModelId,
    setModelConfigClearConfirming,
    setSavedConfig,
    setSelectedModelId,
    setTestMessage,
    setUseForChat,
    setUseForPlanner,
    testError,
    testMessage,
    testResult,
    testSettings,
    testing,
    textModels,
    useForChat,
    useForPlanner,
    legacyDirectModelConfig,
    saving,
    applyWorkspaceDraft,
  }
}
