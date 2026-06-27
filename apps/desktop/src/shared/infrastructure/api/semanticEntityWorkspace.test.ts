import assert from 'node:assert/strict'
import test from 'node:test'

import type { MovScriptWorkspaceService } from '@movscript/workspace'
import { __setElectronMovScriptWorkspaceServiceFactoryForTest } from '@/shared/infrastructure/workspaceDomainRepository'
import { writeWorkspaceSemanticEntity } from './semanticEntityWorkspace'

test('desktop semantic writer routes explicit timeline namespace production writes through hierarchy paths', async () => {
  const calls: Array<{ method: string; input: Record<string, unknown> }> = []
  const restore = __setElectronMovScriptWorkspaceServiceFactoryForTest(() => ({
    async saveProductionSnapshot(input: Record<string, unknown>) {
      calls.push({ method: 'saveProductionSnapshot', input })
      return {
        productionPath: 'productions/legacy/production.json',
        writtenPaths: ['productions/legacy/production.json'],
      }
    },
    async writeHierarchyNode(input: { targetPath: string; record: Record<string, unknown> }) {
      calls.push({ method: 'writeHierarchyNode', input })
      return { path: input.targetPath, entityKind: 'production', record: input.record }
    },
  }) as unknown as MovScriptWorkspaceService)

  try {
    const record = await writeWorkspaceSemanticEntity(9, 'productions', undefined, {
      id: 'pilot',
      name: 'Pilot',
      namespace_kind: 'episode',
      content_unit_ref: 'cu_bad',
      selected_resource_id: 100,
    })

    assert.equal(calls[0]?.method, 'writeHierarchyNode')
    assert.equal(calls[0]?.input.targetPath, 'timeline/pilot/production.json')
    const written = calls[0]?.input.record as Record<string, unknown>
    assert.equal(written.schema, 'movscript.production.v1')
    assert.equal(written.kind, 'production')
    assert.equal(written.id, 'pilot')
    assert.equal(written.namespace_kind, 'episode')
    assert.equal(written.timeline_namespace_kind, 'episode')
    assert.equal(written.content_unit_ref, undefined)
    assert.equal(written.selected_resource_id, undefined)
    assert.equal(record.__workspace_path, 'timeline/pilot/production.json')
  } finally {
    restore()
  }
})

test('desktop semantic writer keeps ordinary production writes on the legacy snapshot path', async () => {
  const calls: Array<{ method: string; input: Record<string, unknown> }> = []
  const restore = __setElectronMovScriptWorkspaceServiceFactoryForTest(() => ({
    async saveProductionSnapshot(input: Record<string, unknown>) {
      calls.push({ method: 'saveProductionSnapshot', input })
      return {
        productionPath: 'productions/7/production.json',
        writtenPaths: ['productions/7/production.json'],
      }
    },
  }) as unknown as MovScriptWorkspaceService)

  try {
    await writeWorkspaceSemanticEntity(9, 'productions', undefined, {
      id: 7,
      name: 'Legacy production',
    })

    assert.equal(calls[0]?.method, 'saveProductionSnapshot')
    assert.equal(calls[0]?.input.productionId, 7)
  } finally {
    restore()
  }
})

test('desktop semantic writer routes explicit timeline namespace segment writes through hierarchy paths', async () => {
  const calls: Array<{ method: string; input: Record<string, unknown> }> = []
  const restore = __setElectronMovScriptWorkspaceServiceFactoryForTest(() => ({
    async saveProductionSnapshot(input: Record<string, unknown>) {
      calls.push({ method: 'saveProductionSnapshot', input })
      return {
        productionPath: 'productions/pilot/production.json',
        writtenPaths: ['productions/pilot/segments/opening/segment.json'],
      }
    },
    async writeHierarchyNode(input: { targetPath: string; record: Record<string, unknown> }) {
      calls.push({ method: 'writeHierarchyNode', input })
      return { path: input.targetPath, entityKind: 'segment', record: input.record }
    },
  }) as unknown as MovScriptWorkspaceService)

  try {
    const record = await writeWorkspaceSemanticEntity(9, 'segments', undefined, {
      id: 'opening',
      production_id: 'pilot',
      title: 'Opening Beat',
      namespace_kind: 'beat',
      production_ref: 'pilot',
      segment_ref: 'opening',
    })

    assert.equal(calls[0]?.method, 'writeHierarchyNode')
    assert.equal(calls[0]?.input.targetPath, 'timeline/pilot/segments/opening/segment.json')
    const written = calls[0]?.input.record as Record<string, unknown>
    assert.equal(written.schema, 'movscript.segment.v1')
    assert.equal(written.kind, 'segment')
    assert.equal(written.entity_kind, 'segment')
    assert.equal(written.id, 'opening')
    assert.equal(written.production_id, undefined)
    assert.equal(written.production_ref, undefined)
    assert.equal(written.segment_ref, undefined)
    assert.equal(written.namespace_kind, 'beat')
    assert.equal(written.timeline_namespace_kind, 'beat')
    assert.equal(record.__workspace_path, 'timeline/pilot/segments/opening/segment.json')
  } finally {
    restore()
  }
})
