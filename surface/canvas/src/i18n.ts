import enUS from './i18n/locales/en-US.json' assert { type: 'json' }
import zhCN from './i18n/locales/zh-CN.json' assert { type: 'json' }

export const canvasSurfaceI18nResources = {
  'en-US': { translation: enUS },
  'zh-CN': { translation: zhCN },
} as const

export type CanvasSurfaceLanguage = keyof typeof canvasSurfaceI18nResources
