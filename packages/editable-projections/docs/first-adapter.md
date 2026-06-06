# Build Your First Adapter

This guide shows the smallest useful integration for `@movscript/editable-projections`: one backend entity, one editable JSON file, one service command, and one contract test.

Use this guide when a product team wants to expose backend data as local draft files without giving agents direct database access.

## 1. Pick The Projection Boundary

Start with a product concept, not a database table.

Good first projection:

```text
notes/note_1.json
```

The file owns the note title and body. Other files may link to it or summarize it, but they should not also own those fields.

```json
{
  "schema": "example.note.v1",
  "id": 1,
  "title": "Draft title",
  "body": "Draft body"
}
```

## 2. Define Domain Types

```ts
import type { JsonPatchOperation } from '@movscript/editable-projections'

type NoteEntity = {
  id: number
  title: string
  body: string
  hash: string
}

type NoteProjection = {
  schema: 'example.note.v1'
  id: number
  title: string
  body: string
}

type NoteCommand =
  | { type: 'note.create'; draft: NoteProjection }
  | { type: 'note.update'; id: number; patch: JsonPatchOperation[] }
  | { type: 'note.delete'; id: number }
```

The entity is backend-owned. The projection is file-owned draft shape. The command is service-owned mutation intent.

## 3. Implement The Adapter

`createJsonProjectionAdapter` is the fastest path for JSON-backed projections.

```ts
import {
  createJsonProjectionAdapter,
} from '@movscript/editable-projections'

const noteAdapter = createJsonProjectionAdapter<NoteProjection, NoteEntity, NoteCommand>({
  schema: 'example.note.v1',
  entityType: 'note',

  toProjection(entity) {
    return {
      schema: 'example.note.v1',
      id: entity.id,
      title: entity.title,
      body: entity.body,
    }
  },

  validate(value) {
    const issues = []
    if (value.schema !== 'example.note.v1') {
      issues.push({ path: '/schema', severity: 'error', message: 'schema must be example.note.v1.' })
    }
    if (typeof value.id !== 'number') {
      issues.push({ path: '/id', severity: 'error', message: 'id must be a number.' })
    }
    if (typeof value.title !== 'string' || value.title.length === 0) {
      issues.push({ path: '/title', severity: 'error', message: 'title is required.' })
    }
    if (typeof value.body !== 'string') {
      issues.push({ path: '/body', severity: 'error', message: 'body must be a string.' })
    }
    return issues
  },

  createCommands(input) {
    if (input.action === 'create') {
      if (!input.target) return []
      return [{ type: 'note.create', draft: input.target }]
    }
    if (input.action === 'delete') {
      return [{ type: 'note.delete', id: Number(input.entity.entityId) }]
    }
    return [{
      type: 'note.update',
      id: Number(input.entity.entityId),
      patch: input.patch,
    }]
  },
})
```

Adapters should not call services, ORMs, SQL, HTTP, or database clients. They only translate file differences into domain commands.

## 4. Build Update Targets

Update targets materialize backend truth into the workspace.

```ts
import {
  createWritableProjectionUpdateTarget,
} from '@movscript/editable-projections'

function notePath(note: NoteEntity) {
  return `notes/note_${note.id}.json`
}

function noteUpdateTarget(note: NoteEntity) {
  return createWritableProjectionUpdateTarget({
    adapter: noteAdapter,
    entity: note,
    entityId: note.id,
    path: notePath(note),
    backendHash: note.hash,
  })
}
```

Keep hashes in update targets and manifest metadata, not inside business JSON files.

## 5. Wire A Workflow

```ts
import {
  createNodeEditableProjectionKit,
} from '@movscript/editable-projections/node'

const { workflow } = createNodeEditableProjectionKit('/tmp/note-workdir', {
  adapters: [noteAdapter],
  backendStore,
  executor,
})

await workflow.update([noteUpdateTarget(noteFromBackend)])

// An agent, user, IDE, or script edits notes/note_1.json here.

const review = await workflow.reviewAndSave('notes', 'latest')
console.log(review.markdown)

const applied = await workflow.loadAndApply('latest')
console.log(applied.markdown)
```

## 6. Execute Through Services

The executor receives reviewed commands and must delegate to product services. It returns canonical update targets after mutation.

