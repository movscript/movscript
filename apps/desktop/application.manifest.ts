import {
  MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
  type ApplicationManifest,
} from '@movscript/runtime-contracts'

export const desktopApplicationManifest = {
  schema: MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
  applicationId: 'movscript.desktop',
  name: 'MovScript Desktop App',
  owner: 'electron',
  programs: [
    'movscript.desktop.shell',
  ],
} satisfies ApplicationManifest

export default desktopApplicationManifest
