import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createInMemoryMediaPipelineResultRegistry,
  mediaPipelineResultFromTask,
} from './resultRegistry.mjs'

const HEADLESS_SUPPORTED_TASK_TYPES = Object.freeze(['timeline_render', 'timeline_hls', 'media_transcode', 'media_reframe', 'backend_project_render', 'backend_project_preview'])
const HEADLESS_SUPPORTED_OUTPUTS = Object.freeze(['mp4', 'hls'])

export function createHeadlessMediaPipelineRuntimePort(options = {}) {
  const env = options.env ?? process.env
  const resultRegistry = options.resultRegistry ?? createInMemoryMediaPipelineResultRegistry()
  const tasks = new Map()
  let nextTaskId = 0

  return {
    async getCapabilities() {
      const ffmpeg = await probeFFmpeg(env)
      return {
        status: 'ok',
        runtime: 'headless_media_pipeline',
        available: ffmpeg.available,
        ffmpeg,
        backendProjectRender: {
          available: true,
          requiresCommand: true,
          requiresOutputPath: true,
        },
        backendProjectPreview: {
          available: true,
          requiresCommand: true,
          managedProcess: true,
        },
        backend_project_render: {
          available: true,
          requires_command: true,
          requires_output_path: true,
        },
        backend_project_preview: {
          available: true,
          requires_command: true,
          managed_process: true,
        },
        supportedTaskTypes: [...HEADLESS_SUPPORTED_TASK_TYPES],
        supported_task_types: [...HEADLESS_SUPPORTED_TASK_TYPES],
        supportedOutputs: [...HEADLESS_SUPPORTED_OUTPUTS],
        supported_outputs: [...HEADLESS_SUPPORTED_OUTPUTS],
        localHlsPreview: false,
        local_hls_preview: false,
        projectStore: false,
        project_store: false,
      }
    },
    async createTask(request) {
      const now = new Date().toISOString()
      const taskType = stringValue(request?.taskType)
      const projectId = stringValue(request?.projectId) ?? 'default'
      const taskId = `${taskType || 'media_task'}_headless_${++nextTaskId}`
      const task = {
        taskId,
        projectId,
        taskType,
        status: 'queued',
        progressPercent: 0,
        currentStep: 'queued',
        createdAt: now,
        updatedAt: now,
      }
      const entry = { task, logs: [`${now} queued ${taskId}`], child: undefined }
      tasks.set(taskId, entry)
      runHeadlessTask({ request, entry, env, resultRegistry }).catch((error) => {
        failTask(entry, 'HEADLESS_MEDIA_PIPELINE_ERROR', errorMessage(error))
      })
      return { ...task }
    },
    async getTask(taskId) {
      return cloneTask(tasks.get(taskId)?.task) ?? null
    },
    async cancelTask(taskId) {
      const entry = tasks.get(taskId)
      if (!entry) return notFoundTask(taskId)
      if (entry.child && entry.task.status === 'running') {
        entry.child.kill('SIGTERM')
      }
      updateTask(entry, {
        status: 'canceled',
        progressPercent: 100,
        currentStep: 'canceled',
      })
      entry.logs.push(`${new Date().toISOString()} canceled ${taskId}`)
      return cloneTask(entry.task)
    },
    async getTaskLogs(taskId) {
      const entry = tasks.get(taskId)
      if (!entry) {
        return {
          status: 'not_found',
          taskId,
          logs: [],
        }
      }
      return {
        status: 'ok',
        taskId,
        logs: [...entry.logs],
        text: entry.logs.join('\n'),
      }
    },
    async registerResult(input) {
      return resultRegistry.registerResult(input)
    },
    async getResult(resultId) {
      return resultRegistry.getResult(resultId)
    },
    async listResults(filter) {
      return resultRegistry.listResults(filter)
    },
  }
}

