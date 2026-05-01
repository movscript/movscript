import { useLocation } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/store/projectStore'
import { useTheme } from '@/hooks/useTheme'
import { Button } from '@movscript/ui'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n'

const titleKeys: Record<string, string> = {
  '/projects': 'header.titles.projects',
  '/scripts': 'header.titles.scripts',
  '/settings': 'header.titles.settings',
  '/assets': 'header.titles.assets',
  '/episodes': 'header.titles.episodes',
  '/script-preview': 'header.titles.scriptPreview',
  '/scenes': 'header.titles.scenes',
  '/storyboards': 'header.titles.storyboards',
  '/shots': 'header.titles.shots',
  '/canvases': 'header.titles.canvases',
  '/resources': 'header.titles.resources',
  '/jobs': 'header.titles.jobs',
  '/plugins': 'header.titles.plugins',
  '/agent/debug': 'header.titles.agentDebug',
  '/collaboration': 'header.titles.collaboration',
  '/user': 'header.titles.user',
  '/admin': 'header.titles.admin'
}

export function Header() {
  const { pathname } = useLocation()
  const current = useProjectStore((s) => s.current)
  const { theme, toggleTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const title = t(titleKeys[pathname] ?? 'header.titles.default')

  return (
    <header className="h-14 border-b border-border flex items-center px-6 bg-background gap-2 shrink-0">
      <h1 className="text-sm font-semibold text-foreground flex-1">{title}</h1>
      {current && pathname !== '/projects' && (
        <span className="text-sm text-muted-foreground mr-2">- {current.name}</span>
      )}
      <label className="sr-only" htmlFor="language-select">{t('header.language')}</label>
      <select
        id="language-select"
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value as SupportedLanguage)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground hover:text-foreground"
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language}>{language}</option>
        ))}
      </select>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="text-muted-foreground hover:text-foreground h-8 w-8"
        title={theme === 'dark' ? t('header.theme.light') : t('header.theme.dark')}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </Button>
    </header>
  )
}
