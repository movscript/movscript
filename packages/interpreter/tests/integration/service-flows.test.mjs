import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  createMovScriptWorkspaceService,
} from '../../../workspace/dist/index.js'
import {
  deriveMovScriptWorkspaceArtifacts,
} from '../../dist/index.js'
import {
  interpretMovScriptWorkspace,
  planMovScriptWorkspaceRegeneration,
  reviewMovScriptWorkspace,
} from '../../dist/node.js'
import {
  createNodeMovScriptWorkspaceFileRepository,
  createNodeMovScriptWorkspaceService,
  resolveMovScriptProjectWorkspacePaths,
} from '../../../workspace/dist/node.js'

import {
  memoryWorkspaceFileRepository,
  sourceFileEntries,
} from '../helpers.mjs'

test('workspace service facade exposes frontend-oriented domain operations', async () => {
  const files = new Map(sourceFileEntries())
  const service = createMovScriptWorkspaceService({
    fileRepository: memoryWorkspaceFileRepository(files),
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  const model = service.getModel({ entityKind: 'content_unit', entityId: 'k41m' })
  assert.equal(model.workspaceKind, 'content_unit_workspace')

  const productionContext = await service.queryProductionContext({
    productionId: 'p8f3',
    sceneMomentId: 'r72k',
  })
  assert.equal(productionContext.storyboards.length, 1)
  assert.equal(productionContext.content_units.length, 3)

  await service.updateContentUnitEditPrompt({
    targetPath: 'content_units/k41m/content_unit.json',
    editPrompt: {
      text: 'Service prompt {{shot:phone}} {{asset:wet_hair}}',
      negative_text: 'flat lighting',
    },
  })
  await service.updateEntityTransition({
    targetPath: 'productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json',
    transition: { out: 'hard_cut' },
  })
  await service.updateStoryboardTimeline({
    targetPath: 'productions/p8f3/segments/a19d/scene_moments/r72k/shots/phone/storyboards/main/storyboard.json',
    timeline: {
      gap_after_sec: 0.4,
      caption: 'Phone glow returns.',
    },
  })
  const firstArtifacts = deriveMovScriptWorkspaceArtifacts({
    index: await service.loadIndex(),
    changedEntities: [],
    interpretationId: 'service_interpret_1',
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  const assetRefPrompt = firstArtifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'cu_wet_hair_ref')?.generationPrompt
  assert.ok(assetRefPrompt)
  await service.createContentCandidate({
    contentUnitId: 'cu_wet_hair_ref',
    candidateId: 'candidate_asset_1',
    outputs: [{ kind: 'image', resource_id: 'resource_asset_1' }],
    promptSnapshot: assetRefPrompt,
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  await service.selectContentUnitCandidate({
    contentUnitId: 'cu_wet_hair_ref',
    candidateId: 'candidate_asset_1',
    resourceId: 'resource_asset_1',
    reason: 'selected_from_frontend',
    selectedAt: '2026-06-07T00:00:00.000Z',
  })
  const secondArtifacts = deriveMovScriptWorkspaceArtifacts({
    index: await service.loadIndex(),
    changedEntities: [],
    interpretationId: 'service_interpret_2',
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  const videoPanel = secondArtifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'k41m')?.runtimePanel
  assert.match(videoPanel?.prompt?.text ?? '', /Service prompt/)
  assert.equal(videoPanel?.prompt?.negative_text, 'flat lighting')
  assert.equal(videoPanel?.runtime_request?.inputs[0]?.resource_id, 'resource_asset_1')

  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index: await service.loadIndex(),
    changedEntities: [],
    interpretationId: 'service_interpret',
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  assert.equal(artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'k41m')?.runtimePanel.prompt?.negative_text, 'flat lighting')
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'scene_moment' && item.transition.out === 'hard_cut'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'storyboard' && item.caption === 'Phone glow returns.' && item.gapAfterSec === 0.4))
})

test('content unit integration flow writes, interprets, generates, impacts, and regenerates explicitly', async () => {
  const files = new Map(sourceFileEntries())
  const repository = memoryWorkspaceFileRepository(files)
  const service = createMovScriptWorkspaceService({
    fileRepository: repository,
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  const firstInterpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })
  assert.equal(firstInterpretation.status, 'interpreted')
  const firstAssetPanel = await service.readContentUnitRuntimePanel('cu_wet_hair_ref')
  const firstVideoPanel = await service.readContentUnitRuntimePanel('k41m')
  assert.equal(firstAssetPanel?.output_kind, 'image')
  assert.equal(firstVideoPanel?.status, 'blocked')

  await service.createContentCandidate({
    contentUnitId: 'cu_wet_hair_ref',
    candidateId: 'candidate_asset_1',
    outputs: [{ kind: 'image', resource_id: 'resource_asset_1' }],
    createdAt: '2026-06-07T00:01:00.000Z',
  })
  await service.selectContentUnitCandidate({
    contentUnitId: 'cu_wet_hair_ref',
    candidateId: 'candidate_asset_1',
    resourceId: 'resource_asset_1',
    reason: 'initial_asset_reference',
    selectedAt: '2026-06-07T00:01:00.000Z',
  })

  const secondInterpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:02:00.000Z'),
  })
  assert.equal(secondInterpretation.status, 'interpreted')
  const secondVideoPanel = await service.readContentUnitRuntimePanel('k41m')
  const secondVideoPrompt = JSON.parse(files.get('.interpret/current/content_units/k41m/generation_prompt.json'))
  assert.equal(secondVideoPanel?.status, 'ready')
  assert.equal(secondVideoPanel?.runtime_request?.inputs[0]?.resource_id, 'resource_asset_1')

  await service.createContentCandidate({
    contentUnitId: 'k41m',
    candidateId: 'candidate_video_1',
    outputs: [{ kind: 'video', resource_id: 'resource_video_1', duration_sec: 4 }],
    promptSnapshot: secondVideoPrompt,
    createdAt: '2026-06-07T00:03:00.000Z',
  })
  await service.selectContentUnitCandidate({
    contentUnitId: 'k41m',
    candidateId: 'candidate_video_1',
    resourceId: 'resource_video_1',
    reason: 'initial_video_selection',
    selectedAt: '2026-06-07T00:03:00.000Z',
  })

  const assetContentUnit = JSON.parse(files.get('content_units/cu_wet_hair_ref/content_unit.json'))
  assetContentUnit.edit_prompt = {
    ...assetContentUnit.edit_prompt,
    text: 'Updated wet hair reference prompt. {{asset:wet_hair}}',
  }
  files.set('content_units/cu_wet_hair_ref/content_unit.json', `${JSON.stringify(assetContentUnit, null, 2)}\n`)

  const impactInterpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:04:00.000Z'),
  })
  assert.equal(impactInterpretation.status, 'interpreted')
  const impactReport = JSON.parse(files.get(impactInterpretation.manifest.output.impactReportPath))
  const changedAssetContentUnit = impactReport.changedEntities.find((entity) => entity.entityKind === 'content_unit' && entity.id === 'cu_wet_hair_ref')
  const staleVideo = await service.readContentUnitSelectionValidity('k41m')
  const staleAsset = await service.readContentUnitSelectionValidity('cu_wet_hair_ref')
  assert.ok(changedAssetContentUnit?.affectedContentUnits.some((entity) => entity.id === 'cu_wet_hair_ref'))
  assert.equal(staleAsset?.selected, true)
  assert.equal(staleAsset?.stale, true)
  assert.equal(staleVideo?.selected, true)
  assert.equal(staleVideo?.stale, true)

  const regenerationPlan = await planMovScriptWorkspaceRegeneration({
    fileRepository: repository,
    now: new Date('2026-06-07T00:04:30.000Z'),
  })
  assert.equal(regenerationPlan.schema, 'movscript.workspace-regeneration-plan.v1')
  assert.equal(regenerationPlan.status, 'ready')
  assert.equal(regenerationPlan.interpret?.interpretationId, impactInterpretation.manifest.interpretationId)
  assert.equal(regenerationPlan.summary.staleContentUnits, 2)
  assert.equal(regenerationPlan.affectedContentUnits.length, 0)
  assert.equal(regenerationPlan.promptBundles.length, 0)
  assert.equal(regenerationPlan.previewTimelines.length, 0)

  await service.createContentCandidate({
    contentUnitId: 'cu_wet_hair_ref',
    candidateId: 'candidate_asset_2',
    outputs: [{ kind: 'image', resource_id: 'resource_asset_2' }],
    createdAt: '2026-06-07T00:04:45.000Z',
  })
  await service.selectContentUnitCandidate({
    contentUnitId: 'cu_wet_hair_ref',
    candidateId: 'candidate_asset_2',
    resourceId: 'resource_asset_2',
    reason: 'regenerated_asset_reference',
    selectedAt: '2026-06-07T00:04:50.000Z',
  })
  await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:04:55.000Z'),
  })
  const regeneratedVideoPanel = await service.readContentUnitRuntimePanel('k41m')
  const regeneratedVideoPrompt = JSON.parse(files.get('.interpret/current/content_units/k41m/generation_prompt.json'))
  assert.equal(regeneratedVideoPanel?.runtime_request?.inputs[0]?.resource_id, 'resource_asset_2')
  await service.createContentCandidate({
    contentUnitId: 'k41m',
    candidateId: 'candidate_video_2',
    outputs: [{ kind: 'video', resource_id: 'resource_video_2', duration_sec: 4 }],
    promptSnapshot: regeneratedVideoPrompt,
    createdAt: '2026-06-07T00:05:00.000Z',
  })
  await service.selectContentUnitCandidate({
    contentUnitId: 'k41m',
    candidateId: 'candidate_video_2',
    resourceId: 'resource_video_2',
    reason: 'regenerated_after_asset_reference_change',
    selectedAt: '2026-06-07T00:05:00.000Z',
  })

  const finalInterpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:06:00.000Z'),
  })
  assert.equal(finalInterpretation.status, 'interpreted')
  const finalValidity = await service.readContentUnitSelectionValidity('k41m')
  const finalPanel = await service.readContentUnitRuntimePanel('k41m')
  assert.equal(finalValidity?.candidate_id, 'candidate_video_2')
  assert.equal(finalValidity?.resource_id, 'resource_video_2')
  assert.equal(finalValidity?.stale, false)
  assert.equal(finalPanel?.runtime_request?.inputs[0]?.resource_id, 'resource_asset_2')
})

