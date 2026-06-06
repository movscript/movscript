import { createJsonProjectionAdapter } from '../adapter.js'
import {
  runEditableProjectionIntegrationContractGate,
  type EditableProjectionIntegrationContractGateResult,
} from '../integrationContract.js'
import { createEditableProjectionWorkflowToolAdapter, type EditableProjectionWorkflowOperationResult } from '../operationRouter.js'
import { createEditableProjectionKit } from '../kit.js'
import { MemoryBackendStore } from '../memory.js'
import { createEditableProjectionMemoryTestHarness } from '../testHarness.js'
import {
  createWritableProjectionDeleteTarget,
  createWritableProjectionUpdateTarget,
} from '../updateTarget.js'
import type {
  EntityId,
  JsonObject,
  JsonPatchOperation,
  CommandExecutor,
  ProjectionAction,
  WorkspaceUpdateTarget,
} from '../types.js'
import type {
  ApplyReport,
  ApplyReviewReport,
  WorkspaceStatusReport,
  WorkspaceUpdateReport,
} from '../workflow.js'
import type { EditableProjectionBridgeResult } from '../bridge.js'

export const noteProjectionSchema = 'example.note.v1'

export interface NoteProjection extends JsonObject {
  schema: typeof noteProjectionSchema
  id: EntityId | null
  title: string
  body: string | null
}

export interface NoteEntity {
  id: EntityId
  title: string
  body?: string
}

export interface NoteCommand {
  type: 'note.create' | 'note.update' | 'note.delete'
  filePath: string
  action: ProjectionAction
  entityId?: EntityId
  target?: NoteProjection
  patch: JsonPatchOperation[]
}

export interface NoteProjectionExampleResult {
  filePath: string
  update: WorkspaceUpdateReport
  review: ApplyReviewReport<NoteCommand>
  apply: ApplyReport<NoteCommand>
  status: WorkspaceStatusReport
  commands: NoteCommand[]
}

export interface NoteProjectionToolAdapterExampleResult {
  filePath: string
  toolNames: string[]
  operationName: string | undefined
  update: EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<NoteCommand>>
  review: EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<NoteCommand>>
  apply: EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<NoteCommand>>
  status: EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<NoteCommand>>
  commands: NoteCommand[]
}

export interface NoteProjectionIntegrationContractExampleResult {
  filePath: string
  gate: EditableProjectionIntegrationContractGateResult<NoteCommand>
  commands: NoteCommand[]
}

export const noteProjectionAdapter = createJsonProjectionAdapter<NoteProjection, NoteEntity, NoteCommand>({
  schema: noteProjectionSchema,
  entityType: 'note',

  toProjection(entity) {
    return pruneUndefined({
      schema: noteProjectionSchema,
      id: entity.id,
      title: entity.title,
      body: entity.body ?? null,
    })
  },

  validate(value) {
    const issues = []
    if (!value.title || typeof value.title !== 'string') {
      issues.push({ severity: 'error' as const, path: '/title', message: 'Note title is required.' })
    }
    if (value.body !== null && typeof value.body !== 'string') {
      issues.push({ severity: 'error' as const, path: '/body', message: 'Note body must be a string or null.' })
    }
    return issues
  },

  createCommands(input) {
    return [{
      type: input.action === 'create'
        ? 'note.create'
        : input.action === 'delete'
          ? 'note.delete'
          : 'note.update',
      filePath: input.filePath,
      action: input.action,
      entityId: input.entity.entityId,
      target: input.target,
      patch: input.patch,
    }]
  },
})

export function noteProjectionPath(id: EntityId | string): string {
  return `data/notes/note_${String(id)}.json`
}

export function noteProjectionUpdateTarget(
  entity: NoteEntity,
  options: { path?: string; backendHash?: string } = {},
): WorkspaceUpdateTarget {
  return createWritableProjectionUpdateTarget({
    adapter: noteProjectionAdapter,
    entity,
    entityId: entity.id,
    path: options.path ?? noteProjectionPath(entity.id),
    backendHash: options.backendHash,
  })
}

export function noteProjectionDeleteTarget(
  entityId: EntityId,
  options: { path?: string; backendHash?: string } = {},
): WorkspaceUpdateTarget {
  return createWritableProjectionDeleteTarget({
    adapter: noteProjectionAdapter,
    entityId,
    path: options.path ?? noteProjectionPath(entityId),
    backendHash: options.backendHash,
  })
}

export async function runNoteProjectionExample(): Promise<NoteProjectionExampleResult> {
  const initial: NoteEntity = {
    id: 1,
    title: 'Draft note',
    body: 'Initial local draft.',
  }
  const backendStore = new MemoryBackendStore([{
    entityType: 'note',
    entityId: initial.id,
    hash: 'note-v1',
    value: initial,
  }])
  const commands: NoteCommand[] = []
  const kit = createEditableProjectionKit<NoteCommand>({
    adapters: [noteProjectionAdapter],
    backendStore,
    executor: createNoteExampleExecutor(backendStore, commands, initial.id),
  })
  const bundle = kit.createMemoryWorkflow()
  const filePath = noteProjectionPath(initial.id)
  const update = await bundle.workflow.update([
    noteProjectionUpdateTarget(initial, { backendHash: 'note-v1' }),
  ])
  const draft = JSON.parse(await bundle.fs.readFile(filePath)) as NoteProjection
  draft.title = 'Ready note'
  await bundle.fs.writeFile(filePath, `${JSON.stringify(draft, null, 2)}\n`)

  const review = await bundle.workflow.review(filePath)
  const apply = await bundle.workflow.applyReview(review.review)
  const status = await bundle.workflow.status(filePath)

  return {
    filePath,
    update,
    review,
    apply,
    status,
    commands,
  }
}

