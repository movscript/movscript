import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  extractProviderPluginCatalogFiles,
  normalizeProviderPluginMarketplace,
  normalizeAgentProviderTargets,
  providerPluginArchiveContributions,
  providerPluginInstallInput,
  providerPluginMarketplaceKey,
  readAgentPackageManifestFromArchive,
  readProviderPluginManifestFromArchive,
} from '../dist/index.js'
import {
  installMovScriptHomePluginBundle,
  readMovScriptHomePluginBundleIdentity,
  registerMovScriptAgentProviderTargets,
  resolveMovScriptHomeCurrentPluginRoot,
  resolveMovScriptHomePreviousPluginRoot,
  rollbackMovScriptHomePluginBundle,
} from '../dist/node/index.js'

test('plugins package reads provider plugin archive manifests and catalog files', async () => {
  const archive = fakeArchive({
    '.provider-plugin/plugin.json': JSON.stringify({
      name: 'story-pack',
      version: '1.0.0',
      skills: './skills',
      mcpServers: './mcp.json',
    }),
    'mcp.json': JSON.stringify({
      mcpServers: {
        story: {
          command: 'story-mcp',
          label: 'Story MCP',
          tools: [{ name: 'story_outline', description: 'Outline story.' }],
        },
      },
    }),
    'skills/story/SKILL.md': 'Use story.',
  })

  const manifest = await readProviderPluginManifestFromArchive(archive)
  assert.equal(manifest?.name, 'story-pack')
  assert.deepEqual(await providerPluginArchiveContributions(archive, manifest), {
    skills: [{ path: './skills' }],
    mcpServers: [{
      id: 'story',
      label: 'Story MCP',
      tools: [{ name: 'story_outline', description: 'Outline story.' }],
    }],
  })
  assert.deepEqual(await extractProviderPluginCatalogFiles(archive, manifest), [
    { path: 'plugin-skills/story/SKILL.md', content: 'Use story.' },
  ])
})

test('plugins package reads neutral agent package manifests and target aliases', async () => {
  const archive = fakeArchive({
    '.agent-package/package.json': JSON.stringify({
      schema: 'movscript.agent-package.v1',
      id: 'movscript',
      name: 'MovScript',
      version: '1.2.3',
      kind: 'runtime-agent',
      contributes: {
        skills: './skills',
        mcpServers: './.mcp.json',
        runtimeBundle: './manifest.runtime.json',
      },
      targets: {
        codex: {
          manifest: './.codex-plugin/plugin.json',
          registration: 'marketplace',
        },
        claude: {
          registration: 'mcp-json',
        },
        'open-claw': {
          registration: 'mcp-registry',
        },
        'harness-agent': {
          registration: 'worker-agent',
        },
        'work-buddy': {
          registration: 'mcp-json',
        },
        trea: {
          registration: 'mcp-json',
        },
      },
    }),
  })

  const manifest = await readAgentPackageManifestFromArchive(archive)

  assert.equal(manifest?.schema, 'movscript.agent-package.v1')
  assert.equal(manifest?.id, 'movscript')
  assert.deepEqual(manifest?.targets.map((target) => target.id).sort(), ['claude-code', 'codex', 'harness', 'openclaw', 'trae', 'workbuddy'])
  assert.deepEqual(normalizeAgentProviderTargets('codex,claude,xiaolongxia,harness-agent,work-buddy,trea'), [
    'codex',
    'claude-code',
    'openclaw',
    'harness',
    'workbuddy',
    'trae',
  ])
})

test('plugins package synthesizes an agent package from provider plugin archives', async () => {
  const archive = fakeArchive({
    '.provider-plugin/plugin.json': JSON.stringify({
      name: 'story-pack',
      version: '1.0.0',
      skills: './skills',
      mcpServers: './mcp.json',
    }),
  })

  const manifest = await readAgentPackageManifestFromArchive(archive)

  assert.equal(manifest?.id, 'story-pack')
  assert.equal(manifest?.kind, 'runtime-agent')
  assert.deepEqual(manifest?.targets.map((target) => target.id).sort(), ['claude-code', 'codex', 'harness', 'openclaw', 'trae', 'workbuddy'])
  assert.equal(manifest?.providerPlugin?.name, 'story-pack')
})

