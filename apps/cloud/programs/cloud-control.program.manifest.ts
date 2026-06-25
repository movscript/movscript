import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  type ProgramManifest,
} from '@movscript/runtime-contracts'

export const cloudControlProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'cloud-control',
  serviceName: 'movscript.cloud.control',
  kind: 'cli',
  name: 'MovScript Cloud Control',
  profiles: ['cloud', 'test'],
  entry: {
    command: 'movscript-cloud',
  },
  transport: 'none',
  health: {
    kind: 'process',
  },
  provides: ['deployment-profile', 'ops-control', 'migration-control'],
} satisfies ProgramManifest

export default cloudControlProgramManifest
