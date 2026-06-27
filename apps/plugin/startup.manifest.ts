import {
  MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  type ScenarioPolicyManifest,
} from '@movscript/runtime-contracts'

export const pluginDesktopCompatibilityStartupPolicy = {
  schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  scenarioId: 'plugin-desktop-compatible',
  applicationId: 'movscript.agent-plugin',
  programs: [
    { serviceName: 'movscript.plugin.agent-launcher', required: true },
    { serviceName: 'movscript.mcp.host', required: true, profile: 'stdio' },
    { serviceName: 'movscript.local-surface.host', required: true, profile: 'desktop-connected' },
  ],
} satisfies ScenarioPolicyManifest

export const pluginBasicStartupPolicy = {
  schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  scenarioId: 'plugin-basic',
  applicationId: 'movscript.agent-plugin',
  programs: [
    { serviceName: 'movscript.plugin.agent-launcher', required: true },
    { serviceName: 'movscript.mcp.host', required: true, profile: 'stdio' },
  ],
} satisfies ScenarioPolicyManifest

export const pluginFullLocalStartupPolicy = {
  schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  scenarioId: 'plugin-full-local',
  applicationId: 'movscript.agent-plugin',
  programs: [
    { serviceName: 'movscript.plugin.agent-launcher', required: true },
    { serviceName: 'movscript.mcp.host', required: true, profile: 'stdio' },
    { serviceName: 'movscript.local-node.control', required: false, profile: 'local-daemon' },
  ],
} satisfies ScenarioPolicyManifest

export const pluginStartupPolicies = [
  pluginDesktopCompatibilityStartupPolicy,
  pluginBasicStartupPolicy,
  pluginFullLocalStartupPolicy,
] satisfies ScenarioPolicyManifest[]

export default pluginStartupPolicies
