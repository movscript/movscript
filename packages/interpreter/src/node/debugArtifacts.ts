import type {
  MovScriptWorkspaceDerivedArtifacts,
} from '../artifacts/index.js'
import type {
  MovScriptWorkspaceDomainIndex,
} from '@movscript/workspace/indexer'
import type {
  MovScriptWorkspaceFileRepository,
} from '@movscript/workspace/repository'
import {
  MOVSCRIPT_ASSET_INDEX_PATH,
  MOVSCRIPT_INTERPRET_CURRENT_DIR,
  MOVSCRIPT_INTERPRET_MANIFESTS_DIR,
  MOVSCRIPT_DOMAIN_INDEX_PATH,
  MOVSCRIPT_DOMAIN_TREE_PATH,
  MOVSCRIPT_EDITOR_STATE_PATH,
  MOVSCRIPT_RELATION_GRAPH_PATH,
  entityPathSlug,
  normalizeWorkspacePath,
} from '@movscript/workspace/layout'
import {
  loadInterpretedCurrentSourceSnapshots,
  loadWorkspaceFileSnapshots,
  resolveWorkspaceSource,
  type WorkspaceSourceSnapshot,
} from './sourceStore.js'

export interface MovScriptDebugArtifactInterpretManifest {
  interpretationId: string
}

export async function writeDebugArtifacts(
  fileRepository: MovScriptWorkspaceFileRepository,
  artifacts: MovScriptWorkspaceDerivedArtifacts,
  index: MovScriptWorkspaceDomainIndex,
  manifest: MovScriptDebugArtifactInterpretManifest,
  impactReportPath: string,
  sourceSnapshot?: WorkspaceSourceSnapshot,
): Promise<void> {
  const source = sourceSnapshot ?? await resolveWorkspaceSource(fileRepository)
  const sourcePaths = new Set(source.files.map((file) => file.relativePath))
  for (const file of await loadInterpretedCurrentSourceSnapshots(fileRepository, 'source')) {
    if (!sourcePaths.has(file.relativePath)) {
      await fileRepository.delete({ path: file.path })
    }
  }
  for (const file of source.files) {
    await fileRepository.write({
      path: `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/${file.relativePath}`,
      content: file.content,
    })
  }
  await fileRepository.write({
    path: MOVSCRIPT_DOMAIN_TREE_PATH,
    content: `${JSON.stringify(artifacts.domainTree, null, 2)}\n`,
  })
  await fileRepository.write({
    path: MOVSCRIPT_EDITOR_STATE_PATH,
    content: `${JSON.stringify(editorStateFromArtifacts(artifacts), null, 2)}\n`,
  })
  await deleteStaleDerivedArtifacts(fileRepository, artifacts.previewTimelines.map((timeline) => {
    return `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/productions/${entityPathSlug(timeline.productionId, 'production')}/preview_timeline.json`
  }), isPreviewTimelineDerivedArtifact)
  for (const previewTimeline of artifacts.previewTimelines) {
    await fileRepository.write({
      path: `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/productions/${entityPathSlug(previewTimeline.productionId, 'production')}/preview_timeline.json`,
      content: `${JSON.stringify(previewTimeline, null, 2)}\n`,
    })
  }
  await deleteStaleDerivedArtifacts(fileRepository, artifacts.editPlans.map((editPlan) => {
    return `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/${editPlan.sceneMomentPath}/edit_plan.json`
  }), isEditPlanDerivedArtifact)
  for (const editPlan of artifacts.editPlans) {
    await fileRepository.write({
      path: `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/${editPlan.sceneMomentPath}/edit_plan.json`,
      content: `${JSON.stringify(editPlan, null, 2)}\n`,
    })
  }
  const contentUnitArtifactPaths = artifacts.contentUnitArtifacts.flatMap((artifact) => {
    const dir = `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/content_units/${entityPathSlug(artifact.contentUnitId, 'content_unit')}`
    return [
      `${dir}/runtime_panel.json`,
      `${dir}/generation_prompt.json`,
      `${dir}/dependency_report.json`,
      `${dir}/selection_validity.json`,
    ]
  })
  await deleteStaleDerivedArtifacts(fileRepository, contentUnitArtifactPaths, isContentUnitDerivedArtifact)
  for (const artifact of artifacts.contentUnitArtifacts) {
    const dir = `${MOVSCRIPT_INTERPRET_CURRENT_DIR}/content_units/${entityPathSlug(artifact.contentUnitId, 'content_unit')}`
    await fileRepository.write({
      path: `${dir}/runtime_panel.json`,
      content: `${JSON.stringify(artifact.runtimePanel, null, 2)}\n`,
    })
    await fileRepository.write({
      path: `${dir}/generation_prompt.json`,
      content: `${JSON.stringify(artifact.generationPrompt, null, 2)}\n`,
    })
    await fileRepository.write({
      path: `${dir}/dependency_report.json`,
      content: `${JSON.stringify(artifact.dependencyReport, null, 2)}\n`,
    })
    await fileRepository.write({
      path: `${dir}/selection_validity.json`,
      content: `${JSON.stringify(artifact.selectionValidity, null, 2)}\n`,
    })
  }
  await fileRepository.write({
    path: MOVSCRIPT_DOMAIN_INDEX_PATH,
    content: `${JSON.stringify(serializableDomainIndex(index), null, 2)}\n`,
  })
  await fileRepository.write({
    path: MOVSCRIPT_ASSET_INDEX_PATH,
    content: `${JSON.stringify(artifacts.assetIndex, null, 2)}\n`,
  })
  await fileRepository.write({
    path: MOVSCRIPT_RELATION_GRAPH_PATH,
    content: `${JSON.stringify(artifacts.relationGraph, null, 2)}\n`,
  })
  await fileRepository.write({
    path: impactReportPath,
    content: `${JSON.stringify(artifacts.impactReport, null, 2)}\n`,
  })
  await fileRepository.write({
    path: `${MOVSCRIPT_INTERPRET_MANIFESTS_DIR}/${manifest.interpretationId}.json`,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  })
}

