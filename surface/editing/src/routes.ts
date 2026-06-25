export function editingProjectPath(editingProjectId: string): string {
  return `/editing/${encodeURIComponent(editingProjectId)}${typeof window !== 'undefined' ? window.location.search || '' : ''}`
}
