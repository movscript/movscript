import type { AICredential } from '@/types'

export type AdminModelCredentialToggleConfirmKey =
  | 'admin.models.confirmEnableCredential'
  | 'admin.models.confirmDisableCredential'

export type AdminJobAction = 'cancel' | 'retry' | 'delete'

export type AdminJobActionConfirmKey =
  | 'admin.debug.jobs.confirmCancel'
  | 'admin.debug.jobs.confirmRetry'
  | 'admin.debug.jobs.confirmDelete'

export type AdminCloudFileConfigToggleConfirmKey =
  | 'admin.cloudFiles.confirmEnable'
  | 'admin.cloudFiles.confirmDisable'

export function nextCredentialEnabledState(credential: Pick<AICredential, 'is_enabled'>): boolean {
  return !credential.is_enabled
}

export function credentialToggleConfirmKey(credential: Pick<AICredential, 'is_enabled'>): AdminModelCredentialToggleConfirmKey {
  return nextCredentialEnabledState(credential)
    ? 'admin.models.confirmEnableCredential'
    : 'admin.models.confirmDisableCredential'
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