test('workspace service snapshots script markdown into explicit version and blocks', async () => {
  const files = new Map([
    ['scripts/main/script.json', JSON.stringify({
      schema: 'movscript.script.v1',
      kind: 'script',
      id: 'main',
      title: 'Main Script',
      source_ref: 'script.md',
    })],
    ['scripts/main/script.md', [
      'INT. APARTMENT - NIGHT',
      'Rain hits the window.',
      '',
      'MIA',
      'Who is calling me?',
      '',
      '(phone vibrates)',
    ].join('\n')],
  ])
  const service = createMovScriptWorkspaceService({
    fileRepository: memoryWorkspaceFileRepository(files),
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  const snapshot = await service.snapshotScriptVersionFromMarkdown({
    scriptId: 'main',
    versionId: 'v1',
    versionLabel: 'V1',
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(snapshot.versionPath, 'scripts/main/versions/v1/script_version.json')
  assert.equal(snapshot.blockCount, 3)
  const version = JSON.parse(files.get(snapshot.versionPath))
  const firstBlock = JSON.parse(files.get(snapshot.blockPaths[0]))
  const secondBlock = JSON.parse(files.get(snapshot.blockPaths[1]))
  assert.equal(version.kind, 'script_version')
  assert.equal(version.source_ref, 'script.md')
  assert.equal(version.block_count, 3)
  assert.equal(firstBlock.kind, 'script_block')
  assert.equal(firstBlock.block_kind, 'scene_heading')
  assert.equal(firstBlock.text, 'INT. APARTMENT - NIGHT\nRain hits the window.')
  assert.equal(secondBlock.block_kind, 'character')

  const index = await service.loadIndex()
  assert.equal(index.byKind.get('script_version')?.length, 1)
  assert.equal(index.byKind.get('script_block')?.length, 3)
})

test('node workspace service composes with interpreter review and interpret for adapters', async () => {
  const rootDir = join(tmpdir(), `movscript-node-workspace-service-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const paths = resolveMovScriptProjectWorkspacePaths({ workspaceDir: rootDir, userId: 1, projectId: 6 })
  try {
    for (const [path, content] of sourceFileEntries()) {
      const targetPath = join(paths.projectDir, path)
      await mkdir(targetPath.replace(/\/[^/]+$/, ''), { recursive: true })
      await writeFile(targetPath, content, 'utf8')
    }

    const service = createNodeMovScriptWorkspaceService({
      projectDir: paths.projectDir,
      now: () => new Date('2026-06-07T00:00:00.000Z'),
    })
    assert.equal(service.projectDir, paths.projectDir)
    const fileRepository = createNodeMovScriptWorkspaceFileRepository(paths.projectDir)

    const review = await reviewMovScriptWorkspace({
      fileRepository,
      now: new Date('2026-06-07T00:00:00.000Z'),
    })
    assert.equal(review.readyToInterpret, true)

    await service.updateContentUnitEditPrompt({
      targetPath: 'content_units/k41m/content_unit.json',
      editPrompt: { text: 'Node service prompt {{shot:phone}} {{asset:wet_hair}}' },
    })

    const interpretation = await interpretMovScriptWorkspace({
      fileRepository,
      now: new Date('2026-06-07T00:00:00.000Z'),
    })
    assert.equal(interpretation.status, 'interpreted')
    assert.equal(interpretation.manifest?.output.editorStatePath, '.interpret/current/editor-state.json')
    const editorState = await service.readEditorState()
    const previewTimeline = await service.readPreviewTimeline('p8f3')
    const runtimePanel = await service.readContentUnitRuntimePanel('k41m')
    const selectionValidity = await service.readContentUnitSelectionValidity('k41m')
    assert.equal(editorState?.schema, 'movscript.editor-state.v1')
    assert.equal(previewTimeline?.schema, 'movscript.preview_timeline.v1')
    assert.equal(runtimePanel?.schema, 'movscript.content_unit_runtime_panel.v1')
    assert.match(runtimePanel?.prompt?.text ?? '', /Node service prompt/)
    assert.equal(selectionValidity?.schema, 'movscript.content_unit_selection_validity.v2')
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('initialized project source uses project_id and can interpret immediately', async () => {
  const files = new Map()
  const repository = memoryWorkspaceFileRepository(files)
  const service = createMovScriptWorkspaceService({
    fileRepository: repository,
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  const initialized = await service.initializeProject({
    projectId: 'smoke',
    title: 'Smoke',
  })
  const project = JSON.parse(files.get('project.json'))

  assert.equal(initialized.projectId, 'smoke')
  assert.ok(initialized.files.some((file) => file.path === '.gitignore' && file.status === 'created'))
  assert.match(files.get('.gitignore') ?? '', /^\.interpret\/$/m)
  assert.equal(project.project_id, 'smoke')
  assert.equal(project.title, 'Smoke')
  assert.equal(project.project_name, undefined)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })
  assert.equal(review.readyToInterpret, true)

  const interpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })
  assert.equal(interpretation.status, 'interpreted')
  assert.equal(files.has('.interpret/current/project.json'), true)
  assert.equal(files.has('.interpret/current/project_standards.json'), true)
})

test('initialized project preserves existing gitignore and ensures derived artifacts are ignored', async () => {
  const files = new Map([
    ['.gitignore', 'node_modules/\n'],
  ])
  const repository = memoryWorkspaceFileRepository(files)
  const service = createMovScriptWorkspaceService({
    fileRepository: repository,
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  const firstInitialize = await service.initializeProject({
    projectId: 'smoke',
    title: 'Smoke',
  })
  const gitignore = files.get('.gitignore') ?? ''
  assert.ok(firstInitialize.files.some((file) => file.path === '.gitignore' && file.status === 'updated'))
  assert.match(gitignore, /^node_modules\/$/m)
  assert.match(gitignore, /^\.interpret\/$/m)

  const secondInitialize = await service.initializeProject({
    projectId: 'smoke',
    title: 'Smoke',
  })
  const secondGitignore = files.get('.gitignore') ?? ''
  assert.ok(secondInitialize.files.some((file) => file.path === '.gitignore' && file.status === 'skipped'))
  assert.equal((secondGitignore.match(/^\.interpret\/$/gm) ?? []).length, 1)
})
