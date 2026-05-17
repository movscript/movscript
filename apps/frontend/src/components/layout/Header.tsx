import { useLocation } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/store/projectStore'
import { useTheme } from '@/hooks/useTheme'
import { Button } from '@movscript/ui'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n'
import { runtimeTitleKeys } from '@runtime'
import { LEGACY_ROUTES, ROUTES } from '@/routes/projectRoutes'

const titleKeys: Record<string, string> = {
  [ROUTES.projects]: 'header.titles.projects',
  [ROUTES.project.overview]: 'header.titles.projectHome',
  [ROUTES.project.standards]: 'header.titles.projectWorkspace',
  [ROUTES.project.preProduction]: 'header.titles.preProduction',
  [ROUTES.project.contentUnitWorkbench]: 'header.titles.workbenchProduction',
  [ROUTES.project.deliveryWorkbench]: 'header.titles.deliveryWorkbench',
  [ROUTES.project.referenceRelationsWorkbench]: 'header.titles.workbenchReferenceRelations',
  [ROUTES.project.scripts]: 'header.titles.scripts',
  [ROUTES.project.segments]: 'header.titles.segments',
  [ROUTES.project.sceneMoments]: 'header.titles.sceneMoments',
  [ROUTES.project.contentUnits]: 'header.titles.contentUnits',
  [ROUTES.project.referenceRelations]: 'header.titles.referenceRelations',
  [ROUTES.project.production]: 'header.titles.production',
  [ROUTES.canvases]: 'header.titles.canvases',
  [ROUTES.resources]: 'header.titles.resources',
  [ROUTES.jobs]: 'header.titles.jobs',
  [ROUTES.plugins]: 'header.titles.plugins',
  [ROUTES.project.tasks]: 'header.titles.collaboration',
  [ROUTES.project.delivery]: 'header.titles.delivery',
  [ROUTES.user]: 'header.titles.user',
  [LEGACY_ROUTES.projectHome]: 'header.titles.projectHome',
  [LEGACY_ROUTES.projectWorkspace]: 'header.titles.projectWorkspace',
  [LEGACY_ROUTES.creation]: 'header.titles.creation',
  [LEGACY_ROUTES.workbenchCreative]: 'header.titles.workbenchCreative',
  [LEGACY_ROUTES.workbenchAssets]: 'header.titles.assetProposalWorkbench',
  [LEGACY_ROUTES.preProduction]: 'header.titles.preProduction',
  [LEGACY_ROUTES.contentUnitOrchestrate]: 'header.titles.workbenchProduction',
  [LEGACY_ROUTES.workbenchProduction]: 'header.titles.workbenchProduction',
  [LEGACY_ROUTES.workbenchDelivery]: 'header.titles.workbenchDelivery',
  [LEGACY_ROUTES.deliveryWorkbench]: 'header.titles.deliveryWorkbench',
  [LEGACY_ROUTES.workbenchReferenceRelations]: 'header.titles.workbenchReferenceRelations',
  [LEGACY_ROUTES.scripts]: 'header.titles.scripts',
  [LEGACY_ROUTES.segments]: 'header.titles.segments',
  [LEGACY_ROUTES.sceneMoments]: 'header.titles.sceneMoments',
  [LEGACY_ROUTES.contents]: 'header.titles.contentUnits',
  [LEGACY_ROUTES.finalVideos]: 'header.titles.finalVideos',
  [LEGACY_ROUTES.assetSlots]: 'header.titles.assetSlots',
  [LEGACY_ROUTES.creativeReferences]: 'header.titles.creativeReferences',
  '/production': 'header.titles.production',
  [LEGACY_ROUTES.collaboration]: 'header.titles.collaboration',
  [LEGACY_ROUTES.delivery]: 'header.titles.delivery',
}

export function Header() {
  const { pathname } = useLocation()
  const current = useProjectStore((s) => s.current)
  const { theme, toggleTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const title = t(runtimeTitleKeys[pathname] ?? titleKeys[pathname] ?? 'header.titles.default')

  return (
    <header className="h-14 border-b border-border flex items-center px-6 bg-background gap-2 shrink-0">
      <h1 className="text-sm font-semibold text-foreground flex-1">{title}</h1>
      {current && pathname !== ROUTES.projects && (
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
