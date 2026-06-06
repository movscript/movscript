import {
  createEditableProjectionWorkflowToolAdapter,
  createJsonProjectionAdapter,
  createWritableProjectionUpdateTarget,
  type CommandExecutor,
  type JsonPatchOperation,
  type WorkspaceUpdateTarget,
} from '@movscript/editable-projections'
import {
  assertEditableProjectionWorkflowToolAdapterContract,
  createEditableProjectionMemoryTestHarness,
  MemoryBackendStore,
  runEditableProjectionMemoryIntegrationContractGate,
  type EditableProjectionMemoryIntegrationContractGateResult,
} from '@movscript/editable-projections/testing'
import { fileURLToPath } from 'node:url'

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

export interface FirstAdapterExampleResult {
  filePath: string
  reviewReady: boolean
  appliedCommands: number
  finalState: string | undefined
  integrationGate: EditableProjectionMemoryIntegrationContractGateResult<NoteCommand>
  toolNames: string[]
  commands: NoteCommand[]
}

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
      issues.push({ path: '/schema', severity: 'error' as const, message: 'schema must be example.note.v1.' })
    }
    if (typeof value.id !== 'number') {
      issues.push({ path: '/id', severity: 'error' as const, message: 'id must be a number.' })
    }
    if (typeof value.title !== 'string' || value.title.length === 0) {
      issues.push({ path: '/title', severity: 'error' as const, message: 'title is required.' })
    }
    if (typeof value.body !== 'string') {
      issues.push({ path: '/body', severity: 'error' as const, message: 'body must be a string.' })
    }
    return issues
  },

  createCommands(input) {
    if (input.action === 'create') {
      return input.target ? [{ type: 'note.create', draft: input.target }] : []
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

function notePath(note: NoteEntity): string {
  return `notes/note_${note.id}.json`
}

function noteUpdateTarget(note: NoteEntity): WorkspaceUpdateTarget {
  return createWritableProjectionUpdateTarget({
    adapter: noteAdapter,
    entity: note,
    entityId: note.id,
    path: notePath(note),
    backendHash: note.hash,
  })
}

export async function runFirstAdapterExample(): Promise<FirstAdapterExampleResult> {
  const note: NoteEntity = { id: 1, title: 'Initial', body: 'Body', hash: 'note-v1' }
  const commands: NoteCommand[] = []
  const backendStore = createSeededBackendStore(note)
  const harness = createEditableProjectionMemoryTestHarness<NoteCommand>({
    adapters: [noteAdapter],
    backendStore,
    executor: createNoteExecutor(commands, backendStore),
  })
  const filePath = notePath(note)

  await harness.workflow.update([noteUpdateTarget(note)])
  const current = await harness.fs.readFile(filePath)
  await harness.fs.writeFile(filePath, current.replace('Initial', 'Updated'))
  const review = await harness.workflow.review(filePath)
  const apply = await harness.workflow.applyReview(review.review)
  const status = await harness.workflow.status(filePath)

  const integrationBackendStore = createSeededBackendStore(note)
  const integrationGate = await runEditableProjectionMemoryIntegrationContractGate({
    adapter: noteAdapter,
    entity: note,
    entityId: note.id,
    filePath,
    validFile: serializeProjection({
      schema: 'example.note.v1',
      id: note.id,
      title: note.title,
      body: note.body,
    }),
    invalidFile: serializeProjection({
      schema: 'example.note.v1',
      id: note.id,
      title: '',
      body: note.body,
    }),
    commandInput: {
      filePath,
      entity: { entityType: 'note', entityId: note.id },
      target: {
        schema: 'example.note.v1',
        id: note.id,
        title: 'Updated',
        body: note.body,
      },
      patch: [{ op: 'replace', path: '/title', value: 'Updated' }],
    },
    updateTarget: noteUpdateTarget(note),
    backendStore: integrationBackendStore,
    executor: createNoteExecutor([], integrationBackendStore),
    editFile(content) {
      return content.replace('Initial', 'Updated')
    },
    rootPath: 'notes',
  })

  const toolBackendStore = createSeededBackendStore(note)
  const toolHarness = createEditableProjectionMemoryTestHarness<NoteCommand>({
    adapters: [noteAdapter],
    backendStore: toolBackendStore,
    executor: createNoteExecutor([], toolBackendStore),
  })
  const toolAdapter = createEditableProjectionWorkflowToolAdapter(toolHarness.workflow, { namePrefix: 'workspace_' })
  await assertEditableProjectionWorkflowToolAdapterContract({
    toolAdapter,
    fs: toolHarness.fs,
    updateTarget: noteUpdateTarget(note),
    rootPath: 'notes',
    editFile(content) {
      return content.replace('Initial', 'Updated')
    },
  })

  return {
    filePath,
    reviewReady: review.gate.ready,
    appliedCommands: apply.result.appliedCommands,
    finalState: status.status.files[0]?.state,
    integrationGate,
    toolNames: toolAdapter.toolDefinitions.map((tool) => tool.name),
    commands,
  }
}

function createSeededBackendStore(note: NoteEntity): MemoryBackendStore {
  return new MemoryBackendStore([{
    entityType: 'note',
    entityId: note.id,
    hash: note.hash,
    value: note,
  }])
}

function createNoteExecutor(
  commands: NoteCommand[],
  backendStore: MemoryBackendStore,
): CommandExecutor<NoteCommand> {
  return {
    async execute(executedCommands) {
      commands.push(...executedCommands)
      const updateTargets: WorkspaceUpdateTarget[] = []
      for (const command of executedCommands) {
        if (command.type === 'note.delete') continue
        const titleOperation = command.type === 'note.update'
          ? command.patch.find(isTitleValuePatch)
          : undefined
        const title = command.type === 'note.create'
          ? command.draft.title
          : titleOperation?.value
        const canonical = {
          id: command.type === 'note.create' ? command.draft.id : command.id,
          title: typeof title === 'string' ? title : 'Updated',
          body: 'Body',
          hash: 'note-v2',
        }
        backendStore.setEntity({
          entityType: 'note',
          entityId: canonical.id,
          hash: canonical.hash,
          value: canonical,
        })
        updateTargets.push(noteUpdateTarget(canonical))
      }
      return { updateTargets }
    },
  }
}

function isTitleValuePatch(
  operation: JsonPatchOperation,
): operation is Extract<JsonPatchOperation, { op: 'add' | 'replace' }> {
  return operation.op !== 'remove' && operation.path === '/title'
}

function serializeProjection(projection: NoteProjection): string {
  return `${JSON.stringify(projection, null, 2)}\n`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await runFirstAdapterExample()
  if (!result.reviewReady || result.appliedCommands !== 1 || result.finalState !== 'clean' || !result.integrationGate.ok) {
    throw new Error('first adapter example failed')
  }
  console.log('first adapter example ok')
}
