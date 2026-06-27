import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  type ProgramManifest,
} from '@movscript/runtime-contracts'

export const localNodeControlProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'local-node-control',
  serviceName: 'movscript.local-node.control',
  kind: 'service',
  name: 'MovScript Local Node Control',
  profiles: ['local', 'plugin-full-local', 'test'],
  transport: 'http',
  health: {
    kind: 'http',
    target: '/health',
  },
  provides: ['local-runtime-control'],
} satisfies ProgramManifest

export default localNodeControlProgramManifest
