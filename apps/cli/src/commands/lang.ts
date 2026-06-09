import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { Command } from 'commander'
import {
  createNodeMovScriptEngine,
} from '@movscript/engine/node'
import {
  createNodeMovScriptWorkspaceFileRepository,
} from '@movscript/workspace/node'
import type {
  MovScriptWorkspaceEntityQuery,
  MovScriptWorkspaceFileRepository,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace'

interface WorkspaceOptions {
  json?: boolean
  cwd?: string
}

interface GetModelOptions extends WorkspaceOptions {
  entityId?: string
}

interface InitOptions extends WorkspaceOptions {
  id?: string
  title?: string
  language?: string
  overwrite?: boolean
  standard?: string[]
}

interface DemoCreateOptions extends WorkspaceOptions {
  id?: string
  title?: string
  overwrite?: boolean
  noCompile?: boolean
}

interface AddSettingOptions extends WorkspaceOptions {
  id?: string
  title?: string
  kind?: string
  description?: string
}

interface ListEntitiesOptions extends WorkspaceOptions {
  kind?: string
  query?: string
  limit?: string
}

interface AddAssetOptions extends WorkspaceOptions {
  id?: string
  title?: string
  setting?: string
  state?: string
  slot?: string
  kind?: string
  prompt?: string
  resourceId?: string
}

interface AddContentUnitOptions extends WorkspaceOptions {
  id?: string
  title?: string
  kind?: string
  production?: string
  segment?: string
  sceneMoment?: string
  storyboard?: string
  audioCue?: string
  prompt?: string
  description?: string
  order?: string
  duration?: string
  shotSize?: string
  cameraAngle?: string
  cameraMotion?: string
}

interface AddProductionOptions extends WorkspaceOptions {
  id?: string
  title?: string
}

interface AddSegmentOptions extends WorkspaceOptions {
  id?: string
  title?: string
  production?: string
  kind?: string
  summary?: string
  order?: string
}

interface AddSceneMomentOptions extends WorkspaceOptions {
  id?: string
  title?: string
  production?: string
  segment?: string
  sceneMoment?: string
  storyboard?: string
  order?: string
  time?: string
  sceneCode?: string
  location?: string
  condition?: string
  action?: string
  mood?: string
  description?: string
}

interface AddStoryboardOptions extends WorkspaceOptions {
  id?: string
  title?: string
  production?: string
  segment?: string
  sceneMoment?: string
  order?: string
}

interface AddAudioCueOptions extends WorkspaceOptions {
  id?: string
  title?: string
  production?: string
  segment?: string
  sceneMoment?: string
  storyboard?: string
  kind?: string
  order?: string
  shotPlan?: string
  prompt?: string
}

interface AddExpressionUnitOptions extends WorkspaceOptions {
  id?: string
  title?: string
  production?: string
  segment?: string
  sceneMoment?: string
  kind?: string
  speaker?: string
  text?: string
  note?: string
  intent?: string
  order?: string
  storyboard?: string[]
  fromStoryboard?: string
  toStoryboard?: string
  scriptBlock?: string
}

interface InteractiveOptions extends WorkspaceOptions {
}

interface SelectOptions extends WorkspaceOptions {
  kind?: string
  targetKind?: string
  reason?: string
}

interface AddCandidateOptions extends WorkspaceOptions {
  id?: string
  kind?: string
  targetKind?: string
  outputKind?: string
  resourceId?: string
  source?: string
  notes?: string
  metadata?: string[]
}

interface PlanningListOptions extends WorkspaceOptions {
  kind?: string
  query?: string
  limit?: string
  production?: string
  segment?: string
  sceneMoment?: string
}

interface PlanningDeleteOptions extends WorkspaceOptions {
  production?: string
  segment?: string
  sceneMoment?: string
}

interface CompilerArtifactsOptions extends WorkspaceOptions {
  buildId?: string
  createdAt?: string
}

const SEMANTIC_ENTITY_KINDS = [
  'project',
  'project_standards',
  'script',
  'script_version',
  'script_block',
  'production',
  'segment',
  'scene_moment',
  'storyboard',
  'audio_cue',
  'expression_unit',
  'content_unit',
  'keyframe',
  'setting',
  'setting_state',
  'asset',
] as const satisfies readonly NonNullable<MovScriptWorkspaceEntityQuery['entityKind']>[]

type CliSemanticEntityKind = NonNullable<MovScriptWorkspaceEntityQuery['entityKind']>

const INTERACTIVE_PROMPT = 'movscript> '

export function registerLangCommands(program: Command): void {
  program
    .option('--json', 'Print JSON output')
    .option('--cwd <path>', 'MovScript workspace directory')
    .showHelpAfterError()
    .addHelpText('after', `
Examples:
  $ movcli project init --id demo --title "Demo Film"
  $ movcli project demo create --cwd ./demo
  $ movcli setting add hero --title "Hero"
  $ movcli asset add --setting hero --slot portrait --prompt "cinematic portrait"
  $ movcli overview
  $ movcli inspect
  $ movcli compile
  $ movcli regen plan
`)

  program
    .command('init')
    .description('Initialize a MovScript project workspace')
    .option('--id <id>', 'Project id written to project_id')
    .option('--title <title>', 'Project title')
    .option('--language <language>', 'Project language')
    .option('--standard <key=value...>', 'Project standard field, repeatable', collectOption, [])
    .option('--overwrite', 'Overwrite existing project files')
    .option('--json', 'Print JSON output')
    .action(async (options: InitOptions, command: Command) => {
      await initProjectFromCliOptions(options, command)
    })

  const project = program
    .command('project')
    .description('Manage the MovScript project workspace')

  project
    .command('init')
    .description('Initialize a MovScript project workspace')
    .option('--id <id>', 'Project id written to project_id')
    .option('--title <title>', 'Project title')
    .option('--language <language>', 'Project language')
    .option('--standard <key=value...>', 'Project standard field, repeatable', collectOption, [])
    .option('--overwrite', 'Overwrite existing project files')
    .option('--json', 'Print JSON output')
    .action(async (options: InitOptions, command: Command) => {
      await initProjectFromCliOptions(options, command)
    })

  const projectDemo = project
    .command('demo')
    .description('Create runnable demo projects')

  projectDemo
    .command('create')
    .description('Create a minimal demo project with asset_ref and storyboard_video content units')
    .option('--id <id>', 'Project id', 'demo')
    .option('--title <title>', 'Project title', 'Demo Film')
    .option('--overwrite', 'Overwrite existing demo files')
    .option('--no-compile', 'Only write demo source files; do not run compiler build')
    .option('--json', 'Print JSON output')
    .action(async (options: DemoCreateOptions, command: Command) => {
      await createDemoProjectFromCliOptions(options, command)
    })

  program
    .command('get-model <entityType>')
    .description('Return the MovScript source model for one editable entity')
    .option('--entity-id <id>', 'Optional entity id used to expand editable path hints')
    .option('--json', 'Print JSON output')
    .action((entityType: string, options: GetModelOptions, command: Command) => {
      const engine = createCliEngine(mergeGlobalOptions(options, command))
      const result = engine.getModel({
        entityKind: entityType,
        ...(options.entityId !== undefined ? { entityId: options.entityId } : {}),
      })
      printResult(result, mergeGlobalOptions(options, command))
    })

  program
    .command('interactive')
    .alias('i')
    .description('Open the interactive MovScript slash shell')
    .option('--json', 'Print JSON output for write results')
    .action(async (options: InteractiveOptions, command: Command) => {
      await runInteractiveCli(mergeGlobalOptions(options, command))
    })

  const setting = program
    .command('setting')
    .description('Manage settings')

  setting
    .command('list')
    .description('List settings')
    .option('--kind <kind>', 'Filter by setting kind')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action(async (options: ListEntitiesOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).querySettings({
        ...(options.kind !== undefined ? { kind: options.kind } : {}),
        ...(options.query !== undefined ? { query: options.query } : {}),
        ...(options.limit !== undefined ? { limit: parsePositiveIntegerOption(options.limit, 'limit') } : {}),
      })
      printSettingsTable(result, merged)
    })

  setting
    .command('add [id]')
    .description('Add or update a setting')
    .option('--id <id>', 'Setting id')
    .option('--title <title>', 'Setting display title')
    .option('--kind <kind>', 'Setting kind, such as character, location, prop, world_rule, style, or other', 'other')
    .option('--description <text>', 'Setting description')
    .option('--json', 'Print JSON output')
    .action(async (id: string | undefined, options: AddSettingOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).upsertSetting({
        payload: pruneUndefined({
          id: options.id ?? id,
          title: options.title,
          setting_kind: options.kind,
          description: options.description,
        }),
      })
      printResult(result, merged)
    })

  const asset = program
    .command('asset')
    .description('Manage assets')

  asset
    .command('list')
    .description('List assets')
    .option('--setting <id>', 'Filter by owning setting id')
    .option('--state <id>', 'Filter by owning setting state id')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action(async (options: ListEntitiesOptions & { setting?: string; state?: string }, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).queryAssets({
        ...(options.setting !== undefined ? { settingId: options.setting } : {}),
        ...(options.state !== undefined ? { settingStateId: options.state } : {}),
        ...(options.query !== undefined ? { query: options.query } : {}),
        ...(options.limit !== undefined ? { limit: parsePositiveIntegerOption(options.limit, 'limit') } : {}),
      })
      printAssetsTable(result.assets, merged)
    })

  asset
    .command('add [id]')
    .description('Add or update an asset')
    .option('--id <id>', 'Asset id')
    .option('--title <title>', 'Asset display title')
    .option('--setting <id>', 'Owning setting id')
    .option('--state <id>', 'Owning setting state id')
    .option('--slot <slot>', 'Asset slot key')
    .option('--kind <kind>', 'Asset kind, such as image, video, audio, text, reference, or other', 'image')
    .option('--prompt <text>', 'Asset prompt hint')
    .option('--resource-id <id>', 'Selected resource id')
    .option('--json', 'Print JSON output')
    .action(async (id: string | undefined, options: AddAssetOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).upsertAsset({
        payload: pruneUndefined({
          id: options.id ?? id,
          title: options.title,
          setting_id: options.setting,
          setting_state_id: options.state,
          slot: options.slot,
          asset_kind: options.kind,
          prompt_hint: options.prompt,
          resource_id: options.resourceId,
        }),
      })
      printResult(result, merged)
    })

  const production = program
    .command('production')
    .description('Manage productions')

  production
    .command('list')
    .description('List productions')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action((options: PlanningListOptions, command: Command) => {
      return printPlanningEntityList('production', 'Productions', options, command)
    })

  production
    .command('add')
    .alias('create')
    .description('Create or update a production')
    .option('--id <id>', 'Production id', 'main')
    .option('--title <title>', 'Production title')
    .option('--json', 'Print JSON output')
    .action(async (options: AddProductionOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).createProduction({
        id: options.id ?? 'main',
        title: options.title,
      })
      printResult(result, merged)
    })

  production
    .command('modify <id>')
    .description('Modify a production')
    .option('--title <title>', 'Production title')
    .option('--json', 'Print JSON output')
    .action(async (id: string, options: AddProductionOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).updateProduction({ id, title: options.title })
      printResult(result, merged)
    })

  production
    .command('delete <idOrPath>')
    .alias('remove')
    .description('Delete a production')
    .option('--json', 'Print JSON output')
    .action((idOrPath: string, options: PlanningDeleteOptions, command: Command) => {
      return deletePlanningEntity('production', idOrPath, options, command)
    })

  const segment = program
    .command('segment')
    .description('Manage emotional/rhythm segments')

  segment
    .command('list')
    .description('List segments')
    .option('--production <id>', 'Filter by production id')
    .option('--kind <kind>', 'Filter by segment kind')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action((options: PlanningListOptions, command: Command) => {
      return printPlanningEntityList('segment', 'Segments', options, command)
    })

  segment
    .command('add')
    .alias('create')
    .description('Create or update an emotional/rhythm segment')
    .option('--id <id>', 'Segment id')
    .option('--title <title>', 'Segment title')
    .option('--production <id>', 'Production id', 'main')
    .option('--kind <kind>', 'Segment kind, such as emotional_function, setup, escalation, release, or transition')
    .option('--summary <text>', 'Segment summary')
    .option('--order <number>', 'Segment order')
    .option('--json', 'Print JSON output')
    .action(async (options: AddSegmentOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).createSegment({
        id: options.id,
        productionId: options.production ?? 'main',
        title: options.title,
        kind: options.kind,
        summary: options.summary,
        order: parseOptionalNumberOption(options.order, 'order'),
      })
      printResult(result, merged)
    })

  segment
    .command('modify <id>')
    .description('Modify an emotional/rhythm segment')
    .option('--production <id>', 'Production id', 'main')
    .option('--title <title>', 'Segment title')
    .option('--kind <kind>', 'Segment kind')
    .option('--summary <text>', 'Segment summary')
    .option('--order <number>', 'Segment order')
    .option('--json', 'Print JSON output')
    .action(async (id: string, options: AddSegmentOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).updateSegment({
        id,
        productionId: options.production ?? 'main',
        title: options.title,
        kind: options.kind,
        summary: options.summary,
        order: parseOptionalNumberOption(options.order, 'order'),
      })
      printResult(result, merged)
    })

  segment
    .command('delete <idOrPath>')
    .alias('remove')
    .description('Delete a segment')
    .option('--production <id>', 'Filter by production id')
    .option('--json', 'Print JSON output')
    .action((idOrPath: string, options: PlanningDeleteOptions, command: Command) => {
      return deletePlanningEntity('segment', idOrPath, options, command)
    })

  const sceneMoment = program
    .command('scene-moment')
    .alias('moment')
    .description('Manage scene moments')

  sceneMoment
    .command('list')
    .description('List scene moments')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action((options: PlanningListOptions, command: Command) => {
      return printPlanningEntityList('scene_moment', 'Scene moments', options, command)
    })

  sceneMoment
    .command('add')
    .alias('create')
    .description('Create or update a scene moment under a segment')
    .option('--id <id>', 'Scene moment id')
    .option('--title <title>', 'Scene moment title')
    .option('--production <id>', 'Production id')
    .option('--segment <id-or-path>', 'Segment id or path')
    .option('--storyboard <id>', 'Initial storyboard id', 'main')
    .option('--order <number>', 'Scene moment order')
    .option('--time <text>', 'Time text')
    .option('--scene-code <text>', 'Scene code')
    .option('--location <text>', 'Location text')
    .option('--condition <text>', 'Condition text')
    .option('--action <text>', 'Action text')
    .option('--mood <text>', 'Mood/emotion text')
    .option('--description <text>', 'Scene moment description')
    .option('--json', 'Print JSON output')
    .action(async (options: AddSceneMomentOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parsePlanningParentOptions(options)
      const result = await createCliEngine(merged).createSceneMoment({
        id: options.id ?? options.sceneMoment,
        productionId: source.productionId,
        segmentId: source.segmentId,
        title: options.title,
        storyboardId: options.storyboard,
        order: parseOptionalNumberOption(options.order, 'order'),
        timeText: options.time,
        sceneCode: options.sceneCode,
        locationText: options.location,
        conditionText: options.condition,
        actionText: options.action,
        mood: options.mood,
        description: options.description,
      })
      printResult(result, merged)
    })

  sceneMoment
    .command('modify <id>')
    .description('Modify a scene moment')
    .option('--production <id>', 'Production id')
    .option('--segment <id-or-path>', 'Segment id or path')
    .option('--title <title>', 'Scene moment title')
    .option('--storyboard <id>', 'Initial storyboard id')
    .option('--order <number>', 'Scene moment order')
    .option('--time <text>', 'Time text')
    .option('--scene-code <text>', 'Scene code')
    .option('--location <text>', 'Location text')
    .option('--condition <text>', 'Condition text')
    .option('--action <text>', 'Action text')
    .option('--mood <text>', 'Mood/emotion text')
    .option('--description <text>', 'Scene moment description')
    .option('--json', 'Print JSON output')
    .action(async (id: string, options: AddSceneMomentOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parsePlanningParentOptions(options)
      const result = await createCliEngine(merged).updateSceneMoment({
        id,
        productionId: source.productionId,
        segmentId: source.segmentId,
        title: options.title,
        storyboardId: options.storyboard,
        order: parseOptionalNumberOption(options.order, 'order'),
        timeText: options.time,
        sceneCode: options.sceneCode,
        locationText: options.location,
        conditionText: options.condition,
        actionText: options.action,
        mood: options.mood,
        description: options.description,
      })
      printResult(result, merged)
    })

  sceneMoment
    .command('delete <idOrPath>')
    .alias('remove')
    .description('Delete a scene moment')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--json', 'Print JSON output')
    .action((idOrPath: string, options: PlanningDeleteOptions, command: Command) => {
      return deletePlanningEntity('scene_moment', idOrPath, options, command)
    })

  const storyboard = program
    .command('storyboard')
    .description('Manage storyboards')

  storyboard
    .command('list')
    .description('List storyboards')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--scene-moment <id-or-path>', 'Filter by scene moment id or path')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action((options: PlanningListOptions, command: Command) => {
      return printPlanningEntityList('storyboard', 'Storyboards', options, command)
    })

  storyboard
    .command('add')
    .alias('create')
    .description('Create or update a storyboard under a scene moment')
    .option('--id <id>', 'Storyboard id')
    .option('--title <title>', 'Storyboard title')
    .option('--production <id>', 'Production id')
    .option('--segment <id-or-path>', 'Segment id or path')
    .option('--scene-moment <id-or-path>', 'Scene moment id or path')
    .option('--order <number>', 'Storyboard order; new storyboards append when omitted')
    .option('--json', 'Print JSON output')
    .action(async (options: AddStoryboardOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parseStoryboardParentOptions(options)
      const result = await createCliEngine(merged).createStoryboard({
        id: options.id ?? 'main',
        productionId: source.productionId,
        segmentId: source.segmentId,
        sceneMomentId: source.sceneMomentId,
        title: options.title,
        order: parseOptionalNumberOption(options.order, 'order'),
      })
      printResult(result, merged)
    })

  storyboard
    .command('modify <id>')
    .description('Modify a storyboard')
    .option('--title <title>', 'Storyboard title')
    .option('--production <id>', 'Production id')
    .option('--segment <id-or-path>', 'Segment id or path')
    .option('--scene-moment <id-or-path>', 'Scene moment id or path')
    .option('--order <number>', 'Storyboard order')
    .option('--json', 'Print JSON output')
    .action(async (id: string, options: AddStoryboardOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parseStoryboardParentOptions(options)
      const result = await createCliEngine(merged).updateStoryboard({
        id,
        productionId: source.productionId,
        segmentId: source.segmentId,
        sceneMomentId: source.sceneMomentId,
        title: options.title,
        order: parseOptionalNumberOption(options.order, 'order'),
      })
      printResult(result, merged)
    })

  storyboard
    .command('delete <idOrPath>')
    .alias('remove')
    .description('Delete a storyboard')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--scene-moment <id-or-path>', 'Filter by scene moment id or path')
    .option('--json', 'Print JSON output')
    .action((idOrPath: string, options: PlanningDeleteOptions, command: Command) => {
      return deletePlanningEntity('storyboard', idOrPath, options, command)
    })

  const audioCue = program
    .command('audio-cue')
    .description('Manage audio cues')

  audioCue
    .command('list')
    .description('List audio cues')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--scene-moment <id-or-path>', 'Filter by scene moment id or path')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action((options: PlanningListOptions, command: Command) => {
      return printPlanningEntityList('audio_cue', 'Audio cues', options, command)
    })

  audioCue
    .command('add')
    .alias('create')
    .description('Create or update an audio cue under a scene moment')
    .option('--id <id>', 'Audio cue id')
    .option('--title <title>', 'Audio cue title')
    .option('--kind <kind>', 'Audio cue kind, such as sound_effect, music, ambience, dialogue, or foley', 'sound_effect')
    .option('--production <id>', 'Production id')
    .option('--segment <id-or-path>', 'Segment id or path')
    .option('--scene-moment <id-or-path>', 'Scene moment id or path')
    .option('--storyboard <id-or-path>', 'Storyboard id or path')
    .option('--order <number>', 'Audio cue order')
    .option('--shot-plan <id>', 'Shot plan id')
    .option('--prompt <text>', 'Audio prompt hint')
    .option('--json', 'Print JSON output')
    .action(async (options: AddAudioCueOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parseAudioCueParentOptions(options)
      const result = await createCliEngine(merged).createAudioCue({
        id: options.id,
        productionId: source.productionId,
        segmentId: source.segmentId,
        sceneMomentId: source.sceneMomentId,
        storyboardId: source.storyboardId,
        title: options.title,
        kind: options.kind,
        order: parseOptionalNumberOption(options.order, 'order'),
        shotPlanId: options.shotPlan,
        promptHint: options.prompt,
      })
      printResult(result, merged)
    })

  audioCue
    .command('modify <id>')
    .description('Modify an audio cue')
    .option('--title <title>', 'Audio cue title')
    .option('--kind <kind>', 'Audio cue kind')
    .option('--production <id>', 'Production id')
    .option('--segment <id-or-path>', 'Segment id or path')
    .option('--scene-moment <id-or-path>', 'Scene moment id or path')
    .option('--storyboard <id-or-path>', 'Storyboard id or path')
    .option('--order <number>', 'Audio cue order')
    .option('--shot-plan <id>', 'Shot plan id')
    .option('--prompt <text>', 'Audio prompt hint')
    .option('--json', 'Print JSON output')
    .action(async (id: string, options: AddAudioCueOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parseAudioCueParentOptions(options)
      const result = await createCliEngine(merged).updateAudioCue({
        id,
        productionId: source.productionId,
        segmentId: source.segmentId,
        sceneMomentId: source.sceneMomentId,
        storyboardId: source.storyboardId,
        title: options.title,
        kind: options.kind,
        order: parseOptionalNumberOption(options.order, 'order'),
        shotPlanId: options.shotPlan,
        promptHint: options.prompt,
      })
      printResult(result, merged)
    })

  audioCue
    .command('delete <idOrPath>')
    .alias('remove')
    .description('Delete an audio cue')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--scene-moment <id-or-path>', 'Filter by scene moment id or path')
    .option('--json', 'Print JSON output')
    .action((idOrPath: string, options: PlanningDeleteOptions, command: Command) => {
      return deletePlanningEntity('audio_cue', idOrPath, options, command)
    })

  const expressionUnit = program
    .command('expression-unit')
    .alias('expr')
    .description('Manage scene-moment expression units')

  expressionUnit
    .command('list')
    .description('List expression units')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--scene-moment <id-or-path>', 'Filter by scene moment id or path')
    .option('--kind <kind>', 'Filter by expression kind')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action((options: PlanningListOptions, command: Command) => {
      return printPlanningEntityList('expression_unit', 'Expression units', options, command)
    })

  expressionUnit
    .command('add')
    .alias('create')
    .description('Create or update an expression unit under a scene moment')
    .option('--id <id>', 'Expression unit id')
    .option('--title <title>', 'Expression unit title')
    .option('--kind <kind>', 'Expression kind, such as dialogue, narration, subtitle, caption, action, or visual_note', 'dialogue')
    .option('--production <id>', 'Production id')
    .option('--segment <id-or-path>', 'Segment id or path')
    .option('--scene-moment <id-or-path>', 'Scene moment id or path')
    .option('--speaker <text>', 'Speaker label')
    .option('--text <text>', 'Expression text')
    .option('--note <text>', 'Expression note')
    .option('--intent <text>', 'Expression intent')
    .option('--order <number>', 'Expression order')
    .option('--storyboard <id-or-path>', 'Storyboard covered by this expression; repeatable', collectOption, [])
    .option('--from-storyboard <id>', 'First storyboard id covered by this expression')
    .option('--to-storyboard <id>', 'Last storyboard id covered by this expression')
    .option('--script-block <id>', 'Referenced script block id')
    .option('--json', 'Print JSON output')
    .action(async (options: AddExpressionUnitOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parseExpressionUnitParentOptions(options)
      const result = await createCliEngine(merged).createExpressionUnit({
        id: options.id,
        productionId: source.productionId,
        segmentId: source.segmentId,
        sceneMomentId: source.sceneMomentId,
        title: options.title,
        kind: options.kind,
        speaker: options.speaker,
        text: options.text,
        note: options.note,
        intent: options.intent,
        order: parseOptionalNumberOption(options.order, 'order'),
        span: expressionUnitSpanFromOptions(options),
        scriptBlockId: options.scriptBlock,
      })
      printResult(result, merged)
    })

  expressionUnit
    .command('modify <id>')
    .description('Modify an expression unit')
    .option('--title <title>', 'Expression unit title')
    .option('--kind <kind>', 'Expression kind')
    .option('--production <id>', 'Production id')
    .option('--segment <id-or-path>', 'Segment id or path')
    .option('--scene-moment <id-or-path>', 'Scene moment id or path')
    .option('--speaker <text>', 'Speaker label')
    .option('--text <text>', 'Expression text')
    .option('--note <text>', 'Expression note')
    .option('--intent <text>', 'Expression intent')
    .option('--order <number>', 'Expression order')
    .option('--storyboard <id-or-path>', 'Storyboard covered by this expression; repeatable', collectOption, [])
    .option('--from-storyboard <id>', 'First storyboard id covered by this expression')
    .option('--to-storyboard <id>', 'Last storyboard id covered by this expression')
    .option('--script-block <id>', 'Referenced script block id')
    .option('--json', 'Print JSON output')
    .action(async (id: string, options: AddExpressionUnitOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parseExpressionUnitParentOptions(options)
      const result = await createCliEngine(merged).updateExpressionUnit({
        id,
        productionId: source.productionId,
        segmentId: source.segmentId,
        sceneMomentId: source.sceneMomentId,
        title: options.title,
        kind: options.kind,
        speaker: options.speaker,
        text: options.text,
        note: options.note,
        intent: options.intent,
        order: parseOptionalNumberOption(options.order, 'order'),
        span: expressionUnitSpanFromOptions(options),
        scriptBlockId: options.scriptBlock,
      })
      printResult(result, merged)
    })

  expressionUnit
    .command('delete <idOrPath>')
    .alias('remove')
    .description('Delete an expression unit')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--scene-moment <id-or-path>', 'Filter by scene moment id or path')
    .option('--json', 'Print JSON output')
    .action((idOrPath: string, options: PlanningDeleteOptions, command: Command) => {
      return deletePlanningEntity('expression_unit', idOrPath, options, command)
    })

  const contentUnit = program
    .command('content-unit')
    .alias('cu')
    .description('Manage content units')

  contentUnit
    .command('list')
    .description('List content units')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--scene-moment <id-or-path>', 'Filter by scene moment id or path')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action((options: PlanningListOptions, command: Command) => {
      return printPlanningEntityList('content_unit', 'Content units', options, command)
    })

  contentUnit
    .command('status <idOrPath>')
    .alias('panel')
    .description('Show source and compiled generation status for a content unit')
    .option('--json', 'Print JSON output')
    .action(async (idOrPath: string, options: WorkspaceOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await buildContentUnitStatusPanel(createCliEngine(merged), idOrPath)
      printContentUnitStatusPanel(result, merged)
    })

  contentUnit
    .command('add')
    .alias('create')
    .description('Create or update a content unit from a scene moment and storyboard')
    .option('--id <id>', 'Content unit id')
    .option('--title <title>', 'Content unit title')
    .option('--kind <kind>', 'Content unit kind, such as shot, voiceover, dialogue_audio, sound, music_beat, subtitle, or caption_card', 'shot')
    .option('--production <id>', 'Production id')
    .option('--segment <id>', 'Segment id')
    .option('--scene-moment <id-or-path>', 'Scene moment id or path')
    .option('--storyboard <id-or-path>', 'Storyboard id or path', 'main')
    .option('--audio-cue <id-or-path>', 'Audio cue id or path for audio content units')
    .option('--prompt <text>', 'Editable generation prompt')
    .option('--description <text>', 'Content unit description')
    .option('--order <number>', 'Content unit order')
    .option('--duration <seconds>', 'Expected duration in seconds')
    .option('--shot-size <value>', 'Shot size')
    .option('--camera-angle <value>', 'Camera angle')
    .option('--camera-motion <value>', 'Camera motion')
    .option('--json', 'Print JSON output')
    .action(async (options: AddContentUnitOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parseContentUnitSourceOptions(options)
      const result = await createCliEngine(merged).createContentUnit({
        id: options.id,
        title: options.title,
        kind: options.kind,
        productionId: source.productionId,
        segmentId: source.segmentId,
        sceneMomentId: source.sceneMomentId,
        storyboardId: source.storyboardId,
        audioCueId: source.audioCueId,
        prompt: options.prompt,
        description: options.description,
        order: parseOptionalNumberOption(options.order, 'order'),
        durationSeconds: parseOptionalNumberOption(options.duration, 'duration'),
        shotSize: options.shotSize,
        cameraAngle: options.cameraAngle,
        cameraMotion: options.cameraMotion,
      })
      printResult(result, merged)
    })

  contentUnit
    .command('modify <id>')
    .description('Modify a content unit')
    .option('--title <title>', 'Content unit title')
    .option('--kind <kind>', 'Content unit kind')
    .option('--production <id>', 'Production id')
    .option('--segment <id>', 'Segment id')
    .option('--scene-moment <id-or-path>', 'Scene moment id or path')
    .option('--storyboard <id-or-path>', 'Storyboard id or path')
    .option('--audio-cue <id-or-path>', 'Audio cue id or path for audio content units')
    .option('--prompt <text>', 'Editable generation prompt')
    .option('--description <text>', 'Content unit description')
    .option('--order <number>', 'Content unit order')
    .option('--duration <seconds>', 'Expected duration in seconds')
    .option('--shot-size <value>', 'Shot size')
    .option('--camera-angle <value>', 'Camera angle')
    .option('--camera-motion <value>', 'Camera motion')
    .option('--json', 'Print JSON output')
    .action(async (id: string, options: AddContentUnitOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parseContentUnitSourceOptions({ ...options, sceneMoment: options.sceneMoment ?? 'local' })
      const result = await createCliEngine(merged).updateContentUnit({
        id,
        title: options.title,
        kind: options.kind,
        productionId: source.productionId,
        segmentId: source.segmentId,
        sceneMomentId: options.sceneMoment === undefined && options.storyboard === undefined && options.audioCue === undefined ? undefined : source.sceneMomentId,
        storyboardId: options.sceneMoment === undefined && options.storyboard === undefined && options.audioCue === undefined ? undefined : source.storyboardId,
        audioCueId: source.audioCueId,
        prompt: options.prompt,
        description: options.description,
        order: parseOptionalNumberOption(options.order, 'order'),
        durationSeconds: parseOptionalNumberOption(options.duration, 'duration'),
        shotSize: options.shotSize,
        cameraAngle: options.cameraAngle,
        cameraMotion: options.cameraMotion,
      })
      printResult(result, merged)
    })

  contentUnit
    .command('delete <idOrPath>')
    .alias('remove')
    .description('Delete a content unit')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--scene-moment <id-or-path>', 'Filter by scene moment id or path')
    .option('--json', 'Print JSON output')
    .action((idOrPath: string, options: PlanningDeleteOptions, command: Command) => {
      return deletePlanningEntity('content_unit', idOrPath, options, command)
    })

  const entity = program
    .command('entity')
    .description('Inspect workspace entities')

  entity
    .command('list [entityKind]')
    .description('List indexed entities')
    .option('--kind <kind>', 'Filter by domain-specific kind')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action(async (entityKind: string | undefined, options: ListEntitiesOptions, command: Command) => {
      if (entityKind !== undefined && !isSemanticEntityKind(entityKind)) {
        throw new Error(`unknown entity kind: ${entityKind}`)
      }
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).queryEntities({
        ...(entityKind !== undefined ? { entityKind } : {}),
        ...(options.kind !== undefined ? { kind: options.kind } : {}),
        ...(options.query !== undefined ? { query: options.query } : {}),
        ...(options.limit !== undefined ? { limit: parsePositiveIntegerOption(options.limit, 'limit') } : {}),
      })
      printEntityList(result, merged, {
        title: entityKind ? `${entityKind} entities` : 'Entities',
        columns: [
          { header: 'Kind', value: (item) => item.entityKind },
          { header: 'ID', value: (item) => item.id },
          { header: 'Type', value: (item) => item.record.setting_kind ?? item.record.asset_kind ?? item.record.content_unit_type ?? item.record.cue_kind ?? item.record.kind },
          { header: 'Title', value: (item) => item.record.title ?? item.record.label ?? item.id },
          { header: 'Path', value: (item) => item.path, maxWidth: 52 },
        ],
      })
    })

  const compiler = program
    .command('compiler')
    .description('Run compiler workflows')

  compiler
    .command('overview')
    .description('Show the workspace overview and next compiler actions')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return overviewWorkspaceFromCliOptions(options, command)
    })

  compiler
    .command('inspect')
    .description('Inspect source edits, diagnostics, and predicted impact')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return inspectWorkspaceFromCliOptions(options, command)
    })

  compiler
    .command('review')
    .description('Alias for inspect')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return inspectWorkspaceFromCliOptions(options, command)
    })

  compiler
    .command('compile')
    .alias('build')
    .description('Compile source into stable MovScript build artifacts')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return compileWorkspaceFromCliOptions(options, command)
    })

  compiler
    .command('prompt <contentUnitId>')
    .description('Build the runtime artifact for one content unit from the current index')
    .option('--json', 'Print JSON output')
    .action(async (contentUnitId: string, options: WorkspaceOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).buildContentUnitArtifact(contentUnitId)
      printResult(result, merged)
    })

  compiler
    .command('artifacts')
    .description('Build compiler artifacts in memory from the current index')
    .option('--build-id <id>', 'Build id used in derived artifacts')
    .option('--created-at <iso>', 'Creation timestamp used in derived artifacts')
    .option('--json', 'Print JSON output')
    .action(async (options: CompilerArtifactsOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).buildArtifacts({
        ...(options.buildId !== undefined ? { buildId: options.buildId } : {}),
        ...(options.createdAt !== undefined ? { createdAt: options.createdAt } : {}),
      })
      printResult(result, merged)
    })

  const compilerRegen = compiler
    .command('regen')
    .alias('regenerate')
    .description('Inspect regeneration work after compile')

  compilerRegen
    .command('plan')
    .description('Show generated outputs and prompt bundles that may need regeneration')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return regenerationPlanFromCliOptions(options, command)
    })

  program
    .command('overview')
    .alias('status')
    .description('Show the workspace overview and next compiler actions')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return overviewWorkspaceFromCliOptions(options, command)
    })

  program
    .command('inspect')
    .description('Inspect source edits, diagnostics, and predicted impact')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return inspectWorkspaceFromCliOptions(options, command)
    })

  program
    .command('review')
    .description('Alias for inspect')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return inspectWorkspaceFromCliOptions(options, command)
    })

  program
    .command('compile')
    .alias('build')
    .description('Compile source into stable MovScript build artifacts')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return compileWorkspaceFromCliOptions(options, command)
    })

  const regen = program
    .command('regen')
    .alias('regenerate')
    .description('Inspect regeneration work after compile')

  regen
    .command('plan')
    .description('Show generated outputs and prompt bundles that may need regeneration')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return regenerationPlanFromCliOptions(options, command)
    })

  const candidate = program
    .command('candidate')
    .description('Manage generated and external candidates')

  candidate
    .command('add <target>')
    .description('Manually add an external resource as a content_unit candidate')
    .option('--id <id>', 'Candidate id; generated from resource id when omitted')
    .option('--kind <kind>', 'Candidate output kind or content_unit_type hint')
    .option('--output-kind <kind>', 'Candidate output kind: image, video, audio, text, or metadata')
    .option('--target-kind <kind>', 'Target kind override; defaults to content_unit for id targets')
    .option('--resource-id <id>', 'External resource id to add as a candidate')
    .option('--source <source>', 'Candidate source label', 'manual')
    .option('--notes <text>', 'Candidate notes')
    .option('--metadata <key=value...>', 'Candidate metadata field, repeatable', collectOption, [])
    .option('--json', 'Print JSON output')
    .action(async (target: string, options: AddCandidateOptions, command: Command) => {
      if (!options.resourceId) throw new Error('--resource-id is required')
      const merged = mergeGlobalOptions(options, command)
      const result = await addCandidateFromCliOptions(createCliEngine(merged), target, options)
      printResult(result, merged)
    })

  candidate
    .command('select <target> <candidateId>')
    .alias('choose')
    .description('Select a content_unit candidate')
    .option('--kind <kind>', 'Target kind override; defaults to content_unit for id targets')
    .option('--target-kind <kind>', 'Target kind override; defaults to content_unit for id targets')
    .option('--reason <reason>', 'Selection reason')
    .option('--json', 'Print JSON output')
    .action(async (target: string, candidateId: string, options: SelectOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await selectCandidateFromCliOptions(createCliEngine(merged), target, candidateId, options)
      printResult(result, merged)
    })

  program
    .command('select <target> <candidateId>')
    .description('Select a generated candidate for a target path')
    .option('--kind <kind>', 'Target kind override; defaults to content_unit for id targets')
    .option('--target-kind <kind>', 'Target kind override; defaults to content_unit for id targets')
    .option('--reason <reason>', 'Selection reason')
    .option('--json', 'Print JSON output')
    .action(async (target: string, candidateId: string, options: SelectOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await selectCandidateFromCliOptions(createCliEngine(merged), target, candidateId, options)
      printResult(result, merged)
    })

}

