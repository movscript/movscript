import type { Page } from '@playwright/test'

export async function installProviderWorkspaceApiMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scriptSource = '第一场 夜 内 客厅\n主角看着桌上的旧照片，决定重新开始。'
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
      queryMovScriptEngineWorkspaceEntities: async (input: { query?: { entityKind?: string } }) => {
        if (input.query?.entityKind === 'script') {
          return [{
            id: 'script-77',
            kind: 'script',
            record: {
              ID: 77,
              id: 'script-77',
              project_id: 123,
              title: '入口验证剧本',
              script_type: 'pilot',
              summary: '用于验证项目 Home 到剧本工作台的入口。',
              order: 1,
              CreatedAt: '2026-05-09T11:00:00.000Z',
              UpdatedAt: '2026-05-09T12:00:00.000Z',
            },
          }]
        }
        if (input.query?.entityKind === 'scriptVersions') {
          return [{
            id: 'script-version-7701',
            kind: 'scriptVersions',
            record: {
              ID: 7701,
              project_id: 123,
              script_id: 77,
              version_number: 1,
              title: '入口验证剧本',
              source_type: 'raw',
              content: scriptSource,
              raw_source: scriptSource,
              summary: '初版',
              CreatedAt: '2026-05-09T11:30:00.000Z',
              UpdatedAt: '2026-05-09T11:30:00.000Z',
            },
          }]
        }
        return []
      },
      queryMovScriptEngineWorkspaceSettings: async () => [],
      queryMovScriptEngineWorkspaceAssets: async () => [],
      readMovScriptEngineWorkspaceScriptSource: async () => scriptSource,
      upsertMovScriptEngineWorkspaceScript: async (input: { payload?: { record?: Record<string, unknown>; sourceText?: string } }) => ({
        record: input.payload?.record ?? {},
        sourceText: input.payload?.sourceText ?? scriptSource,
      }),
      upsertMovScriptEngineWorkspaceSetting: async (input: { payload?: unknown }) => input.payload,
      upsertMovScriptEngineWorkspaceAsset: async (input: { payload?: unknown }) => input.payload,
      deleteMovScriptEngineWorkspaceEntity: async () => undefined,
      saveMovScriptEngineWorkspaceProductionSnapshot: async (input: { payload?: unknown }) => input.payload,
      upsertMovScriptEngineWorkspaceProjectStandards: async (input: { payload?: unknown }) => input.payload,
      upsertMovScriptEngineWorkspaceContentUnit: async (input: { payload?: unknown }) => input.payload,
      updateMovScriptEngineContentUnitEditPrompt: async () => undefined,
      selectMovScriptEngineWorkspaceCandidate: async () => undefined,
      appendMovScriptEngineWorkspaceCandidate: async () => undefined,
      createMovScriptEngineWorkspaceAssetSlotCandidate: async () => ({}),
      createMovScriptEngineWorkspaceKeyframeCandidate: async () => ({}),
    }
  })
}
