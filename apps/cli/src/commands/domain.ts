import type { Command } from 'commander'
import {
  domainCommandSpecs,
  runMovScriptDomainCommand,
  type DomainCommandSpec,
} from '@movscript/cli-commands'

interface DomainCliOptions {
  homeDir?: string
  workspace?: string
  projectDir?: string
  cwd?: string
  server?: string
  projectServiceUrl?: string
  token?: string
  projectId?: string
  providerScopeId?: string
  projectUid?: string
  projectTitle?: string
  scopeKind?: string
  scopeId?: string
  user?: string
  org?: string
  entityKind?: string
  entityId?: string
  query?: string
  productionId?: string
  segmentId?: string
  sceneMomentId?: string
  expressionUnitId?: string
  storyboardId?: string
  contentUnitId?: string
  settingId?: string
  settingStateId?: string
  assetId?: string
  candidateId?: string
  resourceId?: string
  outputKind?: string
  kind?: string
  source?: string
  status?: string
  mimeType?: string
  width?: string
  height?: string
  durationSec?: string
  decision?: string
  stalePolicy?: string
  reason?: string
  decidedAt?: string
  limit?: string
  commit?: string
  checkpointHash?: string
  projectName?: string
  sceneName?: string
  defaultDurationSec?: string
  target?: string
  targetKind?: string
  provider?: string
  providerKey?: string
  model?: string
  groupId?: string
  groupRef?: string
  assetGroupId?: string
  assetGroupName?: string
  sourceUrl?: string
  name?: string
  timeoutMs?: string
  nonce?: string
  include?: string
  targetPath?: string
  namespacePath?: string
  timelineNamespacePath?: string
  parentPath?: string
  expressionUnitPath?: string
  sceneMomentPath?: string
  keyframeId?: string
  audioCueId?: string
  scriptId?: string
  versionId?: string
  versionLabel?: string
  sourceText?: string
  sourcePath?: string
  payload?: string
  record?: string
  entity?: string
  projectStyle?: string
  setting?: string
  states?: string
  unit?: string
  namespace?: string
  root?: string
  tree?: string
  nodes?: string
  namespaces?: string
  timelineNamespaces?: string
  production?: string
  segments?: string
  contentUnits?: string
  segment?: string
  sceneMoment?: string
  keyframe?: string
  storyboard?: string
  audioCue?: string
  expressionUnit?: string
  editPrompt?: string
  transition?: string
  timeline?: string
  outputs?: string
  items?: string
  producer?: string
  promptSnapshot?: string
  metadata?: string
  targetRecord?: string
  continueOnError?: boolean
  allowPrivateUrls?: boolean
  lock?: boolean
  json?: boolean
}

