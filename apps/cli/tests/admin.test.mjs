import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let server
let baseURL
let adminRequests = []

before(async () => {
  server = createTestServer()
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  baseURL = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolveClose) => server.close(resolveClose))
})

test('admin resource-access resolve-test calls backend through shared command JSON', async () => {
  adminRequests = []
  const result = await runMovscript([
    'admin',
    'resource-access',
    'resolve-test',
    '--server',
    baseURL,
    '--resource-id',
    '880',
    '--required-media-type',
    'image',
    '--profile-id',
    'public-tunnel',
    '--transport',
    'public_url',
    '--purpose',
    'generation',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'admin.resource_access.resolve_test')
  assert.equal(result.json.mcpToolName, 'admin_resource_access_resolve_test')
  assert.equal(result.json.data.resource_id, 880)
  assert.equal(result.json.data.profile_id, 'public-tunnel')
  assert.equal(result.json.data.url, 'https://tunnel.example/api/v1/resource-access/resources/880/file?sig=redacted')
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'admin',
    'resource-access',
    'resolve-test',
    '--json',
    '--server',
    baseURL,
    '--resource-id',
    '880',
    '--required-media-type',
    'image',
    '--profile-id',
    'public-tunnel',
    '--transport',
    'public_url',
    '--purpose',
    'generation',
  ])
  assert.deepEqual(adminRequests, [{
    method: 'POST',
    url: '/api/v1/resource-access/resolve',
    body: {
      resource_id: 880,
      purpose: 'generation',
      required_media_type: 'image',
      transport: 'public_url',
      profile_id: 'public-tunnel',
    },
  }])
})

