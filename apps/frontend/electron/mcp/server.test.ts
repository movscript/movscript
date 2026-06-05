import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { applyWorkspaceReview, attachAssetSlotCandidate, attachKeyframeCandidate, getWorkspaceModelContract, listModels, listTools, locateScriptPassages, normalizeBackendHTTPErrorForMCP, queryCreativeReferences, queryProductionContext, readResource, setMCPAPIBaseURL, summarizeModelContractForAgent, updateMCPContextSnapshot } from './server'
import { handleJSONRPC } from './rpc/jsonRpc'

const buildGenerationModelParamRules: any = undefined
const buildGenerationParamValidationAudit: any = undefined
const callComfyUITool: any = undefined
const callWebUITool: any = undefined
const createGenerationJob: any = undefined
const normalizeGenerationExtraParams: any = undefined
const preflightGenerationParams: any = undefined
const setMCPGenerationToolsSettings: any = undefined
const testMCPGenerationToolServer: any = undefined
const waitGenerationJobs: any = undefined

test('MCP initialize request returns a JSON-RPC result for Codex streamable HTTP', async () => {
  const response = await handleJSONRPC({
    jsonrpc: '2.0',
    id: 'codex-init',
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      clientInfo: { name: 'codex', version: '0.1.0' },
      capabilities: {},
    },
  })

  assert.equal(response?.jsonrpc, '2.0')
  assert.equal(response?.id, 'codex-init')
  assert.deepEqual((response?.result as Record<string, unknown>)?.serverInfo, {
    name: 'movscript-frontend-mcp',
    version: '0.1.0',
  })
})

test('MCP initialized notification does not produce a JSON-RPC response', async () => {
  const response = await handleJSONRPC({
    jsonrpc: '2.0',
    method: 'initialized',
    params: {},
  })

  assert.equal(response, undefined)
})

test('MCP discovery exposes MovScript resources, shot library, query, and generation capabilities', async () => {
  const toolsResponse = await handleJSONRPC({
    jsonrpc: '2.0',
    id: 'tools',
    method: 'tools/list',
  })
  const tools = ((toolsResponse?.result as any)?.tools ?? []).map((tool: any) => tool.name)
  assert.ok(tools.includes('movscript_script_list'))
  assert.ok(tools.includes('movscript_resource_library_query'))
  assert.ok(tools.includes('movscript_resource_video_extract_frames'))
  assert.ok(tools.includes('movscript_resource_image_annotate'))
  assert.ok(tools.includes('movscript_resource_upload'))
  assert.ok(tools.includes('movscript_shot_library_query'))
  assert.ok(tools.includes('movscript_external_resource_source_list'))
  assert.ok(tools.includes('movscript_external_resource_search'))
  assert.ok(tools.includes('movscript_creative_reference_query'))
  assert.ok(tools.includes('movscript_asset_slot_query'))
  assert.ok(tools.includes('movscript_production_context_query'))
  assert.ok(tools.includes('generation_image_generate'))
  assert.ok(tools.includes('generation_video_generate'))

  const resourcesResponse = await handleJSONRPC({
    jsonrpc: '2.0',
    id: 'resources',
    method: 'resources/list',
  })
  const resources = ((resourcesResponse?.result as any)?.resources ?? []).map((resource: any) => resource.uri)
  assert.ok(resources.includes('movscript://projects'))
  assert.ok(resources.includes('movscript://resource-library'))
  assert.ok(resources.includes('movscript://shot-library'))
  assert.ok(resources.includes('movscript://external-resources'))
})

test('normalizeBackendHTTPErrorForMCP preserves structured generation validation details', () => {
  const body = {
    error: 'parameter "duration" must be one of [5, 10]',
    code: 'INVALID_PARAMETER_OPTION',
    field: 'duration',
    allowed_values: ['5', '10'],
    suggested_fix: { duration: '5' },
    details: {
      code: 'INVALID_PARAMETER_OPTION',
      message: 'parameter "duration" must be one of [5, 10]',
      field: 'duration',
      allowed_values: ['5', '10'],
      suggested_fix: { duration: '5' },
    },
  }

  assert.deepEqual(normalizeBackendHTTPErrorForMCP('POST', '/jobs', 400, body), {
    type: 'backend_http_error',
    method: 'POST',
    path: '/jobs',
    status: 400,
    body,
    code: 'INVALID_PARAMETER_OPTION',
    field: 'duration',
    allowed_values: ['5', '10'],
    suggested_fix: { duration: '5' },
    details: body.details,
  })
})

test('normalizeBackendHTTPErrorForMCP preserves null suggested fixes for param removal', () => {
  const body = {
    error: 'parameters "duration" and "frames" cannot be used together',
    code: 'INVALID_PARAMETER_COMBINATION',
    field: 'duration',
    suggested_fix: { frames: null },
  }

  assert.deepEqual(normalizeBackendHTTPErrorForMCP('POST', '/jobs', 400, body), {
    type: 'backend_http_error',
    method: 'POST',
    path: '/jobs',
    status: 400,
    body,
    code: 'INVALID_PARAMETER_COMBINATION',
    field: 'duration',
    suggested_fix: { frames: null },
  })
})

test('normalizeBackendHTTPErrorForMCP preserves structured input count validation details', () => {
  const body = {
    error: 'image generation input count is above the model maximum',
    code: 'INVALID_INPUT_COUNT',
    field: 'image',
    required_min: 1,
    allowed_max: 4,
    actual_count: 5,
    details: {
      code: 'INVALID_INPUT_COUNT',
      message: 'image generation input count is above the model maximum',
      field: 'image',
      required_min: 1,
      allowed_max: 4,
      actual_count: 5,
    },
  }

  assert.deepEqual(normalizeBackendHTTPErrorForMCP('POST', '/jobs', 400, body), {
    type: 'backend_http_error',
    method: 'POST',
    path: '/jobs',
    status: 400,
    body,
    code: 'INVALID_INPUT_COUNT',
    field: 'image',
    required_min: 1,
    allowed_max: 4,
    actual_count: 5,
    details: body.details,
  })
})

test('normalizeBackendHTTPErrorForMCP preserves typed allowed values and suggested fixes', () => {
  const body = {
    error: 'parameter "frames" must match one of the declared schema enum values',
    code: 'INVALID_PARAMETER_OPTION',
    field: 'frames',
    allowed_values: [29, 33, 37],
    suggested_fix: { frames: 29 },
    details: {
      code: 'INVALID_PARAMETER_OPTION',
      message: 'parameter "frames" must match one of the declared schema enum values',
      field: 'frames',
      allowed_values: [29, 33, 37],
      suggested_fix: { frames: 29 },
    },
  }

  assert.deepEqual(normalizeBackendHTTPErrorForMCP('POST', '/jobs', 400, body), {
    type: 'backend_http_error',
    method: 'POST',
    path: '/jobs',
    status: 400,
    body,
    code: 'INVALID_PARAMETER_OPTION',
    field: 'frames',
    allowed_values: [29, 33, 37],
    suggested_fix: { frames: 29 },
    details: body.details,
  })
})

