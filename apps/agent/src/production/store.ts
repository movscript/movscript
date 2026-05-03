import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ProductionCandidate, ProductionRun } from './types.js'

interface ProductionStateFile {
  version: 1
  runs: ProductionRun[]
  candidates: ProductionCandidate[]
}

export interface ProductionStore {
  createRun(run: ProductionRun): void
  updateRun(run: ProductionRun): void
  listRuns(): ProductionRun[]
  getRun(id: string): ProductionRun | undefined
  createCandidate(candidate: ProductionCandidate): void
  updateCandidate(candidate: ProductionCandidate): void
  listCandidates(): ProductionCandidate[]
  getCandidate(id: string): ProductionCandidate | undefined
}

export class InMemoryProductionStore implements ProductionStore {
  private readonly runs = new Map<string, ProductionRun>()
  private readonly candidates = new Map<string, ProductionCandidate>()

  createRun(run: ProductionRun): void {
    this.runs.set(run.id, clone(run))
  }

  updateRun(run: ProductionRun): void {
    this.runs.set(run.id, clone(run))
    for (const candidate of run.candidates) {
      this.candidates.set(candidate.id, clone(candidate))
    }
  }

  listRuns(): ProductionRun[] {
    return Array.from(this.runs.values())
      .map((run) => clone(run))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  getRun(id: string): ProductionRun | undefined {
    const run = this.runs.get(id)
    return run ? clone(run) : undefined
  }

  createCandidate(candidate: ProductionCandidate): void {
    this.candidates.set(candidate.id, clone(candidate))
  }

  updateCandidate(candidate: ProductionCandidate): void {
    this.candidates.set(candidate.id, clone(candidate))
    const run = this.runs.get(candidate.sourceRunId)
    if (!run) return
    const nextRun: ProductionRun = {
      ...run,
      candidates: run.candidates.map((runCandidate) => (runCandidate.id === candidate.id ? clone(candidate) : runCandidate)),
    }
    this.runs.set(nextRun.id, clone(nextRun))
  }

  listCandidates(): ProductionCandidate[] {
    return Array.from(this.candidates.values())
      .map((candidate) => clone(candidate))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  getCandidate(id: string): ProductionCandidate | undefined {
    const candidate = this.candidates.get(id)
    return candidate ? clone(candidate) : undefined
  }
}

export class FileProductionStore extends InMemoryProductionStore implements ProductionStore {
  readonly filePath: string

  constructor(filePath = resolveProductionStatePath()) {
    super()
    this.filePath = filePath
    this.load()
  }

  override createRun(run: ProductionRun): void {
    super.createRun(run)
    this.persist()
  }

  override updateRun(run: ProductionRun): void {
    super.updateRun(run)
    this.persist()
  }

  override createCandidate(candidate: ProductionCandidate): void {
    super.createCandidate(candidate)
    this.persist()
  }

  override updateCandidate(candidate: ProductionCandidate): void {
    super.updateCandidate(candidate)
    this.persist()
  }

  private load(): void {
    if (!existsSync(this.filePath)) return
    const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<ProductionStateFile>
    for (const run of parsed.runs ?? []) {
      super.createRun(normalizeRun(run))
    }
    for (const candidate of parsed.candidates ?? []) {
      super.createCandidate(normalizeCandidate(candidate))
    }
  }

  private persist(): void {
    const state: ProductionStateFile = {
      version: 1,
      runs: this.listRuns(),
      candidates: this.listCandidates(),
    }
    atomicWriteJSON(this.filePath, state)
  }
}

export function resolveProductionStatePath(): string {
  if (process.env.MOVSCRIPT_PRODUCTION_STATE_PATH) return process.env.MOVSCRIPT_PRODUCTION_STATE_PATH
  return join(process.cwd(), '.movscript-agent', 'production-state.json')
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function atomicWriteJSON(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, filePath)
}

function normalizeRun(run: ProductionRun): ProductionRun {
  return {
    ...run,
    steps: Array.isArray(run.steps) ? run.steps : [],
    candidates: Array.isArray(run.candidates) ? run.candidates : [],
    warnings: Array.isArray(run.warnings) ? run.warnings : [],
  }
}

function normalizeCandidate(candidate: ProductionCandidate): ProductionCandidate {
  return {
    ...candidate,
    status: candidate.status ?? 'candidate',
    payload: candidate.payload ?? {},
    lifecycle: Array.isArray(candidate.lifecycle) ? candidate.lifecycle : [{
      type: 'created',
      at: candidate.createdAt,
    }],
  }
}
