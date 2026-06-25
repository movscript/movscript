import { auditLogsHref, usageLogsHref } from './adminLogQueryParams'

export type GatewayKeyLinkTarget = {
  ID: number
  org_id?: number
  project_id?: number
}

export function gatewayKeyUsageHref(key: GatewayKeyLinkTarget): string {
  return usageLogsHref({
    orgId: key.org_id,
    projectId: key.project_id,
    gatewayApiKeyId: key.ID,
  })
}

export function gatewayKeyAuditHref(key: GatewayKeyLinkTarget): string {
  return auditLogsHref({
    targetType: 'model_gateway_api_key',
    targetId: key.ID,
    orgId: key.org_id,
    projectId: key.project_id,
  })
}
