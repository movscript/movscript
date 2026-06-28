import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildContentUnitGenerationOutputCandidate,
  buildContentUnitGenerationJobPayload,
  buildContentUnitGenerationPromptSnapshot,
  buildContentUnitGenerationRequest,
  buildGenerationJobPayload,
  compiledContentUnitGenerationPromptResourceIds,
  compiledContentUnitGenerationPromptText,
  canvasDefaultParamValues,
  canvasGenerationParamDefs,
  canvasParamValue,
  canvasParamValues,
  createGenerationToolServer,
  DEFAULT_GENERATION_TOOLS_SETTINGS,
  generationModelAcceptsImageInput,
  generationModelAcceptsVideoInput,
  generationParamDefaults,
  normalizeGenerationToolsSettings,
  resolveGenerationCapabilityForResourceCount,
  resolveGenerationJobType,
  resolveGenerationJobTypeFromResourceCount,
  updateCanvasParam,
} from '../dist/generation/index.js'

test('core generation job payload promotes numeric duration and aspect ratio', () => {
  assert.deepEqual(buildGenerationJobPayload({
    modelId: ' video.workspace ',
    jobType: 'video',
    title: 'Video job',
    prompt: ' make a shot ',
    params: { aspect_ratio: '16:9', duration: '5', resolution: '720p' },
    inputResourceIds: [7],
    sourceKey: 'tool.video',
  }), {
    model_id: 'video.workspace',
    job_type: 'video',
    title: 'Video job',
    prompt: 'make a shot',
    aspect_ratio: '16:9',
    duration: 5,
    extra_params: JSON.stringify({ resolution: '720p' }),
    input_resource_ids: [7],
    feature_key: 'tool.video',
  })
})

test('core generation job payload keeps non numeric duration in extra params', () => {
  assert.deepEqual(buildGenerationJobPayload({
    modelId: 'video.workspace',
    jobType: 'video',
    title: 'Video job',
    prompt: 'make a shot',
    params: { duration: 'auto', negative_prompt: 'low quality' },
    inputResourceIds: [],
    sourceKey: 'tool.video',
  }), {
    model_id: 'video.workspace',
    job_type: 'video',
    title: 'Video job',
    prompt: 'make a shot',
    aspect_ratio: undefined,
    duration: undefined,
    extra_params: JSON.stringify({ negative_prompt: 'low quality', duration: 'auto' }),
    input_resource_ids: [],
    feature_key: 'tool.video',
  })
})

test('core generation job payload requires structured reference assets', () => {
  assert.throws(() => buildGenerationJobPayload({
    modelId: 'video.workspace',
    jobType: 'video',
    title: 'Video job',
    prompt: 'make a shot',
    params: {},
    inputResourceIds: [7],
    sourceKey: 'tool.video',
    generationIntent: {
      capability: 'video_generation',
      operation: 'image_to_video',
      reference_assets: [{ role: 'reference_image', resource_id: 7 }],
    },
  }), /role, media_type, and resource_id/)

  assert.deepEqual(buildGenerationJobPayload({
    modelId: 'video.workspace',
    jobType: 'video',
    title: 'Video job',
    prompt: 'make a shot',
    params: {},
    inputResourceIds: [7],
    sourceKey: 'tool.video',
    generationIntent: {
      capability: 'video_generation',
      operation: 'image_to_video',
      reference_assets: [{ role: 'reference_image', media_type: 'image', resource_id: 7 }],
    },
  }).generation_intent, {
    capability: 'video_generation',
    operation: 'image_to_video',
    reference_assets: [{ role: 'reference_image', media_type: 'image', resource_id: 7 }],
  })
})

