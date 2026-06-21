import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import {
  createMovScriptWorkspaceService,
} from '../../workspace/dist/index.js'
import {
  commitCheckpoint,
  interpretMovScriptWorkspace,
  inspectMovScriptWorkspace,
  overviewMovScriptWorkspace,
  planMovScriptWorkspaceRegeneration,
  reviewMovScriptWorkspace,
  resolveWorkspaceSource,
} from '../dist/node.js'
import {
  createNodeMovScriptWorkspaceFileRepository,
  readNodeMovScriptGitSourceFileChanges,
} from '../../workspace/dist/node.js'

import {
  memoryWorkspaceFileRepository,
  sourceFileEntries,
} from './helpers.mjs'

const execFileAsync = promisify(execFile)

test('workspace review carries json array order changes into entity and semantic changes', async () => {
  const files = new Map(sourceFileEntries())
  files.set('settings/hero/states/rain/assets/umbrella/asset.json', JSON.stringify({
    schema: 'movscript.asset.v1',
    kind: 'asset',
    id: 'umbrella',
    setting_id: 'hero',
    setting_state_id: 'rain',
    slot: 'character_state_reference',
    prompt_hint: 'Umbrella beads with rain.',
  }))
  const keyframePath = 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/keyframes/scene_anchor/keyframe.json'
  const keyframe = JSON.parse(files.get(keyframePath))
  keyframe.reference_asset_refs = ['wet_hair', 'umbrella']
  files.set(keyframePath, JSON.stringify(keyframe))

  const repository = memoryWorkspaceFileRepository(files)
  const interpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
    debugArtifacts: false,
  })
  assert.equal(interpretation.status, 'refreshed')
  await snapshotBaseline(repository, new Date('2026-06-07T00:00:30.000Z'))

  keyframe.reference_asset_refs = ['umbrella', 'wet_hair']
  files.set(keyframePath, JSON.stringify(keyframe))

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:01:00.000Z'),
  })
  const changedKeyframe = review.changedEntities.find((entity) => entity.entityKind === 'keyframe' && entity.id === 'scene_anchor')

  assert.equal(changedKeyframe?.state, 'modified')
  assert.ok(changedKeyframe?.fieldChanges?.some((change) => change.field === 'reference_asset_refs'
    && change.jsonPointer === '/reference_asset_refs'
    && change.jsonOperation === 'reordered'))
  assert.ok(changedKeyframe?.fieldChanges?.some((change) => change.field === 'reference_asset_refs.0'
    && change.jsonOperation === 'moved'
    && change.oldIndex === 1
    && change.newIndex === 0))
  assert.ok(review.semanticChanges.some((change) => change.entity.kind === 'keyframe'
    && change.entity.id === 'scene_anchor'
    && change.kind === 'reference_changed'
    && change.businessKind === 'sequence_reordered'
    && change.propagation === 'downstream_reference'
    && change.fields.includes('reference_asset_refs')))
  assert.ok(review.businessChanges.some((change) => change.entityKind === 'keyframe'
    && change.id === 'scene_anchor'
    && change.businessKinds.includes('sequence_reordered')
    && change.summary.startsWith('Sequence reordered:')))
})

