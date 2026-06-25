import {
  type ApplicationManifest,
  type ProgramManifest,
  type RuntimeEndpointRecordInput,
  type RuntimeRecordStatus,
  type ScenarioPolicyManifest,
  type RuntimeServiceRecordInput,
  validateApplicationManifest,
  validateProgramManifest,
  validateScenarioPolicyManifest,
  writeRuntimeAppRecord,
  writeRuntimeEndpointRecord,
  writeRuntimeServiceRecord,
} from '@movscript/runtime-contracts'

export type ApplicationRunnerPhase = 'prepare' | 'configure' | 'start' | 'ready' | 'shutdown'
export type ApplicationRunnerState = 'idle' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'error'

export interface ProgramHealth {
  ready: boolean
  status?: RuntimeRecordStatus
  endpoint?: RuntimeEndpointRecordInput
  message?: string
}

export interface ProgramRuntime {
  pid?: number
  endpoint?: RuntimeEndpointRecordInput
  metadata?: Record<string, unknown>
}

export interface ProgramRunnerContext {
  homeDir: string
  application: ApplicationManifest
  program: ProgramManifest
  instanceId: string
  profile?: string
  signal: AbortSignal
  log: (message: string, metadata?: Record<string, unknown>) => void
}

export interface ProgramAdapter {
  manifest: ProgramManifest
  instanceId?: string
  profile?: string
  prepare?: (context: ProgramRunnerContext) => Promise<void> | void
  configure?: (context: ProgramRunnerContext) => Promise<void> | void
  start?: (context: ProgramRunnerContext) => Promise<ProgramRuntime | void> | ProgramRuntime | void
  health?: (context: ProgramRunnerContext, runtime: ProgramRuntime) => Promise<ProgramHealth> | ProgramHealth
  stop?: (context: ProgramRunnerContext, runtime: ProgramRuntime) => Promise<void> | void
}

export interface ApplicationRunnerOptions {
  homeDir: string
  application: ApplicationManifest
  programs?: ProgramAdapter[]
  profile?: string
  pid?: number
  log?: (message: string, metadata?: Record<string, unknown>) => void
  abortController?: AbortController
}

export interface ScenarioProgramAdapterResolutionOptions {
  application: ApplicationManifest
  scenario: ScenarioPolicyManifest
  programs: ProgramAdapter[]
}

export interface ScenarioApplicationRunnerOptions extends Omit<ApplicationRunnerOptions, 'programs'> {
  scenario: ScenarioPolicyManifest
  programs: ProgramAdapter[]
}

interface StartedProgram {
  adapter: ProgramAdapter
  context: ProgramRunnerContext
  runtime: ProgramRuntime
}

export class ApplicationRunner {
  readonly homeDir: string
  readonly application: ApplicationManifest
  readonly programs: ProgramAdapter[]
  readonly profile?: string
  readonly pid: number
  state: ApplicationRunnerState = 'idle'

  private readonly logFn: (message: string, metadata?: Record<string, unknown>) => void
  private readonly abortController: AbortController
  private readonly started: StartedProgram[] = []

  constructor(options: ApplicationRunnerOptions) {
    const appValidation = validateApplicationManifest(options.application)
    if (!appValidation.ok || !appValidation.manifest) {
      throw new Error(`Invalid application manifest:\n${appValidation.errors.join('\n')}`)
    }
    for (const program of options.programs ?? []) {
      const programValidation = validateProgramManifest(program.manifest)
      if (!programValidation.ok) {
        throw new Error(`Invalid program manifest for ${program.manifest?.programId ?? 'unknown'}:\n${programValidation.errors.join('\n')}`)
      }
    }
    this.homeDir = options.homeDir
    this.application = appValidation.manifest
    this.programs = options.programs ?? []
    this.profile = options.profile
    this.pid = options.pid ?? process.pid
    this.logFn = options.log ?? (() => undefined)
    this.abortController = options.abortController ?? new AbortController()
  }