async function runHeadlessTask({ request, entry, env, resultRegistry }) {
  const taskType = stringValue(request?.taskType)
  if (!HEADLESS_SUPPORTED_TASK_TYPES.includes(taskType)) {
    failTask(entry, 'HEADLESS_TASK_TYPE_UNSUPPORTED', `headless media pipeline does not support task type: ${taskType}`)
    return
  }
  if (taskType === 'backend_project_render') {
    await runBackendProjectRenderTask({ request, entry, env, resultRegistry })
    return
  }
  if (taskType === 'backend_project_preview') {
    await runBackendProjectPreviewTask({ request, entry })
    return
  }

  const capabilities = await probeFFmpeg(env)
  if (!capabilities.available) {
    failTask(entry, capabilities.code ?? 'FFMPEG_UNAVAILABLE', capabilities.error ?? 'ffmpeg is unavailable')
    return
  }

  const source = taskType === 'timeline_render' || taskType === 'timeline_hls'
    ? timelineSource(request?.timeline ?? request?.editingProject?.timeline)
    : request?.source
  const resolvedSource = await resolveSourceLocalPath({
    source,
    request,
    entry,
    env,
  })
  const sourcePath = resolvedSource.localPath
  if (!sourcePath) {
    failTask(entry, 'SOURCE_REQUIRED', `${taskType} requires a local file source or a resolvable resource_id source`)
    return
  }
  try {
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile()) {
      failTask(entry, 'SOURCE_NOT_FILE', `source is not a file: ${sourcePath}`)
      return
    }
  } catch {
    failTask(entry, 'SOURCE_NOT_FOUND', `source file was not found: ${sourcePath}`)
    return
  }

  const outputPath = await resolveOutputPath({ request, task: entry.task, env })
  const variants = taskType === 'timeline_hls' ? hlsVariants(request?.output) : []
  if (variants.length > 0) {
    await runHeadlessHlsVariantTask({ capabilities, sourcePath, outputPath, request, entry, variants, resultRegistry })
    return
  }
  const args = ffmpegArgsForTask({ taskType, sourcePath, outputPath, request })
  updateTask(entry, {
    status: 'running',
    progressPercent: 5,
    currentStep: 'ffmpeg',
    outputPath,
    outputName: outputPath.split('/').at(-1),
    ...(resolvedSource.resourceId !== undefined ? { sourceResourceId: resolvedSource.resourceId, source_resource_id: resolvedSource.resourceId } : {}),
    ...(resolvedSource.downloaded ? { sourceDownloaded: true, source_downloaded: true } : {}),
  })
  entry.logs.push(`${new Date().toISOString()} ffmpeg ${args.join(' ')}`)
  const result = await runProcess(capabilities.path, args, entry)
  if (result.code === 0) {
    updateTask(entry, {
      status: 'running',
      progressPercent: 95,
      currentStep: 'result-registry',
      outputPath,
      outputName: outputPath.split('/').at(-1),
      ...(taskType === 'timeline_hls' ? {
        hlsManifestPath: outputPath,
        hls_manifest_path: outputPath,
        hlsDirectory: outputPath.split('/').slice(0, -1).join('/'),
        hls_directory: outputPath.split('/').slice(0, -1).join('/'),
      } : {}),
    })
    await registerTaskResult({ resultRegistry, task: entry.task, request, entry })
    updateTask(entry, {
      status: 'succeeded',
      progressPercent: 100,
      currentStep: 'completed',
    })
    entry.logs.push(`${new Date().toISOString()} completed ${entry.task.taskId}`)
    return
  }
  failTask(entry, 'FFMPEG_FAILED', `ffmpeg exited with code ${result.code}`)
}