test.skip('generation MCP tool descriptions expose versioned agent contracts', () => {
  const tools = listTools()
  const listModels = tools.find((tool) => tool.name === 'generation_model_list')
  const createJob = tools.find((tool) => tool.name === 'generation_job_create')
  const waitJobs = tools.find((tool) => tool.name === 'generation_job_wait')
  const attachCandidate = tools.find((tool) => tool.name === 'candidate_asset_slot_attach')
  const attachKeyframe = tools.find((tool) => tool.name === 'candidate_keyframe_attach')
  const staticListModels = loadStaticCatalogTool('list-models.tool.json')
  const staticCreateJob = loadStaticCatalogTool('create-job.tool.json')
  const staticWaitJobs = loadStaticCatalogTool('wait-jobs.tool.json')
  const staticAttachCandidate = loadStaticCatalogTool('attach-asset-slot-candidate.tool.json')
  const staticAttachKeyframe = loadStaticCatalogTool('attach-keyframe-candidate.tool.json')
  assert.ok(listModels)
  assert.ok(createJob)
  assert.ok(waitJobs)
  assert.ok(attachCandidate)
  assert.ok(attachKeyframe)
  assert.match(listModels.description, /model_contracts/)
  assert.match(listModels.description, /contract_version 1/)
  assert.match(listModels.description, /input_requirements/)
  assert.match(listModels.description, /supported_param_keys/)
  assert.equal(listModels.inputSchema.properties?.feature, undefined)
  assert.equal(listModels.inputSchema.properties?.feature_key, undefined)
  assert.ok(listModels.inputSchema.properties?.provider_variants)
  assert.ok(listModels.inputSchema.properties?.include_provider_variants)
  assert.ok(listModels.outputSchema?.properties?.count)
  assert.ok(listModels.outputSchema?.properties?.queries)
  assert.ok(listModels.outputSchema?.properties?.model_contracts)
  assert.ok(listModels.outputSchema?.properties?.models)
  assert.ok((listModels.outputSchema?.properties?.model_contracts as any)?.items?.properties?.model_id)
  assert.equal((listModels.outputSchema?.properties?.model_contracts as any)?.items?.properties?.model_config_id, undefined)
  assert.ok((listModels.outputSchema?.properties?.model_contracts as any)?.items?.properties?.logical_model_id)
  assert.ok((listModels.outputSchema?.properties?.model_contracts as any)?.items?.properties?.capabilities)
  assert.ok((listModels.outputSchema?.properties?.model_contracts as any)?.items?.properties?.input_requirements)
  assert.ok((listModels.outputSchema?.properties?.model_contracts as any)?.items?.properties?.supported_param_keys)
  assert.ok((listModels.outputSchema?.properties?.model_contracts as any)?.items?.properties?.supported_params)
  assert.match(createJob.description, /param_validation audit_version 1/)
  assert.match(createJob.description, /input_preflight_errors/)
  assert.match(createJob.description, /single-output/)
  assert.match(createJob.description, /output_count/)
  const createJobProperties = schemaProperties(createJob.inputSchema)
  assert.match(schemaDescription(createJobProperties.extra_params), /param_validation audit_version 1/)
  assert.match(schemaDescription(createJobProperties.input_resource_ids), /input_preflight_errors/)
  assert.ok(createJob.inputSchema.properties?.job_type)
  assert.ok(createJob.inputSchema.properties?.input_resource_ids)
  assert.ok(createJob.inputSchema.properties?.reference_type)
  assert.ok(createJob.inputSchema.properties?.aspect_ratio)
  assert.ok(createJob.inputSchema.properties?.duration)
  assert.ok(createJob.inputSchema.properties?.output_count)
  assert.ok(createJob.inputSchema.properties?.outputCount)
  assert.equal(createJob.inputSchema.properties?.model_config_id, undefined)
  assert.ok(createJob.outputSchema?.properties?.status)
  assert.ok(createJob.outputSchema?.properties?.job)
  assert.ok(createJob.outputSchema?.properties?.jobId)
  assert.ok(createJob.outputSchema?.properties?.jobIds)
  assert.ok(createJob.outputSchema?.properties?.jobs)
  assert.ok(createJob.outputSchema?.properties?.monitor)
  assert.ok(createJob.outputSchema?.properties?.output_resource)
  assert.ok(createJob.outputSchema?.properties?.output_resource_id)
  assert.ok(createJob.outputSchema?.properties?.output_resources)
  assert.ok(createJob.outputSchema?.properties?.output_resource_ids)
  assert.ok(createJob.outputSchema?.properties?.param_validation)
  assert.match(attachCandidate.description, /reviewable candidate/)
  assert.match(attachCandidate.description, /does not accept, select, bind, or lock/)
  assert.ok(attachCandidate.inputSchema.properties?.asset_slot_id)
  assert.equal((attachCandidate.inputSchema.properties?.asset_slot_id as any)?.minimum, 1)
  assert.ok(attachCandidate.inputSchema.properties?.assetSlotId)
  assert.ok(attachCandidate.inputSchema.properties?.resource_id)
  assert.equal((attachCandidate.inputSchema.properties?.resource_id as any)?.minimum, 1)
  assert.ok(attachCandidate.inputSchema.properties?.resourceId)
  assert.ok(attachCandidate.inputSchema.properties?.output_resource_id)
  assert.ok(attachCandidate.inputSchema.properties?.outputResourceId)
  assert.equal((attachCandidate.inputSchema.properties?.outputResourceId as any)?.minimum, 1)
  assert.ok(attachCandidate.inputSchema.properties?.output_resource_ids)
  assert.ok(attachCandidate.inputSchema.properties?.outputResourceIds)
  assert.deepEqual(schemaShapeWithoutDescriptions(attachCandidate.inputSchema.allOf), [
    { anyOf: [{ required: ['asset_slot_id'] }, { required: ['assetSlotId'] }] },
    { anyOf: [
      { required: ['resource_id'] },
      { required: ['resourceId'] },
      { required: ['output_resource_id'] },
      { required: ['outputResourceId'] },
      { required: ['resource_ids'] },
      { required: ['resourceIds'] },
      { required: ['output_resource_ids'] },
      { required: ['outputResourceIds'] },
    ] },
  ])
  assert.ok(attachCandidate.outputSchema?.properties?.candidate)
  assert.ok(attachCandidate.outputSchema?.properties?.candidates)
  assert.match(attachKeyframe.description, /reviewable candidate/)
  assert.match(attachKeyframe.description, /original target keyframe/)
  assert.match(attachKeyframe.description, /Do not pass an existing generated candidate keyframe as the target/)
  assert.match(attachKeyframe.description, /does not accept, select, bind, or lock/)
  assert.ok(attachKeyframe.inputSchema.properties?.keyframe_id)
  assert.equal((attachKeyframe.inputSchema.properties?.keyframe_id as any)?.minimum, 1)
  assert.ok(attachKeyframe.inputSchema.properties?.keyframeId)
  assert.ok(attachKeyframe.inputSchema.properties?.target_keyframe_id)
  assert.equal((attachKeyframe.inputSchema.properties?.target_keyframe_id as any)?.minimum, 1)
  assert.ok(attachKeyframe.inputSchema.properties?.targetKeyframeId)
  assert.match(schemaDescription(attachKeyframe.inputSchema.properties?.target_keyframe_id), /original target keyframe/)
  assert.match(schemaDescription(attachKeyframe.inputSchema.properties?.target_keyframe_id), /Do not pass the generated candidate keyframe ID/)
  assert.ok(attachKeyframe.inputSchema.properties?.resource_id)
  assert.equal((attachKeyframe.inputSchema.properties?.resource_id as any)?.minimum, 1)
  assert.ok(attachKeyframe.inputSchema.properties?.resourceId)
  assert.ok(attachKeyframe.inputSchema.properties?.output_resource_id)
  assert.ok(attachKeyframe.inputSchema.properties?.outputResourceId)
  assert.equal((attachKeyframe.inputSchema.properties?.outputResourceId as any)?.minimum, 1)
  assert.ok(attachKeyframe.inputSchema.properties?.output_resource_ids)
  assert.ok(attachKeyframe.inputSchema.properties?.outputResourceIds)
  assert.deepEqual(schemaShapeWithoutDescriptions(attachKeyframe.inputSchema.allOf), [
    { anyOf: [{ required: ['keyframe_id'] }, { required: ['keyframeId'] }, { required: ['target_keyframe_id'] }, { required: ['targetKeyframeId'] }] },
    { anyOf: [
      { required: ['resource_id'] },
      { required: ['resourceId'] },
      { required: ['output_resource_id'] },
      { required: ['outputResourceId'] },
      { required: ['resource_ids'] },
      { required: ['resourceIds'] },
      { required: ['output_resource_ids'] },
      { required: ['outputResourceIds'] },
    ] },
  ])
  assert.ok(attachKeyframe.outputSchema?.properties?.candidate)
  assert.ok(attachKeyframe.outputSchema?.properties?.candidates)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.audit_version)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.model_contract_loaded)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.params_schema_loaded)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.params_schema_rule_count)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.provided_extra_params)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.dropped_top_level_params)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.extra_params_parse_error)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.preflight_errors)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.input_preflight_errors)
  assert.match(waitJobs.description, /instead of repeatedly calling generation_job_get/)
  assert.ok(waitJobs.inputSchema.properties?.jobIds)
  assert.ok(waitJobs.inputSchema.properties?.jobId)
  assert.ok(waitJobs.inputSchema.properties?.mode)
  assert.ok(waitJobs.inputSchema.properties?.timeout_ms)
  assert.ok(waitJobs.outputSchema?.properties?.completed)
  assert.ok(waitJobs.outputSchema?.properties?.pending)
  assert.ok(waitJobs.outputSchema?.properties?.failed)
  assert.ok(waitJobs.outputSchema?.properties?.cancelled)
  assert.ok(waitJobs.outputSchema?.properties?.output_resource_ids)

  for (const field of ['capability', 'provider_variants', 'include_provider_variants']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(listModels.inputSchema.properties?.[field]),
      schemaShapeWithoutDescriptions(staticListModels.inputSchema.properties?.[field]),
      `generation_model_list ${field} schema should match the static agent catalog`,
    )
  }
  for (const field of ['count', 'queries', 'model_contracts', 'models']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(listModels.outputSchema?.properties?.[field]),
      schemaShapeWithoutDescriptions(staticListModels.outputSchema?.properties?.[field]),
      `generation_model_list ${field} output schema should match the static agent catalog`,
    )
  }
  for (const field of ['title', 'job_type', 'model_id', 'input_resource_ids', 'reference_type', 'aspect_ratio', 'duration', 'output_count', 'outputCount', 'feature_key', 'timeout_ms', 'poll_interval_ms']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(createJob.inputSchema.properties?.[field]),
      schemaShapeWithoutDescriptions(staticCreateJob.inputSchema.properties?.[field]),
      `generation_job_create ${field} schema should match the static agent catalog`,
    )
  }
  for (const field of ['status', 'job', 'jobId', 'jobIds', 'jobs', 'monitor', 'output_resource', 'output_resource_id', 'output_resources', 'output_resource_ids', 'param_validation', 'terminal', 'message']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(createJob.outputSchema?.properties?.[field]),
      schemaShapeWithoutDescriptions(staticCreateJob.outputSchema?.properties?.[field]),
      `generation_job_create ${field} output schema should match the static agent catalog`,
    )
  }
  for (const field of ['jobIds', 'jobId', 'projectId', 'mode', 'timeout_ms', 'heartbeat_ms']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(waitJobs.inputSchema.properties?.[field]),
      schemaShapeWithoutDescriptions(staticWaitJobs.inputSchema.properties?.[field]),
      `generation_job_wait ${field} schema should match the static agent catalog`,
    )
  }
  for (const field of ['status', 'done', 'jobIds', 'completed', 'pending', 'failed', 'cancelled', 'output_resource_ids', 'jobs', 'message']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(waitJobs.outputSchema?.properties?.[field]),
      schemaShapeWithoutDescriptions(staticWaitJobs.outputSchema?.properties?.[field]),
      `generation_job_wait ${field} output schema should match the static agent catalog`,
    )
  }
  for (const field of ['projectId', 'asset_slot_id', 'assetSlotId', 'resource_id', 'resourceId', 'output_resource_id', 'outputResourceId', 'resource_ids', 'resourceIds', 'output_resource_ids', 'outputResourceIds', 'source_type', 'sourceType', 'source_id', 'sourceId', 'jobId', 'score', 'note']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(attachCandidate.inputSchema.properties?.[field]),
      schemaShapeWithoutDescriptions(staticAttachCandidate.inputSchema.properties?.[field]),
      `candidate_asset_slot_attach ${field} schema should match the static agent catalog`,
    )
  }
  assert.equal(attachCandidate.inputSchema.additionalProperties, staticAttachCandidate.inputSchema.additionalProperties)
  assert.deepEqual(
    schemaShapeWithoutDescriptions(attachCandidate.inputSchema.allOf),
    schemaShapeWithoutDescriptions(staticAttachCandidate.inputSchema.allOf),
    'candidate_asset_slot_attach alias requirements should match the static agent catalog',
  )
  for (const field of ['status', 'candidate', 'candidates', 'asset_slot_id', 'candidate_asset_slot_id', 'candidate_asset_slot_ids', 'resource_id', 'resource_ids', 'skipped_resource_ids', 'message']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(attachCandidate.outputSchema?.properties?.[field]),
      schemaShapeWithoutDescriptions(staticAttachCandidate.outputSchema?.properties?.[field]),
      `candidate_asset_slot_attach ${field} output schema should match the static agent catalog`,
    )
  }
  assert.equal(attachCandidate.outputSchema?.additionalProperties, staticAttachCandidate.outputSchema?.additionalProperties)
  for (const field of ['projectId', 'keyframe_id', 'keyframeId', 'target_keyframe_id', 'targetKeyframeId', 'resource_id', 'resourceId', 'output_resource_id', 'outputResourceId', 'resource_ids', 'resourceIds', 'output_resource_ids', 'outputResourceIds', 'source_type', 'sourceType', 'source_id', 'sourceId', 'jobId', 'title', 'description', 'prompt', 'note']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(attachKeyframe.inputSchema.properties?.[field]),
      schemaShapeWithoutDescriptions(staticAttachKeyframe.inputSchema.properties?.[field]),
      `candidate_keyframe_attach ${field} schema should match the static agent catalog`,
    )
  }
  assert.equal(attachKeyframe.inputSchema.additionalProperties, staticAttachKeyframe.inputSchema.additionalProperties)
  assert.deepEqual(
    schemaShapeWithoutDescriptions(attachKeyframe.inputSchema.allOf),
    schemaShapeWithoutDescriptions(staticAttachKeyframe.inputSchema.allOf),
    'candidate_keyframe_attach alias requirements should match the static agent catalog',
  )
  for (const field of ['status', 'candidate', 'candidates', 'keyframe_id', 'resource_id', 'resource_ids', 'skipped_resource_ids', 'message']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(attachKeyframe.outputSchema?.properties?.[field]),
      schemaShapeWithoutDescriptions(staticAttachKeyframe.outputSchema?.properties?.[field]),
      `candidate_keyframe_attach ${field} output schema should match the static agent catalog`,
    )
  }
  assert.equal(attachKeyframe.outputSchema?.additionalProperties, staticAttachKeyframe.outputSchema?.additionalProperties)
  assert.deepEqual(attachCandidate.inputSchema.required, staticAttachCandidate.inputSchema.required)
  assert.deepEqual(attachKeyframe.inputSchema.required, staticAttachKeyframe.inputSchema.required)
})

test.skip('local generation connector tools use configured ComfyUI and WebUI servers', async () => {
  const previousFetch = globalThis.fetch
  const calls: Array<{ path: string; auth: string; body: Record<string, unknown> }> = []
  globalThis.fetch = mockFetch({
    'GET /system_stats': () => ({ system: { os: 'test' } }),
    'POST /prompt': (body: Record<string, unknown>) => {
      calls.push({ path: '/prompt', auth: currentMockAuthHeader, body })
      return { prompt_id: 'prompt-1' }
    },
    'GET /sdapi/v1/sd-models': () => {
      calls.push({ path: '/sdapi/v1/sd-models', auth: currentMockAuthHeader, body: {} })
      return [{ title: 'model-a' }]
    },
  }) as typeof fetch
  setMCPGenerationToolsSettings({
    preferLocalServers: true,
    defaultServerIds: {
      comfyui: 'local-comfy',
      webui: 'local-webui',
    },
    servers: [
      {
        id: 'local-comfy',
        scope: 'local',
        type: 'comfyui',
        name: 'Local ComfyUI',
        enabled: true,
        baseURL: 'http://127.0.0.1:8188',
        timeoutMS: 120000,
        priority: 10,
        authKind: 'bearer',
        token: 'comfy-token',
      },
      {
        id: 'local-webui',
        scope: 'local',
        type: 'webui',
        name: 'Local WebUI',
        enabled: true,
        baseURL: 'http://127.0.0.1:7860',
        timeoutMS: 120000,
        priority: 10,
        authKind: 'basic',
        username: 'user',
        password: 'pass',
      },
    ],
  })

  try {
    const listed = await callComfyUITool({ operation: 'list_servers' }) as Record<string, any>
    assert.equal(listed.status, 'ok')
    assert.equal(listed.servers[0].id, 'local-comfy')
    assert.equal(listed.servers[0].tokenSet, true)
    assert.equal(listed.servers[0].token, undefined)

    const queued = await callComfyUITool({ operation: 'queue_prompt', workflow: { '1': { class_type: 'CheckpointLoaderSimple' } } }) as Record<string, any>
    assert.equal(queued.data.prompt_id, 'prompt-1')

    const models = await callWebUITool({ operation: 'models' }) as Record<string, any>
    assert.equal(models.data[0].title, 'model-a')
    assert.equal(calls[0].auth, 'Bearer comfy-token')
    assert.equal(calls[1].auth, `Basic ${Buffer.from('user:pass').toString('base64')}`)
    assert.deepEqual(calls[0].body, { prompt: { '1': { class_type: 'CheckpointLoaderSimple' } } })
  } finally {
    globalThis.fetch = previousFetch
    setMCPGenerationToolsSettings(undefined)
  }
})

