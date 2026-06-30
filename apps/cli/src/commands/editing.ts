import type { Command } from 'commander'
import {
  editingCommandSpecs,
  runMovScriptEditingCommand,
  type EditingCommandSpec,
} from '@movscript/cli-commands'

interface EditingCliOptions {
  homeDir?: string
  workspace?: string
  projectDir?: string
  server?: string
  editingServiceUrl?: string
  token?: string
  editingProject?: string
  editingProjectId?: string
  projectId?: string
  taskId?: string
  outputPath?: string
  savePath?: string
  saveDirectory?: string
  hlsDirectory?: string
  manifestPath?: string
  segmentPaths?: string
  filename?: string
  mimeType?: string
  folderId?: string
  sourceResourceId?: string
  sourceDerivativeId?: string
  contentUnitId?: string
  resourceId?: string
  streamId?: string
  candidateId?: string
  outputKind?: string
  kind?: string
  status?: string
  editPlan?: string
  editDecisions?: string
  assetManifest?: string
  source?: string
  output?: string
  asset?: string
  assetId?: string
  assetType?: string
  track?: string
  trackId?: string
  trackType?: string
  zIndex?: string
  clip?: string
  clipId?: string
  patch?: string
  commands?: string
  command?: string
  targetTrackId?: string
  timelineStartMs?: string
  durationMs?: string
  splitTimeMs?: string
  retainSide?: string
  timelineAssembly?: string
  compileManifest?: string
  title?: string
  name?: string
  width?: string
  height?: string
  fps?: string
  background?: string
  defaultDurationMs?: string
  renderRuntime?: string
  format?: string
  target?: string
  mode?: string
  operation?: string
  tool?: string
  durationSec?: string
  inputResourceIds?: string
  sourceResourceIds?: string
  derivative?: string
  params?: string
  producer?: string
  provenance?: string
  promptSnapshot?: string
  productionId?: string
  productionPath?: string
  targetKind?: string
  targetRef?: string
  scopeKind?: string
  scopeRef?: string
  expectedRevision?: string
  workspaceBinding?: string
  importToResource?: boolean
  json?: boolean
}

