import type { ElectronAppServerConfigStatus } from '@/shared/contracts/electronApi'

export function appServerAccountSourceLabel(config?: ElectronAppServerConfigStatus): string {
  if (!config) return '-'
  const base = appServerAccountSourceBaseLabel(config.accountSource)
  return `${base}${config.apiKeyConfigured ? ' / API Key' : ''}`
}

export function appServerAccountSourceBaseLabel(source: ElectronAppServerConfigStatus['accountSource']): string {
  switch (source) {
    case 'local-home':
      return '本机'
    case 'movscript-account':
    case 'movscript-environment':
    case 'movscript-model-config':
    case 'managed-home':
    case 'custom-config':
      return '托管配置'
    case 'movscript-backend-session':
      return '后端'
    case 'none':
      return '未配置'
  }
}