test('core generation job payload omits params whose requires_value is not satisfied', () => {
  const supportedParams = [
    { key: 'sequential_image_generation' },
    {
      key: 'image_count',
      requires_value: [{ param: 'sequential_image_generation', value: 'auto' }],
    },
    { key: 'watermark' },
  ]

  assert.deepEqual(buildGenerationJobPayload({
    modelId: 'seedream-4-5',
    jobType: 'image',
    title: 'Image job',
    prompt: 'generate a kitten',
    params: {
      sequential_image_generation: 'disabled',
      image_count: 1,
      watermark: true,
      aspect_ratio: '1:1',
    },
    supportedParams,
    inputResourceIds: [],
    sourceKey: 'ref_image_gen',
  }).extra_params, JSON.stringify({
    sequential_image_generation: 'disabled',
    watermark: true,
  }))

  assert.deepEqual(buildGenerationJobPayload({
    modelId: 'seedream-4-5',
    jobType: 'image',
    title: 'Image job',
    prompt: 'generate a kitten',
    params: {
      sequential_image_generation: 'auto',
      image_count: 1,
      watermark: true,
    },
    supportedParams,
    inputResourceIds: [],
    sourceKey: 'ref_image_gen',
  }).extra_params, JSON.stringify({
    sequential_image_generation: 'auto',
    image_count: 1,
    watermark: true,
  }))
})

test('core content-unit generation payload filters model-unsupported default params', () => {
  const built = buildContentUnitGenerationJobPayload({
    contentUnitId: 'cu_seedream_asset',
    outputKind: 'image',
    compiledPrompt: { text: 'Generate a clean character reference.' },
    modelId: 'seedream-4-5',
    supportedParams: [
      { key: 'image_size' },
      { key: 'watermark' },
    ],
    generationIntent: {
      capability: 'image_generation',
      operation: 'text_to_image',
    },
    params: {
      image_size: '2048x2048',
      watermark: true,
    },
  })

  assert.equal(built.payload.aspect_ratio, undefined)
  assert.equal(built.payload.extra_params, JSON.stringify({
    image_size: '2048x2048',
    watermark: true,
  }))
  assert.deepEqual(built.params, {
    image_size: '2048x2048',
    watermark: true,
    aspect_ratio: '1:1',
  })
})

test('core content-unit generation candidates preserve submitted model parameters', () => {
  const promptSnapshot = buildContentUnitGenerationPromptSnapshot({
    contentUnitId: 'cu_arrival',
    outputKind: 'image',
    modelId: 'image.model',
    compiledPrompt: { text: 'Generate the arrival frame.' },
    resourceIds: [11],
    modelParams: { image_size: '1024x1024', quality: 'standard' },
  })

  const plan = buildContentUnitGenerationOutputCandidate({
    contentUnitId: 'cu_arrival',
    outputKind: 'image',
    job: { ID: 94, status: 'succeeded', job_type: 'image_edit' },
    resourceId: 880,
    promptSnapshot,
  })

  assert.equal(promptSnapshot.model_id, 'image.model')
  assert.deepEqual(promptSnapshot.model_params, { image_size: '1024x1024', quality: 'standard' })
  assert.equal(plan.producer.model_id, 'image.model')
  assert.equal(plan.producer.job_type, 'image_edit')
  assert.deepEqual(plan.producer.model_params, { image_size: '1024x1024', quality: 'standard' })
  assert.equal(plan.outputs[0].metadata.model_id, 'image.model')
  assert.equal(plan.outputs[0].metadata.job_type, 'image_edit')
  assert.deepEqual(plan.promptSnapshot.model_params, { image_size: '1024x1024', quality: 'standard' })
})

test('core content-unit generation normalizes resource mentions into structured inputs', () => {
  const compiledPrompt = {
    text: 'Use @[resource:7] and [[resource::8]] as references.',
    negative_text: 'Do not drift from [[resource::9]].',
    resource_ids: [7, 10],
  }

  assert.equal(compiledContentUnitGenerationPromptText(compiledPrompt), 'Use and as references.')
  assert.deepEqual(compiledContentUnitGenerationPromptResourceIds(compiledPrompt), [7, 8, 9, 10])

  const request = buildContentUnitGenerationRequest({
    contentUnitId: 'cu_ref',
    outputKind: 'video',
    compiledPrompt,
    modelId: 'video.model',
    generationIntent: {
      capability: 'video_generation',
      operation: 'reference_to_video',
      reference_assets: [
        { role: 'reference_image', media_type: 'image', resource_id: 7 },
        { role: 'reference_image', media_type: 'image', resource_id: 8 },
        { role: 'reference_image', media_type: 'image', resource_id: 9 },
        { role: 'reference_image', media_type: 'image', resource_id: 10 },
      ],
    },
  })

  assert.equal(request.promptText, 'Use and as references.')
  assert.deepEqual(request.inputResourceIds, [7, 8, 9, 10])
  assert.equal(request.jobType, 'video')
})

