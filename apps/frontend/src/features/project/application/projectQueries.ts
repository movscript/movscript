export function projectListQueryKey(orgId: number | null | undefined) {
  return ['projects', orgId ?? 'none'] as const
}

export function projectProgressQueryKey(orgId: number | null | undefined, projectId: number) {
  return ['progress', orgId ?? 'none', projectId] as const
}