async function deleteStaleDerivedArtifacts(
  fileRepository: MovScriptWorkspaceFileRepository,
  nextArtifactPaths: string[],
  matchesArtifact: (relativePath: string) => boolean,
): Promise<void> {
  const nextPaths = new Set(nextArtifactPaths.map(normalizeWorkspacePath))
  const currentFiles = await loadWorkspaceFileSnapshots(fileRepository, MOVSCRIPT_INTERPRET_CURRENT_DIR)
  for (const file of currentFiles) {
    if (!matchesArtifact(file.relativePath)) continue
    if (nextPaths.has(file.path)) continue
    await fileRepository.delete({ path: file.path })
  }
}

function isPreviewTimelineDerivedArtifact(relativePath: string): boolean {
  return relativePath.startsWith('productions/') && relativePath.endsWith('/preview_timeline.json')
}

function isEditPlanDerivedArtifact(relativePath: string): boolean {
  return relativePath.startsWith('productions/') && relativePath.endsWith('/scene_moment.json') === false && relativePath.endsWith('/edit_plan.json')
}

function isContentUnitDerivedArtifact(relativePath: string): boolean {
  return relativePath.startsWith('content_units/')
    && (relativePath.endsWith('/runtime_panel.json')
      || relativePath.endsWith('/input_version.json')
      || relativePath.endsWith('/dependency_report.json')
      || relativePath.endsWith('/selection_validity.json')
      || relativePath.endsWith('/generation_prompt.json'))
}

function serializableDomainIndex(index: MovScriptWorkspaceDomainIndex): Record<string, unknown> {
  const byKind: Record<string, unknown[]> = {}
  for (const entity of index.entities) {
    byKind[entity.entityKind] = [...(byKind[entity.entityKind] ?? []), {
      path: entity.path,
      index: entity.index,
      ...(entity.id !== undefined ? { id: entity.id } : {}),
      ...(entity.clientId ? { clientId: entity.clientId } : {}),
      ...(entity.schema ? { schema: entity.schema } : {}),
    }]
  }
  return {
    schema: 'movscript.domain-index.v1',
    documents: index.documents.map((document) => ({ path: document.path })),
    entities: index.entities,
    byKind,
  }
}

function editorStateFromArtifacts(artifacts: MovScriptWorkspaceDerivedArtifacts): Record<string, unknown> {
  return {
    schema: 'movscript.editor-state.v1',
    domainTree: artifacts.domainTree,
    assetIndex: artifacts.assetIndex,
    relationSummary: {
      total: artifacts.relationGraph.relations.length,
      byKind: artifacts.relationGraph.relations.reduce<Record<string, number>>((out, relation) => {
        out[relation.type] = (out[relation.type] ?? 0) + 1
        return out
      }, {}),
    },
    previewTimelines: artifacts.previewTimelines.map((timeline) => ({
      productionId: timeline.productionId,
      productionPath: timeline.productionPath,
      itemCount: timeline.items.length,
    })),
    editPlans: artifacts.editPlans.map((editPlan) => ({
      productionId: editPlan.productionId,
      sceneMomentId: editPlan.sceneMomentId,
      status: editPlan.status,
      trackCount: editPlan.tracks.length,
      composeInputCount: editPlan.compose_inputs.length,
    })),
    contentUnitRuntimePanels: artifacts.contentUnitArtifacts.map((artifact) => ({
      contentUnitId: artifact.contentUnitId,
      contentUnitPath: artifact.contentUnitPath,
      contentUnitType: artifact.runtimePanel.content_unit_type,
      stale: artifact.selectionValidity.stale,
      blocked: artifact.runtimePanel.status === 'blocked',
    })),
  }
}
