import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  type ProgramManifest,
} from '@movscript/runtime-contracts'

export const pluginAgentLauncherProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'plugin-agent-launcher',
  serviceName: 'movscript.plugin.agent-launcher',
  kind: 'cli',
  name: 'MovScript Agent Plugin Launcher',
  profiles: ['plugin', 'test'],
  entry: {
    command: './bin/movscript-agent-mcp',
  },
  transport: 'stdio',
  health: {
    kind: 'process',
  },
  dependsOn: ['movscript.mcp.host'],
  provides: ['agent-plugin-entrypoint'],
} satisfies ProgramManifest

export default pluginAgentLauncherProgramManifest
