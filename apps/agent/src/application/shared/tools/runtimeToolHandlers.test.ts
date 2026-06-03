import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDefaultWorkspaceApplyPort,
  createDefaultWorkspaceApplyPreviewPort,
  createDefaultExternalToolGatewayPort,
  createDefaultImageProcessingPort,
  createDefaultWorkspaceSnapshotHydrationPort,
  createDefaultResourceFilePort,
  createDefaultRuntimeToolHandlerRegistry,
  createDefaultVideoFrameExtractionPort,
} from './runtimeToolHandlers.js'

test('createDefaultRuntimeToolHandlerRegistry registers core and workspace runtime tools only', () => {
  const registry = createDefaultRuntimeToolHandlerRegistry()

  for (const toolName of [
    'core_file_read',
    'core_memory_search',
    'core_update_plan',
    'core_image_inspect',
    'core_image_preprocess',
    'core_image_crop',
    'core_image_tile',
    'core_video_extract_frames',
    'workspace_open',
    'workspace_validate',
    'workspace_apply',
  ]) {
    assert.ok(registry.get(toolName), `expected runtime handler for ${toolName}`)
  }
  assert.equal(registry.get('reference_search'), undefined)
  assert.equal(registry.get('movscript_project_standards_get'), undefined)
  assert.equal(registry.get('external_only_tool'), undefined)
})

test('default runtime ports create transport adapters behind port interfaces', () => {
  const mcpClient = {
    initialize: async () => ({}),
    callTool: async () => ({ content: [] }),
  }
  const backendApplyClient = {
    applyReview: async () => ({ ok: true }),
    previewApplyReview: async () => ({ ok: true }),
    downloadResourceFile: async () => new Uint8Array(),
  } as never

  assert.equal(typeof createDefaultExternalToolGatewayPort(mcpClient).executeTool, 'function')
  assert.equal(typeof createDefaultWorkspaceApplyPort(backendApplyClient).apply, 'function')
  assert.equal(typeof createDefaultWorkspaceApplyPreviewPort(backendApplyClient).previewApplyReview, 'function')
  assert.equal(typeof createDefaultWorkspaceSnapshotHydrationPort(mcpClient).hydrateProjectLayerSnapshotBase, 'function')
  assert.equal(typeof createDefaultResourceFilePort(mcpClient).readFile, 'function')
  assert.equal(typeof createDefaultImageProcessingPort(backendApplyClient).process, 'function')
  assert.equal(typeof createDefaultVideoFrameExtractionPort(backendApplyClient).extract, 'function')
})
