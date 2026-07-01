import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let server
let baseURL
let projectRequests = []

before(async () => {
  server = createProjectServiceServer()
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  baseURL = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolveClose) => server.close(resolveClose))
})

test('domain read/query CLI commands inspect project state without a frontend', async () => {
  projectRequests = []
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-cli-domain-read-'))

  const overview = await runMovscript([
    'domain',
    'overview',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--json',
  ])
  assert.equal(overview.status, 0)
  assert.equal(overview.json.schema, 'movscript.command_result.v1')
  assert.equal(overview.json.commandId, 'domain.overview')
  assert.equal(overview.json.mcpToolName, 'domain_overview')
  assert.deepEqual(overview.json.contract.permissions, ['project:read'])
  assert.equal(overview.json.data.schema, 'movscript.workspace-overview.v1')
  assert.deepEqual(overview.json.debug.cli_argv, [
    'movscript',
    'domain',
    'overview',
    '--json',
    '--project-dir',
    projectDir,
    '--server',
    baseURL,
  ])

  const query = await runMovscript([
    'domain',
    'query',
    'entities',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--entity-kind',
    'content_unit',
    '--query',
    'hero',
    '--limit',
    '3',
    '--json',
  ])
  assert.equal(query.status, 0)
  assert.equal(query.json.commandId, 'domain.query.entities')
  assert.equal(query.json.data.schema, 'movscript.project-entities-query-result.v1')
  assert.equal(query.json.data.query.entityKind, 'content_unit')
  assert.equal(query.json.data.query.limit, 3)
  assert.deepEqual(query.json.debug.cli_argv, [
    'movscript',
    'domain',
    'query',
    'entities',
    '--json',
    '--project-dir',
    projectDir,
    '--server',
    baseURL,
    '--entity-kind',
    'content_unit',
    '--query',
    'hero',
    '--limit',
    '3',
  ])

  const context = await runMovscript([
    'domain',
    'read',
    'project-context',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--json',
  ])
  assert.equal(context.status, 0)
  assert.equal(context.json.commandId, 'domain.read.project_context_snapshot')
  assert.equal(context.json.mcpToolName, 'domain_read_project_context_snapshot')
  assert.equal(context.json.data.schema, 'movscript.project_context_snapshot.v1')
  assert.equal(context.json.data.style_reference_resource_ids[0], 101)

  const regeneration = await runMovscript([
    'domain',
    'regeneration',
    'plan',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--target',
    'content_unit:cu_hero',
    '--json',
  ])
  assert.equal(regeneration.status, 0)
  assert.equal(regeneration.json.commandId, 'domain.regeneration.plan')
  assert.equal(regeneration.json.data.schema, 'movscript.workspace-regeneration-plan.v1')
  assert.equal(regeneration.json.data.surface.url.includes('source=domain_regeneration_plan'), true)

  const workPlan = await runMovscript([
    'domain',
    'read',
    'production-work-plan',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--json',
  ])
  assert.equal(workPlan.status, 0)
  assert.equal(workPlan.json.commandId, 'domain.read.production_work_plan')
  assert.equal(workPlan.json.mcpToolName, 'domain_read_production_work_plan')
  assert.equal(workPlan.json.data.schema, 'movscript.production_work_plan.v1')
  assert.equal(workPlan.json.data.items[0].id, 'work_hero')

  assert.deepEqual(projectRequests.map((request) => request.url), [
    '/v1/project/source/overview',
    '/v1/project/entities/query',
    '/v1/project/resources/view',
    '/v1/project/source/regeneration-plan',
    '/v1/project/source/production-work-plan',
  ])
  assert.deepEqual(projectRequests[0].body, { projectDir })
  assert.deepEqual(projectRequests[1].body.query, {
    entityKind: 'content_unit',
    query: 'hero',
    limit: 3,
  })
  assert.equal(projectRequests[2].body.kind, 'project-context')
  assert.deepEqual(projectRequests[3].body, { projectDir })
  assert.deepEqual(projectRequests[4].body, { projectDir })
})

