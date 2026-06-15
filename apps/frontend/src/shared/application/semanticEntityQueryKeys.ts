import type { SemanticEntityConfig } from '@/shared/infrastructure/api/semanticEntities'

export const semanticEntityKeys = {
  list: (kind: SemanticEntityConfig['kind'], projectId: number | undefined) => [kind, projectId] as const,
  inlineSettings: (projectId: number | undefined) => ['semantic-inline-editor', projectId, 'settings'] as const,
  inlineSettingStates: (projectId: number | undefined) => ['semantic-inline-editor', projectId, 'setting-states'] as const,
  inlineScriptBlocks: (projectId: number | undefined) => ['semantic-inline-editor', projectId, 'script-blocks'] as const,
  sourceLock: (projectId: number | undefined, kind: SemanticEntityConfig['kind'], recordId: unknown) => ['semantic-source-lock', projectId, kind, recordId] as const,
}
