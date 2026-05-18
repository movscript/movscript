#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

import { readJSONFile, repoRootFromMeta } from './verifier-utils.mjs'

const repoRoot = repoRootFromMeta(import.meta.url)
const manifestPath = resolve(repoRoot, 'scripts/script-manifest.json')
const scriptSurfacesPath = resolve(repoRoot, 'scripts/script-surfaces.json')
const scriptRoots = ['scripts', 'apps/agent/scripts', 'apps/backend/scripts', 'apps/frontend/scripts']
const scriptExtensions = new Set(['.mjs', '.py'])
const allowedCategories = new Set(['build', 'contract', 'dev', 'release', 'test'])
const allowedLifecycles = new Set(['maintained'])
const errors = []

const manifest = readManifest()
const scriptSurfaces = readScriptSurfaces()
const allowedRootScriptFiles = new Set(scriptSurfaces.rootScriptFiles ?? [])
const allowedRootPackageScripts = new Set(scriptSurfaces.rootPackageScripts ?? [])
const packageScriptSurfaces = scriptSurfaces.workspacePackageScripts ?? {}
const allowedFrontendPackageScripts = new Set(packageScriptSurfaces['apps/frontend/package.json'] ?? [])
const allowedMakeTargets = new Set(scriptSurfaces.makeTargets ?? [])
const releaseSubcommands = scriptSurfaces.releaseSubcommands ?? {}
const packageJson = readJSON(resolve(repoRoot, 'package.json'), 'package.json')
const frontendPackageJson = readJSON(resolve(repoRoot, 'apps/frontend/package.json'), 'apps/frontend/package.json')
const deployedAgentPackageJsonPath = resolve(repoRoot, 'apps/frontend/movscript-agent/package.json')
const deployedAgentPackageJson = existsSync(deployedAgentPackageJsonPath)
  ? readJSON(deployedAgentPackageJsonPath, 'apps/frontend/movscript-agent/package.json')
  : undefined
const pnpmWorkspace = readText(resolve(repoRoot, 'pnpm-workspace.yaml'), 'pnpm-workspace.yaml')
const workspacePackageJsonByPath = Object.fromEntries(
  Object.keys(packageScriptSurfaces).map((path) => [path, readJSON(resolve(repoRoot, path), path)]),
)
const makefile = readText(resolve(repoRoot, 'Makefile'), 'Makefile')
const rootGitignore = readText(resolve(repoRoot, '.gitignore'), '.gitignore')
const gitAttributes = readText(resolve(repoRoot, '.gitattributes'), '.gitattributes')
const dockerignore = readText(resolve(repoRoot, '.dockerignore'), '.dockerignore')
const ciWorkflow = readText(resolve(repoRoot, '.github/workflows/ci.yml'), '.github/workflows/ci.yml')
const pullRequestTemplate = readText(resolve(repoRoot, '.github/pull_request_template.md'), '.github/pull_request_template.md')
const scriptReadme = readText(resolve(repoRoot, 'scripts/README.md'), 'scripts/README.md')
const scriptManagementDoc = readText(resolve(repoRoot, 'docs/script-management.md'), 'docs/script-management.md')
const backendDockerfile = readText(resolve(repoRoot, 'apps/backend/Dockerfile'), 'apps/backend/Dockerfile')
const buildBackendScript = readText(resolve(repoRoot, 'apps/backend/scripts/build.mjs'), 'apps/backend/scripts/build.mjs')
const releaseWorkflowScript = readText(resolve(repoRoot, 'scripts/release/release-workflow.mjs'), 'scripts/release/release-workflow.mjs')
const entries = Array.isArray(manifest.entries) ? manifest.entries : []
const expectedScripts = discoverScripts()
const entryPaths = entries.map((entry) => entry.path)
const manifestScriptFiles = new Set(entryPaths)

if (manifest.schema !== 'movscript.script-manifest.v1') {
  errors.push('manifest schema must be movscript.script-manifest.v1')
}

if (!Array.isArray(manifest.entries)) {
  errors.push('manifest entries must be an array')
}

if (packageJson.scripts?.['verify:scripts'] !== 'node scripts/verify-script-manifest.mjs') {
  errors.push('package.json scripts.verify:scripts must run node scripts/verify-script-manifest.mjs')
}

if (packageJson.scripts?.release !== 'node scripts/release/release-workflow.mjs') {
  errors.push('package.json release must run the unified release workflow command')
}

if (Object.hasOwn(packageJson.scripts ?? {}, 'package:desktop')) {
  errors.push('package.json must not expose package:desktop; use pnpm run release -- package-desktop')
}

if (!releaseWorkflowScript.includes("['run', 'verify:scripts']")) {
  errors.push('scripts/release/release-workflow.mjs check workflow must include pnpm run verify:scripts')
}

if (!releaseWorkflowScript.includes('script-surfaces.json') || !releaseWorkflowScript.includes('releaseSubcommands')) {
  errors.push('scripts/release/release-workflow.mjs must load release subcommands from scripts/script-surfaces.json')
}

const rootBuildScript = String(packageJson.scripts?.build ?? '')
const expectedRootBuildScript = 'pnpm -r --filter "./packages/*" --filter "./apps/*" --filter "./plugins/*" --filter "!movscript-agent" --if-present build'
const pluginBuildPackagePaths = [
  'packages/plugin-sdk/examples/scene-summary/package.json',
  'plugins/image-generator/package.json',
  'plugins/video-generator/package.json',
]

if (rootBuildScript.includes('pnpm run build:')) {
  errors.push('package.json scripts.build must not delegate through root build:* aliases')
}

if (rootBuildScript !== expectedRootBuildScript) {
  errors.push(`package.json scripts.build must be ${expectedRootBuildScript}`)
}

if (!buildBackendScript.includes("process.env.GOCACHE || '/private/tmp/movscript-go-cache'")) {
  errors.push('apps/backend/scripts/build.mjs must set a writable default GOCACHE')
}

