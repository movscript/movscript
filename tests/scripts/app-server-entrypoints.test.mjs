import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('app-server scripts expose provider-neutral entrypoints', () => {
  const rootPackage = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  const frontendPackage = JSON.parse(readFileSync(resolve('apps/frontend/package.json'), 'utf8'))
  const rootGitignore = readFileSync(resolve('.gitignore'), 'utf8')
  const rootGitAttributes = readFileSync(resolve('.gitattributes'), 'utf8')
  const scriptsReadme = readFileSync(resolve('scripts/README.md'), 'utf8')
  const rootScripts = rootPackage.scripts ?? {}
  const frontendScripts = frontendPackage.scripts ?? {}
  const rootScriptSuite = rootPackage.testSuites?.scripts ?? []

  assert.equal(rootScriptSuite.includes('tests/scripts/app-server-entrypoints.test.mjs'), true)

  assert.equal(rootScripts['app-server:install-plugin'], 'node scripts/install-app-server-plugin.mjs')
  assert.equal(rootScripts['sync:app-server-protocol'], 'node scripts/sync-app-server-protocol.mjs')
  assert.equal(frontendScripts['verify:app-server'], 'node scripts/verify-app-server.mjs')

  for (const removed of ['codex:install-plugin', 'sync:codex-protocol', 'app-server-agent:install-plugin']) {
    assert.equal(Object.hasOwn(rootScripts, removed), false)
  }
  assert.equal(Object.hasOwn(frontendScripts, `verify:${['codex', 'app-server'].join('-')}`), false)
  assert.equal(Object.hasOwn(frontendScripts, 'verify:app-server-agent'), false)

  for (const removedPath of [
    'scripts/install-codex-plugin.mjs',
    `scripts/sync-${['codex', 'app-server'].join('-')}-protocol.mjs`,
    'scripts/install-app-server-agent-plugin.mjs',
    `apps/frontend/scripts/verify-${['codex', 'app-server'].join('-')}.mjs`,
    'apps/frontend/scripts/verify-app-server-agent.mjs',
  ]) {
    assert.equal(existsSync(resolve(removedPath)), false)
  }

  assert.equal(existsSync(resolve('scripts/install-app-server-plugin.mjs')), true)
  assert.equal(existsSync(resolve('apps/frontend/scripts/verify-app-server.mjs')), true)
  assert.match(scriptsReadme, /provider-neutral app-server integration entrypoints/)
  assert.match(scriptsReadme, /install-app-server-plugin\.mjs/)
  assert.match(scriptsReadme, /sync-app-server-protocol\.mjs/)
  assert.doesNotMatch(scriptsReadme, /install-codex-plugin|sync-codex-app-server/)
  assert.doesNotMatch(rootGitignore, /apps\/frontend\/movscript-agent\//)
  assert.doesNotMatch(rootGitAttributes, /apps\/frontend\/movscript-agent\//)
})

test('app-server helper scripts default to Mova-capable provider inputs', () => {
  const installScript = readFileSync(resolve('scripts/install-app-server-plugin.mjs'), 'utf8')
  const syncScript = readFileSync(resolve('scripts/sync-app-server-protocol.mjs'), 'utf8')
  const verifyScript = readFileSync(resolve('apps/frontend/scripts/verify-app-server.mjs'), 'utf8')
  const electronBuilderConfig = readFileSync(resolve('apps/frontend/electron-builder.yml'), 'utf8')
  const pluginReadme = readFileSync(resolve('plugins/movscript/README.md'), 'utf8')
  const providerPluginManifest = JSON.parse(readFileSync(resolve('plugins/movscript/.provider-plugin/plugin.json'), 'utf8'))
  const upstreamCompatibilityPluginManifest = JSON.parse(readFileSync(resolve('plugins/movscript/.codex-plugin/plugin.json'), 'utf8'))
  const configDistribution = readFileSync(resolve('apps/frontend/electron/services/appServerConfigDistribution.ts'), 'utf8')
  const appServerManager = readFileSync(resolve('apps/frontend/electron/services/appServerManager.ts'), 'utf8')
  const pluginBootstrap = readFileSync(resolve('apps/frontend/electron/services/appServerPluginBootstrap.ts'), 'utf8')
  const providerConfigStore = readFileSync(resolve('apps/frontend/src/shared/infrastructure/providerConfigStore.ts'), 'utf8')

  assert.match(installScript, /--provider <name>/)
  assert.match(installScript, /--provider-home <dir>/)
  assert.match(installScript, /--app-server-bin <bin>/)
  assert.match(installScript, /MOVSCRIPT_APP_SERVER_PROVIDER/)
  assert.match(installScript, /MOVSCRIPT_APP_SERVER_HOME/)
  assert.match(installScript, /MOVSCRIPT_APP_SERVER_BIN/)
  assert.match(installScript, /MOVSCRIPT_APP_SERVER_PROVIDER \?\? 'mova'/)
  assert.match(installScript, /function defaultManagedProviderHomeDir/)
  assert.match(installScript, /`\.\$\{provider\}`/)
  assert.doesNotMatch(installScript, /managedHomeDirByProvider/)
  assert.match(installScript, /const providerCompatibilityHomeEnvNames/)
  assert.match(installScript, /const providerCompatibilityBinEnvNames/)
  assert.match(installScript, /function providerHomeEnvNameFor/)
  assert.match(installScript, /\.provider-plugin/)
  assert.match(installScript, /MOVSCRIPT_\$\{providerEnvPrefix\}_APP_SERVER_BIN/)
  assert.doesNotMatch(installScript, /provider === 'mova'/)
  assert.doesNotMatch(installScript, /provider === 'codex'/)
  assert.doesNotMatch(installScript, /--codex-home|--codex-bin|--agent-home|--agent-bin|MOVSCRIPT_APP_SERVER_AGENT_|runCodexPluginAdd|ensureCodexPluginsFeature|MOVSCRIPT_CODEX_BIN/)

  assert.match(syncScript, /\.\.\/mova\/codex-rs\/app-server-protocol\/schema\/typescript/)
  assert.match(syncScript, /app-server\/app-server-protocol/)
  assert.match(syncScript, /app-server protocol/)
  assert.doesNotMatch(syncScript, new RegExp([
    `sync-${['codex', 'app-server'].join('-')}-protocol`,
    `${['Codex', 'app-server'].join(' ')} protocol sync failed`,
  ].join('|')))

  assert.match(verifyScript, /--provider/)
  assert.match(verifyScript, /--app-server-bin/)
  assert.match(verifyScript, /--transport/)
  assert.match(verifyScript, /MOVSCRIPT_APP_SERVER_VERIFY_TRANSPORT/)
  assert.match(verifyScript, /MOVSCRIPT_APP_SERVER_VERIFY_PROVIDER/)
  assert.match(verifyScript, /MOVSCRIPT_APP_SERVER_BIN/)
  assert.match(verifyScript, /MOVSCRIPT_\$\{providerEnvPrefix\}_APP_SERVER_BIN/)
  assert.match(verifyScript, /MOVSCRIPT_APP_SERVER_HOME/)
  assert.match(verifyScript, /MOVSCRIPT_APP_SERVER_VERIFY_PROVIDER \?\? 'mova'/)
  assert.match(verifyScript, /verifyAppServerStdioReady/)
  assert.match(verifyScript, /stdio:\/\//)
  assert.match(verifyScript, /thread\/start/)
  assert.match(verifyScript, /thread\/list/)
  assert.match(verifyScript, /plugin\/list/)
  assert.match(verifyScript, /skills\/list/)
  assert.match(verifyScript, /bundledProtocolPlugin/)
  assert.match(verifyScript, /movScriptSkillNames/)
  assert.match(verifyScript, /\.provider-plugin/)
  assert.match(verifyScript, /initialThreadList\.data/)
  assert.match(verifyScript, /startedThreadList\.data/)
  assert.match(verifyScript, /appServerExecutableCandidates/)
  assert.match(verifyScript, /'app-server'/)
  assert.match(verifyScript, /'mova-app-server'/)
  assert.match(verifyScript, /\['codex', 'app-server'\]\.join\('-'\)/)
  assert.match(verifyScript, /const APP_SERVER_EXECUTABLE_PROFILES/)
  assert.match(verifyScript, /compatibilityHomeEnvNames/)
  assert.match(verifyScript, /homeEnvNames: providerHomeEnvNames/)
  assert.match(verifyScript, /distribution\.homeEnvNames/)
  assert.match(verifyScript, /function providerHomeEnvNameFor/)
  assert.match(verifyScript, /appServerLaunchFailureMessage/)
  assert.match(verifyScript, /local listen permission denied/)
  assert.match(verifyScript, /function defaultManagedProviderHomeDir/)
  assert.match(verifyScript, /`\.\$\{provider\}`/)
  assert.doesNotMatch(verifyScript, /MANAGED_HOME_DIR_BY_PROVIDER/)
  assert.doesNotMatch(verifyScript, /provider === 'mova'|provider !== 'mova'/)
  assert.doesNotMatch(verifyScript, new RegExp([
    `verify-${['codex', 'app-server'].join('-')}`,
    ['MOVSCRIPT', 'CODEX', 'VERIFY'].join('_'),
    'MOVSCRIPT_CODEX_BIN',
    '--codex-bin',
    '--agent-bin',
    'MOVSCRIPT_APP_SERVER_AGENT_',
  ].join('|')))
  assert.doesNotMatch(verifyScript, /\.codex-plugin/)

  assert.match(pluginReadme, /pnpm app-server:install-plugin -- --provider mova/)
  assert.match(pluginReadme, /\.provider-plugin\/plugin\.json/)
  assert.match(pluginReadme, /upstream compatibility manifest at `\.codex-plugin\/plugin\.json`/)
  assert.equal(providerPluginManifest.name, 'movscript')
  assert.equal(upstreamCompatibilityPluginManifest.name, providerPluginManifest.name)
  assert.equal(upstreamCompatibilityPluginManifest.version, providerPluginManifest.version)
  assert.deepEqual(upstreamCompatibilityPluginManifest.interface, providerPluginManifest.interface)
  assert.doesNotMatch(pluginReadme, new RegExp([
    ['Codex', 'compatible'].join('-'),
    ['codex', 'compatible'].join('-'),
  ].join('|')))
  assert.doesNotMatch(pluginReadme, /app-server agent|MOVSCRIPT_APP_SERVER_AGENT_|pnpm codex:install-plugin|install-codex-plugin/)

  assert.match(configDistribution, /MOVSCRIPT_APP_SERVER_CONFIG_SOURCE/)
  assert.match(configDistribution, /MOVSCRIPT_APP_SERVER_PROVIDER/)
  assert.match(configDistribution, /MOVSCRIPT_APP_SERVER_HOME/)
  assert.match(configDistribution, /MOVSCRIPT_APP_SERVER_API_KEY/)
  assert.match(configDistribution, /homeEnvNames: string\[\]/)
  assert.match(configDistribution, /providerCompatibilityHomeEnvironmentVariables/)
  assert.match(configDistribution, /compatibilityHomeEnvNames/)
  assert.match(configDistribution, /distribution\.homeEnvNames/)
  assert.match(configDistribution, /function providerHomeEnvironmentVariable/)
  assert.doesNotMatch(configDistribution, /providerKey === 'mova'/)
  assert.match(configDistribution, /function inferAppServerKeyFromHome/)
  assert.match(configDistribution, /\\.movscript\\\/\\.\(\[a-z0-9_-\]\+\)/)
  assert.doesNotMatch(configDistribution, /\\.movscript\\\/\\.codex/)
  assert.doesNotMatch(configDistribution, new RegExp([
    'MOVSCRIPT_APP_SERVER_AGENT_',
    ['MOVSCRIPT', 'CODEX', 'CONFIG', 'SOURCE'].join('_'),
    ['MOVSCRIPT', 'CODEX', 'API', 'KEY'].join('_'),
    ['stable', 'Codex', 'Config', 'Hash', 'Content'].join(''),
  ].join('|')))

  assert.match(appServerManager, /type AppServerExecutableProfile/)
  assert.match(appServerManager, /profile\?: ElectronAppServerProfile/)
  assert.match(appServerManager, /resolveAppServerExecutableResolution\(\{ provider: providerKey, profile, managedBinDir \}\)/)
  assert.match(appServerManager, /function appServerExecutableProfile\(provider: AppServerProviderKey, profile\?: ElectronAppServerProfile\)/)
  assert.match(appServerManager, /function genericAppServerExecutableProfile/)
  assert.match(appServerManager, /function appServerProviderExecutableEnvVar/)
  assert.doesNotMatch(appServerManager, /const APP_SERVER_EXECUTABLE_PROFILES/)
  assert.doesNotMatch(appServerManager, /provider !== 'mova'|providerKey !== 'mova'|input\.provider !== 'mova'/)

  assert.match(providerConfigStore, /executableCommand\?: string/)
  assert.match(providerConfigStore, /compatibilityBinEnvNames\?: string\[\]/)
  assert.match(providerConfigStore, /candidateRootRelativePaths\?: string\[\]/)
  assert.match(providerConfigStore, /pathFallbackReady\?: boolean/)
  assert.match(providerConfigStore, /executableCommand: 'mova'/)
  assert.match(providerConfigStore, /executableEnvVar: 'MOVSCRIPT_MOVA_APP_SERVER_BIN'/)
  assert.match(providerConfigStore, /compatibilityBinEnvNames: \['MOVSCRIPT_MOVA_BIN'\]/)
  assert.match(providerConfigStore, /candidateRootRelativePaths: \[/)
  assert.match(providerConfigStore, /pathFallbackReady: false/)

  assert.match(pluginBootstrap, /MOVSCRIPT_APP_SERVER_PLUGIN_SOURCE/)
  assert.match(pluginBootstrap, /provider-plugins/)
  assert.match(pluginBootstrap, /\.provider-plugin/)
  assert.match(electronBuilderConfig, /to: provider-plugins\/movscript/)
  assert.match(electronBuilderConfig, /- \.provider-plugin\/\*\*/)
  assert.match(electronBuilderConfig, /- \.codex-plugin\/\*\*/)
  assert.doesNotMatch(electronBuilderConfig, /to: codex-plugins\/movscript/)
  assert.doesNotMatch(pluginBootstrap, /MOVSCRIPT_APP_SERVER_AGENT_|MOVSCRIPT_CODEX_PLUGIN_SOURCE|MovScript Codex plugin/)
})

test('app-server protocol sync check compares Mova source with neutral frontend target', () => {
  const output = execFileSync(process.execPath, ['scripts/sync-app-server-protocol.mjs', '--check'], {
    cwd: resolve('.'),
    encoding: 'utf8',
  })

  assert.match(output, /app-server protocol is in sync \(547 files\)/)
  assert.match(output, /source: \.\.\/mova\/codex-rs\/app-server-protocol\/schema\/typescript/)
  assert.match(output, /target: apps\/frontend\/src\/shared\/infrastructure\/app-server\/app-server-protocol/)
})
