import enUS from './i18n/locales/en-US.json' assert { type: 'json' }
import zhCN from './i18n/locales/zh-CN.json' assert { type: 'json' }

export const resourceSurfaceI18nResources = {
  'en-US': { translation: enUS },
  'zh-CN': { translation: zhCN },
} as const

export type ResourceSurfaceLanguage = keyof typeof resourceSurfaceI18nResources