test('admin resource-access check-test calls backend through shared command JSON', async () => {
  adminRequests = []
  const result = await runMovscript([
    'admin',
    'resource-access',
    'check-test',
    '--server',
    baseURL,
    '--resource-id',
    '880',
    '--required-media-type',
    'image',
    '--profile-id',
    'public-tunnel',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'admin.resource_access.check_test')
  assert.equal(result.json.mcpToolName, 'admin_resource_access_check_test')
  assert.equal(result.json.data.reachable, true)
  assert.equal(result.json.data.status_code, 200)
  assert.deepEqual(adminRequests, [{
    method: 'POST',
    url: '/api/v1/resource-access/check',
    body: {
      resource_id: 880,
      required_media_type: 'image',
      profile_id: 'public-tunnel',
    },
  }])
})

test('admin resource-access profile and route diagnostics call backend through shared command JSON', async () => {
  adminRequests = []
  const payload = {
    name: 'Local Tunnel',
    enabled: true,
    mode: 'public_tunnel',
    public_base_url: 'https://tunnel.example',
    signing_enabled: true,
    signing_secret: 'profile-secret',
    expires_seconds: 120,
    health_check_path: '/healthz',
    default_profile_id: 'public-tunnel',
  }

  const list = await runMovscript([
    'admin',
    'resource-access',
    'profile',
    'list',
    '--server',
    baseURL,
    '--json',
  ])
  assert.equal(list.status, 0)
  assert.equal(list.json.commandId, 'admin.resource_access.profile.list')
  assert.equal(list.json.mcpToolName, 'admin_resource_access_profile_list')
  assert.equal(list.json.data.profiles[0].id, 'public-tunnel')

  const upsert = await runMovscript([
    'admin',
    'resource-access',
    'profile',
    'upsert',
    '--server',
    baseURL,
    '--profile-id',
    'public-tunnel',
    '--payload',
    JSON.stringify(payload),
    '--json',
  ])
  assert.equal(upsert.status, 0)
  assert.equal(upsert.json.commandId, 'admin.resource_access.profile.upsert')
  assert.equal(upsert.json.mcpToolName, 'admin_resource_access_profile_upsert')
  assert.equal(upsert.json.data.profiles[0].signing_secret_set, true)
  assert.equal(upsert.json.data.profiles[0].signing_secret, undefined)
  assert.deepEqual(upsert.json.debug.cli_argv, [
    'movscript',
    'admin',
    'resource-access',
    'profile',
    'upsert',
    '--json',
    '--server',
    baseURL,
    '--profile-id',
    'public-tunnel',
    '--payload',
    '<json>',
  ])

  const profileTest = await runMovscript([
    'admin',
    'resource-access',
    'profile',
    'test',
    '--server',
    baseURL,
    '--profile-id',
    'public-tunnel',
    '--json',
  ])
  assert.equal(profileTest.status, 0)
  assert.equal(profileTest.json.commandId, 'admin.resource_access.profile.test')
  assert.equal(profileTest.json.mcpToolName, 'admin_resource_access_profile_test')
  assert.equal(profileTest.json.data.reachable, true)

  const diagnose = await runMovscript([
    'admin',
    'resource-access',
    'route',
    'diagnose',
    '--server',
    baseURL,
    '--route-id',
    '99',
    '--profile-id',
    'public-tunnel',
    '--transport',
    'public_url',
    '--required-media-type',
    'image',
    '--purpose',
    'generation',
    '--json',
  ])
  assert.equal(diagnose.status, 0)
  assert.equal(diagnose.json.commandId, 'admin.resource_access.route_diagnose')
  assert.equal(diagnose.json.mcpToolName, 'admin_resource_access_route_diagnose')
  assert.equal(diagnose.json.data.ready, true)
  assert.deepEqual(diagnose.json.debug.cli_argv, [
    'movscript',
    'admin',
    'resource-access',
    'route',
    'diagnose',
    '--json',
    '--server',
    baseURL,
    '--required-media-type',
    'image',
    '--profile-id',
    'public-tunnel',
    '--transport',
    'public_url',
    '--purpose',
    'generation',
    '--route-id',
    '99',
  ])

  const deleted = await runMovscript([
    'admin',
    'resource-access',
    'profile',
    'delete',
    '--server',
    baseURL,
    '--profile-id',
    'public-tunnel',
    '--yes',
    '--json',
  ])
  assert.equal(deleted.status, 0)
  assert.equal(deleted.json.commandId, 'admin.resource_access.profile.delete')
  assert.equal(deleted.json.mcpToolName, 'admin_resource_access_profile_delete')
  assert.equal(deleted.json.data.profiles.length, 0)

  assert.deepEqual(adminRequests, [
    {
      method: 'GET',
      url: '/api/v1/admin/settings/resource-access/profiles',
      body: undefined,
    },
    {
      method: 'PUT',
      url: '/api/v1/admin/settings/resource-access/profiles/public-tunnel',
      body: payload,
    },
    {
      method: 'POST',
      url: '/api/v1/admin/settings/resource-access/profiles/public-tunnel/test',
      body: {},
    },
    {
      method: 'POST',
      url: '/api/v1/admin/settings/resource-access/routes/diagnose',
      body: {
        route_id: 99,
        purpose: 'generation',
        required_media_type: 'image',
        transport: 'public_url',
        profile_id: 'public-tunnel',
      },
    },
    {
      method: 'DELETE',
      url: '/api/v1/admin/settings/resource-access/profiles/public-tunnel',
      body: {},
    },
  ])
})

test('admin provider connection-test calls backend through shared command JSON', async () => {
  adminRequests = []
  const result = await runMovscript([
    'admin',
    'provider',
    'connection-test',
    '--server',
    baseURL,
    '--provider-instance-id',
    'ai_gateway:primary',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'admin.provider.connection_test')
  assert.equal(result.json.mcpToolName, 'admin_provider_connection_test')
  assert.equal(result.json.data.status, 'ok')
  assert.equal(result.json.data.provider_instance_id, 'ai_gateway:primary')
  assert.equal(result.json.data.secret_visible, false)
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'admin',
    'provider',
    'connection-test',
    '--json',
    '--server',
    baseURL,
    '--provider-instance-id',
    'ai_gateway:primary',
  ])
  assert.deepEqual(adminRequests, [{
    method: 'POST',
    url: '/api/v1/admin/provider-instances/ai_gateway%3Aprimary/test',
    body: {},
  }])
})

