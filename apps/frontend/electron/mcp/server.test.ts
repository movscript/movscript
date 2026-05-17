import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { applyDraftReview, attachAssetSlotCandidate, buildGenerationModelParamRules, buildGenerationParamValidationAudit, createGenerationJob, getDraftModelContract, listModels, listTools, normalizeBackendHTTPErrorForMCP, normalizeGenerationExtraParams, preflightGenerationParams, queryCreativeReferences, queryProductionContext, setMCPAPIBaseURL, summarizeModelContractForAgent } from './server'

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

test('generation MCP tool descriptions expose versioned agent contracts', () => {
  const tools = listTools()
  const listModels = tools.find((tool) => tool.name === 'movscript_list_models')
  const createJob = tools.find((tool) => tool.name === 'movscript_create_generation_job')
  const attachCandidate = tools.find((tool) => tool.name === 'movscript_attach_asset_slot_candidate')
  const staticListModels = loadStaticCatalogTool('list-models.tool.json')
  const staticCreateJob = loadStaticCatalogTool('create-job.tool.json')
  const staticAttachCandidate = loadStaticCatalogTool('attach-asset-slot-candidate.tool.json')
  assert.ok(listModels)
  assert.ok(createJob)
  assert.ok(attachCandidate)
  assert.match(listModels.description, /model_contracts/)
  assert.match(listModels.description, /contract_version 1/)
  assert.match(listModels.description, /input_requirements/)
  assert.match(listModels.description, /supported_param_keys/)
  assert.ok(listModels.inputSchema.properties?.feature_key)
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
  const createJobProperties = schemaProperties(createJob.inputSchema)
  assert.match(schemaDescription(createJobProperties.extra_params), /param_validation audit_version 1/)
  assert.match(schemaDescription(createJobProperties.input_resource_ids), /input_preflight_errors/)
  assert.ok(createJob.inputSchema.properties?.job_type)
  assert.ok(createJob.inputSchema.properties?.input_resource_ids)
  assert.ok(createJob.inputSchema.properties?.reference_type)
  assert.ok(createJob.inputSchema.properties?.aspect_ratio)
  assert.ok(createJob.inputSchema.properties?.duration)
  assert.equal(createJob.inputSchema.properties?.model_config_id, undefined)
  assert.ok(createJob.outputSchema?.properties?.status)
  assert.ok(createJob.outputSchema?.properties?.job)
  assert.ok(createJob.outputSchema?.properties?.jobId)
  assert.ok(createJob.outputSchema?.properties?.monitor)
  assert.ok(createJob.outputSchema?.properties?.output_resource)
  assert.ok(createJob.outputSchema?.properties?.output_resource_id)
  assert.ok(createJob.outputSchema?.properties?.param_validation)
  assert.match(attachCandidate.description, /reviewable candidate/)
  assert.match(attachCandidate.description, /does not accept, select, bind, or lock/)
  assert.ok(attachCandidate.inputSchema.properties?.asset_slot_id)
  assert.ok(attachCandidate.inputSchema.properties?.resource_id)
  assert.ok(attachCandidate.outputSchema?.properties?.candidate)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.audit_version)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.model_contract_loaded)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.params_schema_loaded)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.params_schema_rule_count)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.provided_extra_params)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.dropped_top_level_params)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.extra_params_parse_error)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.preflight_errors)
  assert.ok((createJob.outputSchema?.properties?.param_validation as any)?.properties?.input_preflight_errors)

  for (const field of ['feature_key', 'provider_variants', 'include_provider_variants']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(listModels.inputSchema.properties?.[field]),
      schemaShapeWithoutDescriptions(staticListModels.inputSchema.properties?.[field]),
      `movscript_list_models ${field} schema should match the static agent catalog`,
    )
  }
  for (const field of ['count', 'queries', 'model_contracts', 'models']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(listModels.outputSchema?.properties?.[field]),
      schemaShapeWithoutDescriptions(staticListModels.outputSchema?.properties?.[field]),
      `movscript_list_models ${field} output schema should match the static agent catalog`,
    )
  }
  for (const field of ['title', 'job_type', 'model_id', 'input_resource_ids', 'reference_type', 'aspect_ratio', 'duration', 'feature_key', 'timeout_ms', 'poll_interval_ms']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(createJob.inputSchema.properties?.[field]),
      schemaShapeWithoutDescriptions(staticCreateJob.inputSchema.properties?.[field]),
      `movscript_create_generation_job ${field} schema should match the static agent catalog`,
    )
  }
  for (const field of ['status', 'job', 'jobId', 'monitor', 'output_resource', 'output_resource_id', 'param_validation', 'terminal', 'message']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(createJob.outputSchema?.properties?.[field]),
      schemaShapeWithoutDescriptions(staticCreateJob.outputSchema?.properties?.[field]),
      `movscript_create_generation_job ${field} output schema should match the static agent catalog`,
    )
  }
  for (const field of ['projectId', 'asset_slot_id', 'resource_id', 'source_type', 'source_id', 'score', 'note']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(attachCandidate.inputSchema.properties?.[field]),
      schemaShapeWithoutDescriptions(staticAttachCandidate.inputSchema.properties?.[field]),
      `movscript_attach_asset_slot_candidate ${field} schema should match the static agent catalog`,
    )
  }
  for (const field of ['status', 'candidate', 'asset_slot_id', 'candidate_asset_slot_id', 'resource_id', 'message']) {
    assert.deepEqual(
      schemaShapeWithoutDescriptions(attachCandidate.outputSchema?.properties?.[field]),
      schemaShapeWithoutDescriptions(staticAttachCandidate.outputSchema?.properties?.[field]),
      `movscript_attach_asset_slot_candidate ${field} output schema should match the static agent catalog`,
    )
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

test('draft model MCP tool exposes frontend-owned field and seed contract', async () => {
  const result = await getDraftModelContract({
    kind: 'production_proposal',
    target: { entityType: 'production', entityId: 301, projectId: 42 },
    seedMode: 'snapshot',
    include: ['production', 'segments', 'not_allowed'],
    hydrate: false,
  }) as Record<string, any>

  assert.equal(result.contractVersion, 1)
  assert.equal(result.kind, 'production_proposal')
  assert.equal(result.contentSchemaId, 'movscript.production_proposal.v1')
  assert.deepEqual(result.seedPolicy.include, ['production', 'segments'])
  assert.equal(result.seedPolicy.defaultMode, 'snapshot')
  assert.deepEqual(result.seedPolicy.allowedModes, ['empty', 'snapshot'])
  assert.deepEqual(result.fieldGuide.owns, [
    'snapshot.proposal.segments',
    'snapshot.proposal.segments[].scene_moments',
    'snapshot.proposal.segments[].scene_moments[].content_units',
    'snapshot.proposal.segments[].scene_moments[].keyframes',
    'production_local_requirements',
  ])
  assert.equal(result.applyBoundary.backendApply, 'production_proposal')
  assert.equal(result.reviewRoute, '/project/production/orchestration?productionId=301&draftId=:draftId')
  assert.equal(result.modelRef, 'frontend:DraftDomainModel:production_proposal:v1')
})

test('draft model MCP tool hydrates production proposal snapshot with production brief and project scripts', async () => {
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
    const result = await getDraftModelContract({
      kind: 'production_proposal',
      target: { entityType: 'production', entityId: 301, projectId: 42 },
      include: ['production_script_brief', 'project_scripts'],
    }) as Record<string, any>

    assert.equal(result.seedPolicy.mode, 'snapshot')
    assert.equal(result.seed.data.production_script_brief.scriptVersionId, 77)
    assert.equal(result.seed.data.production_script_brief.brief, 'Production brief from page.')
    assert.equal(result.seed.data.production_script_brief.body_excerpt, 'A long script body.')
    assert.equal(result.seed.data.project_scripts[0].title, 'Pilot')
    assert.equal(result.seed.data.project_scripts[0].content, undefined)
    assert.deepEqual(result.seed.sourceVersions.production_script_brief, { id: 77, updatedAt: '2026-05-13T00:00:01.000Z' })
  } finally {
    setMCPAPIBaseURL(previousBaseURL)
    globalThis.fetch = previousFetch
  }
})

