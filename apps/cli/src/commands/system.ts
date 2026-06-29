import type { Command } from 'commander'
import {
  runMovScriptSystemCommand,
  systemCommandSpecs,
  type SystemCommandSpec,
} from '@movscript/cli-commands'

interface SystemCliOptions {
  homeDir?: string
  workspace?: string
  projectDir?: string
  server?: string
  token?: string
  capability?: string
  operation?: string
  modelOperation?: string
  modelId?: string
  providerId?: string
  parameterMode?: string
  prompt?: string
  name?: string
  description?: string
  summary?: string
  title?: string
  projectId?: string
  projectUid?: string
  projectTitle?: string
  totalEpisodes?: string
  language?: string
  sourceLanguage?: string
  targetLanguage?: string
  cutStrategy?: string
  contentUnitId?: string
  candidateId?: string
  candidatePolicy?: string
  outputKind?: string
  jobId?: string
  jobIds?: string
  taskId?: string
  streamId?: string
  verbosity?: string
  overwrite?: boolean
  query?: string
  id?: string
  resourceId?: string
  sourceId?: string
  sourceResourceId?: string
  sourceResourceIds?: string
  sourceDerivativeId?: string
  groupId?: string
  shotReferenceId?: string
  type?: string
  mediaType?: string
  scope?: string
  folderId?: string
  orientation?: string
  page?: string
  pageSize?: string
  limit?: string
  localPath?: string
  artifactPath?: string
  workspacePath?: string
  dataUrl?: string
  base64?: string
  filename?: string
  mimeType?: string
  mode?: string
  detail?: string
  outputFormat?: string
  imageSize?: string
  negativePrompt?: string
  aspectRatio?: string
  quality?: string
  voice?: string
  model?: string
  audioFormat?: string
  responseFormat?: string
  subtitleFormat?: string
  style?: string
  instructions?: string
  imageFormat?: string
  maxBytes?: string
  maxSourceBytes?: string
  maxUploadBytes?: string
  maxVideoBytes?: string
  maxWidth?: string
  maxHeight?: string
  width?: string
  height?: string
  cropX?: string
  cropY?: string
  cropWidth?: string
  cropHeight?: string
  count?: string
  frameCount?: string
  maxFrames?: string
  timestampsSec?: string
  timestampSec?: string
  startSec?: string
  endSec?: string
  durationSec?: string
  duration?: string
  sceneThreshold?: string
  minShotDurationSec?: string
  maxShotDurationSec?: string
  centerSec?: string
  windowSec?: string
  intervalSec?: string
  fps?: string
  steps?: string
  seed?: string
  speed?: string
  timeoutMs?: string
  pollIntervalMs?: string
  volume?: string
  muted?: boolean
  columns?: string
  thumbWidth?: string
  outputPath?: string
  filePath?: string
  manifestPath?: string
  segmentPaths?: string
  durationMs?: string
  expiresAt?: string
  expiresInSeconds?: string
  tool?: string
  annotations?: string
  shapes?: string
  items?: string
  shots?: string
  generationIntent?: string
  inputResourceIds?: string
  referenceResourceIds?: string
  extraParams?: string
  promptSnapshot?: string
  metadata?: string
  derivative?: string
  params?: string
  continueOnError?: boolean
  maxConcurrency?: string
  referenceAsset?: string[]
  providerVariants?: boolean
  includeProviderVariants?: boolean
  includeModels?: boolean
  includeFull?: boolean
  includeDisabled?: boolean
  frontendOrigin?: string
  mcpBaseUrl?: string
  json?: boolean
}

export function registerSystemCommands(program: Command): void {
  const system = program
    .command('system')
    .description('Run MovScript system capability commands through the shared CLI/MCP command runner')

  for (const spec of systemCommandSpecs) {
    const command = ensureCommandPath(system, spec.cliPath)
    command.description(spec.description)
    addSystemOptions(command)
    command.action(async (options: SystemCliOptions, command: Command) => {
      await runSystemCommand(spec, options, command)
    })
  }
}