test('domain source CLI commands write through Project Service without a frontend', async () => {
  projectRequests = []
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-cli-domain-source-'))

  const standards = await runMovscript([
    'domain',
    'source',
    'project-standards',
    'upsert',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--project-uid',
    'prj_cli_source',
    '--project-style',
    JSON.stringify({ visual_style: 'documentary realism' }),
    '--json',
  ])
  assert.equal(standards.status, 0)
  assert.equal(standards.json.commandId, 'domain.source.project_standards.upsert')
  assert.equal(standards.json.mcpToolName, 'domain_upsert_project_standards')
  assert.deepEqual(standards.json.contract.permissions, ['project:read', 'project:write'])
  assert.equal(standards.json.data.endpoint, '/v1/project/standards/upsert')
  assert.deepEqual(standards.json.debug.cli_argv, [
    'movscript',
    'domain',
    'source',
    'project-standards',
    'upsert',
    '--json',
    '--project-dir',
    projectDir,
    '--server',
    baseURL,
    '--project-uid',
    'prj_cli_source',
    '--project-style',
    '<json>',
  ])

  const setting = await runMovscript([
    'domain',
    'source',
    'setting',
    'upsert',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--project-uid',
    'prj_cli_source',
    '--payload',
    JSON.stringify({ id: 'hero', title: 'Hero', kind: 'character' }),
    '--json',
  ])
  assert.equal(setting.status, 0)
  assert.equal(setting.json.commandId, 'domain.source.setting.upsert')
  assert.equal(setting.json.data.endpoint, '/v1/project/settings/create')
  assert.equal(setting.json.data.input.id, 'hero')

  const scriptRead = await runMovscript([
    'domain',
    'source',
    'script',
    'read',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--record',
    JSON.stringify({ id: 'script_main', path: 'scripts/main/script.md' }),
    '--json',
  ])
  assert.equal(scriptRead.status, 0)
  assert.equal(scriptRead.json.commandId, 'domain.source.script.read')
  assert.deepEqual(scriptRead.json.contract.permissions, ['project:read'])
  assert.equal(scriptRead.json.data.endpoint, '/v1/project/scripts/source/read')
  assert.equal(scriptRead.json.data.sourceText, '# Script')

  const promptUpdate = await runMovscript([
    'domain',
    'source',
    'content-unit',
    'prompt',
    'update',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--project-uid',
    'prj_cli_source',
    '--target-path',
    'content_units/cu_hero/content_unit.json',
    '--content-unit-id',
    'cu_hero',
    '--edit-prompt',
    JSON.stringify({ text: 'make it cinematic' }),
    '--json',
  ])
  assert.equal(promptUpdate.status, 0)
  assert.equal(promptUpdate.json.commandId, 'domain.source.content_unit.prompt.update')
  assert.equal(promptUpdate.json.data.status, 'updated')
  assert.equal(promptUpdate.json.data.result.endpoint, '/v1/project/content-units/edit-prompt/update')
  assert.equal(promptUpdate.json.data.surface.kind, 'browser_url')
  assert.equal(promptUpdate.json.data.surface.url.includes('contentUnitId=cu_hero'), true)
  assert.equal(promptUpdate.json.data.surface.url.includes('mode=edit'), true)

  const deleted = await runMovscript([
    'domain',
    'source',
    'entity',
    'delete',
    '--server',
    baseURL,
    '--project-dir',
    projectDir,
    '--project-uid',
    'prj_cli_source',
    '--entity',
    JSON.stringify({ entityKind: 'content_unit', id: 'cu_hero', path: 'content_units/cu_hero/content_unit.json' }),
    '--json',
  ])
  assert.equal(deleted.status, 0)
  assert.equal(deleted.json.commandId, 'domain.source.entity.delete')
  assert.equal(deleted.json.data.status, 'deleted')

  assert.deepEqual(projectRequests.map((request) => request.url), [
    '/v1/project/locator/resolve',
    '/api/v1/projects/ensure',
    '/api/v1/project-data/spaces',
    '/v1/project/standards/upsert',
    '/v1/project/locator/resolve',
    '/api/v1/projects/ensure',
    '/api/v1/project-data/spaces',
    '/v1/project/settings/create',
    '/v1/project/scripts/source/read',
    '/v1/project/locator/resolve',
    '/api/v1/projects/ensure',
    '/api/v1/project-data/spaces',
    '/v1/project/content-units/edit-prompt/update',
    '/v1/project/locator/resolve',
    '/api/v1/projects/ensure',
    '/api/v1/project-data/spaces',
    '/v1/project/entities/delete',
  ])
  assert.deepEqual(requestByURL('/v1/project/standards/upsert').body.projectStyle, { visual_style: 'documentary realism' })
  assert.equal(requestByURL('/v1/project/settings/create').body.title, 'Hero')
  assert.equal(requestByURL('/v1/project/scripts/source/read').body.record.id, 'script_main')
  assert.equal(requestByURL('/v1/project/content-units/edit-prompt/update').body.targetPath, 'content_units/cu_hero/content_unit.json')
  assert.equal(requestByURL('/v1/project/entities/delete').body.entity.id, 'cu_hero')
})