test.skip('local generation connector connection test checks the workspace server directly', async () => {
  const previousFetch = globalThis.fetch
  const calls: Array<Record<string, unknown>> = []
  globalThis.fetch = mockFetch({
    'GET /system_stats': () => {
      calls.push({ auth: currentMockAuthHeader })
      return { system: { comfyui: true } }
    },
  }) as typeof fetch

  try {
    const result = await testMCPGenerationToolServer({
      id: 'workspace-comfy',
      scope: 'local',
      type: 'comfyui',
      name: 'Workspace Comfy',
      enabled: false,
      baseURL: 'http://127.0.0.1:8188',
      timeoutMS: 120000,
      priority: 10,
      authKind: 'bearer',
      token: 'workspace-token',
    }) as Record<string, any>

    assert.equal(result.success, true)
    assert.equal(result.status_code, 200)
    assert.equal(result.server.token, undefined)
    assert.equal(result.server.tokenSet, true)
    assert.equal(calls[0].auth, 'Bearer workspace-token')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test.skip('admin generation connector servers are called through backend proxy', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const calls: Array<Record<string, unknown>> = []
  globalThis.fetch = mockFetch({
    'GET /generation-tools/settings': {
      allow_local: false,
      default_server_id: 'org-comfy',
      servers: [{
        id: 'org-comfy',
        scope: 'org',
        type: 'comfyui',
        name: 'Org Comfy',
        enabled: true,
        base_url: 'https://org-gpu.example.com',
        timeout_ms: 120000,
        priority: 5,
        auth_kind: 'bearer',
        token_set: true,
      }, {
        id: 'admin-comfy',
        scope: 'admin',
        type: 'comfyui',
        name: 'Admin Comfy',
        enabled: true,
        base_url: 'https://gpu.example.com',
        timeout_ms: 120000,
        priority: 10,
        auth_kind: 'bearer',
        token_set: true,
      }],
    },
    'POST /generation-tools/call': (body: Record<string, unknown>) => {
      calls.push(body)
      return { status: 'ok', data: { prompt_id: 'admin-prompt' } }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  updateMCPContextSnapshot({
    route: { pathname: '/', search: '', hash: '' },
    project: null,
    user: null,
    selection: null,
    updatedAt: new Date(0).toISOString(),
    auth: { token: 'runtime-token' },
  })
  try {
    const listed = await callComfyUITool({ operation: 'list_servers' }) as Record<string, any>
    assert.equal(listed.servers[0].id, 'org-comfy')
    assert.equal(listed.servers[0].scope, 'org')
    assert.equal(listed.servers[0].tokenSet, true)
    assert.equal(listed.servers[0].token, undefined)

    const result = await callComfyUITool({ operation: 'queue_prompt', workflow: { '1': { class_type: 'KSampler' } } }) as Record<string, any>
    assert.equal(result.data.prompt_id, 'admin-prompt')
    assert.deepEqual(calls[0], {
      tool_type: 'comfyui',
      server_id: 'org-comfy',
      server_scope: 'org',
      operation: 'queue_prompt',
      workflow: { '1': { class_type: 'KSampler' } },
    })
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
    updateMCPContextSnapshot({
      route: { pathname: '/', search: '', hash: '' },
      project: null,
      user: null,
      selection: null,
      updatedAt: new Date(0).toISOString(),
      auth: null,
    })
  }
})

test.skip('generation connector server_scope disambiguates duplicate remote server IDs', async () => {
  const comfyTool = listTools().find((tool) => tool.name === 'tool_comfyui')
  const webuiTool = listTools().find((tool) => tool.name === 'tool_webui')
  assert.deepEqual(schemaShapeWithoutDescriptions(comfyTool?.inputSchema.properties?.server_scope), {
    type: 'string',
    enum: ['local', 'org', 'admin'],
  })
  assert.deepEqual(schemaShapeWithoutDescriptions(webuiTool?.inputSchema.properties?.server_scope), {
    type: 'string',
    enum: ['local', 'org', 'admin'],
  })

  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const calls: Array<Record<string, unknown>> = []
  globalThis.fetch = mockFetch({
    'GET /generation-tools/settings': {
      allow_local: false,
      servers: [{
        id: 'shared-comfy',
        scope: 'admin',
        type: 'comfyui',
        name: 'Admin Shared Comfy',
        enabled: true,
        base_url: 'https://admin-gpu.example.com',
        timeout_ms: 120000,
        priority: 1,
        auth_kind: 'bearer',
        token_set: true,
      }, {
        id: 'shared-comfy',
        scope: 'org',
        type: 'comfyui',
        name: 'Org Shared Comfy',
        enabled: true,
        base_url: 'https://org-gpu.example.com',
        timeout_ms: 120000,
        priority: 1,
        auth_kind: 'bearer',
        token_set: true,
      }],
    },
    'POST /generation-tools/call': (body: Record<string, unknown>) => {
      calls.push(body)
      return { status: 'ok', data: { scope: body.server_scope } }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  updateMCPContextSnapshot({
    route: { pathname: '/', search: '', hash: '' },
    project: null,
    user: null,
    selection: null,
    updatedAt: new Date(0).toISOString(),
    auth: { token: 'runtime-token' },
  })
  try {
    const result = await callComfyUITool({
      operation: 'status',
      server_id: 'shared-comfy',
      server_scope: 'admin',
    }) as Record<string, any>

    assert.equal(result.data.scope, 'admin')
    assert.equal(calls[0].server_id, 'shared-comfy')
    assert.equal(calls[0].server_scope, 'admin')
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
    updateMCPContextSnapshot({
      route: { pathname: '/', search: '', hash: '' },
      project: null,
      user: null,
      selection: null,
      updatedAt: new Date(0).toISOString(),
      auth: null,
    })
  }
})

test.skip('generation connector selection keeps local before org before admin regardless of priority', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const calls: Array<Record<string, unknown>> = []
  globalThis.fetch = mockFetch({
    'GET /generation-tools/settings': {
      allow_local: true,
      servers: [{
        id: 'admin-comfy',
        scope: 'admin',
        type: 'comfyui',
        name: 'Admin Comfy',
        enabled: true,
        base_url: 'https://admin-gpu.example.com',
        timeout_ms: 120000,
        priority: 1,
        auth_kind: 'bearer',
        token_set: true,
      }, {
        id: 'org-comfy',
        scope: 'org',
        type: 'comfyui',
        name: 'Org Comfy',
        enabled: true,
        base_url: 'https://org-gpu.example.com',
        timeout_ms: 120000,
        priority: 99,
        auth_kind: 'bearer',
        token_set: true,
      }],
    },
    'GET /system_stats': () => {
      calls.push({ path: '/system_stats', auth: currentMockAuthHeader })
      return { system: { local: true } }
    },
    'POST /generation-tools/call': (body: Record<string, unknown>) => {
      calls.push(body)
      return { status: 'ok', data: { prompt_id: 'remote-prompt' } }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  setMCPGenerationToolsSettings({
    preferLocalServers: true,
    servers: [{
      id: 'local-comfy',
      scope: 'local',
      type: 'comfyui',
      name: 'Local Comfy',
      enabled: true,
      baseURL: 'http://127.0.0.1:8188',
      timeoutMS: 120000,
      priority: 500,
      authKind: 'none',
    }],
  })
  updateMCPContextSnapshot({
    route: { pathname: '/', search: '', hash: '' },
    project: null,
    user: null,
    selection: null,
    updatedAt: new Date(0).toISOString(),
    auth: { token: 'runtime-token' },
  })
  try {
    const listed = await callComfyUITool({ operation: 'list_servers' }) as Record<string, any>
    assert.deepEqual(listed.servers.map((server: Record<string, unknown>) => server.id), ['local-comfy', 'org-comfy', 'admin-comfy'])

    const status = await callComfyUITool({ operation: 'status' }) as Record<string, any>
    assert.equal(status.server.id, 'local-comfy')
    assert.deepEqual(calls[0], { path: '/system_stats', auth: '' })
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
    setMCPGenerationToolsSettings(undefined)
    updateMCPContextSnapshot({
      route: { pathname: '/', search: '', hash: '' },
      project: null,
      user: null,
      selection: null,
      updatedAt: new Date(0).toISOString(),
      auth: null,
    })
  }
})

test.skip('generation connector selection keeps org before admin when local is disallowed', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const calls: Array<Record<string, unknown>> = []
  globalThis.fetch = mockFetch({
    'GET /generation-tools/settings': {
      allow_local: false,
      servers: [{
        id: 'admin-comfy',
        scope: 'admin',
        type: 'comfyui',
        name: 'Admin Comfy',
        enabled: true,
        base_url: 'https://admin-gpu.example.com',
        timeout_ms: 120000,
        priority: 1,
        auth_kind: 'bearer',
        token_set: true,
      }, {
        id: 'org-comfy',
        scope: 'org',
        type: 'comfyui',
        name: 'Org Comfy',
        enabled: true,
        base_url: 'https://org-gpu.example.com',
        timeout_ms: 120000,
        priority: 99,
        auth_kind: 'bearer',
        token_set: true,
      }],
    },
    'POST /generation-tools/call': (body: Record<string, unknown>) => {
      calls.push(body)
      return { status: 'ok', data: { prompt_id: 'org-prompt' } }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  setMCPGenerationToolsSettings({
    preferLocalServers: true,
    servers: [{
      id: 'local-comfy',
      scope: 'local',
      type: 'comfyui',
      name: 'Local Comfy',
      enabled: true,
      baseURL: 'http://127.0.0.1:8188',
      timeoutMS: 120000,
      priority: 1,
      authKind: 'none',
    }],
  })
  updateMCPContextSnapshot({
    route: { pathname: '/', search: '', hash: '' },
    project: null,
    user: null,
    selection: null,
    updatedAt: new Date(0).toISOString(),
    auth: { token: 'runtime-token' },
  })
  try {
    const listed = await callComfyUITool({ operation: 'list_servers' }) as Record<string, any>
    assert.deepEqual(listed.servers.map((server: Record<string, unknown>) => server.id), ['org-comfy', 'admin-comfy'])

    const result = await callComfyUITool({ operation: 'queue_prompt', workflow: { '1': { class_type: 'KSampler' } } }) as Record<string, any>
    assert.equal(result.data.prompt_id, 'org-prompt')
    assert.equal(calls[0].server_id, 'org-comfy')
    assert.equal(calls[0].server_scope, 'org')
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
    setMCPGenerationToolsSettings(undefined)
    updateMCPContextSnapshot({
      route: { pathname: '/', search: '', hash: '' },
      project: null,
      user: null,
      selection: null,
      updatedAt: new Date(0).toISOString(),
      auth: null,
    })
  }
})

test.skip('generation connector fails closed when remote policy cannot be loaded in an authenticated session', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const calls: Array<string> = []
  globalThis.fetch = mockFetch({
    'GET /generation-tools/settings': () => {
      calls.push('/generation-tools/settings')
      return new Response(JSON.stringify({ error: 'policy unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })
    },
    'GET /system_stats': () => {
      calls.push('/system_stats')
      return { system: { local: true } }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  setMCPGenerationToolsSettings({
    preferLocalServers: true,
    servers: [{
      id: 'local-comfy',
      scope: 'local',
      type: 'comfyui',
      name: 'Local Comfy',
      enabled: true,
      baseURL: 'http://127.0.0.1:8188',
      timeoutMS: 120000,
      priority: 1,
      authKind: 'none',
    }],
  })
  updateMCPContextSnapshot({
    route: { pathname: '/', search: '', hash: '' },
    project: null,
    user: null,
    selection: null,
    updatedAt: new Date(0).toISOString(),
    auth: { token: 'runtime-token' },
  })
  try {
    const listed = await callComfyUITool({ operation: 'list_servers' }) as Record<string, any>
    assert.deepEqual(listed.servers, [])

    await assert.rejects(
      () => callComfyUITool({ operation: 'status' }),
      /Generation tool policy is unavailable/,
    )
    assert.deepEqual(calls, ['/generation-tools/settings', '/generation-tools/settings'])
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
    setMCPGenerationToolsSettings(undefined)
    updateMCPContextSnapshot({
      route: { pathname: '/', search: '', hash: '' },
      project: null,
      user: null,
      selection: null,
      updatedAt: new Date(0).toISOString(),
      auth: null,
    })
  }
})

test.skip('webui connector imports returned images into resources', async () => {
  const previousFetch = globalThis.fetch
  const pngBase64 = Buffer.from('png-bytes').toString('base64')
  globalThis.fetch = mockFetch({
    'POST /sdapi/v1/txt2img': () => ({
      images: [pngBase64],
      parameters: { prompt: 'cinematic frame' },
    }),
    'POST /resources/upload': () => ({
      ID: 770,
      name: 'webui-output-1.png',
      mime_type: 'image/png',
    }),
  }) as typeof fetch
  setMCPGenerationToolsSettings({
    preferLocalServers: true,
    servers: [{
      id: 'local-webui',
      scope: 'local',
      type: 'webui',
      name: 'Local WebUI',
      enabled: true,
      baseURL: 'http://127.0.0.1:7860',
      timeoutMS: 120000,
      priority: 10,
      authKind: 'none',
    }],
  })

  try {
    const result = await callWebUITool({
      operation: 'txt2img',
      payload: { prompt: 'cinematic frame' },
      import_outputs: true,
      output_name: 'cinematic frame',
    }) as Record<string, any>

    assert.equal(result.data.imported, true)
    assert.equal(result.data.image_count, 1)
    assert.equal(result.data.images, undefined)
    assert.deepEqual(result.output_resource_ids, [770])
    assert.equal(result.output_resources[0].ID, 770)
  } finally {
    globalThis.fetch = previousFetch
    setMCPGenerationToolsSettings(undefined)
  }
})

test.skip('comfyui connector imports history image outputs into resources', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    'GET /history/prompt-1': {
      'prompt-1': {
        outputs: {
          '9': {
            images: [{ filename: 'frame.png', subfolder: '', type: 'output' }],
          },
        },
      },
    },
    'GET /view?filename=frame.png&type=output': new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }),
    'POST /resources/upload': {
      ID: 771,
      name: 'comfyui-output-1.png',
      mime_type: 'image/png',
    },
  }) as typeof fetch
  setMCPGenerationToolsSettings({
    preferLocalServers: true,
    servers: [{
      id: 'local-comfy',
      scope: 'local',
      type: 'comfyui',
      name: 'Local ComfyUI',
      enabled: true,
      baseURL: 'http://127.0.0.1:8188',
      timeoutMS: 120000,
      priority: 10,
      authKind: 'none',
    }],
  })

  try {
    const result = await callComfyUITool({
      operation: 'import_history_outputs',
      prompt_id: 'prompt-1',
      output_name: 'comfy frame',
    }) as Record<string, any>

    assert.equal(result.data.imported, true)
    assert.equal(result.data.output_count, 1)
    assert.deepEqual(result.output_resource_ids, [771])
    assert.equal(result.output_resources[0].ID, 771)
  } finally {
    globalThis.fetch = previousFetch
    setMCPGenerationToolsSettings(undefined)
  }
})

test.skip('admin comfyui connector imports history outputs through backend proxy', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const imageBase64 = Buffer.from('admin-image').toString('base64')
  globalThis.fetch = mockFetch({
    'GET /generation-tools/settings': {
      allow_local: false,
      default_server_id: 'admin-comfy',
      servers: [{
        id: 'admin-comfy',
        scope: 'admin',
        type: 'comfyui',
        name: 'Admin Comfy',
        enabled: true,
        base_url: 'https://gpu.example.com',
        timeout_ms: 120000,
        priority: 10,
        auth_kind: 'bearer',
        token_set: true,
      }],
    },
    'POST /generation-tools/call': (body: Record<string, unknown>) => {
      if (body.operation === 'history') {
        return {
          status: 'ok',
          data: {
            'prompt-2': {
              outputs: {
                '9': { images: [{ filename: 'admin-frame.png', subfolder: '', type: 'output' }] },
              },
            },
          },
        }
      }
      if (body.operation === 'view') {
        return {
          status: 'ok',
          data: {
            mime_type: 'image/png',
            base64: imageBase64,
          },
        }
      }
      return { status: 'ok' }
    },
    'POST /resources/upload': {
      ID: 772,
      name: 'admin-comfyui-output-1.png',
      mime_type: 'image/png',
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  updateMCPContextSnapshot({
    route: { pathname: '/', search: '', hash: '' },
    project: null,
    user: null,
    selection: null,
    updatedAt: new Date(0).toISOString(),
    auth: { token: 'runtime-token' },
  })
  try {
    const result = await callComfyUITool({
      operation: 'import_history_outputs',
      prompt_id: 'prompt-2',
      output_name: 'admin comfyui output',
    }) as Record<string, any>

    assert.equal(result.data.imported, true)
    assert.deepEqual(result.output_resource_ids, [772])
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
    updateMCPContextSnapshot({
      route: { pathname: '/', search: '', hash: '' },
      project: null,
      user: null,
      selection: null,
      updatedAt: new Date(0).toISOString(),
      auth: null,
    })
  }
})



test('script locate tool is exposed for fuzzy evidence retrieval', () => {
  const locateTool = listTools().find((item) => item.name === 'movscript_script_locate')
  assert.ok(locateTool)
  assert.match(locateTool.description, /fuzzy user intent/)
  const locateProperties = schemaProperties(locateTool.inputSchema)
  assert.ok(locateProperties.intent)
  assert.ok(locateProperties.queries)
  assert.ok(locateProperties.must)
  assert.ok(locateProperties.aliasGroups)
  assert.equal(listTools().some((item) => item.name === 'movscript_script_file_read'), false)
  assert.equal(listTools().some((item) => item.name === 'movscript_project_script_read'), false)
})

test('locateScriptPassages ranks fuzzy alias matches and returns readonly read refs', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/projects/5/entities/script-versions': [
      {
        ID: 12,
        project_id: 5,
        script_id: 3,
        version_number: 2,
        title: '第一集 v2',
        content: [
          '第1场 雨夜 巷口',
          '林夏站在路灯下。',
          '老张从伞骨里发现一张字条。',
          '他没有说话，只把字条攥进掌心。',
          '第2场 白天 店内',
          '老板催促众人开会。',
        ].join('\n'),
        UpdatedAt: '2026-05-18T00:00:00.000Z',
      },
    ],
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await locateScriptPassages({
      projectId: 5,
      scriptVersionId: 12,
      intent: '老张发现纸条那里',
      must: ['张建国', '纸条'],
      should: ['发现'],
      aliasGroups: [['张建国', '老张', '父亲'], ['纸条', '字条', '便签']],
      windowLines: 1,
    }) as Record<string, any>

    assert.equal(result.scripts.length, 1)
    assert.equal(result.scripts[0].scriptVersionId, 12)
    assert.equal(result.scripts[0].uri, 'movscript://project/5/script-version/12/content')
    assert.equal(result.candidates.length, 1)
    assert.equal(result.candidates[0].scriptVersionId, 12)
    assert.equal(result.candidates[0].uri, 'movscript://project/5/script-version/12/content')
    assert.equal(result.candidates[0].sceneId, 'S01')
    assert.deepEqual(result.candidates[0].lineRange, [2, 4])
    assert.deepEqual(result.candidates[0].readRef, {
      ref: 'movscript://project/5/script-version/12/content',
      uri: 'movscript://project/5/script-version/12/content',
      readUri: 'movscript://project/5/script-version/12/content?startLine=2&endLine=4',
      rangeUri: 'movscript://project/5/script-version/12/content?startLine=2&endLine=4',
      projectId: 5,
      scriptVersionId: 12,
      startLine: 2,
      endLine: 4,
    })
    assert.match(result.candidates[0].excerpt, /老张从伞骨里发现一张字条/)
  } finally {
    setMCPAPIBaseURL(previousBaseURL)
    globalThis.fetch = previousFetch
  }
})

test('locateScriptPassages searches across script version files when no script is specified', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/projects/5/entities/script-versions': [
      {
        ID: 12,
        project_id: 5,
        script_id: 3,
        version_number: 1,
        title: '总剧本',
        content: '第1场 客厅\n林夏整理旧照片。',
      },
      {
        ID: 13,
        project_id: 5,
        script_id: 4,
        version_number: 1,
        title: '第一集',
        content: '第1场 雨夜 巷口\n老张把字条塞进伞柄。',
      },
    ],
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await locateScriptPassages({
      projectId: 5,
      must: ['老张', '字条'],
      windowLines: 1,
    }) as Record<string, any>

    assert.equal(result.scripts.length, 2)
    assert.equal(result.candidates.length, 1)
    assert.equal(result.candidates[0].scriptVersionId, 13)
    assert.equal(result.candidates[0].readRef.ref, 'movscript://project/5/script-version/13/content')
  } finally {
    setMCPAPIBaseURL(previousBaseURL)
    globalThis.fetch = previousFetch
  }
})

test('locateScriptPassages does not fall back to an unrelated latest version for missing titles', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/projects/5/scripts': [],
    '/projects/5/entities/script-versions': [
      {
        ID: 12,
        project_id: 5,
        script_id: 3,
        version_number: 2,
        title: '总剧本',
        content: '第1场 雨夜 巷口\n林夏站在路灯下。',
      },
    ],
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    await assert.rejects(
      () => locateScriptPassages({
        projectId: 5,
        scriptTitle: '第一集',
        queries: ['雨夜'],
      }),
      /No script version found for title: 第一集/
    )
  } finally {
    setMCPAPIBaseURL(previousBaseURL)
    globalThis.fetch = previousFetch
  }
})

test('readResource maps readonly script file URIs to plain text resources', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/projects/5/entities/script-versions': [
      {
        ID: 12,
        project_id: 5,
        script_id: 3,
        title: '第一集 v2',
        content: '第一行\n第二行\n第三行\n第四行',
      },
    ],
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await readResource('movscript://project/5/script-version/12/content?startLine=2&endLine=3') as Record<string, any>

    assert.equal(result.contents[0].uri, 'movscript://project/5/script-version/12/content?startLine=2&endLine=3')
    assert.equal(result.contents[0].mimeType, 'text/plain')
    assert.equal(result.contents[0].text, '第二行\n第三行')
    assert.equal(result.data.scriptVersionId, 12)
    assert.equal(result.data.startLine, 2)
    assert.equal(result.data.endLine, 3)
  } finally {
    setMCPAPIBaseURL(previousBaseURL)
    globalThis.fetch = previousFetch
  }
})

test('attach asset slot candidate posts resource candidate without selecting it', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const calls: Array<{ path: string; body: Record<string, unknown> }> = []
  globalThis.fetch = mockFetch({
    'POST /projects/42/entities/asset-slot-candidates': (body: Record<string, unknown>) => {
      calls.push({ path: '/projects/42/entities/asset-slot-candidates', body })
      return {
        id: 900,
        asset_slot_id: body.asset_slot_id,
        candidate_asset_slot_id: 901,
        score: body.score,
        status: 'candidate',
        note: body.note,
        candidate_asset_slot: {
          id: 901,
          resource_id: body.resource_id,
          status: 'candidate',
        },
      }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await attachAssetSlotCandidate({
      projectId: 42,
      asset_slot_id: 7,
      resource_id: 88,
      jobId: 123,
      score: 0.82,
      note: 'first generated candidate',
    }) as Record<string, any>

    assert.deepEqual(calls, [{
      path: '/projects/42/entities/asset-slot-candidates',
      body: {
        asset_slot_id: 7,
        resource_id: 88,
        source_type: 'agent',
        source_id: 123,
        score: 0.82,
        note: 'first generated candidate',
      },
    }])
    assert.equal(result.status, 'attached')
    assert.equal(result.asset_slot_id, 7)
    assert.equal(result.resource_id, 88)
    assert.equal(result.candidate_asset_slot_id, 901)
    assert.equal(result.candidate.status, 'candidate')
    assert.match(result.message, /资源 #88 已加入素材位 #7 的候选集/)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
  }
})

test('attach asset slot candidate accepts generation output_resource_id alias', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const calls: Array<Record<string, unknown>> = []
  globalThis.fetch = mockFetch({
    'POST /projects/42/entities/asset-slot-candidates': (body: Record<string, unknown>) => {
      calls.push(body)
      return {
        id: 901,
        asset_slot_id: body.asset_slot_id,
        candidate_asset_slot_id: 902,
        status: 'candidate',
      }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await attachAssetSlotCandidate({
      projectId: 42,
      assetSlotId: 7,
      outputResourceId: 88,
    }) as Record<string, any>

    assert.deepEqual(calls, [{
      asset_slot_id: 7,
      resource_id: 88,
      source_type: 'agent',
    }])
    assert.equal(result.status, 'attached')
    assert.equal(result.resource_id, 88)
    assert.equal(result.candidate_asset_slot_id, 902)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
  }
})

test('attach asset slot candidate accepts generation output_resource_ids array', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const calls: Array<Record<string, unknown>> = []
  globalThis.fetch = mockFetch({
    'POST /projects/42/entities/asset-slot-candidates': (body: Record<string, unknown>) => {
      calls.push(body)
      return {
        id: Number(body.resource_id),
        asset_slot_id: body.asset_slot_id,
        candidate_asset_slot_id: Number(body.resource_id) + 1000,
        status: 'candidate',
      }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await attachAssetSlotCandidate({
      projectId: 42,
      assetSlotId: 7,
      outputResourceIds: [88, 89],
      jobId: 123,
    }) as Record<string, any>

    assert.deepEqual(calls, [
      { asset_slot_id: 7, resource_id: 88, source_type: 'agent', source_id: 123 },
      { asset_slot_id: 7, resource_id: 89, source_type: 'agent', source_id: 123 },
    ])
    assert.equal(result.status, 'attached')
    assert.equal(result.resource_id, 88)
    assert.deepEqual(result.resource_ids, [88, 89])
    assert.equal(result.candidates.length, 2)
    assert.deepEqual(result.candidate_asset_slot_ids, [1088, 1089])
    assert.match(result.message, /资源 #88、#89 已加入素材位 #7 的候选集/)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
  }
})

test('attach asset slot candidate skips resources already in the candidate set', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const calls: Array<Record<string, unknown>> = []
  globalThis.fetch = mockFetch({
    'GET /projects/42/entities/asset-slot-candidates': [
      {
        ID: 901,
        asset_slot_id: 7,
        status: 'candidate',
        candidate_asset_slot: {
          ID: 902,
          resource_id: 88,
        },
      },
    ],
    'POST /projects/42/entities/asset-slot-candidates': (body: Record<string, unknown>) => {
      calls.push(body)
      return {
        id: Number(body.resource_id),
        asset_slot_id: body.asset_slot_id,
        candidate_asset_slot_id: Number(body.resource_id) + 1000,
        status: 'candidate',
      }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await attachAssetSlotCandidate({
      projectId: 42,
      assetSlotId: 7,
      outputResourceIds: [88, 89],
      note: 'do not overwrite existing candidate note',
    }) as Record<string, any>

    assert.deepEqual(calls, [{
      asset_slot_id: 7,
      resource_id: 89,
      source_type: 'agent',
      note: 'do not overwrite existing candidate note',
    }])
    assert.deepEqual(result.resource_ids, [88, 89])
    assert.deepEqual(result.skipped_resource_ids, [88])
    assert.equal(result.candidates.length, 1)
    assert.match(result.message, /已跳过重复资源 #88/)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
  }
})

test('attach asset slot candidate requires a resource id or output resource id', async () => {
  await assert.rejects(
    () => attachAssetSlotCandidate({ projectId: 42, asset_slot_id: 7 }),
    /resource_id is required/,
  )
})

test('attach asset slot candidate rejects non-positive IDs before posting', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  let called = false
  globalThis.fetch = (async () => {
    called = true
    throw new Error('unexpected fetch')
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    await assert.rejects(
      () => attachAssetSlotCandidate({ projectId: 42, asset_slot_id: 7, outputResourceId: -1 }),
      /resource_id must be a positive integer/,
    )
    await assert.rejects(
      () => attachAssetSlotCandidate({ projectId: 42, asset_slot_id: 0, outputResourceId: 88 }),
      /asset_slot_id must be a positive integer/,
    )
    assert.equal(called, false)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
  }
})

test('attach asset slot candidate rejects conflicting ID aliases before posting', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  let called = false
  globalThis.fetch = (async () => {
    called = true
    throw new Error('unexpected fetch')
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    await assert.rejects(
      () => attachAssetSlotCandidate({ projectId: 42, asset_slot_id: 7, assetSlotId: 8, outputResourceId: 88 }),
      /asset_slot_id aliases must match/,
    )
    await assert.rejects(
      () => attachAssetSlotCandidate({ projectId: 42, asset_slot_id: 7, resource_id: 88, outputResourceId: 89 }),
      /resource_id aliases must match/,
    )
    assert.equal(called, false)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
  }
})

test('attach keyframe candidate posts generated resource as a reviewable visual anchor candidate', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const calls: Array<{ path: string; body: Record<string, unknown> }> = []
  globalThis.fetch = mockFetch({
    'GET /projects/42/entities/keyframes': [
      {
        ID: 17,
        production_id: 301,
        scene_moment_id: 401,
        content_unit_id: 501,
        canvas_id: 601,
        title: '镜头开场',
        description: '女主推门进入旧仓库。',
        prompt: 'Wide shot, rainy warehouse entrance.',
        order: 3,
        status: 'pending',
      },
    ],
    'POST /projects/42/entities/keyframes': (body: Record<string, unknown>) => {
      calls.push({ path: '/projects/42/entities/keyframes', body })
      return {
        ID: 902,
        ...body,
        metadata_json: body.metadata_json,
      }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await attachKeyframeCandidate({
      projectId: 42,
      targetKeyframeId: 17,
      outputResourceId: 88,
      jobId: 123,
      note: 'stronger composition',
    }) as Record<string, any>

    assert.equal(calls.length, 1)
    assert.equal(calls[0].path, '/projects/42/entities/keyframes')
    assert.deepEqual(calls[0].body, {
      production_id: 301,
      scene_moment_id: 401,
      content_unit_id: 501,
      resource_id: 88,
      canvas_id: 601,
      title: '候选：镜头开场',
      description: '女主推门进入旧仓库。',
      prompt: 'Wide shot, rainy warehouse entrance.',
      order: 3,
      status: 'candidate',
      metadata_json: JSON.stringify({
        source: 'ai_generated_keyframe_candidate',
        target_keyframe_id: 17,
        resource_id: 88,
        source_type: 'agent',
        source_id: 123,
        source_job_id: 123,
        note: 'stronger composition',
      }),
    })
    assert.equal(result.status, 'attached')
    assert.equal(result.keyframe_id, 17)
    assert.equal(result.resource_id, 88)
    assert.equal(result.candidate.status, 'candidate')
    assert.match(result.message, /资源 #88 已加入画面锚点 #17 的候选集/)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
  }
})

test('attach keyframe candidate accepts generation output_resource_ids array', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const calls: Array<Record<string, unknown>> = []
  globalThis.fetch = mockFetch({
    'GET /projects/42/entities/keyframes': [
      {
        ID: 17,
        title: '镜头开场',
        description: '女主推门进入旧仓库。',
        prompt: 'Wide shot, rainy warehouse entrance.',
        status: 'pending',
      },
    ],
    'POST /projects/42/entities/keyframes': (body: Record<string, unknown>) => {
      calls.push(body)
      return {
        ID: Number(body.resource_id) + 1000,
        ...body,
      }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await attachKeyframeCandidate({
      projectId: 42,
      targetKeyframeId: 17,
      output_resource_ids: [88, 89],
      jobId: 123,
    }) as Record<string, any>

    assert.equal(calls.length, 2)
    assert.deepEqual(calls.map((call) => call.resource_id), [88, 89])
    assert.deepEqual(result.resource_ids, [88, 89])
    assert.equal(result.candidates.length, 2)
    assert.match(result.message, /资源 #88、#89 已加入画面锚点 #17 的候选集/)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
  }
})

test('attach keyframe candidate skips resources already in the candidate set', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const calls: Array<Record<string, unknown>> = []
  globalThis.fetch = mockFetch({
    'GET /projects/42/entities/keyframes': [
      {
        ID: 17,
        title: '镜头开场',
        description: '女主推门进入旧仓库。',
        prompt: 'Wide shot, rainy warehouse entrance.',
        status: 'pending',
      },
      {
        ID: 902,
        resource_id: 88,
        status: 'candidate',
        metadata_json: '{"source":"ai_generated_keyframe_candidate","target_keyframe_id":17,"resource_id":88}',
      },
    ],
    'POST /projects/42/entities/keyframes': (body: Record<string, unknown>) => {
      calls.push(body)
      return {
        ID: Number(body.resource_id) + 1000,
        ...body,
      }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await attachKeyframeCandidate({
      projectId: 42,
      targetKeyframeId: 17,
      output_resource_ids: [88, 89],
    }) as Record<string, any>

    assert.equal(calls.length, 1)
    assert.equal(calls[0].resource_id, 89)
    assert.deepEqual(result.resource_ids, [88, 89])
    assert.deepEqual(result.skipped_resource_ids, [88])
    assert.equal(result.candidates.length, 1)
    assert.match(result.message, /已跳过重复资源 #88/)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
  }
})

test('attach keyframe candidate requires a resource id or output resource id', async () => {
  await assert.rejects(
    () => attachKeyframeCandidate({ projectId: 42, keyframe_id: 17 }),
    /resource_id is required/,
  )
})

test('attach keyframe candidate rejects non-positive IDs before fetching targets', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  let called = false
  globalThis.fetch = (async () => {
    called = true
    throw new Error('unexpected fetch')
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    await assert.rejects(
      () => attachKeyframeCandidate({ projectId: 42, keyframe_id: 17, outputResourceId: -1 }),
      /resource_id must be a positive integer/,
    )
    await assert.rejects(
      () => attachKeyframeCandidate({ projectId: 42, targetKeyframeId: 0, outputResourceId: 88 }),
      /keyframe_id must be a positive integer/,
    )
    assert.equal(called, false)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
  }
})

test('attach keyframe candidate rejects conflicting ID aliases before fetching targets', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  let called = false
  globalThis.fetch = (async () => {
    called = true
    throw new Error('unexpected fetch')
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    await assert.rejects(
      () => attachKeyframeCandidate({ projectId: 42, keyframe_id: 17, targetKeyframeId: 18, outputResourceId: 88 }),
      /keyframe_id aliases must match/,
    )
    await assert.rejects(
      () => attachKeyframeCandidate({ projectId: 42, keyframe_id: 17, resource_id: 88, outputResourceId: 89 }),
      /resource_id aliases must match/,
    )
    assert.equal(called, false)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
  }
})

test('attach keyframe candidate rejects nested generated candidate targets', async () => {
  const previousFetch = globalThis.fetch
  const previousBaseURL = 'http://localhost:8765'
  const calls: Array<{ path: string; body: Record<string, unknown> }> = []
  globalThis.fetch = mockFetch({
    'GET /projects/42/entities/keyframes': [
      {
        ID: 18,
        title: '候选：镜头开场',
        status: 'candidate',
        metadata_json: JSON.stringify({
          source: 'ai_generated_keyframe_candidate',
          target_keyframe_id: 17,
          resource_id: 88,
        }),
      },
    ],
    'POST /projects/42/entities/keyframes': (body: Record<string, unknown>) => {
      calls.push({ path: '/projects/42/entities/keyframes', body })
      return body
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    await assert.rejects(
      () => attachKeyframeCandidate({
        projectId: 42,
        keyframe_id: 18,
        resource_id: 99,
      }),
      /already a generated candidate/,
    )
    assert.equal(calls.length, 0)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL(previousBaseURL)
  }
})

test('workspace model MCP tool exposes frontend-owned field and seed contract', async () => {
  const result = await getWorkspaceModelContract({
    kind: 'production_workspace',
    target: { entityType: 'production', entityId: 301, projectId: 42 },
    seedMode: 'editable_snapshot',
    include: ['production', 'segments', 'not_allowed'],
    hydrate: false,
  }) as Record<string, any>

  assert.equal(result.contractVersion, 1)
  assert.equal(result.kind, 'production_workspace')
  assert.equal(result.contentSchemaId, 'movscript.production_workspace.v1')
  assert.deepEqual(result.seedPolicy.include, ['production', 'segments'])
  assert.equal(result.seedPolicy.defaultMode, 'editable_snapshot')
  assert.deepEqual(result.seedPolicy.allowedModes, ['empty', 'snapshot', 'editable_snapshot'])
  assert.deepEqual(result.fieldGuide.owns, [
    'snapshot.workspace.segments',
    'snapshot.workspace.segments[].scene_moments',
    'snapshot.workspace.segments[].scene_moments[].writing_expressions',
  ])
  assert.equal(result.applyBoundary.backendApply, 'production_workspace')
  assert.equal(result.reviewRoute, '/project/production/orchestration?productionId=301&workspaceId=:workspaceId')
  assert.equal(result.modelRef, 'frontend:WorkspaceModel:production_workspace:v1')
})

test('workspace model MCP tool rejects non-canonical workspace kind aliases', async () => {
  await assert.rejects(
    () => getWorkspaceModelContract({
      kind: 'project standards workspace',
      target: { entityType: 'project', entityId: 42, projectId: 42 },
      hydrate: false,
    }),
    /Unsupported workspace model kind: project standards workspace/,
  )
})

test('workspace model MCP tool hydrates production workspace snapshot with production brief and project scripts', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/projects/42/entities/productions': [{
      ID: 301,
      project_id: 42,
      script_version_id: 77,
      name: 'Pilot production',
      description: 'Production brief from page.',
      UpdatedAt: '2026-05-13T00:00:00.000Z',
    }],
    '/projects/42/entities/script-versions': [{
      ID: 77,
      project_id: 42,
      script_id: 9,
      title: 'Pilot v1',
      summary: 'Script version summary.',
      content: 'A long script body.',
      UpdatedAt: '2026-05-13T00:00:01.000Z',
    }],
    '/projects/42/entities/creative-references': [{
      ID: 12,
      project_id: 42,
      name: 'Hero',
      kind: 'character',
      status: 'active',
      UpdatedAt: '2026-05-13T00:00:03.000Z',
    }],
    '/projects/42/scripts': [{
      ID: 9,
      project_id: 42,
      title: 'Pilot',
      summary: 'Project script summary.',
      content: 'Project script body should not be included.',
      UpdatedAt: '2026-05-13T00:00:02.000Z',
    }],
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await getWorkspaceModelContract({
      kind: 'production_workspace',
      target: { entityType: 'production', productionId: 301, projectId: 42 },
      include: ['production_script_brief', 'project_scripts', 'creative_references'],
    }) as Record<string, any>

    assert.equal(result.seedPolicy.mode, 'editable_snapshot')
    assert.equal(result.reviewRoute, '/project/production/orchestration?productionId=301&workspaceId=:workspaceId')
    assert.equal(result.seed.data.production_script_brief.scriptVersionId, 77)
    assert.equal(result.seed.data.production_script_brief.brief, 'Production brief from page.')
    assert.equal(result.seed.data.production_script_brief.body_excerpt, 'A long script body.')
    assert.equal(result.seed.data.creative_references[0].name, 'Hero')
    assert.equal(result.seed.data.project_scripts[0].title, 'Pilot')
    assert.equal(result.seed.data.project_scripts[0].content, undefined)
    assert.deepEqual(result.seed.sourceVersions.production_script_brief, { id: 77, updatedAt: '2026-05-13T00:00:01.000Z' })
  } finally {
    setMCPAPIBaseURL(previousBaseURL)
    globalThis.fetch = previousFetch
  }
})

test('workspace model MCP tool hydrates asset workspace seed from allowed backend includes', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/projects/42': { id: 42, name: 'Seed Project', UpdatedAt: '2026-05-13T00:00:00.000Z' },
    '/projects/42/entities/creative-references': [
      { ID: 7, name: 'Hero', status: 'confirmed', UpdatedAt: '2026-05-13T00:00:01.000Z' },
      { ID: 8, name: 'Old Hero', status: 'ignored', UpdatedAt: '2026-05-13T00:00:01.000Z' },
      { ID: 10, name: 'Merged Hero', status: 'merged', UpdatedAt: '2026-05-13T00:00:01.000Z' },
    ],
    '/projects/42/entities/asset-slots?include_internal=true': [
      { ID: 9, name: 'Hero portrait', status: 'missing', owner_type: 'creative_reference', owner_id: 7, UpdatedAt: '2026-05-13T00:00:02.000Z' },
      { ID: 11, name: 'Hero internal candidate shell', status: 'missing', owner_type: 'asset_slot', owner_id: 9, UpdatedAt: '2026-05-13T00:00:02.500Z' },
      { ID: 12, name: 'Waived portrait', status: 'waived', owner_type: 'creative_reference', owner_id: 7, UpdatedAt: '2026-05-13T00:00:02.000Z' },
      { ID: 13, name: 'Merged portrait', status: 'merged', owner_type: 'creative_reference', owner_id: 7, UpdatedAt: '2026-05-13T00:00:02.000Z' },
      { ID: 14, name: 'Ignored portrait', status: 'ignored', owner_type: 'creative_reference', owner_id: 7, UpdatedAt: '2026-05-13T00:00:02.000Z' },
    ],
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await getWorkspaceModelContract({
      kind: 'asset_workspace',
      target: { entityType: 'project', entityId: 42 },
      include: ['project', 'creative_references', 'asset_slots', 'asset_slot_ownership'],
    }) as Record<string, any>

    assert.equal(result.seed.hydrated, true)
    assert.equal(result.seed.data.project.name, 'Seed Project')
    assert.equal(result.seed.data.creative_references[0].name, 'Hero')
    assert.deepEqual(result.seed.data.creative_references.map((item: any) => item.ID), [7])
    assert.equal(result.seed.data.asset_slots[0].owner_type, 'creative_reference')
    assert.deepEqual(result.seed.data.asset_slots.map((item: any) => item.ID), [9, 11])
    assert.deepEqual(result.seed.data.asset_slot_ownership.map((item: any) => item.id), [9, 11])
    assert.deepEqual(result.seed.sourceVersions.project, { id: 42, updatedAt: '2026-05-13T00:00:00.000Z' })
  } finally {
    setMCPAPIBaseURL(previousBaseURL)
    globalThis.fetch = previousFetch
  }
})

test('semantic query tools expose creative references and linked asset slots', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/projects/42/entities/creative-references?kind=person': [
      { ID: 11, project_id: 42, kind: 'person', name: '女主', description: '主角', status: 'confirmed' },
      { ID: 12, project_id: 42, kind: 'person', name: '路人', description: '背景角色', status: 'workspace' },
    ],
    '/projects/42/entities/creative-reference-states?creative_reference_id=11': [
      { ID: 21, creative_reference_id: 11, name: '雨夜状态', emotion: '紧张' },
    ],
    '/projects/42/entities/asset-slots?include_internal=true': [
      { ID: 31, owner_type: 'creative_reference', owner_id: 11, creative_reference_id: 11, name: '女主标准头像', kind: 'image', status: 'missing' },
      { ID: 32, owner_type: 'creative_reference_state', owner_id: 21, creative_reference_state_id: 21, name: '雨夜服装', kind: 'image', status: 'missing' },
      { ID: 33, owner_type: 'creative_reference', owner_id: 12, creative_reference_id: 12, name: '路人头像', kind: 'image', status: 'missing' },
    ],
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await queryCreativeReferences({
      projectId: 42,
      kind: 'person',
      creative_reference_id: 11,
      include_states: true,
      include_asset_slots: true,
    }) as Record<string, any>

    assert.equal(result.returned, 1)
    assert.equal(result.count, 1)
    assert.equal(result.total_count, 2)
    assert.deepEqual(result.references.map((item: any) => item.ID), [11])
    assert.deepEqual(result.states.map((item: any) => item.ID), [21])
    assert.deepEqual(result.asset_slots.map((item: any) => item.ID), [31, 32])
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL('http://localhost:8765')
  }
})

test('semantic query creative reference count is filtered and total_count preserves raw backend total', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/projects/42/entities/creative-references?kind=person': [
      { ID: 11, project_id: 42, kind: 'person', name: '女主', description: '主角', status: 'confirmed' },
      { ID: 12, project_id: 42, kind: 'person', name: '路人', description: '背景角色', status: 'workspace' },
    ],
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await queryCreativeReferences({
      projectId: 42,
      kind: 'person',
      query: '不存在的设定',
    }) as Record<string, any>

    assert.equal(result.count, 0)
    assert.equal(result.total_count, 2)
    assert.equal(result.returned, 0)
    assert.deepEqual(result.references, [])
    assert.match(result.note, /Filters matched no creative references/)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL('http://localhost:8765')
  }
})

test('semantic query creative references matches Chinese names from backend rows', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/projects/42/entities/creative-references': [
      { ID: 10, project_id: 42, workspace_client_id: 'cr_zhou_dehou', kind: 'character', name: '周德厚', description: '周建国父亲', status: 'needs_review' },
      { ID: 11, project_id: 42, workspace_client_id: 'cr_jiuye', kind: 'character', name: '舅爷', description: '周家长辈，带领族亲公审周建国。', status: 'needs_review' },
      { ID: 12, project_id: 42, workspace_client_id: 'cr_laoyang', kind: 'character', name: '老杨', description: '陈家坳村长', status: 'needs_review' },
    ],
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await queryCreativeReferences({
      projectId: 42,
      query: '舅爷',
    }) as Record<string, any>

    assert.equal(result.count, 1)
    assert.equal(result.total_count, 3)
    assert.equal(result.returned, 1)
    assert.deepEqual(result.references.map((item: any) => item.ID), [11])
    assert.equal(result.references[0]?.name, '舅爷')
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL('http://localhost:8765')
  }
})

test('semantic query creative references exposes hidden-character query mismatch', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/projects/42/entities/creative-references': [
      { ID: 11, project_id: 42, workspace_client_id: 'cr_jiuye', kind: 'character', name: '舅爷', description: '周家长辈，带领族亲公审周建国。', status: 'needs_review' },
    ],
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await queryCreativeReferences({
      projectId: 42,
      query: '舅\u200b爷',
    }) as Record<string, any>

    assert.equal(result.count, 0)
    assert.equal(result.total_count, 1)
    assert.equal(result.returned, 0)
    assert.deepEqual(result.references, [])
    assert.match(result.note, /Filters matched no creative references/)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL('http://localhost:8765')
  }
})