  async start(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'stopped') {
      throw new Error(`ApplicationRunner cannot start from state ${this.state}`)
    }
    this.state = 'starting'
    this.writeApplicationRecord('starting', false)
    try {
      await this.runProgramPhase('prepare')
      await this.runProgramPhase('configure')
      for (const adapter of this.programs) {
        const context = this.createProgramContext(adapter)
        this.writeServiceRecord(context, 'starting', false, {})
        const runtime = await adapter.start?.(context) ?? {}
        const health = adapter.health
          ? await adapter.health(context, runtime)
          : { ready: true, status: 'ready' as RuntimeRecordStatus, endpoint: runtime.endpoint }
        const ready = health.ready
        const status = health.status ?? (ready ? 'ready' : 'error')
        const endpoint = health.endpoint ?? runtime.endpoint
        this.writeServiceRecord(context, status, ready, runtime, endpoint)
        if (endpoint && ready) writeRuntimeEndpointRecord(this.homeDir, normalizeEndpoint(endpoint, context, runtime))
        if (!ready) throw new Error(health.message || `${context.program.serviceName} did not become ready`)
        this.started.push({ adapter, context, runtime })
      }
      this.state = 'ready'
      this.writeApplicationRecord('ready', true)
    } catch (error) {
      this.state = 'error'
      this.writeApplicationRecord('error', false, { error: errorMessage(error) })
      await this.shutdownStarted('error')
      throw error
    }
  }

  async shutdown(): Promise<void> {
    if (this.state === 'stopping' || this.state === 'stopped') return
    this.state = 'stopping'
    this.writeApplicationRecord('stopping', false)
    await this.shutdownStarted('stopped')
    this.state = 'stopped'
    this.writeApplicationRecord('stopped', false)
  }

  private async runProgramPhase(phase: 'prepare' | 'configure'): Promise<void> {
    for (const adapter of this.programs) {
      const context = this.createProgramContext(adapter)
      if (phase === 'prepare') await adapter.prepare?.(context)
      else await adapter.configure?.(context)
    }
  }

  private async shutdownStarted(finalStatus: RuntimeRecordStatus): Promise<void> {
    const programs = [...this.started].reverse()
    this.started.length = 0
    for (const item of programs) {
      try {
        await item.adapter.stop?.(item.context, item.runtime)
        this.writeServiceRecord(item.context, finalStatus, false, item.runtime)
      } catch (error) {
        this.writeServiceRecord(item.context, 'error', false, item.runtime, item.runtime.endpoint, { error: errorMessage(error) })
      }
    }
  }

  private createProgramContext(adapter: ProgramAdapter): ProgramRunnerContext {
    const instanceId = adapter.instanceId ?? `${adapter.manifest.programId}-${this.pid}`
    return {
      homeDir: this.homeDir,
      application: this.application,
      program: adapter.manifest,
      instanceId,
      profile: adapter.profile ?? this.profile,
      signal: this.abortController.signal,
      log: (message, metadata) => this.log(message, {
        programId: adapter.manifest.programId,
        serviceName: adapter.manifest.serviceName,
        ...metadata,
      }),
    }
  }

  private writeApplicationRecord(status: RuntimeRecordStatus, ready: boolean, metadata?: Record<string, unknown>): void {
    writeRuntimeAppRecord(this.homeDir, {
      applicationId: this.application.applicationId,
      owner: this.application.owner,
      profile: this.profile,
      pid: this.pid,
      status,
      ready,
      metadata,
    })
  }

  private writeServiceRecord(
    context: ProgramRunnerContext,
    status: RuntimeRecordStatus,
    ready: boolean,
    runtime: ProgramRuntime,
    endpoint?: RuntimeEndpointRecordInput,
    metadata?: Record<string, unknown>,
  ): void {
    writeRuntimeServiceRecord(this.homeDir, {
      serviceName: context.program.serviceName,
      instanceId: context.instanceId,
      ownerApplicationId: this.application.applicationId,
      profile: context.profile,
      pid: runtime.pid,
      status,
      ready,
      endpoint: endpoint || runtime.endpoint ? normalizeEndpoint(endpoint ?? runtime.endpoint!, context, runtime) : undefined,
      metadata: {
        ...(runtime.metadata ?? {}),
        ...(metadata ?? {}),
      },
    } satisfies RuntimeServiceRecordInput)
  }

  private log(message: string, metadata?: Record<string, unknown>): void {
    this.logFn(message, metadata)
  }
}

export function createApplicationRunner(options: ApplicationRunnerOptions): ApplicationRunner {
  return new ApplicationRunner(options)
}

export function resolveScenarioProgramAdapters(options: ScenarioProgramAdapterResolutionOptions): ProgramAdapter[] {
  const appValidation = validateApplicationManifest(options.application)
  if (!appValidation.ok || !appValidation.manifest) {
    throw new Error(`Invalid application manifest:\n${appValidation.errors.join('\n')}`)
  }
  const scenarioValidation = validateScenarioPolicyManifest(options.scenario)
  if (!scenarioValidation.ok || !scenarioValidation.manifest) {
    throw new Error(`Invalid scenario policy manifest:\n${scenarioValidation.errors.join('\n')}`)
  }
  const application = appValidation.manifest
  const scenario = scenarioValidation.manifest
  if (scenario.applicationId !== application.applicationId) {
    throw new Error(`Scenario ${scenario.scenarioId} belongs to ${scenario.applicationId}, not ${application.applicationId}`)
  }

  const applicationPrograms = new Set(application.programs ?? [])
  const adaptersByServiceName = new Map(options.programs.map((adapter) => [adapter.manifest.serviceName, adapter]))
  const resolved: ProgramAdapter[] = []
  for (const policy of scenario.programs) {
    if (applicationPrograms.size > 0 && !applicationPrograms.has(policy.serviceName)) {
      throw new Error(`Scenario ${scenario.scenarioId} references ${policy.serviceName}, but the application manifest does not declare it`)
    }
    const adapter = adaptersByServiceName.get(policy.serviceName)
    if (!adapter) {
      if (policy.required !== false) {
        throw new Error(`Scenario ${scenario.scenarioId} requires ${policy.serviceName}, but no ProgramAdapter was provided`)
      }
      continue
    }
    resolved.push({
      ...adapter,
      profile: policy.profile ?? adapter.profile,
    })
  }
  return resolved
}

export function createScenarioApplicationRunner(options: ScenarioApplicationRunnerOptions): ApplicationRunner {
  return createApplicationRunner({
    ...options,
    profile: options.profile ?? options.scenario.scenarioId,
    programs: resolveScenarioProgramAdapters({
      application: options.application,
      scenario: options.scenario,
      programs: options.programs,
    }),
  })
}

function normalizeEndpoint(
  endpoint: RuntimeEndpointRecordInput,
  context: ProgramRunnerContext,
  runtime: ProgramRuntime,
): RuntimeEndpointRecordInput {
  return {
    ...endpoint,
    serviceName: endpoint.serviceName ?? context.program.serviceName,
    applicationId: endpoint.applicationId ?? context.application.applicationId,
    instanceId: endpoint.instanceId ?? context.instanceId,
    pid: endpoint.pid ?? runtime.pid,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
