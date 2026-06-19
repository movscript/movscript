import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  installSdkRuntimeBundledPlugin,
  listSdkRuntimeBundledPlugins,
} from './sdkRuntimePluginCatalog'

test('SDK runtime bundled plugin install materializes MovScript at workspace root for every provider target', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-sdk-runtime-plugin-'))
  try {
    const workspaceDir = join(root, 'workspace')
    const before = listSdkRuntimeBundledPlugins({ workspaceDir })
    const beforePlugin = before.marketplaces[0]?.plugins[0]
    assert.equal(beforePlugin?.installed, false)
    assert.equal(beforePlugin?.sourceAvailable, true)

    const installed = installSdkRuntimeBundledPlugin({ workspaceDir })
    assert.equal(installed.pluginName, 'movscript')
    assert.equal(installed.marketplaceName, 'movscript-bundled')
    assert.equal(installed.projectCwd, workspaceDir)
    assert.deepEqual(installed.providerTargets, ['codex', 'mova', 'claude'])
    assert.equal(existsSync(join(workspaceDir, '.agents', 'plugins', 'manifest.json')), true)
    assert.equal(existsSync(join(workspaceDir, '.agents', 'plugins', 'lock.json')), true)
    assert.match(readFileSync(join(workspaceDir, '.codex', 'config.toml'), 'utf8'), /\[plugins\."movscript@movscript-bundled"]\nenabled = true/)
    assert.match(readFileSync(join(workspaceDir, '.mova', 'config.toml'), 'utf8'), /\[plugins\."movscript@movscript-bundled"]\nenabled = true/)
    assert.equal(existsSync(join(workspaceDir, '.codex', 'skills', 'plugins', 'movscript_movscript-bundled', 'domain', 'SKILL.md')), true)
    assert.equal(existsSync(join(workspaceDir, '.mova', 'skills', 'plugins', 'movscript_movscript-bundled', 'domain', 'SKILL.md')), true)
    assert.equal(existsSync(join(workspaceDir, '.claude', 'skills', 'plugins', 'movscript_movscript-bundled', 'domain', 'SKILL.md')), true)

    const after = listSdkRuntimeBundledPlugins({ workspaceDir })
    const afterPlugin = after.marketplaces[0]?.plugins[0]
    assert.equal(afterPlugin?.installed, true)
    assert.equal(afterPlugin?.prepared, true)
    assert.equal(afterPlugin?.rootProjectCwd, workspaceDir)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