test('semantic query tools expose production context and content unit generation context', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/projects/42/entities/segments?production_id=7': [
      { ID: 101, production_id: 7, title: '压抑铺垫', kind: 'emotional_function', summary: '低落到紧张' },
    ],
    '/projects/42/entities/scene-moments?segment_id=101': [
      { ID: 201, segment_id: 101, title: '雨夜对峙', mood: '紧张' },
    ],
    '/projects/42/entities/content-units?production_id=7&segment_id=101&scene_moment_id=201': [
      { ID: 301, production_id: 7, segment_id: 101, scene_moment_id: 201, title: '女主抬头', prompt: 'close up' },
    ],
    '/projects/42/entities/keyframes?production_id=7&scene_moment_id=201&content_unit_id=301': [
      { ID: 401, production_id: 7, scene_moment_id: 201, content_unit_id: 301, title: '开头帧', prompt: 'close up', resource_id: 88, status: 'workspace' },
      { ID: 402, production_id: 7, scene_moment_id: 201, content_unit_id: 301, title: '候选：开头帧', status: 'candidate', metadata_json: '{"source":"ai_generated_keyframe_candidate","target_keyframe_id":401}' },
    ],
    'POST /projects/42/entities/content-units/301/generation-context': {
      target: { type: 'content_unit', content_unit: { ID: 301, title: '女主抬头' } },
      intent: 'video',
      creative_references: [],
      asset_slots: [],
      keyframes: [],
      constraints: { read_only_entities: [], write_targets: [] },
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await queryProductionContext({
      projectId: 42,
      production_id: 7,
      segment_id: 101,
      scene_moment_id: 201,
      content_unit_id: 301,
      include: ['segments', 'scene_moments', 'content_units', 'keyframes'],
      include_generation_context: true,
    }) as Record<string, any>

    assert.deepEqual(result.segments.map((item: any) => item.ID), [101])
    assert.deepEqual(result.scene_moments.map((item: any) => item.ID), [201])
    assert.deepEqual(result.content_units.map((item: any) => item.ID), [301])
    assert.deepEqual(result.keyframes.map((item: any) => item.ID), [401])
    assert.equal(result.keyframes[0].resource_id, 88)
    assert.equal(result.generation_context.target.content_unit.ID, 301)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL('http://localhost:8765')
  }
})