async function runBackendProjectRenderTask({ request, entry, env, resultRegistry }) {
  const backendProject = recordValue(request?.backendProject) ?? recordValue(request?.backend_project)
  const backend = stringValue(request?.backend)
    ?? stringValue(backendProject?.backend)
    ?? stringValue(backendProject?.adapter?.kind)
    ?? 'backend_project'
  const projectDirectory = resolveProjectDirectory(request, backendProject)
  const outputPath = await resolveBackendRenderOutputPath({ request, task: entry.task, env, projectDirectory })
  const command = backendRenderCommand(request, backendProject, outputPath)
  if (!command) {
    failTask(entry, 'BACKEND_RENDER_COMMAND_REQUIRED', 'backend_project_render requires renderCommand/render_command, command+args, or backendProject.adapter.render_command.')
    return
  }
  if (!outputPath) {
    failTask(entry, 'BACKEND_RENDER_OUTPUT_PATH_REQUIRED', 'backend_project_render requires output.outputPath/output_path or a resolvable output filename.')
    return
  }
  updateTask(entry, {
    status: 'running',
    progressPercent: 5,
    currentStep: 'backend-render',
    backend,
    projectDirectory,
    project_directory: projectDirectory,
    outputPath,
    outputName: outputPath.split('/').at(-1),
  })
  entry.logs.push(`${new Date().toISOString()} backend ${backend} render ${command.log}`)
  const result = await runBackendRenderProcess(command, projectDirectory, entry)
  if (result.code !== 0) {
    failTask(entry, 'BACKEND_RENDER_FAILED', `backend render exited with code ${result.code}`)
    return
  }
  try {
    const outputStat = await stat(outputPath)
    if (!outputStat.isFile()) {
      failTask(entry, 'BACKEND_RENDER_OUTPUT_NOT_FILE', `backend render output is not a file: ${outputPath}`)
      return
    }
  } catch {
    failTask(entry, 'BACKEND_RENDER_OUTPUT_NOT_FOUND', `backend render command succeeded but output file was not found: ${outputPath}`)
    return
  }
  updateTask(entry, {
    status: 'running',
    progressPercent: 95,
    currentStep: 'result-registry',
    outputPath,
    outputName: outputPath.split('/').at(-1),
  })
  await registerTaskResult({ resultRegistry, task: entry.task, request: {
    ...request,
    backend,
    output: {
      ...(recordValue(request?.output) ?? {}),
      format: stringValue(request?.output?.format) ?? outputFormatFromPath(outputPath),
      outputPath,
      output_path: outputPath,
    },
  }, entry })
  updateTask(entry, {
    status: 'succeeded',
    progressPercent: 100,
    currentStep: 'completed',
  })
  entry.logs.push(`${new Date().toISOString()} completed ${entry.task.taskId}`)
}

async function runBackendProjectPreviewTask({ request, entry }) {
  const backendProject = recordValue(request?.backendProject) ?? recordValue(request?.backend_project)
  const backend = stringValue(request?.backend)
    ?? stringValue(backendProject?.backend)
    ?? stringValue(backendProject?.adapter?.kind)
    ?? 'backend_project'
  const projectDirectory = resolveProjectDirectory(request, backendProject)
  const command = backendPreviewCommand(request, backendProject)
  const previewUrl = stringValue(request?.previewUrl ?? request?.preview_url ?? request?.surface?.url)
  if (!projectDirectory) {
    failTask(entry, 'BACKEND_PREVIEW_PROJECT_DIRECTORY_REQUIRED', 'backend_project_preview requires projectDirectory/project_directory or backendProject.projectDirectory.')
    return
  }
  try {
    const projectStat = await stat(projectDirectory)
    if (!projectStat.isDirectory()) {
      failTask(entry, 'BACKEND_PREVIEW_PROJECT_DIRECTORY_NOT_DIRECTORY', `backend preview project directory is not a directory: ${projectDirectory}`)
      return
    }
  } catch {
    failTask(entry, 'BACKEND_PREVIEW_PROJECT_DIRECTORY_NOT_FOUND', `backend preview project directory was not found: ${projectDirectory}`)
    return
  }
  if (!command) {
    failTask(entry, 'BACKEND_PREVIEW_COMMAND_REQUIRED', 'backend_project_preview requires previewCommand/preview_command, command+args, or backendProject.adapter.preview_command.')
    return
  }
  updateTask(entry, {
    status: 'running',
    progressPercent: 100,
    currentStep: 'preview-running',
    backend,
    projectDirectory,
    project_directory: projectDirectory,
    ...(previewUrl ? {
      previewUrl,
      preview_url: previewUrl,
      surface: { kind: 'browser_url', url: previewUrl },
    } : {}),
    rendered: false,
    candidate_created: false,
    adopted: false,
    selected: false,
  })
  entry.logs.push(`${new Date().toISOString()} backend ${backend} preview ${command.log}`)
  const result = await runBackendPreviewProcess(command, projectDirectory, entry)
  if (entry.task.status === 'canceled') return
  if (result.code === 0) {
    updateTask(entry, {
      status: 'succeeded',
      progressPercent: 100,
      currentStep: 'preview-stopped',
    })
    entry.logs.push(`${new Date().toISOString()} preview stopped ${entry.task.taskId}`)
    return
  }
  failTask(entry, 'BACKEND_PREVIEW_FAILED', `backend preview exited with code ${result.code}`)
}

