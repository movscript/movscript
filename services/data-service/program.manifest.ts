import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  type ProgramManifest,
} from '@movscript/runtime-contracts'

export const dataServiceProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'data-service',
  serviceName: 'movscript.data.service',
  kind: 'service',
  name: 'MovScript Data Service',
  profiles: ['local', 'cloud', 'test'],
  entry: {
    command: 'movscript-data-service',
    args: ['serve'],
  },
  transport: 'http',
  health: {
    kind: 'http',
    target: '/health',
  },
  provides: ['resource-api', 'job-api', 'provider-api', 'model-gateway'],
} satisfies ProgramManifest

export default dataServiceProgramManifest
