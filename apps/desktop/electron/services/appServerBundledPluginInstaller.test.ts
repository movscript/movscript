import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  appServerBundledPluginInstalled,
  appServerParamsWithWorkspaceCwd,
  ensureAppServerBundledPluginInstalled,
  resetAppServerBundledPluginInstallCacheForTests,
} from './appServerBundledPluginInstaller'

test('appServerParamsWithWorkspaceCwd injects the workspace cwd once', () => {
  assert.deepEqual(appServerParamsWithWorkspaceCwd({
    marketplaceKinds: ['local'],
    cwds: ['/workspace', '/project'],
  }, '/workspace'), {
    marketplaceKinds: ['local'],
    cwds: ['/workspace', '/project'],
  })
})

test('appServerBundledPluginInstalled only accepts installed enabled bundled MovScript plugin', () => {
  assert.equal(appServerBundledPluginInstalled({
    marketplaces: [{
      name: 'movscript-bundled',
      plugins: [{ id: 'movscript@movscript-bundled', name: 'movscript', installed: true, enabled: true }],
    }],
  }), true)

  assert.equal(appServerBundledPluginInstalled({
    marketplaces: [{
      name: 'other-marketplace',
      plugins: [{ id: 'movscript@other-marketplace', name: 'movscript', installed: true, enabled: true }],
    }],
  }), false)

  assert.equal(appServerBundledPluginInstalled({
    marketplaces: [{
      name: 'movscript-bundled',
      plugins: [{ id: 'movscript@movscript-bundled', name: 'movscript', installed: true, enabled: false }],
    }],
  }), false)
})

test('ensureAppServerBundledPluginInstalled installs bundled plugin through app-server when missing', async () => {
  resetAppServerBundledPluginInstallCacheForTests()
  const root = mkdtempSync(join(tmpdir(), 'movscript-app-server-plugin-'))
  try {
    const workspaceDir = join(root, 'workspace')
    const marketplacePath = join(workspaceDir, '.agents', 'plugins', 'marketplace.json')
    const calls: Array<[string, unknown]> = []
    const connection = {
      request: async (method: string, params?: unknown) => {
        calls.push([method, params])
        if (method === 'plugin/installed') return { marketplaces: [] }
        return { authPolicy: 'none', appsNeedingAuth: [] }
      },
    }

    await ensureAppServerBundledPluginInstalled(connection, {
      api: 'codex-app-server',
      kind: 'codex',
      workspaceDir,
    }, {
      installBundledPlugin: () => ({
        installedPath: '/bundled/movscript',
        pluginName: 'movscript',
        marketplaceName: 'movscript-bundled',
        preparedPaths: { projectMarketplacePath: marketplacePath },
      }),
      warn: (message, error) => {
        throw new Error(`${message} ${String(error)}`)
      },
    })

    assert.deepEqual(calls, [
      ['plugin/installed', {
        installSuggestionPluginNames: ['movscript'],
        cwds: [workspaceDir],
      }],
      ['plugin/install', {
        marketplacePath,
        pluginName: 'movscript',
      }],
    ])
  } finally {
    resetAppServerBundledPluginInstallCacheForTests()
    rmSync(root, { recursive: true, force: true })
  }
})

test('ensureAppServerBundledPluginInstalled skips app-server install when bundled plugin is already installed', async () => {
  resetAppServerBundledPluginInstallCacheForTests()
  const root = mkdtempSync(join(tmpdir(), 'movscript-app-server-plugin-'))
  try {
    const workspaceDir = join(root, 'workspace')
    const calls: Array<[string, unknown]> = []
    const connection = {
      request: async (method: string, params?: unknown) => {
        calls.push([method, params])
        return {
          marketplaces: [{
            name: 'movscript-bundled',
            plugins: [{ id: 'movscript@movscript-bundled', name: 'movscript', installed: true, enabled: true }],
          }],
        }
      },
    }

    await ensureAppServerBundledPluginInstalled(connection, {
      api: 'mova-app-server',
      kind: 'mova',
      workspaceDir,
    }, {
      installBundledPlugin: () => ({
        installedPath: '/bundled/movscript',
        pluginName: 'movscript',
        marketplaceName: 'movscript-bundled',
      }),
    })

    assert.deepEqual(calls, [
      ['plugin/installed', {
        installSuggestionPluginNames: ['movscript'],
        cwds: [workspaceDir],
      }],
    ])
  } finally {
    resetAppServerBundledPluginInstallCacheForTests()
    rmSync(root, { recursive: true, force: true })
  }
})
