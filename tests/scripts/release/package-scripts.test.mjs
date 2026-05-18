import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(resolve(import.meta.dirname, '../../../package.json'), 'utf8'))
const frontendPackageJson = JSON.parse(await readFile(resolve(import.meta.dirname, '../../../apps/frontend/package.json'), 'utf8'))
const scriptManifest = JSON.parse(await readFile(resolve(import.meta.dirname, '../../../scripts/script-manifest.json'), 'utf8'))
const scriptSurfaces = JSON.parse(await readFile(resolve(import.meta.dirname, '../../../scripts/script-surfaces.json'), 'utf8'))
const gitAttributes = await readFile(resolve(import.meta.dirname, '../../../.gitattributes'), 'utf8')
const rootGitignore = await readFile(resolve(import.meta.dirname, '../../../.gitignore'), 'utf8')
const dockerignore = await readFile(resolve(import.meta.dirname, '../../../.dockerignore'), 'utf8')
const backendDockerfile = await readFile(resolve(import.meta.dirname, '../../../apps/backend/Dockerfile'), 'utf8')
const ciWorkflow = await readFile(resolve(import.meta.dirname, '../../../.github/workflows/ci.yml'), 'utf8')
const pullRequestTemplate = await readFile(resolve(import.meta.dirname, '../../../.github/pull_request_template.md'), 'utf8')
const scriptReadme = await readFile(resolve(import.meta.dirname, '../../../scripts/README.md'), 'utf8')
const scriptManagementDoc = await readFile(resolve(import.meta.dirname, '../../../docs/script-management.md'), 'utf8')
const rootMakefile = await readFile(resolve(import.meta.dirname, '../../../Makefile'), 'utf8')
const pnpmWorkspace = await readFile(resolve(import.meta.dirname, '../../../pnpm-workspace.yaml'), 'utf8')
const workspacePackageJsons = Object.fromEntries(await Promise.all([
  ...Object.keys(scriptSurfaces.workspacePackageScripts),
].map(async (path) => [
  path,
  JSON.parse(await readFile(resolve(import.meta.dirname, '../../../', path), 'utf8')),
])))
const electronBuilderConfig = await readFile(resolve(import.meta.dirname, '../../../apps/frontend/electron-builder.yml'), 'utf8')
const ffmpegReadme = await readFile(resolve(import.meta.dirname, '../../../apps/frontend/vendor/ffmpeg/README.md'), 'utf8')
const backendMakefile = await readFile(resolve(import.meta.dirname, '../../../apps/backend/Makefile'), 'utf8')
const movcliGitignore = await readFile(resolve(import.meta.dirname, '../../../apps/movcli/.gitignore'), 'utf8')

test('root package scripts keep a curated workspace entry surface', () => {
  assert.deepEqual(Object.keys(packageJson.scripts).sort(), scriptSurfaces.rootPackageScripts)
  assert.equal(packageJson.scripts.build, 'pnpm -r --filter "./packages/*" --filter "./apps/*" --filter "./plugins/*" --filter "!movscript-agent" --if-present build')
  assert.equal(packageJson.scripts.test, 'pnpm run test:contracts && pnpm -r --if-present test')
  assert.match(packageJson.scripts['test:contracts'], /node scripts\/run-node-tests\.mjs --suite contracts/)
  assert.match(packageJson.scripts['test:contracts'], /test:model-capability-contract/)
  assert.match(packageJson.scripts['test:contracts'], /test:context-management/)
  assert.match(packageJson.scripts['test:contracts'], /test:agent-run-debugging/)
  assert.deepEqual(packageJson.testSuites?.contracts, [
    'tests/scripts/agent/verify-compact-contract.test.mjs',
    'tests/scripts/agent/verify-context-management.test.mjs',
    'tests/scripts/agent/verify-run-debugging.test.mjs',
  ])
  assert.equal(packageJson.scripts['test:agent-contracts'], undefined)
  assert.equal(packageJson.scripts['test:model-capability-contract'], undefined)
})

