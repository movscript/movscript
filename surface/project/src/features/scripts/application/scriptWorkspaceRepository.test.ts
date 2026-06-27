import assert from 'node:assert/strict'
import test from 'node:test'

import type { MovScriptWorkspaceIndexedEntity, MovScriptWorkspaceService } from '@movscript/workspace'
import { __setSurfaceWorkspaceDomainClientForTests } from '@movscript/shared'
import {
  listWorkspaceScripts,
  saveWorkspaceScript,
} from './scriptWorkspaceRepository'

test('script workspace repository reads scripts through core service records', async () => {
  const calls = withScriptService({
    entities: [{
      entityKind: 'script',
      record: {
        schema: 'movscript.script.v1',
        kind: 'script',
        id: 'script_12',
        project_id: 9,
        title: 'Opening Draft',
        script_kind: 'episode',
        order: 3,
        summary: 'A local script.',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
      path: '',
      index: 0,
      id: 'script_12',
    }],
    sourceText: 'Scene one text',
  })
  try {
    const scripts = await listWorkspaceScripts(9)
    assert.equal(scripts.length, 1)
    assert.equal(scripts[0].ID, 12)
    assert.equal(scripts[0].title, 'Opening Draft')
    assert.equal(scripts[0].content, 'Scene one text')
    assert.equal(scripts[0].raw_source, 'Scene one text')
    assert.equal(scripts[0].script_type, 'episode')
    assert.equal(calls.readSources.length, 1)
    assert.equal(calls.readSources[0]?.entity?.id, 'script_12')
  } finally {
    calls.restore()
  }
})

test('script workspace repository accepts wrapped query results', async () => {
  const calls = withScriptService({
    entities: {
      result: [{
        entityKind: 'script',
        record: {
          schema: 'movscript.script.v1',
          kind: 'script',
          id: 'script_21',
          project_id: 9,
          title: 'Wrapped Draft',
          script_kind: 'outline',
        },
        path: '',
        index: 0,
        id: 'script_21',
      }],
    },
    sourceText: 'Wrapped source text',
  })
  try {
    const scripts = await listWorkspaceScripts(9, {
      projectDir: '/tmp/project',
      projectUid: 'prj_abc',
      projectServiceBaseURL: 'http://127.0.0.1:4101',
    })
    assert.equal(scripts.length, 1)
    assert.equal(scripts[0].ID, 21)
    assert.equal(scripts[0].title, 'Wrapped Draft')
    assert.equal(scripts[0].content, 'Wrapped source text')
    assert.deepEqual(calls.contexts[0], {
      projectDir: '/tmp/project',
      projectUid: 'prj_abc',
      projectServiceBaseURL: 'http://127.0.0.1:4101',
      projectId: 9,
    })
  } finally {
    calls.restore()
  }
})

test('script workspace repository saves script body and metadata through core service records', async () => {
  const calls = withScriptService({
    entities: [{
      entityKind: 'script',
      record: {
        schema: 'movscript.script.v1',
        kind: 'script',
        id: 'script_12',
        project_id: 9,
        title: 'Old Title',
        script_kind: 'episode',
        content: 'Old text',
      },
      path: '',
      index: 0,
      id: 'script_12',
    }],
    sourceText: 'Old text',
  })
  try {
    const saved = await saveWorkspaceScript(9, 12, {
      title: 'New Title',
      content: 'New local text',
      script_type: 'finale',
    }, { orgId: 22 })
    assert.equal(saved.title, 'New Title')
    assert.equal(saved.content, 'New local text')
    assert.deepEqual(calls.contexts[0], { orgId: 22, projectId: 9 })
    assert.equal(calls.upserts.length, 1)
    assert.equal(calls.upserts[0]?.scriptId, 12)
    assert.equal(calls.upserts[0]?.sourceText, 'New local text')
    assert.equal(calls.upserts[0]?.metadata.title, 'New Title')
    assert.equal(calls.upserts[0]?.metadata.script_type, 'finale')
  } finally {
    calls.restore()
  }
})

function withScriptService(input: {
  entities: unknown
  sourceText: string
}): {
  readSources: Array<{ record: Record<string, unknown>; entity?: MovScriptWorkspaceIndexedEntity }>
  contexts: Array<Record<string, unknown>>
  upserts: Array<{
    scriptId: string | number
    record?: Record<string, unknown> | null
    sourceText: string
    metadata: Record<string, unknown>
  }>
  restore: () => void
} {
  const readSources: Array<{ record: Record<string, unknown>; entity?: MovScriptWorkspaceIndexedEntity }> = []
  const contexts: Array<Record<string, unknown>> = []
  const upserts: Array<{
    scriptId: string | number
    record?: Record<string, unknown> | null
    sourceText: string
    metadata: Record<string, unknown>
  }> = []
  const restore = __setSurfaceWorkspaceDomainClientForTests({
    createWorkspaceDomainService: (context) => {
      contexts.push(context as unknown as Record<string, unknown>)
      return {
        queryEntities: async () => input.entities,
        readScriptSource: async (readInput) => {
          readSources.push({
            record: readInput.record,
            entity: readInput.entity as MovScriptWorkspaceIndexedEntity | undefined,
          })
          return input.sourceText
        },
        upsertScript: async (upsertInput) => {
          upserts.push({
            scriptId: upsertInput.scriptId as string | number,
            record: upsertInput.record as Record<string, unknown> | null | undefined,
            sourceText: String(upsertInput.sourceText ?? ''),
            metadata: upsertInput.metadata as Record<string, unknown> ?? {},
          })
          return {
            scriptId: `script_${upsertInput.scriptId}`,
            scriptPath: '',
            sourcePath: '',
            record: {
              ...(upsertInput.record as Record<string, unknown> | undefined),
              ...(upsertInput.metadata as Record<string, unknown> | undefined),
              id: `script_${upsertInput.scriptId}`,
              project_id: context?.projectId,
              content: upsertInput.sourceText,
            },
            sourceText: upsertInput.sourceText,
          }
        },
      } as Partial<MovScriptWorkspaceService> as MovScriptWorkspaceService
    },
  })
  return { readSources, contexts, upserts, restore }
}