if (!pnpmWorkspace.includes('"packages/plugin-sdk/examples/*"')) {
  errors.push('pnpm-workspace.yaml must include packages/plugin-sdk/examples/* because script governance manages example packages')
}

validatePackageScriptShellBoundaries()
validateFrontendPackageScriptBoundaries()
validateDeployedAgentPackageBoundary()
validateWorkspacePackageScriptSurfaces()
validatePluginBuildPackageScripts()
validateMakefileShellBoundaries()
validateDockerBuildContextBoundaries()
validateGeneratedSourceBoundaries()
validateAutomationGovernanceGates()
validateScriptGovernanceDocs()
validateScriptSurfacesConfig()
validateScriptDirectoryBoundaries()
validateRepositoryScriptFileBoundaries()
validateReleaseHelperBoundaries()
validateVerifierHelperBoundaries()
validateScriptGovernanceTestCoverage()
validateScriptTestSuiteCoverage()
assertSortedUnique(entryPaths, 'manifest entries')

const entrySet = new Set(entryPaths)
for (const scriptPath of expectedScripts) {
  if (!entrySet.has(scriptPath)) errors.push(`missing manifest entry for ${scriptPath}`)
  if (scriptPath.endsWith('.test.mjs')) errors.push(`${scriptPath}: tests belong under tests/scripts, not scripts`)
}

for (const entry of entries) {
  validateEntry(entry)
}
validateManifestInvocationLinks()

if (existsSync(resolve(repoRoot, 'scripts/__pycache__'))) {
  errors.push('scripts/__pycache__ must not exist; generated Python cache files belong outside source control')
}

