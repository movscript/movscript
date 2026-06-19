import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROVIDER_RUNTIME_API_CONTRACTS,
  providerRuntimeAdapterAvailable,
  providerRuntimeApiContract,
  providerRuntimeApiSupportsKind,
  RUNTIME_BACKEND_CONTRACTS,
  runtimeBackendAvailable,
  runtimeBackendContract,
  runtimeBackendSupport,
  runtimeBackendSupportsKind,
} from '@/shared/infrastructure/providerRuntimeApiCatalog'
import { AGENT_RUNTIME_REQUIRED_RPC_METHODS } from '@/shared/infrastructure/agent-runtime/agentRuntimeProtocol'

test('provider runtime API catalog declares the built-in runtime backends', () => {
  assert.deepEqual(PROVIDER_RUNTIME_API_CONTRACTS.map((contract) => contract.api), [
    'codex-app-server',
    'mova-app-server',
    'codex-sdk',
    'mova-sdk',
    'claude-sdk',
  ])
  assert.deepEqual(RUNTIME_BACKEND_CONTRACTS, PROVIDER_RUNTIME_API_CONTRACTS)

  assert.equal(providerRuntimeAdapterAvailable('codex-app-server'), true)
  assert.equal(providerRuntimeAdapterAvailable('mova-app-server'), true)
  assert.equal(providerRuntimeAdapterAvailable('codex-sdk'), true)
  assert.equal(providerRuntimeAdapterAvailable('mova-sdk'), true)
  assert.equal(providerRuntimeAdapterAvailable('claude-sdk'), true)
  assert.equal(runtimeBackendAvailable('codex-app-server'), true)
})

test('runtime API catalog binds runtime backends to provider-neutral capability contracts', () => {
  const codexAppServer = runtimeBackendContract('codex-app-server')
  const movaAppServer = runtimeBackendContract('mova-app-server')
  const codex = providerRuntimeApiContract('codex-sdk')
  const mova = providerRuntimeApiContract('mova-sdk')
  const claude = providerRuntimeApiContract('claude-sdk')

  assert.ok(codexAppServer)
  assert.ok(movaAppServer)
  assert.ok(codex)
  assert.ok(mova)
  assert.ok(claude)
  assert.equal(codexAppServer.transport, 'app-server')
  assert.equal(movaAppServer.transport, 'app-server')
  assert.equal(codex.transport, 'sdk-client')
  assert.equal(mova.transport, 'sdk-client')
  assert.equal(codex.sdkPackageName, '@openai/codex-sdk')
  assert.equal(codex.packageName, '@openai/codex')
  assert.equal(mova.packageName, undefined)
  assert.equal(mova.binaryPackageName, '@movscript/mova')
  assert.equal(claude.packageName, '@anthropic-ai/claude-agent-sdk')
  assert.equal(claude.binaryPackageName, '@anthropic-ai/claude-code')
  assert.equal(codexAppServer.binaryPackageName, '@movscript/mova')
  assert.equal(movaAppServer.binaryPackageName, '@movscript/mova')
  assert.deepEqual(codex.requiredPackageExports, ['Codex'])
  assert.deepEqual(mova.requiredPackageExports, ['Codex'])
  assert.deepEqual(claude.requiredPackageExports, ['query'])
  assert.deepEqual(codexAppServer.requiredRpcMethods, AGENT_RUNTIME_REQUIRED_RPC_METHODS)
  assert.deepEqual(movaAppServer.requiredRpcMethods, AGENT_RUNTIME_REQUIRED_RPC_METHODS)
  assert.deepEqual(codex.requiredRpcMethods, AGENT_RUNTIME_REQUIRED_RPC_METHODS)
  assert.deepEqual(mova.requiredRpcMethods, AGENT_RUNTIME_REQUIRED_RPC_METHODS)
  assert.deepEqual(claude.requiredRpcMethods, AGENT_RUNTIME_REQUIRED_RPC_METHODS)
  assert.equal(codex.thread.stream, true)
  assert.equal(mova.thread.stream, true)
  assert.equal(claude.thread.stream, true)
  assert.equal(codex.capabilities.permissions, true)
  assert.equal(mova.capabilities.permissions, true)
  assert.equal(claude.capabilities.permissions, true)
  assert.equal(codexAppServer.support.capabilities.tools.level, 'supported')
  assert.equal(codex.support.capabilities.account.supported, true)
  assert.equal(claude.support.capabilities.config.supported, false)
  assert.equal(claude.support.capabilities.config.level, 'unsupported')
  assert.match(claude.support.capabilities.config.reason ?? '', /Claude Agent SDK/)
  assert.equal(runtimeBackendSupport('claude-sdk')?.capabilities.account.supported, false)
})

test('runtime API catalog prevents unsupported provider/runtime pairings', () => {
  assert.equal(runtimeBackendSupportsKind('codex-app-server', 'codex'), true)
  assert.equal(runtimeBackendSupportsKind('codex-app-server', 'mova'), false)
  assert.equal(providerRuntimeApiSupportsKind('mova-app-server', 'mova'), true)
  assert.equal(providerRuntimeApiSupportsKind('mova-app-server', 'codex'), false)
  assert.equal(providerRuntimeApiSupportsKind('codex-sdk', 'codex'), true)
  assert.equal(providerRuntimeApiSupportsKind('codex-sdk', 'claude'), false)
  assert.equal(providerRuntimeApiSupportsKind('mova-sdk', 'mova'), true)
  assert.equal(providerRuntimeApiSupportsKind('mova-sdk', 'codex'), false)
  assert.equal(providerRuntimeApiSupportsKind('claude-sdk', 'claude'), true)
  assert.equal(providerRuntimeApiSupportsKind('claude-sdk', 'mova'), false)
})
