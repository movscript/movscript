import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoRoot = resolve(import.meta.dirname, '../..')

test('verify-script-manifest accepts a minimal compliant script inventory', async () => {
  const root = await createFixtureRepo()
  try {
    const output = await runVerifier(root)
    assert.match(output, /Script manifest verification passed/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects duplicate release utility helper implementations', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'scripts/release/stage-ffmpeg.mjs'), [
      "import { createHash } from 'node:crypto'",
      "export function sha256File(path) {",
      "  return createHash('sha256').update(String(path)).digest('hex')",
      "}",
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /stage-ffmpeg\.mjs must reuse scripts\/release\/release-common\.mjs for sha256 helper/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects duplicate desktop target path helpers', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'scripts/release/audit-ffmpeg.mjs'), [
      "import { resolve } from 'node:path'",
      "export function resolveDesktopFFmpegPath(root, platform, arch) {",
      "  return resolve(root, 'apps/frontend/vendor/ffmpeg', platform, arch, 'ffmpeg')",
      "}",
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /audit-ffmpeg\.mjs must reuse scripts\/release\/release-common\.mjs for desktop FFmpeg vendor path helper/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects duplicate desktop target arg parsers', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'scripts/release/download-ffmpeg-static.mjs'), [
      "export function parseDesktopPlatformArg(args) {",
      "  return args.find((arg) => arg.startsWith('--platform='))?.slice('--platform='.length)",
      "}",
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /download-ffmpeg-static\.mjs must reuse scripts\/release\/release-common\.mjs for desktop target CLI arg parser/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects release command helper re-exports', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'scripts/release/stage-ffmpeg.mjs'), [
      "export { resolveDesktopFFmpegPath, sha256File } from './release-common.mjs'",
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /stage-ffmpeg\.mjs must reuse scripts\/release\/release-common\.mjs for release helper re-export/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects release command parser wrappers', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'scripts/release/audit-ffmpeg.mjs'), [
      "import { parseDesktopPlatformArg } from './release-common.mjs'",
      "export function parseDesktopPlatform(args, currentPlatform) {",
      "  return parseDesktopPlatformArg(args, currentPlatform, 'desktop package')",
      "}",
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /audit-ffmpeg\.mjs must reuse scripts\/release\/release-common\.mjs for desktop target CLI arg parser/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects duplicate static verifier helper implementations', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'scripts/agent/verify-example.mjs'), [
      'export function verifyExample() {',
      '  return true',
      '}',
      'function validateJSONSchemaFixture() {',
      '  return false',
      '}',
      'function assertIncludes() {',
      '  return false',
      '}',
      '',
    ].join('\n'))
    const manifestPath = join(root, 'scripts/script-manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.entries.push({
      path: 'scripts/agent/verify-example.mjs',
      category: 'contract',
      lifecycle: 'maintained',
      owner: 'test',
      purpose: 'Fixture verifier with duplicated helper implementation',
      entrypoint: 'node scripts/agent/verify-example.mjs',
      invokedBy: ['fixture'],
      tests: ['fixture'],
    })
    manifest.entries.sort((left, right) => left.path.localeCompare(right.path))
    await writeJSON(manifestPath, manifest)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /scripts\/agent\/verify-example\.mjs must reuse scripts\/verifier-utils\.mjs for JSON schema fixture validator/)
        assert.match(String(error.stderr), /scripts\/agent\/verify-example\.mjs must reuse scripts\/verifier-utils\.mjs for static verifier assertion helper/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects script tests missing from the scripts suite', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'tests/scripts/unlisted.test.mjs'), [
      "import test from 'node:test'",
      "test('unlisted script test', () => {})",
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /testSuites\.scripts must include tests\/scripts\/unlisted\.test\.mjs/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects domain scripts placed directly under scripts root', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'scripts/random-task.mjs'), [
      '#!/usr/bin/env node',
      "console.log('manual task')",
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /scripts\/random-task\.mjs must not live directly under scripts\//)
        assert.doesNotMatch(stderr, /move domain scripts into scripts\/agent/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects unmanaged script files outside governed roots', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'tools/random-task.mjs'), [
      '#!/usr/bin/env node',
      "console.log('manual task')",
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /tools\/random-task\.mjs is an unmanaged script file/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects unmanaged shell scripts outside governed roots', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'tools/random-task.sh'), [
      '#!/usr/bin/env sh',
      'echo manual task',
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /tools\/random-task\.sh is an unmanaged script file/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects frontend deploy preparation under scripts agent', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'scripts/agent/prepare-deploy.mjs'), '#!/usr/bin/env node\n')

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /scripts\/agent\/prepare-deploy\.mjs must live under apps\/frontend\/scripts\/prepare-agent-deploy\.mjs/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects new root agent script files', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'scripts/agent/durable-task.mjs'), '#!/usr/bin/env node\n')

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /scripts\/agent\/durable-task\.mjs is not part of the supported script surface/)
        assert.match(String(error.stderr), /keep agent-owned automation in apps\/agent\/scripts\//)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects docs that reopen scripts agent as an expansion point', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'scripts/README.md'), [
      '# Scripts',
      '',
      'Agent-specific workspace automation may live in `scripts/agent/` when it is durable callable automation.',
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /scripts\/README\.md must state that scripts\/agent\/ is not a supported script surface/)
        assert.match(String(error.stderr), /script governance docs must not describe scripts\/agent\/ as an allowed expansion point/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects docs that blur contract assets with verifier scripts', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'docs/script-management.md'), [
      '# Script Management',
      '',
      'Do not add `scripts/agent/` files; durable agent automation belongs in `apps/agent/scripts/`.',
      '`maxMaintainedScriptFiles` records the explicit maintained script file budget.',
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /docs\/script-management\.md must distinguish contract source assets from contract verifier scripts/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects unsupported manual scripts', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'scripts/manual/send_ai_hello.py'), [
      '#!/usr/bin/env python3',
      'print("hello")',
      '',
    ].join('\n'))
    const manifestPath = join(root, 'scripts/script-manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.entries.push({
      path: 'scripts/manual/send_ai_hello.py',
      category: 'manual',
      lifecycle: 'maintained',
      owner: 'test',
      purpose: 'Fixture manual probe',
      entrypoint: 'python3 scripts/manual/send_ai_hello.py',
      invokedBy: ['manual'],
      tests: ['python3 scripts/manual/send_ai_hello.py --help'],
    })
    manifest.entries.sort((left, right) => left.path.localeCompare(right.path))
    await writeJSON(manifestPath, manifest)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /scripts\/manual\/send_ai_hello\.py is not part of the supported script surface/)
        assert.match(String(error.stderr), /scripts\/manual\/send_ai_hello\.py: category must be one of build, contract, dev, release, test/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects manifest entries for missing scripts', async () => {
  const root = await createFixtureRepo()
  try {
    const manifestPath = join(root, 'scripts/script-manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.entries.push({
      path: 'scripts/manual/missing-manual-task.mjs',
      category: 'manual',
      lifecycle: 'maintained',
      owner: 'test',
      purpose: 'Fixture missing script',
      entrypoint: 'node scripts/manual/missing-manual-task.mjs',
      invokedBy: ['fixture'],
      tests: ['fixture'],
    })
    manifest.entries.sort((left, right) => left.path.localeCompare(right.path))
    await writeJSON(manifestPath, manifest)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /scripts\/manual\/missing-manual-task\.mjs: script file does not exist/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects non-maintained script lifecycles', async () => {
  const root = await createFixtureRepo()
  try {
    const manifestPath = join(root, 'scripts/script-manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const entry = manifest.entries.find((candidate) => candidate.path === 'scripts/run-node-tests.mjs')
    entry.lifecycle = 'deprecated'
    await writeJSON(manifestPath, manifest)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /scripts\/run-node-tests\.mjs: lifecycle must be one of maintained/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects package-local scripts missing from the manifest inventory', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'apps/agent/scripts/random-dev-task.mjs'), [
      '#!/usr/bin/env node',
      "console.log('agent task')",
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /missing manifest entry for apps\/agent\/scripts\/random-dev-task\.mjs/)
        assert.match(String(error.stderr), /apps\/agent\/scripts\/random-dev-task\.mjs is not part of the supported package-local script surface; add it to scripts\/script-manifest\.json/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects plugin example package-local scripts', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'packages/plugin-sdk/examples/scene-summary/scripts/bundle.mjs'), [
      '#!/usr/bin/env node',
      "console.log('example bundler')",
      '',
    ].join('\n'))
    const manifestPath = join(root, 'scripts/script-manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.entries.push({
      path: 'packages/plugin-sdk/examples/scene-summary/scripts/bundle.mjs',
      category: 'build',
      lifecycle: 'maintained',
      owner: 'test',
      purpose: 'Fixture unsupported plugin example script',
      entrypoint: 'node packages/plugin-sdk/examples/scene-summary/scripts/bundle.mjs',
      invokedBy: ['fixture'],
      tests: ['fixture'],
    })
    manifest.entries.sort((left, right) => left.path.localeCompare(right.path))
    await writeJSON(manifestPath, manifest)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /packages\/plugin-sdk\/examples\/scene-summary\/scripts\/bundle\.mjs is not part of the supported script surface; plugin examples must use mov\.json and the shared movcli build workflow/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects development scripts in the deployed agent package', async () => {
  const root = await createFixtureRepo()
  try {
    await writeJSON(join(root, 'apps/frontend/movscript-agent/package.json'), {
      name: 'movscript-agent',
      version: '0.1.0',
      private: true,
      type: 'module',
      main: './dist/server.bundle.js',
      scripts: {
        dev: 'node scripts/dev-watch.mjs',
      },
    })

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /apps\/frontend\/movscript-agent\/package\.json must not include scripts/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects test artifacts in the deployed agent dist', async () => {
  const root = await createFixtureRepo()
  try {
    await writeJSON(join(root, 'apps/frontend/movscript-agent/package.json'), {
      name: 'movscript-agent',
      version: '0.1.0',
      private: true,
      type: 'module',
      main: './dist/server.bundle.js',
    })
    await writeText(join(root, 'apps/frontend/movscript-agent/dist/server.test.js'), 'console.log("test artifact")\n')

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /apps\/frontend\/movscript-agent\/dist\/server\.test\.js must not be shipped/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects package-owned aliases in the root Makefile', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'Makefile'), `${fixtureMakefile()}\nbuild-backend:\n\tpnpm --filter movscript-backend build\n`)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /Makefile target build-backend must not duplicate package-owned scripts/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects unsupported root package script entries', async () => {
  const root = await createFixtureRepo({
    packageScripts: {
      'dev:docs': 'vitepress dev docs',
    },
  })
  try {
    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /package\.json scripts\.dev:docs is not part of the supported root script surface/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects manually enumerated root build scripts', async () => {
  const root = await createFixtureRepo({
    packageScripts: {
      build: 'pnpm --filter "./packages/*" build && pnpm --filter movscript-agent build && pnpm --filter movscript-frontend build && pnpm --filter "./plugins/*" build',
    },
  })
  try {
    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /package\.json scripts\.build must be pnpm -r --filter "\.\/packages\/\*" --filter "\.\/apps\/\*" --filter "\.\/plugins\/\*" --filter "!movscript-agent" --if-present build/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects missing supported root package scripts', async () => {
  const root = await createFixtureRepo()
  try {
    const packageJsonPath = join(root, 'package.json')
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    delete packageJson.scripts['test:scripts']
    await writeJSON(packageJsonPath, packageJson)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /package\.json must keep supported script test:scripts/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects missing root contract suite wiring', async () => {
  const root = await createFixtureRepo({
    packageContractSuite: [
      'tests/scripts/agent/verify-compact-contract.test.mjs',
      'tests/scripts/agent/verify-context-management.test.mjs',
    ],
  })
  try {
    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /package\.json testSuites\.contracts must include tests\/scripts\/agent\/verify-run-debugging\.test\.mjs/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects unsupported frontend package script entries', async () => {
  const root = await createFixtureRepo()
  try {
    await writeJSON(join(root, 'apps/frontend/package.json'), {
      type: 'module',
      scripts: {
        'dev:local': 'node scripts/run-with-env.mjs MOVSCRIPT_BACKEND_POLICY=spawn pnpm run dev',
        'test:ui-contract': 'node --import tsx --test "src/lib/uiContract.test.tsx"',
      },
    })

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /apps\/frontend\/package\.json scripts\.test:ui-contract is not part of the supported frontend script surface/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects missing supported frontend package scripts', async () => {
  const root = await createFixtureRepo()
  try {
    const packageJsonPath = join(root, 'apps/frontend/package.json')
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    delete packageJson.scripts.dist
    await writeJSON(packageJsonPath, packageJson)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /apps\/frontend\/package\.json must keep supported script dist/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects frontend build without package-local deploy preparation', async () => {
  const root = await createFixtureRepo()
  try {
    const packageJsonPath = join(root, 'apps/frontend/package.json')
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    packageJson.scripts.build = 'electron-vite build'
    await writeJSON(packageJsonPath, packageJson)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /apps\/frontend\/package\.json scripts\.build must run the package-local scripts\/prepare-agent-deploy\.mjs before electron-vite build/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects unsupported workspace package script entries', async () => {
  const root = await createFixtureRepo()
  try {
    await writeJSON(join(root, 'apps/agent/package.json'), {
      type: 'module',
      scripts: {
        ...fixturePackageScripts()['apps/agent/package.json'],
        'test:legacy': 'node --test src/legacy.test.ts',
      },
    })

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /apps\/agent\/package\.json scripts\.test:legacy is not part of the supported package script surface/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects missing configured root script files', async () => {
  const root = await createFixtureRepo()
  try {
    const surfacesPath = join(root, 'scripts/script-surfaces.json')
    const surfaces = JSON.parse(await readFile(surfacesPath, 'utf8'))
    surfaces.rootScriptFiles = [
      'scripts/missing-helper.mjs',
      ...surfaces.rootScriptFiles,
    ]
    await writeJSON(surfacesPath, surfaces)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /scripts\/script-surfaces\.json root script file scripts\/missing-helper\.mjs does not exist/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects release subcommands pointing at missing scripts', async () => {
  const root = await createFixtureRepo()
  try {
    const surfacesPath = join(root, 'scripts/script-surfaces.json')
    const surfaces = JSON.parse(await readFile(surfacesPath, 'utf8'))
    surfaces.releaseSubcommands = Object.fromEntries([
      ...Object.entries(surfaces.releaseSubcommands),
      ['ghost-command', ['scripts/release/missing-release-task.mjs']],
    ].sort(([left], [right]) => left.localeCompare(right)))
    await writeJSON(surfacesPath, surfaces)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /scripts\/script-surfaces\.json releaseSubcommands\.ghost-command script scripts\/release\/missing-release-task\.mjs does not exist/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects unsupported builtin release subcommands', async () => {
  const root = await createFixtureRepo()
  try {
    const surfacesPath = join(root, 'scripts/script-surfaces.json')
    const surfaces = JSON.parse(await readFile(surfacesPath, 'utf8'))
    surfaces.releaseSubcommands = {
      ...surfaces.releaseSubcommands,
      'package-desktop': ['builtin:unknown-package-step'],
    }
    await writeJSON(surfacesPath, surfaces)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /releaseSubcommands\.package-desktop builtin builtin:unknown-package-step is not supported/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects internal desktop release steps as public subcommands', async () => {
  const root = await createFixtureRepo()
  try {
    const surfacesPath = join(root, 'scripts/script-surfaces.json')
    const surfaces = JSON.parse(await readFile(surfacesPath, 'utf8'))
    surfaces.releaseSubcommands = Object.fromEntries([
      ...Object.entries(surfaces.releaseSubcommands),
      ['prepare-desktop', ['scripts/release/release-workflow.mjs', 'prepare-desktop']],
      ['verify-desktop', ['scripts/release/verify-desktop-package.mjs']],
    ].sort(([left], [right]) => left.localeCompare(right)))
    await writeJSON(surfacesPath, surfaces)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /releaseSubcommands must not expose internal prepare-desktop; use package-desktop/)
        assert.match(String(error.stderr), /releaseSubcommands must not expose internal verify-desktop; use package-desktop/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects inspect ffmpeg release subcommand aliases', async () => {
  const root = await createFixtureRepo()
  try {
    const surfacesPath = join(root, 'scripts/script-surfaces.json')
    const surfaces = JSON.parse(await readFile(surfacesPath, 'utf8'))
    surfaces.releaseSubcommands = Object.fromEntries([
      ...Object.entries(surfaces.releaseSubcommands),
      ['inspect-ffmpeg', ['scripts/release/stage-ffmpeg.mjs', '--inspect']],
    ].sort(([left], [right]) => left.localeCompare(right)))
    await writeJSON(surfacesPath, surfaces)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /releaseSubcommands must not expose internal inspect-ffmpeg; use stage-ffmpeg --inspect/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects split desktop prepare release scripts', async () => {
  const root = await createFixtureRepo()
  try {
    await writeReleaseScript(root, 'prepare-desktop-package.mjs', ['export const prepare = true'])

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /prepare-desktop-package\.mjs must stay folded into scripts\/release\/release-workflow\.mjs package-desktop/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects split desktop verify release scripts', async () => {
  const root = await createFixtureRepo()
  try {
    await writeReleaseScript(root, 'verify-desktop-package.mjs', ['export const verify = true'])

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /verify-desktop-package\.mjs must stay folded into scripts\/release\/release-workflow\.mjs and scripts\/release\/release-common\.mjs/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects split release artifact collection scripts', async () => {
  const root = await createFixtureRepo()
  try {
    await writeReleaseScript(root, 'collect-artifacts.mjs', ['export const collect = true'])

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /collect-artifacts\.mjs must stay folded into scripts\/release\/release-workflow\.mjs collect/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects unsorted script surface config', async () => {
  const root = await createFixtureRepo()
  try {
    const surfacesPath = join(root, 'scripts/script-surfaces.json')
    const surfaces = JSON.parse(await readFile(surfacesPath, 'utf8'))
    surfaces.rootPackageScripts = ['test', 'build']
    await writeJSON(surfacesPath, surfaces)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /scripts\/script-surfaces\.json rootPackageScripts: paths must be sorted lexicographically/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects manifest entries above the script file budget', async () => {
  const root = await createFixtureRepo()
  try {
    const surfacesPath = join(root, 'scripts/script-surfaces.json')
    const surfaces = JSON.parse(await readFile(surfacesPath, 'utf8'))
    surfaces.maxMaintainedScriptFiles = 12
    await writeJSON(surfacesPath, surfaces)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /script manifest has 13 maintained scripts, exceeding scripts\/script-surfaces\.json maxMaintainedScriptFiles 12/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects invalid script file budgets', async () => {
  const root = await createFixtureRepo()
  try {
    const surfacesPath = join(root, 'scripts/script-surfaces.json')
    const surfaces = JSON.parse(await readFile(surfacesPath, 'utf8'))
    surfaces.maxMaintainedScriptFiles = '13'
    await writeJSON(surfacesPath, surfaces)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /maxMaintainedScriptFiles must be a non-negative integer/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects retired frontend script surface fields', async () => {
  const root = await createFixtureRepo()
  try {
    const surfacesPath = join(root, 'scripts/script-surfaces.json')
    const surfaces = JSON.parse(await readFile(surfacesPath, 'utf8'))
    surfaces.frontendPackageScripts = fixturePackageScripts()['apps/frontend/package.json']
    await writeJSON(surfacesPath, surfaces)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /scripts\/script-surfaces\.json unknown field frontendPackageScripts/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects discovered packages missing from script surfaces', async () => {
  const root = await createFixtureRepo()
  try {
    await writeJSON(join(root, 'apps/experimental/package.json'), {
      type: 'module',
      scripts: {
        build: 'echo build',
      },
    })

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /workspacePackageScripts must include discovered package apps\/experimental\/package\.json/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects managed example packages missing from pnpm workspace', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'pnpm-workspace.yaml'), [
      'packages:',
      '  - "apps/*"',
      '  - "packages/*"',
      '  - "plugins/*"',
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /pnpm-workspace\.yaml must include packages\/plugin-sdk\/examples\/\*/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects plugin packages that bypass the movcli bin', async () => {
  const root = await createFixtureRepo()
  try {
    const packageJsonPath = join(root, 'plugins/image-generator/package.json')
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    packageJson.scripts.build = 'pnpm --dir ../../apps/movcli exec node --import tsx src/index.ts build --cwd ../../plugins/image-generator'
    await writeJSON(packageJsonPath, packageJson)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /plugins\/image-generator\/package\.json scripts\.build must reuse the movcli package bin via "movcli build"/)
        assert.match(String(error.stderr), /plugins\/image-generator\/package\.json scripts\.build must not hand-code movcli source paths, tsx loaders, or plugin cwd arguments/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects plugin packages missing the movcli workspace dependency', async () => {
  const root = await createFixtureRepo()
  try {
    const packageJsonPath = join(root, 'plugins/video-generator/package.json')
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    delete packageJson.devDependencies.movcli
    await writeJSON(packageJsonPath, packageJson)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /plugins\/video-generator\/package\.json devDependencies\.movcli must be workspace:\* so recursive builds order movcli before plugin packaging/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects duplicate frontend generation test aliases', async () => {
  const root = await createFixtureRepo()
  try {
    await writeJSON(join(root, 'apps/frontend/package.json'), {
      type: 'module',
      scripts: {
        'test:generation-contract': 'node ../../scripts/run-node-tests.mjs --suite generation-contract',
        'test:generation-ui': 'node --import tsx --test "src/lib/agentGenerationUiContract.test.tsx"',
      },
    })

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /apps\/frontend\/package\.json scripts\.test:generation-ui must not duplicate test:generation-contract/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects package-local scripts not invoked by package scripts', async () => {
  const root = await createFixtureRepo()
  try {
    await writeJSON(join(root, 'apps/agent/package.json'), {
      type: 'module',
      scripts: {
        build: 'echo build',
        dev: 'node scripts/dev-watch.mjs',
        test: 'node ../../scripts/run-node-tests.mjs "src/**/*.test.ts"',
        'test:context-management': 'node ../../scripts/run-node-tests.mjs --suite context-management && pnpm run typecheck',
        'test:model-capability-contract': 'node ../../scripts/run-node-tests.mjs --suite model-capability-contract && node --import tsx --test "src/orchestration/toolExecutor.test.ts"',
        typecheck: 'tsc --noEmit -p tsconfig.json',
      },
    })

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /apps\/agent\/scripts\/build-server-bundle\.mjs: no script in apps\/agent\/package\.json invokes scripts\/build-server-bundle\.mjs/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects release scripts missing from release subcommands', async () => {
  const root = await createFixtureRepo()
  try {
    const surfacesPath = join(root, 'scripts/script-surfaces.json')
    const surfaces = JSON.parse(await readFile(surfacesPath, 'utf8'))
    delete surfaces.releaseSubcommands['stage-ffmpeg']
    await writeJSON(surfacesPath, surfaces)

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /scripts\/release\/stage-ffmpeg\.mjs: release scripts must be exposed through scripts\/script-surfaces\.json releaseSubcommands/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects missing focused manifest tests for governance scripts', async () => {
  const root = await createFixtureRepo({
    manifestTests: {
      'scripts/verify-script-manifest.mjs': ['pnpm run verify:scripts'],
    },
  })
  try {
    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /verify-script-manifest\.mjs manifest entry must list its focused script test/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects manifest test commands pointing at missing script tests', async () => {
  const root = await createFixtureRepo({
    manifestTests: {
      'scripts/verify-script-manifest.mjs': ['node --test tests/scripts/missing-verifier.test.mjs'],
    },
    packageScriptSuite: [
      'tests/scripts/run-node-tests.test.mjs',
      'tests/scripts/run-with-env.test.mjs',
      'tests/scripts/verify-script-manifest.test.mjs',
      'tests/scripts/missing-verifier.test.mjs',
    ],
  })
  try {
    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /references missing script test tests\/scripts\/missing-verifier\.test\.mjs/)
        assert.match(String(error.stderr), /test command references missing file tests\/scripts\/missing-verifier\.test\.mjs/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects generated desktop agent artifacts in the Docker build context', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'apps/backend/Dockerfile'), [
      'FROM node:22-alpine AS admin-builder',
      'COPY apps/frontend/movscript-agent/package.json ./apps/frontend/movscript-agent/package.json',
      '',
    ].join('\n'))
    await writeText(join(root, '.dockerignore'), [
      '*',
      '!apps/',
      'apps/*',
      '!apps/backend/',
      '!apps/backend/**',
      '!apps/frontend/',
      'apps/frontend/*',
      '!apps/frontend/package.json',
      '!apps/frontend/src/',
      '!apps/frontend/src/**',
      '!apps/frontend/movscript-agent/',
      '!apps/frontend/movscript-agent/package.json',
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /Dockerfile must not copy generated apps\/frontend\/movscript-agent artifacts/)
        assert.match(String(error.stderr), /\.dockerignore must not re-include generated apps\/frontend\/movscript-agent artifacts/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects Docker contexts that include generated build output directories', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, '.dockerignore'), [
      '*',
      '!apps/',
      'apps/*',
      '!apps/admin/',
      '!apps/admin/**',
      '!apps/backend/',
      '!apps/backend/**',
      '!apps/frontend/',
      'apps/frontend/*',
      '!apps/frontend/package.json',
      '!apps/frontend/src/',
      '!apps/frontend/src/**',
      '!packages/',
      'packages/*',
      '!packages/ui/',
      '!packages/ui/**',
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /\.dockerignore must exclude generated Docker context path apps\/admin\/dist\//)
        assert.match(String(error.stderr), /\.dockerignore must exclude generated Docker context path apps\/backend\/bin\//)
        assert.match(String(error.stderr), /\.dockerignore must exclude generated Docker context path packages\/\*\/dist\//)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects stale generated frontend API source output', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, 'apps/frontend/src/api/generated.ts'), 'export const stale = true\n')

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /apps\/frontend\/src\/api\/generated\.ts must not be committed without a maintained source contract/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects missing movcli generated artifact boundaries', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, '.gitignore'), [
      'apps/frontend/vendor/ffmpeg/*/',
      'apps/movcli/bundle.js',
      '',
    ].join('\n'))
    await writeText(join(root, '.gitattributes'), [
      'apps/movcli/bundle.js linguist-generated -diff',
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /\.gitignore must exclude generated movcli artifact apps\/movcli\/manifest\.json/)
        assert.match(stderr, /\.gitignore must exclude generated movcli artifact apps\/movcli\/\*\.movpkg/)
        assert.match(stderr, /\.gitattributes must mark generated movcli artifact apps\/movcli\/manifest\.json/)
        assert.match(stderr, /\.gitattributes must mark generated movcli artifact apps\/movcli\/\*\.movpkg/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects tracked staged ffmpeg vendor platform directories', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, '.gitignore'), [
      'apps/movcli/bundle.js',
      'apps/movcli/manifest.json',
      'apps/movcli/*.movpkg',
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /\.gitignore must exclude staged desktop ffmpeg platform directories while keeping apps\/frontend\/vendor\/ffmpeg\/README\.md tracked/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verify-script-manifest rejects missing CI and PR script governance gates', async () => {
  const root = await createFixtureRepo()
  try {
    await writeText(join(root, '.github/workflows/ci.yml'), [
      'name: CI',
      'jobs:',
      '  node:',
      '    steps:',
      '      - name: Contract gates',
      '        run: pnpm run test:contracts',
      '',
    ].join('\n'))
    await writeText(join(root, '.github/pull_request_template.md'), [
      '## Validation',
      '',
      '- [ ] `pnpm run test`',
      '',
    ].join('\n'))

    await assert.rejects(
      runVerifier(root),
      (error) => {
        assert.match(String(error.stderr), /ci\.yml must run pnpm run verify:scripts/)
        assert.match(String(error.stderr), /ci\.yml must run pnpm run test:scripts/)
        assert.match(String(error.stderr), /pull_request_template\.md must mention pnpm run verify:scripts/)
        assert.match(String(error.stderr), /pull_request_template\.md must mention pnpm run test:scripts/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function createFixtureRepo(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'movscript-script-manifest-'))
  const packageScripts = {
    build: 'pnpm -r --filter "./packages/*" --filter "./apps/*" --filter "./plugins/*" --filter "!movscript-agent" --if-present build',
    release: 'node scripts/release/release-workflow.mjs',
    test: 'pnpm run test:contracts && pnpm -r --if-present test',
    'test:contracts': 'node scripts/run-node-tests.mjs --suite contracts && pnpm -r --filter "./apps/*" --if-present test:model-capability-contract && pnpm --filter movscript-agent test:context-management && pnpm --filter movscript-frontend test:agent-run-debugging',
    'test:scripts': 'node scripts/run-node-tests.mjs --suite scripts',
    typecheck: 'pnpm -r --if-present typecheck',
    'verify:scripts': 'node scripts/verify-script-manifest.mjs',
    ...(options.packageScripts ?? {}),
  }
  await writeText(join(root, 'pnpm-workspace.yaml'), [
    'packages:',
    '  - "apps/*"',
    '  - "packages/*"',
    '  - "packages/plugin-sdk/examples/*"',
    '  - "plugins/*"',
    '',
  ].join('\n'))
  await writeText(join(root, '.gitignore'), fixtureGitignore())
  await writeText(join(root, '.gitattributes'), fixtureGitAttributes())
  await writeText(join(root, '.dockerignore'), fixtureDockerignore())
  await writeText(join(root, '.github/workflows/ci.yml'), fixtureCIWorkflow())
  await writeText(join(root, '.github/pull_request_template.md'), fixturePullRequestTemplate())
  await writeText(join(root, 'scripts/README.md'), fixtureScriptsReadme())
  await writeText(join(root, 'docs/script-management.md'), fixtureScriptManagementDoc())
  await writeJSON(join(root, 'package.json'), {
    type: 'module',
    scripts: packageScripts,
    testSuites: {
      contracts: options.packageContractSuite ?? [
        'tests/scripts/agent/verify-compact-contract.test.mjs',
        'tests/scripts/agent/verify-context-management.test.mjs',
        'tests/scripts/agent/verify-run-debugging.test.mjs',
      ],
      scripts: options.packageScriptSuite ?? [
        'tests/scripts/run-node-tests.test.mjs',
        'tests/scripts/run-with-env.test.mjs',
        'tests/scripts/verifier-utils.test.mjs',
        'tests/scripts/verify-script-manifest.test.mjs',
        'tests/scripts/agent/*.test.mjs',
        'tests/scripts/frontend/*.test.mjs',
      ],
    },
  })
  for (const [path, scripts] of Object.entries(fixturePackageScripts())) {
    await writeJSON(join(root, path), {
      type: 'module',
      scripts,
      ...(fixturePackageDevDependencies()[path]
        ? { devDependencies: fixturePackageDevDependencies()[path] }
        : {}),
    })
  }
  await writeText(join(root, 'Makefile'), fixtureMakefile())
  await writeText(join(root, 'apps/backend/Dockerfile'), fixtureBackendDockerfile())
  await writeText(join(root, 'apps/agent/scripts/build-server-bundle.mjs'), '#!/usr/bin/env node\n')
  await writeText(join(root, 'apps/agent/scripts/dev-watch.mjs'), '#!/usr/bin/env node\n')
  await writeText(join(root, 'apps/backend/scripts/build.mjs'), "process.env.GOCACHE || '/private/tmp/movscript-go-cache'\n")
  await writeText(join(root, 'apps/frontend/scripts/prepare-agent-deploy.mjs'), '#!/usr/bin/env node\n')
  await writeText(join(root, 'apps/frontend/scripts/run-with-env.mjs'), '#!/usr/bin/env node\n')

  await mkdir(join(root, 'scripts'), { recursive: true })
  await cp(resolve(repoRoot, 'scripts/script-surfaces.json'), join(root, 'scripts/script-surfaces.json'))
  await cp(resolve(repoRoot, 'scripts/verifier-utils.mjs'), join(root, 'scripts/verifier-utils.mjs'))
  await writeText(join(root, 'scripts/run-node-tests.mjs'), '#!/usr/bin/env node\n')
  await cp(resolve(repoRoot, 'scripts/verify-script-manifest.mjs'), join(root, 'scripts/verify-script-manifest.mjs'))
  await writeText(join(root, 'tests/scripts/run-node-tests.test.mjs'), "import 'node:test'\n")
  await writeText(join(root, 'tests/scripts/frontend/prepare-agent-deploy.test.mjs'), "import 'node:test'\n")
  await writeText(join(root, 'tests/scripts/run-with-env.test.mjs'), "import 'node:test'\n")
  await writeText(join(root, 'tests/scripts/verifier-utils.test.mjs'), "import 'node:test'\n")
  await writeText(join(root, 'tests/scripts/verify-script-manifest.test.mjs'), "import 'node:test'\n")
  await writeText(join(root, 'tests/scripts/agent/verify-compact-contract.test.mjs'), "import '../../../scripts/verifier-utils.mjs'\n")
  await writeReleaseScript(root, 'release-common.mjs', [
    "export function resolveDesktopFFmpegPath() { return '' }",
    "export function sha256File() { return '' }",
    "export function isDirectRun() { return false }",
    "export function isHttpURL() { return true }",
    "export function isPlaceholderURL() { return false }",
    "export function isSPDXLike() { return true }",
    "export function isFFmpegVersionLine() { return true }",
    'export const ffmpegMetadataFields = []',
    'export function buildFFmpegMetadata() { return {} }',
    'export function validateFFmpegMetadataInput() {}',
    "export function validateFFmpegMetadataRecord() { return '' }",
  ])
  await writeReleaseScript(root, 'audit-ffmpeg.mjs', ['export const audit = true'])
  await writeReleaseScript(root, 'download-ffmpeg-static.mjs', ['export const download = true'])
  await writeReleaseScript(root, 'release-workflow.mjs', [
    "import './release-common.mjs'",
    "const surfacesPath = 'scripts/script-surfaces.json'",
    'const releaseSubcommands = {}',
    "const steps = [['Verify script inventory', 'pnpm', ['run', 'verify:scripts']]]",
    'void surfacesPath',
    'void releaseSubcommands',
    'void steps',
  ])
  await writeReleaseScript(root, 'stage-ffmpeg.mjs', ['export const stage = true'])

  await writeManifest(root, [
    'apps/agent/scripts/build-server-bundle.mjs',
    'apps/agent/scripts/dev-watch.mjs',
    'apps/backend/scripts/build.mjs',
    'apps/frontend/scripts/prepare-agent-deploy.mjs',
    'apps/frontend/scripts/run-with-env.mjs',
    'scripts/release/audit-ffmpeg.mjs',
    'scripts/release/download-ffmpeg-static.mjs',
    'scripts/release/release-common.mjs',
    'scripts/release/release-workflow.mjs',
    'scripts/release/stage-ffmpeg.mjs',
    'scripts/run-node-tests.mjs',
    'scripts/verifier-utils.mjs',
    'scripts/verify-script-manifest.mjs',
  ], options.manifestTests)
  return root
}

async function writeReleaseScript(root, name, lines) {
  await writeText(join(root, 'scripts/release', name), `${lines.join('\n')}\n`)
}

async function writeManifest(root, paths, testOverrides = {}) {
  const entries = paths.map((path) => ({
    path,
    category: path.includes('/release/') ? 'release' : 'contract',
    lifecycle: 'maintained',
    owner: 'test',
    purpose: `Fixture entry for ${path}`,
    entrypoint: 'imported module',
    invokedBy: ['fixture'],
    tests: testOverrides[path] ?? manifestTestsForPath(path),
  }))
  await writeJSON(join(root, 'scripts/script-manifest.json'), {
    schema: 'movscript.script-manifest.v1',
    entries,
  })
}

function manifestTestsForPath(path) {
  if (path === 'scripts/run-node-tests.mjs') return ['node --test tests/scripts/run-node-tests.test.mjs']
  if (path === 'apps/frontend/scripts/run-with-env.mjs') return ['node --test tests/scripts/run-with-env.test.mjs']
  if (path === 'scripts/verifier-utils.mjs') return ['node --test tests/scripts/verifier-utils.test.mjs']
  if (path === 'scripts/verify-script-manifest.mjs') return ['node --test tests/scripts/verify-script-manifest.test.mjs']
  return ['fixture']
}

function fixtureMakefile() {
  return [
    '.PHONY: dev-frontend-local test-agent-run-debugging-e2e verify-agent-run-debugging-summary verify-agent-run-debugging-summary-contract',
    '',
    'dev-frontend-local:',
    '\t@echo dev-frontend-local',
    '',
    'test-agent-run-debugging-e2e:',
    '\t@echo test-agent-run-debugging-e2e',
    '',
    'verify-agent-run-debugging-summary:',
    '\t@echo verify-agent-run-debugging-summary',
    '',
    'verify-agent-run-debugging-summary-contract:',
    '\t@echo verify-agent-run-debugging-summary-contract',
    '',
  ].join('\n')
}

function fixtureDockerignore() {
  return [
    '*',
    '',
    '!package.json',
    '!pnpm-lock.yaml',
    '!pnpm-workspace.yaml',
    '!tsconfig.base.json',
    '!.npmrc',
    '',
    '!apps/',
    'apps/*',
    '!apps/admin/',
    '!apps/admin/**',
    'apps/admin/dist/',
    '!apps/agent/',
    '!apps/agent/package.json',
    '!apps/backend/',
    '!apps/backend/**',
    'apps/backend/bin/',
    '!apps/frontend/',
    'apps/frontend/*',
    '!apps/frontend/package.json',
    '!apps/frontend/src/',
    '!apps/frontend/src/**',
    '!apps/movcli/',
    '!apps/movcli/package.json',
    'packages/*/dist/',
    '',
  ].join('\n')
}

function fixtureGitignore() {
  return [
    'apps/frontend/vendor/ffmpeg/*/',
    'apps/movcli/bundle.js',
    'apps/movcli/manifest.json',
    'apps/movcli/*.movpkg',
    '',
  ].join('\n')
}

function fixtureGitAttributes() {
  return [
    'apps/movcli/bundle.js linguist-generated -diff',
    'apps/movcli/manifest.json linguist-generated -diff',
    'apps/movcli/*.movpkg linguist-generated -diff',
    '',
  ].join('\n')
}

function fixtureBackendDockerfile() {
  return [
    'FROM node:22-alpine AS admin-builder',
    'COPY apps/frontend/package.json ./apps/frontend/package.json',
    'COPY apps/frontend/src ./apps/frontend/src',
    '',
    'FROM golang:1.25-alpine AS builder',
    'COPY apps/backend/vendor ./vendor',
    'COPY apps/backend ./',
    '',
  ].join('\n')
}

function fixtureCIWorkflow() {
  return [
    'name: CI',
    '',
    'jobs:',
    '  node:',
    '    steps:',
    '      - name: Script governance',
    '        run: pnpm run verify:scripts && pnpm run test:scripts',
    '      - name: Contract gates',
    '        run: pnpm run test:contracts',
    '',
  ].join('\n')
}

function fixturePullRequestTemplate() {
  return [
    '## Validation',
    '',
    '- [ ] `pnpm run test`',
    '- [ ] Contract changes: `pnpm run test:contracts` passed',
    '- [ ] Script surface changes: `pnpm run verify:scripts && pnpm run test:scripts` passed',
    '',
  ].join('\n')
}

function fixtureScriptsReadme() {
  return [
    '# Scripts',
    '',
    'Do not add `scripts/agent/` files. Agent-owned callable automation belongs in `apps/agent/scripts/`; test-only agent contract gates live under `tests/scripts/agent/`.',
    'Contract source assets stay under `contracts/`: `*.schema.json` files define the contract, and `*.fixture.json` files are examples used by tests.',
    '',
  ].join('\n')
}

function fixtureScriptManagementDoc() {
  return [
    '# Script Management',
    '',
    'Do not add `scripts/agent/` files; durable agent automation belongs in `apps/agent/scripts/`.',
    '`maxMaintainedScriptFiles` records the explicit maintained script file budget.',
    'Contract source assets stay under `contracts/`: `*.schema.json` files define the contract, and `*.fixture.json` files are examples used by tests.',
    '',
  ].join('\n')
}

function fixturePackageScripts() {
  return {
    'apps/admin/package.json': {
      build: 'tsc --noEmit && vite build',
      dev: 'vite --host 127.0.0.1 --port 5174',
      test: 'node ../../scripts/run-node-tests.mjs "src/**/*.test.ts" "src/**/*.test.tsx"',
      'test:model-capability-contract': 'node ../../scripts/run-node-tests.mjs src/lib/modelParamContract.test.ts && pnpm run typecheck',
      typecheck: 'tsc --noEmit',
    },
    'apps/agent/package.json': {
      build: 'node scripts/build-server-bundle.mjs',
      dev: 'node scripts/dev-watch.mjs',
      test: 'node ../../scripts/run-node-tests.mjs "src/**/*.test.ts"',
      'test:context-management': 'node ../../scripts/run-node-tests.mjs --suite context-management && pnpm run typecheck',
      'test:model-capability-contract': 'node ../../scripts/run-node-tests.mjs --suite model-capability-contract && node --import tsx --test "src/orchestration/toolExecutor.test.ts"',
      typecheck: 'tsc --noEmit -p tsconfig.json',
    },
    'apps/backend/package.json': {
      build: 'node scripts/build.mjs',
      dev: 'make dev',
      test: 'make test',
      'test:model-capability-contract': 'make test-model-capability-contract',
    },
    'apps/frontend/package.json': {
      build: 'node scripts/prepare-agent-deploy.mjs && electron-vite build',
      dev: 'electron-vite dev',
      'dev:local': 'node scripts/run-with-env.mjs MOVSCRIPT_BACKEND_POLICY=spawn MOVSCRIPT_AI_STREAM_DEBUG=1 pnpm run dev',
      dist: 'pnpm run build && electron-builder --publish never',
      test: 'node ../../scripts/run-node-tests.mjs "src/**/*.test.ts" "src/**/*.test.tsx" "electron/**/*.test.ts"',
      'test:agent-run-debugging': 'node ../../scripts/run-node-tests.mjs --suite agent-run-debugging && pnpm run typecheck',
      'test:generation-contract': 'node ../../scripts/run-node-tests.mjs --suite generation-contract',
      'test:model-capability-contract': 'pnpm run test:generation-contract && pnpm run typecheck',
      typecheck: 'tsc --noEmit',
    },
    'apps/movcli/package.json': {
      build: 'tsup',
      dev: 'tsx src/index.ts',
    },
    'packages/draft-schemas/package.json': {
      build: 'tsup src/index.ts --format esm,cjs --dts --clean',
      typecheck: 'tsc --noEmit',
    },
    'packages/plugin-sdk/package.json': {
      build: 'tsup src/index.ts --format esm,cjs --dts --clean',
      typecheck: 'tsc --noEmit',
    },
    'packages/plugin-sdk/examples/scene-summary/package.json': {
      build: 'movcli build',
    },
    'packages/tokens/package.json': {
      build: 'tsup src/index.ts --format esm,cjs --dts --clean',
      typecheck: 'tsc --noEmit',
    },
    'packages/ui/package.json': {
      build: 'tsup src/index.ts --format esm,cjs --dts --clean --external react --external react-dom',
      typecheck: 'tsc --noEmit',
    },
    'plugins/image-generator/package.json': {
      build: 'movcli build',
    },
    'plugins/video-generator/package.json': {
      build: 'movcli build',
    },
  }
}

function fixturePackageDevDependencies() {
  const pluginDevDependencies = {
    '@movscript/plugin-sdk': 'workspace:*',
    movcli: 'workspace:*',
  }
  return {
    'packages/plugin-sdk/examples/scene-summary/package.json': pluginDevDependencies,
    'plugins/image-generator/package.json': pluginDevDependencies,
    'plugins/video-generator/package.json': pluginDevDependencies,
  }
}

async function writeJSON(path, value) {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeText(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, value)
}

async function runVerifier(root) {
  const { stdout, stderr } = await execFileAsync(process.execPath, ['scripts/verify-script-manifest.mjs'], {
    cwd: root,
    env: childProcessEnv(),
  })
  return `${stdout}\n${stderr}`
}

function childProcessEnv() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('NODE_TEST')) delete env[key]
  }
  return env
}
