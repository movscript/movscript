import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildContentUnitGenerationOutputCandidate,
  buildContentUnitGenerationJobPayload,
  buildContentUnitGenerationPromptSnapshot,
  buildContentUnitGenerationRequest,
  buildGenerationJobPayload,
  compiledContentUnitGenerationPromptReferenceAssets,
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
  evaluateGenerationReadiness,
  buildGenerationIntentForOutputKind,
  completeGenerationReferenceAssets,
  generationOperationAcceptsReferences,
  generationOperationOptionsForOutputKind,
  generationReferenceRoleLabel,
  generationReferenceRoleOptionsForMediaType,
  generationReferenceAssetsFromPromptText,
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

test('compiled content-unit prompt exposes typed reference assets', () => {
  assert.deepEqual(compiledContentUnitGenerationPromptReferenceAssets({
    text: 'animate @[resource:image:first_frame:101] to @[resource:image:last_frame:102]',
  }), [
    { role: 'first_frame', media_type: 'image', resource_id: 101 },
    { role: 'last_frame', media_type: 'image', resource_id: 102 },
  ])

  assert.deepEqual(generationReferenceAssetsFromPromptText('use @[resource:201]'), [
    { role: 'reference_image', media_type: 'image', resource_id: 201 },
  ])
  assert.deepEqual(generationReferenceAssetsFromPromptText('use {{resource::202}}'), [
    { role: 'reference_image', media_type: 'image', resource_id: 202 },
  ])
  assert.deepEqual(generationReferenceAssetsFromPromptText('use {{resource::203 role=first_frame media=image}}'), [
    { role: 'first_frame', media_type: 'image', resource_id: 203 },
  ])
})

test('generation readiness blocks missing first and last frame references before submit', () => {
  const readiness = evaluateGenerationReadiness({
    prompt: 'make the character walk',
    modelId: 'video-model',
    outputKind: 'video',
    requireGenerationIntent: true,
    inputResourceIds: [101],
    generationIntent: {
      capability: 'video_generation',
      operation: 'first_last_frame_to_video',
      reference_assets: [{ role: 'first_frame', media_type: 'image', resource_id: 101 }],
    },
  })

  assert.equal(readiness.status, 'blocked')
  assert(readiness.blockers.some((blocker) => blocker.message.includes('尾帧图')))
})

test('generation readiness blocks operations that do not accept current references', () => {
  const readiness = evaluateGenerationReadiness({
    prompt: 'use this image',
    modelId: 'image-model',
    outputKind: 'image',
    requireGenerationIntent: true,
    inputResourceIds: [301],
    generationIntent: {
      capability: 'image_generation',
      operation: 'text_to_image',
      reference_assets: [{ role: 'reference_image', media_type: 'image', resource_id: 301 }],
    },
  })

  assert.equal(readiness.status, 'blocked')
  assert(readiness.blockers.some((blocker) => blocker.code === 'operation_reference_assets_mismatch'))
})

test('generation readiness blocks unresolved content-unit prompt refs', () => {
  const readiness = evaluateGenerationReadiness({
    prompt: 'use {{asset::hero}}',
    modelId: 'image-model',
    outputKind: 'image',
    generationIntent: {
      capability: 'image_generation',
      operation: 'text_to_image',
    },
    promptBlockers: [{ code: 'missing_selection', ref: 'asset::hero' }],
  })

  assert.equal(readiness.status, 'blocked')
  assert.deepEqual(readiness.blockers.map((blocker) => blocker.code), ['prompt_blocker'])
})

test('generation readiness accepts prompt-only image generation with explicit intent', () => {
  const readiness = evaluateGenerationReadiness({
    prompt: 'a clean product photo',
    modelId: 'image-model',
    outputKind: 'image',
    generationIntent: {
      capability: 'image_generation',
      operation: 'text_to_image',
    },
  })

  assert.equal(readiness.status, 'ready')
  assert.equal(readiness.blockers.length, 0)
})