test('desktop package entry point stays behind the release CLI', () => {
  assert.equal(packageJson.scripts['package:desktop'], undefined)
  for (const script of Object.keys(packageJson.scripts)) {
    assert.doesNotMatch(script, /^package:desktop/)
  }
})

test('frontend package scripts keep a curated app entry surface', () => {
  assert.equal(scriptSurfaces.frontendPackageScripts, undefined)
  assert.deepEqual(Object.keys(frontendPackageJson.scripts).sort(), scriptSurfaces.workspacePackageScripts['apps/frontend/package.json'])
})

test('workspace package scripts keep curated package entry surfaces', () => {
  for (const [path, scripts] of Object.entries(scriptSurfaces.workspacePackageScripts)) {
    assertScriptNames(path, scripts)
  }
})

test('backend keeps package scripts to workspace entry points', () => {
  const backendScripts = workspacePackageJsons['apps/backend/package.json'].scripts
  assert.deepEqual(Object.keys(backendScripts).sort(), [
    'build',
    'dev',
    'test',
    'test:model-capability-contract',
  ])
  for (const script of ['migrate', 'migrate:status', 'test:unit', 'test:architecture', 'tidy']) {
    assert.equal(backendScripts[script], undefined)
  }
  for (const target of ['migrate-up', 'migrate-status', 'test-unit', 'test-architecture', 'tidy']) {
    assert.match(backendMakefile, new RegExp(`^${target}:`, 'm'))
  }
})

test('root Makefile keeps package-owned dev aliases out of the entry surface', () => {
  assert.doesNotMatch(rootMakefile, /^dev-agent:/m)
  assert.doesNotMatch(rootMakefile, /^dev-backend:/m)
  assert.doesNotMatch(rootMakefile, /^dev-frontend:/m)
  assert.doesNotMatch(rootMakefile, /^dev-movcli:/m)
  assert.match(rootMakefile, /^dev-frontend-local:/m)
})

test('agent keeps generation repair coverage inside the model capability contract script', () => {
  const agentScripts = workspacePackageJsons['apps/agent/package.json'].scripts
  assert.equal(agentScripts['test:generation-repair'], undefined)
  assert.match(agentScripts['test:model-capability-contract'], /--suite model-capability-contract/)
  assert.match(agentScripts['test:model-capability-contract'], /src\/orchestration\/toolExecutor\.test\.ts/)
})

test('agent exposes the CLI through bin instead of package scripts', () => {
  const agentPackage = workspacePackageJsons['apps/agent/package.json']
  assert.equal(agentPackage.scripts.cli, undefined)
  assert.equal(agentPackage.scripts['dev:cli'], undefined)
  assert.deepEqual(agentPackage.bin, {
    'movscript-agent': './dist/cli.js',
  })
})

test('agent does not expose unused built-server aliases as package scripts', () => {
  const agentScripts = workspacePackageJsons['apps/agent/package.json'].scripts
  assert.equal(agentScripts.start, undefined)
})

test('agent keeps internal build steps behind the public build script', () => {
  const agentScripts = workspacePackageJsons['apps/agent/package.json'].scripts
  assert.equal(agentScripts['build:unlocked'], undefined)
  assert.equal(agentScripts.build, 'node scripts/build-server-bundle.mjs')
})

test('pnpm workspace includes every governed source package family', () => {
  assert.match(pnpmWorkspace, /"apps\/\*"/)
  assert.match(pnpmWorkspace, /"packages\/\*"/)
  assert.match(pnpmWorkspace, /"packages\/plugin-sdk\/examples\/\*"/)
  assert.match(pnpmWorkspace, /"plugins\/\*"/)
})

test('package-local script files stay in the canonical manifest inventory', () => {
  const manifestScriptPaths = new Set(scriptManifest.entries.map((entry) => entry.path))
  assert.equal(scriptSurfaces.maxMaintainedScriptFiles, 13)
  assert.equal(scriptManifest.entries.length, 13)
  assert.deepEqual([...manifestScriptPaths].filter((path) => !path.startsWith('scripts/')).sort(), [
    'apps/agent/scripts/build-server-bundle.mjs',
    'apps/agent/scripts/dev-watch.mjs',
    'apps/backend/scripts/build.mjs',
    'apps/frontend/scripts/prepare-agent-deploy.mjs',
    'apps/frontend/scripts/run-with-env.mjs',
  ])
  assert.equal(scriptSurfaces.packageScriptFiles, undefined)
})