async function runHeadlessHlsVariantTask({ capabilities, sourcePath, outputPath, request, entry, variants, resultRegistry }) {
  updateTask(entry, {
    status: 'running',
    progressPercent: 5,
    currentStep: 'hls-variants',
    outputPath,
    outputName: outputPath.split('/').at(-1),
    hlsManifestPath: outputPath,
    hls_manifest_path: outputPath,
    hlsDirectory: outputPath.split('/').slice(0, -1).join('/'),
    hls_directory: outputPath.split('/').slice(0, -1).join('/'),
  })
  const hlsDirectory = outputPath.split('/').slice(0, -1).join('/')
  const variantStates = []
  for (const [index, variant] of variants.entries()) {
    const state = normalizeHlsVariant(variant, index)
    variantStates.push(state)
    const playlistPath = join(hlsDirectory, `${state.name}.m3u8`)
    const segmentPattern = join(hlsDirectory, `${state.name}-segment-%05d.ts`)
    const args = ffmpegArgsForHlsVariant({ sourcePath, playlistPath, segmentPattern, variant: state, request })
    entry.logs.push(`${new Date().toISOString()} ffmpeg ${args.join(' ')}`)
    const result = await runProcess(capabilities.path, args, entry)
    if (result.code !== 0) {
      failTask(entry, 'FFMPEG_FAILED', `ffmpeg exited with code ${result.code}`)
      return
    }
  }
  await writeFile(outputPath, masterHlsManifest(variantStates), 'utf8')
  const segmentPaths = await hlsOutputPaths(hlsDirectory, outputPath)
  updateTask(entry, {
    status: 'running',
    progressPercent: 95,
    currentStep: 'result-registry',
    hlsSegmentPaths: segmentPaths,
    hls_segment_paths: segmentPaths,
    hlsVariants: variantStates,
    hls_variants: variantStates,
  })
  await registerTaskResult({ resultRegistry, task: entry.task, request, entry })
  updateTask(entry, {
    status: 'succeeded',
    progressPercent: 100,
    currentStep: 'completed',
  })
  entry.logs.push(`${new Date().toISOString()} completed ${entry.task.taskId}`)
}

async function registerTaskResult({ resultRegistry, task, request, entry }) {
  if (!resultRegistry?.registerResult) return
  try {
    const result = await resultRegistry.registerResult(mediaPipelineResultFromTask({ task, request }))
    updateTask(entry, {
      resultId: result.resultId,
      result_id: result.resultId,
      result,
    })
    entry.logs.push(`${new Date().toISOString()} registered result ${result.resultId}`)
  } catch (error) {
    entry.logs.push(`${new Date().toISOString()} result registration failed: ${errorMessage(error)}`)
  }
}

async function resolveOutputPath({ request, task, env }) {
  const homeDir = stringValue(env.MOVSCRIPT_HOME)
  const explicitRoot = stringValue(env.MOVSCRIPT_MEDIA_PIPELINE_WORK_DIR)
  const taskDir = explicitRoot
    ? join(explicitRoot, task.projectId, task.taskId)
    : defaultTaskOutputsDir({ homeDir, task })
  await mkdir(taskDir, { recursive: true })
  const filename = stringValue(request?.output?.filename)
    ?? `${task.taskId}.${request?.output?.format === 'hls' ? 'm3u8' : 'mp4'}`
  return resolve(taskDir, filename)
}

function defaultTaskOutputsDir({ homeDir, task }) {
  if (!homeDir) return join(tmpdir(), 'movscript-media-pipeline', task.projectId, task.taskId)
  return join(
    homeDir,
    'media-workspaces',
    stableMediaWorkspacePathPart(task.projectId),
    'tasks',
    stableMediaWorkspacePathPart(task.taskId),
    'outputs',
  )
}

async function resolveBackendRenderOutputPath({ request, task, env, projectDirectory }) {
  const explicit = stringValue(request?.output?.outputPath ?? request?.output?.output_path ?? request?.outputPath ?? request?.output_path)
  if (explicit) return resolve(projectDirectory ?? process.cwd(), explicit)
  const filename = stringValue(request?.output?.filename)
  if (filename && projectDirectory) return resolve(projectDirectory, filename)
  return resolveOutputPath({ request, task, env })
}

function resolveProjectDirectory(request, backendProject) {
  const explicit = stringValue(request?.projectDirectory ?? request?.project_directory ?? request?.cwd)
  if (explicit) return resolve(explicit)
  const projectPath = stringValue(backendProject?.projectDirectory ?? backendProject?.project_directory ?? backendProject?.exportDirectory ?? backendProject?.export_directory)
  return projectPath ? resolve(projectPath) : undefined
}

