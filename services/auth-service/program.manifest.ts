import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  type ProgramManifest,
} from '@movscript/runtime-contracts'

export const authServiceProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'auth-service',
  serviceName: 'movscript.auth.service',
  kind: 'service',
  name: 'MovScript Auth Service',
  profiles: ['cloud', 'test'],
  entry: {
    command: 'movscript-auth-service',
    args: ['serve'],
  },
  transport: 'http',
  health: {
    kind: 'http',
    target: '/health',
  },
  provides: ['auth-context', 'principal', 'opaque-access-key'],
} satisfies ProgramManifest

export default authServiceProgramManifest