test('domain candidate CLI commands make candidate creation, selection, and adoption explicit', async () => {
  projectRequests = []
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-cli-domain-'))
  const outputs = [{ kind: 'image', resource_id: 101, mime_type: 'image/png' }]

  const created = await runMovscript([
    'domain',
    'candidate',
    'create-content',
    '--server',
    baseURL,
    '--token',
    'test-token',
    '--project-dir',
    projectDir,
    '--project-uid',
    'prj_cli_domain',
    '--content-unit-id',
    'cu_hero',
    '--candidate-id',
    'candidate_image_1',
    '--source',
    'generation',
    '--outputs',
    JSON.stringify(outputs),
    '--json',
  ])
  assert.equal(created.status, 0)
  assert.equal(created.json.schema, 'movscript.command_result.v1')
  assert.equal(created.json.commandId, 'domain.candidate.create_content')
  assert.equal(created.json.mcpToolName, 'domain_create_content_candidate')
  assert.equal(created.json.contract.family, 'domain')
  assert.equal(created.json.data.status, 'ok')
  assert.equal(created.json.data.candidate_created, true)
  assert.equal(created.json.data.will_auto_select, false)
  assert.equal(created.json.data.requires_user_adoption, true)
  assert.equal(created.json.data.result.record.id, 'candidate_image_1')
  assert.deepEqual(created.json.debug.cli_argv, [
    'movscript',
    'domain',
    'candidate',
    'create-content',
    '--json',
    '--project-dir',
    projectDir,
    '--server',
    baseURL,
    '--token',
    '<redacted>',
    '--project-uid',
    'prj_cli_domain',
    '--content-unit-id',
    'cu_hero',
    '--candidate-id',
    'candidate_image_1',
    '--source',
    'generation',
    '--outputs',
    '<json>',
  ])

  const selected = await runMovscript([
    'domain',
    'candidate',
    'select-content-unit',
    '--server',
    baseURL,
    '--token',
    'test-token',
    '--project-dir',
    projectDir,
    '--project-uid',
    'prj_cli_domain',
    '--content-unit-id',
    'cu_hero',
    '--candidate-id',
    'candidate_image_1',
    '--resource-id',
    '101',
    '--reason',
    'approved in CLI review',
    '--json',
  ])
  assert.equal(selected.status, 0)
  assert.equal(selected.json.commandId, 'domain.candidate.select_content_unit')
  assert.equal(selected.json.mcpToolName, 'domain_select_content_unit_candidate')
  assert.equal(selected.json.data.adoption, 'selection')
  assert.equal(selected.json.data.requires_user_adoption, false)
  assert.equal(selected.json.data.result.record.selection.candidate_id, 'candidate_image_1')

  const adopted = await runMovscript([
    'domain',
    'candidate',
    'decide-content-unit',
    '--server',
    baseURL,
    '--token',
    'test-token',
    '--project-dir',
    projectDir,
    '--project-uid',
    'prj_cli_domain',
    '--content-unit-id',
    'cu_hero',
    '--candidate-id',
    'candidate_image_1',
    '--resource-id',
    '101',
    '--decision',
    'adopt',
    '--reason',
    'human reviewed',
    '--json',
  ])
  assert.equal(adopted.status, 0)
  assert.equal(adopted.json.commandId, 'domain.candidate.decide_content_unit')
  assert.equal(adopted.json.mcpToolName, 'domain_decide_content_unit_candidate')
  assert.equal(adopted.json.data.adoption, 'adopt')
  assert.equal(adopted.json.data.requires_user_adoption, false)
  assert.equal(adopted.json.data.result.record.selection.candidate_id, 'candidate_image_1')

  assert.deepEqual(projectRequests.map((request) => request.url), [
    '/v1/project/locator/resolve',
    '/api/v1/projects/ensure',
    '/api/v1/project-data/spaces',
    '/v1/project/locator/resolve',
    '/v1/project/content-candidates/create',
    '/v1/project/locator/resolve',
    '/api/v1/projects/ensure',
    '/api/v1/project-data/spaces',
    '/v1/project/locator/resolve',
    '/v1/project/content-unit-candidates/select',
    '/v1/project/locator/resolve',
    '/api/v1/projects/ensure',
    '/api/v1/project-data/spaces',
    '/v1/project/locator/resolve',
    '/v1/project/content-unit-candidates/decide',
  ])
  assert.equal(projectRequests[4].body.input.contentUnitId, 'cu_hero')
  assert.equal(projectRequests[4].body.input.candidateId, 'candidate_image_1')
  assert.equal(projectRequests[4].body.decisionStore.projectUid, 'prj_cli_domain')
  assert.equal(projectRequests[9].body.input.resourceId, 101)
  assert.equal(projectRequests[14].body.input.decision, 'adopt')
})