test('unknown content unit types are valid but untracked for regeneration', async () => {
  const files = new Map(sourceFileEntries())
  files.set('content_units/cu_scene_video_custom/content_unit.json', JSON.stringify({
    schema: 'movscript.content_unit.v1',
    kind: 'content_unit',
    id: 'cu_scene_video_custom',
    title: 'Custom scene video',
    content_unit_type: 'scene_video',
    output_kind: 'video',
    edit_prompt: { text: 'Custom provider-specific scene video task.' },
    model_intent: { capability: 'video', duration_sec: 6 },
  }))
  const repository = memoryWorkspaceFileRepository(files)
  const decisionStore = memoryDecisionStore()
  const service = createMovScriptWorkspaceService({
    fileRepository: repository,
    decisionStore,
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    decisionStore,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })
  assert.equal(review.readyToInterpret, true)
  assert.equal(review.issues.some((issue) => issue.message.includes('unsupported content_unit_type')), false)

  const initialInterpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    decisionStore,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })
  assert.equal(initialInterpretation.status, 'refreshed')

  const runtimePanel = await service.readContentUnitRuntimePanel('cu_scene_video_custom')
  const dependencyReport = await service.readContentUnitDependencyReport('cu_scene_video_custom')
  const initialPrompt = JSON.parse(files.get('.interpret/current/content_units/cu_scene_video_custom/generation_prompt.json'))
  assert.equal(runtimePanel?.content_unit_type, 'scene_video')
  assert.equal(runtimePanel?.adapter_version, 'generic_prompt@1')
  assert.equal(runtimePanel?.output_kind, 'video')
  assert.equal(runtimePanel?.runtime_request?.capability, 'video')
  assert.equal(dependencyReport?.dependencies.length, 0)
  assert.equal(dependencyReport?.upstream_selections.length, 0)
  assert.equal(dependencyReport?.hash_inputs, undefined)
  assert.equal(dependencyReport?.hash_rule, undefined)
  assert.equal(initialPrompt.schema, 'movscript.content_unit_prompt.v1')

  await service.createContentCandidate({
    contentUnitId: 'cu_scene_video_custom',
    candidateId: 'candidate_custom_1',
    outputs: [{ kind: 'video', resource_id: 301, artifact_ref: 'resource_custom_1', duration_sec: 6 }],
    createdAt: '2026-06-07T00:01:00.000Z',
  })
  await service.selectContentUnitCandidate({
    contentUnitId: 'cu_scene_video_custom',
    candidateId: 'candidate_custom_1',
    resourceId: 301,
    reason: 'custom_scene_video_selection',
    selectedAt: '2026-06-07T00:02:00.000Z',
  })

  const selectionInterpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    decisionStore,
    now: new Date('2026-06-07T00:03:00.000Z'),
  })
  assert.equal(selectionInterpretation.status, 'refreshed')
  const selectedValidity = await service.readContentUnitSelectionValidity('cu_scene_video_custom')
  assert.equal(selectedValidity?.schema, 'movscript.content_unit_selection_validity.v2')
  assert.equal(selectedValidity?.stale, false)

  const keyframe = JSON.parse(files.get('productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/keyframes/scene_anchor/keyframe.json'))
  keyframe.visual_intent = 'Rainy apartment scene anchor after an upstream visual change.'
  keyframe.continuity = { ...keyframe.continuity, lighting: 'colder phone glow after upstream change' }
  files.set('productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/keyframes/scene_anchor/keyframe.json', `${JSON.stringify(keyframe, null, 2)}\n`)

  const upstreamInterpretation = await interpretMovScriptWorkspace({
    fileRepository: repository,
    decisionStore,
    now: new Date('2026-06-07T00:04:00.000Z'),
  })
  assert.equal(upstreamInterpretation.status, 'refreshed')

  const nextValidity = await service.readContentUnitSelectionValidity('cu_scene_video_custom')
  const impactReport = JSON.parse(files.get(upstreamInterpretation.manifest.output.impactReportPath))
  const changedKeyframe = impactReport.changedEntities.find((entity) => entity.entityKind === 'keyframe' && entity.id === 'scene_anchor')
  assert.equal(nextValidity?.selected, true)
  assert.equal(nextValidity?.stale, false)
  assert.equal(changedKeyframe?.affectedContentUnits.some((entity) => entity.id === 'cu_scene_video_custom'), false)

  const regenerationPlan = await planMovScriptWorkspaceRegeneration({
    fileRepository: repository,
    decisionStore,
    now: new Date('2026-06-07T00:04:30.000Z'),
  })
  assert.equal(regenerationPlan.affectedContentUnits.some((target) => target.contentUnitId === 'cu_scene_video_custom'), false)
})

