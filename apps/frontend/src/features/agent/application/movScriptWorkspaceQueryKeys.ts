export const movScriptWorkspaceKeys = {
  root: ['movscript-workspace-root'] as const,
  filesScope: ['movscript-workspace-files'] as const,
  files: (path = '') => ['movscript-workspace-files', path] as const,
  file: (path: string | null | undefined) => ['movscript-workspace-file', path ?? null] as const,
  reviewFile: (path: string) => ['movscript-workspace-review-file', path] as const,
}
