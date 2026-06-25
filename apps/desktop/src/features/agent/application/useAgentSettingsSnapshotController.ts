import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AgentSettingsSnapshot,
  type SkillConfigWorkspace,
  type ToolGrantWorkspace,
  redactAgentTraceDebugText,
} from '@movscript/core/agent'
import {
  SETTINGS_SNAPSHOT_IMPORT_PRESETS,
  SETTINGS_SNAPSHOT_IMPORT_SCOPES,
  buildCurrentSettingsSnapshotText,
  buildSettingsSnapshotImpactItems,
  buildSettingsSnapshotWritePlan,
  commitSettingsSnapshotWritePlan,
  hasSelectedSettingsSnapshotImportScope,
  selectSettingsSnapshotForImport,
  settingsSnapshotImportPreflightError,
  settingsSnapshotImportPresetScopes,
  settingsSnapshotImportRequirementsForSnapshot,
  settingsSnapshotReferenceIssuesForImport,
  toggleSettingsSnapshotImportScopes,
  type SettingsSnapshotImportPresetId,
  type SettingsSnapshotImportScope,
  type SettingsSnapshotWriteCommitClient,
} from '@/features/agent/application/agentSettingsConfigFile'
import {
  settingsErrorMessage,
  settingsSnapshotExportFilename,
  settingsSnapshotFileSizeError,
  validateSettingsSnapshotText,
} from '@/features/agent/presentation/agentSettingsPageModel'
import type { AgentSettingsAuditEntry, AgentSettingsImportBackup } from '@/features/agent/state/agentStore'
import type {
  ProviderCatalogConfigFile,
  ProviderCatalogInspectResponse,
  ProviderSessionCapabilitiesResponse,
} from '@movscript/agent-protocol'
import type { ProviderModelConfigPublic } from '@movscript/agent-protocol'
import { providerModelConfigFromSelection } from '@/features/agent/application/agentSettingsProviderModel'
import { copyTextToClipboard, downloadTextFile } from '@/shared/ui/browserActions'
import type { PublicModel } from '@/types'

interface UseAgentSettingsSnapshotControllerInput {
  catalog?: ProviderCatalogInspectResponse
  capabilities?: ProviderSessionCapabilitiesResponse
  client: SettingsSnapshotWriteCommitClient
  currentConfigFile: ProviderCatalogConfigFile | null
  currentConfigFileId: string
  effectiveConfig: ProviderModelConfigPublic | null
  refetchCapabilities: () => Promise<unknown>
  refetchCatalog: () => Promise<unknown>
  recordSettingsAudit: (entry: Omit<AgentSettingsAuditEntry, 'id' | 'createdAt'> & { createdAt?: string }) => void
  selectedConfigFileId?: string | null
  setSavedConfig: (config: ProviderModelConfigPublic | null) => void
  settingsImportBackup: AgentSettingsImportBackup | null
  skillWorkspaces: SkillConfigWorkspace[]
  textModels?: PublicModel[]
  toolGrantWorkspaces: ToolGrantWorkspace[]
  updateAgentSettings: (settings: { lastImportBackup: AgentSettingsImportBackup | null }) => void
  updateSelectedModelId: (modelId: string | null) => void
}