test('domain provider remote asset CLI commands query backend without a frontend', async () => {
  projectRequests = []

  const groups = await runMovscript([
    'domain',
    'provider',
    'remote-asset-groups',
    'query',
    '--server',
    baseURL,
    '--provider',
    'yunwu_gateway',
    '--model',
    'seedance-2',
    '--provider-scope-id',
    'prj_provider',
    '--json',
  ])
  assert.equal(groups.status, 0)
  assert.equal(groups.json.commandId, 'domain.provider.remote_asset_groups.query')
  assert.equal(groups.json.mcpToolName, 'domain_query_remote_asset_groups')
  assert.deepEqual(groups.json.contract.permissions, ['project:read', 'provider:read'])
  assert.equal(groups.json.data.provider, 'yunwu_gateway')
  assert.equal(groups.json.data.groups[0].id, 'group_main')
  assert.deepEqual(groups.json.debug.cli_argv, [
    'movscript',
    'domain',
    'provider',
    'remote-asset-groups',
    'query',
    '--json',
    '--server',
    baseURL,
    '--provider-scope-id',
    'prj_provider',
    '--provider',
    'yunwu_gateway',
    '--model',
    'seedance-2',
  ])

  const assets = await runMovscript([
    'domain',
    'provider',
    'remote-assets',
    'query',
    '--server',
    baseURL,
    '--provider',
    'yunwu_gateway',
    '--group-id',
    'group_main',
    '--json',
  ])
  assert.equal(assets.status, 0)
  assert.equal(assets.json.commandId, 'domain.provider.remote_assets.query')
  assert.equal(assets.json.mcpToolName, 'domain_query_remote_assets')
  assert.equal(assets.json.data.assets[0].asset_uri, 'asset://yunwu/group_main/hero')

  assert.deepEqual(projectRequests.map((request) => request.url), [
    '/api/v1/provider-assets/providers/yunwu_gateway/groups?model=seedance-2&project_id=prj_provider',
    '/api/v1/provider-assets/providers/yunwu_gateway/groups/group_main/assets',
  ])
})