test('applyWorkspaceReview posts direct asset workspace snapshot rows to asset workspace apply', async () => {
  const postedBodies: Array<Record<string, unknown>> = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    'POST /projects/4/entities/asset-workspaces/apply': (body: Record<string, unknown>) => {
      postedBodies.push(body)
      return { counts: { asset_slots_created: 3 } }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const proposedValue = JSON.stringify({
      schema: 'movscript.asset_workspace.v1',
      mode: 'snapshot',
      summary: '批量提交：3 项',
      workspace: {
        asset_slots: [{
          client_id: 'slot_001',
          owner_type: 'scene_moment',
          owner_id: 7,
          name: '周建国重生惊醒关键帧',
          kind: 'image',
          description: '对应情景ID=7的核心镜头',
          priority: 'high',
        }],
        creative_references: [{ name: 'Should be dropped' }],
      },
    })

    const result = await applyWorkspaceReview({
      review: {
        workspaceKind: 'note',
        target: { projectId: 4, entityType: 'project', entityId: 4, field: 'workspace' },
        proposedValue,
      },
    }) as Record<string, any>

    assert.equal(result.performed, true)
    assert.equal(result.url, 'http://mock.backend/api/v1/projects/4/entities/asset-workspaces/apply')
    assert.equal(postedBodies[0].scope, 'asset_workspace')
    assert.equal(postedBodies[0].mode, 'snapshot')
    assert.deepEqual(postedBodies[0].workspace, {
      creative_references: [],
      asset_slots: [{
        client_id: 'slot_001',
        owner_type: 'scene_moment',
        owner_id: 7,
        kind: 'image',
        name: '周建国重生惊醒关键帧',
        description: '对应情景ID=7的核心镜头',
        priority: 'high',
      }],
    })
  } finally {
    setMCPAPIBaseURL('http://localhost:8765')
    globalThis.fetch = previousFetch
  }
})