test('admin provider instance config commands call backend through shared command JSON', async () => {
  adminRequests = []
  const payload = {
    values: {
      endpoint: 'https://minio.example.test',
      access_key: 'ak-redacted',
      secret_key: 'sk-redacted',
    },
  }

  const update = await runMovscript([
    'admin',
    'provider',
    'instance',
    'config',
    'update',
    '--server',
    baseURL,
    '--provider-instance-id',
    'blob_storage:minio',
    '--payload',
    JSON.stringify(payload),
    '--json',
  ])
  assert.equal(update.status, 0)
  assert.equal(update.json.commandId, 'admin.provider_instance.config.update')
  assert.equal(update.json.mcpToolName, 'admin_provider_instance_config_update')
  assert.equal(update.json.data.provider_instance_id, 'blob_storage:minio')
  assert.equal(update.json.data.values.secret_key_set, true)
  assert.deepEqual(update.json.debug.cli_argv, [
    'movscript',
    'admin',
    'provider',
    'instance',
    'config',
    'update',
    '--json',
    '--server',
    baseURL,
    '--provider-instance-id',
    'blob_storage:minio',
    '--payload',
    '<json>',
  ])

  const apply = await runMovscript([
    'admin',
    'provider',
    'instance',
    'config',
    'apply',
    '--server',
    baseURL,
    '--provider-instance-id',
    'blob_storage:minio',
    '--yes',
    '--json',
  ])
  assert.equal(apply.status, 0)
  assert.equal(apply.json.commandId, 'admin.provider_instance.config.apply')
  assert.equal(apply.json.mcpToolName, 'admin_provider_instance_config_apply')
  assert.equal(apply.json.data.status, 'applied')
  assert.deepEqual(apply.json.debug.cli_argv, [
    'movscript',
    'admin',
    'provider',
    'instance',
    'config',
    'apply',
    '--json',
    '--server',
    baseURL,
    '--provider-instance-id',
    'blob_storage:minio',
    '--yes',
  ])

  const activate = await runMovscript([
    'admin',
    'provider',
    'instance',
    'config',
    'activate',
    '--server',
    baseURL,
    '--provider-instance-id',
    'blob_storage:minio',
    '--yes',
    '--json',
  ])
  assert.equal(activate.status, 0)
  assert.equal(activate.json.commandId, 'admin.provider_instance.config.activate')
  assert.equal(activate.json.mcpToolName, 'admin_provider_instance_config_activate')
  assert.equal(activate.json.data.status, 'activated')

  assert.deepEqual(adminRequests, [
    {
      method: 'PUT',
      url: '/api/v1/admin/provider-instances/blob_storage%3Aminio/config',
      body: payload,
    },
    {
      method: 'POST',
      url: '/api/v1/admin/provider-instances/blob_storage%3Aminio/config/apply',
      body: {},
    },
    {
      method: 'POST',
      url: '/api/v1/admin/provider-instances/blob_storage%3Aminio/config/activate',
      body: {},
    },
  ])
})

