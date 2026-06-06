import { DuplicateProjectionAdapterError } from './errors.js'
import type { ProjectionAdapter } from './types.js'

export class ProjectionRegistry {
  private readonly bySchema = new Map<string, ProjectionAdapter>()
  private readonly byEntityType = new Map<string, ProjectionAdapter>()

  register(adapter: ProjectionAdapter): this {
    const existingSchema = this.bySchema.get(adapter.schema)
    if (existingSchema && existingSchema !== adapter) {
      throw new DuplicateProjectionAdapterError(adapter.schema)
    }

    this.bySchema.set(adapter.schema, adapter)
    if (!this.byEntityType.has(adapter.entityType)) {
      this.byEntityType.set(adapter.entityType, adapter)
    }
    return this
  }

  get(schema: string): ProjectionAdapter | undefined {
    return this.bySchema.get(schema)
  }

  getByEntityType(entityType: string): ProjectionAdapter | undefined {
    return this.byEntityType.get(entityType)
  }
}

export function createProjectionRegistry(adapters: ProjectionAdapter[] = []): ProjectionRegistry {
  const registry = new ProjectionRegistry()
  for (const adapter of adapters) {
    registry.register(adapter)
  }
  return registry
}
