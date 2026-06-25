import {
  MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
  type ApplicationManifest,
} from '@movscript/runtime-contracts'

export const pluginApplicationManifest = {
  schema: MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
  applicationId: 'movscript.agent-plugin',
  name: 'MovScript Agent Plugin App',
  owner: 'agent-provider',
  programs: [
    'movscript.plugin.agent-launcher',
    'movscript.mcp.host',
    'movscript.data.service',
    'movscript.canvas.service',
    'movscript.project.service',
    'movscript.editing.service',
    'movscript.local-surface.host',
    'movscript.media.pipeline',
  ],
} satisfies ApplicationManifest

export default pluginApplicationManifest
