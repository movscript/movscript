import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  getSourceLockStatus,
  listSemanticEntities,
  semanticEntityConfig,
  type SemanticEntityConfig,
  type SemanticEntityRecord,
  type SourceLockStatus,
} from '@/shared/infrastructure/api/semanticEntities'
import { semanticEntityKeys } from '@/shared/application/semanticEntityQueryKeys'
import {
  formatScriptBlockOption,
  formatSettingOption,
  formatSettingStateOption,
  sourceLockReasonText,
  sourceLockSupportedKind,
  type SemanticEntityInlineFormState,
} from '@/shared/ui/SemanticEntityInlineEditorModel'

interface SemanticEntityInlineEditorLookupsInput {
  projectId?: number
  config: SemanticEntityConfig
  record?: SemanticEntityRecord | null
  form: SemanticEntityInlineFormState
  externalLookupOptions?: Record<string, Array<{ value: string; label: string }>>
  customSaveRecord: boolean
}

export function useSemanticEntityInlineEditorLookups({
  projectId,
  config,
  record,
  form,
  externalLookupOptions,
  customSaveRecord,
}: SemanticEntityInlineEditorLookupsInput) {
  const enableSettingLookups = config.kind === 'assetSlots' && Boolean(projectId)
  const enableScriptBlockLookups = (config.kind === 'contentUnits' || config.kind === 'segments' || config.kind === 'sceneMoments') && Boolean(projectId)
  const hasExternalSettingOptions = Object.hasOwn(externalLookupOptions ?? {}, 'setting_id')
  const hasExternalSettingStateOptions = Object.hasOwn(externalLookupOptions ?? {}, 'setting_state_id')
  const hasExternalScriptBlockOptions = Object.hasOwn(externalLookupOptions ?? {}, 'script_block_id')
  const sourceLockEnabled = Boolean(projectId && record?.ID && !customSaveRecord && sourceLockSupportedKind(config.kind))

  const { data: settings = [] } = useQuery({
    queryKey: semanticEntityKeys.inlineSettings(projectId),
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('settings')),
    enabled: enableSettingLookups && !hasExternalSettingOptions,
  })

  const { data: settingStates = [] } = useQuery({
    queryKey: semanticEntityKeys.inlineSettingStates(projectId),
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('settingStates')),
    enabled: enableSettingLookups && !hasExternalSettingStateOptions,
  })

  const { data: scriptBlocks = [] } = useQuery({
    queryKey: semanticEntityKeys.inlineScriptBlocks(projectId),
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('scriptBlocks')),
    enabled: enableScriptBlockLookups && !hasExternalScriptBlockOptions,
  })

  const { data: sourceLock } = useQuery<SourceLockStatus>({
    queryKey: semanticEntityKeys.sourceLock(projectId, config.kind, record?.ID),
    queryFn: () => getSourceLockStatus(projectId!, config, record!.ID),
    enabled: sourceLockEnabled,
  })

  const lockedFields = useMemo(() => new Set(sourceLock?.locked_fields ?? []), [sourceLock])
  const sourceLockReason = sourceLockReasonText(sourceLock)
  const referenceById = useMemo(() => new Map(settings.map((item) => [item.ID, item])), [settings])

  const lookupOptions = useMemo(() => {
    const options: Record<string, Array<{ value: string; label: string }>> = {}
    if (enableSettingLookups) {
      const selectedReferenceId = Number(String(form.setting_id ?? '').trim()) || 0
      const states = selectedReferenceId
        ? settingStates.filter((item) => Number(item.setting_id) === selectedReferenceId)
        : settingStates
      options.setting_id = settings.map((item) => ({
        value: String(item.ID),
        label: formatSettingOption(item),
      }))
      options.setting_state_id = states.map((item) => ({
        value: String(item.ID),
        label: formatSettingStateOption(item, referenceById.get(Number(item.setting_id))),
      }))
    }
    if (enableScriptBlockLookups) {
      options.script_block_id = scriptBlocks.map((item) => ({
        value: String(item.ID),
        label: formatScriptBlockOption(item),
      }))
    }
    for (const [key, value] of Object.entries(externalLookupOptions ?? {})) {
      options[key] = value
    }
    return options
  }, [settingStates, settings, enableSettingLookups, enableScriptBlockLookups, externalLookupOptions, form.setting_id, referenceById, scriptBlocks])

  return {
    lockedFields,
    lookupOptions,
    sourceLock,
    sourceLockReason,
  }
}
