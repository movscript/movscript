import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { redactAgentTraceDebugText } from '@movscript/core/agent'
import {
  buildActivateConfigFilePlan,
  buildBlankConfigFileSavePlan,
  buildConfigFileDetailsSavePlan,
  buildConfigFileDiff,
  buildConfigFileRollbackRestorePlan,
  buildDeleteConfigFilePlan,
  buildDuplicateConfigFileSavePlan,
  buildImportedConfigFileSavePlan,
  commitProviderConfigFilePlan,
  configFileApprovalDefaultWorkspacesFromConfigFile,
  configFileExportFilename,
  configFileExportText,
  configFileFileSizeError,
  configFileLimitWorkspacesFromConfigFile,
  currentProviderConfigFile,
  currentProviderConfigFileId,
  emptyConfigFileApprovalDefaultWorkspaces,
  emptyConfigFileLimitWorkspaces,
  hasConfigFileDetailsChanged,
  isManagedConfigFile,
  normalizeConfigFileApprovalDefaultWorkspaces,
  normalizeConfigFileLimitWorkspaces,
  parseManagedConfigFileExportText,
  selectedProviderConfigFile,
  type ConfigFileApprovalDefaultKey,
  type ConfigFileApprovalDefaultWorkspaceValue,
  type ConfigFileLimitKey,
  type ProviderConfigFileCommitClient,
  type ProviderConfigFileCommitPlan,
} from '@/features/agent/application/agentSettingsConfigFile'
import { MAX_CONFIG_FILE_BYTES, settingsErrorMessage } from '@/features/agent/presentation/agentSettingsPageModel'
import type { AgentSettingsAuditEntry, AgentSettingsConfigFileBackup } from '@/features/agent/state/agentStore'
import type { ProviderCatalogInspectResponse } from '@movscript/agent-protocol'
import { copyTextToClipboard, downloadTextFile } from '@/shared/ui/browserActions'

interface UseAgentSettingsConfigFileControllerInput {
  backup: AgentSettingsConfigFileBackup | null
  catalog?: ProviderCatalogInspectResponse
  client: ProviderConfigFileCommitClient
  recordSettingsAudit: (entry: Omit<AgentSettingsAuditEntry, 'id' | 'createdAt'> & { createdAt?: string }) => void
  refetchCapabilities: () => Promise<unknown>
  refetchCatalog: () => Promise<unknown>
  updateAgentSettings: (settings: { lastConfigFileBackup: AgentSettingsConfigFileBackup | null }) => void
}