test('agent script guidance routes automation to owning package or tests', () => {
  assert.match(scriptReadme, /Do not add `scripts\/agent\/` files/)
  assert.match(scriptReadme, /Agent-owned callable automation belongs in `apps\/agent\/scripts\/`/)
  assert.match(scriptManagementDoc, /Do not add `scripts\/agent\/` files/)
  assert.match(scriptManagementDoc, /durable agent automation belongs in `apps\/agent\/scripts\/`/)
  assert.match(scriptManagementDoc, /maxMaintainedScriptFiles/)
  assert.match(scriptManagementDoc, /rejects unmanaged script files/)
  assert.doesNotMatch(scriptReadme, /may live in `scripts\/agent\/`/)
  assert.doesNotMatch(scriptManagementDoc, /Add `scripts\/agent\/` files only/)
})

test('scene-summary example builds through the shared movcli plugin packager', async () => {
  const exampleRoot = resolve(import.meta.dirname, '../../../packages/plugin-sdk/examples/scene-summary')
  const packageJson = workspacePackageJsons['packages/plugin-sdk/examples/scene-summary/package.json']
  const manifest = JSON.parse(await readFile(resolve(exampleRoot, 'mov.json'), 'utf8'))
  const source = await readFile(resolve(exampleRoot, 'src/index.ts'), 'utf8')
  assert.equal(packageJson.scripts.build, 'movcli build')
  assert.equal(packageJson.devDependencies.movcli, 'workspace:*')
  assert.doesNotMatch(packageJson.scripts.build, /--out/)
  assert.doesNotMatch(packageJson.scripts.build, /src\/index\.ts/)
  assert.equal(manifest.schema, 'movscript.plugin.v1')
  assert.equal(manifest.id, 'movscript.scene-summary')
  assert.equal(manifest.main, 'src/index.ts')
  assert.match(source, /export async function run/)
  assert.doesNotMatch(source, /export const manifest/)
})

test('movcli keeps generated plugin build artifacts out of source control', () => {
  assert.match(movcliGitignore, /^dist$/m)
  assert.match(movcliGitignore, /^bundle\.js$/m)
  assert.match(movcliGitignore, /^manifest\.json$/m)
  assert.match(movcliGitignore, /^\*\.movpkg$/m)
  assert.match(rootGitignore, /^apps\/movcli\/bundle\.js$/m)
  assert.match(rootGitignore, /^apps\/movcli\/manifest\.json$/m)
  assert.match(rootGitignore, /^apps\/movcli\/\*\.movpkg$/m)
  assert.match(scriptManagementDoc, /apps\/movcli/)
  assert.match(scriptManagementDoc, /bundle\.js/)
  assert.match(scriptManagementDoc, /manifest\.json/)
  assert.match(scriptManagementDoc, /\*\.movpkg/)
})

test('workspace ignores generated plugin dist directories', () => {
  assert.match(rootGitignore, /^plugins\/\*\/dist\/$/m)
})

test('workspace ignores generated package and frontend build outputs', () => {
  assert.match(rootGitignore, /^packages\/\*\/dist\/$/m)
  assert.match(rootGitignore, /^apps\/frontend\/out\/$/m)
  assert.match(rootGitignore, /^apps\/frontend\/release\/$/m)
  assert.match(rootGitignore, /^apps\/frontend\/movscript-agent\/$/m)
  assert.match(rootGitignore, /^apps\/frontend\/src\/api\/generated\.ts$/m)
  assert.match(rootGitignore, /^apps\/frontend\/vendor\/ffmpeg\/\*\/$/m)
})