test('draft model MCP tool hydrates asset proposal seed from allowed backend includes', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/projects/42': { id: 42, name: 'Seed Project', UpdatedAt: '2026-05-13T00:00:00.000Z' },
    '/projects/42/entities/creative-references': [{ ID: 7, name: 'Hero', UpdatedAt: '2026-05-13T00:00:01.000Z' }],
    '/projects/42/entities/asset-slots': [{ ID: 9, name: 'Hero portrait', owner_type: 'creative_reference', owner_id: 7, UpdatedAt: '2026-05-13T00:00:02.000Z' }],
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const result = await getDraftModelContract({
      kind: 'asset_proposal',
      target: { entityType: 'project', entityId: 42 },
      include: ['project', 'creative_references', 'asset_slots', 'asset_slot_ownership'],
    }) as Record<string, any>

    assert.equal(result.seed.hydrated, true)
    assert.equal(result.seed.data.project.name, 'Seed Project')
    assert.equal(result.seed.data.creative_references[0].name, 'Hero')
    assert.equal(result.seed.data.asset_slots[0].owner_type, 'creative_reference')
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
      { ID: 12, project_id: 42, kind: 'person', name: '路人', description: '背景角色', status: 'draft' },
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
      { ID: 12, project_id: 42, kind: 'person', name: '路人', description: '背景角色', status: 'draft' },
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
      include_generation_context: true,
    }) as Record<string, any>

    assert.deepEqual(result.segments.map((item: any) => item.ID), [101])
    assert.deepEqual(result.scene_moments.map((item: any) => item.ID), [201])
    assert.deepEqual(result.content_units.map((item: any) => item.ID), [301])
    assert.equal(result.generation_context.target.content_unit.ID, 301)
  } finally {
    globalThis.fetch = previousFetch
    setMCPAPIBaseURL('http://localhost:8765')
  }
})