function backendRenderCommand(request, backendProject, outputPath) {
  const renderCommand = request?.renderCommand ?? request?.render_command ?? backendProject?.adapter?.render_command
  if (Array.isArray(renderCommand)) {
    const [command, ...args] = renderCommand.filter((item) => typeof item === 'string' && item.trim())
    if (!command) return undefined
    const replacedArgs = args.map((arg) => replaceRenderPlaceholders(arg, outputPath))
    return { kind: 'argv', command, args: replacedArgs, log: [command, ...replacedArgs].join(' ') }
  }
  if (typeof renderCommand === 'string' && renderCommand.trim()) {
    const command = replaceRenderPlaceholders(renderCommand, outputPath)
    return { kind: 'shell', command, log: command }
  }
  const command = stringValue(request?.command)
  if (command) {
    const args = Array.isArray(request?.args)
      ? request.args.filter((item) => typeof item === 'string' && item.trim()).map((arg) => replaceRenderPlaceholders(arg, outputPath))
      : []
    return { kind: 'argv', command, args, log: [command, ...args].join(' ') }
  }
  return undefined
}

function backendPreviewCommand(request, backendProject) {
  const previewCommand = request?.previewCommand ?? request?.preview_command ?? backendProject?.adapter?.preview_command
  if (Array.isArray(previewCommand)) {
    const [command, ...args] = previewCommand.filter((item) => typeof item === 'string' && item.trim())
    if (!command) return undefined
    return { kind: 'argv', command, args, log: [command, ...args].join(' ') }
  }
  if (typeof previewCommand === 'string' && previewCommand.trim()) {
    return { kind: 'shell', command: previewCommand, log: previewCommand }
  }
  const command = stringValue(request?.command)
  if (command) {
    const args = Array.isArray(request?.args)
      ? request.args.filter((item) => typeof item === 'string' && item.trim())
      : []
    return { kind: 'argv', command, args, log: [command, ...args].join(' ') }
  }
  return undefined
}

function replaceRenderPlaceholders(value, outputPath) {
  return value
    .replaceAll('{outputPath}', outputPath)
    .replaceAll('{output_path}', outputPath)
}

function runBackendRenderProcess(command, cwd, entry) {
  if (command.kind === 'shell') return runShellProcess(command.command, cwd, entry)
  return runProcess(command.command, command.args, entry, { cwd })
}

function runBackendPreviewProcess(command, cwd, entry) {
  return runBackendRenderProcess(command, cwd, entry)
}

function runShellProcess(command, cwd, entry) {
  if (process.platform === 'win32') {
    return runProcess(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], entry, { cwd })
  }
  return runProcess('/bin/sh', ['-lc', command], entry, { cwd })
}

