import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseNpmPackJson(output) {
  const jsonStart = output.lastIndexOf('\n[')
  return JSON.parse(jsonStart === -1 ? output : output.slice(jsonStart + 1))
}

test('packed package installs into a consumer project and resolves public exports', () => {
  const packDestination = mkdtempSync(resolve(tmpdir(), 'editable-projections-pack-'))
  const npmCache = mkdtempSync(resolve(tmpdir(), 'editable-projections-npm-cache-'))
  const consumerRoot = mkdtempSync(resolve(tmpdir(), 'editable-projections-consumer-'))
  const output = execFileSync('npm', ['pack', '--pack-destination', packDestination, '--json'], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: npmCache,
    },
  })
  const [pack] = parseNpmPackJson(output)
  const tarballPath = isAbsolute(pack.filename)
    ? pack.filename
    : resolve(packDestination, pack.filename)

  writeFileSync(resolve(consumerRoot, 'package.json'), `${JSON.stringify({
    name: 'editable-projections-consumer-smoke',
    private: true,
    type: 'module',
  }, null, 2)}\n`)
  execFileSync('npm', [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
    tarballPath,
  ], {
    cwd: consumerRoot,
    stdio: 'pipe',
    env: {
      ...process.env,
      npm_config_cache: npmCache,
    },
  })

  const esmOutput = execFileSync('node', ['--input-type=module', '--eval', `
    import { assertEditableProjectionWorkflowToolAdapterContract, createEditableProjectionKit, createEditableProjectionWorkflowBridge, createEditableProjectionWorkflowOperationRouter, createEditableProjectionWorkflowOperationToolDefinitions, createEditableProjectionWorkflowToolAdapter, defaultEditableProjectionIgnorePaths, editableProjectionArtifactCompatibility, editableProjectionArtifactSchemas, editableProjectionArtifactVersions, editableProjectionWorkflowOperationJsonSchema, editableProjectionWorkflowOperationNames, editableProjectionWorkflowOperationSpecs, editableProjectionWorkflowOperationToolDefinitions, formatEditableProjectionArtifactCompatibilityMarkdown, formatEditableProjectionArtifactCompatibilityReportMarkdown, formatSerializedEditableProjectionErrorMarkdown, getEditableProjectionWorkflowOperationJsonSchema, getEditableProjectionWorkflowOperationNameForToolName, getEditableProjectionWorkflowOperationSpec, getEditableProjectionWorkflowOperationToolDefinition, isSerializedEditableProjectionError, mergeWorkspaceIgnorePaths, normalizeSerializedEditableProjectionError, parseApplyResultJson, parseEditableProjectionArtifactCompatibilityJson, parseEditableProjectionBridgeResultJson, parseEditableProjectionWorkflowOperationJson, parseSerializedEditableProjectionErrorJson, parseWorkspaceStatusJson, parseWorkspaceUpdateResultJson, runEditableProjectionBridgeOperation, runEditableProjectionWorkflowOperation, runEditableProjectionWorkflowOperationJson, runEditableProjectionWorkflowToolCall, runEditableProjectionWorkflowToolCallJson, serializeApplyResultJson, serializeEditableProjectionArtifactCompatibilityJson, serializeEditableProjectionBridgeResultJson, serializeEditableProjectionErrorJson, serializeEditableProjectionWorkflowOperationJson, serializeWorkspaceStatusJson, serializeWorkspaceUpdateResultJson, validateApplyResult, validateEditableProjectionWorkflowOperation, validateWorkflowToolAdapterContractOptions, validateWorkspaceStatus, validateWorkspaceUpdateResult, verifyEditableProjectionArtifactCompatibility, verifyEditableProjectionWorkflowToolAdapterContract } from '@movscript/editable-projections'
    import { createNodeEditableProjectionKit } from '@movscript/editable-projections/node'
    import { MemoryBackendStore, assertProjectionAdapterContract, createEditableProjectionMemoryTestHarness, formatEditableProjectionIntegrationContractMarkdown, parseEditableProjectionIntegrationContractReportJson, runEditableProjectionIntegrationContractGate, runEditableProjectionMemoryIntegrationContractGate, serializeEditableProjectionIntegrationContractReportJson } from '@movscript/editable-projections/testing'
    import { runNoteProjectionExample, runNoteProjectionIntegrationContractExample, runNoteProjectionToolAdapterExample } from '@movscript/editable-projections/examples/note'
    import { movscriptAssetSlotPath, movscriptCreativeReferencePath, movscriptProjectAdapters, movscriptProjectRelativeAssetSlotPath } from '@movscript/editable-projections/examples/movscript-asset-slot'
    import { createMovScriptProjectEditableProjectionKit } from '@movscript/editable-projections/examples/movscript-project'
    import packageJson from '@movscript/editable-projections/package.json' with { type: 'json' }

    const result = await runNoteProjectionExample()
    const integrationContractResult = await runNoteProjectionIntegrationContractExample()
    const toolAdapterResult = await runNoteProjectionToolAdapterExample()
    if (typeof createEditableProjectionKit !== 'function') throw new Error('root ESM export missing')
    if (typeof assertEditableProjectionWorkflowToolAdapterContract !== 'function') throw new Error('workflow tool adapter contract ESM export failed')
    if (typeof verifyEditableProjectionWorkflowToolAdapterContract !== 'function') throw new Error('workflow tool adapter contract verifier ESM export failed')
    if (typeof validateWorkflowToolAdapterContractOptions !== 'function') throw new Error('workflow tool adapter contract validator ESM export failed')
    if (!integrationContractResult.gate.ok) throw new Error('note integration contract example ESM export failed')
    if (!toolAdapterResult.apply.ok) throw new Error('note tool adapter example ESM export failed')
    if (!mergeWorkspaceIgnorePaths(defaultEditableProjectionIgnorePaths, ['custom/cache']).includes('custom/cache')) throw new Error('ignore helper ESM export failed')
    if (editableProjectionArtifactCompatibility.packageName !== '@movscript/editable-projections') throw new Error('artifact compatibility ESM export failed')
    if (editableProjectionArtifactSchemas.applyReview !== 'editable-projections.apply-review.v1') throw new Error('artifact schemas ESM export failed')
    if (editableProjectionArtifactSchemas.workspaceStatus !== 'editable-projections.workspace-status.v1') throw new Error('status artifact schema ESM export failed')
    if (editableProjectionArtifactSchemas.workspaceUpdateResult !== 'editable-projections.workspace-update-result.v1') throw new Error('update result artifact schema ESM export failed')
    if (editableProjectionArtifactSchemas.applyResult !== 'editable-projections.apply-result.v1') throw new Error('apply result artifact schema ESM export failed')
    if (editableProjectionArtifactSchemas.bridgeResult !== 'editable-projections.bridge-result.v1') throw new Error('bridge artifact schema ESM export failed')
    if (editableProjectionArtifactSchemas.workflowOperation !== 'editable-projections.workflow-operation.v1') throw new Error('workflow operation artifact schema ESM export failed')
    if (editableProjectionArtifactVersions.workspaceManifest !== 1) throw new Error('artifact versions ESM export failed')
    if (editableProjectionArtifactVersions.workspaceStatus !== 1) throw new Error('status artifact version ESM export failed')
    if (!formatEditableProjectionArtifactCompatibilityMarkdown().includes('Artifact Schemas')) throw new Error('artifact compatibility formatter ESM export failed')
    if (parseEditableProjectionArtifactCompatibilityJson(serializeEditableProjectionArtifactCompatibilityJson()).packageName !== '@movscript/editable-projections') throw new Error('artifact compatibility JSON ESM export failed')
    if (parseWorkspaceStatusJson(serializeWorkspaceStatusJson(validateWorkspaceStatus({ rootPath: '.', files: [] }))).rootPath !== '.') throw new Error('workspace status JSON ESM export failed')
    if (parseWorkspaceUpdateResultJson(serializeWorkspaceUpdateResultJson(validateWorkspaceUpdateResult({ summary: { updated: 0, deleted: 0, noop: 0, blocked: 0, conflicts: 0 }, operations: [] }))).summary.updated !== 0) throw new Error('workspace update result JSON ESM export failed')
    if (parseApplyResultJson(serializeApplyResultJson(validateApplyResult({ appliedOperations: 0, appliedCommands: 0 }))).appliedCommands !== 0) throw new Error('apply result JSON ESM export failed')
    if (!verifyEditableProjectionArtifactCompatibility(editableProjectionArtifactCompatibility).ok) throw new Error('artifact compatibility verifier ESM export failed')
    if (!formatEditableProjectionArtifactCompatibilityReportMarkdown({ ok: true, issues: [] }).includes('Status: ok.')) throw new Error('artifact compatibility report formatter ESM export failed')
    if (!isSerializedEditableProjectionError({ name: 'Error', message: 'bad input' })) throw new Error('serialized error guard ESM export failed')
    if (!formatSerializedEditableProjectionErrorMarkdown({ name: 'Error', message: 'bad input' }).includes('Code: unclassified')) throw new Error('serialized error formatter ESM export failed')
    if (parseSerializedEditableProjectionErrorJson(serializeEditableProjectionErrorJson(new Error('bad input'))).name !== 'Error') throw new Error('serialized error JSON ESM export failed')
    if (normalizeSerializedEditableProjectionError({ name: 'Error', message: 'bad input' }).name !== 'Error') throw new Error('serialized error normalizer ESM export failed')
    const bridgeResult = await runEditableProjectionBridgeOperation(() => ({ markdown: 'ok', json: '{}\\n' }))
    if (!bridgeResult.ok) throw new Error('bridge operation ESM export failed')
    if (!parseEditableProjectionBridgeResultJson(serializeEditableProjectionBridgeResultJson(bridgeResult)).ok) throw new Error('bridge result JSON ESM export failed')
    if (typeof createEditableProjectionWorkflowBridge({ status() {} }).status !== 'function') throw new Error('workflow bridge ESM export failed')
    if (!editableProjectionWorkflowOperationNames.includes('status')) throw new Error('workflow operation names ESM export failed')
    if (!editableProjectionWorkflowOperationSpecs.some((spec) => spec.name === 'status')) throw new Error('workflow operation specs ESM export failed')
    if (!Array.isArray(editableProjectionWorkflowOperationJsonSchema.oneOf)) throw new Error('workflow operation JSON schema ESM export failed')
    if (getEditableProjectionWorkflowOperationJsonSchema('update').properties.targets.type !== 'array') throw new Error('workflow operation JSON schema getter ESM export failed')
    if (getEditableProjectionWorkflowOperationSpec('applyReview').executesCommands !== true) throw new Error('workflow operation spec getter ESM export failed')
    if (!editableProjectionWorkflowOperationToolDefinitions.some((tool) => tool.name === 'editable_projection_status')) throw new Error('workflow operation tool definitions ESM export failed')
    if (getEditableProjectionWorkflowOperationToolDefinition('reviewAndApply').executesCommands !== true) throw new Error('workflow operation tool definition getter ESM export failed')
    if (getEditableProjectionWorkflowOperationToolDefinition('update').inputSchema.required.includes('operation')) throw new Error('workflow operation tool input schema ESM export failed')
    if (getEditableProjectionWorkflowOperationToolDefinition('update').operationSchema.properties.operation.const !== 'update') throw new Error('workflow operation tool operation schema ESM export failed')
    if (getEditableProjectionWorkflowOperationNameForToolName('editable_projection_status') !== 'status') throw new Error('workflow operation tool name resolver ESM export failed')
    if (createEditableProjectionWorkflowOperationToolDefinitions({ namePrefix: 'workspace_' }).at(-1).name !== 'workspace_review_and_apply') throw new Error('workflow operation tool definitions factory ESM export failed')
    const operationWorkflow = {
      async status(path = '.') {
        const status = { rootPath: path, files: [] }
        return { status, markdown: 'ok', json: serializeWorkspaceStatusJson(status) }
      },
    }
    if (validateEditableProjectionWorkflowOperation({ operation: 'status' }).operation !== 'status') throw new Error('workflow operation validator ESM export failed')
    if (parseEditableProjectionWorkflowOperationJson(serializeEditableProjectionWorkflowOperationJson({ operation: 'status' })).operation !== 'status') throw new Error('workflow operation JSON ESM export failed')
    if (!(await createEditableProjectionWorkflowOperationRouter(operationWorkflow).run({ operation: 'status' })).ok) throw new Error('workflow operation router ESM export failed')
    if (!(await runEditableProjectionWorkflowOperation(operationWorkflow, { operation: 'status' })).ok) throw new Error('workflow operation runner ESM export failed')
    if (!(await runEditableProjectionWorkflowOperationJson(operationWorkflow, serializeEditableProjectionWorkflowOperationJson({ operation: 'status' }))).ok) throw new Error('workflow operation JSON runner ESM export failed')
    if (!(await runEditableProjectionWorkflowToolCall(operationWorkflow, 'editable_projection_status', {})).ok) throw new Error('workflow operation tool call ESM export failed')
    if (!(await runEditableProjectionWorkflowToolCallJson(operationWorkflow, 'editable_projection_status', '{}')).ok) throw new Error('workflow operation tool call JSON ESM export failed')
    if (!(await createEditableProjectionWorkflowToolAdapter(operationWorkflow).run('editable_projection_status', {})).ok) throw new Error('workflow tool adapter ESM export failed')
    if (typeof createNodeEditableProjectionKit !== 'function') throw new Error('node ESM export missing')
    if (typeof MemoryBackendStore !== 'function') throw new Error('testing ESM export missing')
    if (typeof assertProjectionAdapterContract !== 'function') throw new Error('testing contract ESM export missing')
    if (typeof createEditableProjectionMemoryTestHarness !== 'function') throw new Error('testing harness ESM export missing')
    if (!formatEditableProjectionIntegrationContractMarkdown({ ok: true, issues: [] }).includes('Status: ok.')) throw new Error('testing formatter ESM export missing')
    if (!parseEditableProjectionIntegrationContractReportJson(serializeEditableProjectionIntegrationContractReportJson({ ok: true, issues: [] })).ok) throw new Error('testing report JSON ESM export missing')
    if (typeof runEditableProjectionIntegrationContractGate !== 'function') throw new Error('testing integration gate ESM export missing')
    if (typeof runEditableProjectionMemoryIntegrationContractGate !== 'function') throw new Error('testing memory integration gate ESM export missing')
    if (typeof createMovScriptProjectEditableProjectionKit !== 'function') throw new Error('movscript project ESM export missing')
    if (result.status.status.files[0]?.state !== 'clean') throw new Error('note example did not finish clean')
    if (movscriptAssetSlotPath(1, 2) !== 'data/projects/1/assets/asset_slot_2.json') throw new Error('asset slot subpath failed')
    if (movscriptCreativeReferencePath(1, 8) !== 'data/projects/1/references/creative_reference_8.json') throw new Error('creative reference subpath failed')
    if (movscriptProjectAdapters.length !== 2) throw new Error('project adapters subpath failed')
    if (movscriptProjectRelativeAssetSlotPath(2) !== 'assets/asset_slot_2.json') throw new Error('project relative asset slot subpath failed')
    if (packageJson.name !== '@movscript/editable-projections') throw new Error('package.json subpath failed')
    console.log('esm ok')
  `], {
    cwd: consumerRoot,
    encoding: 'utf8',
  })
  assert.match(esmOutput, /esm ok/)

  writeFileSync(resolve(consumerRoot, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      resolveJsonModule: true,
      skipLibCheck: false,
    },
    include: ['consumer.ts'],
  }, null, 2)}\n`)
  writeFileSync(resolve(consumerRoot, 'consumer.ts'), `
    import {
      assertEditableProjectionWorkflowToolAdapterContract,
      createEditableProjectionKit,
      createEditableProjectionWorkflowBridge,
      createEditableProjectionWorkflowOperationRouter,
      createEditableProjectionWorkflowOperationToolDefinitions,
      createEditableProjectionWorkflowToolAdapter,
      createJsonProjectionAdapter,
      createWritableProjectionUpdateTarget,
      defaultEditableProjectionIgnorePaths,
      editableProjectionArtifactCompatibility,
      editableProjectionArtifactSchemas,
      editableProjectionArtifactVersions,
      editableProjectionWorkflowOperationJsonSchema,
      editableProjectionWorkflowOperationNames,
      editableProjectionWorkflowOperationSpecs,
      editableProjectionWorkflowOperationToolDefinitions,
      formatEditableProjectionArtifactCompatibilityMarkdown,
      formatEditableProjectionArtifactCompatibilityReportMarkdown,
      formatSerializedEditableProjectionErrorMarkdown,
      getEditableProjectionWorkflowOperationJsonSchema,
      getEditableProjectionWorkflowOperationNameForToolName,
      getEditableProjectionWorkflowOperationSpec,
      getEditableProjectionWorkflowOperationToolDefinition,
      isSerializedEditableProjectionError,
      normalizeSerializedEditableProjectionError,
      parseApplyResultJson,
      parseEditableProjectionArtifactCompatibilityJson,
      parseEditableProjectionBridgeResultJson,
      parseEditableProjectionWorkflowOperationJson,
      parseSerializedEditableProjectionErrorJson,
      parseWorkspaceStatusJson,
      parseWorkspaceUpdateResultJson,
      runEditableProjectionBridgeOperation,
      runEditableProjectionWorkflowOperation,
      runEditableProjectionWorkflowOperationJson,
      runEditableProjectionWorkflowToolCall,
      runEditableProjectionWorkflowToolCallJson,
      mergeWorkspaceIgnorePaths,
      serializeEditableProjectionArtifactCompatibilityJson,
      serializeEditableProjectionBridgeResultJson,
      serializeEditableProjectionErrorJson,
      serializeEditableProjectionWorkflowOperationJson,
      serializeApplyResultJson,
      serializeWorkspaceStatusJson,
      serializeWorkspaceUpdateResultJson,
      validateEditableProjectionArtifactCompatibility,
      validateEditableProjectionWorkflowOperation,
      validateWorkflowToolAdapterContractOptions,
      validateApplyResult,
      validateWorkspaceStatus,
      validateWorkspaceUpdateResult,
      verifyEditableProjectionArtifactCompatibility,
      verifyEditableProjectionWorkflowToolAdapterContract,
      type BackendStore,
      type EditableProjectionArtifactCompatibility,
      type EditableProjectionArtifactCompatibilityReport,
      type EditableProjectionArtifactKind,
      type EditableProjectionBridgeResult,
      type EditableProjectionBridgeResultJson,
      type EditableProjectionWorkflowBridge,
      type EditableProjectionWorkflowOperation,
      type EditableProjectionWorkflowOperationJsonSchema,
      type EditableProjectionWorkflowOperationSpec,
      type EditableProjectionWorkflowOperationResult,
      type EditableProjectionWorkflowOperationRouter,
      type EditableProjectionWorkflowOperationToolDefinition,
      type EditableProjectionWorkflowToolAdapter,
      type JsonObject,
      type ApplyResult,
      type WorkflowBridgeApplyOptions,
      type ProjectionCommandInput,
      type WorkspaceStatus,
      type WorkspaceUpdateResult,
      type WorkspaceUpdateTarget,
    } from '@movscript/editable-projections'
    import {
      createNodeEditableProjectionKit,
      type NodeEditableProjectionKit,
    } from '@movscript/editable-projections/node'
    import {
      MemoryBackendStore,
      createEditableProjectionMemoryTestHarness,
      formatEditableProjectionIntegrationContractMarkdown,
      parseEditableProjectionIntegrationContractReportJson,
      runEditableProjectionIntegrationContractGate,
      runEditableProjectionMemoryIntegrationContractGate,
      serializeEditableProjectionIntegrationContractReportJson,
      type EditableProjectionMemoryTestHarness,
      type EditableProjectionMemoryIntegrationContractGateResult,
      type EditableProjectionIntegrationContractGateResult,
    } from '@movscript/editable-projections/testing'
    import {
      noteProjectionPath,
      runNoteProjectionExample,
      runNoteProjectionIntegrationContractExample,
      runNoteProjectionToolAdapterExample,
      type NoteProjectionExampleResult,
      type NoteProjectionIntegrationContractExampleResult,
      type NoteProjectionToolAdapterExampleResult,
    } from '@movscript/editable-projections/examples/note'
    import {
      movscriptAssetSlotPath,
      movscriptCreativeReferencePath,
      movscriptProjectAdapters,
      movscriptProjectRelativeAssetSlotPath,
    } from '@movscript/editable-projections/examples/movscript-asset-slot'
    import {
      createMovScriptProjectEditableProjectionKit,
      createMovScriptProjectNodeProjectionKit,
    } from '@movscript/editable-projections/examples/movscript-project'
    import packageJson from '@movscript/editable-projections/package.json' with { type: 'json' }

    interface NoteProjection extends JsonObject {
      schema: 'smoke.note.v1'
      id: number | null
      title: string
    }

    interface NoteEntity {
      id: number
      title: string
    }

    interface NoteCommand {
      type: 'note.create' | 'note.update' | 'note.delete'
      entityId?: string | number
      target?: NoteProjection
    }

    const adapter = createJsonProjectionAdapter<NoteProjection, NoteEntity, NoteCommand>({
      schema: 'smoke.note.v1',
      entityType: 'note',
      toProjection(entity) {
        return {
          schema: 'smoke.note.v1',
          id: entity.id,
          title: entity.title,
        }
      },
      validate(value) {
        return typeof value.title === 'string' && value.title.length > 0
          ? []
          : [{ severity: 'error', path: '/title', message: 'Title is required.' }]
      },
      createCommands(input: ProjectionCommandInput<NoteProjection>): NoteCommand[] {
        return [{
          type: \`note.\${input.action}\`,
          ...(input.entity.entityId !== undefined ? { entityId: input.entity.entityId } : {}),
          ...(input.target !== undefined ? { target: input.target } : {}),
        }]
      },
    })

    const memoryBackendStore = new MemoryBackendStore([{
      entityType: 'note',
      entityId: 1,
      hash: 'note-v1',
      value: { id: 1, title: 'Draft' } satisfies NoteEntity,
    }])
    const backendStore: BackendStore = memoryBackendStore
    const kit = createEditableProjectionKit<NoteCommand>({
      adapters: [adapter],
      backendStore,
    })
    const workflowBridge: EditableProjectionWorkflowBridge<NoteCommand> = createEditableProjectionWorkflowBridge(kit.createMemoryWorkflow().workflow)
    const workflow = kit.createMemoryWorkflow().workflow
    const workflowOperationRouter: EditableProjectionWorkflowOperationRouter<NoteCommand> = createEditableProjectionWorkflowOperationRouter(workflow)
    const workflowToolAdapter: EditableProjectionWorkflowToolAdapter<NoteCommand> = createEditableProjectionWorkflowToolAdapter(workflow)
    const workflowOperationName: string = editableProjectionWorkflowOperationNames[0]
    const workflowOperationJsonSchema: EditableProjectionWorkflowOperationJsonSchema = editableProjectionWorkflowOperationJsonSchema
    const workflowOperationStatusJsonSchema: EditableProjectionWorkflowOperationJsonSchema = getEditableProjectionWorkflowOperationJsonSchema('status')
    const workflowOperationSpec: EditableProjectionWorkflowOperationSpec = getEditableProjectionWorkflowOperationSpec('status')
    const workflowOperationSpecCount: number = editableProjectionWorkflowOperationSpecs.length
    const workflowOperationToolDefinition: EditableProjectionWorkflowOperationToolDefinition = getEditableProjectionWorkflowOperationToolDefinition('status')
    const workflowOperationToolInputSchema: EditableProjectionWorkflowOperationJsonSchema = workflowOperationToolDefinition.inputSchema
    const workflowOperationToolOperationSchema: EditableProjectionWorkflowOperationJsonSchema = workflowOperationToolDefinition.operationSchema
    const workflowOperationToolDefinitionCount: number = editableProjectionWorkflowOperationToolDefinitions.length
    const customWorkflowOperationToolDefinitions: readonly EditableProjectionWorkflowOperationToolDefinition[] = createEditableProjectionWorkflowOperationToolDefinitions({
      namePrefix: 'workspace_',
    })
    const workflowOperationNameFromTool: string | undefined = getEditableProjectionWorkflowOperationNameForToolName('editable_projection_status')
    const workflowOperation: EditableProjectionWorkflowOperation<NoteCommand> = validateEditableProjectionWorkflowOperation({ operation: 'status' })
    const serializedWorkflowOperation: string = serializeEditableProjectionWorkflowOperationJson(workflowOperation)
    const parsedWorkflowOperation: EditableProjectionWorkflowOperation<NoteCommand> = parseEditableProjectionWorkflowOperationJson(serializedWorkflowOperation)
    const workflowBridgeApplyOptions: WorkflowBridgeApplyOptions<NoteCommand> = { allowConflicts: true }
    const nodeKitFactory: typeof createNodeEditableProjectionKit = createNodeEditableProjectionKit
    const nodeKitType: NodeEditableProjectionKit<NoteCommand> | undefined = undefined
    const harness: EditableProjectionMemoryTestHarness<NoteCommand> = createEditableProjectionMemoryTestHarness({
      adapters: [adapter],
      backendStore: memoryBackendStore,
    })
    const target: WorkspaceUpdateTarget = createWritableProjectionUpdateTarget({
      adapter,
      entity: { id: 1, title: 'Draft' },
      entityId: 1,
      path: 'data/notes/note_1.json',
      backendHash: 'note-v1',
    })
    const notePath: string = noteProjectionPath(1)
    const assetSlotPath: string = movscriptAssetSlotPath(1, 2)
    const creativeReferencePath: string = movscriptCreativeReferencePath(1, 8)
    const projectAdapterCount: number = movscriptProjectAdapters.length
    const projectRelativeAssetSlotPath: string = movscriptProjectRelativeAssetSlotPath(2)
    const projectKitFactory: typeof createMovScriptProjectEditableProjectionKit = createMovScriptProjectEditableProjectionKit
    const projectNodeKitFactory: typeof createMovScriptProjectNodeProjectionKit = createMovScriptProjectNodeProjectionKit
    const packageName: string = packageJson.name
    const artifactKind: EditableProjectionArtifactKind = 'workspaceUpdateTargets'
    const artifactCompatibility: EditableProjectionArtifactCompatibility = editableProjectionArtifactCompatibility
    const artifactSchema: string = editableProjectionArtifactSchemas.workspaceUpdateTargets
    const statusArtifactSchema: string = editableProjectionArtifactSchemas.workspaceStatus
    const artifactVersion: 1 = editableProjectionArtifactVersions.workspaceManifest
    const statusArtifactVersion: 1 = editableProjectionArtifactVersions.workspaceStatus
    const artifactMarkdown: string = formatEditableProjectionArtifactCompatibilityMarkdown()
    const serializedArtifactCompatibility: string = serializeEditableProjectionArtifactCompatibilityJson()
    const parsedArtifactCompatibility: EditableProjectionArtifactCompatibility = parseEditableProjectionArtifactCompatibilityJson(serializedArtifactCompatibility)
    const validatedArtifactCompatibility: EditableProjectionArtifactCompatibility = validateEditableProjectionArtifactCompatibility(parsedArtifactCompatibility)
    const artifactCompatibilityReport: EditableProjectionArtifactCompatibilityReport = verifyEditableProjectionArtifactCompatibility(parsedArtifactCompatibility)
    const artifactCompatibilityReportMarkdown: string = formatEditableProjectionArtifactCompatibilityReportMarkdown(artifactCompatibilityReport)
    const statusArtifact: WorkspaceStatus = validateWorkspaceStatus({ rootPath: '.', files: [] })
    const parsedStatusArtifact: WorkspaceStatus = parseWorkspaceStatusJson(serializeWorkspaceStatusJson(statusArtifact))
    const updateResultArtifact: WorkspaceUpdateResult = validateWorkspaceUpdateResult({ summary: { updated: 0, deleted: 0, noop: 0, blocked: 0, conflicts: 0 }, operations: [] })
    const parsedUpdateResultArtifact: WorkspaceUpdateResult = parseWorkspaceUpdateResultJson(serializeWorkspaceUpdateResultJson(updateResultArtifact))
    const applyResultArtifact: ApplyResult = validateApplyResult({ appliedOperations: 0, appliedCommands: 0 })
    const parsedApplyResultArtifact: ApplyResult = parseApplyResultJson(serializeApplyResultJson(applyResultArtifact))
    const serializedErrorIsValid: boolean = isSerializedEditableProjectionError({ name: 'Error', message: 'bad input' })
    const serializedErrorMarkdown: string = formatSerializedEditableProjectionErrorMarkdown({ name: 'Error', message: 'bad input' })
    const serializedErrorJson: string = serializeEditableProjectionErrorJson(new Error('bad input'))
    const parsedSerializedError = parseSerializedEditableProjectionErrorJson(serializedErrorJson)
    const normalizedSerializedError = normalizeSerializedEditableProjectionError(parsedSerializedError)
    const bridgeResultPromise: Promise<EditableProjectionBridgeResult<{ ok: boolean }>> = runEditableProjectionBridgeOperation(
      () => ({ ok: true }),
      {
        markdown: () => 'ok',
        json: (value) => \`\${JSON.stringify(value)}\\n\`,
      },
    )
    const bridgeTransport: EditableProjectionBridgeResultJson = parseEditableProjectionBridgeResultJson(
      serializeEditableProjectionBridgeResultJson({ ok: true, result: { ok: true }, markdown: 'ok' }),
    )
    const mergedIgnorePaths: string[] = mergeWorkspaceIgnorePaths(defaultEditableProjectionIgnorePaths, ['custom/cache'])
    const integrationMarkdown: string = formatEditableProjectionIntegrationContractMarkdown({ ok: true, issues: [] })
    const integrationReportOk: boolean = parseEditableProjectionIntegrationContractReportJson(
      serializeEditableProjectionIntegrationContractReportJson({ ok: true, issues: [] }),
    ).ok
    const integrationGateRunner: typeof runEditableProjectionIntegrationContractGate = runEditableProjectionIntegrationContractGate
    const integrationGateResult: EditableProjectionIntegrationContractGateResult<NoteCommand> | undefined = undefined
    const memoryIntegrationGateRunner: typeof runEditableProjectionMemoryIntegrationContractGate = runEditableProjectionMemoryIntegrationContractGate
    const memoryIntegrationGateResult: EditableProjectionMemoryIntegrationContractGateResult<NoteCommand> | undefined = undefined
    const example: Promise<NoteProjectionExampleResult> = runNoteProjectionExample()
    const integrationContractExample: Promise<NoteProjectionIntegrationContractExampleResult> = runNoteProjectionIntegrationContractExample()
    const toolAdapterExample: Promise<NoteProjectionToolAdapterExampleResult> = runNoteProjectionToolAdapterExample()
    const workflowOperationResult: Promise<EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<NoteCommand>>> = runEditableProjectionWorkflowOperation(workflow, workflowOperation)
    const workflowOperationJsonResult: Promise<EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<NoteCommand>>> = runEditableProjectionWorkflowOperationJson(workflow, serializedWorkflowOperation)
    const workflowToolCallResult: Promise<EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<NoteCommand>>> = runEditableProjectionWorkflowToolCall(workflow, 'editable_projection_status', {})
    const workflowToolCallJsonResult: Promise<EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<NoteCommand>>> = runEditableProjectionWorkflowToolCallJson(workflow, 'editable_projection_status', '{}')
    const workflowToolAdapterResult: Promise<EditableProjectionBridgeResult<EditableProjectionWorkflowOperationResult<NoteCommand>>> = workflowToolAdapter.run('editable_projection_status', {})
    const workflowToolAdapterContractIssues = validateWorkflowToolAdapterContractOptions({
      toolAdapter: workflowToolAdapter,
      fs: harness.fs,
      updateTarget: target,
      editFile(current: string) {
        return current
      },
    })
    const workflowToolAdapterContractReport = verifyEditableProjectionWorkflowToolAdapterContract<NoteCommand>({
      toolAdapter: workflowToolAdapter,
      fs: harness.fs,
      updateTarget: target,
      editFile(current: string) {
        return current
      },
    })
    const workflowToolAdapterContractAssertion = assertEditableProjectionWorkflowToolAdapterContract<NoteCommand>({
      toolAdapter: workflowToolAdapter,
      fs: harness.fs,
      updateTarget: target,
      editFile(current: string) {
        return current
      },
    })

    void kit
    void workflowBridge
    void workflowOperationRouter
    void workflowToolAdapter
    void workflowOperationName
    void workflowOperationJsonSchema
    void workflowOperationStatusJsonSchema
    void workflowOperationSpec
    void workflowOperationSpecCount
    void workflowOperationToolDefinition
    void workflowOperationToolInputSchema
    void workflowOperationToolOperationSchema
    void workflowOperationToolDefinitionCount
    void customWorkflowOperationToolDefinitions
    void workflowOperationNameFromTool
    void workflowOperation
    void serializedWorkflowOperation
    void parsedWorkflowOperation
    void workflowBridgeApplyOptions
    void workflowOperationResult
    void workflowOperationJsonResult
    void workflowToolCallResult
    void workflowToolCallJsonResult
    void workflowToolAdapterResult
    void workflowToolAdapterContractIssues
    void workflowToolAdapterContractReport
    void workflowToolAdapterContractAssertion
    void nodeKitFactory
    void nodeKitType
    void harness
    void target
    void notePath
    void assetSlotPath
    void creativeReferencePath
    void projectAdapterCount
    void projectRelativeAssetSlotPath
    void projectKitFactory
    void projectNodeKitFactory
    void packageName
    void artifactKind
    void artifactCompatibility
    void artifactSchema
    void statusArtifactSchema
    void artifactVersion
    void statusArtifactVersion
    void artifactMarkdown
    void serializedArtifactCompatibility
    void parsedArtifactCompatibility
    void validatedArtifactCompatibility
    void artifactCompatibilityReport
    void artifactCompatibilityReportMarkdown
    void statusArtifact
    void parsedStatusArtifact
    void updateResultArtifact
    void parsedUpdateResultArtifact
    void applyResultArtifact
    void parsedApplyResultArtifact
    void serializedErrorIsValid
    void serializedErrorMarkdown
    void serializedErrorJson
    void parsedSerializedError
    void normalizedSerializedError
    void bridgeResultPromise
    void bridgeTransport
    void mergedIgnorePaths
    void integrationMarkdown
    void integrationReportOk
    void integrationGateRunner
    void integrationGateResult
    void memoryIntegrationGateRunner
    void memoryIntegrationGateResult
    void example
    void integrationContractExample
    void toolAdapterExample
  `)
  execFileSync('node', [
    resolve(packageRoot, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '-p',
    consumerRoot,
  ], {
    cwd: consumerRoot,
    stdio: 'pipe',
  })

  const cjsOutput = execFileSync('node', ['--input-type=commonjs', '--eval', `
    const root = require('@movscript/editable-projections')
    const node = require('@movscript/editable-projections/node')
    const testing = require('@movscript/editable-projections/testing')
    const note = require('@movscript/editable-projections/examples/note')
    const assetSlot = require('@movscript/editable-projections/examples/movscript-asset-slot')
    const movscriptProject = require('@movscript/editable-projections/examples/movscript-project')
    const packageJson = require('@movscript/editable-projections/package.json')

    if (typeof root.createEditableProjectionKit !== 'function') throw new Error('root CJS export missing')
    if (!root.mergeWorkspaceIgnorePaths(root.defaultEditableProjectionIgnorePaths, ['custom/cache']).includes('custom/cache')) throw new Error('ignore helper CJS export failed')
    if (root.editableProjectionArtifactCompatibility.packageName !== '@movscript/editable-projections') throw new Error('artifact compatibility CJS export failed')
    if (root.editableProjectionArtifactSchemas.integrationContractReport !== 'editable-projections.integration-contract-report.v1') throw new Error('artifact schemas CJS export failed')
    if (root.editableProjectionArtifactSchemas.workspaceStatus !== 'editable-projections.workspace-status.v1') throw new Error('status artifact schemas CJS export failed')
    if (root.editableProjectionArtifactSchemas.workspaceUpdateResult !== 'editable-projections.workspace-update-result.v1') throw new Error('update result artifact schemas CJS export failed')
    if (root.editableProjectionArtifactSchemas.applyResult !== 'editable-projections.apply-result.v1') throw new Error('apply result artifact schemas CJS export failed')
    if (root.editableProjectionArtifactSchemas.bridgeResult !== 'editable-projections.bridge-result.v1') throw new Error('bridge artifact schemas CJS export failed')
    if (root.editableProjectionArtifactSchemas.workflowOperation !== 'editable-projections.workflow-operation.v1') throw new Error('workflow operation artifact schemas CJS export failed')
    if (root.editableProjectionArtifactVersions.workspaceUpdateTargets !== 1) throw new Error('artifact versions CJS export failed')
    if (root.editableProjectionArtifactVersions.workspaceStatus !== 1) throw new Error('status artifact versions CJS export failed')
    if (!root.formatEditableProjectionArtifactCompatibilityMarkdown().includes('Artifact Versions')) throw new Error('artifact compatibility formatter CJS export failed')
    if (root.parseEditableProjectionArtifactCompatibilityJson(root.serializeEditableProjectionArtifactCompatibilityJson()).packageName !== '@movscript/editable-projections') throw new Error('artifact compatibility JSON CJS export failed')
    if (root.parseWorkspaceStatusJson(root.serializeWorkspaceStatusJson(root.validateWorkspaceStatus({ rootPath: '.', files: [] }))).rootPath !== '.') throw new Error('workspace status JSON CJS export failed')
    if (root.parseWorkspaceUpdateResultJson(root.serializeWorkspaceUpdateResultJson(root.validateWorkspaceUpdateResult({ summary: { updated: 0, deleted: 0, noop: 0, blocked: 0, conflicts: 0 }, operations: [] }))).summary.updated !== 0) throw new Error('workspace update result JSON CJS export failed')
    if (root.parseApplyResultJson(root.serializeApplyResultJson(root.validateApplyResult({ appliedOperations: 0, appliedCommands: 0 }))).appliedOperations !== 0) throw new Error('apply result JSON CJS export failed')
    if (!root.verifyEditableProjectionArtifactCompatibility(root.editableProjectionArtifactCompatibility).ok) throw new Error('artifact compatibility verifier CJS export failed')
    if (!root.formatEditableProjectionArtifactCompatibilityReportMarkdown({ ok: true, issues: [] }).includes('Status: ok.')) throw new Error('artifact compatibility report formatter CJS export failed')
    if (!root.isSerializedEditableProjectionError({ name: 'Error', message: 'bad input' })) throw new Error('serialized error guard CJS export failed')
    if (!root.formatSerializedEditableProjectionErrorMarkdown({ name: 'Error', message: 'bad input' }).includes('Code: unclassified')) throw new Error('serialized error formatter CJS export failed')
    if (root.parseSerializedEditableProjectionErrorJson(root.serializeEditableProjectionErrorJson(new Error('bad input'))).name !== 'Error') throw new Error('serialized error JSON CJS export failed')
    if (root.normalizeSerializedEditableProjectionError({ name: 'Error', message: 'bad input' }).name !== 'Error') throw new Error('serialized error normalizer CJS export failed')
    if (!root.createEditableProjectionBridgeSuccess({ markdown: 'ok' }).ok) throw new Error('bridge success CJS export failed')
    if (root.createEditableProjectionBridgeFailure(new Error('bad input')).ok) throw new Error('bridge failure CJS export failed')
    if (!root.parseEditableProjectionBridgeResultJson(root.serializeEditableProjectionBridgeResultJson(root.createEditableProjectionBridgeSuccess({ markdown: 'ok' }))).ok) throw new Error('bridge result JSON CJS export failed')
    if (typeof root.assertEditableProjectionWorkflowToolAdapterContract !== 'function') throw new Error('workflow tool adapter contract CJS export failed')
    if (typeof root.verifyEditableProjectionWorkflowToolAdapterContract !== 'function') throw new Error('workflow tool adapter contract verifier CJS export failed')
    if (typeof root.validateWorkflowToolAdapterContractOptions !== 'function') throw new Error('workflow tool adapter contract validator CJS export failed')
    if (typeof root.createEditableProjectionWorkflowBridge({ status() {} }).status !== 'function') throw new Error('workflow bridge CJS export failed')
    if (!root.editableProjectionWorkflowOperationNames.includes('status')) throw new Error('workflow operation names CJS export failed')
    if (!root.editableProjectionWorkflowOperationSpecs.some((spec) => spec.name === 'status')) throw new Error('workflow operation specs CJS export failed')
    if (!Array.isArray(root.editableProjectionWorkflowOperationJsonSchema.oneOf)) throw new Error('workflow operation JSON schema CJS export failed')
    if (root.getEditableProjectionWorkflowOperationJsonSchema('update').properties.targets.type !== 'array') throw new Error('workflow operation JSON schema getter CJS export failed')
    if (root.getEditableProjectionWorkflowOperationSpec('applyReview').executesCommands !== true) throw new Error('workflow operation spec getter CJS export failed')
    if (!root.editableProjectionWorkflowOperationToolDefinitions.some((tool) => tool.name === 'editable_projection_status')) throw new Error('workflow operation tool definitions CJS export failed')
    if (root.getEditableProjectionWorkflowOperationToolDefinition('reviewAndApply').executesCommands !== true) throw new Error('workflow operation tool definition getter CJS export failed')
    if (root.getEditableProjectionWorkflowOperationToolDefinition('update').inputSchema.required.includes('operation')) throw new Error('workflow operation tool input schema CJS export failed')
    if (root.getEditableProjectionWorkflowOperationToolDefinition('update').operationSchema.properties.operation.const !== 'update') throw new Error('workflow operation tool operation schema CJS export failed')
    if (root.getEditableProjectionWorkflowOperationNameForToolName('editable_projection_status') !== 'status') throw new Error('workflow operation tool name resolver CJS export failed')
    if (root.createEditableProjectionWorkflowOperationToolDefinitions({ namePrefix: 'workspace_' }).at(-1).name !== 'workspace_review_and_apply') throw new Error('workflow operation tool definitions factory CJS export failed')
    const operationWorkflow = {
      async status(path = '.') {
        const status = { rootPath: path, files: [] }
        return { status, markdown: 'ok', json: root.serializeWorkspaceStatusJson(status) }
      },
    }
    if (root.validateEditableProjectionWorkflowOperation({ operation: 'status' }).operation !== 'status') throw new Error('workflow operation validator CJS export failed')
    if (root.parseEditableProjectionWorkflowOperationJson(root.serializeEditableProjectionWorkflowOperationJson({ operation: 'status' })).operation !== 'status') throw new Error('workflow operation JSON CJS export failed')
    root.runEditableProjectionWorkflowOperationJson(operationWorkflow, root.serializeEditableProjectionWorkflowOperationJson({ operation: 'status' })).then((result) => {
      if (!result.ok) throw new Error('workflow operation JSON runner CJS export failed')
    })
    root.runEditableProjectionWorkflowToolCall(operationWorkflow, 'editable_projection_status', {}).then((result) => {
      if (!result.ok) throw new Error('workflow operation tool call CJS export failed')
    })
    root.runEditableProjectionWorkflowToolCallJson(operationWorkflow, 'editable_projection_status', '{}').then((result) => {
      if (!result.ok) throw new Error('workflow operation tool call JSON CJS export failed')
    })
    root.createEditableProjectionWorkflowToolAdapter(operationWorkflow).run('editable_projection_status', {}).then((result) => {
      if (!result.ok) throw new Error('workflow tool adapter CJS export failed')
    })
    root.createEditableProjectionWorkflowOperationRouter(operationWorkflow).run({ operation: 'status' }).then((result) => {
      if (!result.ok) throw new Error('workflow operation router CJS export failed')
    })
    if (typeof node.createNodeEditableProjectionKit !== 'function') throw new Error('node CJS export missing')
    if (typeof testing.MemoryBackendStore !== 'function') throw new Error('testing CJS export missing')
    if (typeof testing.assertProjectionAdapterContract !== 'function') throw new Error('testing contract CJS export missing')
    if (typeof testing.createEditableProjectionMemoryTestHarness !== 'function') throw new Error('testing harness CJS export missing')
    if (!testing.formatEditableProjectionIntegrationContractMarkdown({ ok: true, issues: [] }).includes('Status: ok.')) throw new Error('testing formatter CJS export missing')
    if (!testing.parseEditableProjectionIntegrationContractReportJson(testing.serializeEditableProjectionIntegrationContractReportJson({ ok: true, issues: [] })).ok) throw new Error('testing report JSON CJS export missing')
    if (typeof testing.runEditableProjectionIntegrationContractGate !== 'function') throw new Error('testing integration gate CJS export missing')
    if (typeof testing.runEditableProjectionMemoryIntegrationContractGate !== 'function') throw new Error('testing memory integration gate CJS export missing')
    if (typeof movscriptProject.createMovScriptProjectEditableProjectionKit !== 'function') throw new Error('movscript project CJS export missing')
    if (note.noteProjectionPath(1) !== 'data/notes/note_1.json') throw new Error('note CJS subpath failed')
    note.runNoteProjectionIntegrationContractExample().then((result) => {
      if (!result.gate.ok) throw new Error('note integration contract example CJS subpath failed')
    })
    note.runNoteProjectionToolAdapterExample().then((result) => {
      if (!result.apply.ok) throw new Error('note tool adapter example CJS subpath failed')
    })
    if (assetSlot.movscriptAssetSlotPath(1, 2) !== 'data/projects/1/assets/asset_slot_2.json') throw new Error('asset slot CJS subpath failed')
    if (assetSlot.movscriptCreativeReferencePath(1, 8) !== 'data/projects/1/references/creative_reference_8.json') throw new Error('creative reference CJS subpath failed')
    if (assetSlot.movscriptProjectAdapters.length !== 2) throw new Error('project adapters CJS subpath failed')
    if (assetSlot.movscriptProjectRelativeAssetSlotPath(2) !== 'assets/asset_slot_2.json') throw new Error('project relative asset slot CJS subpath failed')
    if (packageJson.name !== '@movscript/editable-projections') throw new Error('package.json CJS subpath failed')
    console.log('cjs ok')
  `], {
    cwd: consumerRoot,
    encoding: 'utf8',
  })
  assert.match(cjsOutput, /cjs ok/)
})