test('plugins package normalizes provider marketplace inventories', () => {
  const provider = { id: 'mova-a', kind: 'mova', label: 'Mova A' }
  const listed = {
    marketplaces: [{
      name: 'personal',
      path: '/home/user/.agents/plugins/marketplace.json',
      interface: { displayName: 'Personal' },
      plugins: [{
        id: 'plugin_movscript',
        name: 'movscript',
        localVersion: '0.1.2',
        source: { type: 'local', path: './plugins/movscript' },
        installed: false,
        enabled: true,
        installPolicy: 'AVAILABLE',
        authPolicy: 'ON_INSTALL',
        availability: 'AVAILABLE',
        interface: {
          displayName: 'MovScript',
          shortDescription: 'Workspace tools.',
          developerName: 'MovScript',
          category: 'Productivity',
          capabilities: ['mcp', 'skills'],
        },
        keywords: ['workspace'],
      }],
    }],
  }
  const installed = {
    marketplaces: [{
      name: 'personal',
      path: '/home/user/.agents/plugins/marketplace.json',
      plugins: [{
        id: 'plugin_movscript',
        name: 'movscript',
        installed: true,
      }],
    }],
  }

  const items = normalizeProviderPluginMarketplace(provider, listed, installed)

  assert.equal(items.length, 1)
  assert.equal(items[0]?.key, 'mova-a:/home/user/.agents/plugins/marketplace.json:movscript')
  assert.equal(items[0]?.providerKind, 'mova')
  assert.equal(items[0]?.installed, true)
  assert.equal(items[0]?.sourceType, 'local')
  assert.equal(items[0]?.sourcePath, './plugins/movscript')
  assert.equal(items[0]?.sourceLabel, 'Local · ./plugins/movscript')
  assert.equal(items[0]?.marketplaceDisplayName, 'Personal')
  assert.deepEqual(items[0]?.capabilities, ['mcp', 'skills'])
  assert.deepEqual(providerPluginInstallInput(items[0]), {
    pluginName: 'movscript',
    marketplacePath: '/home/user/.agents/plugins/marketplace.json',
  })
})

test('plugins package normalizes local plugin lists as installed provider plugins', () => {
  const items = normalizeProviderPluginMarketplace({ id: 'mova', kind: 'mova', label: 'Mova' }, {
    plugins: [{
      id: 'story-pack',
      name: 'Story Pack',
      version: '1.0.0',
      author: 'Local Team',
      description: 'Local pack.',
    }],
  })

  assert.equal(items.length, 1)
  assert.equal(items[0]?.installed, true)
  assert.equal(items[0]?.sourceType, 'local')
  assert.equal(items[0]?.marketplaceName, 'provider-local')
  assert.equal(items[0]?.developerName, 'Local Team')
  assert.equal(providerPluginMarketplaceKey('mova', undefined, 'provider-local', 'story-pack'), 'mova:provider-local:story-pack')
})