function mergeGlobalOptions(options: WorkspaceOptions, command: Command): WorkspaceOptions {
  const global = command.optsWithGlobals ? command.optsWithGlobals() : command.opts()
  return {
    ...options,
    json: options.json ?? (typeof global.json === 'boolean' ? global.json : undefined),
    cwd: options.cwd
      ?? (typeof global.cwd === 'string' ? global.cwd : undefined)
      ?? (typeof global.workspace === 'string' ? global.workspace : undefined),
  }
}

function createCliEngine(options: WorkspaceOptions) {
  return createNodeMovScriptEngine({
    ...(options.cwd !== undefined ? { workspaceDir: options.cwd } : {}),
  })
}

type CliEngine = ReturnType<typeof createCliEngine>

async function addCandidateFromCliOptions(
  engine: CliEngine,
  target: string,
  options: AddCandidateOptions,
): Promise<unknown> {
  if (!options.resourceId) throw new Error('--resource-id is required')
  const targetKind = parseTargetKindOption(options.targetKind, target, { defaultContentUnit: true })
  if (targetKind === 'content_unit') {
    const contentUnit = await resolveContentUnitTarget(engine, target)
    const contentUnitId = stringValue(contentUnit.id ?? contentUnit.record.id)
    if (!contentUnitId) throw new Error(`content_unit missing id: ${contentUnit.path}`)
    return engine.workspaceService.createContentCandidate({
      contentUnitId,
      candidateId: options.id,
      source: options.source,
      outputs: [{
        kind: parseContentCandidateOutputKind(options.outputKind ?? options.kind, contentUnit.record),
        resource_id: options.resourceId,
        metadata: parseOptionalKeyValueOptions(options.metadata ?? []),
      }],
      promptSnapshot: options.notes !== undefined ? { notes: options.notes } : undefined,
    })
  }
  return engine.appendCandidate({
    targetPath: targetPathFromSelectionTarget(target),
    targetKind,
    payload: pruneUndefined({
      id: options.id,
      resource_id: options.resourceId,
      source: options.source,
      notes: options.notes,
      metadata: parseOptionalKeyValueOptions(options.metadata ?? []),
    }),
  })
}

