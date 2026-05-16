import type { AICredential, AIModelConfig, FeatureConfig } from '@/types'

export type AdminModelCredentialToggleConfirmKey =
  | 'admin.models.confirmEnableCredential'
  | 'admin.models.confirmDisableCredential'

export type AdminFeatureToggleConfirmKey =
  | 'admin.features.confirmEnable'
  | 'admin.features.confirmDisable'

export type AdminJobAction = 'cancel' | 'retry' | 'delete'

export type AdminJobActionConfirmKey =
  | 'admin.debug.jobs.confirmCancel'
  | 'admin.debug.jobs.confirmRetry'
  | 'admin.debug.jobs.confirmDelete'

export type AdminCloudFileConfigToggleConfirmKey =
  | 'admin.cloudFiles.confirmEnable'
  | 'admin.cloudFiles.confirmDisable'

export interface AdminFeatureUpdatePayload {
  is_enabled?: boolean
  allowed_model_ids?: number[]
  default_model_id?: number | null
  allowed_roles?: string[]
}

export function nextCredentialEnabledState(credential: Pick<AICredential, 'is_enabled'>): boolean {
  return !credential.is_enabled
}

export function credentialToggleConfirmKey(credential: Pick<AICredential, 'is_enabled'>): AdminModelCredentialToggleConfirmKey {
  return nextCredentialEnabledState(credential)
    ? 'admin.models.confirmEnableCredential'
    : 'admin.models.confirmDisableCredential'
}

export function modelConfigDisplayName(config: Pick<AIModelConfig, 'custom_display_name' | 'model_def_id'>): string {
  return config.custom_display_name || config.model_def_id
}

export function featureToggleConfirmKey(
  feature: Pick<FeatureConfig, 'is_enabled'>,
  update: AdminFeatureUpdatePayload,
): AdminFeatureToggleConfirmKey | null {
  if (typeof update.is_enabled !== 'boolean' || update.is_enabled === feature.is_enabled) {
    return null
  }
  return update.is_enabled ? 'admin.features.confirmEnable' : 'admin.features.confirmDisable'
}

export function jobActionConfirmKey(action: AdminJobAction): AdminJobActionConfirmKey {
  switch (action) {
    case 'cancel':
      return 'admin.debug.jobs.confirmCancel'
    case 'retry':
      return 'admin.debug.jobs.confirmRetry'
    case 'delete':
      return 'admin.debug.jobs.confirmDelete'
  }
}

export function cloudFileConfigToggleConfirmKey(config: { is_enabled: boolean }): AdminCloudFileConfigToggleConfirmKey {
  return config.is_enabled ? 'admin.cloudFiles.confirmDisable' : 'admin.cloudFiles.confirmEnable'
}