test('admin generation-tools call-test calls backend through shared command JSON', async () => {
  adminRequests = []
  const result = await runMovscript([
    'admin',
    'generation-tools',
    'call-test',
    '--server',
    baseURL,
    '--tool-type',
    'comfyui',
    '--tool-server-id',
    'local-comfy',
    '--operation',
    'status',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'admin.generation_tools.call_test')
  assert.equal(result.json.mcpToolName, 'admin_generation_tool_call_test')
  assert.equal(result.json.data.status, 'ok')
  assert.equal(result.json.data.server.id, 'local-comfy')
  assert.equal(result.json.data.server.token_set, true)
  assert.equal(result.json.data.server.token, undefined)
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'admin',
    'generation-tools',
    'call-test',
    '--json',
    '--server',
    baseURL,
    '--tool-type',
    'comfyui',
    '--tool-server-id',
    'local-comfy',
    '--operation',
    'status',
  ])
  assert.deepEqual(adminRequests, [{
    method: 'POST',
    url: '/api/v1/generation-tools/call',
    body: {
      tool_type: 'comfyui',
      server_id: 'local-comfy',
      operation: 'status',
    },
  }])
})

test('admin cloud-file-config update calls backend through shared command JSON', async () => {
  adminRequests = []
  const payload = {
    name: 'object relay',
    priority: 5,
    is_enabled: true,
    config: {
      endpoint: 'tos-cn-beijing.volces.com',
      region: 'cn-beijing',
      bucket: 'assets',
      access_key: 'ak-redacted',
      secret_key: 'sk-redacted',
    },
  }
  const result = await runMovscript([
    'admin',
    'cloud-file-config',
    'update',
    '--server',
    baseURL,
    '--cloud-file-config-id',
    '7',
    '--payload',
    JSON.stringify(payload),
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'admin.cloud_file_config.update')
  assert.equal(result.json.mcpToolName, 'admin_cloud_file_config_update')
  assert.equal(result.json.data.ID, 7)
  assert.equal(result.json.data.name, 'object relay')
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'admin',
    'cloud-file-config',
    'update',
    '--json',
    '--server',
    baseURL,
    '--cloud-file-config-id',
    '7',
    '--payload',
    '<json>',
  ])
  assert.deepEqual(adminRequests, [{
    method: 'PUT',
    url: '/api/v1/admin/cloud-file-configs/7',
    body: payload,
  }])
})

test('admin usage-policy update calls backend through shared command JSON', async () => {
  adminRequests = []
  const payload = {
    mode: 'observe',
    default_usage_credit_limit: 1000,
    default_monthly_credit_limit: 250,
    default_daily_credit_limit: 25,
    alert_thresholds: [50, 80, 100],
    gateway: {
      max_requests_per_minute: 60,
      max_concurrent_requests: 4,
      max_estimated_cost_per_call: 3.5,
    },
  }
  const result = await runMovscript([
    'admin',
    'usage-policy',
    'update',
    '--server',
    baseURL,
    '--payload',
    JSON.stringify(payload),
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'admin.usage_policy.update')
  assert.equal(result.json.mcpToolName, 'admin_usage_policy_update')
  assert.equal(result.json.data.mode, 'observe')
  assert.equal(result.json.data.gateway.max_requests_per_minute, 60)
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'admin',
    'usage-policy',
    'update',
    '--json',
    '--server',
    baseURL,
    '--payload',
    '<json>',
  ])
  assert.deepEqual(adminRequests, [{
    method: 'PUT',
    url: '/api/v1/admin/settings/usage-policy',
    body: payload,
  }])
})

test('admin usage-policy diagnose calls backend through shared command JSON', async () => {
  adminRequests = []
  const result = await runMovscript([
    'admin',
    'usage-policy',
    'diagnose',
    '--server',
    baseURL,
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'admin.usage_policy.diagnose')
  assert.equal(result.json.mcpToolName, 'admin_usage_policy_diagnose')
  assert.equal(result.json.data.status, 'degraded')
  assert.equal(result.json.data.mode, 'enforce')
  assert.equal(result.json.data.enforcement_ready, false)
  assert.equal(result.json.data.runtime.gateway_runtime_enforcement_verified, false)
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'admin',
    'usage-policy',
    'diagnose',
    '--json',
    '--server',
    baseURL,
  ])
  assert.deepEqual(adminRequests, [{
    method: 'GET',
    url: '/api/v1/admin/settings/usage-policy/diagnose',
    body: null,
  }])
})