test('prompt composer operation options exclude prompt-only generation when references exist', () => {
  const imageRefs = [{ role: 'reference_image', media_type: 'image', resource_id: 101 }]
  const operations = generationOperationOptionsForOutputKind('image', imageRefs).map((item) => item.value)

  assert(!operations.includes('text_to_image'))
  assert(operations.includes('image_to_image'))
  assert(operations.includes('reference_to_image'))

  assert.equal(generationOperationAcceptsReferences('text_to_image', imageRefs), false)
  assert.equal(generationOperationAcceptsReferences('image_to_image', imageRefs), true)
})

test('prompt composer requires explicit first and last frame roles', () => {
  const ordinaryImageRefs = [
    { role: 'reference_image', media_type: 'image', resource_id: 101 },
    { role: 'generic', media_type: 'image', resource_id: 102 },
  ]
  assert.equal(generationOperationAcceptsReferences('first_frame_to_video', ordinaryImageRefs), false)
  assert.equal(generationOperationAcceptsReferences('first_last_frame_to_video', ordinaryImageRefs), false)

  const firstFrameRefs = [{ role: 'first_frame', media_type: 'image', resource_id: 101 }]
  assert.equal(generationOperationAcceptsReferences('first_frame_to_video', firstFrameRefs), true)
  assert.equal(generationOperationAcceptsReferences('first_last_frame_to_video', firstFrameRefs), false)

  const firstLastFrameRefs = [
    { role: 'first_frame', media_type: 'image', resource_id: 101 },
    { role: 'last_frame', media_type: 'image', resource_id: 102 },
  ]
  assert.equal(generationOperationAcceptsReferences('first_last_frame_to_video', firstLastFrameRefs), true)
})

test('prompt composer completes loose resources as ordinary references, not frame roles', () => {
  const refs = completeGenerationReferenceAssets({
    operation: 'first_last_frame_to_video',
    inputResourceIds: [101, 102],
  })

  assert.deepEqual(refs, [
    { role: 'reference_image', media_type: 'image', resource_id: 101 },
    { role: 'reference_image', media_type: 'image', resource_id: 102 },
  ])
  assert.equal(generationOperationAcceptsReferences('first_last_frame_to_video', refs), false)

  assert.deepEqual(buildGenerationIntentForOutputKind({
    outputKind: 'video',
    operation: 'image_to_video',
    referenceAssets: refs.slice(0, 1),
  }), {
    capability: 'video_generation',
    operation: 'image_to_video',
    reference_assets: [
      { role: 'reference_image', media_type: 'image', resource_id: 101 },
    ],
  })
})

test('prompt composer exposes shared reference role labels and options', () => {
  assert.deepEqual(generationReferenceRoleOptionsForMediaType('image').map((option) => option.value), [
    'reference_image',
    'first_frame',
    'last_frame',
    'style_reference',
  ])
  assert.deepEqual(generationReferenceRoleOptionsForMediaType('video').map((option) => option.value), [
    'reference_video',
    'motion_reference',
    'source_video',
  ])
  assert.equal(generationReferenceRoleLabel('first_frame'), '首帧')
  assert.equal(generationReferenceRoleLabel('reference_audio'), '音频参考')
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
    text: 'Use @[resource:7] and [[resource::8]] and {{resource::11}} as references.',
    negative_text: 'Do not drift from [[resource::9]].',
    resource_ids: [7, 10],
  }

  assert.equal(compiledContentUnitGenerationPromptText(compiledPrompt), 'Use and and as references.')
  assert.deepEqual(compiledContentUnitGenerationPromptResourceIds(compiledPrompt), [7, 8, 11, 9, 10])

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
        { role: 'reference_image', media_type: 'image', resource_id: 11 },
        { role: 'reference_image', media_type: 'image', resource_id: 9 },
        { role: 'reference_image', media_type: 'image', resource_id: 10 },
      ],
    },
  })

  assert.equal(request.promptText, 'Use and and as references.')
  assert.deepEqual(request.inputResourceIds, [7, 8, 11, 9, 10])
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
