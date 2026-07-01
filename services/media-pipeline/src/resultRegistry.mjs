import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export function createInMemoryMediaPipelineResultRegistry(options = {}) {
  const results = options.results instanceof Map ? options.results : new Map()

  return {
    async registerResult(input = {}) {
      const current = normalizeMediaPipelineResult(input)
      const previous = results.get(current.resultId)
      const result = previous
        ? normalizeMediaPipelineResult({
          ...previous,
          ...current,
          createdAt: previous.createdAt,
          created_at: previous.createdAt,
          updatedAt: current.updatedAt,
          updated_at: current.updatedAt,
        })
        : current
      results.set(result.resultId, result)
      return cloneResult(result)
    },
    async getResult(resultId) {
      const result = results.get(String(resultId ?? '').trim())
      return result ? cloneResult(result) : null
    },
    async listResults(filter = {}) {
      const projectId = stringValue(filter.projectId ?? filter.project_id)
      const taskId = stringValue(filter.taskId ?? filter.task_id)
      const backend = stringValue(filter.backend)
      const kind = stringValue(filter.kind ?? filter.outputKind ?? filter.output_kind)
      const status = stringValue(filter.status)
      const limit = positiveInteger(filter.limit) ?? 100
      const matched = []
      for (const result of results.values()) {
        if (projectId && result.projectId !== projectId) continue
        if (taskId && result.taskId !== taskId) continue
        if (backend && result.backend !== backend) continue
        if (kind && result.kind !== kind && result.outputKind !== kind) continue
        if (status && result.status !== status) continue
        matched.push(cloneResult(result))
        if (matched.length >= limit) break
      }
      return matched
    },
  }
}

export function createFileMediaPipelineResultRegistry(options = {}) {
  const env = options.env ?? process.env
  const filePath = resultRegistryFilePath({ ...options, env })
  const results = options.results instanceof Map ? options.results : new Map()
  let loaded = false
  let loadPromise
  let writeQueue = Promise.resolve()

  return {
    filePath,
    async registerResult(input = {}) {
      await ensureLoaded()
      const current = normalizeMediaPipelineResult(input)
      const previous = results.get(current.resultId)
      const result = previous
        ? normalizeMediaPipelineResult({
          ...previous,
          ...current,
          createdAt: previous.createdAt,
          created_at: previous.createdAt,
          updatedAt: current.updatedAt,
          updated_at: current.updatedAt,
        })
        : current
      results.set(result.resultId, result)
      await persist()
      return cloneResult(result)
    },
    async getResult(resultId) {
      await ensureLoaded()
      const result = results.get(String(resultId ?? '').trim())
      return result ? cloneResult(result) : null
    },
    async listResults(filter = {}) {
      await ensureLoaded()
      const projectId = stringValue(filter.projectId ?? filter.project_id)
      const taskId = stringValue(filter.taskId ?? filter.task_id)
      const backend = stringValue(filter.backend)
      const kind = stringValue(filter.kind ?? filter.outputKind ?? filter.output_kind)
      const status = stringValue(filter.status)
      const limit = positiveInteger(filter.limit) ?? 100
      const matched = []
      for (const result of results.values()) {
        if (projectId && result.projectId !== projectId) continue
        if (taskId && result.taskId !== taskId) continue
        if (backend && result.backend !== backend) continue
        if (kind && result.kind !== kind && result.outputKind !== kind) continue
        if (status && result.status !== status) continue
        matched.push(cloneResult(result))
        if (matched.length >= limit) break
      }
      return matched
    },
  }

  async function ensureLoaded() {
    if (loaded) return
    if (!loadPromise) {
      loadPromise = (async () => {
        try {
          const source = await readFile(filePath, 'utf8')
          const snapshot = JSON.parse(source)
          const storedResults = Array.isArray(snapshot?.results) ? snapshot.results : []
          results.clear()
          for (const item of storedResults) {
            const result = normalizeMediaPipelineResult(item)
            results.set(result.resultId, result)
          }
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error
        }
        loaded = true
      })()
    }
    await loadPromise
  }

  async function persist() {
    const write = async () => {
      const now = new Date().toISOString()
      const snapshot = {
        schema: 'movscript.media-pipeline-result-registry.v1',
        version: 1,
        updatedAt: now,
        updated_at: now,
        results: [...results.values()].map(cloneResult),
      }
      await mkdir(dirname(filePath), { recursive: true })
      const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
      await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
      await rename(tempPath, filePath)
    }
    writeQueue = writeQueue.then(write, write)
    await writeQueue
  }
}

