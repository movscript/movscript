import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  adminCommandSpecs,
  contextCommandSpecs,
  editingCommandSpecs,
  runMovScriptContextCommand,
  runMovScriptEditingCommand,
  runMovScriptRuntimeCommand,
  runMovScriptTimelineCommand,
  runtimeCommandSpecs,
  systemCommandSpecs,
  timelineCommandSpecs,
  workspaceCommandSpecs,
} from '../dist/index.js'

test('shared CLI/MCP command specs expose stable product contract metadata', () => {
  const groups = [
    ['runtime', runtimeCommandSpecs],
    ['context', contextCommandSpecs],
    ['admin', adminCommandSpecs],
    ['system', systemCommandSpecs],
    ['editing', editingCommandSpecs],
    ['timeline', timelineCommandSpecs],
    ['workspace', workspaceCommandSpecs],
  ]
  const commandIds = new Set()
  const mcpToolNames = new Set()

  for (const [family, specs] of groups) {
    assert.ok(specs.length > 0, `${family} command specs must not be empty`)
    for (const spec of specs) {
      assert.equal(spec.family, family)
      assert.equal(spec.stability, 'stable')
      assert.equal(typeof spec.ownerService, 'string')
      assert.notEqual(spec.ownerService.trim(), '')
      assert.ok(Array.isArray(spec.requiredRuntime) && spec.requiredRuntime.length > 0, `${spec.commandId} must name required runtime`)
      assert.ok(Array.isArray(spec.permissions) && spec.permissions.length > 0, `${spec.commandId} must name permissions`)
      assert.equal(spec.outputSchema?.type, 'object', `${spec.commandId} must expose an object output schema`)
      assert.ok(Array.isArray(spec.examples) && spec.examples.length > 0, `${spec.commandId} must expose a CLI example`)
      assert.equal(spec.examples[0].argv[0], 'movscript')
      if (spec.productCliPath) {
        assert.deepEqual(spec.examples[0].argv.slice(1, 1 + spec.productCliPath.length), spec.productCliPath)
      } else {
        assert.equal(spec.examples[0].argv[1], family)
      }
      assert.ok(spec.examples[0].argv.includes('--json'), `${spec.commandId} example must be structured JSON`)
      assert.equal(commandIds.has(spec.commandId), false, `duplicate commandId: ${spec.commandId}`)
      assert.equal(mcpToolNames.has(spec.mcpToolName), false, `duplicate mcpToolName: ${spec.mcpToolName}`)
      commandIds.add(spec.commandId)
      mcpToolNames.add(spec.mcpToolName)
    }
  }
})

test('context command is the stable CLI-backed replacement for system focus', async () => {
  const current = contextCommandSpecs.find((spec) => spec.commandId === 'context.current.get')
  assert.ok(current)
  assert.equal(current.mcpToolName, 'context_current_get')
  assert.deepEqual(current.examples[0].argv, ['movscript', 'context', 'current', 'get', '--json'])

  const execution = await runMovScriptContextCommand('context_current_get')
  assert.equal(execution.schema, 'movscript.command_result.v1')
  assert.equal(execution.commandId, 'context.current.get')
  assert.equal(execution.contract.family, 'context')
  assert.equal(execution.data.schema, 'movscript.mcp.context-current.v1')
  assert.deepEqual(execution.debug.cli_argv, ['movscript', 'context', 'current', 'get', '--json'])
})