test('applyWorkspaceReview allows omitted asset ids because workspace is the desired snapshot', async () => {
  const postedBodies: Array<Record<string, unknown>> = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    'POST /projects/4/entities/asset-workspaces/apply': (body: Record<string, unknown>) => {
      postedBodies.push(body)
      return { counts: { asset_slots_deleted: 1 } }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await applyWorkspaceReview({
      review: {
        workspaceKind: 'asset_workspace',
        target: { projectId: 4, entityType: 'project', entityId: 4, field: 'workspace' },
        proposedValue: JSON.stringify({
          schema: 'movscript.asset_workspace.v1',
          mode: 'snapshot',
          workspace: {
            asset_slots: [{ id: 12, name: 'Edited slot', kind: 'image', status: 'active' }],
          },
        }),
      },
    }) as Record<string, any>
    assert.equal(result.performed, true)
    assert.deepEqual(postedBodies[0]?.workspace, {
      creative_references: [],
      asset_slots: [{ id: 12, name: 'Edited slot', kind: 'image', status: 'active' }],
    })
  } finally {
    setMCPAPIBaseURL('http://localhost:8765')
    globalThis.fetch = previousFetch
  }
})

test('applyWorkspaceReview normalizes project standards shot size object arrays before apply', async () => {
  const postedBodies: Array<Record<string, unknown>> = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    'POST /projects/4/entities/project-standards-workspaces/apply': (body: Record<string, unknown>) => {
      postedBodies.push(body)
      return { counts: { project_style_updated: 1 } }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await applyWorkspaceReview({
      review: {
        workspaceKind: 'project_standards_workspace',
        target: { projectId: 4, entityType: 'project', entityId: 4, field: 'workspace' },
        proposedValue: JSON.stringify({
          schema: 'movscript.project_standards_workspace.v1',
          scope: 'project_standards_workspace',
          mode: 'snapshot',
          workspace: {
            project_style: {
              aspect_ratio: '9:16',
              shot_size_system: [{
                key: 'CU',
                label: '特写',
                usage: '用于人物表情反转。',
                composition: '头肩构图。',
              }],
              negative_rules: ['不得出现现代手机'],
            },
          },
        }),
      },
    }) as Record<string, any>

    assert.equal(result.performed, true)
    assert.deepEqual((postedBodies[0].workspace as any).project_style.shot_size_system, ['CU 特写：用于人物表情反转。；头肩构图。'])
  } finally {
    setMCPAPIBaseURL('http://localhost:8765')
    globalThis.fetch = previousFetch
  }
})

test('applyWorkspaceReview rejects direct candidate resource writes for asset slots and keyframes', async () => {
  await assert.rejects(() => applyWorkspaceReview({
    review: {
      target: { projectId: 4, entityType: 'asset_slot', entityId: 7, field: 'resource_id' },
      proposedValue: 88,
    },
  }), /apply_workspace cannot write field resource_id on asset_slot/)

  await assert.rejects(() => applyWorkspaceReview({
    review: {
      target: { projectId: 4, entityType: 'asset_slot', entityId: 7, field: 'locked_asset_slot_id' },
      proposedValue: 19,
    },
  }), /apply_workspace cannot write field locked_asset_slot_id on asset_slot/)

  await assert.rejects(() => applyWorkspaceReview({
    review: {
      target: { projectId: 4, entityType: 'keyframe', entityId: 17, field: 'resource_id' },
      proposedValue: 88,
    },
  }), /apply_workspace cannot write field resource_id on keyframe/)
})

test('applyWorkspaceReview rejects legacy production workspace action payloads', async () => {
  await assert.rejects(() => applyWorkspaceReview({
    review: {
      workspaceKind: 'production_workspace',
      target: { projectId: 4, entityType: 'production', entityId: 9, field: 'workspace' },
      proposedValue: JSON.stringify({
        schema: 'movscript.production_workspace.v1',
        mode: 'snapshot',
        productionId: 9,
        workspace: {
          segments: [{
            action: 'create',
            title: 'Opening',
            scene_moments: [],
          }],
        },
      }),
    },
  }), /must not include action fields/)
})

test('listModels returns raw models plus compact agent contracts from backend model contracts', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/models?capability=image': [
      backendModelFixture(42),
      backendModelFixture(42),
    ],
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await listModels({ capability: 'image' }) as Record<string, any>
    assert.equal(result.count, 1)
    assert.deepEqual(result.queries, ['capability:image'])
    assert.equal(result.models.length, 1)
    assert.equal(result.model_contracts.length, 1)
    assert.deepEqual(agentCompactContractFields(result.model_contracts[0]), loadAgentCompactContractFixture())
    assert.equal(result.model_contracts[0].model_config_id, undefined)
    assert.equal(result.model_contracts[0].params_schema_loaded, true)
    assert.equal(result.model_contracts[0].params_schema_rule_count, 1)
  } finally {
    setMCPAPIBaseURL(previousBaseURL)
    globalThis.fetch = previousFetch
  }
})

test('listModels queries backend by runtime capability only', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/models?capability=image_edit': [minimalBackendModelFixture(41, ['image_edit'])],
    '/models?capability=image': [minimalBackendModelFixture(42, ['image'])],
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const imageEdit = await listModels({ capability: 'image_edit' }) as Record<string, any>
    assert.deepEqual(imageEdit.queries, ['capability:image_edit'])
    assert.equal(imageEdit.model_contracts[0].model_id, 'model.41')

    const imageCapability = await listModels({ capability: 'image' }) as Record<string, any>
    assert.deepEqual(imageCapability.queries, ['capability:image'])
    assert.equal(imageCapability.model_contracts[0].model_id, 'model.42')
  } finally {
    setMCPAPIBaseURL(previousBaseURL)
    globalThis.fetch = previousFetch
  }
})

test('listModels preserves distinct contracts for the same logical model', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/models?capability=image': [
      {
        ...backendModelFixture(42),
        model_id: 'gpt-image-1-fast',
        logical_model_id: 'gpt-image-1',
        supported_params: [{
          key: 'image_size',
          label: 'Image Size',
          type: 'select',
          options: ['1024x1024'],
          default: '1024x1024',
        }],
        params_schema: {
          type: 'object',
          properties: {
            image_size: { type: 'string', enum: ['1024x1024'], default: '1024x1024' },
          },
        },
      },
      {
        ...backendModelFixture(43),
        model_id: 'gpt-image-1-quality',
        logical_model_id: 'gpt-image-1',
        supported_params: [{
          key: 'image_size',
          label: 'Image Size',
          type: 'select',
          options: ['1536x1024'],
          default: '1536x1024',
        }],
        params_schema: {
          type: 'object',
          properties: {
            image_size: { type: 'string', enum: ['1536x1024'], default: '1536x1024' },
          },
        },
      },
    ],
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await listModels({ capability: 'image' }) as Record<string, any>
    assert.equal(result.count, 2)
    assert.equal(result.models.length, 2)
    assert.equal(result.model_contracts.length, 2)
    assert.deepEqual(result.model_contracts.map((contract: Record<string, unknown>) => contract.model_id), ['gpt-image-1-fast', 'gpt-image-1-quality'])
    assert.deepEqual(result.model_contracts.map((contract: Record<string, any>) => contract.supported_params[0].options), [['1024x1024'], ['1536x1024']])
    assert.deepEqual(result.model_contracts.map((contract: Record<string, unknown>) => contract.logical_model_id), ['gpt-image-1', 'gpt-image-1'])
  } finally {
    setMCPAPIBaseURL(previousBaseURL)
    globalThis.fetch = previousFetch
  }
})

test.skip('createGenerationJob returns queued monitor and param validation audit for filtered params', async () => {
  const postedBodies: Array<Record<string, unknown>> = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/models?capability=image_edit': [backendModelFixture(42)],
    '/models?capability=image': [backendModelFixture(42)],
    'POST /jobs': (body: Record<string, unknown>) => {
      postedBodies.push(body)
      return {
        id: 101,
        status: 'pending',
        job_type: body.job_type,
        model_config_id: body.model_config_id,
      }
    },
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await createGenerationJob({
      prompt: 'a production frame',
      job_type: 'image_edit',
      model_id: 'video.workspace',
      wait: false,
      input_resource_ids: [1, 2, 3, 4, 5],
      aspect_ratio: '21:9',
      extra_params: {
        resolution: '720p',
        frames: 10,
        unsupported_flag: true,
      },
    }) as Record<string, any>

    assert.equal(result.status, 'queued')
    assert.equal(result.jobId, 101)
    assert.deepEqual(result.monitor, {
      tool: 'generation_job_wait',
      args: { jobIds: [101], timeout_ms: 180000, heartbeat_ms: 15000 },
      message: 'Generation is asynchronous. Wait for this job to reach a terminal status before claiming completion.',
    })
    assert.deepEqual(result.param_validation, {
      audit_version: 1,
      model_config_id: 42,
      model_contract_loaded: true,
      params_schema_loaded: true,
      params_schema_rule_count: 1,
      input_requirements: {
        image: { min: 1, max: 4 },
        video: { min: 0, max: 0 },
      },
      submitted_inputs: {
        image: 5,
        video: 0,
      },
      supported_params: ['workspace', 'frames', 'image_count', 'resolution', 'return_last_frame', 'sequential_image_generation'],
      submitted_extra_params: ['frames', 'resolution'],
      provided_extra_params: ['frames', 'resolution', 'unsupported_flag'],
      dropped_extra_params: ['unsupported_flag'],
      dropped_top_level_params: ['aspect_ratio'],
      drop_reasons: {
        aspect_ratio: 'unsupported_top_level_param',
        unsupported_flag: 'unsupported_extra_param',
      },
      preflight_errors: [
        {
          code: 'INVALID_PARAMETER_OPTION',
          field: 'resolution',
          message: 'parameter "resolution" is not in the local model contract options',
          allowed_values: ['360p', '480p'],
          suggested_fix: { resolution: '360p' },
        },
        {
          code: 'INVALID_PARAMETER_OPTION',
          field: 'frames',
          message: 'parameter "frames" is not in the local model contract options',
          allowed_values: [29, 33, 37],
          suggested_fix: { frames: 29 },
        },
        {
          code: 'INVALID_PARAMETER_COMBINATION',
          field: 'frames',
          message: 'parameter "frames" conflicts with "resolution" in the local model contract',
          suggested_fix: { resolution: null },
        },
      ],
      input_preflight_errors: [
        {
          code: 'INVALID_INPUT_COUNT',
          field: 'image',
          message: 'image generation input count is above the local model contract maximum',
          required_min: 1,
          allowed_max: 4,
          actual_count: 5,
        },
      ],
    })
    assert.equal(postedBodies.length, 1)
    assert.deepEqual(postedBodies[0], {
      model_id: 'video.workspace',
      job_type: 'image_edit',
      feature_key: 'agent.chat_generation',
      title: postedBodies[0]?.title,
      prompt: 'a production frame',
      extra_params: JSON.stringify({ resolution: '720p', frames: 10 }),
      input_resource_ids: [1, 2, 3, 4, 5],
    })
    assert.match(String(postedBodies[0]?.title), /^参考生图-\d{4}$/)
  } finally {
    setMCPAPIBaseURL(previousBaseURL)
    globalThis.fetch = previousFetch
  }
})

