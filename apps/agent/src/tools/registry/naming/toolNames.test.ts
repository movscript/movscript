import assert from 'node:assert/strict'
import test from 'node:test'
import { runtimeToolName } from './toolNames.js'

test('runtimeToolName unwraps MCP virtual tool names before calling the MCP server', () => {
  assert.equal(runtimeToolName('mcp__default__get_workspace_model'), 'get_workspace_model')
  assert.equal(runtimeToolName('mcp__movscript_workspace__workspace_file_read'), 'workspace_file_read')
  assert.equal(runtimeToolName('core_file_read'), 'core_file_read')
})
