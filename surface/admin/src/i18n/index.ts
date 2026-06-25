import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enUS from './locales/en-US.json' assert { type: 'json' }
import zhCN from './locales/zh-CN.json' assert { type: 'json' }

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const LANGUAGE_STORAGE_KEY = 'movscript.language'

function detectLanguage(): SupportedLanguage {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(LANGUAGE_STORAGE_KEY) : null
  if (stored === 'zh-CN' || stored === 'en-US') return stored

  const preferred = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en-US'
  return preferred.startsWith('zh') ? 'zh-CN' : 'en-US'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'en-US': { translation: enUS },
      'zh-CN': { translation: zhCN },
    },
    lng: detectLanguage(),
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false,
    },
  })

i18n.on('languageChanged', (language) => {
  if (language === 'zh-CN' || language === 'en-US') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  }
})

export default i18n