test('applyDraftReview posts direct asset proposal snapshot rows for backend project proposal apply', async () => {
  const postedBodies: Array<Record<string, unknown>> = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    'POST /projects/4/entities/project-proposals/apply': (body: Record<string, unknown>) => {
      postedBodies.push(body)
      return { counts: { asset_slots_created: 3 } }
    },
  }) as typeof fetch
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const proposedValue = JSON.stringify({
      schema: 'movscript.asset_proposal.v1',
      mode: 'snapshot',
      summary: '批量提交：3 项',
      proposal: {
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

    const result = await applyDraftReview({
      review: {
        draftKind: 'note',
        target: { projectId: 4, entityType: 'project', entityId: 4, field: 'proposal' },
        proposedValue,
      },
    }) as Record<string, any>

    assert.equal(result.performed, true)
    assert.equal(result.url, 'http://mock.backend/api/v1/projects/4/entities/project-proposals/apply')
    assert.equal(postedBodies[0].mode, 'snapshot')
    assert.deepEqual(postedBodies[0].proposal, {
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

test('applyDraftReview rejects legacy production proposal action payloads', async () => {
  await assert.rejects(() => applyDraftReview({
    review: {
      draftKind: 'production_proposal',
      target: { projectId: 4, entityType: 'production', entityId: 9, field: 'proposal' },
      proposedValue: JSON.stringify({
        schema: 'movscript.production_proposal.v1',
        mode: 'snapshot',
        productionId: 9,
        proposal: {
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

test('listModels treats common generation feature aliases as capabilities', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = mockFetch({
    '/models?capability=image_edit': [minimalBackendModelFixture(41, ['image_edit'])],
    '/models?capability=image': [minimalBackendModelFixture(42, ['image'])],
  }) as typeof fetch
  const previousBaseURL = 'http://localhost:8765'
  setMCPAPIBaseURL('http://mock.backend')
  try {
    const imageEdit = await listModels({ feature: 'image_to_image' }) as Record<string, any>
    assert.deepEqual(imageEdit.queries, ['capability:image_edit'])
    assert.equal(imageEdit.model_contracts[0].model_id, 'model.41')

    const textToImage = await listModels({ feature_key: 'text_to_image' }) as Record<string, any>
    assert.deepEqual(textToImage.queries, ['capability:image'])
    assert.equal(textToImage.model_contracts[0].model_id, 'model.42')

    const imageCapability = await listModels({ feature: 'image' }) as Record<string, any>
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

test('createGenerationJob returns queued monitor and param validation audit for filtered params', async () => {
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
      model_id: 'video.draft',
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
      tool: 'movscript_get_generation_job',
      args: { jobId: 101 },
      message: 'Generation is asynchronous. Inspect this job until it reaches a terminal status before claiming completion.',
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
      supported_params: ['draft', 'frames', 'image_count', 'resolution', 'return_last_frame', 'sequential_image_generation'],
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
      model_id: 'video.draft',
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

test('buildGenerationParamValidationAudit exposes model contract filtering decisions', () => {
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

test('buildGenerationParamValidationAudit distinguishes missing model contract from empty schema contract', () => {
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

test('generation param validation audit matches canonical v1 fixture shape', () => {
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

test('preflightGenerationParams records local contract errors without dropping params', () => {
  const modelParamContract = {
    supportedParamKeys: new Set(['duration', 'frames', 'draft', 'aspect_ratio']),
    supportedParams: new Map([
      ['duration', { key: 'duration', type: 'select', options: ['5', '10'] }],
      ['frames', { key: 'frames', type: 'number', min: 29, max: 289 }],
      ['draft', { key: 'draft', type: 'boolean' }],
      ['aspect_ratio', { key: 'aspect_ratio', type: 'string', options: ['16:9', '9:16'] }],
    ]),
    rules: {
      conflicts: [{ key: 'duration', other: 'frames' }],
      conditionalEnums: [{ key: 'aspect_ratio', whenParam: 'draft', whenValue: true, options: ['16:9'] }],
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
    draft: true,
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
      message: 'parameter "aspect_ratio" is not allowed for "draft" in the local model contract',
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

test('preflightGenerationParams records compact conditional const and requires value rules', () => {
  const modelParamContract = {
    supportedParamKeys: new Set(['draft', 'return_last_frame', 'image_count', 'sequential_image_generation']),
    supportedParams: new Map([
      ['draft', { key: 'draft', type: 'boolean' }],
      ['return_last_frame', { key: 'return_last_frame', type: 'boolean' }],
      ['image_count', { key: 'image_count', type: 'number', min: 1, max: 15 }],
      ['sequential_image_generation', { key: 'sequential_image_generation', type: 'select', options: ['disabled', 'auto'] }],
    ]),
    rules: {
      conflicts: [],
      conditionalEnums: [],
      conditionalConsts: [{ key: 'return_last_frame', whenParam: 'draft', whenValue: true, value: false }],
      requiresValues: [{ key: 'image_count', param: 'sequential_image_generation', value: 'auto' }],
    },
    inputRequirements: emptyGenerationInputRequirements(),
    paramsSchemaLoaded: true,
    paramsSchemaRuleCount: 2,
  }

  assert.deepEqual(
    preflightGenerationParams({
      draft: true,
      return_last_frame: true,
      image_count: 3,
      sequential_image_generation: 'disabled',
    }, modelParamContract),
    [
      {
        code: 'INVALID_PARAMETER_COMBINATION',
        field: 'return_last_frame',
        message: 'parameter "return_last_frame" must match the required value for "draft" in the local model contract',
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

test('buildGenerationModelParamRules deduplicates mirrored conflict preflight rules', () => {
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

test('normalizeGenerationExtraParams canonicalizes supported aliases before filtering', () => {
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

test('normalizeGenerationExtraParams aliases match the shared manifest', () => {
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
  return JSON.parse(readFileSync(resolve(process.cwd(), `../../apps/agent/catalog/tools/movscript/visual-generation/${fileName}`), 'utf8')) as Record<string, any>
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

function mockFetch(routes: Record<string, unknown | ((body: Record<string, unknown>) => unknown)>) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
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
    display_name: 'Draft Video',
    short_name: 'draft-video',
    logical_model_id: 'video.draft',
    capabilities: ['video', 'video_i2v'],
    accepts_image_input: true,
    input_requirements: contract.input_requirements,
    supported_params: contract.supported_params,
    params_schema: {
      type: 'object',
      properties: Object.fromEntries(contract.supported_params.map((param: any) => [param.key, paramSchemaFixture(param)])),
      allOf: [{ if: { properties: { draft: { const: true } } }, then: { properties: { resolution: { enum: ['480p'] } } } }],
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
      display_name: 'Draft Video',
      short_name: 'draft-video',
      logical_model_id: 'video.draft',
      capabilities: ['video', 'video_i2v', 'video'],
      accepts_image_input: true,
      input_requirements: {
        image: { min: 1, max: 4 },
        video: { min: 0, max: 0 },
      },
      supported_params: [
        {
          key: 'draft',
          label: 'Draft',
          type: 'boolean',
        },
        {
          key: 'resolution',
          label: 'Resolution',
          type: 'select',
          options: ['480p', '720p'],
          default: '480p',
          conditional_enum: [{ when_param: 'draft', when_value: true, options: ['480p'] }],
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
          conditional_const: [{ when_param: 'draft', when_value: true, value: false }],
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
          draft: { type: 'boolean' },
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
        allOf: [{ if: { properties: { draft: { const: true } } }, then: { properties: { resolution: { enum: ['480p'] } } } }],
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
      display_name: 'Draft Video',
      short_name: 'draft-video',
      logical_model_id: 'video.draft',
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
          draft: { type: 'boolean' },
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
        allOf: [{ if: { properties: { draft: { const: true } } }, then: { properties: { resolution: { enum: ['480p'] } } } }],
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
            { when_param: 'draft', when_value: true, options: ['480p', 720] },
            { when_param: '', when_value: true, options: ['480p'] },
            { when_param: 'draft', when_value: true, options: [] },
            { when_param: 'draft', when_value: { invalid: true }, options: ['480p'] },
          ],
        },
        {
          key: 'return_last_frame',
          type: 'boolean',
          conditional_const: [
            { when_param: 'draft', when_value: true, value: false },
            { when_param: 'draft', when_value: true, value: { invalid: true } },
            { when_param: 'draft', when_value: ['yes'], value: false },
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
      { key: 'resolution', type: 'select', options: ['480p'], conditional_enum: [{ when_param: 'draft', when_value: true, options: ['480p'] }] },
      { key: 'return_last_frame', type: 'boolean', conditional_const: [{ when_param: 'draft', when_value: true, value: false }] },
      { key: 'image_count', type: 'number', requires_value: [{ param: 'sequential_image_generation', value: 'auto' }] },
    ],
  )
})