if (errors.length > 0) {
  console.error('Script manifest verification failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Script manifest verification passed (${entries.length} scripts).`)

function readManifest() {
  return readJSON(manifestPath, 'scripts/script-manifest.json')
}

function readScriptSurfaces() {
  return readJSON(scriptSurfacesPath, 'scripts/script-surfaces.json')
}

function readJSON(filePath, label) {
  return readJSONFile(repoRoot, filePath, { label })
}

function readText(filePath, label) {
  try {
    return readFileSync(filePath, 'utf8')
  } catch (error) {
    console.error(`Failed to read text ${label}: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

function validatePackageScriptShellBoundaries() {
  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    const script = String(command)
    if (!allowedRootPackageScripts.has(name)) {
      errors.push(`package.json scripts.${name} is not part of the supported root script surface; move package-specific commands to the owning workspace package`)
    }
    if (name.startsWith('package:desktop:')) {
      errors.push(`package.json scripts.${name} must not duplicate package-desktop; pass --platform/--arch to pnpm run release -- package-desktop instead`)
    }
    if (['build:apps', 'build:packages', 'build:plugins'].includes(name)) {
      errors.push(`package.json scripts.${name} must not expose internal build steps; use pnpm run build or direct pnpm --filter commands`)
    }
    if (name.startsWith('release:')) {
      errors.push(`package.json scripts.${name} must not duplicate release subcommands; use pnpm run release -- ${name.slice('release:'.length)} instead`)
    }
    if (name === 'dev:frontend:local:external-agent') {
      errors.push('package.json scripts.dev:frontend:local:external-agent must not duplicate dev:frontend:local; set MOVSCRIPT_AGENT_POLICY=external when needed')
    }
    if ([
      'build:admin', 'build:agent', 'build:backend', 'build:backend:with-admin',
      'dev:admin', 'dev:agent', 'dev:backend', 'dev:frontend', 'dev:frontend:local', 'dev:frontend:cloud', 'dev:movcli',
      'migrate:backend', 'migrate:backend:status', 'tidy',
    ].includes(name)) {
      errors.push(`package.json scripts.${name} must not duplicate package-owned app scripts; use pnpm --filter or the owning package Makefile`)
    }
    if (name === 'test:agent-generation') {
      errors.push('package.json scripts.test:agent-generation must not duplicate package-owned generation test scripts')
    }
    if (name === 'release:prepare-plugins') {
      errors.push('package.json scripts.release:prepare-plugins must not duplicate package/plugin build filters')
    }
    if (script.includes('cd apps/backend')) {
      errors.push(`package.json scripts.${name} must use go -C apps/backend instead of shell cd`)
    }
    if (name === 'generate:api-types' || name === 'check:api-types') {
      errors.push(`package.json scripts.${name} must not expose stale OpenAPI type generation without a source contract`)
    }
    if (name.startsWith('test:backend') && script.includes('go ') && script.includes(' test')) {
      errors.push(`package.json scripts.${name} must delegate backend Go tests to apps/backend/Makefile`)
    }
  }
  for (const name of ['test:backend', 'test:backend:unit', 'test:backend:architecture', 'test:model-capability-contract:backend']) {
    if (packageJson.scripts?.[name] !== undefined) {
      errors.push(`package.json scripts.${name} must live in apps/backend/package.json, not the root package`)
    }
  }
  for (const name of allowedRootPackageScripts) {
    if (packageJson.scripts?.[name] === undefined) {
      errors.push(`package.json must keep supported script ${name}`)
    }
  }
}

function validateFrontendPackageScriptBoundaries() {
  if (!String(frontendPackageJson.scripts?.build ?? '').startsWith('node scripts/prepare-agent-deploy.mjs && electron-vite build')) {
    errors.push('apps/frontend/package.json scripts.build must run the package-local scripts/prepare-agent-deploy.mjs before electron-vite build')
  }
  for (const name of Object.keys(frontendPackageJson.scripts ?? {})) {
    if (!allowedFrontendPackageScripts.has(name)) {
      errors.push(`apps/frontend/package.json scripts.${name} is not part of the supported frontend script surface; prefer a test suite entry or existing package command`)
    }
    if (name.startsWith('dist:')) {
      errors.push(`apps/frontend/package.json scripts.${name} must not duplicate package-desktop; pass --platform/--arch to pnpm run release -- package-desktop instead`)
    }
    if (name === 'dev:local:external-agent') {
      errors.push('apps/frontend/package.json scripts.dev:local:external-agent must not duplicate dev:local; set MOVSCRIPT_AGENT_POLICY=external when needed')
    }
    if (['test:model-contract', 'test:generation-replay', 'test:generation-ui', 'test:agent-generation'].includes(name)) {
      errors.push(`apps/frontend/package.json scripts.${name} must not duplicate test:generation-contract; add focused files to the generation-contract suite instead`)
    }
  }
  for (const name of allowedFrontendPackageScripts) {
    if (frontendPackageJson.scripts?.[name] === undefined) {
      errors.push(`apps/frontend/package.json must keep supported script ${name}`)
    }
  }
}

function validateDeployedAgentPackageBoundary() {
  if (!deployedAgentPackageJson) return
  for (const field of ['scripts', 'testSuites', 'devDependencies']) {
    if (deployedAgentPackageJson[field]) {
      errors.push(`apps/frontend/movscript-agent/package.json must not include ${field}; prepare-agent-deploy writes a runtime-only package manifest`)
    }
  }
  if (deployedAgentPackageJson.main !== './dist/server.bundle.js') {
    errors.push('apps/frontend/movscript-agent/package.json main must point at ./dist/server.bundle.js')
  }
  const deployedDist = resolve(repoRoot, 'apps/frontend/movscript-agent/dist')
  if (existsSync(deployedDist)) {
    for (const file of readdirSync(deployedDist)) {
      if (/\.test\.(?:js|d\.ts|js\.map)$/.test(file)) {
        errors.push(`apps/frontend/movscript-agent/dist/${file} must not be shipped in the desktop runtime agent bundle`)
      }
    }
  }
}

function validateWorkspacePackageScriptSurfaces() {
  for (const [path, allowedScripts] of Object.entries(packageScriptSurfaces)) {
    const packageJson = workspacePackageJsonByPath[path]
    const allowed = new Set(allowedScripts)
    const actualScripts = Object.keys(packageJson.scripts ?? {})
    for (const name of actualScripts) {
      if (!allowed.has(name)) {
        errors.push(`${path} scripts.${name} is not part of the supported package script surface`)
      }
    }
    for (const name of allowedScripts) {
      if (!actualScripts.includes(name)) {
        errors.push(`${path} must keep supported script ${name}`)
      }
    }
  }
}

function validatePluginBuildPackageScripts() {
  for (const path of pluginBuildPackagePaths) {
    const packageJson = workspacePackageJsonByPath[path]
    const command = String(packageJson?.scripts?.build ?? '')
    if (command !== 'movcli build') {
      errors.push(`${path} scripts.build must reuse the movcli package bin via "movcli build"`)
    }
    if (/src\/index\.ts|--cwd|node --import tsx|pnpm --dir/.test(command)) {
      errors.push(`${path} scripts.build must not hand-code movcli source paths, tsx loaders, or plugin cwd arguments`)
    }
    if (packageJson?.devDependencies?.movcli !== 'workspace:*') {
      errors.push(`${path} devDependencies.movcli must be workspace:* so recursive builds order movcli before plugin packaging`)
    }
  }
}

function validateDockerBuildContextBoundaries() {
  if (backendDockerfile.includes('apps/frontend/movscript-agent')) {
    errors.push('apps/backend/Dockerfile must not copy generated apps/frontend/movscript-agent artifacts; build the deploy bundle through apps/frontend scripts')
  }
  if (/^!apps\/frontend\/movscript-agent(?:\/|$)/m.test(dockerignore)) {
    errors.push('.dockerignore must not re-include generated apps/frontend/movscript-agent artifacts in the backend Docker build context')
  }
  if (!/^apps\/frontend\/\*$/m.test(dockerignore) || !/^!apps\/frontend\/package\.json$/m.test(dockerignore) || !/^!apps\/frontend\/src\/\*\*$/m.test(dockerignore)) {
    errors.push('.dockerignore must keep the frontend Docker context limited to package.json and src for the admin build')
  }
  if (!/^!apps\/backend\/\*\*$/m.test(dockerignore)) {
    errors.push('.dockerignore must include apps/backend/** because the Go Docker build uses vendored backend source')
  }
  for (const generatedPath of ['apps/admin/dist/', 'apps/backend/bin/', 'packages/*/dist/']) {
    if (!dockerignore.includes(generatedPath)) {
      errors.push(`.dockerignore must exclude generated Docker context path ${generatedPath}`)
    }
  }
}

function validateGeneratedSourceBoundaries() {
  if (existsSync(resolve(repoRoot, 'apps/frontend/src/api/generated.ts'))) {
    errors.push('apps/frontend/src/api/generated.ts must not be committed without a maintained source contract; use typed domain clients instead of stale generated OpenAPI output')
  }
  if (!/^apps\/frontend\/vendor\/ffmpeg\/\*\/$/m.test(rootGitignore)) {
    errors.push('.gitignore must exclude staged desktop ffmpeg platform directories while keeping apps/frontend/vendor/ffmpeg/README.md tracked')
  }
  for (const generatedPath of ['apps/movcli/bundle.js', 'apps/movcli/manifest.json', 'apps/movcli/*.movpkg']) {
    if (!rootGitignore.includes(generatedPath)) {
      errors.push(`.gitignore must exclude generated movcli artifact ${generatedPath}`)
    }
    if (!gitAttributes.includes(`${generatedPath} linguist-generated -diff`)) {
      errors.push(`.gitattributes must mark generated movcli artifact ${generatedPath}`)
    }
  }
}

function validateAutomationGovernanceGates() {
  for (const command of ['pnpm run verify:scripts', 'pnpm run test:scripts']) {
    if (!ciWorkflow.includes(command)) {
      errors.push(`.github/workflows/ci.yml must run ${command} so script surface drift is blocked in CI`)
    }
    if (!pullRequestTemplate.includes(command)) {
      errors.push(`.github/pull_request_template.md must mention ${command} for script surface changes`)
    }
  }
  if (!ciWorkflow.includes('Script governance')) {
    errors.push('.github/workflows/ci.yml must label the script governance gate')
  }
  if (!pullRequestTemplate.includes('Script surface changes')) {
    errors.push('.github/pull_request_template.md must include a Script surface changes validation item')
  }
}

function validateScriptGovernanceDocs() {
  if (!scriptReadme.includes('Do not add `scripts/agent/` files')) {
    errors.push('scripts/README.md must state that scripts/agent/ is not a supported script surface')
  }
  if (!scriptReadme.includes('Agent-owned callable automation belongs in `apps/agent/scripts/`')) {
    errors.push('scripts/README.md must route agent-owned callable automation to apps/agent/scripts/')
  }
  if (!scriptManagementDoc.includes('Do not add `scripts/agent/` files')) {
    errors.push('docs/script-management.md must state that scripts/agent/ is not a supported script surface')
  }
  if (!scriptManagementDoc.includes('durable agent automation belongs in `apps/agent/scripts/`')) {
    errors.push('docs/script-management.md must route durable agent automation to apps/agent/scripts/')
  }
  if (!scriptManagementDoc.includes('maxMaintainedScriptFiles')) {
    errors.push('docs/script-management.md must document the maintained script file budget')
  }
  for (const text of [scriptReadme, scriptManagementDoc]) {
    if (text.includes('may live in `scripts/agent/`') || text.includes('Add `scripts/agent/` files only')) {
      errors.push('script governance docs must not describe scripts/agent/ as an allowed expansion point')
    }
  }
}

function validateScriptSurfacesConfig() {
  const allowedSurfaceKeys = new Set([
    'schema',
    'maxMaintainedScriptFiles',
    'rootScriptFiles',
    'rootPackageScripts',
    'workspacePackageScripts',
    'releaseSubcommands',
    'makeTargets',
  ])
  for (const key of Object.keys(scriptSurfaces)) {
    if (!allowedSurfaceKeys.has(key)) errors.push(`scripts/script-surfaces.json unknown field ${key}`)
  }
  if (scriptSurfaces.schema !== 'movscript.script-surfaces.v1') {
    errors.push('scripts/script-surfaces.json schema must be movscript.script-surfaces.v1')
  }
  if (!Number.isInteger(scriptSurfaces.maxMaintainedScriptFiles) || scriptSurfaces.maxMaintainedScriptFiles < 0) {
    errors.push('scripts/script-surfaces.json maxMaintainedScriptFiles must be a non-negative integer')
  } else if (entries.length > scriptSurfaces.maxMaintainedScriptFiles) {
    errors.push(`script manifest has ${entries.length} maintained scripts, exceeding scripts/script-surfaces.json maxMaintainedScriptFiles ${scriptSurfaces.maxMaintainedScriptFiles}`)
  }
  validateSurfaceArray('scripts/script-surfaces.json rootScriptFiles', scriptSurfaces.rootScriptFiles)
  validateSurfaceArray('scripts/script-surfaces.json rootPackageScripts', scriptSurfaces.rootPackageScripts)
  validateSurfaceArray('scripts/script-surfaces.json makeTargets', scriptSurfaces.makeTargets)
  if (!scriptSurfaces.workspacePackageScripts || typeof scriptSurfaces.workspacePackageScripts !== 'object' || Array.isArray(scriptSurfaces.workspacePackageScripts)) {
    errors.push('scripts/script-surfaces.json workspacePackageScripts must be an object')
    return
  }
  validateReleaseSubcommandsConfig()
  for (const path of scriptSurfaces.rootScriptFiles ?? []) {
    if (!existsSync(resolve(repoRoot, path))) {
      errors.push(`scripts/script-surfaces.json root script file ${path} does not exist`)
    }
  }
  const packagePaths = Object.keys(scriptSurfaces.workspacePackageScripts)
  assertSortedUnique(packagePaths, 'scripts/script-surfaces.json workspacePackageScripts paths')
  const discoveredPackagePaths = discoverManagedPackageJsons()
  const packagePathSet = new Set(packagePaths)
  for (const path of discoveredPackagePaths) {
    if (!packagePathSet.has(path)) {
      errors.push(`scripts/script-surfaces.json workspacePackageScripts must include discovered package ${path}`)
    }
  }
  for (const [path, scripts] of Object.entries(scriptSurfaces.workspacePackageScripts)) {
    if (!existsSync(resolve(repoRoot, path))) {
      errors.push(`scripts/script-surfaces.json workspace package ${path} does not exist`)
    }
    validateSurfaceArray(`scripts/script-surfaces.json workspacePackageScripts.${path}`, scripts)
  }
}

function validateReleaseSubcommandsConfig() {
  if (!releaseSubcommands || typeof releaseSubcommands !== 'object' || Array.isArray(releaseSubcommands)) {
    errors.push('scripts/script-surfaces.json releaseSubcommands must be an object')
    return
  }
  const commandNames = Object.keys(releaseSubcommands)
  assertSortedUnique(commandNames, 'scripts/script-surfaces.json releaseSubcommands')
  if (!commandNames.includes('package-desktop')) {
    errors.push('scripts/script-surfaces.json releaseSubcommands must include package-desktop')
  }
  for (const internalCommand of ['inspect-ffmpeg', 'prepare-desktop', 'verify-desktop']) {
    if (commandNames.includes(internalCommand)) {
      const replacement = internalCommand === 'inspect-ffmpeg' ? 'stage-ffmpeg --inspect' : 'package-desktop'
      errors.push(`scripts/script-surfaces.json releaseSubcommands must not expose internal ${internalCommand}; use ${replacement}`)
    }
  }
  for (const [name, commandArgs] of Object.entries(releaseSubcommands)) {
    const label = `scripts/script-surfaces.json releaseSubcommands.${name}`
    if (!stringArray(commandArgs) || commandArgs.length === 0) {
      errors.push(`${label} must be a non-empty array of strings`)
      continue
    }
    const scriptPath = commandArgs[0]
    if (scriptPath.startsWith('builtin:')) {
      if (!['builtin:collect', 'builtin:package-desktop'].includes(scriptPath)) {
        errors.push(`${label} builtin ${scriptPath} is not supported`)
      }
      continue
    }
    if (!scriptPath.startsWith('scripts/release/')) {
      errors.push(`${label} must dispatch to a scripts/release/ entrypoint`)
    }
    if (!existsSync(resolve(repoRoot, scriptPath))) {
      errors.push(`${label} script ${scriptPath} does not exist`)
    }
  }
}

function validateSurfaceArray(label, value) {
  if (!stringArray(value)) {
    errors.push(`${label} must be an array of non-empty strings`)
    return
  }
  assertSortedUnique(value, label)
}

function discoverManagedPackageJsons() {
  return [
    ...discoverDirectPackageJsons('apps'),
    ...discoverDirectPackageJsons('packages'),
    ...discoverDirectPackageJsons('plugins'),
    ...discoverDirectPackageJsons('packages/plugin-sdk/examples'),
  ].sort()
}

function discoverDirectPackageJsons(root) {
  const directory = resolve(repoRoot, root)
  if (!existsSync(directory)) return []
  const packageJsons = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue
    const path = join(directory, entry.name, 'package.json')
    if (existsSync(path)) {
      packageJsons.push(relative(repoRoot, path).split(/[/\\]+/).join('/'))
    }
  }
  return packageJsons
}

function validateMakefileShellBoundaries() {
  if (makefile.includes('cd apps/backend')) {
    errors.push('Makefile must use package scripts or go -C apps/backend instead of shell cd')
  }
  const targets = parseMakeTargets(makefile)
  for (const target of targets) {
    if (!allowedMakeTargets.has(target)) {
      errors.push(`Makefile target ${target} must not duplicate package-owned scripts; use pnpm --filter or the owning package Makefile instead`)
    }
  }
  for (const target of allowedMakeTargets) {
    if (!targets.includes(target)) errors.push(`Makefile must keep supported target ${target}`)
  }
}

function parseMakeTargets(text) {
  const targets = []
  for (const match of text.matchAll(/^([A-Za-z0-9_.:-]+):(?:\s|$)/gm)) {
    if (match[1] === '.PHONY') continue
    targets.push(match[1])
  }
  return targets
}

function validateScriptDirectoryBoundaries() {
  const rootScriptFiles = discoverScripts().filter((path) => path.startsWith('scripts/') && !path.slice('scripts/'.length).includes('/'))
  for (const path of rootScriptFiles) {
    if (!allowedRootScriptFiles.has(path)) {
      errors.push(`${path} must not live directly under scripts/; move release automation into scripts/release/ and app-owned automation into the owning package scripts directory`)
    }
  }

  const rootAgentScriptNames = [
    'scripts/agent-run-debugging.mjs',
    'scripts/agent/prepare-deploy.mjs',
    'scripts/prepare-agent-deploy.mjs',
    'scripts/agent/verify-compact-contract.mjs',
    'scripts/agent/verify-context-management.mjs',
    'scripts/agent/verify-run-debugging.mjs',
    'scripts/verify-agent-compact-contract.mjs',
    'scripts/verify-agent-context-management.mjs',
    'scripts/verify-agent-run-debugging.mjs',
  ]
  for (const path of rootAgentScriptNames) {
    if (existsSync(resolve(repoRoot, path))) {
      const target = path === 'scripts/agent/verify-compact-contract.mjs'
        ? 'tests/scripts/agent/verify-compact-contract.test.mjs because the compact contract gate is test-only'
        : path === 'scripts/agent/verify-context-management.mjs'
        ? 'tests/scripts/agent/verify-context-management.mjs because the context contract gate is test-only'
        : path === 'scripts/agent/verify-run-debugging.mjs'
        ? 'tests/scripts/agent/verify-run-debugging.mjs because the AgentRun contract gate is test-only'
        : path === 'scripts/agent/prepare-deploy.mjs'
        ? 'apps/frontend/scripts/prepare-agent-deploy.mjs because it is owned by frontend desktop packaging'
        : 'apps/agent/scripts/ for callable agent automation, or tests/scripts/agent/ for test-only agent contract gates'
      errors.push(`${path} must live under ${target}`)
    }
  }
  for (const path of ['scripts/release/build-backend.mjs', 'scripts/release/copy-admin-assets.mjs']) {
    if (existsSync(resolve(repoRoot, path))) {
      errors.push(`${path} must live under apps/backend/scripts/ because it is backend packaging automation`)
    }
  }
  if (existsSync(resolve(repoRoot, 'scripts/release/prepare-desktop-package.mjs'))) {
    errors.push('scripts/release/prepare-desktop-package.mjs must stay folded into scripts/release/release-workflow.mjs package-desktop')
  }
  if (existsSync(resolve(repoRoot, 'scripts/release/verify-desktop-package.mjs'))) {
    errors.push('scripts/release/verify-desktop-package.mjs must stay folded into scripts/release/release-workflow.mjs and scripts/release/release-common.mjs')
  }
  if (existsSync(resolve(repoRoot, 'scripts/release/collect-artifacts.mjs'))) {
    errors.push('scripts/release/collect-artifacts.mjs must stay folded into scripts/release/release-workflow.mjs collect')
  }
  const manualScriptFiles = discoverScripts().filter((path) => path.startsWith('scripts/manual/'))
  for (const path of manualScriptFiles) {
    errors.push(`${path} is not part of the supported script surface; move durable automation to the owning package or delete one-off manual utilities`)
  }
  const agentScriptFiles = discoverScripts().filter((path) => path.startsWith('scripts/agent/'))
  for (const path of agentScriptFiles) {
    errors.push(`${path} is not part of the supported script surface; keep agent-owned automation in apps/agent/scripts/ and test gates in tests/scripts/agent/`)
  }
  for (const path of discoverPluginExampleScriptFiles()) {
    errors.push(`${path} is not part of the supported script surface; plugin examples must use mov.json and the shared movcli build workflow instead of package-local scripts`)
  }
  const packageLocalScriptFiles = discoverScripts().filter((path) => !path.startsWith('scripts/'))
  for (const path of packageLocalScriptFiles) {
    if (!manifestScriptFiles.has(path)) {
      errors.push(`${path} is not part of the supported package-local script surface; add it to scripts/script-manifest.json with owner, purpose, caller, and tests or delete it`)
    }
  }
}

function validateRepositoryScriptFileBoundaries() {
  for (const path of discoverRepositoryScripts()) {
    if (manifestScriptFiles.has(path)) continue
    if (path.startsWith('tests/')) continue
    errors.push(`${path} is an unmanaged script file; move maintained automation into a governed script root with a manifest entry, or keep test-only helpers under tests/`)
  }
}

function validateReleaseHelperBoundaries() {
  const releaseScripts = discoverScripts().filter((path) => path.startsWith('scripts/release/') && path.endsWith('.mjs'))
  const releaseScriptTexts = new Map(releaseScripts.map((path) => [path, readText(resolve(repoRoot, path), path)]))
  assertHelperOwner({
    ownerPath: 'scripts/release/release-common.mjs',
    patterns: [
      { regex: /\bfunction\s+sha256File\b|\bcreateHash\(['"]sha256['"]\)/, label: 'sha256 helper' },
      { regex: /\bfunction\s+isDirectRun\b|\bfileURLToPath\b/, label: 'direct-run helper' },
      { regex: /\bfunction\s+(?:isHttpURL|isPlaceholderURL|isSPDXLike|isFFmpegVersionLine)\b/, label: 'URL/license/version validators' },
      { regex: /\b(?:export\s+const|const)\s+ffmpegMetadataFields\b|\bfunction\s+(?:buildFFmpegMetadata|validateFFmpegMetadataInput|validateFFmpegMetadataRecord)\b|const\s+requiredFields\s*=\s*\[/, label: 'FFmpeg metadata contract helpers' },
    ],
    scriptTexts: releaseScriptTexts,
  })
  assertHelperOwner({
    ownerPath: 'scripts/release/release-common.mjs',
    patterns: [
      { regex: /\bfunction\s+resolveDesktopFFmpegPath\b|\bapps\/frontend\/vendor\/ffmpeg\b/, label: 'desktop FFmpeg vendor path helper' },
      { regex: /\bfunction\s+parseDesktop(?:Platform|Arch)s?(?:Arg)?\b|\.startsWith\(['"]--(?:platform|arch)=['"]\)/, label: 'desktop target CLI arg parser' },
      { regex: /\bexport\s*\{[^}]*\b(?:desktopArchs|desktopPlatforms|goarchForDesktopArch|goosForDesktopPlatform|resolveDesktopFFmpegPath|sha256File|validateFFmpegMetadataInput)\b[^}]*\}\s+from\s+['"]\.\/release-common\.mjs['"]/, label: 'release helper re-export' },
    ],
    scriptTexts: releaseScriptTexts,
  })
}

function validateVerifierHelperBoundaries() {
  const verifierScripts = [
    ...discoverScripts().filter((path) => path.startsWith('scripts/agent/verify-') && path.endsWith('.mjs')),
    'tests/scripts/agent/verify-compact-contract.test.mjs',
    'tests/scripts/agent/verify-context-management.mjs',
    'tests/scripts/agent/verify-run-debugging.mjs',
  ].filter((path) => existsSync(resolve(repoRoot, path)))
  const verifierScriptTexts = new Map([
    'scripts/verifier-utils.mjs',
    ...verifierScripts,
  ].map((path) => [path, readText(resolve(repoRoot, path), path)]))
  assertHelperOwner({
    ownerPath: 'scripts/verifier-utils.mjs',
    patterns: [
      { regex: /\bfunction\s+validateJSONSchemaFixture\b|\bfunction\s+schemaNodeMatches\b/, label: 'JSON schema fixture validator' },
      { regex: /\bfunction\s+schemaValuesEqual\b/, label: 'schema value equality helper' },
      { regex: /\bfunction\s+(?:isRecord|nonEmptyString|asArray)\b/, label: 'static verifier predicate helper' },
      { regex: /\bfunction\s+(?:assertIncludes|assertNotIncludes|assertEqual|assertMinimumOccurrences|assertArrayIncludes|assertSameStringSet)\b/, label: 'static verifier assertion helper' },
    ],
    scriptTexts: verifierScriptTexts,
  })
}

function validateScriptGovernanceTestCoverage() {
  const contractSuite = packageJson.testSuites?.contracts
  if (!Array.isArray(contractSuite)) {
    errors.push('package.json testSuites.contracts must list root static contract verifier tests')
  } else {
    for (const testPath of [
      'tests/scripts/agent/verify-compact-contract.test.mjs',
      'tests/scripts/agent/verify-context-management.test.mjs',
      'tests/scripts/agent/verify-run-debugging.test.mjs',
    ]) {
      if (!contractSuite.includes(testPath)) {
        errors.push(`package.json testSuites.contracts must include ${testPath}`)
      }
    }
  }
  if (!String(packageJson.scripts?.['test:contracts'] ?? '').includes('node scripts/run-node-tests.mjs --suite contracts')) {
    errors.push('package.json scripts.test:contracts must run node scripts/run-node-tests.mjs --suite contracts')
  }
  const scriptSuite = scriptTestSuitePatterns()
  if (!Array.isArray(scriptSuite) || !scriptSuite.includes('tests/scripts/verify-script-manifest.test.mjs')) {
    errors.push('package.json testSuites.scripts must include tests/scripts/verify-script-manifest.test.mjs')
  }
  const runnerEntry = entries.find((entry) => entry.path === 'scripts/run-node-tests.mjs')
  if (!runnerEntry?.tests?.includes('node --test tests/scripts/run-node-tests.test.mjs')) {
    errors.push('scripts/run-node-tests.mjs manifest entry must list its focused script test')
  }
  const verifierEntry = entries.find((entry) => entry.path === 'scripts/verify-script-manifest.mjs')
  if (!verifierEntry?.tests?.includes('node --test tests/scripts/verify-script-manifest.test.mjs')) {
    errors.push('scripts/verify-script-manifest.mjs manifest entry must list its focused script test')
  }
  const verifierUtilsEntry = entries.find((entry) => entry.path === 'scripts/verifier-utils.mjs')
  if (!verifierUtilsEntry?.tests?.includes('node --test tests/scripts/verifier-utils.test.mjs')) {
    errors.push('scripts/verifier-utils.mjs manifest entry must list its focused script test')
  }
}

function validateScriptTestSuiteCoverage() {
  const scriptSuite = scriptTestSuitePatterns()
  if (!Array.isArray(scriptSuite)) {
    errors.push('package.json testSuites.scripts must be an array or an object with a patterns array')
    return
  }
  const scriptTests = discoverScriptTests()
  const covered = new Set()
  for (const pattern of scriptSuite) {
    if (!nonEmptyString(pattern)) {
      errors.push('package.json testSuites.scripts patterns must be non-empty strings')
      continue
    }
    const matches = matchScriptTestPattern(pattern, scriptTests)
    if (!hasGlob(pattern) && pattern.startsWith('tests/scripts/') && matches.length === 0) {
      errors.push(`package.json testSuites.scripts references missing script test ${pattern}`)
    }
    if (hasGlob(pattern) && pattern.startsWith('tests/scripts/') && matches.length === 0) {
      errors.push(`package.json testSuites.scripts pattern matches no script tests: ${pattern}`)
    }
    for (const match of matches) covered.add(match)
  }
  for (const testPath of scriptTests) {
    if (!covered.has(testPath)) {
      errors.push(`package.json testSuites.scripts must include ${testPath}`)
    }
  }
  for (const entry of entries) {
    if (!Array.isArray(entry.tests)) continue
    for (const command of entry.tests) {
      const testPath = parseNodeTestScriptPath(command)
      if (testPath && !existsSync(resolve(repoRoot, testPath))) {
        errors.push(`${entry.path}: test command references missing file ${testPath}`)
      }
    }
  }
}

function validateManifestInvocationLinks() {
  const workspaceCommands = Object.entries(workspacePackageJsonByPath).flatMap(([path, manifest]) => (
    Object.entries(manifest.scripts ?? {}).map(([name, command]) => ({ path, name, command: String(command) }))
  ))
  const releaseEntrypoints = new Set(Object.values(releaseSubcommands ?? {})
    .filter((commandArgs) => Array.isArray(commandArgs))
    .map((commandArgs) => commandArgs[0])
    .filter((value) => typeof value === 'string' && !value.startsWith('builtin:')))
  const releaseScriptTexts = new Map(discoverScripts()
    .filter((path) => path.startsWith('scripts/release/') && path.endsWith('.mjs'))
    .map((path) => [path, readText(resolve(repoRoot, path), path)]))

  for (const entry of entries) {
    if (!nonEmptyString(entry.path)) continue
    const path = entry.path

    if (path.startsWith('apps/') && path.includes('/scripts/')) {
      const parts = path.split('/')
      const packageJsonPath = `${parts[0]}/${parts[1]}/package.json`
      const packageScriptPath = parts.slice(2).join('/')
      const packageManifest = workspacePackageJsonByPath[packageJsonPath]
      if (!packageManifest) {
        errors.push(`${path}: package-local script must belong to a governed workspace package`)
      } else if (!Object.values(packageManifest.scripts ?? {}).some((command) => String(command).includes(packageScriptPath))) {
        errors.push(`${path}: no script in ${packageJsonPath} invokes ${packageScriptPath}`)
      }
    }

    if (path === 'scripts/run-node-tests.mjs' && !workspaceCommands.some(({ command }) => command.includes('scripts/run-node-tests.mjs'))) {
      errors.push('scripts/run-node-tests.mjs: no workspace package script invokes the shared Node test runner')
    }

    if (path === 'scripts/verifier-utils.mjs') {
      const verifierScript = readText(resolve(repoRoot, 'scripts/verify-script-manifest.mjs'), 'scripts/verify-script-manifest.mjs')
      if (!verifierScript.includes('./verifier-utils.mjs')) {
        errors.push('scripts/verifier-utils.mjs: scripts/verify-script-manifest.mjs must import the shared verifier helpers')
      }
    }

    if (path === 'scripts/verify-script-manifest.mjs' && !String(packageJson.scripts?.['verify:scripts'] ?? '').includes(path)) {
      errors.push('scripts/verify-script-manifest.mjs: package.json verify:scripts must invoke the verifier script')
    }

    if (path === 'scripts/release/release-workflow.mjs' && !String(packageJson.scripts?.release ?? '').includes(path)) {
      errors.push('scripts/release/release-workflow.mjs: package.json release must invoke the unified release workflow')
    }

    if (path.startsWith('scripts/release/') && path !== 'scripts/release/release-common.mjs' && path !== 'scripts/release/release-workflow.mjs') {
      if (!releaseEntrypoints.has(path)) {
        errors.push(`${path}: release scripts must be exposed through scripts/script-surfaces.json releaseSubcommands`)
      }
    }

    if (path === 'scripts/release/release-common.mjs') {
      const imported = [...releaseScriptTexts.entries()].some(([scriptPath, text]) => (
        scriptPath !== path && text.includes('./release-common.mjs')
      ))
      if (!imported) {
        errors.push('scripts/release/release-common.mjs: at least one release script must import the shared release helpers')
      }
    }
  }
}

function scriptTestSuitePatterns() {
  return Array.isArray(packageJson.testSuites?.scripts)
    ? packageJson.testSuites.scripts
    : packageJson.testSuites?.scripts?.patterns
}

function discoverScriptTests() {
  const testsRoot = resolve(repoRoot, 'tests/scripts')
  const tests = []
  walk(testsRoot, tests)
  return tests
    .map((path) => relative(repoRoot, path).split(/[/\\]+/).join('/'))
    .filter((path) => path.endsWith('.test.mjs'))
    .sort()
}

function matchScriptTestPattern(pattern, testPaths) {
  if (!pattern.startsWith('tests/scripts/')) return []
  if (!hasGlob(pattern)) return testPaths.includes(pattern) ? [pattern] : []
  const matcher = globToRegExp(pattern)
  return testPaths.filter((path) => matcher.test(path))
}

function parseNodeTestScriptPath(command) {
  const match = /^node --test (tests\/scripts\/\S+\.test\.mjs)$/.exec(command)
  return match?.[1]
}

function assertHelperOwner({ ownerPath, patterns, scriptTexts }) {
  if (!scriptTexts.has(ownerPath)) {
    errors.push(`${ownerPath} must own shared release helper definitions`)
    return
  }
  for (const [path, text] of scriptTexts) {
    if (path === ownerPath) continue
    for (const pattern of patterns) {
      if (pattern.regex.test(text)) {
        errors.push(`${path} must reuse ${ownerPath} for ${pattern.label}`)
      }
    }
  }
}

function discoverScripts() {
  const scripts = []
  for (const root of scriptRoots) {
    walk(resolve(repoRoot, root), scripts)
  }
  return scripts
    .map((path) => relative(repoRoot, path).split(/[/\\]+/).join('/'))
    .sort()
}

function discoverRepositoryScripts() {
  const scripts = []
  walkRepositoryScripts(repoRoot, scripts)
  return scripts
    .map((path) => relative(repoRoot, path).split(/[/\\]+/).join('/'))
    .sort()
}

function discoverPluginExampleScriptFiles() {
  const scripts = []
  walk(resolve(repoRoot, 'packages/plugin-sdk/examples'), scripts)
  return scripts
    .map((path) => relative(repoRoot, path).split(/[/\\]+/).join('/'))
    .filter((path) => path.includes('/scripts/') && scriptExtensions.has(extname(path)))
    .sort()
}

function walk(directory, scripts) {
  if (!existsSync(directory)) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__pycache__') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(path, scripts)
      continue
    }
    if (!entry.isFile()) continue
    if (scriptExtensions.has(extname(entry.name))) scripts.push(path)
  }
}

function walkRepositoryScripts(directory, scripts) {
  if (!existsSync(directory) || shouldSkipRepositoryScriptDirectory(directory)) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      walkRepositoryScripts(path, scripts)
      continue
    }
    if (!entry.isFile()) continue
    if (scriptExtensions.has(extname(entry.name))) scripts.push(path)
  }
}

function shouldSkipRepositoryScriptDirectory(directory) {
  const normalized = relative(repoRoot, directory).split(/[/\\]+/).filter(Boolean).join('/')
  if (!normalized) return false
  const segments = normalized.split('/')
  if (segments.some((segment) => [
    '.git',
    '.gocache',
    '.gomodcache',
    '.pnpm-store',
    '.venv',
    '__pycache__',
    'dist',
    'node_modules',
    'out',
    'release',
    'vendor',
  ].includes(segment))) {
    return true
  }
  return normalized === 'apps/backend/bin' || normalized === 'apps/frontend/movscript-agent'
}

function hasGlob(pattern) {
  return /[*?[\]{}]/.test(pattern)
}

function globToRegExp(pattern) {
  const normalized = pattern.split(/[\\/]+/).join('/')
  let source = '^'
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const next = normalized[index + 1]
    if (char === '*' && next === '*') {
      if (normalized[index + 2] === '/') {
        source += '(?:.*/)?'
        index += 2
      } else {
        source += '.*'
        index += 1
      }
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += escapeRegExp(char)
    }
  }
  source += '$'
  return new RegExp(source)
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    errors.push('manifest entry must be an object')
    return
  }
  const label = typeof entry.path === 'string' ? entry.path : '<missing path>'
  const allowedKeys = ['path', 'category', 'lifecycle', 'owner', 'purpose', 'entrypoint', 'invokedBy', 'tests']
  for (const key of Object.keys(entry)) {
    if (!allowedKeys.includes(key)) errors.push(`${label}: unknown field ${key}`)
  }
  if (!nonEmptyString(entry.path)) errors.push(`${label}: path must be a non-empty string`)
  if (nonEmptyString(entry.path)) {
    const scriptPath = resolve(repoRoot, entry.path)
    if (!existsSync(scriptPath)) {
      errors.push(`${label}: script file does not exist`)
    } else if (statSync(scriptPath).isDirectory()) {
      errors.push(`${label}: path points to a directory, not a script`)
    }
  }
  if (!allowedCategories.has(entry.category)) errors.push(`${label}: category must be one of ${[...allowedCategories].join(', ')}`)
  if (!allowedLifecycles.has(entry.lifecycle)) errors.push(`${label}: lifecycle must be one of ${[...allowedLifecycles].join(', ')}`)
  if (!nonEmptyString(entry.owner)) errors.push(`${label}: owner must be set`)
  if (!nonEmptyString(entry.purpose)) errors.push(`${label}: purpose must be set`)
  if (!nonEmptyString(entry.entrypoint)) errors.push(`${label}: entrypoint must be set`)
  if (!stringArray(entry.invokedBy) || entry.invokedBy.length === 0) errors.push(`${label}: invokedBy must list at least one caller`)
  if (!stringArray(entry.tests)) errors.push(`${label}: tests must be an array of strings`)
  if (entry.path?.endsWith('.test.mjs')) {
    errors.push(`${label}: tests belong under tests/scripts, not the script manifest`)
  }
  if (entry.lifecycle === 'maintained' && Array.isArray(entry.tests) && entry.tests.length === 0) {
    errors.push(`${label}: maintained scripts must list at least one verification command`)
  }
}

function assertSortedUnique(values, label) {
  const seen = new Set()
  let previous = ''
  for (const value of values) {
    if (!nonEmptyString(value)) {
      errors.push(`${label}: every path must be a non-empty string`)
      continue
    }
    if (seen.has(value)) errors.push(`${label}: duplicate path ${value}`)
    seen.add(value)
    if (previous && previous.localeCompare(value) > 0) {
      errors.push(`${label}: paths must be sorted lexicographically`)
      break
    }
    previous = value
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function stringArray(value) {
  return Array.isArray(value) && value.every(nonEmptyString)
}
