import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Image } from 'lucide-react'
import {
  AppSettingsActionButton,
  AppSettingsActionRow,
  AppSettingsAdminSurface,
  AppSettingsContentStack,
  AppSettingsEndpointSurface,
  AppSettingsSection,
} from '@/features/settings/components/AppSettingsUi'
import { externalResourceKeys } from '@movscript/resource-surface/data'
import {
  EMPTY_EXTERNAL_RESOURCE_SOURCES,
  EXTERNAL_RESOURCE_PROVIDERS,
  sourceForProvider,
} from '@/features/settings/presentation/appSettingsPageModel'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { api } from '@/shared/infrastructure/api'
import { ROUTES } from '@/routes/projectRoutes'
import type { ExternalResourceSource } from '@/types'

export function ExternalResourceSourceSettingsSection({
  canOpenAdmin,
  enabled = true,
}: {
  canOpenAdmin: boolean
  enabled?: boolean
}) {
  const { t } = useTranslation()
  const { data: queriedSources, isLoading } = useQuery<ExternalResourceSource[]>({
    queryKey: externalResourceKeys.sources,
    queryFn: () => api.get('/external-resource-sources').then(r => r.data),
    enabled,
  })
  const sources = queriedSources ?? EMPTY_EXTERNAL_RESOURCE_SOURCES

  return (
    <AppSettingsSection
      icon={Image}
      title={t('appSettings.externalResourcesTitle')}
      description={t('appSettings.externalResourcesHint')}
    >
      {EXTERNAL_RESOURCE_PROVIDERS.map(provider => {
        const source = sourceForProvider(sources, provider.key)
        const status = source
          ? source.is_enabled
            ? t('appSettings.externalResourceSourceEnabled', { name: source.name || provider.name })
            : t('appSettings.externalResourceSourceDisabled', { name: source.name || provider.name })
          : t('appSettings.externalResourceSourceMissing')
        return (
          <AppSettingsContentStack key={provider.key}>
            <AppSettingsEndpointSurface
              label={provider.name}
              value={isLoading ? t('common.loading') : status}
            />
          </AppSettingsContentStack>
        )
      })}

      {canOpenAdmin && (
        <AppSettingsAdminSurface
          label={t('appSettings.externalResourceAdmin')}
          url={t('appSettings.adminConsoleHost')}
          help={t('appSettings.externalResourceAdminHelp')}
          action={
            <AppSettingsActionButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void openAdminConsole()}
            >
              {t('appSettings.openAdminConsole')}
            </AppSettingsActionButton>
          }
        />
      )}

      <AppSettingsActionRow>
        <AppSettingsActionButton asChild variant="outline">
          <Link to={ROUTES.externalResources}>{t('appSettings.openExternalResources')}</Link>
        </AppSettingsActionButton>
      </AppSettingsActionRow>
    </AppSettingsSection>
  )
}