test('agent provider registration writes codex, Claude Code, OpenClaw, Harness, WorkBuddy, and Trae adapters', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-provider-registration-'))
  const source = fakeMovScriptPluginBundle('0.1.40', 'hash-provider')
  try {
    const installed = installMovScriptHomePluginBundle({
      homeDir,
      sourcePluginRoot: source,
      reason: 'agent-package-test',
      provider: 'all',
      now: new Date('2026-07-04T00:00:00.000Z'),
    })
    const registrations = registerMovScriptAgentProviderTargets({
      homeDir,
      targets: 'codex,claude-code,openclaw,harness,workbuddy,trea',
      currentLink: installed.paths.currentLink,
      packageManifest: {
        schema: 'movscript.agent-package.v1',
        id: 'movscript',
        name: 'MovScript',
        version: installed.version,
        kind: 'runtime-agent',
        targets: [],
      },
      now: new Date('2026-07-04T00:01:00.000Z'),
    })

    assert.deepEqual(registrations.map((registration) => registration.target), ['codex', 'claude-code', 'openclaw', 'harness', 'workbuddy', 'trae'])
    for (const target of ['codex', 'claude-code', 'openclaw', 'harness', 'workbuddy', 'trae']) {
      assert.equal(realpathSync(join(homeDir, 'provider', target, 'plugins', 'movscript')), realpathSync(installed.paths.currentLink))
      const registration = JSON.parse(readFileSync(join(homeDir, 'provider', target, 'registration.json'), 'utf8'))
      assert.equal(registration.schema, 'movscript.agent-provider-registration.v1')
      assert.equal(registration.target, target)
      assert.equal(registration.plugin.id, 'movscript')
      assert.equal(registration.mcpServers.movscript.transport, 'stdio')
    }

    const codexMarketplace = JSON.parse(readFileSync(join(homeDir, 'provider', 'codex', 'marketplace.json'), 'utf8'))
    assert.equal(codexMarketplace.plugins[0].source.path, './plugins/movscript')
    const codexNativeMarketplace = JSON.parse(readFileSync(join(homeDir, 'provider', 'codex', '.agents', 'plugins', 'marketplace.json'), 'utf8'))
    assert.equal(codexNativeMarketplace.plugins[0].source.path, './plugins/movscript')
    const claudeMcp = JSON.parse(readFileSync(join(homeDir, 'provider', 'claude-code', '.mcp.json'), 'utf8'))
    assert.deepEqual(claudeMcp.mcpServers.movscript.args, ['mcp', 'stdio'])
    const openclawMcp = JSON.parse(readFileSync(join(homeDir, 'provider', 'openclaw', 'mcp.json'), 'utf8'))
    assert.equal(openclawMcp.mcpServers.movscript.transport, 'stdio')
    assert.equal(existsSync(join(homeDir, 'provider', 'openclaw', 'plugin', 'package.json')), true)
    assert.equal(existsSync(join(homeDir, 'provider', 'openclaw', 'plugin', 'openclaw.plugin.json')), true)
    assert.equal(existsSync(join(homeDir, 'provider', 'openclaw', 'plugin', 'index.ts')), true)
    const openclawPackage = JSON.parse(readFileSync(join(homeDir, 'provider', 'openclaw', 'plugin', 'package.json'), 'utf8'))
    assert.deepEqual(openclawPackage.openclaw.extensions, ['./index.ts'])
    const openclawPluginManifest = JSON.parse(readFileSync(join(homeDir, 'provider', 'openclaw', 'plugin', 'openclaw.plugin.json'), 'utf8'))
    assert.equal(openclawPluginManifest.id, 'movscript')
    const openclawEntrypoint = readFileSync(join(homeDir, 'provider', 'openclaw', 'plugin', 'index.ts'), 'utf8')
    assert.match(openclawEntrypoint, /api\.registerTool/)
    assert.match(openclawEntrypoint, /spawn\(MOVSCRIPT_COMMAND, args/)
    const harnessWorker = JSON.parse(readFileSync(join(homeDir, 'provider', 'harness', 'worker-agent.json'), 'utf8'))
    assert.equal(harnessWorker.schema, 'movscript.harness-worker-agent-export.v1')
    assert.equal(harnessWorker.mcpServers[0].name, 'movscript')
    const workbuddyMcp = JSON.parse(readFileSync(join(homeDir, 'provider', 'workbuddy', 'mcp.json'), 'utf8'))
    assert.deepEqual(workbuddyMcp.mcpServers.movscript.args, ['mcp', 'stdio'])
    assert.equal(workbuddyMcp.mcpServers.movscript.transport, undefined)
    const traeMcp = JSON.parse(readFileSync(join(homeDir, 'provider', 'trae', 'mcp.json'), 'utf8'))
    assert.deepEqual(traeMcp.mcpServers.movscript.args, ['mcp', 'stdio'])
    const traeProjectMcp = JSON.parse(readFileSync(join(homeDir, 'provider', 'trae', 'project', '.trae', 'mcp.json'), 'utf8'))
    assert.deepEqual(traeProjectMcp.mcpServers.movscript.args, ['mcp', 'stdio'])
  } finally {
    rmSync(homeDir, { recursive: true, force: true })
    rmSync(source, { recursive: true, force: true })
  }
})

