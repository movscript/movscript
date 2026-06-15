import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  checkFrontendQuality,
  collectFrontendQualityMetrics,
  formatFrontendQualityDashboard,
} from '../../../apps/frontend/scripts/check-frontend-quality.mjs'

test('frontend quality dashboard summarizes file size and boundary counts', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/features/sample/components/SamplePanel.tsx', [
      "export function SamplePanel() {",
      "  window.dispatchEvent(new CustomEvent('sample'))",
      "  return <button />",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/sample/application/sampleQuery.ts', [
      "queryClient.invalidateQueries({ queryKey: ['sample'] })",
      "useQuery({ queryKey: ['sample', id] })",
    ].join('\n'))

    const metrics = collectFrontendQualityMetrics(root, { topLimit: 3 })
    const dashboard = formatFrontendQualityDashboard(metrics)

    assert.equal(metrics.featureComponentCounts.windowDispatchEvent, 1)
    assert.equal(metrics.counts.queryKeyLiteral, 2)
    assert.deepEqual(metrics.invalidationTargets, [{ target: "['sample']", count: 1 }])
    assert.match(dashboard, /Frontend quality dashboard/)
    assert.match(dashboard, /Feature component counts:/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check fails only when debt grows past baseline', async () => {
  const root = await createFrontendFixture()
  try {
    const source = [
      "export function OversizedPanel() {",
      "  void window.api?.setAppSettings?.({})",
      "  window.localStorage.setItem('key', 'value')",
      "  return null",
      "}",
      ...Array.from({ length: 805 }, (_, index) => `// line ${index}`),
    ].join('\n')
    await writeFixtureFile(root, 'src/features/sample/components/OversizedPanel.tsx', source)

    const failed = checkFrontendQuality(root, {
      largeTsxBaseline: {},
      featureComponentBoundaryBaseline: {},
    })
    assert.ok(failed.failures.some((item) => item.includes('Production TSX file exceeds 800 lines')))
    assert.ok(failed.failures.some((item) => item.includes('windowApi 1 > 0')))
    assert.ok(failed.failures.some((item) => item.includes('localStorage 1 > 0')))

    const passed = checkFrontendQuality(root, {
      largeTsxBaseline: {
        'src/features/sample/components/OversizedPanel.tsx': 811,
      },
      featureComponentBoundaryBaseline: {
        'src/features/sample/components/OversizedPanel.tsx': {
          windowApi: 1,
          localStorage: 1,
        },
      },
    })
    assert.deepEqual(passed.failures, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects resource query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/features/resources/application/resourceQueryKeys.ts', [
      "export const resourceKeys = {",
      "  all: ['resources'] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/sample/components/ResourceList.tsx', [
      "export function ResourceList() {",
      "  useQuery({ queryKey: ['resources'], queryFn: loadResources })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('Resource query key literal must use resourceQueryKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects shot library query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/features/shot-library/application/shotLibraryQueryKeys.ts', [
      "export const shotLibraryKeys = {",
      "  references: ['shot-references'] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/shot-library/components/ShotList.tsx', [
      "export function ShotList() {",
      "  useQuery({ queryKey: ['shot-references'], queryFn: loadShots })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('Shot library query key literal must use shotLibraryKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects canvas query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/features/canvas/application/canvasQueryKeys.ts', [
      "export const canvasKeys = {",
      "  all: ['canvases'] as const,",
      "  detail: (id) => ['canvas', id] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/canvas/components/CanvasPanel.tsx', [
      "export function CanvasPanel() {",
      "  useQuery({ queryKey: ['canvas', id], queryFn: loadCanvas })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('Canvas query key literal must use canvasKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects script query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/features/scripts/application/scriptQueryKeys.ts', [
      "export const scriptKeys = {",
      "  versions: (projectId) => ['semantic-script-versions', projectId] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/scripts/components/ScriptsPanel.tsx', [
      "export function ScriptsPanel() {",
      "  useQuery({ queryKey: ['scripts', projectId], queryFn: loadScripts })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('Script query key literal must use scriptKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects job query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/features/jobs/application/jobQueryKeys.ts', [
      "export const jobKeys = {",
      "  all: ['jobs'] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/jobs/components/JobsPanel.tsx', [
      "export function JobsPanel() {",
      "  useQuery({ queryKey: ['jobs'], queryFn: loadJobs })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('Job query key literal must use jobKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects organization query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/features/organization/application/organizationQueryKeys.ts', [
      "export const organizationKeys = {",
      "  detail: (orgId) => ['org', orgId] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/organization/components/OrgPanel.tsx', [
      "export function OrgPanel() {",
      "  useQuery({ queryKey: ['org', orgId], queryFn: loadOrg })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('Organization query key literal must use organizationKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects project query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/features/project/application/projectQueries.ts', [
      "export const projectKeys = {",
      "  all: ['projects'] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/project/components/ProjectPanel.tsx', [
      "export function ProjectPanel() {",
      "  queryClient.removeQueries({ queryKey: ['projects'] })",
      "  useQuery({ queryKey: ['project', projectId], queryFn: loadProject })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('Project query key literal must use projectKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects auth query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/features/auth/application/authQueryKeys.ts', [
      "export const authKeys = {",
      "  config: ['auth', 'config'] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/auth/components/AuthPanel.tsx', [
      "export function AuthPanel() {",
      "  useQuery({ queryKey: ['auth', 'config'], queryFn: loadConfig })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('Auth query key literal must use authKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects project standards query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/features/project-standards/application/projectStandardsQueryKeys.ts', [
      "export const projectStandardsKeys = {",
      "  workspaceArtifacts: (projectId) => ['project-workspace-artifacts', projectId] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/project-standards/components/StandardsPanel.tsx', [
      "export function StandardsPanel() {",
      "  useQuery({ queryKey: ['project-workspace-artifacts', projectId], queryFn: loadArtifacts })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('Project standards query key literal must use projectStandardsKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects model query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/shared/application/modelQueryKeys.ts', [
      "export const modelKeys = {",
      "  capability: (capability) => ['models', capability] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/agent/application/agentModelQueryKeys.ts', [
      "export const agentModelKeys = {",
      "  backendCatalog: () => ['models', 'agent-backend'] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/canvas/components/ModelPanel.tsx', [
      "export function ModelPanel() {",
      "  useQuery({ queryKey: ['models', capability], queryFn: loadModels })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('Model query key literal must use modelKeys or agentModelKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects agent query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/features/agent/application/agentQueryKeys.ts', [
      "export const agentSettingsKeys = {",
      "  skillCatalog: (profileId, baseURL) => ['agent-settings-skill-catalog', profileId, baseURL] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/agent/components/AgentPanel.tsx', [
      "export function AgentPanel() {",
      "  useQuery({ queryKey: ['embedded-browser-navigation', projectId, 'settings'], queryFn: loadSettings })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('Agent query key literal must use agentQueryKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects semantic entity query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/shared/application/semanticEntityQueryKeys.ts', [
      "export const semanticEntityKeys = {",
      "  inlineSettings: (projectId) => ['semantic-inline-editor', projectId, 'settings'] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/shared/ui/SemanticEditor.tsx', [
      "export function SemanticEditor() {",
      "  useQuery({ queryKey: ['semantic-source-lock', projectId, config.kind, recordId], queryFn: loadLock })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('Semantic entity query key literal must use semanticEntityKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects provider session query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/features/agent/application/providerSessionQueryKeys.ts', [
      "export const providerSessionThreadKeys = {",
      "  console: ['agent-console-threads', 'provider-sessions'] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/agent/components/ThreadList.tsx', [
      "export function ThreadList() {",
      "  useQuery({ queryKey: ['provider-session-threads', baseURL, identity, 'agent-mode-sidebar'], queryFn: loadThreads })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('Provider session query key literal must use providerSessionQueryKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('frontend quality check rejects MovScript workspace query key literals outside the factory', async () => {
  const root = await createFrontendFixture()
  try {
    await writeFixtureFile(root, 'src/features/agent/application/movScriptWorkspaceQueryKeys.ts', [
      "export const movScriptWorkspaceKeys = {",
      "  root: ['movscript-workspace-root'] as const,",
      "}",
    ].join('\n'))
    await writeFixtureFile(root, 'src/features/agent/components/WorkspaceFiles.tsx', [
      "export function WorkspaceFiles() {",
      "  useQuery({ queryKey: ['movscript-workspace-files', path], queryFn: loadFiles })",
      "  return null",
      "}",
    ].join('\n'))

    const result = checkFrontendQuality(root)

    assert.ok(result.failures.some((item) => item.includes('MovScript workspace query key literal must use movScriptWorkspaceKeys factory')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function createFrontendFixture() {
  return mkdtemp(join(tmpdir(), 'movscript-frontend-quality-'))
}

async function writeFixtureFile(root, path, contents) {
  const file = join(root, path)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, contents)
}
