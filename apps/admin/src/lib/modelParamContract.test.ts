import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  type AgentCompactParamContract,
  adapterParamsForCapabilities,
  buildAgentCompactParamContract,
  buildParamContractAudit,
  parseParamDefs,
  serializeParamDefs,
  summarizeParamRuleTypes,
} from './modelParamContract'
import type { AdapterDef, ParamDef } from '@/types'

test('model param contract audit normalizes aliases and preserves rule fields', () => {
  const encoded = serializeParamDefs([{
    key: 'ratio',
    label: 'Ratio',
    type: 'select',
    options: ['16:9'],
    conflicts_with: ['frames'],
    json_schema: { description: 'ratio control' },
  } as ParamDef])
  const params = parseParamDefs(encoded)

  assert.equal(params[0]?.key, 'aspect_ratio')
  assert.deepEqual(params[0]?.conflicts_with, ['frames'])
  assert.deepEqual(params[0]?.json_schema, { description: 'ratio control' })

  const aliasParams = parseParamDefs(serializeParamDefs([
    { key: 'duration_seconds', label: 'Duration Seconds', type: 'select', options: ['5'] },
    { key: 'size', label: 'Size', type: 'select', options: ['1024x1024'] },
    { key: 'guidance_scale', label: 'Guidance Scale', type: 'number' },
    { key: 'max_images', label: 'Max Images', type: 'number' },
    { key: 'camera_fixed', label: 'Camera Fixed', type: 'boolean' },
    { key: 'generate_audio', label: 'Generate Audio', type: 'boolean' },
  ] as ParamDef[]))
  assert.deepEqual(
    aliasParams.map((param) => param.key),
    ['duration', 'image_size', 'prompt_strength', 'image_count', 'fixed_camera', 'audio'],
  )
})

test('model param contract audit summarizes rule types for admin preview', () => {
  const summary = summarizeParamRuleTypes([
    {
      key: 'duration',
      label: 'Duration',
      type: 'select',
      options: ['5'],
      conflicts_with: ['frames'],
      conditional_enum: [{ when_param: 'draft', when_value: true, options: ['5'] }],
      conditional_const: [{ when_param: 'draft', when_value: true, value: '5' }],
      requires_value: [{ param: 'resolution', value: '720p' }],
    },
    {
      key: 'frames',
      label: 'Frames',
      type: 'number',
      conflicts_with: ['duration'],
    },
  ] as ParamDef[])

  assert.deepEqual(summary, {
    conflicts: 2,
    conditionalEnums: 1,
    conditionalConsts: 1,
    requiresValues: 1,
    total: 5,
  })
})