function ensureCommandPath(root: Command, path: string[]): Command {
  let current = root
  for (const segment of path) {
    let child = current.commands.find((candidate) => candidate.name() === segment)
    if (!child) child = current.command(segment)
    current = child
  }
  return current
}

function addSystemOptions(command: Command): void {
  command
    .option('--home-dir <dir>', 'MovScript Home directory used to discover the daemon gateway')
    .option('--workspace <dir>', 'Workspace root directory used for backend auth lookup')
    .option('--project-dir <dir>', 'MovScript project directory used for backend auth lookup')
    .option('--server <url>', 'Backend or daemon gateway base URL')
    .option('--token <token>', 'Backend bearer token')
    .option('--capability <name>', 'Generation capability such as image_generation or video_generation')
    .option('--operation <name>', 'Model or generation operation such as text_to_image')
    .option('--model-operation <name>', 'Alias for --operation used by model list')
    .option('--model-id <id>', 'Generation model id where supported')
    .option('--provider-id <id>', 'Generation provider id where supported')
    .option('--parameter-mode <mode>', 'Generation parameter mode, compatible or strict')
    .option('--prompt <text>', 'Generation prompt where supported')
    .option('--name <name>', 'Project or record name where supported')
    .option('--description <text>', 'Project or record description where supported')
    .option('--summary <text>', 'Record summary where supported')
    .option('--title <title>', 'Local project title where supported')
    .option('--project-id <id>', 'Local project ID where supported')
    .option('--project-uid <uid>', 'MovScript backend project UID where supported')
    .option('--project-title <title>', 'Project title used in generation request context where supported')
    .option('--total-episodes <number>', 'Project episode count where supported')
    .option('--language <code>', 'Local project language where supported')
    .option('--source-language <code>', 'Source language where supported')
    .option('--target-language <code>', 'Target language where supported')
    .option('--cut-strategy <strategy>', 'Shot group cut strategy where supported')
    .option('--content-unit-id <id>', 'Content unit id where supported')
    .option('--candidate-id <id>', 'Candidate id where supported')
    .option('--candidate-policy <policy>', 'Generation candidate policy where supported')
    .option('--output-kind <kind>', 'Generation output kind where supported')
    .option('--job-id <id>', 'Generation job id where supported')
    .option('--job-ids <json>', 'JSON array of generation job ids')
    .option('--task-id <id>', 'Runtime or artifact task id where supported')
    .option('--stream-id <id>', 'Media stream artifact id where supported')
    .option('--verbosity <mode>', 'Generation job verbosity, summary or debug')
    .option('--overwrite', 'Overwrite existing local project metadata where supported')
    .option('--query <text>', 'Search query')
    .option('--id <id>', 'Generic record ID alias accepted by selected system commands')
    .option('--resource-id <id>', 'MovScript RawResource ID')
    .option('--source-id <id>', 'External resource source ID')
    .option('--source-resource-id <id>', 'Source RawResource ID where supported')
    .option('--source-resource-ids <json>', 'JSON array of source RawResource IDs where supported')
    .option('--source-derivative-id <id>', 'Source derivative ID where supported')
    .option('--group-id <id>', 'Shot reference group ID')
    .option('--shot-reference-id <id>', 'Shot reference ID')
    .option('--type <type>', 'Resource type filter')
    .option('--media-type <type>', 'Media type filter')
    .option('--scope <scope>', 'Resource scope filter')
    .option('--folder-id <id>', 'Resource folder filter')
    .option('--orientation <orientation>', 'External media orientation filter')
    .option('--page <number>', '1-based page number')
    .option('--page-size <number>', 'Page size')
    .option('--limit <number>', 'Alias for page size where supported')
    .option('--local-path <path>', 'Local artifact path where supported')
    .option('--artifact-path <path>', 'Agent artifact path where supported')
    .option('--workspace-path <path>', 'Path under the MovScript workspace where supported')
    .option('--data-url <url>', 'Data URL input where supported')
    .option('--base64 <value>', 'Base64 payload input where supported')
    .option('--filename <name>', 'Output or upload filename where supported')
    .option('--mime-type <type>', 'MIME type where supported')
    .option('--mode <mode>', 'Tool-specific mode value')
    .option('--detail <detail>', 'Image detail hint where supported')
    .option('--output-format <format>', 'Output format where supported')
    .option('--image-size <size>', 'Generation image size where supported')
    .option('--negative-prompt <text>', 'Generation negative prompt where supported')
    .option('--aspect-ratio <ratio>', 'Generation aspect ratio where supported')
    .option('--quality <quality>', 'Generation quality where supported')
    .option('--voice <voice>', 'Voice id or name where supported')
    .option('--model <model>', 'Provider-specific model parameter where supported')
    .option('--audio-format <format>', 'Audio format where supported')
    .option('--response-format <format>', 'Response format where supported')
    .option('--subtitle-format <format>', 'Subtitle format where supported')
    .option('--style <style>', 'Style hint where supported')
    .option('--instructions <text>', 'Generation instructions where supported')
    .option('--image-format <format>', 'Image format where supported')
    .option('--max-bytes <number>', 'Maximum byte count where supported')
    .option('--max-source-bytes <number>', 'Maximum source byte count where supported')
    .option('--max-upload-bytes <number>', 'Maximum upload byte count where supported')
    .option('--max-video-bytes <number>', 'Maximum source video byte count where supported')
    .option('--max-width <number>', 'Maximum width where supported')
    .option('--max-height <number>', 'Maximum height where supported')
    .option('--width <number>', 'Width where supported')
    .option('--height <number>', 'Height where supported')
    .option('--crop-x <number>', 'Crop x coordinate where supported')
    .option('--crop-y <number>', 'Crop y coordinate where supported')
    .option('--crop-width <number>', 'Crop width where supported')
    .option('--crop-height <number>', 'Crop height where supported')
    .option('--count <number>', 'Count where supported')
    .option('--frame-count <number>', 'Frame count where supported')
    .option('--max-frames <number>', 'Maximum frame count where supported')
    .option('--timestamps-sec <json>', 'JSON array of timestamps in seconds')
    .option('--timestamp-sec <number>', 'Timestamp in seconds where supported')
    .option('--start-sec <number>', 'Start time in seconds where supported')
    .option('--end-sec <number>', 'End time in seconds where supported')
    .option('--duration-sec <number>', 'Duration in seconds where supported')
    .option('--duration <number>', 'Generation duration where supported')
    .option('--scene-threshold <number>', 'FFmpeg scene detection threshold where supported')
    .option('--min-shot-duration-sec <number>', 'Minimum shot duration in seconds where supported')
    .option('--max-shot-duration-sec <number>', 'Maximum shot duration in seconds where supported')
    .option('--center-sec <number>', 'Center time in seconds where supported')
    .option('--window-sec <number>', 'Window duration in seconds where supported')
    .option('--interval-sec <number>', 'Sampling interval in seconds where supported')
    .option('--fps <number>', 'Frames per second where supported')
    .option('--steps <number>', 'Generation step count where supported')
    .option('--seed <number>', 'Generation seed where supported')
    .option('--speed <number>', 'Generation speed where supported')
    .option('--timeout-ms <number>', 'Generation timeout in milliseconds where supported')
    .option('--poll-interval-ms <number>', 'Generation polling interval in milliseconds where supported')
    .option('--volume <number>', 'Volume percentage where supported')
    .option('--muted', 'Mute audio where supported')
    .option('--columns <number>', 'Column count where supported')
    .option('--thumb-width <number>', 'Thumbnail width where supported')
    .option('--output-path <path>', 'Explicit output artifact path where supported')
    .option('--file-path <path>', 'Explicit file path where supported')
    .option('--manifest-path <path>', 'HLS manifest path where supported')
    .option('--segment-paths <json>', 'JSON array of HLS segment paths where supported')
    .option('--duration-ms <number>', 'Duration in milliseconds where supported')
    .option('--expires-at <iso>', 'Expiration timestamp where supported')
    .option('--expires-in-seconds <number>', 'Expiration window in seconds where supported')
    .option('--tool <name>', 'Producer tool name where supported')
    .option('--annotations <json>', 'JSON array of annotation shapes')
    .option('--shapes <json>', 'Alias for --annotations')
    .option('--items <json>', 'JSON array of item objects')
    .option('--shots <json>', 'JSON array of shot metadata objects')
    .option('--generation-intent <json>', 'JSON generation intent object')
    .option('--input-resource-ids <json>', 'JSON array of input RawResource IDs')
    .option('--reference-resource-ids <json>', 'JSON array of reference RawResource IDs')
    .option('--extra-params <json>', 'JSON object of generation extra parameters')
    .option('--prompt-snapshot <json>', 'JSON prompt snapshot object')
    .option('--metadata <json>', 'JSON metadata object')
    .option('--derivative <json>', 'JSON derivative metadata object')
    .option('--params <json>', 'JSON params object where supported')
    .option('--continue-on-error', 'Continue batch processing after item errors where supported')
    .option('--max-concurrency <number>', 'Maximum batch concurrency where supported')
    .option('--reference-asset <role[:media_type]...>', 'Reference asset intent; repeat for multiple assets', collect)
    .option('--provider-variants', 'Include provider variant routing hints when supported')
    .option('--include-provider-variants', 'Alias for --provider-variants')
    .option('--include-models', 'Include model counts for generation capabilities')
    .option('--include-full', 'Return full backend records where supported')
    .option('--include-disabled', 'Include disabled records where supported')
    .option('--frontend-origin <url>', 'Frontend origin for open-surface commands')
    .option('--mcp-base-url <url>', 'MCP server origin for open-surface commands')
    .option('--json', 'Print JSON output')
}