function ffmpegArgsForTask({ taskType, sourcePath, outputPath, request }) {
  const args = ['-y', '-i', sourcePath]
  if (taskType === 'timeline_hls') {
    args.push('-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod')
  }
  if (taskType === 'media_reframe') {
    const width = positiveInteger(request?.reframe?.width)
    const height = positiveInteger(request?.reframe?.height)
    if (width && height) {
      const mode = stringValue(request?.reframe?.mode) ?? 'contain'
      const background = stringValue(request?.reframe?.background) ?? 'black'
      if (mode === 'stretch') {
        args.push('-vf', `scale=${width}:${height}`)
      } else if (mode === 'crop' || mode === 'cover') {
        args.push('-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`)
      } else {
        args.push('-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${background}`)
      }
    }
  }
  const videoCodec = stringValue(request?.transcode?.videoCodec ?? request?.transcode?.video_codec)
  const audioCodec = stringValue(request?.transcode?.audioCodec ?? request?.transcode?.audio_codec)
  if (videoCodec) args.push('-c:v', videoCodec)
  if (audioCodec) args.push('-c:a', audioCodec)
  args.push(outputPath)
  return args
}

function ffmpegArgsForHlsVariant({ sourcePath, playlistPath, segmentPattern, variant, request }) {
  const args = ['-y', '-i', sourcePath]
  if (variant.width && variant.height) {
    args.push('-vf', `scale=${variant.width}:${variant.height}:force_original_aspect_ratio=decrease,pad=${variant.width}:${variant.height}:(ow-iw)/2:(oh-ih)/2:black`)
  }
  if (variant.videoBitrateKbps) args.push('-b:v', `${variant.videoBitrateKbps}k`)
  if (variant.audioBitrateKbps) args.push('-b:a', `${variant.audioBitrateKbps}k`)
  const videoCodec = stringValue(request?.transcode?.videoCodec ?? request?.transcode?.video_codec)
  const audioCodec = stringValue(request?.transcode?.audioCodec ?? request?.transcode?.audio_codec)
  if (videoCodec) args.push('-c:v', videoCodec)
  if (audioCodec) args.push('-c:a', audioCodec)
  args.push('-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_segment_filename', segmentPattern, playlistPath)
  return args
}

function hlsVariants(output) {
  const variants = Array.isArray(output?.hlsVariants)
    ? output.hlsVariants
    : (Array.isArray(output?.hls_variants) ? output.hls_variants : [])
  return variants.filter((variant) => variant && typeof variant === 'object' && !Array.isArray(variant))
}

function normalizeHlsVariant(variant, index) {
  const width = positiveInteger(variant.width)
  const height = positiveInteger(variant.height)
  const videoBitrateKbps = positiveInteger(variant.videoBitrateKbps ?? variant.video_bitrate_kbps) ?? 900
  const audioBitrateKbps = positiveInteger(variant.audioBitrateKbps ?? variant.audio_bitrate_kbps) ?? 128
  const name = safeVariantName(stringValue(variant.name) ?? (height ? `${height}p` : `variant-${index + 1}`))
  const bandwidth = (videoBitrateKbps + audioBitrateKbps) * 1000
  return {
    name,
    bandwidth,
    videoBitrateKbps,
    video_bitrate_kbps: videoBitrateKbps,
    audioBitrateKbps,
    audio_bitrate_kbps: audioBitrateKbps,
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  }
}

function masterHlsManifest(variants) {
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    ...variants.flatMap((variant) => {
      const attributes = [`BANDWIDTH=${variant.bandwidth}`]
      if (variant.width && variant.height) attributes.push(`RESOLUTION=${variant.width}x${variant.height}`)
      return [`#EXT-X-STREAM-INF:${attributes.join(',')}`, `${variant.name}.m3u8`]
    }),
    '',
  ].join('\n')
}

async function hlsOutputPaths(hlsDirectory, masterPath) {
  const names = await readdir(hlsDirectory)
  return names
    .filter((name) => name !== masterPath.split('/').at(-1))
    .sort()
    .map((name) => join(hlsDirectory, name))
}

function safeVariantName(name) {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'variant'
}

async function probeFFmpeg(env) {
  const candidates = await ffmpegCandidatePaths(env)
  let lastFailure
  for (const candidate of candidates) {
    try {
      const result = await runProcess(candidate, ['-version'])
      if (result.code === 0) {
        return {
          available: true,
          path: candidate,
          version: firstLine(result.stdout),
          platform: process.platform,
          arch: process.arch,
        }
      }
      lastFailure = {
        path: candidate,
        code: 'FFMPEG_PROBE_FAILED',
        error: result.stderr || `ffmpeg exited with code ${result.code}`,
      }
    } catch (error) {
      lastFailure = {
        path: candidate,
        code: 'FFMPEG_NOT_FOUND',
        error: errorMessage(error),
      }
    }
  }
  return {
    available: false,
    path: lastFailure?.path ?? candidates[0] ?? 'ffmpeg',
    candidates,
    code: lastFailure?.code ?? 'FFMPEG_UNAVAILABLE',
    error: lastFailure?.error ?? 'ffmpeg is unavailable',
    platform: process.platform,
    arch: process.arch,
  }
}

async function ffmpegCandidatePaths(env) {
  const explicit = [
    stringValue(env.MOVSCRIPT_FFMPEG_PATH),
    stringValue(env.FFMPEG_PATH),
  ].filter(Boolean)
  if (explicit.length > 0) return uniqueStrings(explicit)
  const homeCandidates = await homeFFmpegCandidatePaths(stringValue(env.MOVSCRIPT_HOME))
  return uniqueStrings([
    ...homeCandidates,
    'ffmpeg',
  ])
}

async function homeFFmpegCandidatePaths(homeDir) {
  if (!homeDir) return []
  const binary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const root = join(homeDir, 'tools', 'ffmpeg')
  let versions = ['current']
  try {
    versions = uniqueStrings(['current', ...(await readdir(root))])
  } catch {
    // Optional shared cache. Missing directories simply fall through to system ffmpeg.
  }
  const sortedVersions = versions.sort((left, right) => {
    if (left === 'current') return -1
    if (right === 'current') return 1
    return right.localeCompare(left)
  })
  return sortedVersions.flatMap((version) => [
    join(root, version, process.platform, process.arch, binary),
    join(root, version, process.platform, binary),
  ])
}

function uniqueStrings(values) {
  const seen = new Set()
  const unique = []
  for (const value of values) {
    const text = stringValue(value)
    if (!text || seen.has(text)) continue
    seen.add(text)
    unique.push(text)
  }
  return unique
}

function runProcess(command, args, entry, options = {}) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: options.cwd })
    if (entry) entry.child = child
    let stderr = ''
    let stdout = ''
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
      if (entry) entry.logs.push(String(chunk).trimEnd())
    })
    child.once('error', rejectProcess)
    child.once('close', (code) => {
      if (entry) entry.child = undefined
      resolveProcess({ code: code ?? 0, stdout, stderr })
    })
  })
}