test('core generation job decisions derive effective job type from model capabilities and inputs', () => {
  assert.equal(resolveGenerationJobType({
    outputType: 'image',
    model: { capabilities: ['image', 'image_edit'] },
    attachments: [{ type: 'image' }],
  }), 'image_edit')
  assert.equal(resolveGenerationJobType({
    outputType: 'image',
    model: { capabilities: ['image', 'image_edit'] },
    attachments: [],
  }), 'image')
  assert.equal(resolveGenerationJobType({
    outputType: 'image',
    model: { capabilities: ['image_edit'] },
    attachments: [],
  }), 'image_edit')
  assert.equal(resolveGenerationJobType({
    outputType: 'video',
    model: { capabilities: ['video', 'video_v2v', 'video_i2v'] },
    attachments: [{ type: 'video' }, { type: 'image' }],
  }), 'video_v2v')
  assert.equal(resolveGenerationJobType({
    outputType: 'video',
    model: { capabilities: ['video', 'video_i2v'] },
    attachments: [{ type: 'image' }],
  }), 'video_i2v')
  assert.equal(resolveGenerationJobType({
    outputType: 'video',
    model: { capabilities: ['video_i2v'] },
    attachments: [],
  }), 'video_i2v')
  assert.equal(resolveGenerationJobType({
    outputType: 'audio',
    model: { capabilities: ['audio_tts'] },
    attachments: [],
  }), 'audio_tts')
})

test('core generation job decisions expose model media support and param defaults', () => {
  assert.equal(generationModelAcceptsImageInput({ capabilities: ['video_i2v'] }), true)
  assert.equal(generationModelAcceptsImageInput({ capabilities: ['image'], accepts_image_input: true }), true)
  assert.equal(generationModelAcceptsImageInput({ capabilities: ['image'] }), false)
  assert.equal(generationModelAcceptsVideoInput({ capabilities: ['video_v2v'] }), true)
  assert.equal(generationModelAcceptsVideoInput({ capabilities: ['video_i2v'] }), false)
  assert.deepEqual(generationParamDefaults({
    supported_params: [
      { key: 'quality', default: 'high' },
      { key: 'steps', default: 24 },
      { key: 'ignored' },
    ],
  }), {
    quality: 'high',
    steps: 24,
  })
})

test('core generation job decisions derive resource-count job types and capabilities', () => {
  assert.equal(resolveGenerationJobTypeFromResourceCount({
    outputType: 'image',
    inputResourceCount: 1,
  }), 'image_edit')
  assert.equal(resolveGenerationJobTypeFromResourceCount({
    outputType: 'video',
    inputResourceCount: 1,
  }), 'video_i2v')
  assert.equal(resolveGenerationJobTypeFromResourceCount({
    outputType: 'video',
    inputResourceCount: 1,
    preferredVideoJobType: 'video_v2v',
  }), 'video_v2v')
  assert.equal(resolveGenerationJobTypeFromResourceCount({
    outputType: 'video',
    inputResourceCount: 0,
    preferredVideoJobType: 'video_i2v',
  }), 'video_i2v')
  assert.equal(resolveGenerationCapabilityForResourceCount({
    outputType: 'video',
    inputResourceCount: 0,
  }), 'video')
  assert.equal(resolveGenerationCapabilityForResourceCount({
    outputType: 'image',
    inputResourceCount: 2,
  }), 'image_edit')
  assert.equal(resolveGenerationCapabilityForResourceCount({
    outputType: 'audio',
    inputResourceCount: 0,
  }), 'audio_tts')
})

