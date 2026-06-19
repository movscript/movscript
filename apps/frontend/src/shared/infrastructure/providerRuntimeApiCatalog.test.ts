import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROVIDER_RUNTIME_API_CONTRACTS,
  providerRuntimeAdapterAvailable,
  providerRuntimeApiContract,
  providerRuntimeApiSupportsKind,
} from '@/shared/infrastructure/providerRuntimeApiCatalog'
import { SDK_RUNTIME_REQUIRED_RPC_METHODS } from '@/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'

test('provider runtime API catalog declares the built-in SDK integration surfaces', () => {
  assert.deepEqual(PROVIDER_RUNTIME_API_CONTRACTS.map((contract) => contract.api), [
    'codex-sdk',
    'mova-sdk',
    'claude-sdk',
  ])

  assert.equal(providerRuntimeAdapterAvailable('codex-sdk'), true)
  assert.equal(providerRuntimeAdapterAvailable('mova-sdk'), true)
  assert.equal(providerRuntimeAdapterAvailable('claude-sdk'), true)
})

test('runtime API catalog binds SDK packages to provider-neutral capability contracts', () => {
  const codex = providerRuntimeApiContract('codex-sdk')
  const mova = providerRuntimeApiContract('mova-sdk')
  const claude = providerRuntimeApiContract('claude-sdk')

  assert.ok(codex)
  assert.ok(mova)
  assert.ok(claude)
  assert.equal(codex.sdkPackageName, '@openai/codex-sdk')
  assert.equal(codex.packageName, '@openai/codex')
  assert.equal(mova.packageName, undefined)
  assert.equal(mova.binaryPackageName, '@movscript/mova')
  assert.equal(claude.packageName, '@anthropic-ai/claude-agent-sdk')
  assert.equal(claude.binaryPackageName, '@anthropic-ai/claude-code')
  assert.deepEqual(codex.requiredPackageExports, ['Codex'])
  assert.deepEqual(mova.requiredPackageExports, ['Codex'])
  assert.deepEqual(claude.requiredPackageExports, ['query'])
  assert.deepEqual(codex.requiredRpcMethods, SDK_RUNTIME_REQUIRED_RPC_METHODS)
  assert.deepEqual(mova.requiredRpcMethods, SDK_RUNTIME_REQUIRED_RPC_METHODS)
  assert.deepEqual(claude.requiredRpcMethods, SDK_RUNTIME_REQUIRED_RPC_METHODS)
  assert.equal(codex.thread.stream, true)
  assert.equal(mova.thread.stream, true)
  assert.equal(claude.thread.stream, true)
  assert.equal(codex.capabilities.permissions, true)
  assert.equal(mova.capabilities.permissions, true)
  assert.equal(claude.capabilities.permissions, true)
})

test('runtime API catalog prevents unsupported provider/runtime pairings', () => {
  assert.equal(providerRuntimeApiSupportsKind('codex-sdk', 'codex'), true)
  assert.equal(providerRuntimeApiSupportsKind('codex-sdk', 'claude'), false)
  assert.equal(providerRuntimeApiSupportsKind('mova-sdk', 'mova'), true)
  assert.equal(providerRuntimeApiSupportsKind('mova-sdk', 'codex'), false)
  assert.equal(providerRuntimeApiSupportsKind('claude-sdk', 'claude'), true)
  assert.equal(providerRuntimeApiSupportsKind('claude-sdk', 'mova'), false)
})
