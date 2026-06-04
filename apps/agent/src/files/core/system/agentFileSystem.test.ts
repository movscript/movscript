import assert from 'node:assert/strict'
import test from 'node:test'
import { applyAgentFileEdits, contentRevision, type AgentFileEdit } from '../edit/agentFileEdit.js'
import { buildAgentFileRef } from '../ref/agentFileRef.js'
import { AgentFileSystem, type AgentFileProvider } from './agentFileSystem.js'

test('AgentFileSystem reads, searches, and edits through registered providers', () => {
  const provider = createMemoryFileProvider('notes', 'line one\nline two\nline three')
  const fileSystem = new AgentFileSystem([provider])
  const ref = buildAgentFileRef({ provider: 'memory', id: 'notes', path: '/content' })

  const read = fileSystem.read({ ref })
  assert.equal(read.file.ref, ref)
  assert.match(read.revision, /^sha256:/)

  const search = fileSystem.search({ ref, query: 'line two' })
  assert.equal(search.matchCount, 1)
  assert.equal(search.matches[0]?.line, 2)

  const edited = fileSystem.edit({
    ref,
    precondition: { baseRevision: read.revision },
    edits: [{
      type: 'replace_text',
      oldText: 'line two',
      newText: 'line 2',
    }],
    createdByRunId: 'run_1',
  })

  assert.equal(edited.changeSet.fileRef, ref)
  assert.equal(edited.changeSet.baseRevision, read.revision)
  assert.match(edited.changeSet.nextRevision, /^sha256:/)
  assert.equal(edited.changeSet.createdByRunId, 'run_1')
  assert.equal(provider.content(), 'line one\nline 2\nline three')
})

test('AgentFileSystem applies constrained context text patches through providers', () => {
  const provider = createMemoryFileProvider('patchable', 'line one\nline two\nline three')
  const fileSystem = new AgentFileSystem([provider])
  const ref = buildAgentFileRef({ provider: 'memory', id: 'patchable', path: '/content' })
  const read = fileSystem.read({ ref })

  const edited = fileSystem.edit({
    ref,
    precondition: { baseRevision: read.revision },
    edits: [{
      type: 'apply_patch',
      patch: [
        '*** Begin Patch',
        '*** Update File: content',
        '@@',
        ' line one',
        '-line two',
        '+line 2',
        ' line three',
        '*** End Patch',
      ].join('\n'),
    }],
  })

  assert.equal(edited.changeSet.replacementCount, 1)
  assert.equal(provider.content(), 'line one\nline 2\nline three')
})

test('AgentFileSystem rejects stale edit revisions through providers', () => {
  const provider = createMemoryFileProvider('stale', '{"a":1}')
  const fileSystem = new AgentFileSystem([provider])
  const ref = buildAgentFileRef({ provider: 'memory', id: 'stale', path: '/content' })

  assert.throws(
    () => fileSystem.edit({
      ref,
      precondition: { baseRevision: 'sha256:stale' },
      edits: [{ type: 'set_content', content: '{"a":2}' }],
    }),
    /baseRevision mismatch/,
  )
})

function createMemoryFileProvider(id: string, initialContent: string): AgentFileProvider & { content(): string } {
  let content = initialContent
  const ref = buildAgentFileRef({ provider: 'memory', id, path: '/content' })
  const file = { provider: 'memory', kind: 'text', id, ref }

  return {
    provider: 'memory',
    content: () => content,
    read(readRef) {
      if (readRef !== ref) throw new Error(`unexpected ref: ${readRef}`)
      return {
        file,
        content,
        contentLength: content.length,
        revision: contentRevision(content),
      }
    },
    search(readRef, input) {
      if (readRef !== ref) throw new Error(`unexpected ref: ${readRef}`)
      const matches = content.split(/\r?\n/).flatMap((line, index) => {
        const column = line.indexOf(input.query)
        return column >= 0 ? [{ line: index + 1, column: column + 1, excerpt: line }] : []
      }).slice(0, input.limit ?? 20)
      return {
        file,
        query: input.query,
        revision: contentRevision(content),
        matches,
        matchCount: matches.length,
      }
    },
    edit(editRef, input) {
      if (editRef !== ref) throw new Error(`unexpected ref: ${editRef}`)
      const baseRevision = contentRevision(content)
      if (input.precondition?.baseRevision && input.precondition.baseRevision !== baseRevision) {
        throw new Error('baseRevision mismatch')
      }
      const result = applyAgentFileEdits(content, input.edits as AgentFileEdit[])
      content = result.content
      return {
        file,
        contentLength: content.length,
        changeSet: {
          id: 'changeset_1',
          fileRef: ref,
          baseRevision,
          nextRevision: contentRevision(content),
          edits: input.edits,
          replacementCount: result.replacementCount,
          ...(input.createdByRunId ? { createdByRunId: input.createdByRunId } : {}),
          createdAt: '2026-05-21T00:00:00.000Z',
        },
      }
    },
  }
}