test('interpreter interpret reads hierarchical source root and writes derived artifacts', async () => {
  const files = new Map(sourceFileEntries())
  files.set('.interpret/current/settings/hero/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'hero', setting_kind: 'character', title: 'Old Hero' }))
  files.set('.interpret/current/productions/p8f3/preview_timeline.json', JSON.stringify({ schema: 'movscript.preview_timeline.v1', items: [] }))
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.sourcePath, '')
  assert.equal(review.sourceMode, 'source')
  assert.equal(review.readyToInterpret, true)
  assert.equal(review.changedFiles.some((file) => file.currentPath === '.interpret/current/productions/p8f3/preview_timeline.json'), false)

  const result = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'refreshed')
  assert.equal(result.productionWorkPlan?.schema, 'movscript.production_work_plan.v1')
  assert.ok(result.productionWorkPlan?.items.some((item) => item.kind === 'edit_structure' && item.target.id === 'k41m'))
  assert.equal(result.manifest?.source.sourceMode, 'source')
  assert.equal(files.has('.interpret/current/settings/hero/setting.json'), true)
  assert.equal(files.has('.interpret/current/content_units/k41m/content_unit.json'), true)
  assert.equal(files.has('.interpret/current/domain-index.json'), true)
  assert.equal(files.has('.interpret/current/asset-index.json'), true)
  assert.equal(files.has('.interpret/current/relation-graph.json'), true)
  assert.equal(files.has('.interpret/current/domain-tree.json'), true)
  assert.equal(files.has('.interpret/current/editor-state.json'), true)
  assert.equal(files.has('.interpret/current/production_work_plan.json'), false)
  assert.equal(files.has('.interpret/current/content_units/k41m/runtime_panel.json'), true)
  assert.equal(files.has('.interpret/current/content_units/k41m/generation_prompt.json'), true)
  assert.equal(files.has('.interpret/current/content_units/k41m/dependency_report.json'), true)
  assert.equal(files.has('.interpret/current/content_units/k41m/selection_validity.json'), true)

  const domainIndex = JSON.parse(files.get('.interpret/current/domain-index.json'))
  const previewTimeline = JSON.parse(files.get('.interpret/current/productions/p8f3/preview_timeline.json'))
  const runtimePanel = JSON.parse(files.get('.interpret/current/content_units/k41m/runtime_panel.json'))
  const generationPrompt = JSON.parse(files.get('.interpret/current/content_units/k41m/generation_prompt.json'))
  const selectionValidity = JSON.parse(files.get('.interpret/current/content_units/k41m/selection_validity.json'))
  const editorState = JSON.parse(files.get('.interpret/current/editor-state.json'))
  const impactReport = JSON.parse(files.get(result.manifest.output.impactReportPath))
  assert.ok(domainIndex.entities.some((entity) => entity.entityKind === 'asset'))
  assert.ok(domainIndex.entities.some((entity) => entity.entityKind === 'storyboard'))
  assert.ok(domainIndex.entities.some((entity) => entity.entityKind === 'content_unit'))
  assert.equal(previewTimeline.schema, 'movscript.preview_timeline.v1')
  assert.equal(runtimePanel.schema, 'movscript.content_unit_runtime_panel.v1')
  assert.equal(runtimePanel.content_unit_type, 'expression_unit_ref')
  assert.equal(runtimePanel.input_hash, undefined)
  assert.equal(runtimePanel.input_version, undefined)
  assert.equal(runtimePanel.dependency_hashes, undefined)
  assert.equal(runtimePanel.hash_rule, undefined)
  assert.equal(runtimePanel.upstream_selections, undefined)
  assert.match(runtimePanel.prompt.text, /Cold phone light on frightened face/)
  assert.equal(generationPrompt.schema, 'movscript.content_unit_prompt.v1')
  assert.equal(generationPrompt.refs.every((ref) => ref.role === 'input'), true)
  assert.equal(generationPrompt.refs.some((ref) => ref.kind === 'asset' && ref.role === 'input'), true)
  const dependencyReport = JSON.parse(files.get('.interpret/current/content_units/k41m/dependency_report.json'))
  assert.equal(dependencyReport.hash_inputs, undefined)
  assert.ok(dependencyReport.blockers.some((blocker) => blocker.code === 'upstream_selection_missing'))
  assert.equal(selectionValidity.schema, 'movscript.content_unit_selection_validity.v2')
  assert.equal(selectionValidity.selected, false)
  assert.equal(editorState.contentUnitRuntimePanels.some((panel) => panel.contentUnitId === 'k41m'), true)
  assert.ok(impactReport.changedEntities.some((entity) => entity.entityKind === 'content_unit' && entity.editorImpacts.some((impact) => impact.includes('Content production context'))))
})

test('interpreter tracks scence_moment_ref content units as scene videos', async () => {
  const files = new Map(sourceFileEntries())
  files.set('content_units/cu_r72k_scene_video/content_unit.json', JSON.stringify({
    schema: 'movscript.content_unit.v1',
    kind: 'content_unit',
    id: 'cu_r72k_scene_video',
    title: 'Phone call scene video',
    content_unit_type: 'scence_moment_ref',
    output_kind: 'video',
    scene_moment_ref: 'r72k',
    edit_prompt: {
      text: 'Generate the complete dramatic beat as one video.',
    },
    model_intent: { capability: 'video', duration_sec: 8 },
  }))
  const repository = memoryWorkspaceFileRepository(files)

  const result = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'refreshed')
  const runtimePanel = JSON.parse(files.get('.interpret/current/content_units/cu_r72k_scene_video/runtime_panel.json'))
  const generationPrompt = JSON.parse(files.get('.interpret/current/content_units/cu_r72k_scene_video/generation_prompt.json'))
  const previewTimeline = JSON.parse(files.get('.interpret/current/productions/p8f3/preview_timeline.json'))
  assert.equal(runtimePanel.content_unit_type, 'scence_moment_ref')
  assert.equal(runtimePanel.output_kind, 'video')
  assert.equal(runtimePanel.status, 'ready')
  assert.equal(generationPrompt.refs.every((ref) => ref.role === 'input'), true)
  assert.ok(previewTimeline.items.some((item) => item.itemType === 'scene_moment' && item.entity.id === 'r72k' && item.contentUnitIds.includes('cu_r72k_scene_video')))
  assert.ok(previewTimeline.items.some((item) => item.itemType === 'content_unit' && item.entity.id === 'cu_r72k_scene_video' && item.parentId === 'scene_moment:r72k'))
})

