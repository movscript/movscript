import { useLocation } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/store/projectStore'
import { useTheme } from '@/hooks/useTheme'
import { Button } from '@movscript/ui'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n'

const titleKeys: Record<string, string> = {
  '/projects': 'header.titles.projects',
  '/project-home': 'header.titles.projectHome',
  '/project-plan': 'header.titles.projectPlan',
  '/creation': 'header.titles.creation',
  '/workbench/script': 'header.titles.workbenchScript',
  '/workbench/production-plan': 'header.titles.workbenchPreview',
  '/workbench/preview': 'header.titles.workbenchPreview',
  '/workbench/creative': 'header.titles.workbenchCreative',
  '/workbench/assets': 'header.titles.workbenchAssets',
  '/workbench/production': 'header.titles.workbenchProduction',
  '/workbench/delivery': 'header.titles.workbenchDelivery',
  '/workbench/reference-relations': 'header.titles.workbenchReferenceRelations',
  '/scripts': 'header.titles.scripts',
  '/segments': 'header.titles.segments',
  '/scene-moments': 'header.titles.sceneMoments',
  '/contents': 'header.titles.contentUnits',
  '/final-videos': 'header.titles.finalVideos',
  '/asset-slots': 'header.titles.assetSlots',
  '/production-management': 'header.titles.projectPreview',
  '/production-preview': 'header.titles.projectPreview',
  '/project-preview': 'header.titles.projectPreview',
  '/creative-references': 'header.titles.creativeReferences',
  '/reference-relations': 'header.titles.referenceRelations',
  '/production': 'header.titles.production',
  '/canvases': 'header.titles.canvases',
  '/resources': 'header.titles.resources',
  '/jobs': 'header.titles.jobs',
  '/plugins': 'header.titles.plugins',
  '/agent/debug': 'header.titles.agentDebug',
  '/collaboration': 'header.titles.collaboration',
  '/delivery': 'header.titles.delivery',
  '/user': 'header.titles.user',
  '/admin': 'header.titles.admin',
  '/admin/debug': 'header.titles.adminDebug',
  '/admin/ui-preview': 'header.titles.adminUiPreview'
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
