#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { homedir, tmpdir } from 'node:os'
import { startProjectService } from '../services/project-service/src/server.mjs'
import { sourceFileEntries } from '../packages/interpreter/tests/helpers.mjs'

const env = process.env
const movScriptHome = resolve(env.MOVSCRIPT_HOME || join(homedir(), '.movscript'))
const useFixture = env.MOVSCRIPT_PROJECT_BENCHMARK_FIXTURE === '1'
  || env.MOVSCRIPT_PROJECT_BENCHMARK_FIXTURE === 'true'
let fixtureRuntime
let fixtureProjectDir
const benchmarkServerLogs = []
let benchmarkRequestSequence = 0
const explicitProjectServiceURL = normalizeBaseURL(env.MOVSCRIPT_PROJECT_SERVICE_URL || env.PROJECT_SERVICE_URL)
let projectServiceURL = explicitProjectServiceURL || normalizeBaseURL(readEndpointURL('movscript.project.service'))
const dataServiceBaseURL = normalizeBaseURL(
  env.MOVSCRIPT_DATA_SERVICE_BASE_URL
    || env.MOVSCRIPT_DATA_SERVICE_URL
    || readEndpointURL('movscript.data.service'),
)

if (useFixture) {
  fixtureProjectDir = createBenchmarkProjectFixture()
  if (!explicitProjectServiceURL) {
    fixtureRuntime = await startProjectService({
      logger: (event) => benchmarkServerLogs.push(event),
    })
    projectServiceURL = fixtureRuntime.url
  }
}

const projectDir = resolve(
  env.MOVSCRIPT_PROJECT_DIR
    || env.PROJECT_DIR
    || fixtureProjectDir
    || readDesktopCurrentProjectDir()
    || '',
)
const projectMetadata = readProjectMetadata(projectDir)
const projectUid = env.MOVSCRIPT_PROJECT_UID
  || env.PROJECT_UID
  || projectMetadata?.projectUid
const contentUnitId = env.MOVSCRIPT_CONTENT_UNIT_ID || findFirstContentUnitId(projectDir)
const runs = positiveInteger(env.MOVSCRIPT_PROJECT_BENCHMARK_RUNS, 5)
const resourceViewKind = env.MOVSCRIPT_PROJECT_RESOURCE_VIEW_KIND || 'scripts'
const decisionStore = createBenchmarkDecisionStore()

if (!projectServiceURL) {
  fail('Project Service URL is required. Set MOVSCRIPT_PROJECT_SERVICE_URL or start the local daemon.')
}
if (!projectDir || projectDir === resolve('')) {
  fail('Project dir is required. Set MOVSCRIPT_PROJECT_DIR or open a project in Desktop first.')
}
if (!contentUnitId) {
  console.warn(`No content unit found under ${projectDir}. Prompt and candidate tasks will be skipped.`)
}

const sharedBody = {
  projectDir,
  movScriptHomeDir: movScriptHome,
  projectUid,
  decisionStore,
  ...(dataServiceBaseURL ? { dataServiceBaseURL } : {}),
}
const tasks = [
  {
    name: 'source-overview',
    request: () => postJSON('/v1/project/source/overview', { projectDir }),
  },
  {
    name: 'home-read-model',
    request: () => postJSON('/v1/project/home/read-model', { projectDir }),
  },
  {
    name: 'standards-read-model',
    request: () => postJSON('/v1/project/standards/read-model', { projectDir }),
  },
  {
    name: 'scripts-read-model',
    request: () => postJSON('/v1/project/scripts/read-model', { projectDir }),
  },
  {
    name: 'content-canvas-read-model',
    request: () => postJSON('/v1/project/content-canvas/read-model', {
      projectDir,
      ...(projectMetadata?.projectId ? { projectId: projectMetadata.projectId } : {}),
    }),
  },
  {
    name: 'interpret',
    request: () => postJSON('/v1/project/source/interpret', { projectDir }),
  },
  {
    name: 'read-model',
    request: () => postJSON('/v1/project/read-model', { projectDir }),
  },
  {
    name: `resource-view:${resourceViewKind}`,
    request: () => postJSON('/v1/project/resources/view', {
      projectDir,
      kind: resourceViewKind,
    }),
  },
]
if (contentUnitId) {
  tasks.push({
    name: 'prompt-context:backend',
    request: () => postJSON('/v1/project/prompt/context', {
      projectDir,
      contentUnitId,
      include: ['backendPrompt'],
    }),
  })
  tasks.push({
    name: 'content-units-read-model',
    request: () => postJSON('/v1/project/content-units/read-model', {
      ...sharedBody,
      contentUnitIds: [contentUnitId],
    }),
  })
}
if (contentUnitId && decisionStore) {
  tasks.push(
    {
      name: 'candidate-view',
      request: () => postJSON('/v1/project/candidates/view', {
        ...sharedBody,
        contentUnitId,
      }),
    },
    {
      name: 'interpret+candidate-view',
      request: async () => {
        const started = performance.now()
        const interpret = await postJSON('/v1/project/source/interpret', { projectDir })
        const candidate = await postJSON('/v1/project/candidates/view', {
          ...sharedBody,
          contentUnitId,
        })
        return {
          ok: interpret.ok && candidate.ok,
          status: `${interpret.status}/${candidate.status}`,
          elapsedMs: performance.now() - started,
          summary: {
            interpret: interpret.summary,
            candidate: candidate.summary,
          },
          error: interpret.error || candidate.error,
        }
      },
    },
  )
}