export function resultRegistryFilePath(options = {}) {
  const env = options.env ?? process.env
  const explicit = stringValue(options.filePath ?? options.registryPath ?? env.MOVSCRIPT_MEDIA_PIPELINE_RESULT_REGISTRY_PATH)
  if (explicit) return explicit
  const homeDir = stringValue(options.homeDir ?? env.MOVSCRIPT_HOME)
  const root = homeDir
    ? join(homeDir, 'media-workspaces', 'results')
    : join(tmpdir(), 'movscript-media-pipeline', 'results')
  return join(root, 'registry.json')
}

export function mediaPipelineResultFromTask({ task, request } = {}) {
  const taskRecord = recordValue(task) ?? {}
  const requestRecord = recordValue(request) ?? {}
  const output = recordValue(requestRecord.output) ?? {}
  const taskType = stringValue(taskRecord.taskType ?? taskRecord.task_type)
  const outputFormat = stringValue(output.format)
  const kind = taskType === 'timeline_hls' || outputFormat === 'hls'
    ? 'hls'
    : outputFormat ?? 'mp4'
  const backend = stringValue(requestRecord.backend ?? requestRecord.backend_kind ?? output.backend ?? output.backend_kind)
    ?? (taskType === 'timeline_render' || taskType === 'timeline_hls' ? 'media_editing_project' : 'media_pipeline')
  const resultId = stringValue(output.resultId ?? output.result_id)
    ?? `${stringValue(taskRecord.taskId ?? taskRecord.task_id) ?? 'media-task'}.${kind}`
  const hlsManifestPath = stringValue(taskRecord.hlsManifestPath ?? taskRecord.hls_manifest_path)
  const outputPath = stringValue(taskRecord.outputPath ?? taskRecord.output_path)

  return {
    resultId,
    projectId: stringValue(taskRecord.projectId ?? taskRecord.project_id),
    taskId: stringValue(taskRecord.taskId ?? taskRecord.task_id),
    backend,
    kind,
    status: 'available',
    source: 'media_pipeline_task',
    outputPath,
    outputName: stringValue(taskRecord.outputName ?? taskRecord.output_name),
    hlsManifestPath,
    hlsDirectory: stringValue(taskRecord.hlsDirectory ?? taskRecord.hls_directory),
    hlsSegmentPaths: stringArrayValue(taskRecord.hlsSegmentPaths ?? taskRecord.hls_segment_paths),
    hlsVariants: Array.isArray(taskRecord.hlsVariants) ? taskRecord.hlsVariants : taskRecord.hls_variants,
    resourceId: taskRecord.outputResourceId ?? taskRecord.output_resource_id,
    streamId: taskRecord.streamId ?? taskRecord.stream_id,
    metadata: {
      task_type: taskType,
      output_format: outputFormat,
      ...(recordValue(output) ? { output } : {}),
    },
    artifacts: taskResultArtifacts({ kind, outputPath, hlsManifestPath, task: taskRecord }),
  }
}