export function registerEditingCommands(program: Command): void {
  const editing = program
    .command('editing')
    .description('Inspect and validate MediaEditingProject backend execution state')

  for (const spec of editingCommandSpecs) {
    const command = ensureCommandPath(editing, spec.cliPath)
    command.description(spec.description)
    addEditingOptions(command)
    command.action(async (options: EditingCliOptions, command: Command) => {
      await runEditingCommand(spec, options, command)
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

function addEditingOptions(command: Command): void {
  command
    .option('--home-dir <dir>', 'MovScript Home directory used to discover daemon and editing endpoints')
    .option('--workspace <dir>', 'Workspace root directory used for backend auth lookup')
    .option('--project-dir <dir>', 'MovScript project directory used for backend auth lookup')
    .option('--server <url>', 'Daemon gateway or Editing Service base URL')
    .option('--editing-service-url <url>', 'Explicit Editing Service base URL')
    .option('--token <token>', 'Backend bearer token')
    .option('--editing-project <json>', 'MediaEditingProject JSON object')
    .option('--editing-project-id <id>', 'Persisted MediaEditingProject id')
    .option('--project-id <id>', 'MovScript project id')
    .option('--task-id <id>', 'Editing or Media Pipeline task id')
    .option('--output-path <path>', 'Completed export output path')
    .option('--save-path <path>', 'Local file path to save a single-file export')
    .option('--save-directory <dir>', 'Local directory to save an HLS bundle')
    .option('--hls-directory <dir>', 'Directory containing HLS manifest and segments')
    .option('--manifest-path <path>', 'HLS manifest path')
    .option('--segment-paths <json>', 'HLS segment path array JSON')
    .option('--filename <name>', 'Export filename')
    .option('--mime-type <type>', 'Export MIME type')
    .option('--folder-id <id>', 'Resource library folder id')
    .option('--source-resource-id <id>', 'Source RawResource id')
    .option('--source-derivative-id <id>', 'Source derivative id')
    .option('--content-unit-id <id>', 'Content unit id for explicit candidate creation')
    .option('--resource-id <id>', 'RawResource id for explicit candidate creation')
    .option('--stream-id <id>', 'MediaStreamArtifact id; currently unsupported for candidates')
    .option('--candidate-id <id>', 'Optional candidate id')
    .option('--output-kind <kind>', 'Candidate output kind')
    .option('--kind <kind>', 'Alias for output kind')
    .option('--status <status>', 'Candidate status')
    .option('--edit-plan <json>', 'MovScript edit_plan artifact JSON')
    .option('--edit-decisions <json>', 'Edit decision artifact JSON')
    .option('--asset-manifest <json>', 'Asset manifest JSON')
    .option('--source <json>', 'Media Pipeline source descriptor JSON')
    .option('--output <json>', 'Media Pipeline output options JSON')
    .option('--asset <json>', 'MediaAssetDescriptor JSON')
    .option('--asset-id <id>', 'Media asset id')
    .option('--asset-type <type>', 'Media asset type for clip creation')
    .option('--track <json>', 'MediaTrack JSON')
    .option('--track-id <id>', 'Media timeline track id')
    .option('--track-type <type>', 'Media timeline track type')
    .option('--z-index <number>', 'Track z-index')
    .option('--clip <json>', 'MediaClip JSON')
    .option('--clip-id <id>', 'Media timeline clip id')
    .option('--patch <json>', 'MediaClip patch JSON')
    .option('--commands <json>', 'MediaTimelineCommand array JSON')
    .option('--command <json>', 'Single MediaTimelineCommand JSON')
    .option('--target-track-id <id>', 'Target track id for move operations')
    .option('--timeline-start-ms <ms>', 'Timeline start position in milliseconds')
    .option('--duration-ms <ms>', 'Clip duration in milliseconds')
    .option('--split-time-ms <ms>', 'Timeline split position in milliseconds')
    .option('--retain-side <side>', 'Split retain side')
    .option('--timeline-assembly <json>', 'TimelineAssembly JSON')
    .option('--compile-manifest <json>', 'CompileManifest JSON')
    .option('--title <title>', 'MediaEditingProject title')
    .option('--name <name>', 'Timeline track or project item name')
    .option('--width <px>', 'Project canvas width')
    .option('--height <px>', 'Project canvas height')
    .option('--fps <fps>', 'Project frames per second')
    .option('--background <color>', 'Project background color')
    .option('--default-duration-ms <ms>', 'Default clip duration in milliseconds')
    .option('--render-runtime <runtime>', 'Render runtime adapter, such as movscript_media_pipeline or ffmpeg')
    .option('--format <format>', 'Render output format, such as mp4 or hls')
    .option('--target <target>', 'Reframe target aspect or size')
    .option('--mode <mode>', 'Reframe mode, such as crop, contain, or pad')
    .option('--operation <name>', 'Derivative operation name')
    .option('--tool <name>', 'Derivative tool name')
    .option('--duration-sec <seconds>', 'Output duration in seconds')
    .option('--input-resource-ids <json>', 'Input RawResource id array JSON')
    .option('--source-resource-ids <json>', 'Source RawResource id array JSON')
    .option('--derivative <json>', 'Resource derivative metadata JSON')
    .option('--params <json>', 'Export/candidate parameter metadata JSON')
    .option('--producer <json>', 'Candidate producer metadata JSON')
    .option('--provenance <json>', 'Candidate provenance metadata JSON')
    .option('--prompt-snapshot <json>', 'Candidate prompt snapshot JSON')
    .option('--production-id <id>', 'Source production id')
    .option('--production-path <path>', 'Source production path')
    .option('--target-kind <kind>', 'Source target kind')
    .option('--target-ref <ref>', 'Source target ref')
    .option('--scope-kind <kind>', 'Source scope kind')
    .option('--scope-ref <ref>', 'Source scope ref')
    .option('--expected-revision <revision>', 'Expected MediaEditingProject revision for optimistic locking')
    .option('--workspace-binding <json>', 'MediaEditingProject workspace binding JSON')
    .option('--import-to-resource', 'Ask the render task output to be imported as a RawResource when supported')
    .option('--json', 'Print JSON output')
}

async function runEditingCommand(spec: EditingCommandSpec, options: EditingCliOptions, command: Command): Promise<void> {
  try {
    const execution = await runMovScriptEditingCommand(spec, editingArgs(options, command))
    console.log(JSON.stringify(execution, null, 2))
  } catch (error) {
    console.log(JSON.stringify({
      status: 'error',
      error: {
        code: 'editing_command_failed',
        message: errorMessage(error),
      },
    }, null, 2))
    process.exitCode = 1
  }
}

function editingArgs(options: EditingCliOptions, command: Command): Record<string, unknown> {
  const global = commandGlobalOptions(command)
  return compactRecord({
    homeDir: options.homeDir,
    workspaceDir: options.workspace ?? global.workspace,
    projectDir: options.projectDir,
    backendBaseURL: options.server ?? global.server,
    editingServiceURL: options.editingServiceUrl,
    token: options.token ?? global.token,
    editingProject: jsonArg(options.editingProject, '--editing-project'),
    editingProjectId: options.editingProjectId,
    projectId: options.projectId,
    taskId: options.taskId,
    outputPath: options.outputPath,
    savePath: options.savePath,
    saveDirectory: options.saveDirectory,
    hlsDirectory: options.hlsDirectory,
    manifestPath: options.manifestPath,
    segmentPaths: jsonArg(options.segmentPaths, '--segment-paths'),
    filename: options.filename,
    mimeType: options.mimeType,
    folderId: options.folderId,
    sourceResourceId: options.sourceResourceId,
    sourceDerivativeId: options.sourceDerivativeId,
    contentUnitId: options.contentUnitId,
    resourceId: numericArg(options.resourceId, '--resource-id') ?? options.resourceId,
    streamId: options.streamId,
    candidateId: options.candidateId,
    outputKind: options.outputKind,
    kind: options.kind,
    status: options.status,
    editPlan: jsonArg(options.editPlan, '--edit-plan'),
    editDecisions: jsonArg(options.editDecisions, '--edit-decisions'),
    assetManifest: jsonArg(options.assetManifest, '--asset-manifest'),
    source: jsonArg(options.source, '--source'),
    output: jsonArg(options.output, '--output'),
    asset: jsonArg(options.asset, '--asset'),
    assetId: options.assetId,
    assetType: options.assetType,
    track: jsonArg(options.track, '--track'),
    trackId: options.trackId,
    trackType: options.trackType,
    zIndex: numericArg(options.zIndex, '--z-index'),
    clip: jsonArg(options.clip, '--clip'),
    clipId: options.clipId,
    patch: jsonArg(options.patch, '--patch'),
    commands: jsonArg(options.commands, '--commands'),
    command: jsonArg(options.command, '--command'),
    targetTrackId: options.targetTrackId,
    timelineStartMs: numericArg(options.timelineStartMs, '--timeline-start-ms'),
    durationMs: numericArg(options.durationMs, '--duration-ms'),
    splitTimeMs: numericArg(options.splitTimeMs, '--split-time-ms'),
    retainSide: options.retainSide,
    timelineAssembly: jsonArg(options.timelineAssembly, '--timeline-assembly'),
    compileManifest: jsonArg(options.compileManifest, '--compile-manifest'),
    title: options.title,
    name: options.name,
    width: numericArg(options.width, '--width'),
    height: numericArg(options.height, '--height'),
    fps: numericArg(options.fps, '--fps'),
    background: options.background,
    defaultDurationMs: numericArg(options.defaultDurationMs, '--default-duration-ms'),
    renderRuntime: options.renderRuntime,
    format: options.format,
    target: options.target,
    mode: options.mode,
    operation: options.operation,
    tool: options.tool,
    durationSec: numericArg(options.durationSec, '--duration-sec'),
    inputResourceIds: jsonArg(options.inputResourceIds, '--input-resource-ids'),
    sourceResourceIds: jsonArg(options.sourceResourceIds, '--source-resource-ids'),
    derivative: jsonArg(options.derivative, '--derivative'),
    params: jsonArg(options.params, '--params'),
    producer: jsonArg(options.producer, '--producer'),
    provenance: jsonArg(options.provenance, '--provenance'),
    promptSnapshot: jsonArg(options.promptSnapshot, '--prompt-snapshot'),
    productionId: options.productionId,
    productionPath: options.productionPath,
    targetKind: options.targetKind,
    targetRef: options.targetRef,
    scopeKind: options.scopeKind,
    scopeRef: options.scopeRef,
    expectedRevision: numericArg(options.expectedRevision, '--expected-revision'),
    workspace: jsonArg(options.workspaceBinding, '--workspace-binding'),
    importToResource: options.importToResource === true ? true : undefined,
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

function jsonArg(value: string | undefined, flag: string): unknown {
  if (value === undefined) return undefined
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error(`${flag} must be valid JSON`)
  }
}

function numericArg(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a finite number`)
  return parsed
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
