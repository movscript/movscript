import {
  MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
  type ApplicationManifest,
} from '@movscript/runtime-contracts'

export const cloudApplicationManifest = {
  schema: MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
  applicationId: 'movscript.cloud',
  name: 'MovScript Cloud Deployment App',
  owner: 'cloud-orchestrator',
  programs: [
    'movscript.cloud.control',
  ],
} satisfies ApplicationManifest

export default cloudApplicationManifest