async function runSystemCommand(spec: SystemCommandSpec, options: SystemCliOptions, command: Command): Promise<void> {
  try {
    const execution = await runMovScriptSystemCommand(spec, systemArgs(options, command))
    console.log(JSON.stringify(execution, null, 2))
  } catch (error) {
    console.log(JSON.stringify({
      status: 'error',
      error: {
        code: 'system_command_failed',
        message: errorMessage(error),
      },
    }, null, 2))
    process.exitCode = 1
  }
}

function systemArgs(options: SystemCliOptions, command: Command): Record<string, unknown> {
  const global = commandGlobalOptions(command)
  return compactRecord({
    homeDir: options.homeDir,
    workspaceDir: options.workspace ?? global.workspace,
    projectDir: options.projectDir,
    backendBaseURL: options.server ?? global.server,
    token: options.token ?? global.token,
    capability: options.capability,
    operation: options.operation,
    model_operation: options.modelOperation,
    model_id: options.modelId,
    provider_id: options.providerId,
    parameter_mode: options.parameterMode,
    prompt: options.prompt,
    name: options.name,
    description: options.description,
    summary: options.summary,
    title: options.title,
    project_id: options.projectId,
    project_uid: options.projectUid,
    project_title: options.projectTitle,
    total_episodes: numericArg(options.totalEpisodes, '--total-episodes'),
    language: options.language,
    source_language: options.sourceLanguage,
    target_language: options.targetLanguage,
    cut_strategy: options.cutStrategy,
    content_unit_id: options.contentUnitId,
    candidate_id: options.candidateId,
    candidate_policy: options.candidatePolicy,
    output_kind: options.outputKind,
    job_id: numericArg(options.jobId, '--job-id'),
    job_ids: jsonArg(options.jobIds, '--job-ids'),
    task_id: options.taskId,
    stream_id: options.streamId,
    verbosity: options.verbosity,
    overwrite: options.overwrite === true ? true : undefined,
    query: options.query,
    id: numericArg(options.id, '--id'),
    resource_id: numericArg(options.resourceId, '--resource-id'),
    source_id: numericArg(options.sourceId, '--source-id'),
    source_resource_id: numericArg(options.sourceResourceId, '--source-resource-id'),
    source_resource_ids: jsonArg(options.sourceResourceIds, '--source-resource-ids'),
    source_derivative_id: options.sourceDerivativeId,
    group_id: numericArg(options.groupId, '--group-id'),
    shot_reference_id: numericArg(options.shotReferenceId, '--shot-reference-id'),
    type: options.type,
    media_type: options.mediaType,
    scope: options.scope,
    folder_id: options.folderId,
    orientation: options.orientation,
    page: numericArg(options.page, '--page'),
    page_size: numericArg(options.pageSize, '--page-size'),
    limit: numericArg(options.limit, '--limit'),
    local_path: options.localPath,
    artifact_path: options.artifactPath,
    workspace_path: options.workspacePath,
    data_url: options.dataUrl,
    base64: options.base64,
    filename: options.filename,
    mime_type: options.mimeType,
    mode: options.mode,
    detail: options.detail,
    output_format: options.outputFormat,
    image_size: options.imageSize,
    negative_prompt: options.negativePrompt,
    aspect_ratio: options.aspectRatio,
    quality: options.quality,
    voice: options.voice,
    model: options.model,
    audio_format: options.audioFormat,
    response_format: options.responseFormat,
    subtitle_format: options.subtitleFormat,
    style: options.style,
    instructions: options.instructions,
    image_format: options.imageFormat,
    max_bytes: numericArg(options.maxBytes, '--max-bytes'),
    max_source_bytes: numericArg(options.maxSourceBytes, '--max-source-bytes'),
    max_upload_bytes: numericArg(options.maxUploadBytes, '--max-upload-bytes'),
    max_video_bytes: numericArg(options.maxVideoBytes, '--max-video-bytes'),
    max_width: numericArg(options.maxWidth, '--max-width'),
    max_height: numericArg(options.maxHeight, '--max-height'),
    width: numericArg(options.width, '--width'),
    height: numericArg(options.height, '--height'),
    crop_x: numericArg(options.cropX, '--crop-x'),
    crop_y: numericArg(options.cropY, '--crop-y'),
    crop_width: numericArg(options.cropWidth, '--crop-width'),
    crop_height: numericArg(options.cropHeight, '--crop-height'),
    count: numericArg(options.count, '--count'),
    frame_count: numericArg(options.frameCount, '--frame-count'),
    max_frames: numericArg(options.maxFrames, '--max-frames'),
    timestamps_sec: jsonArg(options.timestampsSec, '--timestamps-sec'),
    timestamp_sec: numericArg(options.timestampSec, '--timestamp-sec'),
    start_sec: numericArg(options.startSec, '--start-sec'),
    end_sec: numericArg(options.endSec, '--end-sec'),
    duration_sec: numericArg(options.durationSec, '--duration-sec'),
    duration: numericArg(options.duration, '--duration'),
    scene_threshold: numericArg(options.sceneThreshold, '--scene-threshold'),
    min_shot_duration_sec: numericArg(options.minShotDurationSec, '--min-shot-duration-sec'),
    max_shot_duration_sec: numericArg(options.maxShotDurationSec, '--max-shot-duration-sec'),
    center_sec: numericArg(options.centerSec, '--center-sec'),
    window_sec: numericArg(options.windowSec, '--window-sec'),
    interval_sec: numericArg(options.intervalSec, '--interval-sec'),
    fps: numericArg(options.fps, '--fps'),
    steps: numericArg(options.steps, '--steps'),
    seed: numericArg(options.seed, '--seed'),
    speed: numericArg(options.speed, '--speed'),
    timeout_ms: numericArg(options.timeoutMs, '--timeout-ms'),
    poll_interval_ms: numericArg(options.pollIntervalMs, '--poll-interval-ms'),
    volume: numericArg(options.volume, '--volume'),
    muted: options.muted === true ? true : undefined,
    columns: numericArg(options.columns, '--columns'),
    thumb_width: numericArg(options.thumbWidth, '--thumb-width'),
    output_path: options.outputPath,
    file_path: options.filePath,
    manifest_path: options.manifestPath,
    segment_paths: jsonArg(options.segmentPaths, '--segment-paths'),
    duration_ms: numericArg(options.durationMs, '--duration-ms'),
    expires_at: options.expiresAt,
    expires_in_seconds: numericArg(options.expiresInSeconds, '--expires-in-seconds'),
    tool: options.tool,
    annotations: jsonArg(options.annotations, '--annotations'),
    shapes: jsonArg(options.shapes, '--shapes'),
    items: jsonArg(options.items, '--items'),
    shots: jsonArg(options.shots, '--shots'),
    generation_intent: jsonArg(options.generationIntent, '--generation-intent'),
    input_resource_ids: jsonArg(options.inputResourceIds, '--input-resource-ids'),
    reference_resource_ids: jsonArg(options.referenceResourceIds, '--reference-resource-ids'),
    extra_params: jsonArg(options.extraParams, '--extra-params'),
    prompt_snapshot: jsonArg(options.promptSnapshot, '--prompt-snapshot'),
    metadata: jsonArg(options.metadata, '--metadata'),
    derivative: jsonArg(options.derivative, '--derivative'),
    params: jsonArg(options.params, '--params'),
    continue_on_error: options.continueOnError === true ? true : undefined,
    max_concurrency: numericArg(options.maxConcurrency, '--max-concurrency'),
    reference_assets: parseReferenceAssets(options.referenceAsset),
    provider_variants: options.providerVariants === true || options.includeProviderVariants === true ? true : undefined,
    include_provider_variants: options.includeProviderVariants === true ? true : undefined,
    include_models: options.includeModels === true ? true : undefined,
    include_full: options.includeFull === true ? true : undefined,
    include_disabled: options.includeDisabled === true ? true : undefined,
    frontend_origin: options.frontendOrigin,
    mcp_base_url: options.mcpBaseUrl,
  })
}