const results = []
for (const task of tasks) {
  const taskRuns = []
  for (let index = 0; index < runs; index += 1) {
    taskRuns.push({
      run: index + 1,
      ...(await task.request()),
    })
  }
  results.push(summarizeTask(task.name, taskRuns))
}

console.log(JSON.stringify({
  schema: 'movscript.project-service-performance-benchmark.v1',
  createdAt: new Date().toISOString(),
  movScriptHome,
  projectServiceURL,
  dataServiceBaseURL,
  projectDir,
  projectUid,
  contentUnitId,
  resourceViewKind,
  runs,
  results,
}, null, 2))

if (fixtureRuntime) {
  await fixtureRuntime.close()
}
if (fixtureProjectDir) {
  rmSync(fixtureProjectDir, { recursive: true, force: true })
}

async function postJSON(path, body) {
  const started = performance.now()
  const requestId = `bench_${Date.now().toString(36)}_${++benchmarkRequestSequence}`
  const response = await fetch(`${projectServiceURL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const elapsedMs = performance.now() - started
  const json = parseJSON(text)
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      elapsedMs,
      sizeBytes: text.length,
      requestId,
      serverMetrics: serverMetricsForRequest(requestId),
      error: json?.error,
      message: json?.message || text.slice(0, 240),
    }
  }
  return {
    ok: true,
    status: response.status,
    elapsedMs,
    sizeBytes: text.length,
    requestId,
    serverMetrics: serverMetricsForRequest(requestId),
    schema: json?.schema,
    summary: summarizeResponse(json),
  }
}

function summarizeTask(name, taskRuns) {
  const warmRuns = taskRuns.slice(1).filter((run) => run.ok)
  const warmDurations = warmRuns.map((run) => run.elapsedMs).sort((left, right) => left - right)
  return {
    name,
    coldMs: round(taskRuns[0]?.elapsedMs),
    warmP50Ms: percentile(warmDurations, 0.5),
    warmP95Ms: percentile(warmDurations, 0.95),
    runs: taskRuns.map((run) => ({
      run: run.run,
      ok: run.ok,
      status: run.status,
      ms: round(run.elapsedMs),
      sizeBytes: run.sizeBytes,
      serverMetrics: run.serverMetrics,
      error: run.error,
      summary: run.summary,
    })),
  }
}

function serverMetricsForRequest(requestId) {
  const event = benchmarkServerLogs.find((item) => item?.requestId === requestId)
  if (!event) return undefined
  return {
    endpoint: event.endpoint,
    routeKind: event.routeKind,
    durationMs: event.durationMs,
    indexLoadMs: event.indexLoadMs,
    deriveMs: event.deriveMs,
    decisionMs: event.decisionMs,
    cacheHit: event.cacheHit,
    responseBytes: event.responseBytes,
  }
}

function summarizeResponse(json) {
  if (!json || typeof json !== 'object') return undefined
  if (json.interpretation) {
    return {
      diagnostics: json.interpretation.diagnostics?.length ?? 0,
      artifacts: Object.keys(json.interpretation.artifacts ?? {}).length,
    }
  }
  if (json.projectReadModel) {
    return {
      documents: json.projectReadModel.sourceSummary?.documentCount,
      timelineAssemblies: json.projectReadModel.projectTimelineStatus?.timeline_assembly_count,
    }
  }
  if (json.projectHomeReadModel) {
    return {
      documents: json.projectHomeReadModel.workspace?.documentCount,
      scripts: json.projectHomeReadModel.counts?.scripts,
      contentUnits: json.projectHomeReadModel.counts?.contentUnits,
      total: json.projectHomeReadModel.counts?.total,
    }
  }
  if (json.projectStandardsReadModel) {
    return {
      documents: json.projectStandardsReadModel.workspace?.documentCount,
      settings: json.projectStandardsReadModel.counts?.settings,
      assetSlots: json.projectStandardsReadModel.counts?.assetSlots,
      total: json.projectStandardsReadModel.counts?.total,
    }
  }
  if (json.projectScriptsReadModel) {
    return {
      documents: json.projectScriptsReadModel.workspace?.documentCount,
      scripts: json.projectScriptsReadModel.counts?.scripts,
      versions: json.projectScriptsReadModel.counts?.versions,
      total: json.projectScriptsReadModel.counts?.total,
    }
  }
  if (json.projectContentUnitsReadModel) {
    return {
      contentUnits: json.projectContentUnitsReadModel.counts?.contentUnits,
      candidates: json.projectContentUnitsReadModel.counts?.candidates,
      selected: json.projectContentUnitsReadModel.counts?.selected,
    }
  }
  if (json.projectContentCanvasReadModel) {
    return {
      documents: json.projectContentCanvasReadModel.workspace?.documentCount,
      contentUnits: json.projectContentCanvasReadModel.counts?.contentUnits,
      candidates: json.projectContentCanvasReadModel.counts?.candidates,
      editingProjects: json.projectContentCanvasReadModel.counts?.editingProjects,
    }
  }
  if (json.backendPrompt || json.generationPrompt) {
    return {
      contentUnitId: json.contentUnitId,
      contexts: json.contexts?.length,
      hasBackendPrompt: Boolean(json.backendPrompt),
      blockers: json.backendPrompt?.blockers?.length ?? json.backendPrompt?.prompt?.blockers?.length,
    }
  }
  if (Array.isArray(json.items)) return { items: json.items.length }
  if (Array.isArray(json.contexts)) {
    return {
      contexts: json.contexts.length,
      candidates: json.contexts.reduce((sum, context) => sum + (context?.candidates?.length ?? 0), 0),
    }
  }
  if (json.overview) {
    return {
      documents: json.overview.source?.documentCount,
      readyToInterpret: json.overview.source?.readyToInterpret,
      staleContentUnits: json.overview.regeneration?.staleContentUnits,
    }
  }
  return undefined
}

function percentile(values, fraction) {
  if (values.length === 0) return undefined
  const index = Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)
  return round(values[index])
}

function round(value) {
  return value === undefined ? undefined : Math.round(value * 10) / 10
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function readEndpointURL(serviceName) {
  const path = join(movScriptHome, 'runtime', 'endpoints', `${serviceName}.json`)
  const endpoint = readJSONFile(path)
  return endpoint?.url || endpoint?.baseURL
}

function readDesktopCurrentProjectDir() {
  const state = readJSONFile(join(movScriptHome, 'desktop-state', 'movscript-project.json'))
  const value = parseJSON(state?.value)
  return value?.state?.workspaceRoot
    || value?.state?.current?.project_path
    || value?.state?.current?.projectPath
    || value?.state?.current?.workspace_path
    || value?.state?.current?.workspacePath
}

function readProjectMetadata(root) {
  if (!root || root === resolve('')) return undefined
  const workspace = readJSONFile(join(root, 'workspace.json'))
  const project = readJSONFile(join(root, 'project.json'))
  const projectUid = workspace?.project_uid ?? workspace?.projectUid ?? project?.project_uid ?? project?.projectUid
  const projectId = workspace?.project_id ?? workspace?.projectId ?? project?.project_id ?? project?.projectId
  const title = workspace?.title ?? project?.title
  return {
    ...(projectUid !== undefined && projectUid !== null ? { projectUid: String(projectUid) } : {}),
    ...(projectId !== undefined && projectId !== null ? { projectId: String(projectId) } : {}),
    ...(title !== undefined && title !== null ? { title: String(title) } : {}),
  }
}

function createBenchmarkDecisionStore() {
  if (!dataServiceBaseURL || !projectUid) return undefined
  const scopeKind = env.MOVSCRIPT_PROJECT_SCOPE_KIND === 'org' ? 'org' : 'user'
  const scopeId = env.MOVSCRIPT_PROJECT_SCOPE_ID || (scopeKind === 'user' ? '1' : undefined)
  if (!scopeId) return undefined
  return {
    kind: 'scoped-project-data',
    baseUrl: dataServiceBaseURL,
    projectUid,
    ...(projectMetadata?.title ? { title: projectMetadata.title } : {}),
    scopeKind,
    scopeId,
  }
}

function createBenchmarkProjectFixture() {
  const root = mkdtempInTmp()
  for (const [relativePath, content] of sourceFileEntries()) {
    const target = join(root, relativePath)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }
  return root
}

function mkdtempInTmp() {
  const prefix = join(tmpdir(), 'movscript-project-service-benchmark-')
  let index = 0
  while (index < 1000) {
    const candidate = `${prefix}${Date.now()}-${process.pid}-${index}`
    index += 1
    if (existsSync(candidate)) continue
    mkdirSync(candidate, { recursive: true })
    return candidate
  }
  fail('Unable to create benchmark fixture directory')
}

function findFirstContentUnitId(root) {
  const directory = join(root, 'content_units')
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return undefined
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const record = readJSONFile(join(directory, entry.name, 'content_unit.json'))
    const id = record?.id ?? record?.ID
    if (id !== undefined && id !== null) return String(id)
  }
  return undefined
}

function readJSONFile(path) {
  try {
    return parseJSON(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

function parseJSON(value) {
  if (typeof value !== 'string') return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function normalizeBaseURL(value) {
  if (!value) return undefined
  try {
    const url = new URL(String(value).replace(/\/+$/, ''))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.toString().replace(/\/+$/, '')
  } catch {
    return undefined
  }
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