export function useAgentSettingsSnapshotController({
  catalog,
  capabilities,
  client,
  currentConfigFile,
  currentConfigFileId,
  effectiveConfig,
  refetchCapabilities,
  refetchCatalog,
  recordSettingsAudit,
  selectedConfigFileId,
  setSavedConfig,
  settingsImportBackup,
  skillWorkspaces,
  textModels,
  toolGrantWorkspaces,
  updateAgentSettings,
  updateSelectedModelId,
}: UseAgentSettingsSnapshotControllerInput) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [selectedScopes, setSelectedScopes] = useState<SettingsSnapshotImportScope[]>([...SETTINGS_SNAPSHOT_IMPORT_SCOPES])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const validation = useMemo(() => validateSettingsSnapshotText({ text, t }), [text, t])
  const parsedSnapshot = validation.snapshot
  const selectedSnapshotForImport = useMemo(
    () => parsedSnapshot ? selectSettingsSnapshotForImport(parsedSnapshot, selectedScopes) : null,
    [parsedSnapshot, selectedScopes],
  )
  const hasSelectedImportScope = Boolean(
    parsedSnapshot && hasSelectedSettingsSnapshotImportScope(parsedSnapshot, selectedScopes),
  )
  const importRequirements = settingsSnapshotImportRequirementsForSnapshot(selectedSnapshotForImport)
  const needsCatalog = importRequirements.needsCatalog
  const needsCapabilities = importRequirements.needsCapabilities
  const needsModelCatalog = importRequirements.needsModelCatalog
  const referenceIssues = useMemo(() => (
    settingsSnapshotReferenceIssuesForImport({
      snapshot: selectedSnapshotForImport,
      needsCatalog,
      needsModelCatalog,
      textModels,
      catalog,
      currentConfigFile,
    })
  ), [catalog, currentConfigFile, needsCatalog, needsModelCatalog, selectedSnapshotForImport, textModels])
  const canImport = Boolean(
    parsedSnapshot
    && hasSelectedImportScope
    && referenceIssues.length === 0
    && (!needsCatalog || catalog)
    && (!needsCapabilities || capabilities)
    && (!needsModelCatalog || textModels),
  )

  function recordOperationFailure(operation: string, failure: string) {
    recordSettingsAudit({
      action: 'settings_operation_failed',
      target: 'snapshot',
      summary: t('agents.settings.auditSummaries.operationFailed', {
        operation,
        error: redactAgentTraceDebugText(failure),
      }),
    })
  }

  function buildExportText() {
    return buildCurrentSettingsSnapshotText({
      config: effectiveConfig,
      currentConfigFileId,
      configFiles: catalog?.configFiles ?? [],
      skillConfig: skillWorkspaces,
      toolPermissionConfigFileId: selectedConfigFileId ?? currentConfigFileId,
      currentToolGrantWorkspaces: toolGrantWorkspaces,
    })
  }

  function currentText() {
    return text.trim() || buildExportText()
  }

  function importPreflightError(): string | null {
    return settingsSnapshotImportPreflightError({
      parsedSnapshot,
      validationError: validation.error,
      hasSelectedImportScope,
      selectedSnapshot: selectedSnapshotForImport,
      t,
      textModels,
      catalog,
      currentConfigFile,
      capabilities,
    })
  }

  async function applyWrites(snapshot: AgentSettingsSnapshot) {
    const writePlan = buildSettingsSnapshotWritePlan({
      snapshot,
      catalog,
      currentConfigFile,
      t,
    })
    await commitSettingsSnapshotWritePlan({
      client,
      plan: writePlan,
      refetchCatalog,
      refetchCapabilities,
    })
    if (writePlan.modelSelection) {
      updateSelectedModelId(writePlan.modelSelection.modelId)
      setSavedConfig(providerModelConfigFromSelection({
        modelId: writePlan.modelSelection.modelId,
        useForChat: writePlan.modelSelection.useForChat,
        useForPlanner: writePlan.modelSelection.useForPlanner,
        updatedAt: new Date().toISOString(),
      }))
    }
  }

  function updateText(nextText: string) {
    setText(nextText)
    setError(null)
    setMessage(null)
  }

  function toggleImportScope(scope: SettingsSnapshotImportScope, enabled: boolean) {
    setSelectedScopes((current) => toggleSettingsSnapshotImportScopes(current, scope, enabled))
    setError(null)
    setMessage(null)
  }

  function applyImportPreset(presetId: SettingsSnapshotImportPresetId) {
    const preset = SETTINGS_SNAPSHOT_IMPORT_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    const scopes = settingsSnapshotImportPresetScopes(presetId, parsedSnapshot)
    if (!scopes) return
    setSelectedScopes(scopes)
    setError(null)
    setMessage(t('agents.settings.settingsSnapshotImportPresetApplied', {
      name: t(`agents.settings.settingsSnapshotImportPresetNames.${preset.id}`),
    }))
  }

  function exportSnapshot() {
    setError(null)
    setText(buildExportText())
    setMessage(t('agents.settings.settingsExportReady'))
  }

  async function copySnapshot() {
    const nextText = currentText()
    try {
      await copyTextToClipboard(nextText)
      setText(nextText)
      setMessage(t('agents.settings.settingsCopied'))
      setError(null)
    } catch (nextError) {
      setError(settingsErrorMessage(nextError))
    }
  }

  function downloadSnapshot() {
    setError(null)
    const nextText = currentText()
    downloadTextFile({
      text: nextText,
      filename: settingsSnapshotExportFilename(),
      mimeType: 'application/json;charset=utf-8',
    })
    setText(nextText)
    setMessage(t('agents.settings.settingsDownloaded'))
  }

  async function loadFile(file?: File | null) {
    if (!file) return
    setError(null)
    setMessage(null)
    try {
      const sizeError = settingsSnapshotFileSizeError({ size: file.size, t })
      if (sizeError) throw new Error(sizeError)
      const nextText = await file.text()
      const nextValidation = validateSettingsSnapshotText({ text: nextText, t })
      if (nextValidation.error) throw new Error(nextValidation.error)
      setText(nextText)
      setFileName(file.name)
      setMessage(t('agents.settings.settingsSnapshotFileLoaded', { fileName: file.name }))
    } catch (nextError) {
      setFileName(null)
      setError(settingsErrorMessage(nextError))
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function copyImportBackup() {
    if (!settingsImportBackup) return
    try {
      await copyTextToClipboard(settingsImportBackup.text)
      setMessage(t('agents.settings.settingsBackupCopied'))
      setError(null)
    } catch (nextError) {
      setError(settingsErrorMessage(nextError))
    }
  }

  function loadImportBackup() {
    if (!settingsImportBackup) return
    setText(settingsImportBackup.text)
    setError(null)
    setMessage(t('agents.settings.settingsBackupLoaded'))
  }

  function clearImportBackup() {
    updateAgentSettings({ lastImportBackup: null })
    setError(null)
    setMessage(t('agents.settings.settingsBackupCleared'))
    recordSettingsAudit({
      action: 'settings_backup_cleared',
      target: 'snapshot',
      summary: t('agents.settings.auditSummaries.settingsBackupCleared'),
    })
  }

  async function restoreImportBackup() {
    if (!settingsImportBackup) return
    let snapshot: AgentSettingsSnapshot
    try {
      const nextValidation = validateSettingsSnapshotText({ text: settingsImportBackup.text, t })
      if (nextValidation.error || !nextValidation.snapshot) throw new Error(nextValidation.error ?? t('agents.settings.settingsSnapshotInvalid', { error: '' }))
      snapshot = selectSettingsSnapshotForImport(nextValidation.snapshot, SETTINGS_SNAPSHOT_IMPORT_SCOPES)
    } catch (nextError) {
      setError(settingsErrorMessage(nextError))
      return
    }
    const preflightError = settingsSnapshotImportPreflightError({
      parsedSnapshot: snapshot,
      validationError: null,
      hasSelectedImportScope: true,
      selectedSnapshot: snapshot,
      t,
      textModels,
      catalog,
      currentConfigFile,
      capabilities,
    })
    if (preflightError) {
      setError(preflightError)
      setMessage(null)
      return
    }
    setImporting(true)
    setError(null)
    setMessage(null)
    const rollbackBackupText = buildExportText()
    updateAgentSettings({ lastImportBackup: { text: rollbackBackupText, createdAt: new Date().toISOString() } })
    try {
      await applyWrites(snapshot)
      setText(settingsImportBackup.text)
      setSavedConfig(null)
      setMessage(t('agents.settings.settingsBackupRestored'))
      recordSettingsAudit({
        action: 'settings_snapshot_restored',
        target: 'snapshot',
        summary: t('agents.settings.auditSummaries.settingsSnapshotRestored', { exportedAt: new Date(snapshot.exportedAt).toLocaleString() }),
      })
    } catch (nextError) {
      const failure = settingsErrorMessage(nextError)
      setError(failure)
      recordOperationFailure(t('agents.settings.restoreImportBackup'), failure)
    } finally {
      setImporting(false)
    }
  }

  function previewImport() {
    if (!parsedSnapshot) return
    const preflightError = importPreflightError()
    if (preflightError) {
      setError(preflightError)
      setMessage(null)
      return
    }
    setError(null)
    setMessage(t('agents.settings.settingsSnapshotDryRunReady', {
      count: selectedSnapshotForImport ? buildSettingsSnapshotImpactItems(selectedSnapshotForImport).filter((item) => item.scope !== 'skipped').length : 0,
    }))
  }

  async function importSnapshot() {
    if (!parsedSnapshot) return
    const preflightError = importPreflightError()
    if (preflightError) {
      setError(preflightError)
      return
    }
    setImporting(true)
    setError(null)
    setMessage(null)
    const backupText = buildExportText()
    updateAgentSettings({ lastImportBackup: { text: backupText, createdAt: new Date().toISOString() } })
    try {
      const snapshot = selectedSnapshotForImport
      if (!snapshot) throw new Error(t('agents.settings.settingsSnapshotImportScopeEmpty'))
      await applyWrites(snapshot)
      setSavedConfig(null)
      setMessage(t('agents.settings.settingsImportDoneWithBackup'))
      recordSettingsAudit({
        action: 'settings_snapshot_imported',
        target: 'snapshot',
        summary: t('agents.settings.auditSummaries.settingsSnapshotImported', { exportedAt: new Date(snapshot.exportedAt).toLocaleString() }),
      })
    } catch (nextError) {
      const failure = settingsErrorMessage(nextError)
      setError(failure)
      recordOperationFailure(t('agents.settings.settingsSnapshotPanel'), failure)
    } finally {
      setImporting(false)
    }
  }

  return {
    canImport,
    clearImportBackup,
    copyImportBackup,
    copySnapshot,
    downloadSnapshot,
    error,
    exportSnapshot,
    fileInputRef,
    fileName,
    importPreflightError,
    importing,
    importSnapshot,
    loadFile,
    loadImportBackup,
    message,
    previewImport,
    referenceIssues,
    restoreImportBackup,
    selectedScopes,
    selectedSnapshotForImport,
    settingsImportBackup,
    text,
    toggleImportScope,
    updateText,
    validation,
    applyImportPreset,
  }
}