test.skip('createGenerationJob expands image_count into independent single-output jobs', async () => {
  const postedBodies: Array<Record<string, unknown>> = []
  const imageModel = {
    ...minimalBackendModelFixture(51, ['image']),
    logical_model_id: 'image.multi',
    model_id: 'image.multi',
    supported_params: [
      { key: 'image_size', type: 'select', options: ['1024x1024'] },
      { key: 'image_count', type: 'number', min: 1, max: 15 },
      { key: 'sequential_image_generation', type: 'select', options: ['auto'] },
    ],
    params_schema: {
      type: 'object',
      properties: {
        image_size: { type: 'string', enum: ['1024x1024'] },
        image_count: { type: 'number', minimum: 1, maximum: 15 },
        sequential_image_generation: { type: 'string', enum: ['auto'] },
      },
    },
  }
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/models?capability=image': [imageModel],
    'POST /jobs': (body: Record<string, unknown>) => {
      postedBodies.push(body)
      return {
        id: 201 + postedBodies.length - 1,
        status: 'pending',
        job_type: body.job_type,
        model_config_id: 51,
      }
    },
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await createGenerationJob({
      prompt: 'two candidate frames',
      job_type: 'image',
      model_id: 'image.multi',
      wait: false,
      extra_params: {
        image_size: '1024x1024',
        image_count: 2,
        sequential_image_generation: 'auto',
      },
    }) as Record<string, any>

    assert.equal(result.status, 'queued')
    assert.equal(result.single_output_jobs, true)
    assert.equal(result.requested_output_count, 2)
    assert.deepEqual(result.jobIds, [201, 202])
    assert.deepEqual(result.monitor.args, {
      jobIds: [201, 202],
      mode: 'any',
      timeout_ms: 180000,
      heartbeat_ms: 15000,
    })
    assert.equal(postedBodies.length, 2)
    assert.deepEqual(postedBodies.map((body) => body.extra_params), [
      JSON.stringify({ image_size: '1024x1024' }),
      JSON.stringify({ image_size: '1024x1024' }),
    ])
    assert.deepEqual(postedBodies.map((body) => body.title), [
      postedBodies[0]?.title,
      String(postedBodies[0]?.title).replace('-1/2', '-2/2'),
    ])
    assert.match(String(postedBodies[0]?.title), /^文生图-\d{4}-1\/2$/)
  } finally {
    setMCPAPIBaseURL(previousBaseURL)
    globalThis.fetch = previousFetch
  }
})

test.skip('waitGenerationJobs batches terminal and pending generation jobs without model-visible polling', async () => {
  const previousFetch = globalThis.fetch
  const requested: string[] = []
  globalThis.fetch = mockFetch({
    '/jobs/101': () => {
      requested.push('/jobs/101')
      return {
        id: 101,
        status: 'succeeded',
        output_resource_ids: [701, 702],
      }
    },
    '/jobs/102': () => {
      requested.push('/jobs/102')
      return {
        id: 102,
        status: 'running',
        progress: 0.4,
      }
    },
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await waitGenerationJobs({
      jobIds: [101, 102],
      timeout_ms: 0,
    }) as Record<string, any>

    assert.equal(result.status, 'timeout')
    assert.equal(result.done, false)
    assert.deepEqual(result.jobIds, [101, 102])
    assert.deepEqual(result.output_resource_ids, [701, 702])
    assert.equal(result.completed.length, 1)
    assert.equal(result.pending.length, 1)
    assert.equal(result.failed.length, 0)
    assert.equal(result.cancelled.length, 0)
    assert.deepEqual(requested.sort(), ['/jobs/101', '/jobs/102'])
  } finally {
    setMCPAPIBaseURL(previousBaseURL)
    globalThis.fetch = previousFetch
  }
})

test.skip('buildGenerationParamValidationAudit exposes model contract filtering decisions', () => {
  assert.deepEqual(
    buildGenerationParamValidationAudit(
      42,
      {
        supportedParamKeys: new Set(['aspect_ratio', 'duration', 'resolution']),
        supportedParams: new Map(),
        rules: emptyGenerationParamRules(),
        inputRequirements: emptyGenerationInputRequirements(),
        paramsSchemaLoaded: true,
        paramsSchemaRuleCount: 2,
      },
      {
        providedKeys: ['resolution', 'unsupported_flag'],
        submittedKeys: ['resolution'],
        droppedKeys: ['unsupported_flag'],
      },
      { aspectRatioRequested: '21:9', aspectRatioSubmitted: undefined },
    ),
    {
      audit_version: 1,
      model_config_id: 42,
      model_contract_loaded: true,
      params_schema_loaded: true,
      params_schema_rule_count: 2,
      input_requirements: {
        image: { min: 0, max: 0 },
        video: { min: 0, max: 0 },
      },
      supported_params: ['aspect_ratio', 'duration', 'resolution'],
      submitted_extra_params: ['resolution'],
      provided_extra_params: ['resolution', 'unsupported_flag'],
      dropped_extra_params: ['unsupported_flag'],
      dropped_top_level_params: ['aspect_ratio'],
      drop_reasons: {
        aspect_ratio: 'unsupported_top_level_param',
        unsupported_flag: 'unsupported_extra_param',
      },
    },
  )
})

test.skip('buildGenerationParamValidationAudit distinguishes missing model contract from empty schema contract', () => {
  assert.deepEqual(
    buildGenerationParamValidationAudit(
      42,
      undefined,
      { providedKeys: ['resolution'], submittedKeys: ['resolution'], droppedKeys: [] },
      {},
    ),
    {
      audit_version: 1,
      model_config_id: 42,
      model_contract_loaded: false,
      params_schema_loaded: false,
      submitted_extra_params: ['resolution'],
      provided_extra_params: ['resolution'],
    },
  )

  assert.deepEqual(
    buildGenerationParamValidationAudit(
      42,
      {
        supportedParamKeys: new Set(),
        supportedParams: new Map(),
        rules: emptyGenerationParamRules(),
        inputRequirements: emptyGenerationInputRequirements(),
        paramsSchemaLoaded: true,
        paramsSchemaRuleCount: 0,
      },
      { providedKeys: ['resolution'], submittedKeys: [], droppedKeys: ['resolution'] },
      {},
    ),
    {
      audit_version: 1,
      model_config_id: 42,
      model_contract_loaded: true,
      params_schema_loaded: true,
      params_schema_rule_count: 0,
      input_requirements: {
        image: { min: 0, max: 0 },
        video: { min: 0, max: 0 },
      },
      supported_params: [],
      submitted_extra_params: [],
      provided_extra_params: ['resolution'],
      dropped_extra_params: ['resolution'],
      drop_reasons: { resolution: 'unsupported_extra_param' },
    },
  )
})

test.skip('generation param validation audit matches canonical v1 fixture shape', () => {
  const fixture = loadParamValidationAuditFixture()
  const audit = buildGenerationParamValidationAudit(
    fixture.model_config_id,
    {
      supportedParamKeys: new Set(fixture.supported_params),
      supportedParams: new Map(),
      rules: emptyGenerationParamRules(),
      inputRequirements: fixture.input_requirements,
      paramsSchemaLoaded: fixture.params_schema_loaded,
      paramsSchemaRuleCount: fixture.params_schema_rule_count,
    },
    {
      providedKeys: fixture.provided_extra_params,
      submittedKeys: fixture.submitted_extra_params,
      droppedKeys: fixture.dropped_extra_params,
      dropReasons: stringRecordFromEntries(Object.entries(fixture.drop_reasons).filter(([key]) => fixture.dropped_extra_params.includes(key))),
      renamedKeys: fixture.renamed_extra_params,
    },
    {
      aspectRatioRequested: '21:9',
      aspectRatioSubmitted: undefined,
      preflightErrors: fixture.preflight_errors,
      submittedInputs: fixture.submitted_inputs,
      inputPreflightErrors: fixture.input_preflight_errors,
    },
  )

  assert.deepEqual(audit, fixture)
})

test.skip('preflightGenerationParams records local contract errors without dropping params', () => {
  const modelParamContract = {
    supportedParamKeys: new Set(['duration', 'frames', 'workspace', 'aspect_ratio']),
    supportedParams: new Map([
      ['duration', { key: 'duration', type: 'select', options: ['5', '10'] }],
      ['frames', { key: 'frames', type: 'number', min: 29, max: 289 }],
      ['workspace', { key: 'workspace', type: 'boolean' }],
      ['aspect_ratio', { key: 'aspect_ratio', type: 'string', options: ['16:9', '9:16'] }],
    ]),
    rules: {
      conflicts: [{ key: 'duration', other: 'frames' }],
      conditionalEnums: [{ key: 'aspect_ratio', whenParam: 'workspace', whenValue: true, options: ['16:9'] }],
      conditionalConsts: [],
      requiresValues: [],
    },
    inputRequirements: emptyGenerationInputRequirements(),
    paramsSchemaLoaded: true,
    paramsSchemaRuleCount: 0,
  }
  const preflightErrors = preflightGenerationParams({
    duration: '6',
    frames: 10,
    workspace: true,
    aspect_ratio: '1:1',
  }, modelParamContract)

  assert.deepEqual(preflightErrors, [
    {
      code: 'INVALID_PARAMETER_OPTION',
      field: 'duration',
      message: 'parameter "duration" is not in the local model contract options',
      allowed_values: ['5', '10'],
      suggested_fix: { duration: '5' },
    },
    {
      code: 'INVALID_PARAMETER_RANGE',
      field: 'frames',
      message: 'parameter "frames" is below the local model contract minimum',
    },
    {
      code: 'INVALID_PARAMETER_OPTION',
      field: 'aspect_ratio',
      message: 'parameter "aspect_ratio" is not in the local model contract options',
      allowed_values: ['16:9', '9:16'],
      suggested_fix: { aspect_ratio: '16:9' },
    },
    {
      code: 'INVALID_PARAMETER_COMBINATION',
      field: 'duration',
      message: 'parameter "duration" conflicts with "frames" in the local model contract',
      suggested_fix: { frames: null },
    },
    {
      code: 'INVALID_PARAMETER_COMBINATION',
      field: 'aspect_ratio',
      message: 'parameter "aspect_ratio" is not allowed for "workspace" in the local model contract',
      allowed_values: ['16:9'],
      suggested_fix: { aspect_ratio: '16:9' },
    },
  ])

  assert.deepEqual(
    buildGenerationParamValidationAudit(
      42,
      modelParamContract,
      { providedKeys: ['duration'], submittedKeys: ['duration'], droppedKeys: [], submittedParams: { duration: '6' } },
      { preflightErrors },
    ).preflight_errors,
    preflightErrors,
  )
})

test.skip('preflightGenerationParams records compact conditional const and requires value rules', () => {
  const modelParamContract = {
    supportedParamKeys: new Set(['workspace', 'return_last_frame', 'image_count', 'sequential_image_generation']),
    supportedParams: new Map([
      ['workspace', { key: 'workspace', type: 'boolean' }],
      ['return_last_frame', { key: 'return_last_frame', type: 'boolean' }],
      ['image_count', { key: 'image_count', type: 'number', min: 1, max: 15 }],
      ['sequential_image_generation', { key: 'sequential_image_generation', type: 'select', options: ['disabled', 'auto'] }],
    ]),
    rules: {
      conflicts: [],
      conditionalEnums: [],
      conditionalConsts: [{ key: 'return_last_frame', whenParam: 'workspace', whenValue: true, value: false }],
      requiresValues: [{ key: 'image_count', param: 'sequential_image_generation', value: 'auto' }],
    },
    inputRequirements: emptyGenerationInputRequirements(),
    paramsSchemaLoaded: true,
    paramsSchemaRuleCount: 2,
  }

  assert.deepEqual(
    preflightGenerationParams({
      workspace: true,
      return_last_frame: true,
      image_count: 3,
      sequential_image_generation: 'disabled',
    }, modelParamContract),
    [
      {
        code: 'INVALID_PARAMETER_COMBINATION',
        field: 'return_last_frame',
        message: 'parameter "return_last_frame" must match the required value for "workspace" in the local model contract',
        allowed_values: [false],
        suggested_fix: { return_last_frame: false },
      },
      {
        code: 'INVALID_PARAMETER_COMBINATION',
        field: 'image_count',
        message: 'parameter "image_count" requires "sequential_image_generation" in the local model contract',
        allowed_values: ['auto'],
        suggested_fix: { sequential_image_generation: 'auto' },
      },
    ],
  )
})

test.skip('buildGenerationModelParamRules deduplicates mirrored conflict preflight rules', () => {
  const supportedParams = [
    { key: 'duration', type: 'select', options: ['5'], conflicts_with: ['frames'] },
    { key: 'frames', type: 'number', min: 29, max: 289, conflicts_with: ['duration'] },
  ]
  const modelParamContract = {
    supportedParamKeys: new Set(['duration', 'frames']),
    supportedParams: new Map([
      ['duration', { key: 'duration', type: 'select', options: ['5'] }],
      ['frames', { key: 'frames', type: 'number', min: 29, max: 289 }],
    ]),
    rules: buildGenerationModelParamRules(supportedParams),
    inputRequirements: emptyGenerationInputRequirements(),
    paramsSchemaLoaded: false,
  }
  assert.deepEqual(modelParamContract.rules.conflicts, [{ key: 'duration', other: 'frames' }])

  assert.deepEqual(
    preflightGenerationParams({ duration: '5', frames: 29 }, modelParamContract),
    [{
      code: 'INVALID_PARAMETER_COMBINATION',
      field: 'duration',
      message: 'parameter "duration" conflicts with "frames" in the local model contract',
      suggested_fix: { frames: null },
    }],
  )
})

function emptyGenerationParamRules() {
  return { conflicts: [], conditionalEnums: [], conditionalConsts: [], requiresValues: [] }
}

function emptyGenerationInputRequirements() {
  return { image: { min: 0, max: 0 }, video: { min: 0, max: 0 } }
}

test.skip('normalizeGenerationExtraParams canonicalizes supported aliases before filtering', () => {
  assert.deepEqual(
    normalizeGenerationExtraParams(
      {
        ratio: '16:9',
        aspect_ratio: '9:16',
        duration_seconds: 5,
        size: '1024x1024',
        guidance_scale: 2.5,
        max_images: 4,
        camera_fixed: true,
        generate_audio: false,
        unsupported_flag: true,
      },
      new Set(['aspect_ratio', 'duration', 'image_size', 'prompt_strength', 'image_count', 'fixed_camera', 'audio']),
    ),
    {
      extraParams: JSON.stringify({ aspect_ratio: '9:16', duration: 5, image_size: '1024x1024', prompt_strength: 2.5, image_count: 4, fixed_camera: true, audio: false }),
      providedKeys: ['ratio', 'aspect_ratio', 'duration_seconds', 'size', 'guidance_scale', 'max_images', 'camera_fixed', 'generate_audio', 'unsupported_flag'],
      submittedKeys: ['aspect_ratio', 'duration', 'image_size', 'prompt_strength', 'image_count', 'fixed_camera', 'audio'],
      droppedKeys: ['unsupported_flag'],
      submittedParams: { aspect_ratio: '9:16', duration: 5, image_size: '1024x1024', prompt_strength: 2.5, image_count: 4, fixed_camera: true, audio: false },
      dropReasons: { unsupported_flag: 'unsupported_extra_param' },
      renamedKeys: {
        ratio: 'aspect_ratio',
        duration_seconds: 'duration',
        size: 'image_size',
        guidance_scale: 'prompt_strength',
        max_images: 'image_count',
        camera_fixed: 'fixed_camera',
        generate_audio: 'audio',
      },
    },
  )
})

test.skip('normalizeGenerationExtraParams aliases match the shared manifest', () => {
  const aliases = loadModelParamAliasManifest()
  const audit = normalizeGenerationExtraParams(
    Object.fromEntries(Object.keys(aliases).map((key) => [key, 'value'])),
    new Set(Object.values(aliases)),
  )
  assert.deepEqual(audit.renamedKeys, aliases)
  assert.deepEqual(audit.submittedKeys.sort(), Object.values(aliases).sort())
})

function loadModelParamAliasManifest(): Record<string, string> {
  return JSON.parse(readFileSync(resolve(process.cwd(), '../../contracts/model-param-aliases.json'), 'utf8')) as Record<string, string>
}

function loadAgentCompactContractFixture(): Record<string, any> {
  return JSON.parse(readFileSync(resolve(process.cwd(), '../../contracts/agent/agent-compact-contract-v1.fixture.json'), 'utf8')) as Record<string, any>
}

function loadParamValidationAuditFixture(): Record<string, any> {
  return JSON.parse(readFileSync(resolve(process.cwd(), '../../contracts/agent/agent-param-validation-audit-v1.fixture.json'), 'utf8')) as Record<string, any>
}

function loadStaticCatalogTool(fileName: string): Record<string, any> {
  const mappedPath: Record<string, string> = {
    'list-models.tool.json': '../../apps/agent/catalog/tools/generation/model-list.tool.json',
    'create-job.tool.json': '../../apps/agent/catalog/tools/generation/job-create.tool.json',
    'attach-asset-slot-candidate.tool.json': '../../apps/agent/catalog/tools/candidate/asset-slot-attach.tool.json',
    'attach-keyframe-candidate.tool.json': '../../apps/agent/catalog/tools/candidate/keyframe-attach.tool.json',
  }
  const candidatePaths = [
    mappedPath[fileName],
  ].filter((item): item is string => typeof item === 'string')
  for (const path of candidatePaths) {
    const fullPath = resolve(process.cwd(), path)
    if (existsSync(fullPath)) return JSON.parse(readFileSync(fullPath, 'utf8')) as Record<string, any>
  }
  const fallbackName: Record<string, string> = {
    'create-job.tool.json': 'generation_job_create',
    'wait-jobs.tool.json': 'generation_job_wait',
  }
  const fallbackTool = listTools().find((tool) => tool.name === fallbackName[fileName])
  if (fallbackTool) return fallbackTool as Record<string, any>
  throw new Error(`missing static catalog tool ${fileName}`)
}

function schemaShapeWithoutDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(schemaShapeWithoutDescriptions)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'description')
      .map(([key, nestedValue]) => [key, schemaShapeWithoutDescriptions(nestedValue)]),
  )
}

