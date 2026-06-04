import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createDefaultExternalToolGatewayPort,
  createDefaultFocusContextPort,
  createDefaultImageProcessingPort,
  createDefaultResourceFilePort,
  createDefaultRuntimeToolHandlerRegistry,
  createDefaultVideoFrameExtractionPort,
} from './runtimeToolHandlers.js'

test('createDefaultRuntimeToolHandlerRegistry registers core runtime tools only', () => {
  const registry = createDefaultRuntimeToolHandlerRegistry()
  const executorNames = registry.listExecutors().map((executor) => executor.toolName)

  for (const toolName of [
    'core_file_read',
    'core_memory_search',
    'core_update_plan',
    'core_image_inspect',
    'core_image_preprocess',
    'core_image_crop',
    'core_image_tile',
    'core_video_extract_frames',
  ]) {
    assert.ok(registry.get(toolName), `expected runtime handler for ${toolName}`)
    assert.ok(executorNames.includes(toolName), `expected runtime executor for ${toolName}`)
  }
  assert.equal(registry.get('workspace_open'), undefined)
  assert.equal(registry.get('workspace_validate'), undefined)
  assert.equal(registry.get('workspace_apply'), undefined)
  assert.equal(registry.get('reference_search'), undefined)
  assert.equal(registry.get('movscript_project_standards_get'), undefined)
  assert.equal(registry.get('external_only_tool'), undefined)
})

test('runtime catalog tools are backed by runtime executors or the preflight input gate', () => {
  const registry = createDefaultRuntimeToolHandlerRegistry()
  const executorNames = new Set(registry.listExecutors().map((executor) => executor.toolName))
  const gateOwnedRuntimeTools = new Set(['core_user_input_request'])
  const runtimeCatalogTools = readCatalogToolNames('runtime')

  for (const toolName of runtimeCatalogTools) {
    assert.ok(
      executorNames.has(toolName) || gateOwnedRuntimeTools.has(toolName),
      `runtime catalog tool ${toolName} must have a runtime executor or explicit gate ownership`,
    )
  }
})

test('default runtime ports create transport adapters behind port interfaces', () => {
  const mcpClient = {
    initialize: async () => ({}),
    callTool: async () => ({ content: [] }),
  }
  const resourceFileDownloader = {
    downloadResourceFile: async () => ({ performed: false, skippedReason: 'backend disabled in test' }),
  }

  assert.equal(typeof createDefaultExternalToolGatewayPort(mcpClient).executeTool, 'function')
  assert.equal(typeof createDefaultFocusContextPort(createDefaultExternalToolGatewayPort(mcpClient)).getFocusContext, 'function')
  assert.equal(typeof createDefaultResourceFilePort(mcpClient).readFile, 'function')
  assert.equal(typeof createDefaultImageProcessingPort(resourceFileDownloader).process, 'function')
  assert.equal(typeof createDefaultVideoFrameExtractionPort(resourceFileDownloader).extract, 'function')
})

function readCatalogToolNames(source: string): string[] {
  const root = new URL('../../../../catalog/tools/', import.meta.url)
  return readCatalogToolFiles(root)
    .map((file) => JSON.parse(readFileSync(file, 'utf8')) as { name?: unknown; source?: unknown })
    .filter((tool) => tool.source === source && typeof tool.name === 'string')
    .map((tool) => tool.name as string)
    .sort()
}

function readCatalogToolFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
    if (entry.isDirectory()) return readCatalogToolFiles(child)
    return entry.name.endsWith('.json') ? [child] : []
  })
}