function outputFormatFromPath(outputPath) {
  const extension = extname(outputPath).toLowerCase()
  if (extension === '.m3u8') return 'hls'
  return extension ? extension.slice(1) : 'mp4'
}

function updateTask(entry, patch) {
  entry.task = {
    ...entry.task,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
}

function failTask(entry, errorCode, errorMessageValue) {
  updateTask(entry, {
    status: 'failed',
    progressPercent: 100,
    currentStep: 'failed',
    errorCode,
    errorMessage: errorMessageValue,
  })
  entry.logs.push(`${new Date().toISOString()} failed ${entry.task.taskId}: ${errorCode} ${errorMessageValue}`)
}

function notFoundTask(taskId) {
  const now = new Date().toISOString()
  return {
    taskId,
    projectId: 'unknown',
    taskType: 'media_transcode',
    status: 'failed',
    progressPercent: 100,
    currentStep: 'not_found',
    errorCode: 'TASK_NOT_FOUND',
    errorMessage: `media pipeline task was not found: ${taskId}`,
    createdAt: now,
    updatedAt: now,
  }
}

function cloneTask(task) {
  return task ? { ...task } : undefined
}

function sourceLocalPath(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined
  return stringValue(source.localPath ?? source.local_path ?? source.path)
}

function timelineSource(timeline) {
  if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) return undefined
  const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : []
  const sortedClips = tracks
    .flatMap((track) => Array.isArray(track?.clips) ? track.clips : [])
    .filter((clip) => clip && typeof clip === 'object')
    .sort((left, right) => Number(left.timelineStartMs ?? left.timeline_start_ms ?? 0) - Number(right.timelineStartMs ?? right.timeline_start_ms ?? 0))
  for (const clip of sortedClips) {
    if (clip.asset && typeof clip.asset === 'object' && !Array.isArray(clip.asset)) return clip.asset
  }
  return undefined
}

