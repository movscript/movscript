import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const applicationDir = new URL('./', import.meta.url)
const files = readdirSync(applicationDir)

function listRuntimeBridgeModuleNames(): string[] {
  return files
    .filter((file) => /^runtime.+Bridge\.ts$/.test(file))
    .map((file) => file.replace(/\.ts$/, ''))
    .sort()
}

function listRuntimeModuleNames(): string[] {
  return files
    .filter((file) => /^runtime.+\.ts$/.test(file) && !file.endsWith('.test.ts'))
    .map((file) => file.replace(/\.ts$/, ''))
    .sort()
}

test('every runtime bridge module has a focused bridge test', () => {
  const bridgeModules = listRuntimeBridgeModuleNames()
  const testModules = new Set(files.filter((file) => /^runtime.+Bridge\.test\.ts$/.test(file)))

  assert.notEqual(bridgeModules.length, 0)
  assert.deepEqual(
    bridgeModules.filter((moduleName) => !testModules.has(`${moduleName}.test.ts`)),
    [],
  )
})

test('every runtime application module has a focused same-name test', () => {
  const testModules = new Set(files.filter((file) => /^runtime.+\.test\.ts$/.test(file)))
  const missingFocusedTestModules = listRuntimeModuleNames()
    .filter((moduleName) => !testModules.has(`${moduleName}.test.ts`))

  assert.deepEqual(
    missingFocusedTestModules,
    [],
    'runtime modules without same-name tests are not allowed',
  )
})

test('runtime bridge modules do not depend back on AgentRuntimeRouter', () => {
  const bridgeModules = listRuntimeBridgeModuleNames()

  for (const moduleName of bridgeModules) {
    const source = readFileSync(new URL(`${moduleName}.ts`, applicationDir), 'utf8')

    assert.equal(
      /from ['"][^'"]*runtimeRouter\.js['"]/.test(source),
      false,
      `${moduleName} should stay below AgentRuntimeRouter and must not import it`,
    )
  }
})

test('runtime bridge modules expose a standard interface and factory', () => {
  const bridgeModules = listRuntimeBridgeModuleNames()

  for (const moduleName of bridgeModules) {
    const source = readFileSync(new URL(`${moduleName}.ts`, applicationDir), 'utf8')
    const bridgeName = moduleName.replace(/^runtime/, 'Runtime')
    const factoryName = `create${bridgeName}`

    assert.equal(
      source.includes(`export interface ${bridgeName}`),
      true,
      `${moduleName} should export interface ${bridgeName}`,
    )
    assert.equal(
      source.includes(`export function ${factoryName}`),
      true,
      `${moduleName} should export factory ${factoryName}`,
    )
  }
})
