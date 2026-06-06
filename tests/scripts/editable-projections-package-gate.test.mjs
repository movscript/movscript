import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('root test command runs package test suites before application tests', () => {
  const rootPackage = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  const packageScripts = rootPackage.scripts ?? {}
  const scriptSuite = rootPackage.testSuites?.scripts ?? []

  assert.equal(scriptSuite.includes('tests/scripts/editable-projections-package-gate.test.mjs'), true)
  assert.match(packageScripts.build, /pnpm -r --filter "\.\/packages\/\*" --if-present build/)
  assert.equal(packageScripts.typecheck, 'pnpm -r --if-present typecheck')
  assert.equal(packageScripts['test:packages'], 'pnpm -r --filter "./packages/*" --if-present test')
  assert.match(packageScripts.test, /^pnpm test:packages && /)
  assert.match(packageScripts.test, /pnpm --filter @movscript\/desktop test/)
  assert.match(packageScripts.test, /pnpm --filter @movscript\/admin test/)
})

test('workspace package graph excludes removed local agent runtime packages', () => {
  const workspace = readFileSync(resolve('pnpm-workspace.yaml'), 'utf8')
  const lockfile = readFileSync(resolve('pnpm-lock.yaml'), 'utf8')
  const rootPackage = readFileSync(resolve('package.json'), 'utf8')
  const removedPaths = [
    'apps/agent',
    'apps/frontend/electron/services/agentBrowser',
    'apps/frontend/electron/services/agentRuntime',
    'apps/frontend/electron/services/codexAppServerManager.ts',
    'apps/frontend/electron/services/codexAppServerLaunch.ts',
    'apps/frontend/electron/services/codexBundledPluginBootstrap.ts',
    'apps/frontend/electron/services/codexConfigDistribution.ts',
    'apps/frontend/scripts/dev-agent-workspace.mjs',
    'apps/frontend/scripts/prepare-agent-deploy.mjs',
    'apps/frontend/scripts/verify-codex-app-server.mjs',
    'apps/frontend/src/features/agent/components/AIAgentDebugPage.tsx',
    'apps/frontend/src/features/agent/components/AIWorkspacesPage.tsx',
    'apps/frontend/src/features/agent/components/AgentWorkspaceResultCards.tsx',
    'apps/frontend/src/features/agent/domain/agentActivityFeed.test.ts',
    'apps/frontend/src/features/agent/domain/agentActivityFeed.ts',
    'apps/frontend/src/shared/infrastructure/agent-runtime-transport',
    'apps/frontend/src/shared/infrastructure/codex-app-server',
    'apps/frontend/src/shared/infrastructure/local-agent-client',
    'apps/frontend/src/shared/infrastructure/localAgentClient.ts',
    'apps/frontend/src/shared/infrastructure/runtimeChat.ts',
    'packages/agent-runtime',
    'packages/protocol',
    'packages/event-state',
    'packages/conversation',
    'tests/scripts/agent',
    'tests/scripts/frontend/prepare-agent-deploy.test.mjs',
  ]

  for (const removedPath of removedPaths) {
    assert.equal(existsSync(resolve(removedPath)), false)
    assert.doesNotMatch(workspace, new RegExp(escapeRegExp(removedPath)))
    assert.doesNotMatch(rootPackage, new RegExp(escapeRegExp(removedPath)))
    assert.doesNotMatch(lockfile, new RegExp(escapeRegExp(removedPath)))
  }

  assert.doesNotMatch(lockfile, /@movscript\/(?:agent-runtime|protocol|event-state|conversation)/)
})

test('frontend package graph excludes removed embedded agent runtime and Codex app-server modules', () => {
  const frontendPackage = readFileSync(resolve('apps/frontend/package.json'), 'utf8')
  const frontendTsconfig = readFileSync(resolve('apps/frontend/tsconfig.json'), 'utf8')
  const rootPackage = readFileSync(resolve('package.json'), 'utf8')
  const removedTerms = [
    'agentRuntime',
    'agent-runtime-transport',
    'local-agent-client',
    'localAgentClient',
    'runtimeChat',
    'codex-app-server',
    'codexAppServer',
    'verify-codex-app-server',
    'dev-agent-workspace',
    'prepare-agent-deploy',
  ]

  for (const removedTerm of removedTerms) {
    const pattern = new RegExp(escapeRegExp(removedTerm))
    assert.doesNotMatch(frontendPackage, pattern)
    assert.doesNotMatch(frontendTsconfig, pattern)
    assert.doesNotMatch(rootPackage, pattern)
  }
})

