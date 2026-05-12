import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adapterParamsForCapabilities,
  buildParamContractAudit,
  parseParamDefs,
  serializeParamDefs,
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
})

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
  ]
  const audit = buildParamContractAudit('{"allow":["duration","duration","missing"],"deny":["duration"]}', adapterParams)

  assert.equal(audit.errors.some((error) => error.includes('duplicated parameter "duration"')), true)
  assert.equal(audit.errors.some((error) => error.includes('unknown parameter "missing"')), true)
  assert.equal(audit.errors.some((error) => error.includes('both allow and deny')), true)
})

test('model param profile audit reports invalid profile field shapes', () => {
  const audit = buildParamContractAudit(JSON.stringify({
    alow: ['duration'],
    allow: 'duration',
    deny: [1],
    override: { duration: '5' },
    add: ['web_search'],
  }), [])

  assert.equal(audit.errors.some((error) => error.includes('unknown field "alow"')), true)
  assert.equal(audit.errors.some((error) => error.includes('allow must be an array')), true)
  assert.equal(audit.errors.some((error) => error.includes('deny[0] must be a parameter key string')), true)
  assert.equal(audit.errors.some((error) => error.includes('override.duration must be a parameter definition object')), true)
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
    { key: 'duration', label: 'Duration', type: 'select', options: [], conflicts_with: ['frames'], defualt: '5' },
    { key: 'resolution', label: 'Resolution', type: 'select', options: ['720p', '720p'] },
    { key: 'quality', label: 'Quality', type: 'select', options: [''] },
    { key: 'negative_prompt', label: '', type: 'string' },
    { key: 'duration', label: 'Duplicate', type: 'number', min: 10, max: 5 },
    { key: 'steps', label: 'Steps', type: 'number', step: -1 },
  ]), [])

  assert.equal(audit.errors.some((error) => error.includes('needs at least one option')), true)
  assert.equal(audit.errors.some((error) => error.includes('unknown field "defualt"')), true)
  assert.equal(audit.errors.some((error) => error.includes('duplicate option')), true)
  assert.equal(audit.errors.some((error) => error.includes('empty option')), true)
  assert.equal(audit.errors.some((error) => error.includes('label is required')), true)
  assert.equal(audit.errors.some((error) => error.includes('duplicated')), true)
  assert.equal(audit.errors.some((error) => error.includes('min greater than max')), true)
  assert.equal(audit.errors.some((error) => error.includes('negative step')), true)
  assert.equal(audit.errors.some((error) => error.includes('unknown parameter')), true)
})

test('model param profile audit reports unknown param fields', () => {
  const audit = buildParamContractAudit(JSON.stringify({
    add: [{ key: 'negative_prompt', label: 'Negative Prompt', type: 'string', defualt: 'low quality' }],
  }), [])

  assert.equal(audit.errors.some((error) => error.includes('Profile add[0]') && error.includes('unknown field "defualt"')), true)
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
    { key: 'steps', label: 'Steps', type: 'number', json_schema: { minimum: 10, maximum: 5 } },
    { key: 'seed', label: 'Seed', type: 'number', default: 31, json_schema: { enum: [29, 33] } },
  ]), [])

  assert.equal(audit.errors.some((error) => error.includes('frames') && error.includes('json_schema.enum')), true)
  assert.equal(audit.errors.some((error) => error.includes('steps') && error.includes('minimum is greater')), true)
  assert.equal(audit.errors.some((error) => error.includes('seed') && error.includes('default is not in json_schema.enum')), true)
})

test('model param contract audit reports invalid rule values', () => {
  const audit = buildParamContractAudit(JSON.stringify([
    { key: 'draft', label: 'Draft', type: 'boolean' },
    { key: 'resolution', label: 'Resolution', type: 'select', options: ['480p'], conditional_enum: [{ when_param: 'draft', when_value: 'true', options: ['720p', '720p'], whenParam: 'draft' }] },
    { key: 'return_last_frame', label: 'Return Last Frame', type: 'boolean', conditional_const: [{ when_param: 'draft', when_value: true, vale: false }] },
    { key: 'sequential_image_generation', label: 'Sequential', type: 'select', options: ['disabled', 'auto'] },
    { key: 'image_count', label: 'Image Count', type: 'number', min: 1, max: 15, requires_value: [{ param: 'sequential_image_generation', value: 'enabled', parameter: 'sequential_image_generation' }] },
  ]), [])

  assert.equal(audit.errors.some((error) => error.includes('conditional_enum[0]') && error.includes('unknown field "whenParam"')), true)
  assert.equal(audit.errors.some((error) => error.includes('conditional_const[0]') && error.includes('unknown field "vale"')), true)
  assert.equal(audit.errors.some((error) => error.includes('requires_value[0]') && error.includes('unknown field "parameter"')), true)
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
