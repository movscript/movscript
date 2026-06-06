export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject {
  [key: string]: JsonValue
}

export type ProjectionFileKind =
  | 'writable_projection'
  | 'generated_index'
  | 'materialized_view'

export type EntityId = string | number

export interface EntityRef {
  entityType: string
  entityId?: EntityId
}

export interface FileSyncState extends EntityRef {
  schema: string
  kind: ProjectionFileKind
  writable: boolean
  baseHash?: string
  baseBackendHash?: string
  localHash?: string
  backendHash?: string
}

export interface WorkspaceManifest {
  version: 1
  backendRevision?: string
  files: Record<string, FileSyncState>
}

export interface WorkspaceFileSystem {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  deleteFile?(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  listFiles(path: string): Promise<string[]>
}

export interface ManifestStore {
  load(): Promise<WorkspaceManifest>
  save(manifest: WorkspaceManifest): Promise<void>
}

export interface SnapshotStore {
  readBase(path: string): Promise<string | undefined>
  writeBase(path: string, content: string): Promise<void>
  deleteBase?(path: string): Promise<void>
}

export interface BackendEntitySnapshot<TEntity = unknown> extends EntityRef {
  hash: string
  value: TEntity
}

export interface BackendStore {
  getEntity(ref: Required<EntityRef>): Promise<BackendEntitySnapshot | undefined>
}

export interface ValidationIssue {
  path?: string
  message: string
  severity: 'error' | 'warning'
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

export type JsonPatchOperation =
  | { op: 'add'; path: string; value: JsonValue }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: JsonValue }

export type ProjectionAction = 'create' | 'update' | 'delete'

export interface ProjectionCommandInput<TFile = unknown> {
  action: ProjectionAction
  filePath: string
  entity: EntityRef
  base?: TFile
  local?: TFile
  remote?: TFile
  target?: TFile
  patch: JsonPatchOperation[]
}

export interface ProjectionCommandResult<TCommand = unknown> {
  commands: TCommand[]
  warnings?: ValidationIssue[]
}

export interface ProjectionAdapter<TFile = unknown, TEntity = unknown, TCommand = unknown> {
  schema: string
  entityType: string
  parseFile(content: string, context: ProjectionParseContext): TFile
  serializeFile?(value: TFile): string
  validateFile(value: TFile, context: ProjectionParseContext): ValidationResult
  toProjection(entity: TEntity, context: ProjectionAdapterContext): TFile
  merge?(
    base: TFile,
    local: TFile,
    remote: TFile,
    context: ProjectionAdapterContext,
  ): ProjectionMergeResult<TFile>
  createCommands(input: ProjectionCommandInput<TFile>): ProjectionCommandResult<TCommand>
}

export interface ProjectionParseContext {
  filePath: string
  manifestEntry?: FileSyncState
}

export interface ProjectionAdapterContext {
  filePath: string
  manifestEntry: FileSyncState
}

export interface ProjectionMergeConflict {
  path: string
  base: unknown
  local: unknown
  remote: unknown
  message: string
}

export type ProjectionMergeResult<T = unknown> =
  | { status: 'merged'; value: T; conflicts?: [] }
  | { status: 'conflict'; conflicts: ProjectionMergeConflict[]; partial?: T }

export type WorkspaceFileState =
  | 'clean'
  | 'modified'
  | 'remote_modified'
  | 'both_modified'
  | 'deleted'
  | 'remote_deleted'
  | 'added'
  | 'readonly_modified'
  | 'untracked'
  | 'missing_adapter'

export interface WorkspaceStatusFile {
  path: string
  state: WorkspaceFileState
  kind?: ProjectionFileKind
  schema?: string
  entityType?: string
  entityId?: EntityId
  localHash?: string
  baseHash?: string
  backendHash?: string
  baseBackendHash?: string
}

export interface WorkspaceStatus {
  rootPath: string
  files: WorkspaceStatusFile[]
}

export type ApplyOperationState =
  | 'planned'
  | 'noop'
  | 'blocked'
  | 'conflict'

export interface ApplyPlanOperation<TCommand = unknown> {
  state: ApplyOperationState
  action?: ProjectionAction
  filePath: string
  kind?: ProjectionFileKind
  schema?: string
  entityType?: string
  entityId?: EntityId
  manifestTracked?: boolean
  localHash?: string
  baseHash?: string
  backendHash?: string
  baseBackendHash?: string
  patch?: JsonPatchOperation[]
  commands: TCommand[]
  issues: ValidationIssue[]
  conflicts?: ProjectionMergeConflict[]
}

export interface ApplyReview<TCommand = unknown> {
  rootPath: string
  summary: {
    create: number
    update: number
    delete: number
    noop: number
    blocked: number
    conflicts: number
  }
  operations: ApplyPlanOperation<TCommand>[]
}

export interface ApplyReviewStore<TCommand = unknown> {
  load(path: string): Promise<ApplyReview<TCommand>>
  save(path: string, review: ApplyReview<TCommand>): Promise<void>
}

export interface WorkspaceUpdateTargetStore {
  load(path: string): Promise<WorkspaceUpdateTarget[]>
  save(path: string, targets: WorkspaceUpdateTarget[]): Promise<void>
}

export type WorkspaceUpdateMode = 'safe' | 'overwrite' | 'merge'

export interface WorkspaceUpdateOptions {
  mode?: WorkspaceUpdateMode
  backendRevision?: string
}

export interface WorkspaceUpdateTarget extends EntityRef {
  path: string
  schema: string
  kind: ProjectionFileKind
  operation?: 'upsert' | 'delete'
  writable?: boolean
  content?: string | unknown
  backendHash?: string
}

export type WorkspaceUpdateOperationState =
  | 'updated'
  | 'deleted'
  | 'noop'
  | 'blocked'
  | 'conflict'

export interface WorkspaceUpdateOperation {
  state: WorkspaceUpdateOperationState
  path: string
  kind: ProjectionFileKind
  schema: string
  entityType: string
  entityId?: EntityId
  mode: WorkspaceUpdateMode
  localHash?: string
  baseHash?: string
  backendHash?: string
  issues: ValidationIssue[]
  conflicts?: ProjectionMergeConflict[]
}

export interface WorkspaceUpdateResult {
  backendRevision?: string
  summary: {
    updated: number
    deleted: number
    noop: number
    blocked: number
    conflicts: number
  }
  operations: WorkspaceUpdateOperation[]
}

export interface CommandExecutionResult {
  updateTargets?: WorkspaceUpdateTarget[]
}

export interface CommandExecutor<TCommand = unknown> {
  execute(commands: TCommand[], context: ApplyExecutionContext): Promise<CommandExecutionResult | WorkspaceUpdateTarget[] | void>
}

export interface ApplyExecutionContext {
  operation: ApplyPlanOperation
}

export interface ApplyResult {
  appliedOperations: number
  appliedCommands: number
  refresh?: WorkspaceUpdateResult
}

export interface EditableProjectionWorkspaceOptions {
  fs: WorkspaceFileSystem
  manifestStore: ManifestStore
  snapshotStore: SnapshotStore
  backendStore: BackendStore
  registry: ProjectionRegistryLike
  ignorePaths?: string[]
}

export interface ProjectionRegistryLike {
  get(schema: string): ProjectionAdapter | undefined
  getByEntityType(entityType: string): ProjectionAdapter | undefined
}
