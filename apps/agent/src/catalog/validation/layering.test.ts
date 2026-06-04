import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMCPVirtualPack } from '../loading/mcp/mcpVirtualPack.js'
import { loadAgentPluginCatalog } from '../loading/core/loader.js'
import { lintCatalog } from './linter.js'

test('default agent catalog keeps business tools out of builtin packs', () => {
  const catalog = loadAgentPluginCatalog()
  const registry = catalog.layeredRegistry

  assert.ok(registry.packs.has('core.pack.agent'))
  assert.ok(registry.packs.has('generation.pack.media'))
  assert.equal(registry.packs.has('workspace.pack.lifecycle'), false)
  assert.ok(registry.tools.has('generation_model_list'))
  assert.ok(registry.tools.has('generation_image_generate'))
  assert.ok(registry.tools.has('generation_video_generate'))
  assert.equal(registry.tools.has('get_workspace_model'), false)
  assert.equal(registry.tools.has('workspace_open'), false)
  assert.equal(registry.tools.has('workspace_validate'), false)
  assert.equal(registry.tools.has('workspace_apply'), false)
  assert.equal(registry.packs.has('movscript.pack.workspace'), false)

  for (const toolName of [
    'movscript_project_standards_get',
    'movscript_script_locate',
    'reference_search',
    'reference_get',
    'candidate_asset_slot_attach',
  ]) {
    assert.equal(registry.tools.has(toolName), false, `${toolName} must be provided by MCP/plugin catalog, not agent builtin catalog`)
  }

  assert.deepEqual(lintCatalog(registry).filter((issue) => issue.level === 'error'), [])
  assert.deepEqual(catalog.catalogIssues.filter((issue) => issue.level === 'error'), [])
})

test('base config enables generic packs without owning workspace protocol tools', () => {
  const catalog = loadAgentPluginCatalog()
  const baseConfig = catalog.configFiles.find((configFile) => configFile.id === 'movscript.config_file.base')
  assert.ok(baseConfig)
  assert.deepEqual(baseConfig.enabledPackIds, [
    'core.pack.agent',
    'generation.pack.media',
  ])
  assert.equal(baseConfig.skillIds.includes('core.generation.image'), true)
  assert.equal(baseConfig.skillIds.includes('core.generation.video'), true)
  assert.equal(baseConfig.skillIds.includes('workspace.lifecycle_support'), false)
  assert.equal(baseConfig.skillIds.some((id) => id.startsWith('movscript.')), false)
  assert.equal(baseConfig.toolGrants.some((grant) => grant.name === 'generation_model_list'), true)
  assert.equal(baseConfig.toolGrants.some((grant) => grant.name === 'generation_image_generate'), true)
  assert.equal(baseConfig.toolGrants.some((grant) => grant.name === 'generation_video_generate'), true)
  assert.equal(baseConfig.toolGrants.some((grant) => grant.name === 'workspace_open'), false)
  assert.equal(baseConfig.toolGrants.some((grant) => grant.name === 'get_workspace_model'), false)
  assert.equal(baseConfig.toolGrants.some((grant) => grant.name === 'workspace_validate'), false)
  assert.equal(baseConfig.toolGrants.some((grant) => grant.name === 'workspace_apply'), false)
  assert.equal(baseConfig.toolGrants.some((grant) => grant.name.startsWith('movscript_')), false)
  assert.deepEqual(baseConfig.metadata?.promptOptions, { finalSourceBlock: true })
})

test('MCP virtual packs own concrete business protocol tool names', () => {
  const pack = buildMCPVirtualPack({
    serverId: 'default',
    tools: [{
      name: 'movscript_script_locate',
      description: 'Frontend-owned business protocol tool.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'number' },
        },
      },
    }],
  })

  assert.equal(pack.pack.source, 'mcp')
  assert.deepEqual(pack.pack.tools, ['mcp__default__movscript_script_locate'])
  assert.equal(pack.tools[0]?.name, 'mcp__default__movscript_script_locate')
  assert.equal(pack.tools[0]?.source, 'mcp')
  assert.equal(pack.tools[0]?.defaults.approval, 'always')
})