async function selectCandidateFromCliOptions(
  engine: CliEngine,
  target: string,
  candidateId: string,
  options: SelectOptions,
): Promise<unknown> {
  const targetKind = parseTargetKindOption(options.targetKind ?? options.kind, target, { defaultContentUnit: true })
  if (targetKind === 'content_unit') {
    const contentUnit = await resolveContentUnitTarget(engine, target)
    const contentUnitId = stringValue(contentUnit.id ?? contentUnit.record.id)
    if (!contentUnitId) throw new Error(`content_unit missing id: ${contentUnit.path}`)
    const candidate = await findContentUnitCandidate(engine, contentUnit, candidateId)
    return engine.workspaceService.selectContentUnitCandidate({
      contentUnitId,
      candidateId,
      resourceId: candidateResourceId(candidate?.record),
      reason: options.reason,
    })
  }
  return engine.selectCandidate({
    targetPath: targetPathFromSelectionTarget(target),
    targetKind,
    candidateId,
    ...(options.reason !== undefined ? { reason: options.reason } : {}),
  })
}

async function resolveContentUnitTarget(engine: CliEngine, target: string): Promise<MovScriptWorkspaceIndexedEntity> {
  const normalized = normalizeCliPath(targetPathFromSelectionTarget(target))
  const id = contentUnitIdFromTarget(target)
  const entities = await engine.queryEntities({ entityKind: 'content_unit' })
  const match = entities.find((entity) => String(entity.id ?? '') === id)
    ?? entities.find((entity) => String(entity.record.id ?? '') === id)
    ?? entities.find((entity) => normalizeCliPath(entity.path) === normalized)
    ?? entities.find((entity) => normalizeCliPath(entity.path.replace(/\/content_unit\.json$/, '')) === normalized)
    ?? entities.find((entity) => normalizeCliPath(`content_units/${String(entity.id ?? '')}`) === normalized)
  if (!match) throw new Error(`content_unit not found: ${target}`)
  return match
}