export function normalizeMediaPipelineResult(input = {}) {
  const raw = recordValue(input.result) ?? recordValue(input) ?? {}
  const now = new Date().toISOString()
  const projectId = stringValue(raw.projectId ?? raw.project_id)
  const taskId = stringValue(raw.taskId ?? raw.task_id)
  const kind = stringValue(raw.kind ?? raw.outputKind ?? raw.output_kind ?? raw.format) ?? 'artifact'
  const outputKind = stringValue(raw.outputKind ?? raw.output_kind) ?? kind
  const generatedId = [projectId, taskId, kind, Date.now()].filter(Boolean).join(':')
  const resultId = stringValue(raw.resultId ?? raw.result_id)
    ?? (generatedId || `media-pipeline-result:${Date.now()}`)
  const createdAt = stringValue(raw.createdAt ?? raw.created_at) ?? now
  const updatedAt = stringValue(raw.updatedAt ?? raw.updated_at) ?? now
  const outputPath = stringValue(raw.outputPath ?? raw.output_path ?? raw.path)
  const outputName = stringValue(raw.outputName ?? raw.output_name ?? raw.name)
  const hlsManifestPath = stringValue(raw.hlsManifestPath ?? raw.hls_manifest_path ?? raw.manifestPath ?? raw.manifest_path)
  const hlsDirectory = stringValue(raw.hlsDirectory ?? raw.hls_directory)
  const hlsSegmentPaths = stringArrayValue(raw.hlsSegmentPaths ?? raw.hls_segment_paths ?? raw.segmentPaths ?? raw.segment_paths)
  const hlsVariants = Array.isArray(raw.hlsVariants) ? raw.hlsVariants : (Array.isArray(raw.hls_variants) ? raw.hls_variants : undefined)
  const resourceId = raw.resourceId ?? raw.resource_id ?? raw.outputResourceId ?? raw.output_resource_id
  const streamId = raw.streamId ?? raw.stream_id
  const candidateId = raw.candidateId ?? raw.candidate_id
  const artifacts = Array.isArray(raw.artifacts)
    ? raw.artifacts
    : taskResultArtifacts({ kind, outputPath, hlsManifestPath, task: raw })

  return compactRecord({
    schema: 'movscript.media-pipeline-result.v1',
    resultId,
    result_id: resultId,
    projectId,
    project_id: projectId,
    taskId,
    task_id: taskId,
    backend: stringValue(raw.backend) ?? 'media_pipeline',
    kind,
    outputKind,
    output_kind: outputKind,
    status: stringValue(raw.status) ?? 'available',
    source: stringValue(raw.source) ?? 'manual_register',
    outputPath,
    output_path: outputPath,
    outputName,
    output_name: outputName,
    hlsManifestPath,
    hls_manifest_path: hlsManifestPath,
    hlsDirectory,
    hls_directory: hlsDirectory,
    hlsSegmentPaths,
    hls_segment_paths: hlsSegmentPaths,
    hlsVariants,
    hls_variants: hlsVariants,
    resourceId,
    resource_id: resourceId,
    streamId,
    stream_id: streamId,
    candidateId,
    candidate_id: candidateId,
    artifacts,
    provenance: recordValue(raw.provenance),
    metadata: recordValue(raw.metadata),
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
  })
}

function taskResultArtifacts({ kind, outputPath, hlsManifestPath, task }) {
  const artifacts = []
  const outputName = stringValue(task?.outputName ?? task?.output_name)
  if (outputPath) {
    artifacts.push(compactRecord({
      kind,
      path: outputPath,
      name: outputName,
    }))
  }
  if (hlsManifestPath && hlsManifestPath !== outputPath) {
    artifacts.push({
      kind: 'hls_manifest',
      path: hlsManifestPath,
    })
  }
  const segmentPaths = stringArrayValue(task?.hlsSegmentPaths ?? task?.hls_segment_paths ?? task?.segmentPaths ?? task?.segment_paths) ?? []
  for (const path of segmentPaths) {
    artifacts.push({
      kind: 'hls_segment',
      path,
    })
  }
  return artifacts
}

function cloneResult(result) {
  return JSON.parse(JSON.stringify(result))
}

function compactRecord(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function recordValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringArrayValue(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : undefined
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}