test('plugin marketplace rules stay independent from frontend runtime', () => {
  const source = readFileSync(new URL('../src/providerPluginMarketplace.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from ['"]@\/|from ['"]react['"]|useProviderConfigStore|createAgentChatDataSource|window\.|document\.|localStorage|sessionStorage/)
})

test('home plugin store installs current bundle, preserves previous, and writes CLI shim', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-home-plugin-store-'))
  const sourceA = fakeMovScriptPluginBundle('0.1.30', 'hash-a')
  const sourceB = fakeMovScriptPluginBundle('0.1.31', 'hash-b')
  try {
    const first = installMovScriptHomePluginBundle({
      homeDir,
      sourcePluginRoot: sourceA,
      reason: 'desktop-seed',
      provider: 'codex',
      now: new Date('2026-07-02T00:00:00.000Z'),
    })

    assert.equal(first.version, '0.1.30')
    assert.equal(realpathSync(resolveMovScriptHomeCurrentPluginRoot(homeDir)), realpathSync(first.targetPluginRoot))
    assert.equal(existsSync(join(homeDir, 'bin', 'movscript')), true)
    assert.equal(existsSync(join(homeDir, 'bin', 'movscript.mjs')), true)
    let identity = readMovScriptHomePluginBundleIdentity(homeDir)
    assert.equal(identity.version, '0.1.30')
    assert.equal(identity.reason, 'desktop-seed')
    assert.equal(identity.provider, 'codex')
    assert.equal(identity.bundleHash, 'hash-a')
    assert.equal(identity.apiVersion, '1.0')

    const second = installMovScriptHomePluginBundle({
      homeDir,
      sourcePluginRoot: sourceB,
      reason: 'desktop-upgrade',
      retain: 2,
      now: new Date('2026-07-02T00:01:00.000Z'),
    })

    assert.equal(second.version, '0.1.31')
    assert.equal(realpathSync(resolveMovScriptHomeCurrentPluginRoot(homeDir)), realpathSync(second.targetPluginRoot))
    identity = readMovScriptHomePluginBundleIdentity(homeDir)
    assert.equal(identity.version, '0.1.31')
    assert.equal(realpathSync(identity.previousRoot), realpathSync(first.targetPluginRoot))
    assert.equal(realpathSync(join(homeDir, 'plugins', 'movscript', 'previous')), realpathSync(first.targetPluginRoot))

    const reused = installMovScriptHomePluginBundle({
      homeDir,
      sourcePluginRoot: sourceA,
      mode: 'seed-or-upgrade',
      reason: 'desktop-codex-install',
      retain: 2,
      now: new Date('2026-07-02T00:02:00.000Z'),
    })
    assert.equal(reused.installed, false)
    assert.equal(reused.version, '0.1.31')
    assert.equal(realpathSync(resolveMovScriptHomeCurrentPluginRoot(homeDir)), realpathSync(second.targetPluginRoot))
  } finally {
    rmSync(homeDir, { recursive: true, force: true })
    rmSync(sourceA, { recursive: true, force: true })
    rmSync(sourceB, { recursive: true, force: true })
  }
})

test('home plugin store upgrades same-version rebuilds when bundle hash changes', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-home-plugin-store-rebuild-'))
  const sourceA = fakeMovScriptPluginBundle('0.1.30', 'aaaaaaaaaaaa1111')
  const sourceRebuild = fakeMovScriptPluginBundle('0.1.30', 'bbbbbbbbbbbb2222')
  try {
    const first = installMovScriptHomePluginBundle({
      homeDir,
      sourcePluginRoot: sourceA,
      mode: 'seed-or-upgrade',
      reason: 'desktop-seed',
      now: new Date('2026-07-02T00:00:00.000Z'),
    })
    const rebuilt = installMovScriptHomePluginBundle({
      homeDir,
      sourcePluginRoot: sourceRebuild,
      mode: 'seed-or-upgrade',
      reason: 'desktop-same-version-rebuild',
      retain: 2,
      now: new Date('2026-07-02T00:01:00.000Z'),
    })

    assert.equal(first.installed, true)
    assert.equal(first.version, '0.1.30')
    assert.equal(first.bundleHash, 'aaaaaaaaaaaa1111')
    assert.match(first.targetPluginRoot, /0\.1\.30\+aaaaaaaaaaaa$/)
    assert.equal(rebuilt.installed, true)
    assert.equal(rebuilt.version, '0.1.30')
    assert.equal(rebuilt.bundleHash, 'bbbbbbbbbbbb2222')
    assert.match(rebuilt.targetPluginRoot, /0\.1\.30\+bbbbbbbbbbbb$/)
    assert.equal(realpathSync(resolveMovScriptHomeCurrentPluginRoot(homeDir)), realpathSync(rebuilt.targetPluginRoot))
    assert.equal(realpathSync(join(homeDir, 'plugins', 'movscript', 'previous')), realpathSync(first.targetPluginRoot))
    const identity = readMovScriptHomePluginBundleIdentity(homeDir)
    assert.equal(identity.version, '0.1.30')
    assert.equal(identity.bundleHash, 'bbbbbbbbbbbb2222')
    assert.equal(realpathSync(identity.previousRoot), realpathSync(first.targetPluginRoot))

    const reused = installMovScriptHomePluginBundle({
      homeDir,
      sourcePluginRoot: sourceRebuild,
      mode: 'seed-or-upgrade',
      reason: 'desktop-same-version-rebuild-repeat',
      retain: 2,
      now: new Date('2026-07-02T00:02:00.000Z'),
    })
    assert.equal(reused.installed, false)
    assert.equal(reused.bundleHash, 'bbbbbbbbbbbb2222')
  } finally {
    rmSync(homeDir, { recursive: true, force: true })
    rmSync(sourceA, { recursive: true, force: true })
    rmSync(sourceRebuild, { recursive: true, force: true })
  }
})