function contentUnitIdFromTarget(target: string): string {
  const path = normalizeCliPath(targetPathFromSelectionTarget(target))
  const parts = path.split('/').filter(Boolean)
  const markerIndex = parts.indexOf('content_units')
  if (markerIndex >= 0 && parts[markerIndex + 1]) return parts[markerIndex + 1]!
  const separator = target.indexOf(':')
  if (separator > 0) return target.slice(separator + 1)
  return path.replace(/\/content_unit\.json$/, '')
}

function parseContentCandidateOutputKind(
  value: string | undefined,
  contentUnitRecord: Record<string, unknown>,
): 'image' | 'video' | 'audio' | 'text' | 'metadata' {
  const outputKind = targetKindValue(value)
    ? stringValue(contentUnitRecord.output_kind) ?? outputKindFromContentUnitType(stringValue(contentUnitRecord.content_unit_type))
    : value ?? stringValue(contentUnitRecord.output_kind) ?? outputKindFromContentUnitType(stringValue(contentUnitRecord.content_unit_type))
  if (outputKind === 'image' || outputKind === 'video' || outputKind === 'audio' || outputKind === 'text' || outputKind === 'metadata') return outputKind
  const inferred = outputKindFromContentUnitType(outputKind)
  if (inferred) return inferred
  throw new Error('candidate output kind must be image, video, audio, text, or metadata')
}

function outputKindFromContentUnitType(value: string | undefined): 'image' | 'video' | 'audio' | 'text' | 'metadata' | undefined {
  if (!value) return undefined
  if (value.includes('video')) return 'video'
  if (value.includes('image') || value.includes('frame') || value.includes('asset_ref')) return 'image'
  if (value.includes('audio') || value.includes('sound')) return 'audio'
  if (value.includes('text') || value.includes('script')) return 'text'
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function targetKindValue(value: string | undefined): value is 'asset' | 'keyframe' | 'content_unit' {
  return value === 'asset' || value === 'keyframe' || value === 'content_unit'
}

async function initProjectFromCliOptions(options: InitOptions, command: Command): Promise<void> {
  const merged = mergeGlobalOptions(options, command)
  const engine = createCliEngine(merged)
  const result = await engine.initProject({
    ...(options.id !== undefined ? { projectId: options.id } : {}),
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.language !== undefined ? { language: options.language } : {}),
    standards: parseKeyValueOptions(options.standard ?? []),
    overwrite: Boolean(options.overwrite),
  })
  printResult({ projectDir: engine.projectDir, ...result }, merged)
}

async function createDemoProjectFromCliOptions(options: DemoCreateOptions, command: Command): Promise<void> {
  const merged = mergeGlobalOptions(options, command)
  const engine = createCliEngine(merged)
  const repository = createNodeMovScriptWorkspaceFileRepository(engine.projectDir)
  const writtenPaths = await writeDemoProject(repository, {
    projectId: options.id ?? 'demo',
    title: options.title ?? 'Demo Film',
    overwrite: Boolean(options.overwrite),
  })
  const build = options.noCompile ? undefined : await engine.compile()
  printResult({
    projectDir: engine.projectDir,
    projectId: options.id ?? 'demo',
    writtenPaths,
    build: summarizeDemoBuild(build),
    next: [
      'cd <projectDir>',
      'movcli review',
      'movcli compiler prompt cu_storyboard_video',
      'movcli compile',
    ],
  }, merged)
  if (isRecord(build) && build.status === 'failed') process.exitCode = 2
}

function summarizeDemoBuild(build: unknown): unknown {
  if (!isRecord(build)) return build
  const review = isRecord(build.review) ? build.review : undefined
  const manifest = isRecord(build.manifest) ? build.manifest : undefined
  const output = isRecord(manifest?.output) ? manifest.output : undefined
  return pruneUndefined({
    status: build.status,
    readyToBuild: review?.readyToBuild,
    summary: review?.summary,
    editorStatePath: output?.editorStatePath,
    impactReportPath: output?.impactReportPath,
  })
}

async function writeDemoProject(
  repository: MovScriptWorkspaceFileRepository,
  input: { projectId: string; title: string; overwrite: boolean },
): Promise<Array<{ path: string; status: 'created' | 'updated' | 'skipped' }>> {
  const entries = demoProjectFileEntries(input.projectId, input.title)
  const results: Array<{ path: string; status: 'created' | 'updated' | 'skipped' }> = []
  for (const [path, record] of entries) {
    const existing = await repository.read({ path }).catch(() => undefined)
    if (existing && !input.overwrite) {
      results.push({ path, status: 'skipped' })
      continue
    }
    await repository.write({
      path,
      content: typeof record === 'string' ? record : `${JSON.stringify(record, null, 2)}\n`,
    })
    results.push({ path, status: existing ? 'updated' : 'created' })
  }
  return results
}

function demoProjectFileEntries(projectId: string, title: string): Array<[string, Record<string, unknown> | string]> {
  return [
    ['workspace.json', {
      schema: 'movscript.workspace.v1',
      project_id: projectId,
      title,
    }],
    ['project.json', {
      schema: 'movscript.project.v1',
      kind: 'project',
      project_id: projectId,
      title,
      language: 'zh-CN',
    }],
    ['project_standards.json', {
      schema: 'movscript.project_standards.v1',
      kind: 'project_standards',
      id: 'project_standards',
      title: 'Project standards',
      visual_style: 'Cold rainy suspense realism with restrained camera movement.',
      aspect_ratio: '16:9',
    }],
    ['scripts/main/script.json', {
      schema: 'movscript.script.v1',
      kind: 'script',
      id: 'main',
      title: 'Demo Script',
      source_ref: 'script.md',
    }],
    ['scripts/main/script.md', 'INT. APARTMENT - NIGHT\nRain hits the window. A phone lights up in the dark.\n'],
    ['settings/hero/setting.json', {
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'hero',
      setting_kind: 'character',
      title: 'Hero',
      profile: { appearance: 'young woman, exhausted, soaked by rain' },
    }],
    ['settings/hero/states/rain/setting_state.json', {
      schema: 'movscript.setting_state.v1',
      kind: 'setting_state',
      id: 'rain',
      title: 'Rain-soaked',
      description: 'Wet hair, cold phone light, anxious expression.',
    }],
    ['settings/hero/states/rain/assets/wet_hair/asset.json', {
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'wet_hair',
      title: 'Wet hair reference',
      slot: 'character_state_reference',
      asset_kind: 'image',
      prompt_hint: 'Wet black hair clinging to the forehead under cold blue phone light.',
    }],
    ['productions/p_demo/production.json', {
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'p_demo',
      title: 'Demo Episode',
    }],
    ['productions/p_demo/segments/opening/segment.json', {
      schema: 'movscript.segment.v1',
      kind: 'segment',
      id: 'opening',
      title: 'Opening',
      order: 1,
    }],
    ['productions/p_demo/segments/opening/scene_moments/phone_call/scene_moment.json', {
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'phone_call',
      title: 'Phone call',
      order: 1,
      transition: { out: 'hold_then_cut' },
      action: 'The phone screen lights the hero face while rain taps the window.',
    }],
    ['productions/p_demo/segments/opening/scene_moments/phone_call/storyboards/main/storyboard.json', {
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'main',
      title: 'Phone close-up',
      order: 1,
      timeline: { caption: 'Phone glow returns.', duration_sec: 4 },
      setting_refs: [{ setting_id: 'hero', setting_state_id: 'rain', role: 'subject' }],
      shot_plans: [{
        id: 'shot_plan_1',
        order: 1,
        shot_size: 'close_up',
        camera: { movement: 'slow_push_in', lens_mm: 50 },
        lighting: { key: 'cold phone screen blue light' },
      }],
    }],
    ['productions/p_demo/segments/opening/scene_moments/phone_call/keyframes/scene_anchor/keyframe.json', {
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'scene_anchor',
      title: 'Scene anchor',
      scene_moment_ref: 'productions/p_demo/segments/opening/scene_moments/phone_call',
      storyboard_ref: 'productions/p_demo/segments/opening/scene_moments/phone_call/storyboards/main',
      role: 'continuity_anchor',
      visual_intent: 'Rainy apartment close-up; cold phone light on frightened face.',
      reference_asset_refs: ['wet_hair'],
      continuity: { hair: 'wet and stuck to forehead', lighting: 'cold phone glow' },
    }],
    ['productions/p_demo/segments/opening/scene_moments/phone_call/audio_cues/phone_vibration/audio_cue.json', {
      schema: 'movscript.audio_cue.v1',
      kind: 'audio_cue',
      id: 'phone_vibration',
      title: 'Phone vibration',
      cue_kind: 'sound_effect',
      order: 1,
      scope_ref: 'productions/p_demo/segments/opening/scene_moments/phone_call',
      storyboard_ref: 'productions/p_demo/segments/opening/scene_moments/phone_call/storyboards/main',
      timing: { start: 'after_action', duration_sec: 1.2 },
      prompt_hint: 'Rain low, phone vibration sharp.',
    }],
    ['productions/p_demo/segments/opening/scene_moments/phone_call/expression_units/caption_1/expression_unit.json', {
      schema: 'movscript.expression_unit.v1',
      kind: 'expression_unit',
      id: 'caption_1',
      expression_kind: 'caption',
      text: 'Unknown number lights up again.',
    }],
    ['content_units/cu_wet_hair_ref/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_wet_hair_ref',
      title: 'Wet hair visual reference',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      asset_ref: 'wet_hair',
      edit_prompt: {
        text: 'Create the visual reference for wet hair continuity under cold phone light.',
        negative_text: 'cartoon, glamour lighting',
      },
      model_intent: { capability: 'image', aspect_ratio: '1:1' },
    }],
    ['content_units/cu_storyboard_video/content_unit.json', {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_storyboard_video',
      title: 'Phone close-up video',
      content_unit_type: 'storyboard_video',
      output_kind: 'video',
      scene_moment_ref: 'productions/p_demo/segments/opening/scene_moments/phone_call',
      storyboard_ref: 'productions/p_demo/segments/opening/scene_moments/phone_call/storyboards/main',
      keyframe_refs: ['scene_anchor'],
      edit_prompt: {
        text: 'Keep the push-in slow. Preserve wet hair and frightened expression continuity.',
        negative_text: 'cartoon, jump cut, overacting',
      },
      model_intent: { capability: 'video', duration_sec: 4, params: { camera_motion: 'slow_push_in' } },
    }],
  ]
}

