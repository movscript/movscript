import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  type ProgramManifest,
} from '@movscript/runtime-contracts'

export const desktopShellProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'desktop-shell',
  serviceName: 'movscript.desktop.shell',
  kind: 'desktop-shell',
  name: 'MovScript Desktop Shell',
  profiles: ['desktop', 'test'],
  entry: {
    command: 'movscript-desktop',
  },
  transport: 'embedded',
  health: {
    kind: 'process',
  },
  provides: ['desktop-shell', 'desktop-surface-host', 'desktop-bridge', 'native-window', 'local-runtime-owner'],
} satisfies ProgramManifest

export default desktopShellProgramManifest