test('backend Docker build context excludes generated desktop agent output', () => {
  assert.doesNotMatch(backendDockerfile, /apps\/frontend\/movscript-agent/)
  assert.doesNotMatch(dockerignore, /^!apps\/frontend\/movscript-agent(?:\/|$)/m)
  assert.match(dockerignore, /^apps\/frontend\/\*$/m)
  assert.match(dockerignore, /^!apps\/frontend\/package\.json$/m)
  assert.match(dockerignore, /^!apps\/frontend\/src\/\*\*$/m)
  assert.match(dockerignore, /^!apps\/backend\/\*\*$/m)
  assert.match(dockerignore, /^apps\/admin\/dist\/$/m)
  assert.match(dockerignore, /^apps\/backend\/bin\/$/m)
  assert.match(dockerignore, /^packages\/\*\/dist\/$/m)
})

test('workspace marks vendored and generated trees outside product source review', () => {
  assert.match(gitAttributes, /^apps\/backend\/vendor\/\*\* linguist-vendored -diff$/m)
  assert.match(gitAttributes, /^apps\/frontend\/vendor\/ffmpeg\/\*\* linguist-vendored -diff$/m)
  assert.match(gitAttributes, /^packages\/\*\/dist\/\*\* linguist-generated -diff$/m)
  assert.match(gitAttributes, /^plugins\/\*\/dist\/\*\* linguist-generated -diff$/m)
  assert.match(gitAttributes, /^apps\/frontend\/release\/\*\* linguist-generated -diff$/m)
  assert.match(gitAttributes, /^apps\/frontend\/movscript-agent\/\*\* linguist-generated -diff$/m)
  assert.match(gitAttributes, /^apps\/frontend\/src\/api\/generated\.ts linguist-generated -diff$/m)
  assert.match(gitAttributes, /^apps\/movcli\/bundle\.js linguist-generated -diff$/m)
  assert.match(gitAttributes, /^apps\/movcli\/manifest\.json linguist-generated -diff$/m)
  assert.match(gitAttributes, /^apps\/movcli\/\*\.movpkg linguist-generated -diff$/m)
})

test('workspace ignores local prototype exports outside the documentation source', () => {
  assert.match(rootGitignore, /^docs\/prototypes\/$/m)
})

test('built-in plugins reuse the shared movcli build toolchain', () => {
  for (const path of ['plugins/image-generator/package.json', 'plugins/video-generator/package.json']) {
    const packageJson = workspacePackageJsons[path]
    assert.equal(packageJson.scripts.build, 'movcli build')
    assert.doesNotMatch(packageJson.scripts.build, /src\/index\.ts/)
    assert.doesNotMatch(packageJson.scripts.build, /--cwd/)
    assert.deepEqual(packageJson.devDependencies, {
      '@movscript/plugin-sdk': 'workspace:*',
      movcli: 'workspace:*',
    })
  }
})

test('frontend keeps one generic desktop dist script', () => {
  assert.equal(frontendPackageJson.scripts.prebuild, undefined)
  assert.equal(frontendPackageJson.scripts.build, 'node scripts/prepare-agent-deploy.mjs && electron-vite build')
  assert.equal(frontendPackageJson.scripts.dist, 'pnpm run build && electron-builder --publish never')
  assert.equal(frontendPackageJson.scripts.pack, undefined)
  for (const script of Object.keys(frontendPackageJson.scripts)) {
    if (script !== 'dist') assert.doesNotMatch(script, /^dist:/)
  }
})

test('package app preview commands stay out of curated script surfaces', () => {
  assert.equal(frontendPackageJson.scripts.preview, undefined)
  assert.equal(workspacePackageJsons['apps/admin/package.json'].scripts.preview, undefined)
})

function assertScriptNames(path, expected) {
  assert.deepEqual(Object.keys(workspacePackageJsons[path].scripts ?? {}).sort(), expected)
}

test('frontend generation contract tests use one suite entry point', () => {
  assert.equal(frontendPackageJson.scripts['test:generation-contract'], 'node ../../scripts/run-node-tests.mjs --suite generation-contract')
  assert.equal(frontendPackageJson.scripts['test:model-capability-contract'], 'pnpm run test:generation-contract && pnpm run typecheck')
  for (const script of ['test:model-contract', 'test:generation-replay', 'test:generation-ui', 'test:agent-generation', 'test:generation-e2e', 'test:generation-electron']) {
    assert.equal(frontendPackageJson.scripts[script], undefined)
  }
})