async function overviewWorkspaceFromCliOptions(options: WorkspaceOptions, command: Command): Promise<void> {
  const merged = mergeGlobalOptions(options, command)
  const result = await createCliEngine(merged).overview()
  printResult(result, merged)
}

async function inspectWorkspaceFromCliOptions(options: WorkspaceOptions, command: Command): Promise<void> {
  const merged = mergeGlobalOptions(options, command)
  const result = await createCliEngine(merged).inspect()
  printResult(result, merged)
  if (isRecord(result) && result.readyToBuild === false) process.exitCode = 2
}

async function reviewWorkspaceFromCliOptions(options: WorkspaceOptions, command: Command): Promise<void> {
  return inspectWorkspaceFromCliOptions(options, command)
}

async function compileWorkspaceFromCliOptions(options: WorkspaceOptions, command: Command): Promise<void> {
  const merged = mergeGlobalOptions(options, command)
  const result = await createCliEngine(merged).compile()
  printResult(result, merged)
  if (isRecord(result) && result.status === 'failed') process.exitCode = 2
}

async function regenerationPlanFromCliOptions(options: WorkspaceOptions, command: Command): Promise<void> {
  const merged = mergeGlobalOptions(options, command)
  const result = await createCliEngine(merged).regenerationPlan()
  printResult(result, merged)
}

async function runInteractiveCli(options: WorkspaceOptions): Promise<void> {
  const rl = createInterface({ input, output })
  try {
    const engine = createCliEngine(options)
    console.log('MovScript interactive')
    console.log(`Workspace: ${engine.projectDir}`)
    console.log('Type /help for commands. Type /exit to quit.')
    if (input.isTTY) {
      while (true) {
        const line = await readInteractiveLine(rl)
        if (line === undefined) return
        const shouldExit = await dispatchInteractiveInputLine(line, options, engine)
        if (shouldExit) return
      }
    } else {
      for await (const line of rl) {
        const shouldExit = await dispatchInteractiveInputLine(line, options, engine)
        if (shouldExit) return
      }
    }
  } finally {
    rl.close()
  }
}

async function readInteractiveLine(rl: ReturnType<typeof createInterface>): Promise<string | undefined> {
  const abortController = new AbortController()
  const onSigint = () => {
    if (rl.line.length > 0) {
      clearReadlineInput(rl)
      return
    }
    abortController.abort()
  }

  rl.on('SIGINT', onSigint)
  try {
    return await rl.question(INTERACTIVE_PROMPT, { signal: abortController.signal })
  } catch (error) {
    if (isAbortError(error)) {
      output.write('\n')
      return undefined
    }
    throw error
  } finally {
    rl.off('SIGINT', onSigint)
  }
}

function clearReadlineInput(rl: ReturnType<typeof createInterface>): void {
  rl.write(null, { ctrl: true, name: 'a' })
  rl.write(null, { ctrl: true, name: 'k' })
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || 'code' in error && error.code === 'ABORT_ERR')
}

async function dispatchInteractiveInputLine(line: string, options: WorkspaceOptions, engine: CliEngine): Promise<boolean> {
  const trimmed = line.trim()
  if (!trimmed) return false
  try {
    return await dispatchInteractiveSlashCommand(trimmed, options, engine)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return false
  }
}

async function dispatchInteractiveSlashCommand(line: string, options: WorkspaceOptions, engine: CliEngine): Promise<boolean> {
  if (!line.startsWith('/')) {
    console.log('Interactive mode currently accepts slash commands. Type /help for commands.')
    return false
  }

  const args = parseCommandLine(line.slice(1))
  const command = args.shift()
  if (!command) return false

  if (command === 'exit' || command === 'quit' || command === 'q') return true
  if (command === 'help' || command === '?') {
    printInteractiveHelp()
    return false
  }

  if (command === 'init') {
    await dispatchInteractiveProjectCommand(['init', ...args], options, engine)
    return false
  }
  if (command === 'project') {
    await dispatchInteractiveProjectCommand(args, options, engine)
    return false
  }
  if (command === 'setting') {
    await dispatchInteractiveSettingCommand(args, options, engine)
    return false
  }
  if (command === 'asset') {
    await dispatchInteractiveAssetCommand(args, options, engine)
    return false
  }
  if (command === 'production') {
    await dispatchInteractiveProductionCommand(args, options, engine)
    return false
  }
  if (command === 'segment') {
    await dispatchInteractiveSegmentCommand(args, options, engine)
    return false
  }
  if (command === 'scene-moment' || command === 'moment') {
    await dispatchInteractiveSceneMomentCommand(args, options, engine)
    return false
  }
  if (command === 'storyboard') {
    await dispatchInteractiveStoryboardCommand(args, options, engine)
    return false
  }
  if (command === 'audio-cue') {
    await dispatchInteractiveAudioCueCommand(args, options, engine)
    return false
  }
  if (command === 'expression-unit' || command === 'expr') {
    await dispatchInteractiveExpressionUnitCommand(args, options, engine)
    return false
  }
  if (command === 'content-unit' || command === 'cu') {
    await dispatchInteractiveContentUnitCommand(args, options, engine)
    return false
  }
  if (command === 'entity') {
    await dispatchInteractiveEntityCommand(args, options, engine)
    return false
  }
  if (command === 'candidate') {
    await dispatchInteractiveCandidateCommand(args, options, engine)
    return false
  }
  if (command === 'compiler') {
    await dispatchInteractiveCompilerCommand(args, options, engine)
    return false
  }
  if (command === 'overview' || command === 'status') {
    const result = await engine.overview()
    printResult(result, options)
    return false
  }
  if (command === 'inspect') {
    const result = await engine.inspect()
    printResult(result, options)
    return false
  }
  if (command === 'review') {
    const result = await engine.inspect()
    printResult(result, options)
    return false
  }
  if (command === 'compile' || command === 'build') {
    const result = await engine.compile()
    printResult(result, options)
    return false
  }
  if (command === 'regen' || command === 'regenerate') {
    await dispatchInteractiveRegenerationCommand(args, options, engine)
    return false
  }

  throw new Error(`unknown slash command: /${command}`)
}

async function dispatchInteractiveCompilerCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'overview') {
    const result = await engine.overview()
    printResult(result, options)
    return
  }
  if (action === 'inspect' || action === 'review' || action === undefined) {
    const result = await engine.inspect()
    printResult(result, options)
    return
  }
  if (action === 'compile' || action === 'build') {
    const result = await engine.compile()
    printResult(result, options)
    return
  }
  if (action === 'prompt') {
    const contentUnitId = parsed.options.contentUnit ?? parsed.options['content-unit'] ?? parsed.positionals[0]
    if (!contentUnitId) throw new Error('usage: /compiler prompt <contentUnitId>')
    const result = await engine.buildContentUnitArtifact(contentUnitId)
    printResult(result, options)
    return
  }
  if (action === 'artifacts') {
    const result = await engine.buildArtifacts({
      ...(parsed.options.buildId !== undefined ? { buildId: parsed.options.buildId } : {}),
      ...(parsed.options['build-id'] !== undefined ? { buildId: parsed.options['build-id'] } : {}),
      ...(parsed.options.createdAt !== undefined ? { createdAt: parsed.options.createdAt } : {}),
      ...(parsed.options['created-at'] !== undefined ? { createdAt: parsed.options['created-at'] } : {}),
    })
    printResult(result, options)
    return
  }
  if (action === 'regen' || action === 'regenerate') {
    await dispatchInteractiveRegenerationCommand(args, options, engine)
    return
  }
  throw new Error(`unknown /compiler action: ${action}`)
}

async function dispatchInteractiveRegenerationCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  if (action === 'plan' || action === undefined) {
    const result = await engine.regenerationPlan()
    printResult(result, options)
    return
  }
  throw new Error(`unknown /regen action: ${action}`)
}

async function dispatchInteractiveProjectCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'init') {
    const standard = parsed.options.standard ?? parsed.options.standards
    const result = await engine.initProject({
      ...(parsed.options.id !== undefined || parsed.positionals[0] !== undefined
        ? { projectId: parsed.options.id ?? parsed.positionals[0] }
        : {}),
      ...(parsed.options.title !== undefined ? { title: parsed.options.title } : {}),
      ...(parsed.options.language !== undefined ? { language: parsed.options.language } : {}),
      standards: parseKeyValueOptions(standard === undefined ? [] : [standard]),
      overwrite: parsed.options.overwrite === 'true',
    })
    printResult({ projectDir: engine.projectDir, ...result }, options)
    return
  }
  if (action === 'demo') {
    const demoAction = args.shift()
    if (demoAction !== 'create') throw new Error(`unknown /project demo action: ${demoAction ?? '<missing>'}`)
    const demoOptions = parseSlashOptions(args)
    const repository = createNodeMovScriptWorkspaceFileRepository(engine.projectDir)
    const writtenPaths = await writeDemoProject(repository, {
      projectId: demoOptions.options.id ?? 'demo',
      title: demoOptions.options.title ?? 'Demo Film',
      overwrite: demoOptions.options.overwrite === 'true',
    })
    const shouldCompile = demoOptions.options.compile !== 'false' && demoOptions.options['no-compile'] !== 'true'
    const build = shouldCompile ? await engine.compile() : undefined
    printResult({
      projectDir: engine.projectDir,
      projectId: demoOptions.options.id ?? 'demo',
      writtenPaths,
      build: summarizeDemoBuild(build),
    }, options)
    return
  }
  throw new Error(`unknown /project action: ${action}`)
}

async function dispatchInteractiveSettingCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'list' || action === undefined) {
    const result = await engine.querySettings({
      ...(parsed.options.kind !== undefined ? { kind: parsed.options.kind } : {}),
      ...(parsed.options.query !== undefined ? { query: parsed.options.query } : {}),
      ...(parsed.options.limit !== undefined ? { limit: parsePositiveIntegerOption(parsed.options.limit, 'limit') } : {}),
    })
    printSettingsTable(result, options)
    return
  }
  if (action === 'add' || action === 'upsert') {
    const id = parsed.options.id ?? parsed.positionals[0]
    const title = parsed.options.title
    if (!id && !title) {
      throw new Error('usage: /setting add <id> [--title <title>] [--kind <kind>] [--description <text>]')
    }
    const result = await engine.upsertSetting({
      payload: pruneUndefined({
        id,
        title,
        setting_kind: parsed.options.kind ?? 'other',
        description: parsed.options.description,
      }),
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /setting action: ${action}`)
}

async function dispatchInteractiveAssetCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'list' || action === undefined) {
    const result = await engine.queryAssets({
      ...(parsed.options.setting !== undefined ? { settingId: parsed.options.setting } : {}),
      ...(parsed.options.state !== undefined ? { settingStateId: parsed.options.state } : {}),
      ...(parsed.options.query !== undefined ? { query: parsed.options.query } : {}),
      ...(parsed.options.limit !== undefined ? { limit: parsePositiveIntegerOption(parsed.options.limit, 'limit') } : {}),
    })
    printAssetsTable(result.assets, options)
    return
  }
  if (action === 'add' || action === 'upsert') {
    const id = parsed.options.id ?? parsed.positionals[0]
    const title = parsed.options.title
    if (!id && !title) {
      throw new Error('usage: /asset add <id> [--title <title>] [--setting <id>] [--state <id>] [--slot <slot>] [--kind <kind>] [--prompt <text>]')
    }
    const result = await engine.upsertAsset({
      payload: pruneUndefined({
        id,
        title,
        setting_id: parsed.options.setting,
        setting_state_id: parsed.options.state,
        slot: parsed.options.slot,
        asset_kind: parsed.options.kind ?? 'image',
        prompt_hint: parsed.options.prompt,
        resource_id: parsed.options.resourceId ?? parsed.options['resource-id'],
      }),
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /asset action: ${action}`)
}

async function dispatchInteractiveProductionCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'add' || action === 'create' || action === 'upsert') {
    const result = await engine.createProduction({
      id: parsed.options.id ?? 'main',
      title: parsed.options.title ?? parsed.positionals[0],
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /production action: ${action}`)
}

async function dispatchInteractiveSegmentCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'add' || action === 'create' || action === 'upsert') {
    const result = await engine.createSegment({
      id: parsed.options.id,
      productionId: parsed.options.production ?? 'main',
      title: parsed.options.title ?? parsed.positionals[0],
      kind: parsed.options.kind,
      summary: parsed.options.summary,
      order: parseOptionalNumberOption(parsed.options.order, 'order'),
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /segment action: ${action}`)
}

async function dispatchInteractiveSceneMomentCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'add' || action === 'create' || action === 'upsert') {
    const source = parsePlanningParentOptions({
      production: parsed.options.production,
      segment: parsed.options.segment,
    })
    const result = await engine.createSceneMoment({
      id: parsed.options.id ?? parsed.options.sceneMoment ?? parsed.options['scene-moment'],
      productionId: source.productionId,
      segmentId: source.segmentId,
      title: parsed.options.title ?? parsed.positionals[0],
      storyboardId: parsed.options.storyboard ?? 'main',
      order: parseOptionalNumberOption(parsed.options.order, 'order'),
      timeText: parsed.options.time,
      sceneCode: parsed.options.sceneCode ?? parsed.options['scene-code'],
      locationText: parsed.options.location,
      conditionText: parsed.options.condition,
      actionText: parsed.options.action,
      mood: parsed.options.mood,
      description: parsed.options.description,
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /scene-moment action: ${action}`)
}

async function dispatchInteractiveStoryboardCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'add' || action === 'create' || action === 'upsert') {
    const source = parseStoryboardParentOptions({
      production: parsed.options.production,
      segment: parsed.options.segment,
      sceneMoment: parsed.options.sceneMoment ?? parsed.options['scene-moment'],
    })
    const result = await engine.createStoryboard({
      id: parsed.options.id ?? 'main',
      productionId: source.productionId,
      segmentId: source.segmentId,
      sceneMomentId: source.sceneMomentId,
      title: parsed.options.title ?? parsed.positionals[0],
      order: parseOptionalNumberOption(parsed.options.order, 'order'),
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /storyboard action: ${action}`)
}

async function dispatchInteractiveAudioCueCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'add' || action === 'create' || action === 'upsert') {
    const source = parseAudioCueParentOptions({
      production: parsed.options.production,
      segment: parsed.options.segment,
      sceneMoment: parsed.options.sceneMoment ?? parsed.options['scene-moment'],
      storyboard: parsed.options.storyboard,
    })
    const result = await engine.createAudioCue({
      id: parsed.options.id,
      productionId: source.productionId,
      segmentId: source.segmentId,
      sceneMomentId: source.sceneMomentId,
      storyboardId: source.storyboardId,
      title: parsed.options.title ?? parsed.positionals[0],
      kind: parsed.options.kind ?? 'sound_effect',
      order: parseOptionalNumberOption(parsed.options.order, 'order'),
      shotPlanId: parsed.options.shotPlan ?? parsed.options['shot-plan'],
      promptHint: parsed.options.prompt,
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /audio-cue action: ${action}`)
}

async function dispatchInteractiveExpressionUnitCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'add' || action === 'create' || action === 'upsert') {
    const sourceOptions: AddExpressionUnitOptions = {
      id: parsed.options.id,
      title: parsed.options.title ?? parsed.positionals[0],
      production: parsed.options.production,
      segment: parsed.options.segment,
      sceneMoment: parsed.options.sceneMoment ?? parsed.options['scene-moment'],
      kind: parsed.options.kind ?? 'dialogue',
      speaker: parsed.options.speaker,
      text: parsed.options.text,
      note: parsed.options.note,
      intent: parsed.options.intent,
      order: parsed.options.order,
      storyboard: repeatedSlashOption(parsed.options.storyboard),
      fromStoryboard: parsed.options.fromStoryboard ?? parsed.options['from-storyboard'],
      toStoryboard: parsed.options.toStoryboard ?? parsed.options['to-storyboard'],
      scriptBlock: parsed.options.scriptBlock ?? parsed.options['script-block'],
    }
    const source = parseExpressionUnitParentOptions(sourceOptions)
    const result = await engine.createExpressionUnit({
      id: sourceOptions.id,
      productionId: source.productionId,
      segmentId: source.segmentId,
      sceneMomentId: source.sceneMomentId,
      title: sourceOptions.title,
      kind: sourceOptions.kind,
      speaker: sourceOptions.speaker,
      text: sourceOptions.text,
      note: sourceOptions.note,
      intent: sourceOptions.intent,
      order: parseOptionalNumberOption(sourceOptions.order, 'order'),
      span: expressionUnitSpanFromOptions(sourceOptions),
      scriptBlockId: sourceOptions.scriptBlock,
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /expression-unit action: ${action}`)
}

async function dispatchInteractiveContentUnitCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'status' || action === 'panel') {
    const idOrPath = parsed.positionals[0] ?? parsed.options.id
    if (!idOrPath) throw new Error('usage: /content-unit status <idOrPath>')
    const result = await buildContentUnitStatusPanel(engine, idOrPath)
    printContentUnitStatusPanel(result, options)
    return
  }
  if (action === 'add' || action === 'create' || action === 'upsert') {
    const title = parsed.options.title ?? parsed.positionals[0]
    const sourceOptions: AddContentUnitOptions = {
      id: parsed.options.id,
      title,
      kind: parsed.options.kind ?? 'shot',
      production: parsed.options.production,
      segment: parsed.options.segment,
      sceneMoment: parsed.options.sceneMoment ?? parsed.options['scene-moment'],
      storyboard: parsed.options.storyboard ?? 'main',
      audioCue: parsed.options.audioCue ?? parsed.options['audio-cue'],
      prompt: parsed.options.prompt,
      description: parsed.options.description,
      order: parsed.options.order,
      duration: parsed.options.duration,
      shotSize: parsed.options.shotSize ?? parsed.options['shot-size'],
      cameraAngle: parsed.options.cameraAngle ?? parsed.options['camera-angle'],
      cameraMotion: parsed.options.cameraMotion ?? parsed.options['camera-motion'],
    }
    const source = parseContentUnitSourceOptions(sourceOptions)
    const result = await engine.createContentUnit({
      id: sourceOptions.id,
      title: sourceOptions.title,
      kind: sourceOptions.kind,
      productionId: source.productionId,
      segmentId: source.segmentId,
      sceneMomentId: source.sceneMomentId,
      storyboardId: source.storyboardId,
      audioCueId: source.audioCueId,
      prompt: sourceOptions.prompt,
      description: sourceOptions.description,
      order: parseOptionalNumberOption(sourceOptions.order, 'order'),
      durationSeconds: parseOptionalNumberOption(sourceOptions.duration, 'duration'),
      shotSize: sourceOptions.shotSize,
      cameraAngle: sourceOptions.cameraAngle,
      cameraMotion: sourceOptions.cameraMotion,
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /content-unit action: ${action}`)
}

async function dispatchInteractiveEntityCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  if (action !== 'list' && action !== undefined) throw new Error(`unknown /entity action: ${action}`)
  const entityKindInput = args[0]?.startsWith('--') ? undefined : args.shift()
  if (entityKindInput !== undefined && !isSemanticEntityKind(entityKindInput)) {
    throw new Error(`unknown entity kind: ${entityKindInput}`)
  }
  const parsed = parseSlashOptions(args)
  const result = await engine.queryEntities({
    ...(entityKindInput !== undefined ? { entityKind: entityKindInput } : {}),
    ...(parsed.options.kind !== undefined ? { kind: parsed.options.kind } : {}),
    ...(parsed.options.query !== undefined ? { query: parsed.options.query } : {}),
    ...(parsed.options.limit !== undefined ? { limit: parsePositiveIntegerOption(parsed.options.limit, 'limit') } : {}),
  })
  printEntityList(result, options, {
    title: entityKindInput ? `${entityKindInput} entities` : 'Entities',
    columns: [
      { header: 'Kind', value: (item) => item.entityKind },
      { header: 'ID', value: (item) => item.id },
      { header: 'Type', value: (item) => item.record.setting_kind ?? item.record.asset_kind ?? item.record.content_unit_type ?? item.record.cue_kind ?? item.record.kind },
      { header: 'Title', value: (item) => item.record.title ?? item.record.label ?? item.id },
      { header: 'Path', value: (item) => item.path, maxWidth: 52 },
    ],
  })
}

async function dispatchInteractiveCandidateCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'add' || action === 'append') {
    const target = parsed.options.target ?? parsed.positionals[0]
    const resourceId = parsed.options.resourceId ?? parsed.options['resource-id'] ?? parsed.positionals[1]
    if (!target || !resourceId) {
      throw new Error('usage: /candidate add <content-unit> <resource-id> [--id <id>] [--kind <output-kind|content_unit_type>] [--source <source>] [--notes <text>]')
    }
    const result = await addCandidateFromCliOptions(engine, target, {
      id: parsed.options.id,
      kind: parsed.options.kind,
      targetKind: parsed.options.targetKind ?? parsed.options['target-kind'],
      outputKind: parsed.options.outputKind ?? parsed.options['output-kind'],
      resourceId,
      source: parsed.options.source ?? 'manual',
      notes: parsed.options.notes,
    })
    printResult(result, options)
    return
  }
  if (action === 'select' || action === 'choose' || action === 'lock') {
    const target = parsed.options.target ?? parsed.positionals[0]
    const candidateId = parsed.options.candidateId ?? parsed.options['candidate-id'] ?? parsed.positionals[1]
    if (!target || !candidateId) {
      throw new Error('usage: /candidate select <content-unit> <candidate-id> [--reason <text>]')
    }
    const result = await selectCandidateFromCliOptions(engine, target, candidateId, {
      kind: parsed.options.kind,
      targetKind: parsed.options.targetKind ?? parsed.options['target-kind'],
      reason: parsed.options.reason,
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /candidate action: ${action}`)
}

function printInteractiveHelp(): void {
  console.log(`Slash commands:
  /project init [id] [--title <title>] [--language <language>] [--standard <key=value>] [--overwrite]
  /project demo create [--id <id>] [--title <title>] [--overwrite] [--no-compile]
  /init [id] [--title <title>] [--language <language>] [--standard <key=value>] [--overwrite]
  /setting list [--kind <kind>] [--query <text>] [--limit <n>]
  /setting add <id> [--title <title>] [--kind <kind>] [--description <text>]
  /asset list [--setting <id>] [--state <id>] [--query <text>] [--limit <n>]
  /asset add <id> [--title <title>] [--setting <id>] [--state <id>] [--slot <slot>] [--kind <kind>] [--prompt <text>]
  /production add [--id <id>] [--title <title>]
  /segment add --title <title> [--production <id>] [--id <id>] [--order <n>]
  /scene-moment add --title <title> --segment <id-or-path> [--production <id>] [--id <id>] [--storyboard <id>]
  /storyboard add --scene-moment <id-or-path> [--segment <id-or-path>] [--id <id>] [--title <title>] [--order <n>]
  /audio-cue add --scene-moment <id-or-path> [--storyboard <id-or-path>] [--id <id>] [--title <title>] [--kind <kind>] [--prompt <text>]
  /expression-unit add --scene-moment <id-or-path> [--id <id>] [--kind <kind>] [--speaker <text>] [--text <text>] [--storyboard <id-or-path>]
  /content-unit add --title <title> --scene-moment <id-or-path> [--storyboard <id-or-path>] [--audio-cue <id-or-path>] [--prompt <text>]
  /content-unit status <id-or-path>
  /entity list [entityKind] [--kind <kind>] [--query <text>] [--limit <n>]
  /candidate add <content-unit> <resource-id> [--kind <output-kind|content_unit_type>] [--id <id>] [--source <source>] [--notes <text>]
  /candidate select <content-unit> <candidate-id> [--reason <text>]
  /overview
  /inspect
  /compiler overview
  /compiler inspect
  /compiler compile
  /compiler regen plan
  /compiler prompt <contentUnitId>
  /compiler artifacts [--build-id <id>] [--created-at <iso>]
  /review
  /compile
  /regen plan
  /help
  /exit`)
}

function printResult(result: unknown, options: WorkspaceOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  console.log(JSON.stringify(result, null, 2))
}

async function buildContentUnitStatusPanel(
  engine: CliEngine,
  idOrPath: string,
): Promise<Record<string, unknown>> {
  const contentUnit = await findContentUnitForPanel(engine, idOrPath)
  const contentUnitId = contentUnit.id ?? idOrPath
  const [
    runtimePanel,
    inputVersion,
    dependencyReport,
    selectionValidity,
    candidates,
    selection,
  ] = await Promise.all([
    engine.workspaceService.readContentUnitRuntimePanel(contentUnitId),
    engine.workspaceService.readContentUnitInputVersion(contentUnitId),
    engine.workspaceService.readContentUnitDependencyReport(contentUnitId),
    engine.workspaceService.readContentUnitSelectionValidity(contentUnitId),
    listContentUnitCandidates(engine, contentUnit),
    readContentUnitSelection(engine, contentUnit),
  ])
  return pruneUndefined({
    contentUnit: {
      id: contentUnit.id,
      path: contentUnit.path,
      title: contentUnit.record.title,
      type: contentUnit.record.content_unit_type,
      outputKind: contentUnit.record.output_kind,
    },
    source: pruneUndefined({
      sceneMomentRef: contentUnit.record.scene_moment_ref,
      storyboardRef: contentUnit.record.storyboard_ref,
      assetRef: contentUnit.record.asset_ref,
      keyframeRefs: contentUnit.record.keyframe_refs,
      editPrompt: contentUnit.record.edit_prompt,
      modelIntent: contentUnit.record.model_intent,
    }),
    runtime: runtimePanel,
    inputVersion,
    dependencyReport,
    selectionValidity,
    candidates,
    selection,
    summary: summarizeContentUnitStatus(runtimePanel, inputVersion, dependencyReport, selectionValidity, candidates),
  })
}

async function listContentUnitCandidates(
  engine: CliEngine,
  contentUnit: MovScriptWorkspaceIndexedEntity,
): Promise<Array<{ path: string; record: Record<string, unknown> }>> {
  const contentUnitDir = normalizeCliPath(contentUnit.path.replace(/\/content_unit\.json$/, ''))
  const candidateRoot = `${contentUnitDir}/candidates`
  const repository = createNodeMovScriptWorkspaceFileRepository(engine.projectDir)
  const listed = await repository.list({ path: candidateRoot }).catch(() => undefined)
  const candidateDirs = listed?.entries.filter((entry) => entry.kind === 'directory') ?? []
  const candidates = await Promise.all(candidateDirs.map(async (entry) => {
    const path = `${entry.path}/content_candidate.json`
    const file = await repository.read({ path }).catch(() => undefined)
    if (!file) return undefined
    const parsed = JSON.parse(file.content) as unknown
    if (!isRecord(parsed)) return undefined
    return { path: file.path, record: parsed }
  }))
  return candidates.filter((candidate): candidate is { path: string; record: Record<string, unknown> } => candidate !== undefined)
}

async function findContentUnitCandidate(
  engine: CliEngine,
  contentUnit: MovScriptWorkspaceIndexedEntity,
  candidateId: string,
): Promise<{ path: string; record: Record<string, unknown> } | undefined> {
  const candidates = await listContentUnitCandidates(engine, contentUnit)
  return candidates.find((candidate) => String(candidate.record.id ?? '') === candidateId)
}

async function readContentUnitSelection(
  engine: CliEngine,
  contentUnit: MovScriptWorkspaceIndexedEntity,
): Promise<Record<string, unknown> | undefined> {
  const repository = createNodeMovScriptWorkspaceFileRepository(engine.projectDir)
  const contentUnitDir = normalizeCliPath(contentUnit.path.replace(/\/content_unit\.json$/, ''))
  const file = await repository.read({ path: `${contentUnitDir}/selection.json` }).catch(() => undefined)
  if (!file) return undefined
  const parsed = JSON.parse(file.content) as unknown
  return isRecord(parsed) ? parsed : undefined
}

function candidateResourceId(candidate: Record<string, unknown> | undefined): string | number | undefined {
  const firstOutput = arrayField(candidate?.outputs).filter(isRecord)[0]
  const resourceId = firstOutput?.resource_id
  return typeof resourceId === 'string' || typeof resourceId === 'number' ? resourceId : undefined
}

async function findContentUnitForPanel(engine: CliEngine, idOrPath: string): Promise<MovScriptWorkspaceIndexedEntity> {
  const normalized = normalizeCliPath(idOrPath)
  const entities = await engine.queryEntities({ entityKind: 'content_unit' })
  const match = entities.find((entity) => String(entity.id ?? '') === idOrPath)
    ?? entities.find((entity) => normalizeCliPath(entity.path) === normalized)
    ?? entities.find((entity) => normalizeCliPath(entity.path.replace(/\/content_unit\.json$/, '')) === normalized)
    ?? entities.find((entity) => normalizeCliPath(`content_units/${String(entity.id ?? '')}`) === normalized)
  if (!match) throw new Error(`content_unit not found: ${idOrPath}`)
  return match
}

function summarizeContentUnitStatus(
  runtimePanel: Record<string, unknown> | undefined,
  inputVersion: Record<string, unknown> | undefined,
  dependencyReport: Record<string, unknown> | undefined,
  selectionValidity: Record<string, unknown> | undefined,
  candidates: unknown[] = [],
): Record<string, unknown> {
  return pruneUndefined({
    built: Boolean(runtimePanel && inputVersion),
    status: runtimePanel?.status,
    inputHash: shortHash(inputVersion?.hash),
    selected: selectionValidity?.selected,
    stale: selectionValidity?.stale,
    candidateId: selectionValidity?.candidate_id,
    resourceId: selectionValidity?.resource_id,
    candidateCount: candidates.length,
    dependencyCount: arrayField(dependencyReport?.dependencies).length,
    upstreamSelectionCount: arrayField(dependencyReport?.upstream_selections).length,
    runtimeInputCount: arrayField(recordField(runtimePanel?.runtime_request)?.inputs).length,
    issueCount: arrayField(dependencyReport?.issues).length,
  })
}

function printContentUnitStatusPanel(panel: Record<string, unknown>, options: WorkspaceOptions): void {
  if (options.json) {
    printResult(panel, options)
    return
  }
  const contentUnit = recordField(panel.contentUnit)
  const source = recordField(panel.source)
  const runtime = recordField(panel.runtime)
  const inputVersion = recordField(panel.inputVersion)
  const dependencyReport = recordField(panel.dependencyReport)
  const selectionValidity = recordField(panel.selectionValidity)
  const selection = recordField(panel.selection)
  const summary = recordField(panel.summary)
  const prompt = recordField(runtime?.prompt)
  const runtimeRequest = recordField(runtime?.runtime_request)
  const candidates = arrayField(panel.candidates).filter(isRecord)
  const dependencies = arrayField(dependencyReport?.dependencies).filter(isRecord)
  const upstreamSelections = arrayField(dependencyReport?.upstream_selections).filter(isRecord)
  const runtimeInputs = arrayField(runtimeRequest?.inputs).filter(isRecord)
  const issues = arrayField(dependencyReport?.issues).filter(isRecord)

  const lines = [
    `Content Unit: ${scalarDisplayValue(contentUnit?.id)}  ${scalarDisplayValue(contentUnit?.title)}`,
    `Path: ${scalarDisplayValue(contentUnit?.path)}`,
    `Type: ${scalarDisplayValue(contentUnit?.type)} -> ${scalarDisplayValue(contentUnit?.outputKind)}`,
    `Build: ${summary?.built ? 'built' : 'missing'}  Runtime: ${scalarDisplayValue(summary?.status)}  Hash: ${scalarDisplayValue(summary?.inputHash)}  Candidates: ${scalarDisplayValue(summary?.candidateCount)}`,
    `Selection: ${selectionLabel(selection, selectionValidity)}  Stale: ${selectionValidity?.stale === true ? 'yes' : 'no'}`,
    '',
    'Source Refs',
    `  scene_moment: ${scalarDisplayValue(source?.sceneMomentRef)}`,
    `  storyboard:    ${scalarDisplayValue(source?.storyboardRef)}`,
    `  asset:         ${scalarDisplayValue(source?.assetRef)}`,
    `  keyframes:     ${scalarDisplayValue(source?.keyframeRefs)}`,
    '',
    'Prompt',
    `  text:     ${formatCell(prompt?.text, 96)}`,
    `  negative: ${formatCell(prompt?.negative_text, 96)}`,
    '',
    'Runtime Inputs',
    ...(runtimeInputs.length ? runtimeInputs.map((item) => {
      return `  ${scalarDisplayValue(item.role)} ${scalarDisplayValue(item.kind)} ref=${scalarDisplayValue(item.ref)} resource=${scalarDisplayValue(item.resource_id)}`
    }) : ['  -']),
    '',
    'Upstream Selections',
    ...(upstreamSelections.length ? upstreamSelections.map((item) => {
      return `  ${scalarDisplayValue(item.content_unit_ref)} candidate=${scalarDisplayValue(item.candidate_id)} resource=${scalarDisplayValue(item.resource_id)} hash=${shortHash(item.accepted_input_hash)}`
    }) : ['  -']),
    '',
    'Candidates',
    ...(candidates.length ? candidates.map((item) => {
      const record = recordField(item.record) ?? {}
      const selected = selection?.candidate_id !== undefined && String(selection.candidate_id) === String(record.id) ? '*' : ' '
      const outputs = arrayField(record.outputs).filter(isRecord)
      const outputSummary = outputs.length
        ? outputs.map((output) => `${scalarDisplayValue(output.kind)}:${scalarDisplayValue(output.resource_id)}`).join(', ')
        : '-'
      return ` ${selected} ${scalarDisplayValue(record.id)} source=${scalarDisplayValue(record.source)} status=${scalarDisplayValue(record.status)} outputs=${outputSummary}`
    }) : ['  -']),
    '',
    'Dependencies',
    ...(dependencies.length ? dependencies.map((item) => {
      return `  ${scalarDisplayValue(item.role)} ${scalarDisplayValue(item.entityKind)}:${scalarDisplayValue(item.id)} ${scalarDisplayValue(item.path)}`
    }) : ['  -']),
    '',
    'Issues',
    ...(issues.length ? issues.map((item) => `  ${scalarDisplayValue(item.severity)} ${scalarDisplayValue(item.message)}`) : ['  -']),
  ]
  console.log(lines.join('\n'))
}

function selectionLabel(
  selection: Record<string, unknown> | undefined,
  selectionValidity: Record<string, unknown> | undefined,
): string {
  if (selection?.candidate_id !== undefined) {
    return `${scalarDisplayValue(selection.candidate_id)} resource=${scalarDisplayValue(selection.resource_id)} reason=${scalarDisplayValue(selection.reason)}`
  }
  if (!selectionValidity?.selected) return 'none'
  return `${scalarDisplayValue(selectionValidity.candidate_id)} resource=${scalarDisplayValue(selectionValidity.resource_id)} accepted=${shortHash(selectionValidity.accepted_input_hash)}`
}

interface TableColumn<T> {
  header: string
  value: (item: T) => unknown
  maxWidth?: number
}

function printEntityList(
  entities: MovScriptWorkspaceIndexedEntity[],
  options: WorkspaceOptions,
  table: { title: string; columns: TableColumn<MovScriptWorkspaceIndexedEntity>[] },
): void {
  if (options.json) {
    printResult(entities, options)
    return
  }
  if (entities.length === 0) {
    console.log(`${table.title}: no entities found`)
    return
  }
  console.log(renderTable(table.columns, entities))
}

function printSettingsTable(settings: MovScriptWorkspaceIndexedEntity[], options: WorkspaceOptions): void {
  printEntityList(settings, options, {
    title: 'Settings',
    columns: [
      { header: 'ID', value: (entity) => entity.id },
      { header: 'Kind', value: (entity) => entity.record.setting_kind ?? entity.record.kind },
      { header: 'Title', value: (entity) => entity.record.title ?? entity.id },
      { header: 'Description', value: (entity) => entity.record.description, maxWidth: 44 },
      { header: 'Path', value: (entity) => entity.path, maxWidth: 52 },
    ],
  })
}

function printAssetsTable(assets: MovScriptWorkspaceIndexedEntity[], options: WorkspaceOptions): void {
  printEntityList(assets, options, {
    title: 'Assets',
    columns: [
      { header: 'ID', value: (entity) => entity.id },
      { header: 'Kind', value: (entity) => entity.record.asset_kind ?? entity.record.kind },
      { header: 'Setting', value: (entity) => entity.record.setting_id },
      { header: 'State', value: (entity) => entity.record.setting_state_id },
      { header: 'Slot', value: (entity) => entity.record.slot },
      { header: 'Title', value: (entity) => entity.record.title ?? entity.id },
      { header: 'Path', value: (entity) => entity.path, maxWidth: 52 },
    ],
  })
}

async function printPlanningEntityList(
  entityKind: CliSemanticEntityKind,
  title: string,
  options: PlanningListOptions,
  command: Command,
): Promise<void> {
  const merged = mergeGlobalOptions(options, command)
  const entities = await listPlanningEntities(createCliEngine(merged), entityKind, planningListInput(options))
  printEntityList(entities, merged, {
    title,
    columns: [
      { header: 'ID', value: (entity) => entity.id },
      { header: 'Kind', value: (entity) => entity.record.segment_kind ?? entity.record.cue_kind ?? entity.record.kind },
      { header: 'Order', value: (entity) => entity.record.order },
      { header: 'Title', value: (entity) => entity.record.title ?? entity.record.name },
      { header: 'Path', value: (entity) => entity.path, maxWidth: 64 },
    ],
  })
}

async function deletePlanningEntity(
  entityKind: CliSemanticEntityKind,
  idOrPath: string,
  options: PlanningDeleteOptions,
  command: Command,
): Promise<void> {
  const merged = mergeGlobalOptions(options, command)
  const engine = createCliEngine(merged)
  const result = await deletePlanningEntityWithEngine(engine, entityKind, {
    id: idOrPath,
    ...planningParentInput(options),
  })
  printResult({ deleted: true, entityKind, id: result.entity.id, path: result.entity.path }, merged)
}

function planningListInput(options: PlanningListOptions): {
  kind?: string
  query?: string
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  limit?: number
} {
  return pruneUndefined({
    kind: options.kind,
    query: options.query,
    productionId: options.production,
    segmentId: options.segment !== undefined ? parseSegmentRefOption(options.segment).segmentId ?? options.segment : undefined,
    sceneMomentId: options.sceneMoment !== undefined ? parseSceneMomentRefOption(options.sceneMoment).sceneMomentId ?? options.sceneMoment : undefined,
    limit: options.limit !== undefined ? parsePositiveIntegerOption(options.limit, 'limit') : undefined,
  })
}

function planningParentInput(options: PlanningDeleteOptions): {
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
} {
  return pruneUndefined({
    productionId: options.production,
    segmentId: options.segment !== undefined ? parseSegmentRefOption(options.segment).segmentId ?? options.segment : undefined,
    sceneMomentId: options.sceneMoment !== undefined ? parseSceneMomentRefOption(options.sceneMoment).sceneMomentId ?? options.sceneMoment : undefined,
  })
}

function listPlanningEntities(
  engine: ReturnType<typeof createCliEngine>,
  entityKind: CliSemanticEntityKind,
  input: ReturnType<typeof planningListInput>,
): Promise<MovScriptWorkspaceIndexedEntity[]> {
  if (entityKind === 'production') return engine.listProductions(input)
  if (entityKind === 'segment') return engine.listSegments(input)
  if (entityKind === 'scene_moment') return engine.listSceneMoments(input)
  if (entityKind === 'storyboard') return engine.listStoryboards(input)
  if (entityKind === 'audio_cue') return engine.listAudioCues(input)
  if (entityKind === 'expression_unit') return engine.listExpressionUnits(input)
  if (entityKind === 'content_unit') return engine.listContentUnits(input)
  return engine.queryEntities({ entityKind, ...input })
}

function deletePlanningEntityWithEngine(
  engine: ReturnType<typeof createCliEngine>,
  entityKind: CliSemanticEntityKind,
  input: { id: string | number; productionId?: string | number; segmentId?: string | number; sceneMomentId?: string | number },
) {
  if (entityKind === 'production') return engine.deleteProduction(input)
  if (entityKind === 'segment') return engine.deleteSegment(input)
  if (entityKind === 'scene_moment') return engine.deleteSceneMoment(input)
  if (entityKind === 'storyboard') return engine.deleteStoryboard(input)
  if (entityKind === 'audio_cue') return engine.deleteAudioCue(input)
  if (entityKind === 'expression_unit') return engine.deleteExpressionUnit(input)
  if (entityKind === 'content_unit') return engine.deleteContentUnit(input)
  throw new Error(`delete is not supported for ${entityKind}`)
}

function renderTable<T>(columns: TableColumn<T>[], rows: T[]): string {
  const renderedRows = rows.map((row) => columns.map((column) => formatCell(column.value(row), column.maxWidth)))
  const widths = columns.map((column, index) => {
    const values = renderedRows.map((row) => row[index] ?? '')
    return Math.max(column.header.length, ...values.map((value) => value.length))
  })
  const separator = `+-${widths.map((width) => '-'.repeat(width)).join('-+-')}-+`
  const header = tableRow(columns.map((column) => column.header), widths)
  const body = renderedRows.map((row) => tableRow(row, widths))
  return [separator, header, separator, ...body, separator].join('\n')
}

function tableRow(cells: string[], widths: number[]): string {
  return `| ${cells.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join(' | ')} |`
}

function formatCell(value: unknown, maxWidth = 72): string {
  const text = scalarDisplayValue(value).replace(/\s+/g, ' ').trim()
  if (text.length <= maxWidth) return text
  return `${text.slice(0, Math.max(0, maxWidth - 3))}...`
}

function scalarDisplayValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function shortHash(value: unknown): string {
  const text = typeof value === 'string' ? value : ''
  if (!text) return '-'
  return text.length > 12 ? text.slice(0, 12) : text
}

function isSemanticEntityKind(value: string): value is CliSemanticEntityKind {
  return (SEMANTIC_ENTITY_KINDS as readonly string[]).includes(value)
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value]
}