function runMovscript(args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const env = { ...process.env }
    delete env.MOVSCRIPT_DATA_SERVICE_TOKEN
    const child = spawn(process.execPath, ['dist/index.cjs', '--', ...args], {
      cwd: cliDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (status) => {
      const expectedStatus = options.expectStatus ?? 0
      try {
        assert.equal(status, expectedStatus, stderr || stdout)
        resolveRun({
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

function requestByURL(url) {
  const request = projectRequests.find((candidate) => candidate.url === url)
  assert.ok(request, `expected request for ${url}`)
  return request
}

function createProjectServiceServer() {
  return createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      const parsedBody = body ? JSON.parse(body) : {}
      if (req.method === 'GET' && req.url?.endsWith('/provider-assets/providers/yunwu_gateway/groups?model=seedance-2&project_id=prj_provider')) {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, {
          provider: 'yunwu_gateway',
          groups: [{ id: 'group_main', name: 'Main Group' }],
        })
        return
      }
      if (req.method === 'GET' && req.url?.endsWith('/provider-assets/providers/yunwu_gateway/groups/group_main/assets')) {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, {
          provider: 'yunwu_gateway',
          group_id: 'group_main',
          assets: [{ id: 'hero', asset_uri: 'asset://yunwu/group_main/hero' }],
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/locator/resolve') {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, {
          locator: {
            workspaceDir: parsedBody.workspaceDir,
            projectDir: parsedBody.projectDir,
            projectUid: parsedBody.projectUid,
            projectTitle: 'CLI Domain Project',
          },
        })
        return
      }
      if (req.method === 'POST' && (req.url === '/projects/ensure' || req.url === '/api/v1/projects/ensure')) {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, {
          project: {
            project_uid: parsedBody.project_uid,
            name: parsedBody.name,
          },
        })
        return
      }
      if (req.method === 'POST' && (req.url === '/project-data/spaces' || req.url === '/api/v1/project-data/spaces')) {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, {
          data_space: {
            project_uid: parsedBody.project_uid,
            title: parsedBody.title,
          },
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/source/overview') {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, {
          overview: {
            schema: 'movscript.workspace-overview.v1',
            status: 'ready',
            summary: { issues: 0 },
          },
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/entities/query') {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, {
          result: {
            schema: 'movscript.project-entities-query-result.v1',
            query: parsedBody.query,
            items: [{ entityKind: parsedBody.query?.entityKind, id: 'cu_hero' }],
          },
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/resources/view') {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, {
          schema: 'movscript.project-resource-view.v1',
          projectDir: parsedBody.projectDir,
          kind: parsedBody.kind,
          items: [{
            schema: 'movscript.project_context_snapshot.v1',
            kind: 'project_context_snapshot',
            style_reference_resource_ids: [101],
          }],
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/source/regeneration-plan') {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, {
          regenerationPlan: {
            schema: 'movscript.workspace-regeneration-plan.v1',
            status: 'ready',
            affected_content_units: ['cu_hero'],
          },
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/source/production-work-plan') {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, {
          productionWorkPlan: {
            schema: 'movscript.production_work_plan.v1',
            items: [{ id: 'work_hero', target: 'content_unit:cu_hero' }],
          },
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/scripts/source/read') {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, {
          result: {
            schema: 'movscript.project-source-operation-result.v1',
            endpoint: req.url,
            sourceText: '# Script',
            input: sourceOperationBody(parsedBody),
          },
        })
        return
      }
      if (req.method === 'POST' && [
        '/v1/project/standards/upsert',
        '/v1/project/settings/create',
        '/v1/project/content-units/edit-prompt/update',
        '/v1/project/entities/delete',
      ].includes(req.url)) {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, {
          result: req.url === '/v1/project/entities/delete'
            ? undefined
            : {
                schema: 'movscript.project-source-operation-result.v1',
                endpoint: req.url,
                status: 'ok',
                input: sourceOperationBody(parsedBody),
                writtenPaths: ['source.json'],
              },
        })
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/content-candidates/create') {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, candidateEnvelope('movscript.project-content-candidate-create.v1', parsedBody, {
          candidate_id: parsedBody.input?.candidateId,
        }))
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/content-unit-candidates/select') {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, candidateEnvelope('movscript.project-content-unit-candidate-select.v1', parsedBody, {
          selection: {
            candidate_id: parsedBody.input?.candidateId,
            resource_id: parsedBody.input?.resourceId,
          },
        }))
        return
      }
      if (req.method === 'POST' && req.url === '/v1/project/content-unit-candidates/decide') {
        projectRequests.push({ method: req.method, url: req.url, body: parsedBody })
        writeJSON(res, candidateEnvelope('movscript.project-content-unit-candidate-decide.v1', parsedBody, {
          decision: parsedBody.input?.decision,
          selection: parsedBody.input?.decision === 'adopt'
            ? {
                candidate_id: parsedBody.input?.candidateId,
                resource_id: parsedBody.input?.resourceId,
              }
            : undefined,
        }))
        return
      }
      res.writeHead(404)
      res.end()
    })
  })
}

function candidateEnvelope(schema, body, extraRecord = {}) {
  const record = {
    id: body.input?.candidateId,
    content_unit_id: body.input?.contentUnitId,
    outputs: body.input?.outputs,
    ...extraRecord,
  }
  return {
    schema,
    projectDir: body.projectDir,
    result: {
      record,
    },
  }
}

function sourceOperationBody(body) {
  const { projectDir: _projectDir, ...input } = body
  return input
}

function writeJSON(res, payload) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}