export async function runNoteProjectionToolAdapterExample(): Promise<NoteProjectionToolAdapterExampleResult> {
  const initial: NoteEntity = {
    id: 1,
    title: 'Draft note',
    body: 'Initial local draft.',
  }
  const backendStore = new MemoryBackendStore([{
    entityType: 'note',
    entityId: initial.id,
    hash: 'note-v1',
    value: initial,
  }])
  const commands: NoteCommand[] = []
  const kit = createEditableProjectionKit<NoteCommand>({
    adapters: [noteProjectionAdapter],
    backendStore,
    executor: createNoteExampleExecutor(backendStore, commands, initial.id),
  })
  const bundle = kit.createMemoryWorkflow()
  const toolAdapter = createEditableProjectionWorkflowToolAdapter(bundle.workflow)
  const filePath = noteProjectionPath(initial.id)
  const update = await toolAdapter.run('editable_projection_update', {
    targets: [noteProjectionUpdateTarget(initial, { backendHash: 'note-v1' })],
  })
  const draft = JSON.parse(await bundle.fs.readFile(filePath)) as NoteProjection
  draft.title = 'Ready note'
  await bundle.fs.writeFile(filePath, `${JSON.stringify(draft, null, 2)}\n`)

  const review = await toolAdapter.run('editable_projection_review', { path: filePath })
  const reviewPayload = review.ok && 'review' in review.result ? review.result.review : undefined
  const apply = await toolAdapter.run('editable_projection_apply_review', {
    review: reviewPayload,
  })
  const status = await toolAdapter.run('editable_projection_status', { path: filePath })

  return {
    filePath,
    toolNames: toolAdapter.toolDefinitions.map((definition) => definition.name),
    operationName: toolAdapter.getOperationName('editable_projection_apply_review'),
    update,
    review,
    apply,
    status,
    commands,
  }
}

export async function runNoteProjectionIntegrationContractExample(): Promise<NoteProjectionIntegrationContractExampleResult> {
  const initial: NoteEntity = {
    id: 1,
    title: 'Draft note',
    body: 'Initial local draft.',
  }
  const backendStore = new MemoryBackendStore([{
    entityType: 'note',
    entityId: initial.id,
    hash: 'note-v1',
    value: initial,
  }])
  const commands: NoteCommand[] = []
  const harness = createEditableProjectionMemoryTestHarness<NoteCommand>({
    adapters: [noteProjectionAdapter],
    backendStore,
    executor: createNoteExampleExecutor(backendStore, commands, initial.id),
  })
  const filePath = noteProjectionPath(initial.id)
  const gate = await runEditableProjectionIntegrationContractGate({
    adapter: {
      adapter: noteProjectionAdapter,
      entity: initial,
      entityId: initial.id,
      filePath,
      validFile: serializeNoteProjection({
        schema: noteProjectionSchema,
        id: initial.id,
        title: initial.title,
        body: initial.body ?? null,
      }),
      invalidFile: serializeNoteProjection({
        schema: noteProjectionSchema,
        id: initial.id,
        title: '',
        body: initial.body ?? null,
      }),
      commandInput: {
        target: {
          schema: noteProjectionSchema,
          id: initial.id,
          title: 'Ready note',
          body: initial.body ?? null,
        },
        patch: [{
          op: 'replace',
          path: '/title',
          value: 'Ready note',
        }],
      },
    },
    workflow: {
      workflow: harness.workflow,
      fs: harness.fs,
      updateTarget: noteProjectionUpdateTarget(initial, { backendHash: 'note-v1' }),
      rootPath: 'data/notes',
      editFile(current) {
        const draft = JSON.parse(current) as NoteProjection
        draft.title = 'Ready note'
        return serializeNoteProjection(draft)
      },
    },
  })

  return {
    filePath,
    gate,
    commands,
  }
}

function createNoteExampleExecutor(
  backendStore: MemoryBackendStore,
  commands: NoteCommand[],
  fallbackId: EntityId,
): CommandExecutor<NoteCommand> {
  return {
    async execute(executedCommands) {
      commands.push(...executedCommands)
      const updateTargets: WorkspaceUpdateTarget[] = []
      for (const command of executedCommands) {
        if (command.type === 'note.delete') {
          if (command.entityId !== undefined) {
            backendStore.deleteEntity({ entityType: 'note', entityId: command.entityId })
            updateTargets.push(noteProjectionDeleteTarget(command.entityId, { backendHash: 'note-deleted' }))
          }
          continue
        }
        if (!command.target) continue
        const canonical: NoteEntity = {
          id: command.target.id ?? command.entityId ?? fallbackId,
          title: command.target.title,
          body: command.target.body ?? undefined,
        }
        backendStore.setEntity({
          entityType: 'note',
          entityId: canonical.id,
          hash: 'note-v2',
          value: canonical,
        })
        updateTargets.push(noteProjectionUpdateTarget(canonical, { backendHash: 'note-v2' }))
      }
      return { updateTargets }
    },
  }
}

function serializeNoteProjection(value: NoteProjection): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function pruneUndefined<T extends object>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output as T
}