test('home plugin store rolls current back to previous bundle and preserves identity', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-home-plugin-store-rollback-'))
  const sourceA = fakeMovScriptPluginBundle('0.1.30', 'hash-a')
  const sourceB = fakeMovScriptPluginBundle('0.1.31', 'hash-b')
  try {
    const first = installMovScriptHomePluginBundle({
      homeDir,
      sourcePluginRoot: sourceA,
      reason: 'desktop-seed',
      now: new Date('2026-07-02T00:00:00.000Z'),
    })
    const second = installMovScriptHomePluginBundle({
      homeDir,
      sourcePluginRoot: sourceB,
      reason: 'desktop-upgrade',
      now: new Date('2026-07-02T00:01:00.000Z'),
    })

    const rollback = rollbackMovScriptHomePluginBundle({
      homeDir,
      reason: 'desktop-rollback',
      provider: 'desktop',
      now: new Date('2026-07-02T00:02:00.000Z'),
    })

    assert.equal(rollback.version, '0.1.30')
    assert.equal(realpathSync(rollback.targetPluginRoot), realpathSync(first.targetPluginRoot))
    assert.equal(realpathSync(resolveMovScriptHomeCurrentPluginRoot(homeDir)), realpathSync(first.targetPluginRoot))
    assert.equal(realpathSync(resolveMovScriptHomePreviousPluginRoot(homeDir)), realpathSync(second.targetPluginRoot))
    assert.equal(realpathSync(join(homeDir, 'plugins', 'movscript', 'previous')), realpathSync(second.targetPluginRoot))
    const identity = readMovScriptHomePluginBundleIdentity(homeDir)
    assert.equal(identity.version, '0.1.30')
    assert.equal(identity.reason, 'desktop-rollback')
    assert.equal(identity.provider, 'desktop')
    assert.equal(realpathSync(identity.previousRoot), realpathSync(second.targetPluginRoot))
  } finally {
    rmSync(homeDir, { recursive: true, force: true })
    rmSync(sourceA, { recursive: true, force: true })
    rmSync(sourceB, { recursive: true, force: true })
  }
})