test('editing backend diagnostics are first-class CLI contracts', async () => {
  const capabilities = editingCommandSpecs.find((spec) => spec.commandId === 'editing.runtime.capabilities.get')
  assert.ok(capabilities)
  assert.equal(capabilities.mcpToolName, 'editing_runtime_capabilities_get')
  assert.deepEqual(capabilities.examples[0].argv, ['movscript', 'editing', 'runtime', 'capabilities', 'get', '--json'])

  const lifecycleCommands = [
    ['editing.project.create', 'editing_project_create', ['movscript', 'editing', 'project', 'create', '--json'], ['editing:read', 'editing:write']],
    ['editing.project.create_from_edit_plan', 'editing_project_create_from_edit_plan', ['movscript', 'editing', 'project', 'create-from-edit-plan', '--json'], ['editing:read', 'editing:write']],
    ['editing.project.get', 'editing_project_get', ['movscript', 'editing', 'project', 'get', '--json'], ['editing:read']],
    ['editing.project.save', 'editing_project_save', ['movscript', 'editing', 'project', 'save', '--json'], ['editing:read', 'editing:write']],
    ['editing.project.update_settings', 'editing_project_update_settings', ['movscript', 'editing', 'project', 'update-settings', '--json'], ['editing:read', 'editing:write']],
    ['editing.project.add_asset', 'editing_project_add_asset', ['movscript', 'editing', 'project', 'add-asset', '--json'], ['editing:read', 'editing:write']],
    ['editing.project.remove_asset', 'editing_project_remove_asset', ['movscript', 'editing', 'project', 'remove-asset', '--json'], ['editing:read', 'editing:write']],
  ]
  for (const [commandId, mcpToolName, argv, permissions] of lifecycleCommands) {
    const spec = editingCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must be exposed as a CLI-backed editing command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.deepEqual(spec.permissions, permissions)
  }

  const timelineCommands = [
    ['editing.timeline.validate', 'editing_timeline_validate', ['movscript', 'editing', 'timeline', 'validate', '--json'], ['editing:read']],
    ['editing.timeline.apply_commands', 'editing_timeline_apply_commands', ['movscript', 'editing', 'timeline', 'apply-commands', '--json'], ['editing:read', 'editing:write']],
    ['editing.timeline.add_track', 'editing_timeline_add_track', ['movscript', 'editing', 'timeline', 'add-track', '--json'], ['editing:read', 'editing:write']],
    ['editing.timeline.remove_track', 'editing_timeline_remove_track', ['movscript', 'editing', 'timeline', 'remove-track', '--json'], ['editing:read', 'editing:write']],
    ['editing.timeline.add_clip', 'editing_timeline_add_clip', ['movscript', 'editing', 'timeline', 'add-clip', '--json'], ['editing:read', 'editing:write']],
    ['editing.timeline.update_clip', 'editing_timeline_update_clip', ['movscript', 'editing', 'timeline', 'update-clip', '--json'], ['editing:read', 'editing:write']],
    ['editing.timeline.split_clip', 'editing_timeline_split_clip', ['movscript', 'editing', 'timeline', 'split-clip', '--json'], ['editing:read', 'editing:write']],
    ['editing.timeline.move_clip', 'editing_timeline_move_clip', ['movscript', 'editing', 'timeline', 'move-clip', '--json'], ['editing:read', 'editing:write']],
    ['editing.timeline.delete_clip', 'editing_timeline_delete_clip', ['movscript', 'editing', 'timeline', 'delete-clip', '--json'], ['editing:read', 'editing:write']],
  ]
  for (const [commandId, mcpToolName, argv, permissions] of timelineCommands) {
    const spec = editingCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must be exposed as a CLI-backed editing command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.deepEqual(spec.permissions, permissions)
  }

  const taskCommands = [
    ['editing.task.get', 'editing_task_get', ['movscript', 'editing', 'task', 'get', '--json'], ['editing:read']],
    ['editing.task.cancel', 'editing_task_cancel', ['movscript', 'editing', 'task', 'cancel', '--json'], ['editing:read', 'editing:write']],
    ['editing.task.logs_get', 'editing_task_logs_get', ['movscript', 'editing', 'task', 'logs', 'get', '--json'], ['editing:read']],
    ['editing.task.render_create', 'editing_task_render_create', ['movscript', 'editing', 'task', 'render', 'create', '--json'], ['editing:read', 'editing:write']],
    ['editing.task.hls_create', 'editing_task_hls_create', ['movscript', 'editing', 'task', 'hls', 'create', '--json'], ['editing:read', 'editing:write']],
    ['editing.task.transcode_create', 'editing_task_transcode_create', ['movscript', 'editing', 'task', 'transcode', 'create', '--json'], ['editing:read', 'editing:write']],
    ['editing.task.reframe_create', 'editing_task_reframe_create', ['movscript', 'editing', 'task', 'reframe', 'create', '--json'], ['editing:read', 'editing:write']],
  ]
  for (const [commandId, mcpToolName, argv, permissions] of taskCommands) {
    const spec = editingCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must be exposed as a CLI-backed editing command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.deepEqual(spec.permissions, permissions)
  }

  const videoCompose = editingCommandSpecs.find((spec) => spec.commandId === 'editing.video.compose')
  assert.ok(videoCompose)
  assert.equal(videoCompose.mcpToolName, 'editing_video_compose')
  assert.deepEqual(videoCompose.examples[0].argv, ['movscript', 'editing', 'video', 'compose', '--json'])
  assert.deepEqual(videoCompose.permissions, ['editing:read', 'editing:write'])
  assert.ok(videoCompose.requiredRuntime.includes('movscript.media.pipeline'))

  const exportCommands = [
    ['editing.export.import_resource', 'editing_export_import_resource', ['movscript', 'editing', 'export', 'import-resource', '--json'], ['editing:read', 'editing:write']],
    ['editing.export.save_local', 'editing_export_save_local', ['movscript', 'editing', 'export', 'save-local', '--json'], ['editing:read', 'editing:write']],
    ['editing.export.publish_hls', 'editing_export_publish_hls', ['movscript', 'editing', 'export', 'publish-hls', '--json'], ['editing:read', 'editing:write']],
    ['editing.export.create_candidate', 'editing_export_create_candidate', ['movscript', 'editing', 'export', 'create-candidate', '--json'], ['editing:read', 'editing:write', 'project:write']],
  ]
  for (const [commandId, mcpToolName, argv, permissions] of exportCommands) {
    const spec = editingCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must be exposed as a CLI-backed editing command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.deepEqual(spec.permissions, permissions)
  }

  const createFromEditDecisions = editingCommandSpecs.find((spec) => spec.commandId === 'editing.project.create_from_edit_decisions')
  assert.ok(createFromEditDecisions)
  assert.equal(createFromEditDecisions.mcpToolName, 'editing_project_create_from_edit_decisions')
  assert.deepEqual(createFromEditDecisions.examples[0].argv, [
    'movscript',
    'editing',
    'project',
    'create-from-edit-decisions',
    '--json',
  ])
  assert.deepEqual(createFromEditDecisions.permissions, ['editing:read', 'editing:write'])

  const execution = await runMovScriptEditingCommand('editing_runtime_capabilities_get')
  assert.equal(execution.schema, 'movscript.command_result.v1')
  assert.equal(execution.commandId, 'editing.runtime.capabilities.get')
  assert.equal(execution.contract.family, 'editing')
  assert.equal(execution.data.status, 'unsupported_runtime')
  assert.equal(execution.data.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')
  assert.deepEqual(execution.debug.cli_argv, ['movscript', 'editing', 'runtime', 'capabilities', 'get', '--json'])
})

test('command execution returns contract summary with reproducible CLI example', async () => {
  const execution = await runMovScriptTimelineCommand('timeline.backend.capability.list')

  assert.equal(execution.schema, 'movscript.command_result.v1')
  assert.equal(execution.commandId, 'timeline.backend.capability.list')
  assert.equal(execution.contract.family, 'timeline')
  assert.equal(execution.contract.ownerService, 'movscript.timeline.compiler')
  assert.deepEqual(execution.contract.requiredRuntime, ['movscript.cli.command-runner'])
  assert.deepEqual(execution.contract.permissions, ['timeline:compile'])
  assert.deepEqual(execution.contract.examples[0].argv, [
    'movscript',
    'timeline',
    'backend',
    'capability',
    'list',
    '--json',
  ])
  assert.deepEqual(execution.debug.cli_argv, execution.contract.examples[0].argv)
})

test('runtime commands are first-class CLI contracts with MCP compatibility aliases', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-runtime-contract-'))
  const ensure = runtimeCommandSpecs.find((spec) => spec.commandId === 'runtime.daemon.ensure')
  assert.ok(ensure)
  assert.deepEqual(ensure.productCliPath, ['daemon', 'ensure'])
  assert.equal(ensure.mcpAliases.includes('runtime_local_daemon_ensure'), true)
  assert.deepEqual(ensure.examples[0].argv, ['movscript', 'daemon', 'ensure', '--json'])

  const execution = await runMovScriptRuntimeCommand('runtime_daemon_discover', { homeDir })
  assert.equal(execution.schema, 'movscript.command_result.v1')
  assert.equal(execution.commandId, 'runtime.daemon.discover')
  assert.equal(execution.contract.family, 'runtime')
  assert.equal(execution.data.schema, 'movscript.runtime_daemon_discovery.v1')
  assert.equal(execution.data.status, 'not_running')
  assert.deepEqual(execution.debug.cli_argv, ['movscript', 'daemon', 'discover', '--json', '--home-dir', homeDir])
})
