import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'

export function createInMemoryMediaPipelineResultWatchRegistry(options = {}) {
  const watches = options.watches instanceof Map ? options.watches : new Map()
  const timers = new Map()
  const resultRegistry = options.resultRegistry

  return createResultWatchRegistryCore({
    watches,
    timers,
    resultRegistry,
    persist: async () => {},
    ensureLoaded: async () => {},
  })
}

export function createFileMediaPipelineResultWatchRegistry(options = {}) {
  const env = options.env ?? process.env
  const filePath = resultWatchRegistryFilePath({ ...options, env })
  const watches = options.watches instanceof Map ? options.watches : new Map()
  const timers = new Map()
  let loaded = false
  let loadPromise
  let writeQueue = Promise.resolve()

  const core = createResultWatchRegistryCore({
    watches,
    timers,
    resultRegistry: options.resultRegistry,
    persist,
    ensureLoaded,
  })

  return {
    filePath,
    ...core,
  }

  async function ensureLoaded() {
    if (loaded) return
    if (!loadPromise) {
      loadPromise = (async () => {
        try {
          const source = await readFile(filePath, 'utf8')
          const snapshot = JSON.parse(source)
          const storedWatches = Array.isArray(snapshot?.watches) ? snapshot.watches : []
          watches.clear()
          for (const item of storedWatches) {
            const watch = normalizeResultWatch(item, { preserveTimestamps: true })
            watches.set(watch.watchId, watch)
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
        schema: 'movscript.media-pipeline-result-watch-registry.v1',
        version: 1,
        updatedAt: now,
        updated_at: now,
        watches: [...watches.values()].map(cloneRecord),
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

export function resultWatchRegistryFilePath(options = {}) {
  const env = options.env ?? process.env
  const explicit = stringValue(options.filePath ?? options.registryPath ?? env.MOVSCRIPT_MEDIA_PIPELINE_RESULT_WATCH_REGISTRY_PATH)
  if (explicit) return explicit
  const homeDir = stringValue(options.homeDir ?? env.MOVSCRIPT_HOME)
  const root = homeDir
    ? join(homeDir, 'media-workspaces', 'results')
    : join(tmpdir(), 'movscript-media-pipeline', 'results')
  return join(root, 'watch-registry.json')
}

function createResultWatchRegistryCore({ watches, timers, resultRegistry, persist, ensureLoaded }) {
  return {
    async createWatch(input = {}) {
      await ensureLoaded()
      const watch = normalizeResultWatch(recordValue(input.watch) ?? input)
      assertWatchTarget(watch)
      watches.set(watch.watchId, watch)
      await persist()
      startWatch(watch.watchId)
      return cloneRecord(watch)
    },
    async getWatch(watchId) {
      await ensureLoaded()
      const watch = watches.get(String(watchId ?? '').trim())
      return watch ? cloneRecord(watch) : null
    },
    async listWatches(filter = {}) {
      await ensureLoaded()
      const projectId = stringValue(filter.projectId ?? filter.project_id)
      const taskId = stringValue(filter.taskId ?? filter.task_id)
      const resultId = stringValue(filter.resultId ?? filter.result_id)
      const backend = stringValue(filter.backend)
      const status = stringValue(filter.status)
      const limit = positiveInteger(filter.limit) ?? 100
      const matched = []
      for (const watch of watches.values()) {
        if (projectId && watch.projectId !== projectId) continue
        if (taskId && watch.taskId !== taskId) continue
        if (resultId && watch.resultId !== resultId) continue
        if (backend && watch.backend !== backend) continue
        if (status && watch.status !== status) continue
        matched.push(cloneRecord(watch))
        if (matched.length >= limit) break
      }
      return matched
    },
    async cancelWatch(watchId) {
      await ensureLoaded()
      const id = String(watchId ?? '').trim()
      const watch = watches.get(id)
      if (!watch) return null
      clearWatchTimer(id)
      if (watch.status === 'watching') {
        const now = new Date().toISOString()
        const canceled = normalizeResultWatch({
          ...watch,
          status: 'canceled',
          updatedAt: now,
          updated_at: now,
          completedAt: now,
          completed_at: now,
        }, { preserveTimestamps: true })
        watches.set(id, canceled)
        await persist()
        return cloneRecord(canceled)
      }
      return cloneRecord(watch)
    },
    async startPendingWatches() {
      await ensureLoaded()
      for (const watch of watches.values()) {
        if (watch.status === 'watching') startWatch(watch.watchId)
      }
    },
    async close() {
      for (const watchId of timers.keys()) clearWatchTimer(watchId)
    },
  }

  function startWatch(watchId) {
    clearWatchTimer(watchId)
    scheduleWatch(watchId, 0)
  }

  function scheduleWatch(watchId, delayMs) {
    const timer = setTimeout(() => {
      timers.delete(watchId)
      void pollWatch(watchId)
    }, delayMs)
    timer.unref?.()
    timers.set(watchId, timer)
  }

  async function pollWatch(watchId) {
    const current = watches.get(watchId)
    if (!current || current.status !== 'watching') return
    const now = new Date().toISOString()
    const attempts = current.attempts + 1
    let watch = normalizeResultWatch({
      ...current,
      attempts,
      updatedAt: now,
      updated_at: now,
    }, { preserveTimestamps: true })
    watches.set(watchId, watch)

    try {
      const detected = await detectExternalNleOutput(watch)
      if (!isWatchStillWatching(watchId)) return
      if (detected) {
        const registered = resultRegistry?.registerResult
          ? await resultRegistry.registerResult(detected.result)
          : detected.result
        const completedAt = new Date().toISOString()
        watch = normalizeResultWatch({
          ...watch,
          status: 'succeeded',
          resultId: registered.resultId,
          result_id: registered.resultId,
          result: registered,
          detected: detected.detected,
          updatedAt: completedAt,
          updated_at: completedAt,
          completedAt,
          completed_at: completedAt,
        }, { preserveTimestamps: true })
        watches.set(watchId, watch)
        await persist()
        return
      }
      if (watchTimedOut(watch)) {
        if (!isWatchStillWatching(watchId)) return
        const completedAt = new Date().toISOString()
        watch = normalizeResultWatch({
          ...watch,
          status: 'failed',
          error: {
            code: 'EXTERNAL_NLE_WATCH_TIMEOUT',
            message: 'External NLE watch reached timeout before a supported output artifact was detected.',
          },
          updatedAt: completedAt,
          updated_at: completedAt,
          completedAt,
          completed_at: completedAt,
        }, { preserveTimestamps: true })
        watches.set(watchId, watch)
        await persist()
        return
      }
      if (!isWatchStillWatching(watchId)) return
      watches.set(watchId, watch)
      await persist()
      scheduleWatch(watchId, watch.pollIntervalMs)
    } catch (error) {
      if (!isWatchStillWatching(watchId)) return
      const completedAt = new Date().toISOString()
      watch = normalizeResultWatch({
        ...watch,
        status: 'failed',
        error: {
          code: 'EXTERNAL_NLE_WATCH_FAILED',
          message: stringValue(error?.message) ?? 'External NLE watch failed.',
        },
        updatedAt: completedAt,
        updated_at: completedAt,
        completedAt,
        completed_at: completedAt,
      }, { preserveTimestamps: true })
      watches.set(watchId, watch)
      await persist()
    }
  }

  function isWatchStillWatching(watchId) {
    return watches.get(watchId)?.status === 'watching'
  }

  function clearWatchTimer(watchId) {
    const timer = timers.get(watchId)
    if (timer) clearTimeout(timer)
    timers.delete(watchId)
  }
}

function normalizeResultWatch(input = {}, options = {}) {
  const raw = recordValue(input) ?? {}
  const now = new Date().toISOString()
  const projectId = stringValue(raw.projectId ?? raw.project_id)
  const taskId = stringValue(raw.taskId ?? raw.task_id)
  const resultId = stringValue(raw.resultId ?? raw.result_id)
  const generatedId = [projectId, taskId, resultId, Date.now()].filter(Boolean).join(':')
  const watchId = stringValue(raw.watchId ?? raw.watch_id)
    ?? (generatedId ? `external-nle-watch:${generatedId}` : `external-nle-watch:${Date.now()}`)
  const createdAt = options.preserveTimestamps ? (stringValue(raw.createdAt ?? raw.created_at) ?? now) : now
  const updatedAt = options.preserveTimestamps ? (stringValue(raw.updatedAt ?? raw.updated_at) ?? now) : now
  const completedAt = stringValue(raw.completedAt ?? raw.completed_at)
  const outputDirectory = pathValue(raw.outputDirectory ?? raw.output_directory ?? raw.watchDirectory ?? raw.watch_directory ?? raw.exportDirectory ?? raw.export_directory)
  const outputPath = pathValue(raw.outputPath ?? raw.output_path)
  const hlsManifestPath = pathValue(raw.hlsManifestPath ?? raw.hls_manifest_path ?? raw.manifestPath ?? raw.manifest_path)
  const hlsDirectory = pathValue(raw.hlsDirectory ?? raw.hls_directory)
  const hlsSegmentPaths = stringArrayValue(raw.hlsSegmentPaths ?? raw.hls_segment_paths ?? raw.segmentPaths ?? raw.segment_paths)
  const pollIntervalMs = boundedInteger(raw.pollIntervalMs ?? raw.poll_interval_ms, 50, 60_000) ?? 1000
  const timeoutMs = boundedInteger(raw.timeoutMs ?? raw.timeout_ms, 1, 30 * 24 * 60 * 60 * 1000)
  const status = stringValue(raw.status) ?? 'watching'

  return compactRecord({
    schema: 'movscript.media-pipeline-result-watch.v1',
    watchId,
    watch_id: watchId,
    projectId,
    project_id: projectId,
    taskId,
    task_id: taskId,
    resultId,
    result_id: resultId,
    backend: 'external_nle',
    status,
    outputDirectory,
    output_directory: outputDirectory,
    outputPath,
    output_path: outputPath,
    hlsManifestPath,
    hls_manifest_path: hlsManifestPath,
    hlsDirectory,
    hls_directory: hlsDirectory,
    hlsSegmentPaths,
    hls_segment_paths: hlsSegmentPaths,
    exchangeProjectPath: pathValue(raw.exchangeProjectPath ?? raw.exchange_project_path),
    exchange_project_path: pathValue(raw.exchangeProjectPath ?? raw.exchange_project_path),
    externalApp: stringValue(raw.externalApp ?? raw.external_app ?? raw.externalNle ?? raw.external_nle),
    external_app: stringValue(raw.externalApp ?? raw.external_app ?? raw.externalNle ?? raw.external_nle),
    reviewer: stringValue(raw.reviewer),
    reviewStatus: stringValue(raw.reviewStatus ?? raw.review_status),
    review_status: stringValue(raw.reviewStatus ?? raw.review_status),
    outputKind: stringValue(raw.outputKind ?? raw.output_kind),
    output_kind: stringValue(raw.outputKind ?? raw.output_kind),
    pollIntervalMs,
    poll_interval_ms: pollIntervalMs,
    timeoutMs,
    timeout_ms: timeoutMs,
    attempts: nonNegativeInteger(raw.attempts) ?? 0,
    detected: recordValue(raw.detected),
    result: recordValue(raw.result),
    error: recordValue(raw.error),
    provenance: recordValue(raw.provenance),
    metadata: recordValue(raw.metadata ?? raw.params),
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
    completedAt,
    completed_at: completedAt,
  })
}

function assertWatchTarget(watch) {
  if (!watch.outputDirectory && !watch.outputPath && !watch.hlsManifestPath) {
    throw watchError(400, 'external_nle_watch_target_required', 'External NLE watch requires outputDirectory, outputPath, or manifestPath.')
  }
}

async function detectExternalNleOutput(watch) {
  const explicitManifestPath = watch.hlsManifestPath
  const explicitOutputPath = watch.outputPath
  const files = watch.outputDirectory ? await listExternalNleFiles(watch.outputDirectory) : []
  const manifestPath = await existingPath(explicitManifestPath)
    ?? newestFilePath(files.filter((file) => file.kind === 'hls_manifest'))
  const outputPath = manifestPath
    ? undefined
    : await existingPath(explicitOutputPath)
      ?? newestFilePath(files.filter((file) => file.kind === 'video'))
  if (!manifestPath && !outputPath) return undefined

  const hlsSegmentPaths = manifestPath
    ? uniqueStrings([
      ...(watch.hlsSegmentPaths ?? []),
      ...files.filter((file) => file.kind === 'hls_segment').map((file) => file.path),
    ])
    : undefined
  const kind = manifestPath ? 'hls' : outputKindFromPath(outputPath)
  const outputKind = manifestPath ? 'hls_stream' : watch.outputKind ?? 'video'
  const detectedPath = manifestPath ?? outputPath
  const outputName = detectedPath ? basename(detectedPath) : undefined
  const detected = compactRecord({
    backend: 'external_nle',
    kind,
    output_kind: outputKind,
    output_path: outputPath,
    hls_manifest_path: manifestPath,
    hls_directory: manifestPath ? (watch.hlsDirectory ?? dirname(manifestPath)) : undefined,
    hls_segment_paths: hlsSegmentPaths,
    output_directory: watch.outputDirectory,
    file_count: files.length,
    watch_id: watch.watchId,
    attempts: watch.attempts,
  })
  const provenance = compactRecord({
    ...watch.provenance,
    backend: 'external_nle',
    recovery: 'background_watch',
    watch_id: watch.watchId,
    output_directory: watch.outputDirectory,
    exchange_project_path: watch.exchangeProjectPath,
    external_app: watch.externalApp,
    reviewer: watch.reviewer,
    review_status: watch.reviewStatus,
  })
  const metadata = compactRecord({
    ...watch.metadata,
    detection: detected,
  })

  return {
    detected,
    result: compactRecord({
      resultId: watch.resultId,
      projectId: watch.projectId,
      taskId: watch.taskId,
      backend: 'external_nle',
      kind,
      outputKind,
      status: 'available',
      source: 'external_nle_background_watch',
      outputPath,
      outputName,
      hlsManifestPath: manifestPath,
      hlsDirectory: manifestPath ? (watch.hlsDirectory ?? dirname(manifestPath)) : undefined,
      hlsSegmentPaths,
      provenance,
      metadata,
    }),
  }
}

async function listExternalNleFiles(root) {
  const absoluteRoot = resolve(root)
  const discovered = []
  async function visit(directory) {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(absolutePath)
        continue
      }
      if (!entry.isFile()) continue
      const fileKind = externalNleFileKind(absolutePath)
      if (!fileKind) continue
      const fileStat = await stat(absolutePath)
      discovered.push({ path: absolutePath, kind: fileKind, mtimeMs: fileStat.mtimeMs })
    }
  }
  await visit(absoluteRoot)
  return discovered
}

async function existingPath(filePath) {
  if (!filePath) return undefined
  try {
    const fileStat = await stat(filePath)
    return fileStat.isFile() ? filePath : undefined
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

function watchTimedOut(watch) {
  if (!watch.timeoutMs) return false
  return Date.now() - Date.parse(watch.createdAt) >= watch.timeoutMs
}

function newestFilePath(files) {
  return [...files].sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))[0]?.path
}

function externalNleFileKind(filePath) {
  const extension = extname(filePath).toLowerCase()
  if (extension === '.m3u8') return 'hls_manifest'
  if (['.ts', '.m4s', '.cmfv', '.cmfa'].includes(extension)) return 'hls_segment'
  if (['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'].includes(extension)) return 'video'
  return undefined
}

function outputKindFromPath(filePath) {
  const extension = extname(filePath ?? '').toLowerCase()
  if (['.mp3', '.wav', '.m4a', '.aac', '.flac'].includes(extension)) return 'audio'
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) return 'image'
  return extension ? extension.slice(1) : 'video'
}

function boundedInteger(value, minimum, maximum) {
  const number = Number(value)
  if (!Number.isFinite(number)) return undefined
  return Math.min(maximum, Math.max(minimum, Math.floor(number)))
}

function nonNegativeInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : undefined
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))]
}

function pathValue(value) {
  const raw = stringValue(value)
  return raw ? resolve(raw) : undefined
}

function stringArrayValue(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => resolve(item.trim()))
    : undefined
}

function recordValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function compactRecord(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function cloneRecord(record) {
  return JSON.parse(JSON.stringify(record))
}

function watchError(statusCode, code, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}