test('frontend typecheck resolves editable projections to source during local development', () => {
  const frontendTsconfig = JSON.parse(readFileSync(resolve('apps/frontend/tsconfig.json'), 'utf8'))
  const paths = frontendTsconfig.compilerOptions?.paths ?? {}
  const libs = frontendTsconfig.compilerOptions?.lib ?? []

  assert.equal(libs.includes('ES2022'), true)
  assert.deepEqual(paths['@movscript/editable-projections'], ['../../packages/editable-projections/src/index.ts'])
  assert.deepEqual(paths['@movscript/editable-projections/node'], ['../../packages/editable-projections/src/node.ts'])
  assert.deepEqual(paths['@movscript/editable-projections/testing'], ['../../packages/editable-projections/src/testing.ts'])
  assert.deepEqual(paths['@movscript/editable-projections/examples/note'], [
    '../../packages/editable-projections/src/examples/note.ts',
  ])
  assert.deepEqual(paths['@movscript/editable-projections/examples/movscript-asset-slot'], [
    '../../packages/editable-projections/src/examples/movscriptAssetSlot.ts',
  ])
  assert.deepEqual(paths['@movscript/editable-projections/examples/movscript-project'], [
    '../../packages/editable-projections/src/examples/movscriptProject.ts',
  ])
  for (const [specifier, targets] of Object.entries(paths)) {
    if (specifier.startsWith('@movscript/editable-projections')) {
      assert.equal(targets.every((target) => target.includes('/src/') && !target.includes('/dist/')), true)
    }
  }
})

test('electron preload and IPC surfaces expose provider-neutral services', () => {
  const electronApiContract = readFileSync(resolve('apps/frontend/src/shared/contracts/electronApi.ts'), 'utf8')
  const preloadApi = readFileSync(resolve('apps/frontend/electron/preload/api.ts'), 'utf8')
  const ipcIndex = readFileSync(resolve('apps/frontend/electron/ipc/index.ts'), 'utf8')
  const surfaceSources = [electronApiContract, preloadApi, ipcIndex].join('\n')

  for (const expectedTerm of [
    'AppServer',
    'ProviderSession',
    'EmbeddedBrowser',
    'PluginCatalogPackStore',
    'MovScriptWorkspace',
  ]) {
    assert.match(surfaceSources, new RegExp(escapeRegExp(expectedTerm)))
  }

  for (const removedTerm of [
    'agentRuntime',
    'AgentRuntime',
    'agentBrowser',
    'AgentBrowser',
    'agentWorkspaceFiles',
    'agentCatalogPackStore',
    'codexAppServer',
    'CodexAppServer',
    'localAgentClient',
    'runtimeTransport',
  ]) {
    assert.doesNotMatch(surfaceSources, new RegExp(escapeRegExp(removedTerm)))
  }
})

test('workspace documentation keeps provider homes separate from business projections', () => {
  const readmeEn = readFileSync(resolve('README.md'), 'utf8')
  const readmeZh = readFileSync(resolve('README.zh-CN.md'), 'utf8')
  const docs = [readmeEn, readmeZh]

  for (const doc of docs) {
    assert.match(doc, /\.movscript\//)
    assert.match(doc, /\.movscript\/providers\/\{profile\}/)
    assert.match(doc, /\.movscript\/\.mova/)
    assert.match(doc, /\.movscript\/\.codex/)
    assert.match(doc, /app-server .*home/)
  }

  assert.match(readmeEn, /\.movscript\/.*control directory/)
  assert.match(readmeZh, /\.movscript\/.*\u63a7\u5236\u76ee\u5f55/)
  assert.match(readmeEn, /Provider homes such as `\.movscript\/\.mova` and `\.movscript\/\.codex` are app-server compatibility homes only/)
  assert.match(readmeEn, /they do not own MovScript business files or workspace-level session indexes/)
  assert.match(readmeZh, /provider home .* app-server .* home/)
  assert.match(readmeZh, /\u4e0d\u62e5\u6709 MovScript \u4e1a\u52a1\u6587\u4ef6/)
  assert.match(readmeZh, /workspace \u5c42\u9762\u7684\u4f1a\u8bdd\u7d22\u5f15/)
})

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