test('core generation canvas params choose model params before node defaults', () => {
  const modelParam = { key: 'cfg', label: 'CFG', type: 'number', default: 3 }

  assert.deepEqual(canvasGenerationParamDefs('ai_gen', 'video').map((param) => param.key), [
    'aspect_ratio',
    'duration',
    'resolution',
    'camera_fixed',
    'seed',
  ])
  assert.deepEqual(canvasGenerationParamDefs('text_gen').map((param) => param.key), [
    'temperature',
    'max_tokens',
  ])
  assert.deepEqual(canvasGenerationParamDefs('style_transfer').map((param) => param.key), [
    'aspect_ratio',
    'guidance_scale',
    'preserve_identity',
    'seed',
  ])
  assert.deepEqual(canvasGenerationParamDefs('image', undefined, { supported_params: [modelParam] }), [modelParam])
})

test('core generation canvas params normalize values and update patches', () => {
  const params = [
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: false },
    { key: 'steps', label: 'Steps', type: 'number', default: 8 },
    { key: 'quality', label: 'Quality', type: 'select', default: 'standard' },
  ]
  const data = {
    params: {
      enabled: 'true',
      steps: '12',
      quality: '',
    },
  }

  assert.equal(canvasParamValue(data, params[0]), true)
  assert.equal(canvasParamValue(data, params[1]), 12)
  assert.equal(canvasParamValue(data, params[2]), 'standard')
  assert.deepEqual(canvasParamValues(data, params), {
    enabled: true,
    steps: 12,
    quality: 'standard',
  })
  assert.deepEqual(canvasDefaultParamValues(params), {
    enabled: false,
    steps: 8,
    quality: 'standard',
  })
  assert.deepEqual(updateCanvasParam(data, 'steps', 20), {
    enabled: 'true',
    steps: 20,
    quality: '',
  })
  assert.deepEqual(updateCanvasParam(data, 'quality', ''), {
    enabled: 'true',
    steps: '12',
  })
})

test('core generation tool settings normalize service protocol defaults', () => {
  const server = createGenerationToolServer('webui', {
    id: 'webui-1',
    enabled: true,
    baseURL: ' http://127.0.0.1:7860/ ',
    timeoutMS: 999999,
    priority: 2.4,
    authKind: 'basic',
    username: ' user ',
    password: 'secret',
    tags: [' local ', 'local', ''],
  })

  const settings = normalizeGenerationToolsSettings({
    servers: [server],
    defaultServerId: 'webui-1',
    defaultServerIds: { webui: 'webui-1' },
    preferLocalServers: false,
  })

  assert.equal(settings.servers[0]?.baseURL, 'http://127.0.0.1:7860')
  assert.equal(settings.servers[0]?.timeoutMS, 600000)
  assert.equal(settings.servers[0]?.priority, 2)
  assert.equal(settings.servers[0]?.username, 'user')
  assert.deepEqual(settings.servers[0]?.tags, ['local'])
  assert.deepEqual(settings.defaultServerIds, { webui: 'webui-1' })
  assert.equal(settings.preferLocalServers, false)

  assert.deepEqual(
    normalizeGenerationToolsSettings(null).servers.map((item) => item.id),
    DEFAULT_GENERATION_TOOLS_SETTINGS.servers.map((item) => item.id),
  )
})

test('core generation tool settings keep legacy local server settings compatible', () => {
  const settings = normalizeGenerationToolsSettings({
    defaultServerId: 'local-comfyui-default',
    comfyui: {
      enabled: true,
      apiKey: 'token-1',
      baseURL: 'http://localhost:8188/',
    },
  })

  assert.equal(settings.servers[0]?.id, 'local-comfyui-default')
  assert.equal(settings.servers[0]?.authKind, 'bearer')
  assert.equal(settings.servers[0]?.token, 'token-1')
  assert.deepEqual(settings.defaultServerIds, { comfyui: 'local-comfyui-default' })
})

test('core generation package publishes payload rules without frontend runtime dependencies', () => {
  const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  const tsupSource = readFileSync(new URL('../tsup.config.ts', import.meta.url), 'utf8')
  const source = [
    readFileSync(new URL('../src/generation/jobPayload.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/generation/jobDecision.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/generation/params.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/generation/tools.ts', import.meta.url), 'utf8'),
  ].join('\n')

  assert.match(packageSource, /"\.\/generation"/)
  assert.match(tsupSource, /'src\/generation\/index\.ts'/)
  assert.doesNotMatch(source, /from ['"]@\/|from ['"]react['"]|@movscript\/ui|window\.|document\.|localStorage|sessionStorage/)
})