function commandGlobalOptions(command: Command): { server?: string; token?: string; workspace?: string } {
  const root = rootCommand(command)
  const options = root.opts()
  const serverSource = root.getOptionValueSource?.('server')
  return {
    server: serverSource && serverSource !== 'default' && typeof options.server === 'string' ? options.server : undefined,
    token: typeof options.token === 'string' ? options.token : process.env.MOVSCRIPT_DATA_SERVICE_TOKEN,
    workspace: typeof options.workspace === 'string' ? options.workspace : undefined,
  }
}

function rootCommand(command: Command): Command {
  let current = command
  while (current.parent) current = current.parent
  return current
}

function parseReferenceAssets(values: string[] | undefined): Array<{ role: string; media_type?: string }> | undefined {
  if (!values || values.length === 0) return undefined
  return values.map((value) => {
    const [roleRaw, mediaTypeRaw] = value.split(':', 2)
    const role = roleRaw?.trim()
    const mediaType = mediaTypeRaw?.trim()
    if (!role) throw new Error(`invalid --reference-asset value: ${value}`)
    return {
      role,
      ...(mediaType ? { media_type: mediaType } : {}),
    }
  })
}

function collect(value: string, previous: string[] = []): string[] {
  previous.push(value)
  return previous
}

function numericArg(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a finite number`)
  return parsed
}

function jsonArg(value: string | undefined, flag: string): unknown {
  if (value === undefined) return undefined
  try {
    return JSON.parse(value) as unknown
  } catch (error) {
    throw new Error(`${flag} must be valid JSON`)
  }
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
