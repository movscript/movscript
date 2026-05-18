import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import {
  readArgValue,
  readJSONFile,
  readTextFile,
  repoRootFromMeta,
  resolveRepoPath,
  assertArrayIncludes,
  assertEqual,
  assertIncludes,
  assertMinimumOccurrences,
  assertNotIncludes,
  assertSameStringSet,
  schemaNodeMatches,
  validateJSONSchemaFixture,
} from '../../scripts/verifier-utils.mjs'

test('verifier-utils resolves repository roots from nested script locations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-verifier-root-'))
  try {
    await writeFile(join(root, 'package.json'), '{}\n')
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
    await mkdir(join(root, 'scripts/nested'), { recursive: true })
    const metaUrl = pathToFileURL(join(root, 'scripts/nested/check.mjs')).href

    assert.equal(repoRootFromMeta(metaUrl), root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verifier-utils reads JSON and text using repository-relative paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-verifier-read-'))
  try {
    await mkdir(join(root, 'fixtures'), { recursive: true })
    await writeFile(join(root, 'fixtures/value.json'), '{"ok":true}\n')
    await writeFile(join(root, 'fixtures/value.txt'), 'hello\n')

    assert.deepEqual(readJSONFile(root, 'fixtures/value.json'), { ok: true })
    assert.equal(readTextFile(root, 'fixtures/value.txt'), 'hello\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verifier-utils resolves absolute and relative repository paths', () => {
  const root = process.cwd()
  const absolute = resolve(root, 'package.json')

  assert.equal(resolveRepoPath(root, 'package.json'), absolute)
  assert.equal(resolveRepoPath(root, absolute), absolute)
})

test('verifier-utils reads named argv values', () => {
  assert.equal(readArgValue('--fixture', ['node', 'script.mjs', '--fixture', 'value.json']), 'value.json')
  assert.equal(readArgValue('--missing', ['node', 'script.mjs']), undefined)
})

test('verifier-utils validates JSON schema fixtures used by static verifiers', () => {
  const schema = {
    type: 'object',
    required: ['schema', 'createdAt', 'items', 'action'],
    additionalProperties: false,
    properties: {
      schema: { const: 'fixture.v1' },
      createdAt: { type: 'string', format: 'date-time' },
      items: {
        type: 'array',
        maxItems: 2,
        contains: { const: 'required' },
        items: { type: 'string', minLength: 1 },
      },
      action: {
        oneOf: [
          { $ref: '#/$defs/approval' },
          { $ref: '#/$defs/input' },
        ],
      },
    },
    $defs: {
      approval: {
        type: 'object',
        required: ['type', 'tool'],
        additionalProperties: false,
        properties: {
          type: { const: 'approval' },
          tool: { type: 'string', minLength: 1 },
        },
      },
      input: {
        type: 'object',
        required: ['type', 'question'],
        additionalProperties: false,
        properties: {
          type: { const: 'input' },
          question: { type: 'string', minLength: 1 },
        },
      },
    },
  }
  const fixture = {
    schema: 'fixture.v1',
    createdAt: '2026-05-16T08:00:06.000Z',
    items: ['required'],
    action: { type: 'approval', tool: 'write_file' },
  }
  const errors = []

  validateJSONSchemaFixture(schema, fixture, '$fixture', errors)
  assert.deepEqual(errors, [])
  assert.equal(schemaNodeMatches(schema.properties.action, { type: 'input', question: 'Continue?' }, '$action', schema, errors), true)
  assert.equal(schemaNodeMatches(schema.properties.items, ['one', 'two', 'three'], '$items', schema, errors), false)
  assert.deepEqual(errors, [])
})

test('verifier-utils provides reusable static verifier assertions', () => {
  const errors = []

  assertIncludes(errors, 'alpha beta', 'alpha', 'include check')
  assertIncludes(errors, 'alpha beta', 'gamma', 'include check')
  assertNotIncludes(errors, 'alpha beta', 'delta', 'exclude check')
  assertNotIncludes(errors, 'alpha beta', 'beta', 'exclude check')
  assertEqual(errors, { stable: true }, { stable: true }, 'equal check')
  assertEqual(errors, { stable: true }, { stable: false }, 'mismatch check')
  assertMinimumOccurrences(errors, 'one two one', 'one', 2, 'occurrence check')
  assertMinimumOccurrences(errors, 'one two', 'one', 2, 'occurrence mismatch check')
  assertArrayIncludes(errors, ['one', 'two'], ['one', 'three'], 'array check')
  assertArrayIncludes(errors, 'not-array', ['one'], 'array type check')
  assertSameStringSet(errors, ['b', 'a'], ['a', 'b'], 'set check')
  assertSameStringSet(errors, ['a'], ['a', 'b'], 'set mismatch check')

  assert.deepEqual(errors, [
    'include check must include gamma',
    'exclude check must not include beta',
    'mismatch check: expected {"stable":false}, got {"stable":true}',
    'occurrence mismatch check: expected at least 2 occurrence(s) of one, got 1',
    'array check missing three',
    'array type check must be an array',
    'set mismatch check must exactly match a, b; got a',
  ])
})
