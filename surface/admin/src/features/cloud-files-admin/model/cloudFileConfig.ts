export const CONFIG_TYPE_LABELS: Record<string, string> = {
  s3: 'AWS S3',
  oss: 'Alibaba Cloud OSS',
  tos: 'Volcengine TOS',
}

export type CloudConfigField = { key: string; label: string; placeholder: string; secret?: boolean; required?: boolean }

export const CONFIG_TYPE_FIELDS: Record<string, CloudConfigField[]> = {
  s3: [
    { key: 'region', label: 'Region', placeholder: 'us-east-1', required: true },
    { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
    { key: 'access_key', label: 'Access Key', placeholder: 'AKIA...', secret: true, required: true },
    { key: 'secret_key', label: 'Secret Key', placeholder: '...', secret: true, required: true },
    { key: 'public_base_url', label: 'Public Base URL', placeholder: 'https://my-bucket.s3.amazonaws.com' },
  ],
  oss: [
    { key: 'endpoint', label: 'Endpoint', placeholder: 'oss-cn-hangzhou.aliyuncs.com', required: true },
    { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
    { key: 'access_key_id', label: 'Access Key ID', placeholder: '...', secret: true, required: true },
    { key: 'access_key_secret', label: 'Access Key Secret', placeholder: '...', secret: true, required: true },
    { key: 'public_base_url', label: 'Public Base URL', placeholder: 'https://my-bucket.oss-cn-hangzhou.aliyuncs.com' },
  ],
  tos: [
    { key: 'endpoint', label: 'Endpoint', placeholder: 'tos-cn-beijing.volces.com', required: true },
    { key: 'region', label: 'Region', placeholder: 'cn-beijing', required: true },
    { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
    { key: 'access_key', label: 'Access Key', placeholder: '...', secret: true, required: true },
    { key: 'secret_key', label: 'Secret Key', placeholder: '...', secret: true, required: true },
    { key: 'public_base_url', label: 'Public Base URL', placeholder: 'https://my-bucket.tos-cn-beijing.volces.com' },
  ],
}

export interface CloudFileConfig {
  ID: number
  name: string
  config_type: string
  priority: number
  is_enabled: boolean
  masked_config: string
}

export interface CloudFileConfigTestResult {
  success: boolean
  message: string
  latency_ms: number
  url?: string
  config_id?: number
}

export function parseMaskedCloudConfig(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function missingCloudConfigFields(fields: CloudConfigField[], values: Record<string, string>, editingId: number | null): CloudConfigField[] {
  return fields.filter((field) => {
    if (!field.required) return false
    if (editingId && field.secret) return false
    return !values[field.key]?.trim()
  })
}
