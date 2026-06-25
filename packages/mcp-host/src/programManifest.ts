import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  type ProgramManifest,
} from '@movscript/runtime-contracts'

export const mcpHostProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'mcp-host',
  serviceName: 'movscript.mcp.host',
  kind: 'mcp-endpoint',
  name: 'MovScript MCP Host',
  profiles: ['desktop', 'plugin', 'cloud', 'test'],
  entry: {
    command: 'movscript-mcp-host',
    args: ['--stdio'],
  },
  transport: 'stdio',
  health: {
    kind: 'stdio_tool',
    target: 'movscript_runtime_status',
  },
  provides: ['mcp-tools', 'runtime-status', 'capability-gating'],
} satisfies ProgramManifest

export default mcpHostProgramManifest
