import assert from 'node:assert/strict'
import test from 'node:test'
import { loadAgentPluginCatalog } from '../catalog/loader.js'
import { buildAgentCatalogStartupReport } from './agentServerContext.js'

test('catalog startup report summarizes pack-enabled skills and tools', () => {
  const catalog = loadAgentPluginCatalog()
  const report = buildAgentCatalogStartupReport(catalog)

  assert.equal(report.profileCount, 1)
  assert.ok(report.packCount >= 3)
  assert.ok(report.skillCount > 0)
  assert.ok(report.toolCount > 0)
  assert.ok(report.toolGrantCount > 0)
  assert.ok(report.enabledPacks.includes('movscript.pack.agent-core'))
  assert.ok(report.enabledPacks.includes('movscript.pack.drafts'))
  assert.ok(report.enabledPacks.includes('movscript.pack.movscript'))
  assert.ok(report.enabledSkillCount > 0)
  assert.ok(report.enabledToolCount > 0)
  assert.equal(report.errorCount, 0)
  assert.equal(report.issueCount, report.errorCount + report.warningCount)
  assert.ok(report.profiles.some((profile) => profile.id === 'movscript.profile.default' && profile.toolGrants > 0))
  const movscriptPack = report.packs.find((pack) => pack.id === 'movscript.pack.movscript')
  assert.equal(movscriptPack?.status, 'enabled')
  assert.ok(movscriptPack?.filePath?.endsWith('catalog/packs/movscript.pack.json'))
  assert.deepEqual(movscriptPack?.missingSkills, [])
  assert.deepEqual(movscriptPack?.missingTools, [])
  assert.ok(movscriptPack?.skillRoots.includes('movscript/workflow'))
  assert.ok(movscriptPack?.toolRoots.includes('movscript/workspace'))
  assert.ok(movscriptPack?.toolRoots.includes('movscript/visual-generation'))
})