function parseKeyValueOptions(values: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const value of values) {
    const index = value.indexOf('=')
    if (index <= 0) throw new Error(`expected key=value option: ${value}`)
    result[value.slice(0, index)] = parseScalar(value.slice(index + 1))
  }
  return result
}

function parseOptionalKeyValueOptions(values: string[]): Record<string, unknown> | undefined {
  if (values.length === 0) return undefined
  return parseKeyValueOptions(values)
}

function parseScalar(value: string): unknown {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value !== '' && Number.isFinite(Number(value))) return Number(value)
  return value
}

function pruneUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output
}

function parsePositiveIntegerOption(value: string, optionName: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${optionName} must be a positive integer`)
  return parsed
}

function parseOptionalNumberOption(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${optionName} must be a number`)
  return parsed
}

interface ContentUnitSourceRefs {
  productionId?: string
  segmentId?: string
  sceneMomentId?: string
  storyboardId?: string
  audioCueId?: string
  expressionUnitId?: string
}

function parseContentUnitSourceOptions(options: AddContentUnitOptions): ContentUnitSourceRefs {
  const sceneMoment = parseSceneMomentRefOption(options.sceneMoment)
  const storyboard = parseStoryboardRefOption(options.storyboard)
  const audioCue = parseAudioCueRefOption(options.audioCue)
  const source = pruneUndefined({
    productionId: options.production ?? audioCue.productionId ?? storyboard.productionId ?? sceneMoment.productionId,
    segmentId: options.segment ?? audioCue.segmentId ?? storyboard.segmentId ?? sceneMoment.segmentId,
    sceneMomentId: sceneMoment.sceneMomentId ?? audioCue.sceneMomentId ?? storyboard.sceneMomentId,
    storyboardId: storyboard.storyboardId ?? 'main',
    audioCueId: audioCue.audioCueId,
  })
  if (!source.sceneMomentId) {
    throw new Error('--scene-moment is required unless --storyboard is a path under scene_moments')
  }
  return source
}