export function registerDomainCommands(program: Command): void {
  const domain = program
    .command('domain')
    .description('Inspect and change MovScript project domain state without requiring a frontend')

  for (const spec of domainCommandSpecs) {
    const command = ensureCommandPath(domain, spec.cliPath)
    command.description(spec.description)
    addDomainOptions(command)
    command.action(async (options: DomainCliOptions, command: Command) => {
      await runDomainCommand(spec, options, command)
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

function addDomainOptions(command: Command): void {
  command
    .option('--home-dir <dir>', 'MovScript Home directory used to discover daemon and project endpoints')
    .option('--workspace <dir>', 'Workspace root directory used for backend auth lookup')
    .option('--project-dir <dir>', 'MovScript project directory')
    .option('--cwd <dir>', 'Alias for --project-dir')
    .option('--server <url>', 'Daemon gateway or Project Service base URL')
    .option('--project-service-url <url>', 'Explicit Project Service base URL')
    .option('--token <token>', 'Backend bearer token')
    .option('--provider-scope-id <id>', 'Provider asset-library project/group scope id')
    .option('--project-id <id>', 'Deprecated alias for --provider-scope-id; not a MovScript source project locator')
    .option('--project-uid <uid>', 'Project uid used for scoped candidate decisions')
    .option('--project-title <title>', 'Project title for scoped candidate decisions')
    .option('--scope-kind <kind>', 'Scoped project-data decision scope kind: user or org')
    .option('--scope-id <id>', 'Scoped project-data decision scope id')
    .option('--user <id>', 'Workspace user id')
    .option('--org <id>', 'Workspace organization id')
    .option('--entity-kind <kind>', 'Domain entity kind')
    .option('--entity-id <id>', 'Domain entity id')
    .option('--query <text>', 'Free-text query')
    .option('--production-id <id>', 'Production id')
    .option('--segment-id <id>', 'Segment id')
    .option('--scene-moment-id <id>', 'Scene moment id')
    .option('--expression-unit-id <id>', 'Expression unit id')
    .option('--storyboard-id <id>', 'Storyboard id')
    .option('--content-unit-id <id>', 'Content unit id')
    .option('--setting-id <id>', 'Setting id')
    .option('--setting-state-id <id>', 'Setting state id')
    .option('--asset-id <id>', 'Asset id')
    .option('--candidate-id <id>', 'Candidate id')
    .option('--resource-id <id>', 'RawResource id')
    .option('--output-kind <kind>', 'Candidate output kind')
    .option('--kind <kind>', 'Alias for output kind')
    .option('--source <source>', 'Candidate source')
    .option('--status <status>', 'Candidate status')
    .option('--mime-type <type>', 'Candidate output MIME type')
    .option('--width <px>', 'Candidate output width')
    .option('--height <px>', 'Candidate output height')
    .option('--duration-sec <seconds>', 'Candidate output duration in seconds')
    .option('--decision <decision>', 'Candidate decision: adopt, reject, or defer')
    .option('--stale-policy <policy>', 'Stale candidate policy')
    .option('--reason <text>', 'Decision or selection reason')
    .option('--decided-at <iso>', 'Decision timestamp')
    .option('--limit <number>', 'Maximum number of records to return')
    .option('--commit <ref>', 'Git commit/ref used by diagnostics')
    .option('--checkpoint-hash <hash>', 'Compatibility alias for --commit')
    .option('--project-name <name>', 'Editing handoff project name')
    .option('--scene-name <name>', 'Editing handoff scene name')
    .option('--default-duration-sec <seconds>', 'Default edit-plan clip duration in seconds')
    .option('--target <ref>', 'Optional affected target ref')
    .option('--target-kind <kind>', 'Legacy inline candidate target kind')
    .option('--provider <id>', 'Provider id or provider kind selector')
    .option('--provider-key <id>', 'Provider key alias')
    .option('--model <id>', 'Provider model id')
    .option('--group-id <id>', 'Remote provider asset group id')
    .option('--group-ref <id>', 'Remote provider asset group ref alias')
    .option('--asset-group-id <id>', 'Remote provider asset group id alias')
    .option('--asset-group-name <name>', 'Remote provider asset group display name')
    .option('--source-url <url>', 'Provider certification source URL override')
    .option('--name <name>', 'Provider certification display name')
    .option('--timeout-ms <ms>', 'Provider operation timeout in milliseconds')
    .option('--nonce <value>', 'Legacy inline candidate nonce')
    .option('--include <json>', 'JSON array of query include keys')
    .option('--target-path <path>', 'Source target path')
    .option('--namespace-path <path>', 'Timeline namespace source path')
    .option('--timeline-namespace-path <path>', 'Alias for --namespace-path')
    .option('--parent-path <path>', 'Parent source path for path-first writes')
    .option('--expression-unit-path <path>', 'Expression unit source path')
    .option('--scene-moment-path <path>', 'Scene moment source path')
    .option('--keyframe-id <id>', 'Keyframe id')
    .option('--audio-cue-id <id>', 'Audio cue id')
    .option('--script-id <id>', 'Script id')
    .option('--version-id <id>', 'Script version id')
    .option('--version-label <label>', 'Script version label')
    .option('--source-text <text>', 'Script Markdown source text')
    .option('--source-path <path>', 'Script source path')
    .option('--payload <json>', 'Generic source write payload JSON')
    .option('--record <json>', 'Existing source record JSON')
    .option('--entity <json>', 'Existing source entity JSON')
    .option('--project-style <json>', 'Project style/standards JSON')
    .option('--setting <json>', 'Setting source JSON')
    .option('--states <json>', 'Setting-state tree JSON array')
    .option('--unit <json>', 'Content unit source JSON')
    .option('--namespace <json>', 'Timeline namespace source JSON')
    .option('--root <json>', 'Timeline namespace root JSON')
    .option('--tree <json>', 'Timeline namespace tree JSON')
    .option('--nodes <json>', 'Timeline namespace node array JSON')
    .option('--namespaces <json>', 'Timeline namespace array JSON')
    .option('--timeline-namespaces <json>', 'Timeline namespace array JSON alias')
    .option('--production <json>', 'Production source JSON')
    .option('--segments <json>', 'Segment array JSON')
    .option('--content-units <json>', 'Content unit array JSON')
    .option('--segment <json>', 'Segment source JSON')
    .option('--scene-moment <json>', 'Scene moment source JSON')
    .option('--keyframe <json>', 'Keyframe source JSON')
    .option('--storyboard <json>', 'Storyboard source JSON')
    .option('--audio-cue <json>', 'Audio cue source JSON')
    .option('--expression-unit <json>', 'Expression unit source JSON')
    .option('--edit-prompt <json>', 'Content unit edit_prompt JSON')
    .option('--transition <json>', 'Entity transition JSON')
    .option('--timeline <json>', 'Storyboard timeline JSON')
    .option('--outputs <json>', 'Candidate outputs array JSON')
    .option('--items <json>', 'Batch item array JSON')
    .option('--producer <json>', 'Candidate producer metadata JSON')
    .option('--prompt-snapshot <json>', 'Candidate prompt snapshot JSON')
    .option('--metadata <json>', 'Decision or output metadata JSON')
    .option('--target-record <json>', 'Legacy inline candidate target record JSON')
    .option('--continue-on-error', 'Continue batch commands after an item fails')
    .option('--allow-private-urls', 'Allow private URLs for provider asset certification')
    .option('--lock', 'Lock a legacy inline candidate when supported')
    .option('--json', 'Print JSON output')
}

async function runDomainCommand(spec: DomainCommandSpec, options: DomainCliOptions, command: Command): Promise<void> {
  try {
    const execution = await runMovScriptDomainCommand(spec, domainArgs(options, command))
    console.log(JSON.stringify(execution, null, 2))
  } catch (error) {
    console.log(JSON.stringify({
      status: 'error',
      error: {
        code: 'domain_command_failed',
        message: errorMessage(error),
      },
    }, null, 2))
    process.exitCode = 1
  }
}

function domainArgs(options: DomainCliOptions, command: Command): Record<string, unknown> {
  const global = commandGlobalOptions(command)
  return compactRecord({
    homeDir: options.homeDir,
    workspaceDir: options.workspace ?? global.workspace,
    projectDir: options.projectDir ?? options.cwd,
    backendBaseURL: options.server ?? global.server,
    projectServiceURL: options.projectServiceUrl,
    token: options.token ?? global.token,
    providerScopeId: options.providerScopeId,
    projectId: options.projectId,
    projectUid: options.projectUid ?? process.env.MOVSCRIPT_PROJECT_UID,
    projectTitle: options.projectTitle ?? process.env.MOVSCRIPT_PROJECT_TITLE,
    scopeKind: options.scopeKind ?? process.env.MOVSCRIPT_SCOPE_KIND,
    scopeId: options.scopeId ?? process.env.MOVSCRIPT_SCOPE_ID,
    userId: options.user ?? process.env.MOVSCRIPT_USER_ID,
    orgId: options.org ?? process.env.MOVSCRIPT_ORG_ID,
    entityKind: options.entityKind,
    entityId: options.entityId,
    query: options.query,
    productionId: options.productionId,
    segmentId: options.segmentId,
    sceneMomentId: options.sceneMomentId,
    expressionUnitId: options.expressionUnitId,
    storyboardId: options.storyboardId,
    contentUnitId: options.contentUnitId,
    settingId: options.settingId,
    settingStateId: options.settingStateId,
    assetId: options.assetId,
    candidateId: options.candidateId,
    resourceId: numericArg(options.resourceId, '--resource-id'),
    outputKind: options.outputKind,
    kind: options.kind,
    source: options.source,
    status: options.status,
    mimeType: options.mimeType,
    width: numericArg(options.width, '--width'),
    height: numericArg(options.height, '--height'),
    durationSec: numericArg(options.durationSec, '--duration-sec'),
    decision: options.decision,
    stalePolicy: options.stalePolicy,
    reason: options.reason,
    decidedAt: options.decidedAt,
    limit: numericArg(options.limit, '--limit'),
    commit: options.commit,
    checkpointHash: options.checkpointHash,
    projectName: options.projectName,
    sceneName: options.sceneName,
    defaultDurationSec: numericArg(options.defaultDurationSec, '--default-duration-sec'),
    target: options.target,
    targetKind: options.targetKind,
    provider: options.provider,
    providerKey: options.providerKey,
    model: options.model,
    groupId: options.groupId,
    groupRef: options.groupRef,
    assetGroupId: options.assetGroupId,
    assetGroupName: options.assetGroupName,
    sourceUrl: options.sourceUrl,
    name: options.name,
    timeoutMs: numericArg(options.timeoutMs, '--timeout-ms'),
    nonce: options.nonce,
    include: jsonArg(options.include, '--include'),
    targetPath: options.targetPath,
    namespacePath: options.namespacePath,
    timelineNamespacePath: options.timelineNamespacePath,
    parentPath: options.parentPath,
    expressionUnitPath: options.expressionUnitPath,
    sceneMomentPath: options.sceneMomentPath,
    keyframeId: options.keyframeId,
    audioCueId: options.audioCueId,
    scriptId: options.scriptId,
    versionId: options.versionId,
    versionLabel: options.versionLabel,
    sourceText: options.sourceText,
    sourcePath: options.sourcePath,
    payload: jsonArg(options.payload, '--payload'),
    record: jsonArg(options.record, '--record'),
    entity: jsonArg(options.entity, '--entity'),
    projectStyle: jsonArg(options.projectStyle, '--project-style'),
    setting: jsonArg(options.setting, '--setting'),
    states: jsonArg(options.states, '--states'),
    unit: jsonArg(options.unit, '--unit'),
    namespace: jsonArg(options.namespace, '--namespace'),
    root: jsonArg(options.root, '--root'),
    tree: jsonArg(options.tree, '--tree'),
    nodes: jsonArg(options.nodes, '--nodes'),
    namespaces: jsonArg(options.namespaces, '--namespaces'),
    timelineNamespaces: jsonArg(options.timelineNamespaces, '--timeline-namespaces'),
    production: jsonArg(options.production, '--production'),
    segments: jsonArg(options.segments, '--segments'),
    contentUnits: jsonArg(options.contentUnits, '--content-units'),
    segment: jsonArg(options.segment, '--segment'),
    sceneMoment: jsonArg(options.sceneMoment, '--scene-moment'),
    keyframe: jsonArg(options.keyframe, '--keyframe'),
    storyboard: jsonArg(options.storyboard, '--storyboard'),
    audioCue: jsonArg(options.audioCue, '--audio-cue'),
    expressionUnit: jsonArg(options.expressionUnit, '--expression-unit'),
    editPrompt: jsonArg(options.editPrompt, '--edit-prompt'),
    transition: jsonArg(options.transition, '--transition'),
    timeline: jsonArg(options.timeline, '--timeline'),
    outputs: jsonArg(options.outputs, '--outputs'),
    items: jsonArg(options.items, '--items'),
    producer: jsonArg(options.producer, '--producer'),
    promptSnapshot: jsonArg(options.promptSnapshot, '--prompt-snapshot'),
    metadata: jsonArg(options.metadata, '--metadata'),
    targetRecord: jsonArg(options.targetRecord, '--target-record'),
    continueOnError: options.continueOnError === true ? true : undefined,
    allowPrivateUrls: options.allowPrivateUrls === true ? true : undefined,
    lock: options.lock === true ? true : undefined,
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
