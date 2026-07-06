import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  adminCommandSpecs,
  contextCommandSpecs,
  domainCommandSpecs,
  editingCommandSpecs,
  isWorkspaceMCPToolName,
  productionEditingCommandSpecs,
  runMovScriptContextCommand,
  runMovScriptEditingCommand,
  runMovScriptRuntimeCommand,
  runMovScriptSystemCommand,
  runtimeCommandSpecs,
  systemCommandSpecs,
  workspaceCommandSpecs,
} from '../dist/index.js'

const temporaryFallbackCommandIds = new Set([
  'domain.candidate.legacy.append',
  'domain.candidate.legacy.create_asset_slot',
  'domain.candidate.legacy.create_keyframe',
  'domain.candidate.legacy.select',
  'domain.candidate.legacy.update',
  'domain.candidate.legacy.unlock',
  'workspace.get_model',
  'workspace.review',
  'workspace.interpret',
])

test('shared CLI/MCP command specs expose stable product contract metadata', () => {
  const groups = [
    ['runtime', runtimeCommandSpecs],
    ['context', contextCommandSpecs],
    ['admin', adminCommandSpecs],
    ['system', systemCommandSpecs],
    ['domain', domainCommandSpecs],
    ['editing', editingCommandSpecs],
    ['production-editing', productionEditingCommandSpecs],
  ]
  const commandIds = new Set()
  const mcpToolNames = new Set()

  for (const [family, specs] of groups) {
    assert.ok(specs.length > 0, `${family} command specs must not be empty`)
    for (const spec of specs) {
      assert.equal(spec.family, family)
      assert.equal(spec.stability, temporaryFallbackCommandIds.has(spec.commandId) ? 'temporary_fallback' : 'stable')
      assert.equal(typeof spec.ownerService, 'string')
      assert.notEqual(spec.ownerService.trim(), '')
      assert.ok(Array.isArray(spec.requiredRuntime) && spec.requiredRuntime.length > 0, `${spec.commandId} must name required runtime`)
      assert.ok(Array.isArray(spec.permissions) && spec.permissions.length > 0, `${spec.commandId} must name permissions`)
      assert.equal(spec.outputSchema?.type, 'object', `${spec.commandId} must expose an object output schema`)
      assert.ok(Array.isArray(spec.examples) && spec.examples.length > 0, `${spec.commandId} must expose a CLI example`)
      assert.equal(spec.examples[0].argv[0], 'movscript')
      if (spec.productCliPath) {
        assert.deepEqual(spec.examples[0].argv.slice(1, 1 + spec.productCliPath.length), spec.productCliPath)
      } else if (family === 'production-editing') {
        assert.deepEqual(spec.examples[0].argv.slice(1, 3), ['production', 'editing'])
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

test('legacy workspace command specs are compatibility aliases to domain tools', () => {
  const aliases = [
    ['workspace.get_model', 'domain_get_model', ['movscript', 'workspace', 'get-model', 'project', '--json']],
    ['workspace.review', 'domain_inspect', ['movscript', 'workspace', 'review', '--json']],
    ['workspace.interpret', 'domain_interpret', ['movscript', 'workspace', 'interpret', '--json']],
  ]

  assert.equal(workspaceCommandSpecs.length, aliases.length)
  for (const [commandId, mcpToolName, argv] of aliases) {
    const spec = workspaceCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must remain available as a compatibility alias`)
    assert.equal(spec.family, 'workspace')
    assert.equal(spec.stability, 'temporary_fallback')
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.ok(domainCommandSpecs.some((domainSpec) => domainSpec.mcpToolName === mcpToolName))
    assert.equal(isWorkspaceMCPToolName(mcpToolName), false)
  }
})

test('admin cloud file config and usage policy are first-class CLI/MCP contracts', () => {
  const adminCommands = [
    ['admin.cloud_file_config.list', 'admin_cloud_file_config_list', ['movscript', 'admin', 'cloud-file-config', 'list', '--json']],
    ['admin.cloud_file_config.create', 'admin_cloud_file_config_create', ['movscript', 'admin', 'cloud-file-config', 'create', '--json']],
    ['admin.cloud_file_config.update', 'admin_cloud_file_config_update', ['movscript', 'admin', 'cloud-file-config', 'update', '--json']],
    ['admin.cloud_file_config.test', 'admin_cloud_file_config_test', ['movscript', 'admin', 'cloud-file-config', 'test', '--json']],
    ['admin.cloud_file_config.delete', 'admin_cloud_file_config_delete', ['movscript', 'admin', 'cloud-file-config', 'delete', '--json']],
    ['admin.usage_policy.get', 'admin_usage_policy_get', ['movscript', 'admin', 'usage-policy', 'get', '--json']],
    ['admin.usage_policy.update', 'admin_usage_policy_update', ['movscript', 'admin', 'usage-policy', 'update', '--json']],
    ['admin.usage_policy.diagnose', 'admin_usage_policy_diagnose', ['movscript', 'admin', 'usage-policy', 'diagnose', '--json']],
  ]
  for (const [commandId, mcpToolName, argv] of adminCommands) {
    const spec = adminCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must be exposed as a CLI-backed admin command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.equal(spec.ownerService, 'movscript.data.service')
    assert.deepEqual(spec.requiredRuntime, ['movscript.local-node.gateway', 'movscript.data.service'])
    assert.ok(spec.permissions.includes('admin:read'))
  }
})

test('runtime doctor is a first-class top-level CLI/MCP contract', () => {
  const spec = runtimeCommandSpecs.find((candidate) => candidate.commandId === 'runtime.doctor')

  assert.ok(spec, 'runtime.doctor must be exposed as a CLI-backed runtime command')
  assert.equal(spec.mcpToolName, 'runtime_doctor')
  assert.ok(spec.mcpAliases.includes('movscript_runtime_doctor'))
  assert.deepEqual(spec.examples[0].argv, ['movscript', 'doctor', '--json'])
  assert.equal(spec.ownerService, 'movscript.runtime.daemon-control')
  assert.deepEqual(spec.requiredRuntime, [
    'movscript.cli.command-runner',
    'movscript.local-node.control',
    'movscript.local-node.gateway',
  ])
  assert.ok(spec.permissions.includes('runtime:read'))
  assert.ok(spec.permissions.includes('runtime:control'))
})

test('runtime gateway configure and status are CLI-backed MCP contracts', async () => {
  const configureSpec = runtimeCommandSpecs.find((candidate) => candidate.commandId === 'runtime.gateway.configure')
  const statusSpec = runtimeCommandSpecs.find((candidate) => candidate.commandId === 'runtime.gateway.status')
  assert.ok(configureSpec, 'runtime.gateway.configure must be exposed as a CLI-backed runtime command')
  assert.ok(statusSpec, 'runtime.gateway.status must be exposed as a CLI-backed runtime command')
  assert.equal(configureSpec.mcpToolName, 'runtime_gateway_configure')
  assert.equal(statusSpec.mcpToolName, 'runtime_gateway_status')
  assert.deepEqual(configureSpec.examples[0].argv, ['movscript', 'runtime', 'gateway', 'configure', '--json'])
  assert.deepEqual(statusSpec.examples[0].argv, ['movscript', 'runtime', 'gateway', 'status', '--json'])
  assert.equal(configureSpec.ownerService, 'movscript.runtime.gateway')
  assert.deepEqual(configureSpec.requiredRuntime, ['movscript.cli.command-runner'])
  assert.deepEqual(statusSpec.requiredRuntime, ['movscript.cli.command-runner'])

  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-runtime-gateway-contract-'))
  const configured = await runMovScriptRuntimeCommand('runtime_gateway_configure', {
    homeDir,
    gatewayBaseURL: 'https://runtime.example.test/gateway',
    gatewayKind: 'cloud',
    instanceId: 'cloud-prod',
  })
  assert.equal(configured.commandId, 'runtime.gateway.configure')
  assert.equal(configured.data.schema, 'movscript.runtime_gateway_config.v1')
  assert.equal(configured.data.gateway.serviceName, 'movscript.cloud-runtime.gateway')
  assert.equal(configured.data.gateway.mcpEndpoint, 'https://runtime.example.test/gateway/v1/mcp')
  assert.deepEqual(configured.debug.cli_argv, [
    'movscript',
    'runtime',
    'gateway',
    'configure',
    '--json',
    '--home-dir',
    homeDir,
    '--gateway-base-url',
    'https://runtime.example.test/gateway',
    '--gateway-kind',
    'cloud',
    '--instance-id',
    'cloud-prod',
  ])

  const status = await runMovScriptRuntimeCommand('runtime_gateway_status', { homeDir })
  assert.equal(status.data.schema, 'movscript.runtime_gateway_status.v1')
  assert.equal(status.data.status, 'ready')
  assert.equal(status.data.gateways[0].serviceName, 'movscript.cloud-runtime.gateway')
  assert.equal(status.data.endpoints.mcp, 'https://runtime.example.test/gateway/v1/mcp')

  const discover = await runMovScriptRuntimeCommand('runtime_daemon_discover', { homeDir })
  assert.equal(discover.data.status, 'not_running')
  assert.equal(discover.data.runtimeGateway.available, true)
  assert.equal(discover.data.runtimeGateway.mcpEndpoint, 'https://runtime.example.test/gateway/v1/mcp')
})

test('runtime descriptor get reads the canonical daemon gateway descriptor when available', async (t) => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-runtime-descriptor-contract-'))
  const endpointsDir = join(homeDir, 'runtime', 'endpoints')
  mkdirSync(endpointsDir, { recursive: true })

  let descriptorRequests = 0
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }
    if (req.url === '/v1/runtime/descriptor') {
      descriptorRequests += 1
      const baseURL = `http://127.0.0.1:${server.address().port}`
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        schema: 'movscript.runtime-descriptor.v1',
        runtime: {
          owner: 'movscript.local-node',
          appId: 'movscript.local-node',
          name: 'MovScript Local Node Daemon',
        },
        gateway: {
          baseURL,
          canonicalPrefix: '/v1',
        },
        dataConnection: {
          kind: 'local',
          authMode: 'local-owner',
          status: 'connected',
          displayName: 'Local daemon gateway',
        },
        capabilities: {
          project: true,
          canvas: true,
          resources: true,
          editing: true,
          media: true,
        },
      }))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not_found' }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))

  const baseURL = `http://127.0.0.1:${server.address().port}`
  writeFileSync(join(endpointsDir, 'movscript.local-node.gateway.json'), JSON.stringify({
    serviceName: 'movscript.local-node.gateway',
    status: 'ready',
    ready: true,
    baseURL,
  }, null, 2))

  const result = await runMovScriptRuntimeCommand('runtime_descriptor_get', { homeDir, timeoutMs: 250 })

  assert.equal(result.commandId, 'runtime.descriptor.get')
  assert.equal(result.data.schema, 'movscript.runtime-descriptor.v1')
  assert.equal(result.data.gateway.baseURL, baseURL)
  assert.equal(result.data.gateway.canonicalPrefix, '/v1')
  assert.equal(result.data.runtime.owner, 'movscript.local-node')
  assert.equal(descriptorRequests, 1)
})

test('project bootstrap commands are top-level product CLIs backed by system MCP tools', () => {
  for (const [commandId, mcpToolName, action, permissions] of [
    ['system.project.create', 'system_project_create', 'create', ['project:read', 'project:write']],
    ['system.project.init', 'system_project_init', 'init', ['project:read', 'project:write']],
    ['system.project.open', 'system_project_open', 'open', ['project:read', 'project:interpret']],
    ['system.project.fetch', 'system_project_fetch', 'fetch', ['project:read', 'project:interpret']],
  ]) {
    const spec = systemCommandSpecs.find((candidate) => candidate.commandId === commandId)

    assert.ok(spec, `${commandId} must be exposed as a CLI-backed project command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.productCliPath, ['project', action])
    assert.deepEqual(spec.examples[0].argv, ['movscript', 'project', action, '--json'])
    assert.equal(spec.ownerService, 'movscript.project.service')
    assert.deepEqual(spec.permissions, permissions)
  }
})

test('system production workflow is a CLI-only product contract', async () => {
  const spec = systemCommandSpecs.find((candidate) => candidate.commandId === 'system.production.workflow')
  assert.ok(spec, 'system.production.workflow must be exposed as a CLI-backed system command')
  assert.equal(spec.mcpToolName, 'system_production_workflow')
  assert.deepEqual(spec.productCliPath, ['production', 'workflow'])
  assert.deepEqual(spec.examples[0].argv, ['movscript', 'production', 'workflow', '--json'])
  assert.equal(spec.ownerService, 'movscript.cli.command-runner')
  assert.deepEqual(spec.requiredRuntime, ['movscript.cli.command-runner'])
  assert.deepEqual(spec.permissions, ['system:read'])

  const result = await runMovScriptSystemCommand(spec, {})
  assert.equal(result.commandId, 'system.production.workflow')
  assert.equal(result.mcpToolName, 'system_production_workflow')
  assert.deepEqual(result.debug.cli_argv, ['movscript', 'production', 'workflow', '--json'])
  assert.equal(result.data.schema, 'movscript.production_workflow.v1')
  assert.equal(result.data.mode, 'cli_only')
  assert.deepEqual(result.data.stages.map((stage) => stage.stage_id), [
    'plan_content',
    'production_editing',
    'generate',
    'export',
  ])
  assert.ok(result.data.stages.find((stage) => stage.stage_id === 'generate').does_not.includes('Does not automatically adopt or select candidates.'))
  assert.ok(result.data.stages.find((stage) => stage.stage_id === 'production_editing').mcp_tools.includes('production_editing_workspace_open'))
  assert.ok(result.data.stages.find((stage) => stage.stage_id === 'export').mcp_tools.includes('editing_task_render_create'))
  assert.ok(result.data.global_gates.some((gate) => gate.includes('generation success are separate from adoption')))
})

test('resource and artifact commands are top-level product CLIs backed by system MCP tools', () => {
  for (const [commandId, mcpToolName, productCliPath] of [
    ['system.resource.library.query', 'system_resource_library_query', ['resource', 'library', 'query']],
    ['system.resource.library.open', 'system_resource_library_open', ['resource', 'library', 'open']],
    ['system.resource.image.annotate', 'system_resource_image_annotate', ['resource', 'image', 'annotate']],
    ['system.resource.video.probe', 'system_resource_video_probe', ['resource', 'video', 'probe']],
    ['system.resource.upload', 'system_resource_upload', ['resource', 'upload']],
    ['system.resource.upload_batch', 'system_resource_upload_batch', ['resource', 'upload-batch']],
    ['system.artifact.get_stream', 'system_artifact_get_stream', ['artifact', 'get-stream']],
    ['system.artifact.upload_export', 'system_artifact_upload_export', ['artifact', 'upload-export']],
    ['system.artifact.upload_hls_stream', 'system_artifact_upload_hls_stream', ['artifact', 'upload-hls-stream']],
    ['system.external_resource.source.list', 'system_external_resource_source_list', ['external-resource', 'source', 'list']],
    ['system.external_resource.search', 'system_external_resource_search', ['external-resource', 'search']],
  ]) {
    const spec = systemCommandSpecs.find((candidate) => candidate.commandId === commandId)

    assert.ok(spec, `${commandId} must be exposed as a CLI-backed resource/artifact command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.productCliPath, productCliPath)
    assert.deepEqual(spec.examples[0].argv, ['movscript', ...productCliPath, '--json'])
    assert.equal(spec.ownerService, 'movscript.data.service')
    assert.ok(spec.permissions.includes('system:read'))
  }
})

test('shot and video analysis commands are top-level product CLIs backed by system MCP tools', () => {
  for (const [commandId, mcpToolName, productCliPath] of [
    ['system.shot.library.query', 'system_shot_library_query', ['shot', 'library', 'query']],
    ['system.shot.group.get', 'system_shot_group_get', ['shot', 'group', 'get']],
    ['system.shot.group.create', 'system_shot_group_create', ['shot', 'group', 'create']],
    ['system.shot.group.add_shots', 'system_shot_group_add_shots', ['shot', 'group', 'add-shots']],
    ['system.video.shot_cuts.analyze', 'system_video_shot_cuts_analyze', ['video', 'shot-cuts', 'analyze']],
  ]) {
    const spec = systemCommandSpecs.find((candidate) => candidate.commandId === commandId)

    assert.ok(spec, `${commandId} must be exposed as a CLI-backed shot/video command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.productCliPath, productCliPath)
    assert.deepEqual(spec.examples[0].argv, ['movscript', ...productCliPath, '--json'])
    assert.equal(spec.ownerService, 'movscript.data.service')
    assert.ok(spec.permissions.includes('system:read'))
  }
})

test('admin provider connection test is a CLI-backed MCP contract', () => {
  const spec = adminCommandSpecs.find((candidate) => candidate.commandId === 'admin.provider.connection_test')
  assert.ok(spec, 'admin.provider.connection_test must be exposed as a CLI-backed admin command')
  assert.equal(spec.mcpToolName, 'admin_provider_connection_test')
  assert.deepEqual(spec.examples[0].argv, ['movscript', 'admin', 'provider', 'connection-test', '--json'])
  assert.equal(spec.method, 'POST')
  assert.equal(spec.path({ providerInstanceId: 'ai_gateway:primary' }), '/admin/provider-instances/ai_gateway%3Aprimary/test')
  assert.equal(spec.ownerService, 'movscript.data.service')
  assert.deepEqual(spec.requiredRuntime, ['movscript.local-node.gateway', 'movscript.data.service'])
  assert.ok(spec.permissions.includes('admin:read'))
})

test('admin provider instance config commands are CLI-backed MCP contracts', () => {
  const commands = [
    [
      'admin.provider_instance.config.get',
      'admin_provider_instance_config_get',
      'GET',
      ['movscript', 'admin', 'provider', 'instance', 'config', 'get', '--json'],
      '/admin/provider-instances/blob_storage%3Aminio/config',
    ],
    [
      'admin.provider_instance.config.update',
      'admin_provider_instance_config_update',
      'PUT',
      ['movscript', 'admin', 'provider', 'instance', 'config', 'update', '--json'],
      '/admin/provider-instances/blob_storage%3Aminio/config',
    ],
    [
      'admin.provider_instance.config.apply',
      'admin_provider_instance_config_apply',
      'POST',
      ['movscript', 'admin', 'provider', 'instance', 'config', 'apply', '--json'],
      '/admin/provider-instances/blob_storage%3Aminio/config/apply',
    ],
    [
      'admin.provider_instance.config.activate',
      'admin_provider_instance_config_activate',
      'POST',
      ['movscript', 'admin', 'provider', 'instance', 'config', 'activate', '--json'],
      '/admin/provider-instances/blob_storage%3Aminio/config/activate',
    ],
  ]
  for (const [commandId, mcpToolName, method, argv, path] of commands) {
    const spec = adminCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must be exposed as a CLI-backed admin command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.equal(spec.method, method)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.equal(spec.path({ providerInstanceId: 'blob_storage:minio' }), path)
    assert.equal(spec.ownerService, 'movscript.data.service')
    assert.deepEqual(spec.requiredRuntime, ['movscript.local-node.gateway', 'movscript.data.service'])
    assert.ok(spec.permissions.includes('admin:read'))
  }
})

test('admin generation tool call test is a CLI-backed MCP contract', () => {
  const spec = adminCommandSpecs.find((candidate) => candidate.commandId === 'admin.generation_tools.call_test')
  assert.ok(spec, 'admin.generation_tools.call_test must be exposed as a CLI-backed admin command')
  assert.equal(spec.mcpToolName, 'admin_generation_tool_call_test')
  assert.equal(spec.method, 'POST')
  assert.deepEqual(spec.examples[0].argv, ['movscript', 'admin', 'generation-tools', 'call-test', '--json'])
  assert.equal(spec.path({}), '/generation-tools/call')
  assert.equal(spec.ownerService, 'movscript.data.service')
  assert.deepEqual(spec.requiredRuntime, ['movscript.local-node.gateway', 'movscript.data.service'])
  assert.ok(spec.permissions.includes('admin:read'))
})

test('admin resource access profile commands are CLI-backed MCP contracts', () => {
  const commands = [
    [
      'admin.resource_access.profile.list',
      'admin_resource_access_profile_list',
      'GET',
      ['movscript', 'admin', 'resource-access', 'profile', 'list', '--json'],
      '/admin/settings/resource-access/profiles',
    ],
    [
      'admin.resource_access.profile.upsert',
      'admin_resource_access_profile_upsert',
      'PUT',
      ['movscript', 'admin', 'resource-access', 'profile', 'upsert', '--json'],
      '/admin/settings/resource-access/profiles/public-tunnel',
    ],
    [
      'admin.resource_access.profile.delete',
      'admin_resource_access_profile_delete',
      'DELETE',
      ['movscript', 'admin', 'resource-access', 'profile', 'delete', '--json'],
      '/admin/settings/resource-access/profiles/public-tunnel',
    ],
    [
      'admin.resource_access.profile.test',
      'admin_resource_access_profile_test',
      'POST',
      ['movscript', 'admin', 'resource-access', 'profile', 'test', '--json'],
      '/admin/settings/resource-access/profiles/public-tunnel/test',
    ],
    [
      'admin.resource_access.route_diagnose',
      'admin_resource_access_route_diagnose',
      'POST',
      ['movscript', 'admin', 'resource-access', 'route', 'diagnose', '--json'],
      '/admin/settings/resource-access/routes/diagnose',
    ],
  ]
  for (const [commandId, mcpToolName, method, argv, path] of commands) {
    const spec = adminCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must be exposed as a CLI-backed admin command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.equal(spec.method, method)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.equal(spec.path({ profileId: 'public-tunnel' }), path)
    assert.equal(spec.ownerService, 'movscript.data.service')
    assert.deepEqual(spec.requiredRuntime, ['movscript.local-node.gateway', 'movscript.data.service'])
    assert.ok(spec.permissions.includes('admin:read'))
  }
})

test('domain candidate decisions are first-class CLI contracts', async () => {
  const domainCommands = [
    ['domain.candidate.create_content', 'domain_create_content_candidate', ['movscript', 'domain', 'candidate', 'create-content', '--json']],
    ['domain.candidate.register_raw_resource', 'domain_register_raw_resource_as_content_unit_candidate', ['movscript', 'domain', 'candidate', 'register-raw-resource', '--json']],
    ['domain.candidate.create_content_batch', 'domain_create_content_candidate_batch', ['movscript', 'domain', 'candidate', 'create-content-batch', '--json']],
    ['domain.candidate.select_content_unit', 'domain_select_content_unit_candidate', ['movscript', 'domain', 'candidate', 'select-content-unit', '--json']],
    ['domain.candidate.select_content_unit_batch', 'domain_select_content_unit_candidate_batch', ['movscript', 'domain', 'candidate', 'select-content-unit-batch', '--json']],
    ['domain.candidate.decide_content_unit', 'domain_decide_content_unit_candidate', ['movscript', 'domain', 'candidate', 'decide-content-unit', '--json']],
  ]
  for (const [commandId, mcpToolName, argv] of domainCommands) {
    const spec = domainCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must be exposed as a CLI-backed domain command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.equal(spec.ownerService, 'movscript.project.service')
    assert.ok(spec.permissions.includes('candidate:write'))
  }
})

test('domain read and status tools are first-class read-only CLI contracts', () => {
  const domainCommands = [
    ['domain.overview', 'domain_overview', ['movscript', 'domain', 'overview', '--json']],
    ['domain.query.entities', 'domain_query_entities', ['movscript', 'domain', 'query', 'entities', '--json']],
    ['domain.query.settings', 'domain_query_settings', ['movscript', 'domain', 'query', 'settings', '--json']],
    ['domain.query.assets', 'domain_query_assets', ['movscript', 'domain', 'query', 'assets', '--json']],
    ['domain.query.production_context', 'domain_query_production_context', ['movscript', 'domain', 'query', 'production-context', '--json']],
    ['domain.read.content_workspace', 'domain_read_content_workspace', ['movscript', 'domain', 'read', 'content-workspace', '--json']],
    ['domain.read.content_workspace_snapshot', 'domain_read_content_workspace_snapshot', ['movscript', 'domain', 'read', 'content-workspace-snapshot', '--json']],
    ['domain.read.project_context_snapshot', 'domain_read_project_context_snapshot', ['movscript', 'domain', 'read', 'project-context', '--json']],
    ['domain.read.content_unit.generation_prompt', 'domain_read_content_unit_generation_prompt', ['movscript', 'domain', 'read', 'content-unit', 'generation-prompt', '--json']],
    ['domain.read.production_work_plan', 'domain_read_production_work_plan', ['movscript', 'domain', 'read', 'production-work-plan', '--json']],
    ['domain.production.status_summary', 'domain_production_status_summary', ['movscript', 'domain', 'production', 'status-summary', '--json']],
    ['domain.regeneration.plan', 'domain_regeneration_plan', ['movscript', 'domain', 'regeneration', 'plan', '--json']],
  ]
  for (const [commandId, mcpToolName, argv] of domainCommands) {
    const spec = domainCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must be exposed as a CLI-backed domain read command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.deepEqual(spec.permissions, ['project:read'])
  }

  const prompt = domainCommandSpecs.find((candidate) => candidate.commandId === 'domain.read.content_unit.generation_prompt')
  assert.equal(prompt?.mcpAliases?.includes('domain_read_content_unit_input_version'), true)
})

test('domain model and diagnostics tools own the canonical CLI contracts', () => {
  const domainCommands = [
    ['domain.get_model', 'domain_get_model', ['movscript', 'domain', 'get-model', '--entity-kind', 'project', '--json'], ['project:read']],
    ['domain.diagnostics.inspect', 'domain_inspect', ['movscript', 'domain', 'diagnostics', 'inspect', '--json'], ['project:read']],
    ['domain.diagnostics.interpret', 'domain_interpret', ['movscript', 'domain', 'diagnostics', 'interpret', '--json'], ['project:read', 'project:interpret']],
  ]

  for (const [commandId, mcpToolName, argv, permissions] of domainCommands) {
    const spec = domainCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must be exposed as a canonical domain command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.deepEqual(spec.permissions, permissions)
    assert.equal(spec.stability, 'stable')
  }
})

test('domain source writes are first-class project-write CLI contracts', () => {
  const domainCommands = [
    ['domain.source.project_standards.upsert', 'domain_upsert_project_standards', ['movscript', 'domain', 'source', 'project-standards', 'upsert', '--json']],
    ['domain.source.setting.upsert', 'domain_upsert_setting', ['movscript', 'domain', 'source', 'setting', 'upsert', '--json']],
    ['domain.source.setting_state.upsert', 'domain_upsert_setting_state', ['movscript', 'domain', 'source', 'setting-state', 'upsert', '--json']],
    ['domain.source.asset.upsert', 'domain_upsert_asset', ['movscript', 'domain', 'source', 'asset', 'upsert', '--json']],
    ['domain.source.setting_tree.upsert', 'domain_upsert_setting_tree', ['movscript', 'domain', 'source', 'setting-tree', 'upsert', '--json']],
    ['domain.source.script.upsert', 'domain_upsert_script', ['movscript', 'domain', 'source', 'script', 'upsert', '--json']],
    ['domain.source.script.snapshot_version', 'domain_snapshot_script_version', ['movscript', 'domain', 'source', 'script', 'snapshot-version', '--json']],
    ['domain.source.content_unit.upsert', 'domain_upsert_content_unit', ['movscript', 'domain', 'source', 'content-unit', 'upsert', '--json']],
    ['domain.source.timeline_namespace_tree.upsert', 'domain_upsert_timeline_namespace_tree', ['movscript', 'domain', 'source', 'timeline-namespace-tree', 'upsert', '--json']],
    ['domain.source.production.upsert', 'domain_upsert_production', ['movscript', 'domain', 'source', 'production', 'upsert', '--json']],
    ['domain.source.production_tree.upsert', 'domain_upsert_production_tree', ['movscript', 'domain', 'source', 'production-tree', 'upsert', '--json']],
    ['domain.source.segment.upsert', 'domain_upsert_segment', ['movscript', 'domain', 'source', 'segment', 'upsert', '--json']],
    ['domain.source.scene_moment.upsert', 'domain_upsert_scene_moment', ['movscript', 'domain', 'source', 'scene-moment', 'upsert', '--json']],
    ['domain.source.keyframe.upsert', 'domain_upsert_keyframe', ['movscript', 'domain', 'source', 'keyframe', 'upsert', '--json']],
    ['domain.source.storyboard.upsert', 'domain_upsert_storyboard', ['movscript', 'domain', 'source', 'storyboard', 'upsert', '--json']],
    ['domain.source.audio_cue.upsert', 'domain_upsert_audio_cue', ['movscript', 'domain', 'source', 'audio-cue', 'upsert', '--json']],
    ['domain.source.expression_unit.upsert', 'domain_upsert_expression_unit', ['movscript', 'domain', 'source', 'expression-unit', 'upsert', '--json']],
    ['domain.source.content_unit.prompt.update', 'domain_update_content_unit_prompt', ['movscript', 'domain', 'source', 'content-unit', 'prompt', 'update', '--json']],
    ['domain.source.entity.transition.update', 'domain_update_entity_transition', ['movscript', 'domain', 'source', 'entity', 'transition', 'update', '--json']],
    ['domain.source.storyboard.timeline.update', 'domain_update_storyboard_timeline', ['movscript', 'domain', 'source', 'storyboard', 'timeline', 'update', '--json']],
    ['domain.source.entity.delete', 'domain_delete_entity', ['movscript', 'domain', 'source', 'entity', 'delete', '--json']],
  ]
  for (const [commandId, mcpToolName, argv] of domainCommands) {
    const spec = domainCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must be exposed as a CLI-backed domain source command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.deepEqual(spec.permissions, ['project:read', 'project:write'])
  }

  const readScript = domainCommandSpecs.find((candidate) => candidate.commandId === 'domain.source.script.read')
  assert.ok(readScript)
  assert.equal(readScript.mcpToolName, 'domain_read_script_source')
  assert.deepEqual(readScript.examples[0].argv, ['movscript', 'domain', 'source', 'script', 'read', '--json'])
  assert.deepEqual(readScript.permissions, ['project:read'])
})

test('domain legacy/provider tools are first-class CLI contracts until retired', () => {
  const domainCommands = [
    ['domain.provider.remote_asset_groups.query', 'domain_query_remote_asset_groups', ['movscript', 'domain', 'provider', 'remote-asset-groups', 'query', '--json'], ['project:read', 'provider:read'], 'stable'],
    ['domain.provider.remote_assets.query', 'domain_query_remote_assets', ['movscript', 'domain', 'provider', 'remote-assets', 'query', '--json'], ['project:read', 'provider:read'], 'stable'],
    ['domain.provider.asset.certify', 'domain_certify_asset_provider', ['movscript', 'domain', 'provider', 'asset', 'certify', '--json'], ['project:read', 'project:write', 'provider:write'], 'stable'],
    ['domain.candidate.legacy.append', 'domain_append_candidate', ['movscript', 'domain', 'candidate', 'legacy', 'append', '--json'], ['project:read', 'project:write'], 'temporary_fallback'],
    ['domain.candidate.legacy.create_asset_slot', 'domain_create_asset_slot_candidate', ['movscript', 'domain', 'candidate', 'legacy', 'create-asset-slot', '--json'], ['project:read', 'project:write'], 'temporary_fallback'],
    ['domain.candidate.legacy.create_keyframe', 'domain_create_keyframe_candidate', ['movscript', 'domain', 'candidate', 'legacy', 'create-keyframe', '--json'], ['project:read', 'project:write'], 'temporary_fallback'],
    ['domain.candidate.legacy.select', 'domain_select_candidate', ['movscript', 'domain', 'candidate', 'legacy', 'select', '--json'], ['project:read', 'project:write'], 'temporary_fallback'],
    ['domain.candidate.legacy.update', 'domain_update_candidate', ['movscript', 'domain', 'candidate', 'legacy', 'update', '--json'], ['project:read', 'project:write'], 'temporary_fallback'],
    ['domain.candidate.legacy.unlock', 'domain_unlock_candidate', ['movscript', 'domain', 'candidate', 'legacy', 'unlock', '--json'], ['project:read', 'project:write'], 'temporary_fallback'],
    ['domain.diagnostics.review', 'domain_review', ['movscript', 'domain', 'diagnostics', 'review', '--json'], ['project:read'], 'stable'],
  ]
  for (const [commandId, mcpToolName, argv, permissions, stability] of domainCommands) {
    const spec = domainCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must be exposed as a CLI-backed domain command`)
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.deepEqual(spec.permissions, permissions)
    assert.equal(spec.stability, stability)
    if (stability === 'temporary_fallback') {
      assert.match(spec.examples[0].description, /migration-only temporary .* fallback contract/)
    } else {
      assert.match(spec.examples[0].description, /stable MovScript CLI contract/)
    }
  }

  const certify = domainCommandSpecs.find((candidate) => candidate.commandId === 'domain.provider.asset.certify')
  assert.equal(certify?.mcpAliases?.includes('domain_certify_asset_seedance2'), true)
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

test('production editing workspace commands are CLI-backed Project Service contracts', () => {
  const expected = [
    ['production_editing.resources.refresh', 'production_editing_resources_refresh', ['movscript', 'production', 'editing', 'resources', 'refresh', '--json'], ['project:read', 'project:write']],
    ['production_editing.workspace.list', 'production_editing_workspace_list', ['movscript', 'production', 'editing', 'workspace', 'list', '--json'], ['project:read']],
    ['production_editing.workspace.create', 'production_editing_workspace_create', ['movscript', 'production', 'editing', 'workspace', 'create', '--json'], ['project:read', 'project:write']],
    ['production_editing.workspace.get', 'production_editing_workspace_get', ['movscript', 'production', 'editing', 'workspace', 'get', '--json'], ['project:read']],
    ['production_editing.workspace.open', 'production_editing_workspace_open', ['movscript', 'production', 'editing', 'workspace', 'open', '--json'], ['project:read', 'project:write']],
    ['production_editing.workspace.delete', 'production_editing_workspace_delete', ['movscript', 'production', 'editing', 'workspace', 'delete', '--json'], ['project:read', 'project:write']],
  ]

  assert.equal(productionEditingCommandSpecs.length, expected.length)
  for (const [commandId, mcpToolName, argv, permissions] of expected) {
    const spec = productionEditingCommandSpecs.find((candidate) => candidate.commandId === commandId)
    assert.ok(spec, `${commandId} must be exposed as a production editing command`)
    assert.equal(spec.family, 'production-editing')
    assert.equal(spec.mcpToolName, mcpToolName)
    assert.deepEqual(spec.examples[0].argv, argv)
    assert.equal(spec.ownerService, 'movscript.project.service')
    assert.deepEqual(spec.requiredRuntime, ['movscript.local-node.gateway', 'movscript.project.service'])
    assert.deepEqual(spec.permissions, permissions)
  }
})

test('editing backend diagnostics are first-class CLI contracts', async () => {
  const capabilities = editingCommandSpecs.find((spec) => spec.commandId === 'editing.runtime.capabilities.get')
  assert.ok(capabilities)
  assert.equal(capabilities.mcpToolName, 'editing_runtime_capabilities_get')
  assert.deepEqual(capabilities.examples[0].argv, ['movscript', 'editing', 'runtime', 'capabilities', 'get', '--json'])

  const lifecycleCommands = [
    ['editing.project.create', 'editing_project_create', ['movscript', 'editing', 'project', 'create', '--json'], ['editing:read', 'editing:write']],
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

  const execution = await runMovScriptEditingCommand('editing_runtime_capabilities_get')
  assert.equal(execution.schema, 'movscript.command_result.v1')
  assert.equal(execution.commandId, 'editing.runtime.capabilities.get')
  assert.equal(execution.contract.family, 'editing')
  assert.equal(execution.data.status, 'unsupported_runtime')
  assert.equal(execution.data.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')
  assert.deepEqual(execution.debug.cli_argv, ['movscript', 'editing', 'runtime', 'capabilities', 'get', '--json'])
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
