import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import {
  buildAppServerDeps,
  rustTargetTriple,
} from '../../../scripts/release/build-app-server-deps.mjs'
import {
  providerEnvName,
  readBinaryDepsManifest,
} from '../../../scripts/release/binary-deps-common.mjs'
import {
  resolveBinaryDeps,
} from '../../../scripts/release/resolve-binary-deps.mjs'
import {
  updateBinaryDepsManifests,
} from '../../../scripts/release/update-binary-deps.mjs'

test('binary dependency manifest resolves pinned repository refs', () => {
  const manifest = readBinaryDepsManifest(process.cwd(), 'binary-deps.manifest.json')
  const providers = manifest.dependencies.map((dependency) => dependency.provider).sort()
  assert.deepEqual(providers, ['codex', 'mova'])
  for (const dependency of manifest.dependencies) {
    assert.match(dependency.ref, /^[a-f0-9]{40}$/)
  }

  const result = resolveBinaryDeps(process.cwd(), 'binary-deps.manifest.json')
  assert.equal(result.outputs.codex_repository, 'movscript/codex')
  assert.match(result.outputs.codex_ref, /^[a-f0-9]{40}$/)
  assert.equal(result.outputs.mova_repository, 'movscript/mova')
  assert.match(result.outputs.mova_ref, /^[a-f0-9]{40}$/)
})

test('buildAppServerDeps verifies checkout refs and exposes provider env paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-binary-deps-'))
  try {
    const codexRef = initFakeDependency(root, 'codex')
    const movaRef = initFakeDependency(root, 'mova')
    writeFileSync(join(root, 'binary-deps.manifest.json'), JSON.stringify({
      schema: 'movscript.binary-deps.v1',
      dependencies: [
        dependency('codex', codexRef),
        dependency('mova', movaRef),
      ],
    }, null, 2) + '\n')

    const target = rustTargetTriple('darwin', 'arm64')
    const result = buildAppServerDeps(root, {
      arch: 'arm64',
      depsDir: 'deps',
      manifest: 'binary-deps.manifest.json',
      platform: 'darwin',
      profile: 'release',
      spawn: (command, args, options) => {
        if (command === 'cargo') {
          const binary = join(options.cwd, 'target', target, 'release', 'codex-app-server')
          mkdirSync(join(options.cwd, 'target', target, 'release'), { recursive: true })
          writeFileSync(binary, 'app-server\n')
          chmodSync(binary, 0o755)
        }
        return { status: 0 }
      },
    }, {})

    assert.equal(result.dependencies.length, 2)
    assert.match(result.env[providerEnvName('codex')], /release-binary-deps\/darwin-arm64\/codex\/app-server$/)
    assert.match(result.env[providerEnvName('mova')], /release-binary-deps\/darwin-arm64\/mova\/app-server$/)
    const buildManifest = JSON.parse(readFileSync(join(root, 'release-binary-deps/darwin-arm64/APP_SERVER_DEPS.json'), 'utf8'))
    assert.equal(buildManifest.schema, 'movscript.app-server-deps-build.v1')
    assert.deepEqual(buildManifest.dependencies.map((item) => item.provider).sort(), ['codex', 'mova'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('buildAppServerDeps configures pkg-config for Linux ARM64 OpenSSL cross builds', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-binary-deps-linux-arm64-'))
  try {
    const codexRef = initFakeDependency(root, 'codex')
    writeFileSync(join(root, 'binary-deps.manifest.json'), JSON.stringify({
      schema: 'movscript.binary-deps.v1',
      dependencies: [
        dependency('codex', codexRef),
      ],
    }, null, 2) + '\n')

    const target = rustTargetTriple('linux', 'arm64')
    const cargoEnvs = []
    buildAppServerDeps(root, {
      arch: 'arm64',
      depsDir: 'deps',
      manifest: 'binary-deps.manifest.json',
      platform: 'linux',
      profile: 'release',
      spawn: (command, args, options) => {
        if (command === 'cargo') {
          cargoEnvs.push(options.env)
          const binary = join(options.cwd, 'target', target, 'release', 'codex-app-server')
          mkdirSync(join(options.cwd, 'target', target, 'release'), { recursive: true })
          writeFileSync(binary, 'app-server\n')
          chmodSync(binary, 0o755)
        }
        return { status: 0 }
      },
    }, {})

    assert.equal(cargoEnvs[0].CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER, 'aarch64-linux-gnu-gcc')
    assert.equal(cargoEnvs[0].PKG_CONFIG_ALLOW_CROSS, '1')
    assert.equal(cargoEnvs[0].PKG_CONFIG_PATH, '/usr/lib/aarch64-linux-gnu/pkgconfig')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('updateBinaryDepsManifests updates primary and explicit extra manifests from remote refs', () => {
  const parent = mkdtempSync(join(tmpdir(), 'movscript-binary-deps-update-'))
  const root = join(parent, 'movscript')
  const extra = join(parent, 'extra-release')
  try {
    mkdirSync(root, { recursive: true })
    mkdirSync(extra, { recursive: true })
    const oldCodex = 'a'.repeat(40)
    const oldMova = 'b'.repeat(40)
    const newCodex = 'c'.repeat(40)
    const newMova = 'd'.repeat(40)
    const manifest = {
      schema: 'movscript.binary-deps.v1',
      dependencies: [
        dependency('codex', oldCodex),
        dependency('mova', oldMova),
      ],
    }
    writeFileSync(join(root, 'binary-deps.manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    writeFileSync(join(extra, 'binary-deps.manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

    const result = updateBinaryDepsManifests(root, {
      branch: 'main',
      extraManifests: ['../extra-release/binary-deps.manifest.json'],
      spawn: (command, args) => {
        assert.equal(command, 'git')
        const remote = args.find((arg) => arg.includes('github.com'))
        const sha = remote.includes('codex') ? newCodex : newMova
        return { status: 0, stdout: `${sha}\trefs/heads/main\n` }
      },
    }, {})

    assert.equal(result.updatedManifests.length, 2)
    assert.deepEqual(readManifestRefs(join(root, 'binary-deps.manifest.json')), { codex: newCodex, mova: newMova })
    assert.deepEqual(readManifestRefs(join(extra, 'binary-deps.manifest.json')), { codex: newCodex, mova: newMova })
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

function dependency(provider, ref) {
  return {
    id: `${provider}-app-server`,
    provider,
    repository: `movscript/${provider}`,
    ref,
    workdir: 'codex-rs',
    package: 'codex-app-server',
    binary: 'codex-app-server',
    license: 'Apache-2.0',
  }
}

function initFakeDependency(root, provider) {
  const repo = join(root, 'deps', provider)
  mkdirSync(join(repo, 'codex-rs'), { recursive: true })
  execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'release@example.com'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'Release Test'], { cwd: repo, stdio: 'ignore' })
  writeFileSync(join(repo, 'codex-rs', 'Cargo.toml'), '[workspace]\n')
  execFileSync('git', ['add', '.'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: repo, stdio: 'ignore' })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
}

function readManifestRefs(path) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  return Object.fromEntries(manifest.dependencies.map((item) => [item.provider, item.ref]))
}
