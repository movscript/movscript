import { ipcMain } from 'electron'
import {
  clearMovScriptDataServiceAuth,
  writeMovScriptDataServiceAuth,
  writeMovScriptDataServiceConfig,
} from '@movscript/data-client'
import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptWorkspaceRootPaths,
  writeMovScriptWorkspaceRootManifest,
  type MovScriptWorkspaceRealm,
} from '@movscript/workspace/home'

import type { ElectronBackendAuthSessionInput } from '../../src/shared/contracts/electronApi'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../services/movscriptWorkspaceDefaults'
import {
  restoreSuspendedAuthWindows,
  suspendNonHomeWindowsForAuthExpired,
} from '../services/appWindowRegistry'
import { projectEngineRegistry } from '../services/projectEngineRegistry'
import { readDesktopAppSettings } from '../services/appSettings'
import { cloudRealmId } from '../services/workspaceRealm'

export function registerBackendAuthIpcHandlers(): void {
  ipcMain.handle('backend-auth:set-session', (_event, session?: ElectronBackendAuthSessionInput | null) => {
    const workspaceDir = resolveDesktopDefaultMovScriptWorkspaceDir()
    const token = session?.token?.trim()
    if (!session || !token) {
      clearMovScriptDataServiceAuth(workspaceDir)
      projectEngineRegistry.clear()
      return
    }

    const realm = activeRealmForBackendSession(workspaceDir, session.baseURL)
    writeMovScriptDataServiceAuth(workspaceDir, {
      token,
      realm,
      ...(session.expiresAt ? { expiresAt: session.expiresAt } : {}),
      ...(session.user ? { user: normalizeBackendAuthUser(session.user) } : {}),
      ...(session.gitCredential ? { gitCredential: normalizeGitCredential(session.gitCredential) } : {}),
    })

    if (session.baseURL) {
      const userId = idField(session.user?.id) ?? idField(session.user?.ID)
      writeMovScriptDataServiceConfig(workspaceDir, {
        baseURL: session.baseURL,
        realm,
        ...(userId !== undefined ? { activeUserId: userId } : {}),
      })
      writeActiveWorkspaceManifestState(workspaceDir, {
        realm,
        ...(userId !== undefined && typeof userId === 'number' ? { activeUserId: userId } : {}),
      })
    }
    projectEngineRegistry.clear()
    restoreSuspendedAuthWindows()
  })

  ipcMain.handle('backend-auth:handle-expired', () => {
    const workspaceDir = resolveDesktopDefaultMovScriptWorkspaceDir()
    clearMovScriptDataServiceAuth(workspaceDir)
    projectEngineRegistry.clear()
    return suspendNonHomeWindowsForAuthExpired()
  })
}

function activeRealmForBackendSession(workspaceDir: string, baseURL: string | undefined): MovScriptWorkspaceRealm {
  const settings = readDesktopAppSettings(workspaceDir)
  if (settings?.launchMode === 'local') return { kind: 'local', id: 'local' }
  return { kind: 'cloud', id: cloudRealmId(baseURL) }
}

function writeActiveWorkspaceManifestState(
  workspaceDir: string,
  input: { realm: MovScriptWorkspaceRealm; activeUserId?: number },
): void {
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  const current = ensureMovScriptWorkspaceRoot(root)
  writeMovScriptWorkspaceRootManifest(root.manifestPath, {
    ...current,
    activeRealm: input.realm,
    ...(input.activeUserId !== undefined ? { activeUserId: input.activeUserId } : {}),
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
