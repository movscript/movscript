import {
  MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  type ScenarioPolicyManifest,
} from '@movscript/runtime-contracts'

export const cloudDeploymentStartupPolicy = {
  schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  scenarioId: 'cloud-deployment-control',
  applicationId: 'movscript.cloud',
  programs: [
    { serviceName: 'movscript.cloud.control', required: true, profile: 'cloud' },
  ],
} satisfies ScenarioPolicyManifest

export const cloudStartupPolicies = [
  cloudDeploymentStartupPolicy,
] satisfies ScenarioPolicyManifest[]

export default cloudStartupPolicies
