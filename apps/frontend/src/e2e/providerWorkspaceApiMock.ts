import type { Page } from '@playwright/test'

export async function installProviderWorkspaceApiMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const globalWindow = window as Window & {
      api?: Record<string, unknown>
      __movscriptE2EProviderWorkspaceAPIInstalled?: boolean
    }
    if (globalWindow.__movscriptE2EProviderWorkspaceAPIInstalled) return
    globalWindow.__movscriptE2EProviderWorkspaceAPIInstalled = true

    globalWindow.api = {
      ...(globalWindow.api ?? {}),
      listProviderSessions: async () => ({ sessions: [] }),
      getMovScriptWorkspaceConfig: async () => ({
        schema: 'movscript.workspace-config.v2',
        updatedAt: new Date().toISOString(),
      }),
      saveMovScriptWorkspaceConfig: async () => ({
        schema: 'movscript.workspace-config.v2',
        updatedAt: new Date().toISOString(),
      }),
    }
  })
}