function parsePlanningParentOptions(options: {
  production?: string
  segment?: string
}): { productionId: string; segmentId: string } {
  const segment = parseSegmentRefOption(options.segment)
  const productionId = options.production ?? segment.productionId ?? 'main'
  const segmentId = segment.segmentId
  if (!segmentId) throw new Error('--segment is required')
  return { productionId, segmentId }
}

function parseStoryboardParentOptions(options: {
  production?: string
  segment?: string
  sceneMoment?: string
}): { productionId: string; segmentId: string; sceneMomentId: string } {
  const segment = parseSegmentRefOption(options.segment)
  const sceneMoment = parseSceneMomentRefOption(options.sceneMoment)
  const productionId = options.production ?? sceneMoment.productionId ?? segment.productionId ?? 'main'
  const segmentId = sceneMoment.segmentId ?? segment.segmentId
  const sceneMomentId = sceneMoment.sceneMomentId
  if (!segmentId) throw new Error('--segment is required unless --scene-moment is a path under segments')
  if (!sceneMomentId) throw new Error('--scene-moment is required')
  return { productionId, segmentId, sceneMomentId }
}

function parseAudioCueParentOptions(options: {
  production?: string
  segment?: string
  sceneMoment?: string
  storyboard?: string
}): { productionId: string; segmentId: string; sceneMomentId: string; storyboardId?: string } {
  const segment = parseSegmentRefOption(options.segment)
  const sceneMoment = parseSceneMomentRefOption(options.sceneMoment)
  const storyboard = parseStoryboardRefOption(options.storyboard)
  const productionId = options.production ?? storyboard.productionId ?? sceneMoment.productionId ?? segment.productionId ?? 'main'
  const segmentId = storyboard.segmentId ?? sceneMoment.segmentId ?? segment.segmentId
  const sceneMomentId = sceneMoment.sceneMomentId ?? storyboard.sceneMomentId
  if (!segmentId) throw new Error('--segment is required unless --scene-moment or --storyboard is a path under segments')
  if (!sceneMomentId) throw new Error('--scene-moment is required unless --storyboard is a path under scene_moments')
  return {
    productionId,
    segmentId,
    sceneMomentId,
    ...(storyboard.storyboardId !== undefined ? { storyboardId: storyboard.storyboardId } : {}),
  }
}

function parseExpressionUnitParentOptions(options: {
  production?: string
  segment?: string
  sceneMoment?: string
  storyboard?: string[]
}): { productionId: string; segmentId: string; sceneMomentId: string } {
  const segment = parseSegmentRefOption(options.segment)
  const sceneMoment = parseSceneMomentRefOption(options.sceneMoment)
  const storyboardSource = (options.storyboard ?? []).map(parseStoryboardRefOption)
    .find((source) => source.sceneMomentId !== undefined)
  const productionId = options.production ?? storyboardSource?.productionId ?? sceneMoment.productionId ?? segment.productionId ?? 'main'
  const segmentId = storyboardSource?.segmentId ?? sceneMoment.segmentId ?? segment.segmentId
  const sceneMomentId = sceneMoment.sceneMomentId ?? storyboardSource?.sceneMomentId
  if (!segmentId) throw new Error('--segment is required unless --scene-moment or --storyboard is a path under segments')
  if (!sceneMomentId) throw new Error('--scene-moment is required unless --storyboard is a path under scene_moments')
  return { productionId, segmentId, sceneMomentId }
}

function expressionUnitSpanFromOptions(options: AddExpressionUnitOptions): Record<string, unknown> | undefined {
  const storyboardRefs = (options.storyboard ?? []).map((value) => targetPathFromSelectionTarget(value))
  const span = pruneUndefined({
    storyboard_refs: storyboardRefs.length ? storyboardRefs : undefined,
    from_storyboard_id: options.fromStoryboard,
    to_storyboard_id: options.toStoryboard,
  })
  return Object.keys(span).length ? span : undefined
}

function repeatedSlashOption(value: string | undefined): string[] {
  if (!value) return []
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function parseSegmentRefOption(value: string | undefined): ContentUnitSourceRefs {
  if (!value) return {}
  if (value.includes('/')) return parsePlanningSourcePath(value)
  return { segmentId: value }
}

function parseSceneMomentRefOption(value: string | undefined): ContentUnitSourceRefs {
  if (!value) return {}
  if (value.includes('/')) return parsePlanningSourcePath(value)
  return { sceneMomentId: value }
}

function parseStoryboardRefOption(value: string | undefined): ContentUnitSourceRefs {
  if (!value) return {}
  if (value.includes('/')) return parsePlanningSourcePath(value)
  return { storyboardId: value }
}

function parseAudioCueRefOption(value: string | undefined): ContentUnitSourceRefs {
  if (!value) return {}
  if (value.includes('/')) return parsePlanningSourcePath(value)
  return { audioCueId: value }
}

function parsePlanningSourcePath(value: string): ContentUnitSourceRefs {
  const path = normalizeCliPath(targetPathFromSelectionTarget(value))
  const parts = path.split('/').filter(Boolean)
  return pruneUndefined({
    productionId: pathSegmentAfter(parts, 'productions'),
    segmentId: pathSegmentAfter(parts, 'segments'),
    sceneMomentId: pathSegmentAfter(parts, 'scene_moments'),
    storyboardId: pathSegmentAfter(parts, 'storyboards'),
    audioCueId: pathSegmentAfter(parts, 'audio_cues'),
    expressionUnitId: pathSegmentAfter(parts, 'expression_units'),
  })
}

function pathSegmentAfter(parts: string[], marker: string): string | undefined {
  const index = parts.indexOf(marker)
  const value = index >= 0 ? parts[index + 1] : undefined
  if (!value || value.endsWith('.json')) return undefined
  return value
}

function parseSlashOptions(args: string[]): {
  options: Record<string, string>
  positionals: string[]
} {
  const options: Record<string, string> = {}
  const positionals: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }
    const withoutPrefix = arg.slice(2)
    const equals = withoutPrefix.indexOf('=')
    if (equals >= 0) {
      options[withoutPrefix.slice(0, equals)] = withoutPrefix.slice(equals + 1)
      continue
    }
    const next = args[index + 1]
    if (next === undefined || next.startsWith('--')) {
      options[withoutPrefix] = 'true'
      continue
    }
    options[withoutPrefix] = next
    index += 1
  }
  return { options, positionals }
}

function parseCommandLine(inputValue: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  let escaping = false

  for (const char of inputValue) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\') {
      escaping = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = undefined
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (escaping) current += '\\'
  if (quote) throw new Error('unterminated quoted string')
  if (current) args.push(current)
  return args
}

function targetPathFromSelectionTarget(value: string): string {
  const separator = value.indexOf(':')
  if (separator > 0 && value.slice(separator + 1).includes('/')) return value.slice(separator + 1)
  return value
}

function normalizeCliPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}

function inferTargetKind(value: string): 'asset' | 'keyframe' | 'content_unit' {
  const path = targetPathFromSelectionTarget(value)
  if (path.endsWith('/asset.json') || path.endsWith('asset.json')) return 'asset'
  if (path.endsWith('/keyframe.json') || path.endsWith('keyframe.json')) return 'keyframe'
  if (path.endsWith('/content_unit.json') || path.endsWith('content_unit.json')) return 'content_unit'
  const kind = value.split(':')[0]
  if (kind === 'asset' || kind === 'keyframe' || kind === 'content_unit') return kind
  throw new Error('target kind is required for selection')
}

function parseTargetKindOption(
  kind: string | undefined,
  target: string,
  options?: { defaultContentUnit?: boolean },
): 'asset' | 'keyframe' | 'content_unit' {
  if (kind === undefined) {
    try {
      return inferTargetKind(target)
    } catch (error) {
      if (options?.defaultContentUnit) return 'content_unit'
      throw error
    }
  }
  if (kind === 'asset' || kind === 'keyframe' || kind === 'content_unit') return kind
  if (options?.defaultContentUnit) return 'content_unit'
  throw new Error('target kind must be asset, keyframe, or content_unit')
}
