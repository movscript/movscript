import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  appendMovScriptInlineCandidate,
  buildMovScriptWorkspaceBuildArtifacts,
  buildMovScriptWorkspaceDomainIndex,
  compileContentGenerationPromptBundle,
  createMovScriptWorkspaceService,
  createMovScriptWorkspaceDomainRepository,
  getMovScriptWorkspaceModel,
  getSemanticEntitySchemaEntry,
  lockMovScriptInlineCandidate,
  prepareContentProductionContext,
  queryMovScriptCanonicalEntities,
  queryMovScriptWorkspaceAssets,
  queryMovScriptWorkspaceProductionContext,
  queryMovScriptWorkspaceSettings,
  selectMovScriptInlineCandidate,
  unlockMovScriptInlineCandidate,
  updateMovScriptContentUnitEditablePrompt,
} from '../dist/workspace/index.js'
import {
  buildMovScriptWorkspace,
  createNodeMovScriptWorkspaceService,
  resolveMovScriptProjectWorkspacePaths,
  reviewMovScriptBuildWorkspace,
} from '../dist/workspace/node/index.js'

test('workspace domain indexes hierarchical source entities', () => {
  const index = buildMovScriptWorkspaceDomainIndex(sourceDocuments())

  assert.equal(queryMovScriptWorkspaceSettings(index, { kind: 'character' }).length, 1)
  assert.equal(index.byKind.get('asset')?.length, 1)
  assert.equal(index.byKind.get('storyboard')?.length, 1)
  assert.equal(index.byKind.get('content_unit')?.length, 1)
  assert.equal(index.byKind.get('writing_expression')?.length, 1)
  assert.equal(index.byKind.get('script')?.[0]?.path, 'scripts/script_main/script.json')
  assert.equal(index.documents.some((document) => document.path === 'scripts/script_main/script.md'), true)
  assert.equal(queryMovScriptCanonicalEntities(index).some((entity) => entity.path === 'scripts/script_main/script.md'), false)

  const assets = queryMovScriptWorkspaceAssets(index, {
    settingId: 'setting_hero',
    settingStateId: 'setting_state_rain',
    includeCandidates: true,
  })
  assert.equal(assets.assets.length, 1)
  assert.equal(assets.candidates?.length, 1)

  const context = queryMovScriptWorkspaceProductionContext(index, {
    productionId: 'production_p8f3',
    segmentId: 'segment_a19d',
    sceneMomentId: 'scene_moment_r72k',
  })
  assert.equal(context.productions.length, 1)
  assert.equal(context.segments.length, 1)
  assert.equal(context.scene_moments.length, 1)
  assert.equal(context.storyboards.length, 1)
  assert.equal(context.writing_expressions.length, 1)
  assert.equal(context.content_units.length, 1)
})