```ts
const executor = {
  async execute(commands: NoteCommand[]) {
    const updateTargets = []

    for (const command of commands) {
      if (command.type === 'note.create') {
        const created = await noteService.create(command.draft)
        updateTargets.push(noteUpdateTarget(created))
      }
      if (command.type === 'note.update') {
        const updated = await noteService.patch(command.id, command.patch)
        updateTargets.push(noteUpdateTarget(updated))
      }
      if (command.type === 'note.delete') {
        await noteService.delete(command.id)
        updateTargets.push({
          path: `notes/note_${command.id}.json`,
          schema: 'example.note.v1',
          kind: 'writable_projection',
          writable: true,
          entityType: 'note',
          entityId: command.id,
          delete: true,
        })
      }
    }

    return { updateTargets }
  },
}
```

The framework validates executor-returned update targets before refreshing local files.

## 7. Add Contract Tests

Contract tests are the fastest way to keep adapter and workflow behavior stable.

```ts
import {
  runEditableProjectionMemoryIntegrationContractGate,
} from '@movscript/editable-projections/testing'

test('note projection integration contract', async () => {
  const note = { id: 1, title: 'Initial', body: 'Body', hash: 'note-v1' }
  const validProjection = {
    schema: 'example.note.v1',
    id: 1,
    title: 'Initial',
    body: 'Body',
  }
  const updatedProjection = {
    ...validProjection,
    title: 'Updated',
  }

  const gate = await runEditableProjectionMemoryIntegrationContractGate({
    adapter: noteAdapter,
    entity: note,
    entityId: note.id,
    filePath: 'notes/note_1.json',
    validFile: `${JSON.stringify(validProjection, null, 2)}\n`,
    invalidFile: `${JSON.stringify({
      schema: 'example.note.v1',
      id: 1,
      title: '',
      body: 'Body',
    }, null, 2)}\n`,
    commandInput: {
      filePath: 'notes/note_1.json',
      entity: {
        path: 'notes/note_1.json',
        entityType: 'note',
        entityId: note.id,
      },
      base: validProjection,
      local: updatedProjection,
      target: updatedProjection,
      patch: [{ op: 'replace', path: '/title', value: 'Updated' }],
    },
    updateTarget: noteUpdateTarget(note),
    backendEntities: [{
      entityType: 'note',
      entityId: note.id,
      hash: note.hash,
      value: note,
    }],
    executor,
    editFile(current) {
      return current.replace('Initial', 'Updated')
    },
    rootPath: 'notes',
  })

  if (!gate.ok) throw new Error(gate.markdown)
  if (gate.report.workflow?.status?.files[0]?.state !== 'clean') {
    throw new Error('workspace must be clean after apply')
  }
})
```

Keep this test in the consuming application, not only in the framework package. It proves your service wiring, canonical refresh, and final clean status.
The returned `gate.markdown` and `gate.json` are useful CI artifacts, while `gate.harness` lets the test inspect the in-memory backend after apply.

For a runnable package example of this pattern, use `runNoteProjectionIntegrationContractExample()` from `@movscript/editable-projections/examples/note`.
This guide also ships with a full checked source companion at `docs/first-adapter.example.ts`.

## 8. Expose Tools

When a host needs MCP, CLI, HTTP, or plugin operations, expose workflow tools instead of creating one custom tool per entity type.

```ts
import {
  createEditableProjectionWorkflowToolAdapter,
} from '@movscript/editable-projections'

const toolAdapter = createEditableProjectionWorkflowToolAdapter(workflow, {
  namePrefix: 'workspace_',
})

server.registerTools(toolAdapter.toolDefinitions)

server.onToolCall(async (toolName, args) => {
  const result = await toolAdapter.run(toolName, args)
  return result.ok
    ? { content: [{ type: 'text', text: result.markdown ?? '' }] }
    : { isError: true, content: [{ type: 'text', text: result.markdown }] }
})
```

Use `assertEditableProjectionWorkflowToolAdapterContract` to verify this dispatch layer in tests.

## Checklist

- Choose product-level projection boundaries before writing adapters.
- Keep each authoritative field writable in exactly one file.
- Put references in files as identity plus path hints.
- Keep hashes and sync metadata in the manifest, not in business JSON.
- Make adapters emit commands, not direct database writes.
- Make executors call services and return canonical update targets.
- Persist reviews when approval or cross-process handoff is needed.
- Run adapter, workflow, tool adapter, and integration contract tests in the consuming app.
