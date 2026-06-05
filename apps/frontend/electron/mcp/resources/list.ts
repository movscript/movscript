import { getMCPContextSnapshot } from '../context/store'
import type { MCPResource } from '../types'

export function listResources(): MCPResource[] {
  const snapshot = getMCPContextSnapshot()
  const resources: MCPResource[] = [
    {
      uri: 'movscript://ui/current-route',
      name: 'Current route',
      description: 'Current MovScript route in the Electron renderer.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'movscript://ui/current-selection',
      name: 'Current selection',
      description: 'Current selected entity, when a page has reported one.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'movscript://project/current',
      name: 'Current project',
      description: 'Current MovScript project summary.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'movscript://projects',
      name: 'Projects',
      description: 'All visible MovScript projects.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'movscript://shot-library',
      name: 'Shot reference library',
      description: 'Searchable MovScript shot reference library for reusable camera, composition, movement, narrative, emotion, and production patterns.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'movscript://resource-library',
      name: 'MovScript resource library',
      description: 'Internal MovScript RawResource library. Use the movscript_resource_library_query tool for search and generation-ready resource IDs.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'movscript://resource-file/{resource_id}',
      name: 'MovScript resource file',
      description: 'Dynamic binary RawResource reader. Replace {resource_id} with an ID, for example movscript://resource-file/42?maxBytes=8388608. Use image/video media tools for Codex vision workflows.',
      mimeType: 'application/octet-stream',
    },
    {
      uri: 'movscript://external-resources',
      name: 'External media search sources',
      description: 'Configured external image/video providers. Use movscript_external_resource_search for provider search; import results before generation.',
      mimeType: 'text/markdown',
    },
  ]

  if (snapshot.project) {
    const id = snapshot.project.id
    resources.push(
      resource(`movscript://project/${id}/summary`, 'Project summary'),
      resource(`movscript://project/${id}/scripts`, 'Scripts'),
      resource(`movscript://project/${id}/creative-references`, 'Creative references'),
      resource(`movscript://project/${id}/assets`, 'Assets'),
      resource(`movscript://project/${id}/episodes`, 'Episodes'),
      resource(`movscript://project/${id}/scenes`, 'Scenes'),
      resource(`movscript://project/${id}/storyboards`, 'Storyboards'),
      resource(`movscript://project/${id}/shots`, 'Shots')
    )
  }

  return resources
}

function resource(uri: string, name: string): MCPResource {
  return { uri, name, mimeType: 'text/markdown' }
}