test('workspace build artifacts are derived from canonical source only', () => {
  const index = buildMovScriptWorkspaceDomainIndex(sourceDocuments())
  const artifacts = buildMovScriptWorkspaceBuildArtifacts({
    index,
    changedEntities: [{
      entityKind: 'content_unit',
      id: 'content_unit_k41m',
      path: 'content_units/content_unit_k41m/content_unit.json',
      state: 'modified',
    }],
    buildId: 'build_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })

  assert.equal(artifacts.domainTree.schema, 'movscript.domain-tree.v1')
  assert.equal(artifacts.assetIndex.schema, 'movscript.asset-index.v1')
  assert.equal(artifacts.relationGraph.schema, 'movscript.relation-graph.v1')
  assert.ok(artifacts.assetIndex.assets.some((asset) => asset.id === 'asset_wet_hair' && asset.owner.id === 'setting_state_rain'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'references' && relation.from.id === 'content_unit_k41m' && relation.to.id === 'scene_moment_r72k'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'references' && relation.from.id === 'content_unit_k41m' && relation.to.id === 'storyboard_main'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses' && relation.from.id === 'keyframe_c83x' && relation.to.id === 'asset_wet_hair'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'scene_moment' && item.audio.note === 'Rain low, phone vibration sharp.' && item.transition.out === 'hold_then_cut'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'storyboard' && item.entity.id === 'storyboard_main' && item.contentUnitIds.includes('content_unit_k41m')))
  assert.ok(artifacts.impactReport.changedEntities[0].editorImpacts.some((impact) => impact.includes('Content production context')))
})

test('workspace impact report traces planning and asset changes to affected content units', () => {
  const index = buildMovScriptWorkspaceDomainIndex(sourceDocuments())
  const artifacts = buildMovScriptWorkspaceBuildArtifacts({
    index,
    changedEntities: [
      {
        entityKind: 'storyboard',
        id: 'storyboard_main',
        path: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main/storyboard.json',
        state: 'modified',
      },
      {
        entityKind: 'asset',
        id: 'asset_wet_hair',
        path: 'settings/setting_hero/states/setting_state_rain/assets/asset_wet_hair/asset.json',
        state: 'modified',
      },
      {
        entityKind: 'keyframe',
        id: 'keyframe_c83x',
        path: 'content_units/content_unit_k41m/keyframes/keyframe_c83x/keyframe.json',
        state: 'modified',
      },
    ],
    buildId: 'build_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })

  const storyboardChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'storyboard')
  const assetChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'asset')
  const keyframeChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'keyframe')

  assert.ok(storyboardChange?.affectedContentUnits.some((entity) => entity.id === 'content_unit_k41m'))
  assert.ok(storyboardChange?.staleMarkers.includes('content_unit:content_unit_k41m:planning_context_changed'))
  assert.ok(assetChange?.affectedContentUnits.some((entity) => entity.id === 'content_unit_k41m'))
  assert.ok(assetChange?.staleMarkers.includes('content_unit:content_unit_k41m:setting_context_changed'))
  assert.ok(keyframeChange?.affectedContentUnits.some((entity) => entity.id === 'content_unit_k41m'))
  assert.ok(keyframeChange?.staleMarkers.includes('content_unit:content_unit_k41m:visual_anchor_changed'))
})

test('content production context compiles prompt bundle from editable prompt plus planning refs', () => {
  const index = buildMovScriptWorkspaceDomainIndex(sourceDocuments())

  const context = prepareContentProductionContext(index, 'content_unit_k41m')
  const bundle = compileContentGenerationPromptBundle(context)

  assert.equal(bundle.prompt, 'Cold phone light on frightened face.')
  assert.equal(bundle.negativePrompt, 'cartoon')
  assert.equal(bundle.context.sceneMoment?.id, 'scene_moment_r72k')
  assert.equal(bundle.context.storyboard?.id, 'storyboard_main')
  assert.equal(bundle.context.shotPlans.length, 1)
  assert.equal(bundle.context.writingExpressions.length, 1)
  assert.equal(bundle.context.projectStandards?.id, 'project_standards_main')
  assert.equal(bundle.context.sceneKeyframes.length, 1)
  assert.equal(bundle.context.sceneKeyframes[0].id, 'keyframe_scene_anchor')
  assert.equal(bundle.context.contentUnitKeyframes.length, 1)
  assert.equal(bundle.context.contentUnitKeyframes[0].id, 'keyframe_c83x')
  assert.equal(bundle.references.assets[0].resourceId, 'resource_1')
  assert.equal(bundle.references.assets[0].locked, true)
  assert.equal(bundle.references.sceneKeyframes[0].resourceId, 'resource_scene_anchor')
  assert.equal(bundle.references.contentUnitKeyframes[0].resourceId, 'resource_keyframe_1')
  assert.equal(bundle.references.contentUnitResult?.resourceId, 'resource_video_1')
})

test('workspace inline candidate writer updates asset json candidates and lock', async () => {
  const files = new Map([
    ['settings/setting_hero/assets/asset_portrait/asset.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'asset_portrait',
      slot: 'character_base_portrait',
      candidates: [],
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const result = await appendMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'settings/setting_hero/assets/asset_portrait/asset.json',
    targetKind: 'asset',
    nonce: 'fixed',
    lock: { reason: 'confirmed_by_user' },
    payload: {
      resource_id: 'resource_99',
      source: 'uploaded',
      status: 'accepted',
      notes: 'Uploaded portrait',
    },
  })

  assert.equal(result.path, 'settings/setting_hero/assets/asset_portrait/asset.json')
  assert.equal(result.candidate.id, 'candidate_resource_99_fixed')
  assert.equal(result.record.candidates.length, 1)
  assert.deepEqual(result.record.lock, {
    candidate_id: 'candidate_resource_99_fixed',
    resource_id: 'resource_99',
    reason: 'confirmed_by_user',
  })
  const saved = JSON.parse(files.get(result.path))
  assert.equal(saved.candidates[0].resource_id, 'resource_99')
  assert.equal(saved.lock.candidate_id, 'candidate_resource_99_fixed')
})

test('workspace inline candidate writer locks existing keyframe candidate', async () => {
  const files = new Map([
    ['content_units/content_unit_k41m/keyframes/keyframe_c83x/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'keyframe_c83x',
      candidates: [],
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  await appendMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'content_units/content_unit_k41m/keyframes/keyframe_c83x/keyframe.json',
    targetKind: 'keyframe',
    nonce: 'fixed',
    payload: {
      resource_id: 'resource_keyframe_1',
      source: 'generated',
      status: 'draft',
    },
  })
  const locked = await lockMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'content_units/content_unit_k41m/keyframes/keyframe_c83x/keyframe.json',
    targetKind: 'keyframe',
    candidateId: 'candidate_resource_keyframe_1_fixed',
    reason: 'selected_for_generation_reference',
  })

  assert.deepEqual(locked.record.lock, {
    candidate_id: 'candidate_resource_keyframe_1_fixed',
    resource_id: 'resource_keyframe_1',
    reason: 'selected_for_generation_reference',
  })
  const saved = JSON.parse(files.get(locked.path))
  assert.equal(saved.candidates.length, 1)
  assert.equal(saved.lock.resource_id, 'resource_keyframe_1')
})

test('workspace inline candidate writer selects and unlocks content unit candidates', async () => {
  const files = new Map([
    ['content_units/content_unit_k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'content_unit_k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k',
        storyboard_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main',
      },
      candidates: [
        { id: 'candidate_video_1', resource_id: 'resource_video_1' },
        { id: 'candidate_video_2', resource_id: 'resource_video_2' },
      ],
      lock: { candidate_id: 'candidate_video_1', resource_id: 'resource_video_1' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const selected = await selectMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'content_units/content_unit_k41m/content_unit.json',
    targetKind: 'content_unit',
    candidateId: 'candidate_video_2',
    reason: 'approved_by_director',
  })

  assert.deepEqual(selected.record.lock, {
    candidate_id: 'candidate_video_2',
    resource_id: 'resource_video_2',
    reason: 'approved_by_director',
  })

  const unlocked = await unlockMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'content_units/content_unit_k41m/content_unit.json',
    targetKind: 'content_unit',
  })
  const saved = JSON.parse(files.get(unlocked.path))
  assert.equal(saved.lock, undefined)
  assert.equal(saved.candidates.length, 2)
})

test('workspace content unit prompt updater only changes editable prompt', async () => {
  const files = new Map([
    ['content_units/content_unit_k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'content_unit_k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k',
        storyboard_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main',
      },
      editable_prompt: {
        prompt: 'Old prompt',
      },
      candidates: [{ id: 'candidate_video_1', resource_id: 'resource_video_1' }],
      lock: { candidate_id: 'candidate_video_1', resource_id: 'resource_video_1' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const result = await updateMovScriptContentUnitEditablePrompt({
    fileRepository: repository,
    targetPath: 'content_units/content_unit_k41m/content_unit.json',
    editablePrompt: {
      prompt: 'New prompt',
      negative_prompt: 'distorted hands',
      notes: 'Keep camera movement restrained.',
    },
  })

  assert.deepEqual(result.record.editable_prompt, {
    prompt: 'New prompt',
    negative_prompt: 'distorted hands',
    notes: 'Keep camera movement restrained.',
  })
  assert.deepEqual(result.record.source_context, {
    scene_moment_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k',
    storyboard_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main',
  })
  assert.equal(result.record.candidates.length, 1)
  assert.deepEqual(result.record.lock, { candidate_id: 'candidate_video_1', resource_id: 'resource_video_1' })
  const saved = JSON.parse(files.get(result.path))
  assert.equal(saved.editable_prompt.prompt, 'New prompt')
})

test('workspace service facade exposes frontend-oriented domain operations', async () => {
  const files = new Map(sourceFileEntries())
  const service = createMovScriptWorkspaceService({
    fileRepository: memoryWorkspaceFileRepository(files),
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  const model = service.getModel({ entityKind: 'content_unit', entityId: 'content_unit_k41m' })
  assert.equal(model.workspaceKind, 'content_unit_workspace')

  const productionContext = await service.queryProductionContext({
    productionId: 'production_p8f3',
    sceneMomentId: 'scene_moment_r72k',
  })
  assert.equal(productionContext.storyboards.length, 1)
  assert.equal(productionContext.content_units.length, 1)

  await service.updateContentUnitEditablePrompt({
    targetPath: 'content_units/content_unit_k41m/content_unit.json',
    editablePrompt: {
      prompt: 'Service prompt',
      negative_prompt: 'flat lighting',
    },
  })
  await service.updateSceneMomentStoryboardTiming({
    targetPath: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/scene_moment.json',
    activeStoryboardId: 'storyboard_main',
    items: [{
      storyboard_id: 'storyboard_main',
      order: 1,
      gap_after_sec: 0.4,
      caption: 'Phone glow returns.',
    }],
    audio: { note: 'Rain fades under phone vibration.' },
    transition: { out: 'hard_cut' },
  })
  await service.updateStoryboardShotPlans({
    targetPath: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main/storyboard.json',
    shotPlans: [{
      id: 'shot_plan_1',
      order: 1,
      shot_size: 'close_up',
      camera: { movement: 'slow_push_in', lens_mm: 50 },
      blocking: { subject: 'hero at window edge' },
      lighting: { key: 'phone screen blue light' },
      performance: [{ setting_id: 'setting_hero', expression: 'controlled panic' }],
      reference_image_refs: ['asset_wet_hair'],
    }],
  })
  await service.selectCandidate({
    targetPath: 'content_units/content_unit_k41m/content_unit.json',
    targetKind: 'content_unit',
    candidateId: 'candidate_video_1',
    reason: 'selected_from_frontend',
  })
  const prompt = await service.compileContentGenerationPrompt('content_unit_k41m')
  assert.equal(prompt.prompt, 'Service prompt')
  assert.equal(prompt.negativePrompt, 'flat lighting')
  assert.equal(prompt.context.shotPlans[0].camera.lens_mm, 50)
  assert.equal(prompt.context.shotPlans[0].lighting.key, 'phone screen blue light')
  assert.equal(prompt.references.contentUnitResult?.resourceId, 'resource_video_1')

  await service.unlockCandidate({
    targetPath: 'content_units/content_unit_k41m/content_unit.json',
    targetKind: 'content_unit',
  })
  const unlockedPrompt = await service.compileContentGenerationPrompt('content_unit_k41m')
  assert.equal(unlockedPrompt.references.contentUnitResult?.locked, false)

  const artifacts = await service.buildArtifacts({ buildId: 'service_build' })
  assert.equal(artifacts.contentGenerationPrompts[0].prompt, 'Service prompt')
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'scene_moment' && item.audio.note === 'Rain fades under phone vibration.' && item.transition.out === 'hard_cut'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'storyboard' && item.caption === 'Phone glow returns.' && item.gapAfterSec === 0.4))
})

test('workspace service snapshots script markdown into explicit version and blocks', async () => {
  const files = new Map([
    ['scripts/script_main/script.json', JSON.stringify({
      schema: 'movscript.script.v1',
      kind: 'script',
      id: 'script_main',
      title: 'Main Script',
      source_ref: 'script.md',
    })],
    ['scripts/script_main/script.md', [
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
    scriptId: 'script_main',
    versionId: 'script_version_v1',
    versionLabel: 'V1',
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(snapshot.versionPath, 'scripts/script_main/versions/script_version_v1/script_version.json')
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

test('node workspace service exposes review and build for adapters', async () => {
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

    const review = await service.reviewWorkspace()
    assert.equal(review.readyToBuild, true)

    await service.updateContentUnitEditablePrompt({
      targetPath: 'content_units/content_unit_k41m/content_unit.json',
      editablePrompt: { prompt: 'Node service prompt' },
    })
    const prompt = await service.compileContentGenerationPrompt('content_unit_k41m')
    assert.equal(prompt.prompt, 'Node service prompt')

    const build = await service.buildWorkspace()
    assert.equal(build.status, 'built')
    assert.equal(build.manifest?.output.editorStatePath, '.build/current/editor-state.json')
    const editorState = await service.readEditorState()
    const previewTimeline = await service.readPreviewTimeline('production_p8f3')
    const generationPrompt = await service.readContentGenerationPrompt('content_unit_k41m')
    assert.equal(editorState?.schema, 'movscript.editor-state.v1')
    assert.equal(previewTimeline?.schema, 'movscript.preview_timeline.v1')
    assert.equal(generationPrompt?.schema, 'movscript.compiled_generation_prompt.v1')
    assert.equal(generationPrompt?.prompt, 'Node service prompt')
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('workspace domain repository loads source files through a repository boundary', async () => {
  const files = new Map([
    ['project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', id: 'project_demo', title: 'Demo' })],
    ['workspace.json', JSON.stringify({ schema: 'movscript.workspace.v1', id: 'workspace_demo' })],
    ['settings/setting_1/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'setting_1', title: 'Mia', setting_kind: 'character' })],
    ['settings/setting_1/setting.meta.json', JSON.stringify({ state: { dirty: false } })],
    ['scripts/script_main/script.json', JSON.stringify({ schema: 'movscript.script.v1', kind: 'script', id: 'script_main', title: 'Main Script', source_ref: 'script.md' })],
    ['scripts/script_main/script.md', '# Script\n'],
    ['.build/current/settings/setting_built/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'setting_built', title: 'Built' })],
    ['references/setting_2.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'setting_2', title: 'Old loose reference' })],
  ])
  const repository = createMovScriptWorkspaceDomainRepository({
    fileRepository: memoryWorkspaceFileRepository(files),
  })

  const index = await repository.loadIndex()

  assert.equal(queryMovScriptWorkspaceSettings(index, { query: 'mia' }).length, 1)
  assert.equal(index.byKind.get('script')?.[0]?.record.source_ref, 'script.md')
  assert.equal(index.documents.some((document) => document.path === 'scripts/script_main/script.md'), true)
  assert.equal(index.entities.some((entity) => entity.path === 'scripts/script_main/script.md'), false)
  assert.equal(index.entities.some((entity) => entity.path.endsWith('.meta.json')), false)
  assert.equal(index.entities.some((entity) => entity.path.startsWith('.build/')), false)
  assert.equal(index.entities.some((entity) => entity.path.startsWith('references/')), false)
  assert.equal(index.entities.some((entity) => entity.path === 'workspace.json'), false)
})

test('workspace domain model resolves entity editing model with semantic schemas only', () => {
  const model = getMovScriptWorkspaceModel({ entityKind: 'project_standards' })
  const schemaId = model.schemaIds[0]
  const schema = getSemanticEntitySchemaEntry(schemaId)

  assert.equal(model.workspaceKind, 'project_standards_workspace')
  assert.equal(schemaId, 'movscript.project_standards.v1')
  assert.equal(schema?.entityKind, 'project_standards')
  assert.deepEqual(model.schemaIds, ['movscript.project_standards.v1'])
})

test('scene moment source schema keeps audio and transition at storyboard timing level', () => {
  const schema = getSemanticEntitySchemaEntry('movscript.scene_moment.v1')
  const timing = schema?.jsonSchema.properties.storyboard_timing

  assert.equal(schema?.entityKind, 'scene_moment')
  assert.ok(timing.properties.audio)
  assert.ok(timing.properties.transition)
  assert.equal(timing.properties.items.items.properties.audio, undefined)
  assert.equal(timing.properties.items.items.properties.transition, undefined)
})

test('project workspace paths use source root and build at repository root', () => {
  const paths = resolveMovScriptProjectWorkspacePaths({
    workspaceDir: '/tmp/movscript-demo',
    userId: 1,
    projectId: 6,
  })

  assert.equal(paths.projectDir, '/tmp/movscript-demo/.movscript/user/1/projects/project_6')
  assert.equal(paths.projectFile, '/tmp/movscript-demo/.movscript/user/1/projects/project_6/project.json')
  assert.equal(paths.sourceDir, '/tmp/movscript-demo/.movscript/user/1/projects/project_6')
  assert.equal(paths.buildDir, '/tmp/movscript-demo/.movscript/user/1/projects/project_6/.build')
  assert.equal(paths.projectStandardsFile, '/tmp/movscript-demo/.movscript/user/1/projects/project_6/project_standards.json')
  assert.equal(paths.settingDir, '/tmp/movscript-demo/.movscript/user/1/projects/project_6/settings')
  assert.equal(paths.contentUnitsDir, '/tmp/movscript-demo/.movscript/user/1/projects/project_6/content_units')
})

test('project workspace paths distinguish local personal and organization owners', () => {
  assert.equal(
    resolveMovScriptProjectWorkspacePaths({
      workspaceDir: '/tmp/movscript-demo',
      projectId: 6,
    }).projectDir,
    '/tmp/movscript-demo/.movscript/local/projects/project_6',
  )
  assert.equal(
    resolveMovScriptProjectWorkspacePaths({
      workspaceDir: '/tmp/movscript-demo',
      userId: 7,
      projectId: 6,
    }).projectDir,
    '/tmp/movscript-demo/.movscript/user/7/projects/project_6',
  )
  assert.equal(
    resolveMovScriptProjectWorkspacePaths({
      workspaceDir: '/tmp/movscript-demo',
      userId: 7,
      orgId: 9,
      projectId: 6,
    }).projectDir,
    '/tmp/movscript-demo/.movscript/org/9/projects/project_6',
  )
})

test('workspace build reads hierarchical source root and writes derived artifacts', async () => {
  const files = new Map(sourceFileEntries())
  files.set('.build/current/settings/setting_hero/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'setting_hero', setting_kind: 'character', title: 'Old Hero' }))
  files.set('.build/current/productions/production_p8f3/preview_timeline.json', JSON.stringify({ schema: 'movscript.preview_timeline.v1', items: [] }))
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.sourcePath, '')
  assert.equal(review.sourceMode, 'source')
  assert.equal(review.readyToBuild, true)
  assert.equal(review.changedFiles.some((file) => file.buildPath === '.build/current/productions/production_p8f3/preview_timeline.json'), false)

  const result = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'built')
  assert.equal(result.manifest?.source.sourceMode, 'source')
  assert.equal(files.has('.build/current/settings/setting_hero/setting.json'), true)
  assert.equal(files.has('.build/current/content_units/content_unit_k41m/content_unit.json'), true)
  assert.equal(files.has('.build/indexes/domain-index.json'), true)
  assert.equal(files.has('.build/indexes/asset-index.json'), true)
  assert.equal(files.has('.build/indexes/relation-graph.json'), true)
  assert.equal(files.has('.build/current/domain-tree.json'), true)
  assert.equal(files.has('.build/current/editor-state.json'), true)
  assert.equal(files.has('.build/current/content_units/content_unit_k41m/generation_prompt.json'), true)

  const domainIndex = JSON.parse(files.get('.build/indexes/domain-index.json'))
  const previewTimeline = JSON.parse(files.get('.build/current/productions/production_p8f3/preview_timeline.json'))
  const generationPrompt = JSON.parse(files.get('.build/current/content_units/content_unit_k41m/generation_prompt.json'))
  const editorState = JSON.parse(files.get('.build/current/editor-state.json'))
  const impactReport = JSON.parse(files.get(result.manifest.output.impactReportPath))
  assert.ok(domainIndex.entities.some((entity) => entity.entityKind === 'asset'))
  assert.ok(domainIndex.entities.some((entity) => entity.entityKind === 'storyboard'))
  assert.ok(domainIndex.entities.some((entity) => entity.entityKind === 'content_unit'))
  assert.equal(previewTimeline.schema, 'movscript.preview_timeline.v1')
  assert.equal(generationPrompt.schema, 'movscript.compiled_generation_prompt.v1')
  assert.equal(generationPrompt.prompt, 'Cold phone light on frightened face.')
  assert.equal(generationPrompt.context.storyboard.id, 'storyboard_main')
  assert.equal(generationPrompt.context.shotPlans.length, 1)
  assert.equal(generationPrompt.context.assets[0].id, 'asset_wet_hair')
  assert.equal(generationPrompt.context.contentUnitKeyframes[0].id, 'keyframe_c83x')
  assert.equal(generationPrompt.references.assets[0].resourceId, 'resource_1')
  assert.equal(generationPrompt.references.sceneKeyframes[0].resourceId, 'resource_scene_anchor')
  assert.equal(generationPrompt.references.contentUnitKeyframes[0].resourceId, 'resource_keyframe_1')
  assert.equal(generationPrompt.references.contentUnitResult.resourceId, 'resource_video_1')
  assert.equal(editorState.contentGenerationPrompts[0].contentUnitId, 'content_unit_k41m')
  assert.ok(impactReport.changedEntities.some((entity) => entity.entityKind === 'content_unit' && entity.editorImpacts.some((impact) => impact.includes('Content production context'))))
})

test('workspace review treats script markdown as document source, not semantic entity', async () => {
  const files = new Map([
    ['scripts/script_main/script.json', JSON.stringify({
      schema: 'movscript.script.v1',
      kind: 'script',
      id: 'script_main',
      title: 'Main Script',
      source_ref: 'script.md',
    })],
    ['scripts/script_main/script.md', 'new script text\n'],
    ['.build/current/scripts/script_main/script.json', JSON.stringify({
      schema: 'movscript.script.v1',
      kind: 'script',
      id: 'script_main',
      title: 'Main Script',
      source_ref: 'script.md',
    })],
    ['.build/current/scripts/script_main/script.md', 'old script text\n'],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, true)
  assert.ok(review.changedFiles.some((file) => file.path === 'scripts/script_main/script.md' && file.state === 'modified'))
  assert.equal(review.changedEntities.some((entity) => entity.path === 'scripts/script_main/script.md'), false)
  assert.equal(review.changedEntities.some((entity) => entity.entityKind === 'script'), false)
})

test('workspace build removes deleted source files from current build', async () => {
  const files = new Map([
    ['project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', id: 'project_demo', title: 'Demo' })],
    ['.build/current/project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', id: 'project_demo', title: 'Demo' })],
    ['.build/current/settings/setting_removed/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'setting_removed', title: 'Removed' })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.summary.deleted, 1)
  assert.ok(review.changedFiles.some((file) => file.state === 'deleted' && file.buildPath === '.build/current/settings/setting_removed/setting.json'))

  const result = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'built')
  assert.equal(files.has('.build/current/settings/setting_removed/setting.json'), false)
})

test('workspace build removes stale preview timelines for deleted productions', async () => {
  const files = new Map(sourceFileEntries())
  files.set('.build/current/productions/production_old/preview_timeline.json', JSON.stringify({
    schema: 'movscript.preview_timeline.v1',
    productionId: 'production_old',
    items: [],
  }))
  const repository = memoryWorkspaceFileRepository(files)

  const result = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'built')
  assert.equal(files.has('.build/current/productions/production_old/preview_timeline.json'), false)
  assert.equal(files.has('.build/current/productions/production_p8f3/preview_timeline.json'), true)
})

test('workspace build removes stale compiled prompts for deleted content units', async () => {
  const files = new Map(sourceFileEntries())
  files.set('.build/current/content_units/content_unit_old/generation_prompt.json', JSON.stringify({
    schema: 'movscript.compiled_generation_prompt.v1',
    contentUnitId: 'content_unit_old',
    prompt: 'old',
    context: {},
  }))
  const repository = memoryWorkspaceFileRepository(files)

  const result = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'built')
  assert.equal(files.has('.build/current/content_units/content_unit_old/generation_prompt.json'), false)
  assert.equal(files.has('.build/current/content_units/content_unit_k41m/generation_prompt.json'), true)
})

test('workspace source review rejects path schema mismatch and unresolved content unit references', async () => {
  const files = new Map([
    ['settings/setting_hero/setting.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'setting_hero',
      slot: 'wrong_place',
    })],
    ['content_units/content_unit_k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'content_unit_k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'productions/production_missing/segments/segment_missing/scene_moments/scene_moment_missing',
        storyboard_ref: 'productions/production_missing/segments/segment_missing/scene_moments/scene_moment_missing/storyboards/storyboard_missing',
        shot_plan_id: 'shot_plan_1',
      },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.sourceMode, 'source')
  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('schema kind asset does not match source path entity setting')))
  assert.ok(review.issues.some((issue) => issue.message.includes('scene_moment_ref does not resolve')))
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_ref does not resolve')))
  assert.ok(review.issues.some((issue) => issue.message.includes('do not reference shot_plan_id')))
  assert.ok(review.issues.some((issue) => issue.message.includes('$.source_context.shot_plan_id is not allowed')))
})

test('workspace source review rejects content unit storyboard outside referenced scene moment', async () => {
  const files = new Map([
    ['productions/production_p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'production_p8f3', title: 'Episode 1' })],
    ['productions/production_p8f3/segments/segment_a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'segment_a19d', title: 'Opening', order: 1 })],
    ['productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_a/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'scene_moment_a',
      title: 'A',
      order: 1,
    })],
    ['productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_b/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'scene_moment_b',
      title: 'B',
      order: 2,
    })],
    ['productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_b/storyboards/storyboard_b/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'storyboard_b',
    })],
    ['content_units/content_unit_k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'content_unit_k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_a',
        storyboard_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_b/storyboards/storyboard_b',
      },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_ref is not under source_context.scene_moment_ref')))
})

test('workspace source review rejects unresolved storyboard setting refs', async () => {
  const files = new Map([
    ['settings/setting_hero/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'setting_hero', title: 'Hero', setting_kind: 'character' })],
    ['settings/setting_other/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'setting_other', title: 'Other', setting_kind: 'character' })],
    ['settings/setting_other/states/setting_state_other/setting_state.json', JSON.stringify({ schema: 'movscript.setting_state.v1', kind: 'setting_state', id: 'setting_state_other', title: 'Other state' })],
    ['productions/production_p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'production_p8f3', title: 'Episode 1' })],
    ['productions/production_p8f3/segments/segment_a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'segment_a19d', title: 'Opening', order: 1 })],
    ['productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'scene_moment_r72k',
      title: 'Phone call',
      order: 1,
    })],
    ['productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'storyboard_main',
      setting_refs: [
        { setting_id: 'setting_missing' },
        { setting_id: 'setting_hero', setting_state_id: 'setting_state_missing' },
        { setting_id: 'setting_hero', setting_state_id: 'setting_state_other' },
      ],
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('setting_refs[0].setting_id does not resolve')))
  assert.ok(review.issues.some((issue) => issue.message.includes('setting_refs[1].setting_state_id does not resolve')))
  assert.ok(review.issues.some((issue) => issue.message.includes('setting_refs[2].setting_state_id does not belong to setting_id')))
})

test('workspace source review rejects wrong hierarchy and id directory mismatch', async () => {
  const files = new Map([
    ['productions/production_p8f3/scene_moments/scene_moment_orphan/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'scene_moment_orphan',
      title: 'Wrong level',
      order: 1,
    })],
    ['settings/setting_hero/assets/asset_portrait/asset.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'asset_wrong_id',
      slot: 'character_base_portrait',
    })],
    ['content_units/content_unit_k41m/keyframes/keyframe_c83x/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'keyframe_other',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.sourceMode, 'source')
  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.path.includes('scene_moment_orphan') && issue.message.includes('required workspace hierarchy')))
  assert.ok(review.issues.some((issue) => issue.path.includes('asset_portrait') && issue.message.includes('source directory id asset_portrait')))
  assert.ok(review.issues.some((issue) => issue.path.includes('keyframe_c83x') && issue.message.includes('source directory id keyframe_c83x')))
})

test('workspace source review validates semantic entity schemas', async () => {
  const files = new Map([
    ['settings/setting_hero/setting.json', JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: '',
      setting_kind: 'not_a_kind',
    })],
    ['productions/production_p8f3/production.json', JSON.stringify({
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'production_p8f3',
      title: 'Episode',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('$.title is required')))
  assert.ok(review.issues.some((issue) => issue.message.includes('$.id must contain at least 1 character')))
  assert.ok(review.issues.some((issue) => issue.message.includes('$.setting_kind must be one of')))
})

test('workspace source review validates min length in source references', async () => {
  const files = new Map([
    ['content_units/content_unit_k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'content_unit_k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: '',
        storyboard_ref: '',
      },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('$.source_context.scene_moment_ref must contain at least 1 character')))
  assert.ok(review.issues.some((issue) => issue.message.includes('$.source_context.storyboard_ref must contain at least 1 character')))
})

test('workspace source review rejects unresolved scene moment storyboard timing', async () => {
  const files = new Map([
    ['productions/production_p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'production_p8f3', title: 'Episode 1' })],
    ['productions/production_p8f3/segments/segment_a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'segment_a19d', title: 'Opening', order: 1 })],
    ['productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'scene_moment_r72k',
      title: 'Phone call',
      order: 1,
      storyboard_timing: {
        items: [{ storyboard_id: 'storyboard_missing', order: 1 }],
      },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_timing.items[0].storyboard_id does not resolve')))
})

test('workspace source review rejects unresolved keyframe reference assets', async () => {
  const files = new Map([
    ['productions/production_p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'production_p8f3', title: 'Episode 1' })],
    ['productions/production_p8f3/segments/segment_a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'segment_a19d', title: 'Opening', order: 1 })],
    ['productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'scene_moment_r72k',
      title: 'Phone call',
      order: 1,
    })],
    ['productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'storyboard_main',
    })],
    ['content_units/content_unit_k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'content_unit_k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k',
        storyboard_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main',
      },
    })],
    ['content_units/content_unit_k41m/keyframes/keyframe_c83x/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'keyframe_c83x',
      reference_asset_refs: ['asset_missing'],
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('keyframe reference_asset_refs[0] does not resolve: asset_missing')))
})

test('workspace source review rejects inconsistent inline candidate locks', async () => {
  const files = new Map([
    ['settings/setting_hero/setting.json', JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'setting_hero',
      title: 'Hero',
      setting_kind: 'character',
    })],
    ['settings/setting_hero/assets/asset_portrait/asset.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'asset_portrait',
      slot: 'character_base_portrait',
      candidates: [{ id: 'candidate_a', resource_id: 'resource_a' }],
      lock: { candidate_id: 'candidate_missing', resource_id: 'resource_a' },
    })],
    ['content_units/content_unit_k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'content_unit_k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'scene_moment_missing',
        storyboard_ref: 'storyboard_missing',
      },
      candidates: [
        { id: 'candidate_result', resource_id: 'resource_a' },
        { id: 'candidate_result', resource_id: 'resource_b' },
      ],
    })],
    ['content_units/content_unit_k41m/keyframes/keyframe_c83x/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'keyframe_c83x',
      candidates: [{ id: 'candidate_keyframe', resource_id: 'resource_keyframe_a' }],
      lock: { candidate_id: 'candidate_keyframe', resource_id: 'resource_keyframe_b' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('asset.lock.candidate_id does not resolve in candidates: candidate_missing')))
  assert.ok(review.issues.some((issue) => issue.message.includes('content_unit.candidates[1].id duplicates another candidate: candidate_result')))
  assert.ok(review.issues.some((issue) => issue.message.includes('keyframe.lock.resource_id does not match locked candidate resource_id: resource_keyframe_b != resource_keyframe_a')))
})

test('workspace build rejects invalid source JSON', async () => {
  const files = new Map([
    ['settings/setting_1/setting.json', '{'],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const result = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.review.readyToBuild, false)
  assert.match(result.review.issues[0]?.message ?? '', /invalid JSON/)
  assert.equal(files.has('.build/current/settings/setting_1/setting.json'), false)
})

function sourceDocuments() {
  return sourceFileEntries().map(([path, content]) => ({
    path,
    data: path.endsWith('.json') ? JSON.parse(content) : content,
  }))
}

function sourceFileEntries() {
  return [
    ['project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', id: 'project_demo', title: 'Demo' })],
    ['project_standards.json', JSON.stringify({ schema: 'movscript.project_standards.v1', kind: 'project_standards', id: 'project_standards_main', visual_style: 'Cold rainy suspense realism.' })],
    ['scripts/script_main/script.json', JSON.stringify({ schema: 'movscript.script.v1', kind: 'script', id: 'script_main', title: 'Main Script', source_ref: 'script.md' })],
    ['scripts/script_main/script.md', 'INT. APARTMENT - NIGHT\nRain hits the window.\n'],
    ['settings/setting_hero/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'setting_hero', setting_kind: 'character', title: 'Hero' })],
    ['settings/setting_hero/states/setting_state_rain/setting_state.json', JSON.stringify({ schema: 'movscript.setting_state.v1', kind: 'setting_state', id: 'setting_state_rain', title: 'Rain' })],
    ['settings/setting_hero/states/setting_state_rain/assets/asset_wet_hair/asset.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'asset_wet_hair',
      slot: 'character_state_reference',
      candidates: [{ id: 'candidate_a', resource_id: 'resource_1' }],
      lock: { candidate_id: 'candidate_a', resource_id: 'resource_1' },
    })],
    ['productions/production_p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'production_p8f3', title: 'Episode 1' })],
    ['productions/production_p8f3/segments/segment_a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'segment_a19d', title: 'Opening', order: 1 })],
    ['productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'scene_moment_r72k',
      title: 'Phone call',
      order: 1,
      storyboard_timing: {
        items: [{ storyboard_id: 'storyboard_main', order: 1 }],
        audio: { note: 'Rain low, phone vibration sharp.' },
        transition: { out: 'hold_then_cut' },
      },
    })],
    ['productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/keyframes/keyframe_scene_anchor/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'keyframe_scene_anchor',
      title: 'Scene anchor',
      visual_intent: 'Rainy apartment scene anchor.',
      reference_asset_refs: ['asset_wet_hair'],
      candidates: [{ id: 'candidate_scene_anchor', resource_id: 'resource_scene_anchor' }],
      lock: { candidate_id: 'candidate_scene_anchor', resource_id: 'resource_scene_anchor' },
    })],
    ['productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'storyboard_main',
      setting_refs: [{ setting_id: 'setting_hero', setting_state_id: 'setting_state_rain', role: 'subject' }],
      shot_plans: [{ id: 'shot_plan_1', order: 1, shot_size: 'close_up' }],
    })],
    ['productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main/writing_expressions/writing_expression_1/writing_expression.json', JSON.stringify({
      schema: 'movscript.writing_expression.v1',
      kind: 'writing_expression',
      id: 'writing_expression_1',
      expression_kind: 'caption',
      text: 'Unknown number lights up again.',
    })],
    ['content_units/content_unit_k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'content_unit_k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k',
        storyboard_ref: 'productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main',
      },
      editable_prompt: {
        prompt: 'Cold phone light on frightened face.',
        negative_prompt: 'cartoon',
      },
      candidates: [{ id: 'candidate_video_1', resource_id: 'resource_video_1' }],
      lock: { candidate_id: 'candidate_video_1', resource_id: 'resource_video_1' },
    })],
    ['content_units/content_unit_k41m/keyframes/keyframe_c83x/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'keyframe_c83x',
      title: 'Phone light close-up',
      visual_intent: 'Phone blue light illuminates the hero face.',
      reference_asset_refs: ['asset_wet_hair'],
      candidates: [{ id: 'candidate_keyframe_1', resource_id: 'resource_keyframe_1' }],
      lock: { candidate_id: 'candidate_keyframe_1', resource_id: 'resource_keyframe_1' },
    })],
  ]
}

