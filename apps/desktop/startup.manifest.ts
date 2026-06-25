import {
  MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  type ScenarioPolicyManifest,
} from '@movscript/runtime-contracts'

export const desktopBootstrapStartupPolicy = {
  schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  scenarioId: 'desktop-bootstrap',
  applicationId: 'movscript.desktop',
  programs: [
    { serviceName: 'movscript.desktop.shell', required: true, profile: 'desktop' },
  ],
} satisfies ScenarioPolicyManifest

export const desktopCloudStartupPolicy = {
  schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  scenarioId: 'desktop-cloud',
  applicationId: 'movscript.desktop',
  programs: [
    { serviceName: 'movscript.desktop.shell', required: true, profile: 'desktop' },
  ],
} satisfies ScenarioPolicyManifest

export const desktopLocalStartupPolicy = {
  schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  scenarioId: 'desktop-local',
  applicationId: 'movscript.desktop',
  programs: [
    { serviceName: 'movscript.desktop.shell', required: true, profile: 'desktop' },
  ],
} satisfies ScenarioPolicyManifest

export const desktopStartupPolicies = [
  desktopBootstrapStartupPolicy,
  desktopCloudStartupPolicy,
  desktopLocalStartupPolicy,
] satisfies ScenarioPolicyManifest[]

export default desktopStartupPolicies