function schemaProperties(value: unknown): Record<string, unknown> {
  return isRecord(value) && isRecord(value.properties) ? value.properties : {}
}

function schemaDescription(value: unknown): string {
  return isRecord(value) && typeof value.description === 'string' ? value.description : ''
}

function stringRecordFromEntries(entries: Array<[string, unknown]>): Record<string, string> {
  return Object.fromEntries(entries.filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

let currentMockAuthHeader = ''

function mockFetch(routes: Record<string, unknown | ((body: Record<string, unknown>) => unknown)>) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    currentMockAuthHeader = headers.get('Authorization') ?? ''
    const key = `${url.pathname}${url.search}`
    const routeKey = key in routes ? key : key.startsWith('/api/v1/') ? key.slice('/api/v1'.length) : key
    const methodRouteKey = `${method.toUpperCase()} ${routeKey}`
    const matchedKey = methodRouteKey in routes ? methodRouteKey : routeKey
    if (!(matchedKey in routes)) {
      return new Response(JSON.stringify({ error: `missing route ${key}` }), { status: 404, headers: { 'content-type': 'application/json' } })
    }
    const route = routes[matchedKey]
    const requestBody = init?.body !== undefined ? jsonBodyFromFetchInit(init.body) : input instanceof Request ? await requestJSONBody(input) : {}
    const responseBody = typeof route === 'function' ? route(requestBody) : route
    if (responseBody instanceof Response) return responseBody
    return new Response(JSON.stringify(responseBody), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

function jsonBodyFromFetchInit(body: BodyInit | null): Record<string, unknown> {
  if (typeof body !== 'string' || !body.trim()) return {}
  const value = JSON.parse(body)
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

async function requestJSONBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.clone().text()
  if (!text.trim()) return {}
  const value = JSON.parse(text)
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function backendModelFixture(id: number): Record<string, unknown> {
  const contract = loadAgentCompactContractFixture()
  return {
    id,
    display_name: 'Workspace Video',
    short_name: 'workspace-video',
    logical_model_id: 'video.workspace',
    capabilities: ['video', 'video_i2v'],
    accepts_image_input: true,
    input_requirements: contract.input_requirements,
    supported_params: contract.supported_params,
    params_schema: {
      type: 'object',
      properties: Object.fromEntries(contract.supported_params.map((param: any) => [param.key, paramSchemaFixture(param)])),
      allOf: [{ if: { properties: { workspace: { const: true } } }, then: { properties: { resolution: { enum: ['480p'] } } } }],
    },
  }
}

function minimalBackendModelFixture(id: number, capabilities: string[]): Record<string, unknown> {
  return {
    id,
    display_name: `Model ${id}`,
    short_name: `model-${id}`,
    logical_model_id: `model.${id}`,
    capabilities,
    accepts_image_input: capabilities.includes('image_edit') || capabilities.includes('video_i2v'),
    input_requirements: {
      image: { min: capabilities.includes('image_edit') || capabilities.includes('video_i2v') ? 1 : 0, max: capabilities.includes('image_edit') || capabilities.includes('video_i2v') ? 1 : 0 },
      video: { min: 0, max: 0 },
    },
    supported_params: [],
  }
}

function paramSchemaFixture(param: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (param.type === 'boolean') out.type = 'boolean'
  else if (param.type === 'number') out.type = 'number'
  else out.type = 'string'
  if (Array.isArray(param.enum)) out.enum = param.enum
  else if (Array.isArray(param.options)) out.enum = param.options
  if (param.default !== undefined) out.default = param.default
  if (param.min !== undefined) out.minimum = param.min
  if (param.max !== undefined) out.maximum = param.max
  if (param.step !== undefined) out.multipleOf = param.step
  if (param.description !== undefined) out.description = param.description
  return out
}

function agentCompactContractFields(contract: Record<string, unknown>): Record<string, unknown> {
  return {
    contract_version: contract.contract_version,
    model_id: contract.model_id,
    display_name: contract.display_name,
    short_name: contract.short_name,
    logical_model_id: contract.logical_model_id,
    capabilities: contract.capabilities,
    accepts_image_input: contract.accepts_image_input,
    input_requirements: contract.input_requirements,
    supported_param_keys: contract.supported_param_keys,
    supported_params: contract.supported_params,
    params_schema_loaded: contract.params_schema_loaded,
    params_schema_rule_count: contract.params_schema_rule_count,
  }
}

test('summarizeModelContractForAgent exposes compact model capability contract', () => {
  const expectedContract = loadAgentCompactContractFixture()
  assert.deepEqual(
    agentCompactContractFields(summarizeModelContractForAgent({
      id: 42,
      display_name: 'Workspace Video',
      short_name: 'workspace-video',
      logical_model_id: 'video.workspace',
      capabilities: ['video', 'video_i2v', 'video'],
      accepts_image_input: true,
      input_requirements: {
        image: { min: 1, max: 4 },
        video: { min: 0, max: 0 },
      },
      supported_params: [
        {
          key: 'workspace',
          label: 'Workspace',
          type: 'boolean',
        },
        {
          key: 'resolution',
          label: 'Resolution',
          type: 'select',
          options: ['480p', '720p'],
          default: '480p',
          conditional_enum: [{ when_param: 'workspace', when_value: true, options: ['480p'] }],
        },
        {
          key: 'frames',
          label: 'Frames',
          type: 'number',
          min: 0,
          max: 0,
          step: 4,
          conflicts_with: ['resolution'],
        },
        {
          key: 'return_last_frame',
          label: 'Return Last Frame',
          type: 'boolean',
          default: false,
          conditional_const: [{ when_param: 'workspace', when_value: true, value: false }],
        },
        {
          key: 'sequential_image_generation',
          label: 'Sequential',
          type: 'select',
          options: ['disabled', 'auto'],
        },
        {
          key: 'image_count',
          label: 'Image Count',
          type: 'number',
          default: 1,
          min: 1,
          max: 15,
          requires_value: [{ param: 'sequential_image_generation', value: 'auto' }],
        },
      ],
      params_schema: {
        type: 'object',
        properties: {
          workspace: { type: 'boolean' },
          resolution: { type: 'string', enum: ['360p', '480p'] },
          frames: {
            type: 'number',
            minimum: 0,
            maximum: 0,
            enum: [29, 33, 37],
            description: 'Frame count must match 25 + 4n.',
          },
          return_last_frame: { type: 'boolean', default: false },
          sequential_image_generation: { type: 'string', enum: ['disabled', 'auto'] },
          image_count: { type: 'number', default: 1, minimum: 1, maximum: 15 },
        },
        allOf: [{ if: { properties: { workspace: { const: true } } }, then: { properties: { resolution: { enum: ['480p'] } } } }],
      },
    })),
    expectedContract,
  )
})

test('preview agent contract supported params round-trip through agent summarizer', () => {
  const expectedContract = loadAgentCompactContractFixture()
  assert.deepEqual(
    agentCompactContractFields(summarizeModelContractForAgent({
      id: 42,
      display_name: 'Workspace Video',
      short_name: 'workspace-video',
      logical_model_id: 'video.workspace',
      capabilities: ['video', 'video_i2v'],
      accepts_image_input: true,
      input_requirements: {
        image: { min: 1, max: 4 },
        video: { min: 0, max: 0 },
      },
      supported_params: expectedContract.supported_params,
      params_schema: {
        type: 'object',
        properties: {
          workspace: { type: 'boolean' },
          resolution: { type: 'string', enum: ['360p', '480p'] },
          frames: {
            type: 'number',
            minimum: 0,
            maximum: 0,
            multipleOf: 4,
            enum: [29, 33, 37],
            description: 'Frame count must match 25 + 4n.',
          },
          return_last_frame: { type: 'boolean', default: false },
          sequential_image_generation: { type: 'string', enum: ['disabled', 'auto'] },
          image_count: { type: 'number', default: 1, minimum: 1, maximum: 15 },
        },
        allOf: [{ if: { properties: { workspace: { const: true } } }, then: { properties: { resolution: { enum: ['480p'] } } } }],
      },
    })),
    expectedContract,
  )
})

test('summarizeModelContractForAgent falls back to params_schema property keys', () => {
  assert.deepEqual(
    summarizeModelContractForAgent({
      ID: '7',
      capabilities: ['image'],
      params_schema: {
        type: 'object',
        properties: {
          aspect_ratio: { type: 'string', enum: ['16:9', '9:16'], default: '16:9' },
        },
      },
    }),
    {
      contract_version: 1,
      model_id: 'backend.model.7',
      capabilities: ['image'],
      accepts_image_input: false,
      input_requirements: {
        image: { min: 0, max: 0 },
        video: { min: 0, max: 0 },
      },
      supported_params: [
        { key: 'aspect_ratio', type: 'string', options: ['16:9', '9:16'], default: '16:9' },
      ],
      supported_param_keys: ['aspect_ratio'],
      params_schema_loaded: true,
    },
  )
})

test('summarizeModelContractForAgent normalizes malformed input requirements to schema-safe defaults', () => {
  assert.deepEqual(
    summarizeModelContractForAgent({
      id: 8,
      capabilities: ['video_i2v'],
      input_requirements: {
        image: { min: '1', max: '4' },
        video: { min: -1, max: 'bad' },
      },
    }).input_requirements,
    {
      image: { min: 1, max: 4 },
      video: { min: 0, max: 0 },
    },
  )
})

test('summarizeModelContractForAgent normalizes inconsistent bounded input requirements', () => {
  assert.deepEqual(
    summarizeModelContractForAgent({
      id: 89,
      capabilities: ['image_edit'],
      input_requirements: {
        image: { min: 4, max: 2 },
        video: { min: 1, max: -1 },
      },
    }).input_requirements,
    {
      image: { min: 0, max: 0 },
      video: { min: 1, max: -1 },
    },
  )
})

test('summarizeModelContractForAgent preserves unlimited input requirement max', () => {
  assert.deepEqual(
    summarizeModelContractForAgent({
      id: 88,
      capabilities: ['image_edit'],
      input_requirements: {
        image: { min: 1, max: -1 },
        video: { min: 0, max: 0 },
      },
    }).input_requirements,
    {
      image: { min: 1, max: -1 },
      video: { min: 0, max: 0 },
    },
  )
})

test('summarizeModelContractForAgent drops malformed compact rule items', () => {
  assert.deepEqual(
    summarizeModelContractForAgent({
      id: 9,
      capabilities: ['video'],
      supported_params: [
        {
          key: 'resolution',
          type: 'select',
          options: ['480p'],
          conditional_enum: [
            { when_param: 'workspace', when_value: true, options: ['480p', 720] },
            { when_param: '', when_value: true, options: ['480p'] },
            { when_param: 'workspace', when_value: true, options: [] },
            { when_param: 'workspace', when_value: { invalid: true }, options: ['480p'] },
          ],
        },
        {
          key: 'return_last_frame',
          type: 'boolean',
          conditional_const: [
            { when_param: 'workspace', when_value: true, value: false },
            { when_param: 'workspace', when_value: true, value: { invalid: true } },
            { when_param: 'workspace', when_value: ['yes'], value: false },
          ],
        },
        {
          key: 'image_count',
          type: 'number',
          requires_value: [
            { param: 'sequential_image_generation', value: 'auto' },
            { param: 'sequential_image_generation', value: ['auto'] },
          ],
        },
      ],
    }).supported_params,
    [
      { key: 'resolution', type: 'select', options: ['480p'], conditional_enum: [{ when_param: 'workspace', when_value: true, options: ['480p'] }] },
      { key: 'return_last_frame', type: 'boolean', conditional_const: [{ when_param: 'workspace', when_value: true, value: false }] },
      { key: 'image_count', type: 'number', requires_value: [{ param: 'sequential_image_generation', value: 'auto' }] },
    ],
  )
})
