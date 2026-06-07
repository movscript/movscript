export function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
}

export function safeWorkspacePathToken(value: string | number): string {
  return String(value).trim().replace(/[^a-zA-Z0-9_-]+/g, '_')
}

