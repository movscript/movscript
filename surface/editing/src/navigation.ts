import type { EditingHostOpenProjectWindowInput } from './host-api'
import { readEditingHostApi } from './host-api'
import { editingProjectPath } from './routes'

export async function openEditingProjectWindow(input: EditingHostOpenProjectWindowInput): Promise<void> {
  const api = readEditingHostApi()
  if (api?.openEditingProjectWindow) {
    await api.openEditingProjectWindow(input)
    return
  }
  window.location.assign(input.route ?? editingProjectPath(input.editingProjectId))
}