test('agent compact param contract keeps supported keys and compact rules', () => {
  const fixture = loadAgentCompactContractFixture()
  assert.deepEqual(
    buildAgentCompactParamContract([
      {
        key: 'draft',
        label: 'Draft',
        type: 'boolean',
      },
      {
        key: 'resolution',
        label: 'Resolution',
        type: 'select',
        options: ['360p', '480p'],
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
    ] as ParamDef[]),
    compactFixtureSubsetForAdmin(fixture),
  )
})

test('agent compact param contract accepts fallback input requirements', () => {
  assert.deepEqual(
    buildAgentCompactParamContract(
      [{ key: 'duration', label: 'Duration', type: 'select', options: ['5'] }] as ParamDef[],
      {
        image: { min: 1, max: 4 },
        video: { min: 0, max: 0 },
      },
    ).input_requirements,
    {
      image: { min: 1, max: 4 },
      video: { min: 0, max: 0 },
    },
  )
})

test('agent compact contract type accepts schema-derived fixture fields', () => {
  const fixture: AgentCompactParamContract = loadAgentCompactContractFixture() as AgentCompactParamContract
  const frames = fixture.supported_params.find((param) => param.key === 'frames')

  assert.deepEqual(frames?.enum, [29, 33, 37])
  assert.equal(frames?.description, 'Frame count must match 25 + 4n.')
})

test('model param admin aliases match the shared manifest', () => {
  const aliases = loadModelParamAliasManifest()
  const params = parseParamDefs(serializeParamDefs(Object.entries(aliases).map(([key]) => ({
    key,
    label: key,
    type: 'select',
    options: ['value'],
  } as ParamDef))))
  assert.deepEqual(
    params.map((param) => param.key),
    Object.values(aliases),
  )
})

test('model preset supported params serialize into custom supported params', () => {
  const presetParams = [
    {
      key: 'duration',
      label: 'Duration',
      type: 'select',
      options: ['5', '10'],
      default: '5',
      conflicts_with: ['frames'],
    },
    {
      key: 'frames',
      label: 'Frames',
      type: 'number',
      min: 29,
      max: 289,
      step: 4,
      json_schema: { enum: [29, 33, 37] },
    },
  ] as ParamDef[]
  const encoded = serializeParamDefs(presetParams)
  const audit = buildParamContractAudit(encoded, [])

  assert.deepEqual(audit.errors, [])
  assert.deepEqual(audit.params.map((param) => param.key), ['duration', 'frames'])
  assert.deepEqual(audit.params[0]?.conflicts_with, ['frames'])
  assert.deepEqual(audit.params[1]?.json_schema, { enum: [29, 33, 37] })
})

function loadModelParamAliasManifest(): Record<string, string> {
  return JSON.parse(readFileSync(resolve(process.cwd(), '../../contracts/model-param-aliases.json'), 'utf8')) as Record<string, string>
}

function loadAgentCompactContractFixture(): Record<string, any> {
  return JSON.parse(readFileSync(resolve(process.cwd(), '../../contracts/agent/agent-compact-contract-v1.fixture.json'), 'utf8')) as Record<string, any>
}

function compactFixtureSubsetForAdmin(fixture: Record<string, any>): Record<string, any> {
  return {
    contract_version: fixture.contract_version,
    input_requirements: {
      image: { min: 0, max: 0 },
      video: { min: 0, max: 0 },
    },
    supported_param_keys: fixture.supported_param_keys,
    supported_params: fixture.supported_params.map((param: Record<string, any>) => {
      const { enum: _enum, description: _description, ...rest } = param
      return rest
    }),
  }
}

test('model param contract audit accepts string params and preserves defaults', () => {
  const encoded = serializeParamDefs([{
    key: 'negative_prompt',
    label: 'Negative Prompt',
    type: 'string',
    default: 'low quality',
  } as ParamDef])
  const audit = buildParamContractAudit(encoded, [])

  assert.deepEqual(audit.errors, [])
  assert.deepEqual(audit.params[0], {
    key: 'negative_prompt',
    label: 'Negative Prompt',
    type: 'string',
    default: 'low quality',
  })
})

test('model param serialization preserves explicit boolean false default', () => {
  const encoded = serializeParamDefs([{
    key: 'draft',
    label: 'Draft',
    type: 'boolean',
    default: 'false',
  } as ParamDef])
  const params = parseParamDefs(encoded)

  assert.equal(params[0]?.default, false)
})

test('model param serialization omits non-finite number fields instead of writing null', () => {
  const encoded = serializeParamDefs([{
    key: 'frames',
    label: 'Frames',
    type: 'number',
    default: Number.NaN,
    min: Number.POSITIVE_INFINITY,
    max: '289',
    step: '4',
  } as unknown as ParamDef])
  const parsed = JSON.parse(encoded) as ParamDef[]

  assert.equal(encoded.includes('null'), false)
  assert.equal(parsed[0]?.default, undefined)
  assert.equal(parsed[0]?.min, undefined)
  assert.equal(parsed[0]?.max, 289)
  assert.equal(parsed[0]?.step, 4)
})

test('model param serialization tolerates malformed array fields without throwing', () => {
  const encoded = serializeParamDefs([{
    key: 'resolution',
    label: 'Resolution',
    type: 'select',
    options: '480p',
    conflicts_with: ['frames'],
    conditional_enum: ['draft', { when_param: 'draft', when_value: true, options: '480p' }],
    conditional_const: ['draft'],
    requires_value: ['sequential_image_generation'],
  } as unknown as ParamDef])
  const parsed = JSON.parse(encoded) as ParamDef[]

  assert.deepEqual(parsed[0]?.options, [])
  assert.deepEqual(parsed[0]?.conflicts_with, ['frames'])
  assert.equal(parsed[0]?.conditional_enum, undefined)
  assert.equal(parsed[0]?.conditional_const, undefined)
  assert.equal(parsed[0]?.requires_value, undefined)
})

test('model param profile audit prunes inherited rules when allow removes referenced params', () => {
  const adapterParams: ParamDef[] = [
    { key: 'duration', label: 'Duration', type: 'select', options: ['5'], conflicts_with: ['frames'] },
    { key: 'frames', label: 'Frames', type: 'number', min: 29, max: 289, step: 4 },
  ]
  const audit = buildParamContractAudit('{"allow":["duration"]}', adapterParams)

  assert.equal(audit.mode, 'profile')
  assert.deepEqual(audit.params.map((param) => param.key), ['duration'])
  assert.deepEqual(audit.params[0]?.conflicts_with, [])
  assert.deepEqual(audit.errors, [])
  assert.equal(audit.schemaRuleCount, 0)
})

test('model param profile audit reports unknown and conflicting allow deny keys', () => {
  const adapterParams: ParamDef[] = [
    { key: 'duration', label: 'Duration', type: 'select', options: ['5'] },
    { key: 'aspect_ratio', label: 'Aspect Ratio', type: 'select', options: ['16:9'] },
  ]
  const audit = buildParamContractAudit(JSON.stringify({
    allow: ['duration', 'duration', 'missing'],
    deny: ['duration'],
    override: { duration: { key: 'duration_seconds', type: 'select', options: ['5'] }, aspect_ratio: { key: 'ratio', type: 'select', options: ['16:9'] } },
    add: [
      { key: 'web_search', label: 'Web Search', type: 'boolean' },
      { key: 'web_search', label: 'Web Search 2', type: 'boolean' },
      { key: 'duration', label: 'Duration', type: 'select', options: ['10'] },
      { key: 'ratio', label: 'Ratio', type: 'select', options: ['16:9'] },
    ],
  }), adapterParams)

  assert.equal(audit.errors.some((error) => error.includes('duplicated parameter "duration"')), true)
  assert.equal(audit.errors.some((error) => error.includes('unknown parameter "missing"')), true)
  assert.equal(audit.errors.some((error) => error.includes('both allow and deny')), true)
  assert.equal(audit.errors.some((error) => error.includes('add contains duplicated parameter "web_search"')), true)
  assert.equal(audit.errors.some((error) => error.includes('add parameter "duration" already exists')), true)
  assert.equal(audit.errors.some((error) => error.includes('add parameter "aspect_ratio" already exists')), true)
  assert.equal(audit.errors.some((error) => error.includes('override.duration key must match')), false)
  assert.equal(audit.errors.some((error) => error.includes('override.aspect_ratio key must match')), false)
})

test('model param profile audit reports invalid profile field shapes', () => {
  const audit = buildParamContractAudit(JSON.stringify({
    alow: ['duration'],
    allow: 'duration',
    deny: [1],
    override: { duration: '5', frames: { key: 'duration', type: 'number' } },
    add: ['web_search'],
  }), [])

  assert.equal(audit.errors.some((error) => error.includes('unknown field "alow"')), true)
  assert.equal(audit.errors.some((error) => error.includes('allow must be an array')), true)
  assert.equal(audit.errors.some((error) => error.includes('deny[0] must be a parameter key string')), true)
  assert.equal(audit.errors.some((error) => error.includes('override.duration must be a parameter definition object')), true)
  assert.equal(audit.errors.some((error) => error.includes('override.frames key must match override key "frames"')), true)
  assert.equal(audit.errors.some((error) => error.includes('add[0] must be a parameter definition object')), true)
})

test('model param profile audit allows allow list to reference added params', () => {
  const adapterParams: ParamDef[] = [
    { key: 'duration', label: 'Duration', type: 'select', options: ['5'] },
  ]
  const audit = buildParamContractAudit(JSON.stringify({
    allow: ['web_search'],
    add: [{ key: 'web_search', label: 'Web Search', type: 'boolean' }],
  }), adapterParams)

  assert.deepEqual(audit.errors, [])
  assert.deepEqual(audit.params.map((param) => param.key), ['web_search'])
})

test('model param contract audit reports invalid control shapes and rule refs', () => {
  const audit = buildParamContractAudit(JSON.stringify([
    'duration',
    { key: 'duration', label: 'Duration', type: 'select', options: [], conflicts_with: ['frames'], defualt: '5' },
    { key: 'resolution', label: 'Resolution', type: 'select', options: ['720p', '720p'] },
    { key: 'quality', label: 'Quality', type: 'select', options: [''] },
    { key: 'negative_prompt', label: '', type: 'string' },
    { key: 'duration', label: 'Duplicate', type: 'number', min: 10, max: 5 },
    { key: 'steps', label: 'Steps', type: 'number', step: 0 },
  ]), [])

  assert.equal(audit.errors.some((error) => error.includes('custom_supported_params[0] must be a parameter definition object')), true)
  assert.equal(audit.errors.some((error) => error.includes('needs at least one option')), true)
  assert.equal(audit.errors.some((error) => error.includes('unknown field "defualt"')), true)
  assert.equal(audit.errors.some((error) => error.includes('duplicate option')), true)
  assert.equal(audit.errors.some((error) => error.includes('empty option')), true)
  assert.equal(audit.errors.some((error) => error.includes('label is required')), true)
  assert.equal(audit.errors.some((error) => error.includes('duplicated')), true)
  assert.equal(audit.errors.some((error) => error.includes('min greater than max')), true)
  assert.equal(audit.errors.some((error) => error.includes('step must be greater than zero')), true)
  assert.equal(audit.errors.some((error) => error.includes('unknown parameter')), true)
})

test('model param contract audit reports invalid scalar field shapes', () => {
  const audit = buildParamContractAudit(JSON.stringify([
    { key: 123, label: 'Negative Prompt', type: 'string' },
    { key: 'duration', label: 123, type: 'select', options: ['5'] },
    { key: 'frames', label: 'Frames', type: 'number', min: '1', max: '10', step: '1' },
  ]), [])

  assert.equal(audit.errors.some((error) => error.includes('custom_supported_params[0].key must be a string')), true)
  assert.equal(audit.errors.some((error) => error.includes('custom_supported_params[1].label must be a string')), true)
  assert.equal(audit.errors.some((error) => error.includes('custom_supported_params[2].min must be a number')), true)
  assert.equal(audit.errors.some((error) => error.includes('custom_supported_params[2].max must be a number')), true)
  assert.equal(audit.errors.some((error) => error.includes('custom_supported_params[2].step must be a number')), true)
})

test('model param profile audit reports unknown param fields', () => {
  const audit = buildParamContractAudit(JSON.stringify({
    add: [{ key: 'negative_prompt', label: 'Negative Prompt', type: 'string', defualt: 'low quality' }],
  }), [])

  assert.equal(audit.errors.some((error) => error.includes('Profile add[0]') && error.includes('unknown field "defualt"')), true)
})

test('model param contract audit reports explicit null fields', () => {
  const audit = buildParamContractAudit(JSON.stringify([
    { key: 'duration', label: 'Duration', type: 'select', options: null, default: null },
    { key: 'frames', label: 'Frames', type: 'number', json_schema: null },
  ]), [])

  assert.equal(audit.errors.some((error) => error.includes('custom_supported_params[0].options must not be null')), true)
  assert.equal(audit.errors.some((error) => error.includes('custom_supported_params[0].default must not be null')), true)
  assert.equal(audit.errors.some((error) => error.includes('custom_supported_params[1].json_schema must not be null')), true)
})

test('model param contract audit reports malformed array fields without throwing', () => {
  const audit = buildParamContractAudit(JSON.stringify([
    {
      key: 'resolution',
      label: 'Resolution',
      type: 'select',
      options: [480],
      conflicts_with: [1],
      conditional_enum: ['draft'],
      json_schema: [],
    },
  ]), [])

  assert.equal(audit.errors.some((error) => error.includes('options[0] must be a string')), true)
  assert.equal(audit.errors.some((error) => error.includes('conflicts_with[0] must be a string')), true)
  assert.equal(audit.errors.some((error) => error.includes('conditional_enum[0] must be an object')), true)
  assert.equal(audit.errors.some((error) => error.includes('json_schema must be an object')), true)
})

test('model param contract audit reports non-array fields without throwing', () => {
  const audit = buildParamContractAudit(JSON.stringify([
    {
      key: 'resolution',
      label: 'Resolution',
      type: 'select',
      options: '480p',
      conflicts_with: 'frames',
      conditional_enum: { when_param: 'draft', when_value: true, options: ['480p'] },
    },
  ]), [])

  assert.equal(audit.errors.some((error) => error.includes('options must be an array')), true)
  assert.equal(audit.errors.some((error) => error.includes('conflicts_with must be an array')), true)
  assert.equal(audit.errors.some((error) => error.includes('conditional_enum must be an array')), true)
})

test('model param contract audit keeps params with missing labels so errors are visible', () => {
  const audit = buildParamContractAudit(JSON.stringify([
    { key: 'custom_text', type: 'string' },
  ]), [])

  assert.deepEqual(audit.params.map((param) => param.key), ['custom_text'])
  assert.equal(audit.errors.some((error) => error.includes('custom_text') && error.includes('label is required')), true)
})

test('model param contract audit reports invalid default values', () => {
  const audit = buildParamContractAudit(JSON.stringify([
    { key: 'duration', label: 'Duration', type: 'select', options: ['5'], default: '10' },
    { key: 'frames', label: 'Frames', type: 'number', min: 29, max: 289, default: 10 },
    { key: 'draft', label: 'Draft', type: 'boolean', default: 'false' },
    { key: 'negative_prompt', label: 'Negative Prompt', type: 'string', default: 123 },
  ]), [])

  assert.equal(audit.errors.some((error) => error.includes('duration') && error.includes('default is not in options')), true)
  assert.equal(audit.errors.some((error) => error.includes('frames') && error.includes('default is less than min')), true)
  assert.equal(audit.errors.some((error) => error.includes('draft') && error.includes('default must be a boolean')), true)
  assert.equal(audit.errors.some((error) => error.includes('negative_prompt') && error.includes('default must be a string')), true)
})

test('model param contract audit reports invalid json schema keywords', () => {
  const audit = buildParamContractAudit(JSON.stringify([
    { key: 'frames', label: 'Frames', type: 'number', json_schema: { enum: '29' } },
    { key: 'frame_enum', label: 'Frame Enum', type: 'number', json_schema: { enum: [29, { value: 33 }] } },
    { key: 'steps', label: 'Steps', type: 'number', json_schema: { minimum: 10, maximum: 5 } },
    { key: 'seed', label: 'Seed', type: 'number', default: 31, json_schema: { enum: [29, 33] } },
  ]), [])

  assert.equal(audit.errors.some((error) => error.includes('frames') && error.includes('json_schema.enum')), true)
  assert.equal(audit.errors.some((error) => error.includes('frame_enum') && error.includes('json_schema.enum')), true)
  assert.equal(audit.errors.some((error) => error.includes('steps') && error.includes('minimum is greater')), true)
  assert.equal(audit.errors.some((error) => error.includes('seed') && error.includes('default is not in json_schema.enum')), true)
})

test('model param contract audit reports invalid rule values', () => {
  const audit = buildParamContractAudit(JSON.stringify([
    { key: 'draft', label: 'Draft', type: 'boolean' },
    { key: 'resolution', label: 'Resolution', type: 'select', options: ['480p'], conditional_enum: [{ when_param: 'draft', when_value: 'true', options: ['720p', '720p'], whenParam: 'draft' }, { when_param: 1, when_value: true, options: '480p' }, { when_param: 'draft', when_value: true, options: [480] }, { when_param: null, when_value: true, options: ['480p'] }] },
    { key: 'return_last_frame', label: 'Return Last Frame', type: 'boolean', conditional_const: [{ when_param: 'draft', when_value: true, vale: false }, { when_param: 1, when_value: true, value: false }, { when_param: 'draft', when_value: true, value: null }] },
    { key: 'sequential_image_generation', label: 'Sequential', type: 'select', options: ['disabled', 'auto'] },
    { key: 'image_count', label: 'Image Count', type: 'number', min: 1, max: 15, requires_value: [{ param: 'sequential_image_generation', value: 'enabled', parameter: 'sequential_image_generation' }, { param: 1, value: 'auto' }, { param: null, value: 'auto' }] },
  ]), [])

  assert.equal(audit.errors.some((error) => error.includes('conditional_enum[0]') && error.includes('unknown field "whenParam"')), true)
  assert.equal(audit.errors.some((error) => error.includes('conditional_enum[1].when_param') && error.includes('must be a string')), true)
  assert.equal(audit.errors.some((error) => error.includes('conditional_enum[1].options') && error.includes('must be an array')), true)
  assert.equal(audit.errors.some((error) => error.includes('conditional_enum[2].options[0]') && error.includes('must be a string')), true)
  assert.equal(audit.errors.some((error) => error.includes('conditional_enum[3].when_param') && error.includes('must not be null')), true)
  assert.equal(audit.errors.some((error) => error.includes('conditional_const[0]') && error.includes('unknown field "vale"')), true)
  assert.equal(audit.errors.some((error) => error.includes('conditional_const[1].when_param') && error.includes('must be a string')), true)
  assert.equal(audit.errors.some((error) => error.includes('conditional_const[2].value') && error.includes('must not be null')), true)
  assert.equal(audit.errors.some((error) => error.includes('requires_value[0]') && error.includes('unknown field "parameter"')), true)
  assert.equal(audit.errors.some((error) => error.includes('requires_value[1].param') && error.includes('must be a string')), true)
  assert.equal(audit.errors.some((error) => error.includes('requires_value[2].param') && error.includes('must not be null')), true)
  assert.equal(audit.errors.some((error) => error.includes('conditional enum when_value') && error.includes('boolean')), true)
  assert.equal(audit.errors.some((error) => error.includes('conditional enum option') && error.includes('options')), true)
  assert.equal(audit.errors.some((error) => error.includes('conditional enum options') && error.includes('duplicate option')), true)
  assert.equal(audit.errors.some((error) => error.includes('requires_value value') && error.includes('options')), true)
})

test('adapterParamsForCapabilities deduplicates params across selected capabilities', () => {
  const adapter = {
    adapter_type: 'test',
    display_name: 'Test',
    description: 'Test adapter',
    default_base_url: '',
    cred_fields: [],
    supports_files_api: false,
    param_sets: [
      { capability: 'image', params: [{ key: 'size', label: 'Size', type: 'select', options: ['1024x1024'] }] },
      { capability: 'image_edit', params: [{ key: 'image_size', label: 'Image Size', type: 'select', options: ['1024x1024'] }] },
    ],
  } as AdapterDef

  const params = adapterParamsForCapabilities(adapter, ['image', 'image_edit'])

  assert.deepEqual(params.map((param) => param.key), ['image_size'])
})