test('interpreter derives scene moment edit plan from selected expression-unit content units', async () => {
  const files = new Map(sourceFileEntries())
  files.delete('content_units/k41m/content_unit.json')
  files.set('productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/eu_phone_visual/expression_unit.json', JSON.stringify({
    schema: 'movscript.expression_unit.v1',
    kind: 'expression_unit',
    id: 'eu_phone_visual',
    modality: 'visual',
    role: 'shot',
    title: 'Phone visual material',
    intent: 'Phone screen lights up in close-up.',
    content: { shot_size: 'close_up', camera: { movement: 'slow_push_in' } },
    timing_intent: { duration_sec: 2.4 },
    order: 1,
  }))
  files.set('productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/eu_line_001/expression_unit.json', JSON.stringify({
    schema: 'movscript.expression_unit.v1',
    kind: 'expression_unit',
    id: 'eu_line_001',
    modality: 'verbal',
    role: 'dialogue',
    speaker_ref: 'settings/hero',
    text: '你到底是谁？',
    intent: '低声、克制、害怕但不崩溃。',
    timing_intent: { span_refs: ['eu_phone_visual'] },
    order: 2,
  }))
  files.set('content_units/cu_phone_visual/content_unit.json', JSON.stringify({
    schema: 'movscript.content_unit.v1',
    kind: 'content_unit',
    id: 'cu_phone_visual',
    title: 'Phone visual material',
    content_unit_type: 'expression_unit_ref',
    output_kind: 'video',
    target_kind: 'expression_unit',
    target_ref: 'eu_phone_visual',
    generation_role: 'visual_material',
    edit_prompt: { text: 'Generate the visual expression material.' },
    model_intent: { capability: 'video', duration_sec: 2.4 },
  }))
  files.set('content_units/cu_line_001_audio/content_unit.json', JSON.stringify({
    schema: 'movscript.content_unit.v1',
    kind: 'content_unit',
    id: 'cu_line_001_audio',
    title: 'Line 001 voice',
    content_unit_type: 'expression_unit_ref',
    output_kind: 'audio',
    target_kind: 'expression_unit',
    target_ref: 'eu_line_001',
    generation_role: 'voice_material',
    edit_prompt: { text: 'Generate restrained dialogue audio.' },
    model_intent: { capability: 'audio' },
  }))

  const repository = memoryWorkspaceFileRepository(files)
  const decisionStore = memoryDecisionStore()
  const service = createMovScriptWorkspaceService({
    fileRepository: repository,
    decisionStore,
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  await interpretMovScriptWorkspace({ fileRepository: repository, decisionStore, now: new Date('2026-06-07T00:00:00.000Z') })

  const visualPrompt = JSON.parse(files.get('.interpret/current/content_units/cu_phone_visual/generation_prompt.json'))
  const voicePrompt = JSON.parse(files.get('.interpret/current/content_units/cu_line_001_audio/generation_prompt.json'))
  await service.createContentCandidate({
    contentUnitId: 'cu_phone_visual',
    candidateId: 'candidate_visual_1',
    outputs: [{ kind: 'video', resource_id: 501, duration_sec: 2.4 }],
    promptSnapshot: visualPrompt,
    createdAt: '2026-06-07T00:01:00.000Z',
  })
  await service.selectContentUnitCandidate({
    contentUnitId: 'cu_phone_visual',
    candidateId: 'candidate_visual_1',
    resourceId: 501,
    reason: 'edit_plan_test',
    selectedAt: '2026-06-07T00:02:00.000Z',
  })
  await service.createContentCandidate({
    contentUnitId: 'cu_line_001_audio',
    candidateId: 'candidate_voice_1',
    outputs: [{ kind: 'audio', resource_id: 601, duration_sec: 1.8 }],
    promptSnapshot: voicePrompt,
    createdAt: '2026-06-07T00:01:30.000Z',
  })
  await service.selectContentUnitCandidate({
    contentUnitId: 'cu_line_001_audio',
    candidateId: 'candidate_voice_1',
    resourceId: 601,
    reason: 'edit_plan_test',
    selectedAt: '2026-06-07T00:02:30.000Z',
  })

  await interpretMovScriptWorkspace({ fileRepository: repository, decisionStore, now: new Date('2026-06-07T00:03:00.000Z') })
  const editPlan = await service.readSceneMomentEditPlan('r72k')
  assert.equal(editPlan?.schema, 'movscript.edit_plan.v1')
  assert.equal(editPlan?.sceneMomentId, 'r72k')
  assert.equal(editPlan?.status, 'ready_to_compose')
  assert.deepEqual(editPlan?.compose_inputs.map((input) => input.resource_id).sort(), [501, 601])
  assert.ok(editPlan?.tracks.some((track) => track.type === 'video' && track.items.some((item) => item.content_unit_id === 'cu_phone_visual')))
  assert.ok(editPlan?.tracks.some((track) => track.type === 'voice' && track.items.some((item) => item.content_unit_id === 'cu_line_001_audio')))
})

test('workspace review maps git baseline text diff to entity, semantic, and production impact', async () => {
  const rootDir = join(tmpdir(), `movscript-git-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  try {
    await mkdir(rootDir, { recursive: true })
    for (const [path, content] of sourceFileEntries()) {
      const targetPath = join(rootDir, path)
      await mkdir(targetPath.replace(/\/[^/]+$/, ''), { recursive: true })
      await writeFile(targetPath, content, 'utf8')
    }
    await execFileAsync('git', ['-C', rootDir, 'init'])
    await execFileAsync('git', ['-C', rootDir, 'config', 'user.name', 'MovScript Test'])
    await execFileAsync('git', ['-C', rootDir, 'config', 'user.email', 'movscript-test@example.invalid'])
    await execFileAsync('git', ['-C', rootDir, 'add', '.'])
    await execFileAsync('git', ['-C', rootDir, 'commit', '-m', 'initial baseline'])
    const { stdout: headStdout } = await execFileAsync('git', ['-C', rootDir, 'rev-parse', 'HEAD'])
    const head = headStdout.trim()

    const keyframePath = 'productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/phone/keyframes/scene_anchor/keyframe.json'
    const keyframe = JSON.parse(await readFile(join(rootDir, keyframePath), 'utf8'))
    keyframe.visual_intent = 'Git workspace change to the scene anchor.'
    await writeFile(join(rootDir, keyframePath), `${JSON.stringify(keyframe, null, 2)}\n`, 'utf8')

    const review = await reviewMovScriptWorkspace({
      fileRepository: createNodeMovScriptWorkspaceFileRepository(rootDir),
      now: new Date('2026-06-07T00:00:00.000Z'),
    })
    const inspectionFromCommit = await inspectMovScriptWorkspace({
      fileRepository: createNodeMovScriptWorkspaceFileRepository(rootDir),
      now: new Date('2026-06-07T00:00:00.000Z'),
      commit: head,
    })

    assert.equal(review.comparisonBase.source, 'git')
    assert.equal(review.comparisonBase.from, head)
    assert.equal(inspectionFromCommit.comparisonBase.source, 'git')
    assert.equal(inspectionFromCommit.comparisonBase.from, head)
    assert.ok(inspectionFromCommit.changedFiles.some((file) => file.path === keyframePath && file.state === 'modified'))
    assert.ok(review.entityChanges.some((change) => {
      return change.entityKind === 'keyframe'
        && change.id === 'scene_anchor'
        && change.state === 'modified'
        && change.fieldChanges?.some((field) => field.field === 'visual_intent')
    }))
    assert.ok(review.semanticChanges.some((change) => {
      return change.entity.kind === 'keyframe'
        && change.kind === 'semantic_input_changed'
        && change.propagation === 'downstream_reference'
    }))
    assert.equal(review.productionImpacts.some((impact) => {
      return impact.kind === 'downstream_reference_changed'
        && impact.businessKinds.includes('keyframe_changed')
        && impact.businessImpacts.includes('Keyframe changed')
        && impact.contentUnit?.id === 'k41m'
    }), true)
    assert.equal(review.productionWorkPlan?.items.some((item) => {
      return item.kind === 'review_affected_output'
        && item.target.id === 'k41m'
        && item.upstream?.some((entity) => entity.entityKind === 'keyframe' && entity.id === 'scene_anchor')
    }), true)
    assert.equal(review.issues.some((issue) => issue.message.includes('git diff reported source file changes not present')), false)
    assert.equal(review.reshootTargets.length, 0)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('git source file change reader reports working tree changes from a checkpoint', async () => {
  const rootDir = join(tmpdir(), `movscript-git-file-layer-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  try {
    await mkdir(rootDir, { recursive: true })
    for (const [path, content] of [
      ['project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', project_id: 'project_demo', title: 'Demo' })],
      ['settings/hero/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'hero', setting_kind: 'character', title: 'Hero' })],
      ['scripts/main/script.json', JSON.stringify({ schema: 'movscript.script.v1', kind: 'script', id: 'main', title: 'Main Script' })],
      ['content_units/k41m/content_unit.json', JSON.stringify({ schema: 'movscript.content_unit.v1', kind: 'content_unit', id: 'k41m', content_unit_type: 'storyboard_ref', output_kind: 'video' })],
    ]) {
      const targetPath = join(rootDir, path)
      await mkdir(targetPath.replace(/\/[^/]+$/, ''), { recursive: true })
      await writeFile(targetPath, content, 'utf8')
    }
    await execFileAsync('git', ['-C', rootDir, 'init'])
    await execFileAsync('git', ['-C', rootDir, 'config', 'user.name', 'MovScript Test'])
    await execFileAsync('git', ['-C', rootDir, 'config', 'user.email', 'movscript-test@example.invalid'])
    await execFileAsync('git', ['-C', rootDir, 'add', '.'])
    await execFileAsync('git', ['-C', rootDir, 'commit', '-m', 'initial checkpoint'])
    const { stdout: headStdout } = await execFileAsync('git', ['-C', rootDir, 'rev-parse', 'HEAD'])
    const head = headStdout.trim()

    const project = JSON.parse(await readFile(join(rootDir, 'project.json'), 'utf8'))
    project.title = 'Updated Demo'
    await writeFile(join(rootDir, 'project.json'), JSON.stringify(project), 'utf8')
    await execFileAsync('git', ['-C', rootDir, 'mv', 'settings/hero/setting.json', 'settings/hero/setting_renamed.json'])
    await rm(join(rootDir, 'scripts/main/script.json'))
    const newUnitPath = join(rootDir, 'content_units/new_unit/content_unit.json')
    await mkdir(newUnitPath.replace(/\/[^/]+$/, ''), { recursive: true })
    await writeFile(newUnitPath, JSON.stringify({ schema: 'movscript.content_unit.v1', kind: 'content_unit', id: 'new_unit', content_unit_type: 'asset_ref', output_kind: 'image' }), 'utf8')

    const changes = await readNodeMovScriptGitSourceFileChanges(rootDir, head)

    assert.ok(changes.some((change) => change.path === 'project.json'
      && change.state === 'modified'
      && change.statusCode === 'M'))
    assert.ok(changes.some((change) => change.path === 'scripts/main/script.json'
      && change.state === 'deleted'
      && change.statusCode === 'D'))
    assert.ok(changes.some((change) => change.path === 'settings/hero/setting_renamed.json'
      && change.previousPath === 'settings/hero/setting.json'
      && change.state === 'moved'
      && change.statusCode.startsWith('R')))
    assert.ok(changes.some((change) => change.path === 'content_units/new_unit/content_unit.json'
      && change.state === 'added'
      && change.statusCode === '??'))
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('workspace interpret refreshes read models without initializing git or committing source', async () => {
  const rootDir = join(tmpdir(), `movscript-git-init-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  try {
    await mkdir(rootDir, { recursive: true })
    for (const [path, content] of sourceFileEntries()) {
      const targetPath = join(rootDir, path)
      await mkdir(targetPath.replace(/\/[^/]+$/, ''), { recursive: true })
      await writeFile(targetPath, content, 'utf8')
    }

    const result = await interpretMovScriptWorkspace({
      fileRepository: createNodeMovScriptWorkspaceFileRepository(rootDir),
      now: new Date('2026-06-07T00:00:00.000Z'),
      debugArtifacts: false,
    })

    assert.equal(result.status, 'refreshed')
    assert.equal(result.baseline, undefined)
    await assert.rejects(() => execFileAsync('git', ['-C', rootDir, 'rev-parse', '--verify', 'HEAD']))
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('workspace interpret can disable .interpret debug artifacts without writing a comparison baseline', async () => {
  const files = new Map(sourceFileEntries())
  const repository = memoryWorkspaceFileRepository(files)

  const result = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
    debugArtifacts: false,
  })
  assert.equal(result.status, 'refreshed')
  assert.equal(result.manifest, undefined)
  assert.equal([...files.keys()].some((path) => path.startsWith('.interpret/')), false)
  assert.equal(files.has('checkpoints/current/source/project.json'), false)
})

test('workspace inspect exposes edit-impact semantics', async () => {
  const files = new Map(sourceFileEntries())
  const repository = memoryWorkspaceFileRepository(files)
  await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
    debugArtifacts: false,
  })
  await snapshotBaseline(repository, new Date('2026-06-07T00:00:30.000Z'))
  const project = JSON.parse(files.get('project.json'))
  project.title = 'Demo Revised'
  files.set('project.json', `${JSON.stringify(project, null, 2)}\n`)

  const inspection = await inspectMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:01:00.000Z'),
  })

  assert.equal(inspection.schema, 'movscript.workspace-inspection.v1')
  assert.equal(inspection.operation, 'inspect')
  assert.equal(inspection.readyToInterpret, true)
  assert.ok(inspection.changedFiles.some((file) => file.path === 'project.json' && file.state === 'modified'))
  assert.equal(inspection.comparisonBase.source, 'snapshot')
  assert.equal(inspection.summary.businessChanges, inspection.changedEntities.length)
  assert.ok(inspection.entityChanges.some((change) => change.entityKind === 'project' && change.fieldChanges?.some((field) => field.field === 'title')))
  assert.ok(inspection.semanticChanges.some((change) => change.entity.kind === 'project' && change.kind === 'metadata_changed'))
  assert.ok(inspection.businessChanges.some((change) => {
      return change.entityKind === 'project'
        && change.title === 'Demo Revised'
      && change.summary === 'Metadata changed: Demo Revised'
      && change.impactAreas.includes('workspace_context')
  }))
})

test('workspace inspect separates source document changes from business changes', async () => {
  const files = new Map([
    ['scripts/main/script.json', JSON.stringify({
      schema: 'movscript.script.v1',
      kind: 'script',
      id: 'main',
      title: 'Main Script',
      source_ref: 'script.md',
    })],
    ['scripts/main/script.md', 'new script text\n'],
  ])
  const repository = memoryWorkspaceFileRepository(files)
  files.set('scripts/main/script.md', 'old script text\n')
  await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
    debugArtifacts: false,
  })
  await snapshotBaseline(repository, new Date('2026-06-07T00:00:30.000Z'))
  files.set('scripts/main/script.md', 'new script text\n')

  const inspection = await inspectMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:01:00.000Z'),
  })

  assert.equal(inspection.summary.total, 1)
  assert.equal(inspection.summary.businessChanges, 0)
  assert.equal(inspection.businessChanges.length, 0)
})

test('workspace overview summarizes pending edits, interpretation state, regeneration, and next actions', async () => {
  const files = new Map(sourceFileEntries())
  const repository = memoryWorkspaceFileRepository(files)

  const beforeOverview = await overviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(beforeOverview.schema, 'movscript.workspace-overview.v1')
  assert.equal(beforeOverview.workspace.projectId, 'project_demo')
  assert.equal(beforeOverview.interpret.status, 'missing')
  assert.equal(beforeOverview.source.hasPendingEdits, true)
  assert.ok(beforeOverview.nextActions.includes('interpret'))

  await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:01:00.000Z'),
  })
  await snapshotBaseline(repository, new Date('2026-06-07T00:01:30.000Z'))

  const afterOverview = await overviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:02:00.000Z'),
  })

  assert.equal(afterOverview.interpret.status, 'current')
  assert.equal(afterOverview.source.hasPendingEdits, false)
  assert.equal(afterOverview.interpret.lastInterpretationId, 'interpret_20260607000100000')
})

test('workspace review treats script markdown as document source, not semantic entity', async () => {
  const files = new Map([
    ['scripts/main/script.json', JSON.stringify({
      schema: 'movscript.script.v1',
      kind: 'script',
      id: 'main',
      title: 'Main Script',
      source_ref: 'script.md',
    })],
    ['scripts/main/script.md', 'new script text\n'],
  ])
  const repository = memoryWorkspaceFileRepository(files)
  files.set('scripts/main/script.md', 'old script text\n')
  await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
    debugArtifacts: false,
  })
  await snapshotBaseline(repository, new Date('2026-06-07T00:00:30.000Z'))
  files.set('scripts/main/script.md', 'new script text\n')

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:01:00.000Z'),
  })

  assert.equal(review.readyToInterpret, true)
  assert.ok(review.changedFiles.some((file) => file.path === 'scripts/main/script.md' && file.state === 'modified'))
  assert.equal(review.changedEntities.some((entity) => entity.path === 'scripts/main/script.md'), false)
  assert.equal(review.changedEntities.some((entity) => entity.entityKind === 'script'), false)
})

test('workspace interpret removes deleted source files from current interpreted state', async () => {
  const files = new Map([
    ['project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', project_id: 'project_demo', title: 'Demo' })],
    ['settings/removed/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'removed', title: 'Removed' })],
  ])
  const repository = memoryWorkspaceFileRepository(files)
  await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })
  await snapshotBaseline(repository, new Date('2026-06-07T00:00:30.000Z'))
  files.delete('settings/removed/setting.json')

  const review = await reviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:01:00.000Z'),
  })

  assert.equal(review.summary.deleted, 1)
  assert.ok(review.changedFiles.some((file) => file.state === 'deleted' && file.path === 'settings/removed/setting.json'))
  assert.ok(review.businessChanges.some((change) => {
    return change.entityKind === 'setting'
      && change.id === 'removed'
      && change.title === 'Removed'
      && change.summary === 'Setting deleted: Removed'
      && change.impactAreas.includes('asset_index')
  }))

  const result = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:02:00.000Z'),
  })

  assert.equal(result.status, 'refreshed')
  assert.equal(files.has('.interpret/current/settings/removed/setting.json'), false)
})

test('workspace interpret removes stale preview timelines for deleted productions', async () => {
  const files = new Map(sourceFileEntries())
  files.set('.interpret/current/productions/old/preview_timeline.json', JSON.stringify({
    schema: 'movscript.preview_timeline.v1',
    productionId: 'old',
    items: [],
  }))
  const repository = memoryWorkspaceFileRepository(files)

  const result = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'refreshed')
  assert.equal(files.has('.interpret/current/productions/old/preview_timeline.json'), false)
  assert.equal(files.has('.interpret/current/productions/p8f3/preview_timeline.json'), true)
})

test('workspace interpret removes stale content unit artifacts for deleted content units', async () => {
  const files = new Map(sourceFileEntries())
  files.set('.interpret/current/content_units/old/runtime_panel.json', JSON.stringify({
    schema: 'movscript.content_unit_runtime_panel.v1',
    content_unit_id: 'old',
    content_unit_type: 'storyboard_ref',
  }))
  const repository = memoryWorkspaceFileRepository(files)

  const result = await interpretMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'refreshed')
  assert.equal(files.has('.interpret/current/content_units/old/runtime_panel.json'), false)
  assert.equal(files.has('.interpret/current/content_units/k41m/runtime_panel.json'), true)
})

function memoryDecisionStore() {
  const contexts = new Map()
  const targetRef = (contentUnitId) => `content_units/${String(contentUnitId)}`
  const key = (contentUnitId) => `content_unit:${targetRef(contentUnitId)}`
  const ensure = (contentUnitId) => {
    const contextKey = key(contentUnitId)
    const existing = contexts.get(contextKey)
    if (existing) return existing
    const context = {
      target_kind: 'content_unit',
      target_ref: targetRef(contentUnitId),
      candidates: [],
      status: 'open',
    }
    contexts.set(contextKey, context)
    return context
  }
  return {
    async getContentUnitDecision(input) {
      return contexts.get(key(input.contentUnitId))
    },
    async replaceContentUnitCandidates(input) {
      const context = ensure(input.contentUnitId)
      context.candidates = input.candidates
      return context
    },
    async upsertContentUnitCandidate(input) {
      const context = ensure(input.contentUnitId)
      const index = context.candidates.findIndex((candidate) => String(candidate.id) === String(input.candidate.id))
      if (index >= 0) context.candidates[index] = input.candidate
      else context.candidates.push(input.candidate)
      return context
    },
    async selectContentUnitCandidate(input) {
      const context = ensure(input.contentUnitId)
      const candidate = context.candidates.find((item) => String(item.id) === String(input.candidateId))
      if (!candidate) throw new Error(`candidate not found: ${String(input.candidateId)}`)
      const firstOutput = Array.isArray(candidate.outputs) ? candidate.outputs[0] : undefined
      context.selection = {
        candidate_id: input.candidateId,
        resource_id: input.resourceId ?? firstOutput?.resource_id,
        stale_policy: input.stalePolicy ?? 'strict',
        reason: input.reason,
        selected_at: input.selectedAt,
      }
      context.status = 'selected'
      return context
    },
    async clearContentUnitSelection(input) {
      const context = ensure(input.contentUnitId)
      delete context.selection
      context.status = 'open'
      return context
    },
  }
}

async function snapshotBaseline(repository, now) {
  const source = await resolveWorkspaceSource(repository)
  return commitCheckpoint(repository, source.files, {
    now,
    message: 'test comparison baseline',
  })
}
