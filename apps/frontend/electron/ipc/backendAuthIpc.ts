import { ipcMain } from 'electron'
import {
  clearMovScriptBackendAuth,
  writeMovScriptBackendAuth,
  writeMovScriptBackendConfig,
} from '@movscript/core/backend/node'

import type { ElectronBackendAuthSessionInput } from '../../src/shared/contracts/electronApi'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../services/movscriptWorkspaceDefaults'
import {
  restoreSuspendedAuthWindows,
  suspendNonHomeWindowsForAuthExpired,
} from '../services/appWindowRegistry'
import { projectEngineRegistry } from '../services/projectEngineRegistry'

export function registerBackendAuthIpcHandlers(): void {
  ipcMain.handle('backend-auth:set-session', (_event, session?: ElectronBackendAuthSessionInput | null) => {
    const workspaceDir = resolveDesktopDefaultMovScriptWorkspaceDir()
    const token = session?.token?.trim()
    if (!session || !token) {
      clearMovScriptBackendAuth(workspaceDir)
      projectEngineRegistry.clear()
      return
    }

    writeMovScriptBackendAuth(workspaceDir, {
      token,
      ...(session.expiresAt ? { expiresAt: session.expiresAt } : {}),
      ...(session.user ? { user: normalizeBackendAuthUser(session.user) } : {}),
      ...(session.gitCredential ? { gitCredential: normalizeGitCredential(session.gitCredential) } : {}),
    })

    if (session.baseURL) {
      const userId = idField(session.user?.id) ?? idField(session.user?.ID)
      writeMovScriptBackendConfig(workspaceDir, {
        baseURL: session.baseURL,
        ...(userId !== undefined ? { activeUserId: userId } : {}),
      })
    }
    projectEngineRegistry.clear()
    restoreSuspendedAuthWindows()
  })

  ipcMain.handle('backend-auth:handle-expired', () => {
    const workspaceDir = resolveDesktopDefaultMovScriptWorkspaceDir()
    clearMovScriptBackendAuth(workspaceDir)
    projectEngineRegistry.clear()
    return suspendNonHomeWindowsForAuthExpired()
  })
}

function normalizeBackendAuthUser(user: NonNullable<ElectronBackendAuthSessionInput['user']>) {
  const userId = idField(user.id) ?? idField(user.ID)
  return {
    ...(userId !== undefined ? { id: userId } : {}),
    ...(user.username ? { username: user.username } : {}),
    ...(user.displayName ?? user.display_name ? { displayName: user.displayName ?? user.display_name } : {}),
    ...(user.primaryEmail ?? user.primary_email ? { primaryEmail: user.primaryEmail ?? user.primary_email } : {}),
    ...(user.locale ? { locale: user.locale } : {}),
    ...(user.systemRole ?? user.system_role ? { systemRole: user.systemRole ?? user.system_role } : {}),
  }
}

function normalizeGitCredential(credential: NonNullable<ElectronBackendAuthSessionInput['gitCredential']>) {
  return {
    provider: credential.provider,
    username: credential.username,
    ...(credential.token ? { token: credential.token } : {}),
    ...(credential.maskedToken ?? credential.masked_token ? { maskedToken: credential.maskedToken ?? credential.masked_token } : {}),
    ...(credential.status ? { status: credential.status } : {}),
    ...(credential.lastError ?? credential.last_error ? { lastError: credential.lastError ?? credential.last_error } : {}),
  }
}

function idField(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}
