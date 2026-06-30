import type { Command } from 'commander'
import {
  runMovScriptTimelineCommand,
  timelineCommandSpecs,
  type TimelineCommandSpec,
} from '@movscript/cli-commands'

interface TimelineCliOptions {
  homeDir?: string
  workspace?: string
  projectDir?: string
  server?: string
  token?: string
  timelineAssembly?: string
  editDecisions?: string
  assetManifest?: string
  compileManifest?: string
  backend?: string
  preferredBackend?: string
  renderRuntime?: string
  runtimeLocked?: boolean
  title?: string
  finishingProjectId?: string
  targetRef?: string
  scopeKind?: string
  scopeRef?: string
  width?: string
  height?: string
  fps?: string
  background?: string
  defaultDurationMs?: string
  json?: boolean
}

export function registerTimelineCommands(program: Command): void {
  const timeline = program
    .command('timeline')
    .description('Compile TimelineAssembly intent and select backend execution projects without requiring a frontend')

  for (const spec of timelineCommandSpecs) {
    const command = ensureCommandPath(timeline, spec.cliPath)
    command.description(spec.description)
    addTimelineOptions(command)
    command.action(async (options: TimelineCliOptions, command: Command) => {
      await runTimelineCommand(spec, options, command)
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

function addTimelineOptions(command: Command): void {
  command
    .option('--home-dir <dir>', 'MovScript Home directory used to discover the daemon gateway')
    .option('--workspace <dir>', 'Workspace root directory used for backend auth lookup')
    .option('--project-dir <dir>', 'MovScript project directory used for backend auth lookup')
    .option('--server <url>', 'Backend or daemon gateway base URL')
    .option('--token <token>', 'Backend bearer token')
    .option('--timeline-assembly <json>', 'TimelineAssembly intent JSON object')
    .option('--edit-decisions <json>', 'Edit decisions JSON object used to create CompileManifest')
    .option('--asset-manifest <json>', 'Asset manifest JSON object used to resolve edit decision refs')
    .option('--compile-manifest <json>', 'Existing CompileManifest JSON object for conformance reporting')
    .option('--backend <backend>', 'Target backend: media_editing_project, remotion, hyperframes, or external_nle')
    .option('--preferred-backend <backend>', 'Preferred backend for backend selection')
    .option('--render-runtime <runtime>', 'Optional locked render runtime')
    .option('--runtime-locked', 'Require backend selection to respect --render-runtime')
    .option('--title <title>', 'Optional backend project title')
    .option('--finishing-project-id <id>', 'Optional backend project id')
    .option('--target-ref <ref>', 'Timeline target ref used by assembly lookup diagnostics')
    .option('--scope-kind <kind>', 'Timeline namespace scope kind')
    .option('--scope-ref <ref>', 'Timeline namespace scope ref')
    .option('--width <number>', 'Render width')
    .option('--height <number>', 'Render height')
    .option('--fps <number>', 'Frames per second')
    .option('--background <color>', 'Composition background')
    .option('--default-duration-ms <number>', 'Default clip duration in milliseconds')
    .option('--json', 'Print JSON output')
}

async function runTimelineCommand(spec: TimelineCommandSpec, options: TimelineCliOptions, command: Command): Promise<void> {
  try {
    const execution = await runMovScriptTimelineCommand(spec, timelineArgs(options, command))
    console.log(JSON.stringify(execution, null, 2))
  } catch (error) {
    console.log(JSON.stringify({
      status: 'error',
      error: {
        code: 'timeline_command_failed',
        message: errorMessage(error),
      },
    }, null, 2))
    process.exitCode = 1
  }
}

function timelineArgs(options: TimelineCliOptions, command: Command): Record<string, unknown> {
  const global = commandGlobalOptions(command)
  return compactRecord({
    homeDir: options.homeDir,
    workspaceDir: options.workspace ?? global.workspace,
    projectDir: options.projectDir,
    backendBaseURL: options.server ?? global.server,
    token: options.token ?? global.token,
    timeline_assembly: jsonArg(options.timelineAssembly, '--timeline-assembly'),
    edit_decisions: jsonArg(options.editDecisions, '--edit-decisions'),
    asset_manifest: jsonArg(options.assetManifest, '--asset-manifest'),
    compile_manifest: jsonArg(options.compileManifest, '--compile-manifest'),
    backend: options.backend,
    preferred_backend: options.preferredBackend,
    render_runtime: options.renderRuntime,
    runtime_locked: options.runtimeLocked === true ? true : undefined,
    title: options.title,
    finishing_project_id: options.finishingProjectId,
    target_ref: options.targetRef,
    scope_kind: options.scopeKind,
    scope_ref: options.scopeRef,
    width: numericArg(options.width, '--width'),
    height: numericArg(options.height, '--height'),
    fps: numericArg(options.fps, '--fps'),
    background: options.background,
    default_duration_ms: numericArg(options.defaultDurationMs, '--default-duration-ms'),
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
  } catch {
    throw new Error(`${flag} must be valid JSON`)
  }
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