test('frontend keeps debug environment variants out of package scripts', () => {
  assert.equal(frontendPackageJson.scripts['dev:no-hmr'], undefined)
})

test('release scripts include ffmpeg staging and audit entry points', () => {
  assert.equal(packageJson.scripts.release, 'node scripts/release/release-workflow.mjs')
  for (const script of Object.keys(packageJson.scripts)) {
    assert.doesNotMatch(script, /^release:/)
  }
  assert.equal(packageJson.scripts['test:scripts'], 'node scripts/run-node-tests.mjs --suite scripts')
  assert.deepEqual(packageJson.testSuites?.['scripts'], [
    'tests/scripts/run-node-tests.test.mjs',
    'tests/scripts/run-with-env.test.mjs',
    'tests/scripts/verify-script-manifest.test.mjs',
    'tests/scripts/verifier-utils.test.mjs',
    'tests/scripts/agent/*.test.mjs',
    'tests/scripts/backend/*.test.mjs',
    'tests/scripts/frontend/*.test.mjs',
    'tests/scripts/release/*.test.mjs',
  ])
})

test('script governance gates run in CI and stay visible in PR validation', () => {
  assert.match(ciWorkflow, /Script governance/)
  assert.match(ciWorkflow, /pnpm run verify:scripts && pnpm run test:scripts/)
  assert.match(pullRequestTemplate, /Script surface changes: `pnpm run verify:scripts && pnpm run test:scripts` passed/)
})

test('release subcommands keep one curated release CLI surface', () => {
  assert.deepEqual(Object.keys(scriptSurfaces.releaseSubcommands), [
    'audit-ffmpeg',
    'collect',
    'download-ffmpeg-static',
    'package-desktop',
    'stage-ffmpeg',
  ])
  assert.deepEqual(scriptSurfaces.releaseSubcommands.collect, ['builtin:collect'])
  assert.deepEqual(scriptSurfaces.releaseSubcommands['package-desktop'], ['builtin:package-desktop'])
  assert.equal(scriptSurfaces.releaseSubcommands['inspect-ffmpeg'], undefined)
})

test('electron-builder bundles staged ffmpeg vendor resources', () => {
  assert.match(electronBuilderConfig, /extraResources:/)
  assert.match(electronBuilderConfig, /from:\s+vendor\/ffmpeg/)
  assert.match(electronBuilderConfig, /to:\s+ffmpeg/)
  assert.match(electronBuilderConfig, /"\*\*\/ffmpeg"/)
  assert.match(electronBuilderConfig, /"\*\*\/ffmpeg\.exe"/)
  assert.match(electronBuilderConfig, /"\*\*\/METADATA\.json"/)
  assert.doesNotMatch(electronBuilderConfig, /"\*\*\/\*"/)
})

test('electron-builder linux config avoids snap store publishing defaults', () => {
  assert.match(electronBuilderConfig, /linux:/)
  assert.match(electronBuilderConfig, /target:\s*\n\s+- AppImage/)
  assert.match(electronBuilderConfig, /category:\s+Utility/)
  assert.doesNotMatch(electronBuilderConfig, /snapStore/)
})

test('ffmpeg release docs describe audit remediation commands', () => {
  assert.match(ffmpegReadme, /stage with:/)
  assert.match(ffmpegReadme, /MOVSCRIPT_FFMPEG_VERSION/)
  assert.match(ffmpegReadme, /extracted binary build directory/)
  assert.match(ffmpegReadme, /release -- stage-ffmpeg --inspect/)
  assert.match(ffmpegReadme, /release -- download-ffmpeg-static/)
  assert.match(ffmpegReadme, /release -- download-ffmpeg-static --matrix/)
  assert.match(ffmpegReadme, /eugeneware\/ffmpeg-static/)
  assert.match(ffmpegReadme, /does not compile FFmpeg from\s+source/)
  assert.match(ffmpegReadme, /platform and architecture/)
})