export function useAgentSettingsConfigFileController({
  backup,
  catalog,
  client,
  recordSettingsAudit,
  refetchCapabilities,
  refetchCatalog,
  updateAgentSettings,
}: UseAgentSettingsConfigFileControllerInput) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [selectedConfigFileId, setSelectedConfigFileId] = useState('')
  const [nameWorkspace, setNameWorkspace] = useState('')
  const [descriptionWorkspace, setDescriptionWorkspace] = useState('')
  const [limitWorkspaces, setLimitWorkspaces] = useState<Record<ConfigFileLimitKey, string>>(() => emptyConfigFileLimitWorkspaces())
  const [approvalDefaultWorkspaces, setApprovalDefaultWorkspaces] = useState<Record<ConfigFileApprovalDefaultKey, ConfigFileApprovalDefaultWorkspaceValue>>(() => emptyConfigFileApprovalDefaultWorkspaces())
  const [saving, setSaving] = useState(false)
  const [managing, setManaging] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const currentConfigFileId = useMemo(() => currentProviderConfigFileId(catalog), [catalog])
  const currentConfigFile = useMemo(() => currentProviderConfigFile(catalog, currentConfigFileId), [catalog, currentConfigFileId])
  const selectedConfigFile = useMemo(() => selectedProviderConfigFile({
    inspect: catalog,
    selectedConfigFileId,
    currentConfigFile,
  }), [catalog, currentConfigFile, selectedConfigFileId])
  const selectedConfigFileEditable = isManagedConfigFile(selectedConfigFile)
  const selectedConfigFileReadonly = Boolean(selectedConfigFile && !selectedConfigFileEditable)
  const selectedConfigFileDiff = useMemo(
    () => currentConfigFile && selectedConfigFile && currentConfigFile.id !== selectedConfigFile.id
      ? buildConfigFileDiff(currentConfigFile, selectedConfigFile, t)
      : null,
    [currentConfigFile, selectedConfigFile, t],
  )
  const nameWorkspaceValue = nameWorkspace.trim()
  const descriptionWorkspaceValue = descriptionWorkspace.trim()
  const normalizedLimitWorkspaces = useMemo(() => normalizeConfigFileLimitWorkspaces(limitWorkspaces), [limitWorkspaces])
  const normalizedApprovalDefaultWorkspaces = useMemo(() => normalizeConfigFileApprovalDefaultWorkspaces(approvalDefaultWorkspaces), [approvalDefaultWorkspaces])
  const hasDetailsChange = hasConfigFileDetailsChanged({
    configFile: selectedConfigFile,
    name: nameWorkspaceValue,
    description: descriptionWorkspaceValue,
    limits: normalizedLimitWorkspaces,
    approvalDefaults: normalizedApprovalDefaultWorkspaces,
  })
  const hasConfigFileChange = Boolean(selectedConfigFileId && currentConfigFile && selectedConfigFileId !== currentConfigFile.id)

  useEffect(() => {
    if (currentConfigFile?.id) setSelectedConfigFileId(currentConfigFile.id)
  }, [currentConfigFile?.id])

  useEffect(() => {
    setNameWorkspace(selectedConfigFile?.name ?? '')
    setDescriptionWorkspace(selectedConfigFile?.description ?? '')
    setLimitWorkspaces(configFileLimitWorkspacesFromConfigFile(selectedConfigFile))
    setApprovalDefaultWorkspaces(configFileApprovalDefaultWorkspacesFromConfigFile(selectedConfigFile))
  }, [selectedConfigFile?.approvalDefaults, selectedConfigFile?.description, selectedConfigFile?.id, selectedConfigFile?.name, selectedConfigFile?.limits])

  function recordOperationFailure(operation: string, error: string) {
    recordSettingsAudit({
      action: 'settings_operation_failed',
      target: 'config_file',
      summary: t('agents.settings.auditSummaries.operationFailed', {
        operation,
        error: redactAgentTraceDebugText(error),
      }),
    })
  }

  async function commitCatalogPlan(
    plan: ProviderConfigFileCommitPlan,
    options: { refetchCapabilities?: boolean; backupUpdate?: 'when-present' | 'always' } = {},
  ) {
    const result = await commitProviderConfigFilePlan({
      client,
      plan,
      refetchCatalog,
      ...(options.refetchCapabilities ? { refetchCapabilities } : {}),
    })
    if (options.backupUpdate === 'always' || result.backup) {
      updateAgentSettings({ lastConfigFileBackup: result.backup })
    }
    setSelectedConfigFileId(result.selectedConfigFileId)
    return result
  }

  async function saveActive() {
    if (!selectedConfigFileId) return
    setSaving(true)
    setSaveError(null)
    setMessage(null)
    try {
      await commitCatalogPlan({
        operation: 'activate',
        ...buildActivateConfigFilePlan({
          configFileId: selectedConfigFileId,
          currentConfigFile,
        }),
      }, { refetchCapabilities: true })
      recordSettingsAudit({
        action: 'config_file_saved',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileSaved', { configFileId: selectedConfigFileId }),
      })
    } catch (error) {
      const nextError = settingsErrorMessage(error)
      setSaveError(nextError)
      recordOperationFailure(t('agents.settings.configFilesPanel'), nextError)
    } finally {
      setSaving(false)
    }
  }

  async function duplicateSelected() {
    const savePlan = buildDuplicateConfigFileSavePlan({
      sourceConfigFile: selectedConfigFile ?? currentConfigFile,
      currentConfigFile,
      configFiles: catalog?.configFiles ?? [],
      copySuffix: t('agents.settings.configFileCopySuffix'),
    })
    if (!savePlan) return
    setManaging(true)
    setSaveError(null)
    setMessage(null)
    try {
      await commitCatalogPlan({ operation: 'save', ...savePlan }, { refetchCapabilities: true })
      recordSettingsAudit({
        action: 'config_file_saved',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileDuplicated', { configFileId: savePlan.selectedConfigFileId }),
      })
    } catch (error) {
      const nextError = settingsErrorMessage(error)
      setSaveError(nextError)
      recordOperationFailure(t('agents.settings.duplicateConfigFile'), nextError)
    } finally {
      setManaging(false)
    }
  }

  async function createBlank() {
    const savePlan = buildBlankConfigFileSavePlan({
      currentConfigFile,
      configFiles: catalog?.configFiles ?? [],
      name: t('agents.settings.configFileCreateName'),
    })
    setManaging(true)
    setSaveError(null)
    setMessage(null)
    try {
      await commitCatalogPlan({ operation: 'save', ...savePlan }, { refetchCapabilities: true })
      recordSettingsAudit({
        action: 'config_file_created',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileCreated', { configFileId: savePlan.selectedConfigFileId }),
      })
    } catch (error) {
      const nextError = settingsErrorMessage(error)
      setSaveError(nextError)
      recordOperationFailure(t('agents.settings.createConfigFile'), nextError)
    } finally {
      setManaging(false)
    }
  }

  async function copySelected() {
    if (!selectedConfigFile) return
    try {
      await copyTextToClipboard(configFileExportText(selectedConfigFile))
      setSaveError(null)
      setMessage(t('agents.settings.configFileCopied', { configFileId: selectedConfigFile.id }))
    } catch (error) {
      setSaveError(settingsErrorMessage(error))
      setMessage(null)
    }
  }

  function downloadSelected() {
    if (!selectedConfigFile) return
    downloadTextFile({
      text: configFileExportText(selectedConfigFile),
      filename: configFileExportFilename(selectedConfigFile),
      mimeType: 'application/json;charset=utf-8',
    })
    setSaveError(null)
    setMessage(t('agents.settings.configFileDownloaded', { configFileId: selectedConfigFile.id }))
  }

  async function loadFile(file?: File | null) {
    if (!file) return
    setSaveError(null)
    setMessage(null)
    try {
      const sizeError = configFileFileSizeError({ size: file.size, maxBytes: MAX_CONFIG_FILE_BYTES, t })
      if (sizeError) throw new Error(sizeError)
      const configFile = parseManagedConfigFileExportText(await file.text())
      const savePlan = buildImportedConfigFileSavePlan({ configFile, currentConfigFile })
      setManaging(true)
      await commitCatalogPlan({ operation: 'save', ...savePlan }, { refetchCapabilities: true })
      setMessage(t('agents.settings.configFileImported', { configFileId: savePlan.selectedConfigFileId, fileName: file.name }))
      recordSettingsAudit({
        action: 'config_file_saved',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileImported', { configFileId: savePlan.selectedConfigFileId, fileName: file.name }),
      })
    } catch (error) {
      const nextError = settingsErrorMessage(error)
      setSaveError(nextError)
      recordOperationFailure(t('agents.settings.importConfigFile'), nextError)
    } finally {
      setManaging(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function saveDetails() {
    if (!selectedConfigFile) return
    if (!selectedConfigFileEditable) {
      setSaveError(t('agents.settings.configFileReadonlyHelp'))
      return
    }
    if (!nameWorkspaceValue) {
      setSaveError(t('agents.settings.configFileNameRequired'))
      return
    }
    const savePlan = buildConfigFileDetailsSavePlan({
      selectedConfigFile,
      currentConfigFile,
      name: nameWorkspaceValue,
      description: descriptionWorkspaceValue,
      limits: normalizedLimitWorkspaces,
      approvalDefaults: normalizedApprovalDefaultWorkspaces,
    })
    setManaging(true)
    setSaveError(null)
    setMessage(null)
    try {
      await commitCatalogPlan({ operation: 'save', ...savePlan }, { refetchCapabilities: true })
      recordSettingsAudit({
        action: 'config_file_saved',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileDetailsSaved', { configFileId: savePlan.selectedConfigFileId, name: savePlan.configFile.name }),
      })
    } catch (error) {
      const nextError = settingsErrorMessage(error)
      setSaveError(nextError)
      recordOperationFailure(t('agents.settings.saveConfigFileDetails'), nextError)
    } finally {
      setManaging(false)
    }
  }

  async function deleteSelected() {
    if (!selectedConfigFile || selectedConfigFile.id === currentConfigFile?.id) return
    if (!selectedConfigFileEditable) {
      setSaveError(t('agents.settings.configFileReadonlyHelp'))
      return
    }
    const deletePlan = buildDeleteConfigFilePlan({ selectedConfigFile, currentConfigFile })
    setManaging(true)
    setSaveError(null)
    setMessage(null)
    try {
      await commitCatalogPlan({ operation: 'delete', ...deletePlan }, { refetchCapabilities: true })
      recordSettingsAudit({
        action: 'config_file_deleted',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileDeleted', { configFileId: deletePlan.configFileId }),
      })
    } catch (error) {
      const nextError = settingsErrorMessage(error)
      setSaveError(nextError)
      recordOperationFailure(t('agents.settings.deleteConfigFile'), nextError)
    } finally {
      setManaging(false)
    }
  }

  async function restoreRollbackBackup() {
    const restorePlan = buildConfigFileRollbackRestorePlan({
      backup,
      configFiles: catalog?.configFiles ?? [],
      selectedConfigFile,
      currentConfigFile,
    })
    if (!restorePlan) return
    setManaging(true)
    setSaveError(null)
    setMessage(null)
    try {
      await commitCatalogPlan({ operation: 'restore', ...restorePlan }, {
        refetchCapabilities: true,
        backupUpdate: 'always',
      })
      recordSettingsAudit({
        action: 'config_file_rollback_restored',
        target: 'config_file',
        summary: t('agents.settings.auditSummaries.configFileRollbackRestored', { configFileId: restorePlan.selectedConfigFileId }),
      })
    } catch (error) {
      const nextError = settingsErrorMessage(error)
      setSaveError(nextError)
      recordOperationFailure(t('agents.settings.restoreConfigFileBackup'), nextError)
    } finally {
      setManaging(false)
    }
  }

  return {
    approvalDefaultWorkspaces,
    commitCatalogPlan,
    copySelected,
    createBlank,
    currentConfigFile,
    currentConfigFileId,
    deleteSelected,
    descriptionWorkspace,
    downloadSelected,
    duplicateSelected,
    hasConfigFileChange,
    hasDetailsChange,
    inputRef,
    limitWorkspaces,
    loadFile,
    managing,
    message,
    nameWorkspace,
    restoreRollbackBackup,
    saveActive,
    saveDetails,
    saveError,
    saving,
    selectedConfigFile,
    selectedConfigFileDiff,
    selectedConfigFileEditable,
    selectedConfigFileId,
    selectedConfigFileReadonly,
    setApprovalDefaultWorkspaces,
    setDescriptionWorkspace,
    setLimitWorkspaces,
    setNameWorkspace,
    setSaveError,
    setSelectedConfigFileId,
  }
}
