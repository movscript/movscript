import assert from 'node:assert/strict'
import test from 'node:test'
import { loadAgentPluginCatalog } from '../../catalog/loading/core/loader.js'
import { buildAgentCatalogStartupReport } from './agentServerContext.js'

test('catalog startup report summarizes pack-enabled skills and tools', () => {
  const catalog = loadAgentPluginCatalog()
  const report = buildAgentCatalogStartupReport(catalog)

  assert.equal(report.configFileCount, 1)
  assert.ok(report.packCount >= 3)
  assert.ok(report.skillCount > 0)
  assert.ok(report.toolCount > 0)
  assert.ok(report.toolGrantCount > 0)
  assert.ok(report.enabledPackIds.includes('core.pack.agent'))
  assert.ok(report.enabledPackIds.includes('workspace.pack.lifecycle'))
  assert.ok(report.enabledPackIds.includes('movscript.pack.workspace'))
  assert.ok(report.enabledSkillCount > 0)
  assert.ok(report.enabledToolCount > 0)
  assert.equal(report.errorCount, 0)
  assert.equal(report.issueCount, report.errorCount + report.warningCount)
  assert.ok(report.configFiles.some((configFile) => configFile.id === 'movscript.config_file.base' && configFile.toolGrants > 0))
  const movscriptPack = report.packs.find((pack) => pack.id === 'movscript.pack.workspace')
  assert.equal(movscriptPack?.status, 'enabled')
  assert.ok(movscriptPack?.filePath?.endsWith('catalog/packs/movscript.pack.json'))
  assert.deepEqual(movscriptPack?.missingSkills, [])
  assert.deepEqual(movscriptPack?.missingTools, [])
  assert.ok(movscriptPack?.skillRoots.includes('movscript/workspace'))
  assert.ok(movscriptPack?.toolRoots.includes('movscript/workspace'))
  assert.ok(movscriptPack?.toolRoots.includes('generation'))
})