function memoryWorkspaceFileRepository(files) {
  return {
    async list(input = {}) {
      const root = normalizeMemoryPath(input.path ?? '')
      const children = new Map()
      for (const path of files.keys()) {
        if (root && path !== root && !path.startsWith(`${root}/`)) continue
        const rest = root ? path.slice(root.length).replace(/^\//, '') : path
        if (!rest) continue
        const [name, ...tail] = rest.split('/')
        const childPath = root ? `${root}/${name}` : name
        children.set(childPath, {
          path: childPath,
          kind: tail.length > 0 ? 'directory' : 'file',
          size: tail.length > 0 ? undefined : files.get(path).length,
        })
      }
      return {
        path: root,
        entries: [...children.values()].sort((left, right) => {
          if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
          return left.path.localeCompare(right.path)
        }),
      }
    },
    async read(input) {
      const path = normalizeMemoryPath(input.path)
      const content = files.get(path)
      if (content === undefined) throw new Error(`missing file: ${path}`)
      return { path, content, size: content.length }
    },
    async write(input) {
      const path = normalizeMemoryPath(input.path)
      files.set(path, input.content)
      return { path, content: input.content, size: input.content.length }
    },
    async delete(input) {
      files.delete(normalizeMemoryPath(input.path))
    },
  }
}

function normalizeMemoryPath(path) {
  return String(path).replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}