async function resolveSourceLocalPath({ source, request, entry, env }) {
  const localPath = sourceLocalPath(source)
  if (localPath) return { localPath }

  const resourceId = sourceResourceId(source)
  if (resourceId === undefined) return {}

  const configuredPath = sourceResourceLocalPath(resourceId, request)
  if (configuredPath) return { localPath: configuredPath, resourceId }

  const resourceDownload = recordValue(request?.resourceDownload)
    ?? recordValue(request?.resource_download)
    ?? recordValue(request?.output?.resourceDownload)
    ?? recordValue(request?.output?.resource_download)
  const url = resourceDownloadURL(resourceId, resourceDownload)
  if (!url) return { resourceId }

  const cachePath = await resourceDownloadCachePath({
    resourceId,
    responseURL: url,
    resourceDownload,
    request,
    env,
  })
  try {
    const cached = await stat(cachePath)
    if (cached.isFile() && cached.size > 0) {
      entry.logs.push(`${new Date().toISOString()} resource ${resourceId} cache hit ${cachePath}`)
      return { localPath: cachePath, resourceId, downloaded: true }
    }
  } catch {
    // Cache miss: download below.
  }

  entry.logs.push(`${new Date().toISOString()} downloading resource ${resourceId} ${url}`)
  const response = await fetch(url, { headers: resourceDownloadHeaders(resourceDownload) })
  if (!response.ok) {
    throw new Error(`resource ${resourceId} download failed with HTTP ${response.status}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength === 0) throw new Error(`resource ${resourceId} download returned an empty body`)
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, bytes)
  entry.logs.push(`${new Date().toISOString()} downloaded resource ${resourceId} ${bytes.byteLength} bytes to ${cachePath}`)
  return { localPath: cachePath, resourceId, downloaded: true }
}

function sourceResourceId(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined
  return positiveInteger(source.resourceId ?? source.resource_id ?? source.backendResourceId ?? source.backend_resource_id)
}

function sourceResourceLocalPath(resourceId, request) {
  const resourceCache = recordValue(request?.resourceCache)
    ?? recordValue(request?.resource_cache)
    ?? recordValue(request?.output?.resourceCache)
    ?? recordValue(request?.output?.resource_cache)
  const localFiles = recordValue(resourceCache?.localFiles)
    ?? recordValue(resourceCache?.local_files)
    ?? recordValue(resourceCache?.files)
  const value = localFiles?.[String(resourceId)] ?? localFiles?.[resourceId]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resourceDownloadURL(resourceId, resourceDownload) {
  if (!resourceDownload) return undefined
  const urlTemplate = stringValue(resourceDownload.urlTemplate ?? resourceDownload.url_template)
  if (urlTemplate) {
    return urlTemplate
      .replaceAll('{resourceId}', encodeURIComponent(String(resourceId)))
      .replaceAll('{resource_id}', encodeURIComponent(String(resourceId)))
      .replaceAll(':id', encodeURIComponent(String(resourceId)))
  }
  const baseURL = stringValue(resourceDownload.baseUrl ?? resourceDownload.base_url ?? resourceDownload.apiBaseUrl ?? resourceDownload.api_base_url)
  if (!baseURL) return undefined
  const base = baseURL.replace(/\/+$/, '')
  return `${base}/api/v1/resources/${encodeURIComponent(String(resourceId))}/file`
}

function resourceDownloadHeaders(resourceDownload) {
  const headers = {}
  const configured = recordValue(resourceDownload?.headers)
  if (configured) {
    for (const [key, value] of Object.entries(configured)) {
      const string = stringValue(value)
      if (string) headers[key] = string
    }
  }
  const authorization = stringValue(resourceDownload?.authorization)
  const bearerToken = stringValue(resourceDownload?.bearerToken ?? resourceDownload?.bearer_token)
  if (authorization) headers.Authorization = authorization
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`
  return headers
}

async function resourceDownloadCachePath({ resourceId, responseURL, resourceDownload, request, env }) {
  const cacheDir = stringValue(resourceDownload?.cacheDir ?? resourceDownload?.cache_dir)
    ?? stringValue(request?.resourceCache?.cacheDir ?? request?.resourceCache?.cache_dir)
    ?? stringValue(request?.resource_cache?.cacheDir ?? request?.resource_cache?.cache_dir)
    ?? stringValue(env.MOVSCRIPT_MEDIA_PIPELINE_RESOURCE_CACHE_DIR)
    ?? defaultResourceCacheDir(env, request)
  await mkdir(cacheDir, { recursive: true })
  const extension = resourceExtension(resourceId, responseURL, resourceDownload)
  return join(cacheDir, `resource-${resourceId}${extension}`)
}

function defaultResourceCacheDir(env, request) {
  const homeDir = stringValue(env.MOVSCRIPT_HOME)
  const projectId = stringValue(request?.projectId ?? request?.project_id) ?? 'default'
  return homeDir
    ? join(homeDir, 'media-workspaces', stableMediaWorkspacePathPart(projectId), 'cache', 'resources')
    : join(tmpdir(), 'movscript-media-pipeline', 'resource-cache')
}

function stableMediaWorkspacePathPart(value) {
  const trimmed = String(value ?? '').trim()
  const readable = trimmed
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72) || 'default'
  const hash = createHash('sha256').update(trimmed || 'default').digest('hex').slice(0, 10)
  return `${readable}--${hash}`
}

function resourceExtension(resourceId, responseURL, resourceDownload) {
  const explicit = stringValue(resourceDownload?.extension)
  if (explicit) return explicit.startsWith('.') ? explicit : `.${explicit}`
  const filename = stringValue(resourceDownload?.filename)
  const filenameExtension = filename ? extname(filename) : ''
  if (filenameExtension) return filenameExtension
  try {
    const parsed = new URL(responseURL)
    const pathExtension = extname(basename(parsed.pathname))
    if (pathExtension) return pathExtension
  } catch {
    const pathExtension = extname(basename(responseURL))
    if (pathExtension) return pathExtension
  }
  return `.resource-${resourceId}`
}

function recordValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

function firstLine(value) {
  return stringValue(String(value ?? '').split(/\r?\n/)[0])
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