function runMovscript(args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ['dist/index.cjs', '--', ...args], {
      cwd: cliDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`movscript command timed out: ${args.join(' ')}`))
    }, options.timeoutMs ?? 10_000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (status) => {
      clearTimeout(timeout)
      const expectedStatus = options.expectStatus ?? 0
      try {
        assert.equal(status, expectedStatus, stderr || stdout)
        resolveResult({
          status,
          stdout,
          stderr,
          json: JSON.parse(stdout),
        })
      } catch (error) {
        reject(error)
      }
    })
  })
}

function createTestServer() {
  return createServer((req, res) => {
    if (req.url === '/api/v1/admin/settings/resource-access/profiles' && req.method === 'GET') {
      adminRequests.push({ method: req.method, url: req.url, body: undefined })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        default_profile_id: 'public-tunnel',
        profiles: [{
          id: 'public-tunnel',
          name: 'Local Tunnel',
          enabled: true,
          mode: 'public_tunnel',
          public_base_url: 'https://tunnel.example',
          signing_enabled: true,
          signing_secret_set: true,
          expires_seconds: 120,
          health_check_path: '/healthz',
        }],
      }))
      return
    }
    if (req.url === '/api/v1/admin/settings/resource-access/profiles/public-tunnel' && req.method === 'PUT') {
      readJSONBody(req, (body) => {
        adminRequests.push({ method: req.method, url: req.url, body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          default_profile_id: 'public-tunnel',
          profiles: [{
            id: 'public-tunnel',
            name: body.name,
            enabled: body.enabled,
            mode: body.mode,
            public_base_url: body.public_base_url,
            signing_enabled: body.signing_enabled,
            signing_secret_set: Boolean(body.signing_secret),
            expires_seconds: body.expires_seconds,
            health_check_path: body.health_check_path,
          }],
        }))
      })
      return
    }
    if (req.url === '/api/v1/admin/settings/resource-access/profiles/public-tunnel/test' && req.method === 'POST') {
      readJSONBody(req, (body) => {
        adminRequests.push({ method: req.method, url: req.url, body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: 'ok',
          profile_id: 'public-tunnel',
          mode: 'public_tunnel',
          enabled: true,
          health_url: 'https://tunnel.example/healthz',
          reachable: true,
          status_code: 200,
          content_type: 'application/json',
        }))
      })
      return
    }
    if (req.url === '/api/v1/admin/settings/resource-access/routes/diagnose' && req.method === 'POST') {
      readJSONBody(req, (body) => {
        adminRequests.push({ method: req.method, url: req.url, body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: 'ok',
          ready: true,
          route_id: body.route_id,
          transport: body.transport,
          purpose: body.purpose,
          required_media_type: body.required_media_type,
          default_profile_id: 'public-tunnel',
          profile: {
            id: 'public-tunnel',
            enabled: true,
            mode: 'public_tunnel',
            public_base_url: 'https://tunnel.example',
            signing_enabled: true,
            signing_secret_set: true,
          },
          blockers: [],
          warnings: [],
        }))
      })
      return
    }
    if (req.url === '/api/v1/admin/settings/resource-access/profiles/public-tunnel' && req.method === 'DELETE') {
      readJSONBody(req, (body) => {
        adminRequests.push({ method: req.method, url: req.url, body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          profiles: [],
          default_profile_id: '',
        }))
      })
      return
    }
    if (req.url === '/api/v1/admin/cloud-file-configs/7' && req.method === 'PUT') {
      readJSONBody(req, (body) => {
        adminRequests.push({ method: req.method, url: req.url, body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          ID: 7,
          name: body.name,
          config_type: 'tos',
          priority: body.priority,
          is_enabled: body.is_enabled,
          config: {
            endpoint: body.config?.endpoint,
            region: body.config?.region,
            bucket: body.config?.bucket,
            access_key_set: true,
            secret_key_set: true,
          },
        }))
      })
      return
    }
    if (req.url === '/api/v1/admin/settings/usage-policy' && req.method === 'PUT') {
      readJSONBody(req, (body) => {
        adminRequests.push({ method: req.method, url: req.url, body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(body))
      })
      return
    }
    if (req.url === '/api/v1/admin/settings/usage-policy/diagnose' && req.method === 'GET') {
      adminRequests.push({ method: req.method, url: req.url, body: null })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'degraded',
        mode: 'enforce',
        enforcement_ready: false,
        observable: true,
        configured_limits: {
          gateway_requests_per_minute: true,
        },
        runtime: {
          usage_accounting_available: true,
          policy_document_available: true,
          gateway_runtime_enforcement_verified: false,
        },
        warnings: ['gateway_runtime_enforcement_not_verified'],
        blockers: [],
      }))
      return
    }
    if (req.url === '/api/v1/admin/provider-instances/ai_gateway%3Aprimary/test' && req.method === 'POST') {
      readJSONBody(req, (body) => {
        adminRequests.push({ method: req.method, url: req.url, body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: 'ok',
          provider_instance_id: 'ai_gateway:primary',
          diagnostics: [{
            code: 'connection_ready',
            severity: 'info',
            message: 'Provider instance connection is ready.',
          }],
          secret_visible: false,
        }))
      })
      return
    }
    if (req.url === '/api/v1/admin/provider-instances/blob_storage%3Aminio/config' && req.method === 'PUT') {
      readJSONBody(req, (body) => {
        adminRequests.push({ method: req.method, url: req.url, body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          provider_instance_id: 'blob_storage:minio',
          values: {
            endpoint: body.values?.endpoint,
            access_key_set: Boolean(body.values?.access_key),
            secret_key_set: Boolean(body.values?.secret_key),
          },
        }))
      })
      return
    }
    if (req.url === '/api/v1/admin/provider-instances/blob_storage%3Aminio/config/apply' && req.method === 'POST') {
      readJSONBody(req, (body) => {
        adminRequests.push({ method: req.method, url: req.url, body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: 'applied',
          provider_instance_id: 'blob_storage:minio',
          secret_visible: false,
        }))
      })
      return
    }
    if (req.url === '/api/v1/admin/provider-instances/blob_storage%3Aminio/config/activate' && req.method === 'POST') {
      readJSONBody(req, (body) => {
        adminRequests.push({ method: req.method, url: req.url, body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: 'activated',
          provider_instance_id: 'blob_storage:minio',
          rollout_triggered: true,
        }))
      })
      return
    }
    if (req.url === '/api/v1/generation-tools/call' && req.method === 'POST') {
      readJSONBody(req, (body) => {
        adminRequests.push({ method: req.method, url: req.url, body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: 'ok',
          server: {
            id: 'local-comfy',
            type: 'comfyui',
            enabled: true,
            token_set: true,
          },
          data: {
            system: {
              os: 'test',
            },
          },
        }))
      })
      return
    }
    if ((req.url === '/api/v1/resource-access/resolve' || req.url === '/api/v1/resource-access/check') && req.method === 'POST') {
      readJSONBody(req, (body) => {
        adminRequests.push({ method: req.method, url: req.url, body })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          resource_id: 880,
          media_type: 'image',
          transport: 'public_url',
          profile_id: 'public-tunnel',
          url: 'https://tunnel.example/api/v1/resource-access/resources/880/file?sig=redacted',
          expires_at: '2026-06-29T14:00:00Z',
          ...(req.url.endsWith('/check') ? {
            reachable: true,
            status_code: 200,
            content_type: 'image/png',
            content_length: 1024,
          } : {}),
        }))
      })
      return
    }
    res.writeHead(404)
    res.end()
  })
}

function readJSONBody(req, callback) {
  let body = ''
  req.setEncoding('utf8')
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    callback(JSON.parse(body || '{}'))
  })
}