function fakeArchive(files) {
  return {
    file(path) {
      if (!(path in files)) return null
      return fakeEntry(files[path] ?? '')
    },
    forEach(callback) {
      for (const [path, content] of Object.entries(files)) callback(path, fakeEntry(content))
    },
  }
}

function fakeMovScriptPluginBundle(version, bundleHash) {
  const root = mkdtempSync(join(tmpdir(), `movscript-plugin-${version}-`))
  mkdirSync(join(root, '.codex-plugin'), { recursive: true })
  mkdirSync(join(root, '.provider-plugin'), { recursive: true })
  mkdirSync(join(root, 'bin'), { recursive: true })
  mkdirSync(join(root, 'skills', 'runtime'), { recursive: true })
  writeFileSync(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { movscript: { command: 'bin/movscript' } } }), 'utf8')
  writeFileSync(join(root, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'movscript', version }), 'utf8')
  writeFileSync(join(root, '.provider-plugin', 'plugin.json'), JSON.stringify({ name: 'movscript', version }), 'utf8')
  writeFileSync(join(root, 'bin', 'movscript'), '#!/bin/sh\n', 'utf8')
  writeFileSync(join(root, 'bin', 'movscript.mjs'), 'export {}\n', 'utf8')
  writeFileSync(join(root, 'bin', 'movscript-agent-mcp'), '#!/bin/sh\n', 'utf8')
  writeFileSync(join(root, 'README.md'), 'MovScript plugin\n', 'utf8')
  writeFileSync(join(root, 'skills', 'runtime', 'SKILL.md'), 'Use runtime.\n', 'utf8')
  writeFileSync(join(root, 'manifest.runtime.json'), JSON.stringify({
    schema: 'movscript.runtime-bundle.v1',
    appId: 'plugin',
    applicationId: 'movscript.agent-plugin',
    artifact: 'movscript-agent-plugin',
    version,
    packageName: '@movscript/plugin-movscript',
    generatedAt: '2026-07-02T00:00:00.000Z',
    apiVersion: '1.0',
    minDaemonApiVersion: '1.0',
    bundleHash,
    bundleHashAlgorithm: 'sha256',
    capabilities: {
      cli: true,
      mcp: true,
      daemon: true,
      project: true,
      timeline: true,
      canvas: true,
      resources: true,
      editing: true,
      media: true,
    },
    mcpServer: 'movscript',
    entrypoint: './bin/movscript',
    mcpArgs: ['mcp', 'stdio'],
    daemonArgs: ['daemon', 'run'],
    cliEntrypoint: './bin/movscript',
    legacyMcpEntrypoint: './bin/movscript-agent-mcp',
  }, null, 2), 'utf8')
  return root
}

function fakeEntry(content) {
  return {
    dir: false,
    async: async (type) => type === 'base64' ? Buffer.from(content).toString('base64') : content,
  }
}
