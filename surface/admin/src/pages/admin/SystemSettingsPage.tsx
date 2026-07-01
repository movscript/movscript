import { useQuery } from '@tanstack/react-query'
import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppIconFrame, AppInlineError } from '@movscript/ui/business/app'
import { StatusBadge } from '@movscript/ui/primitives'
import { api } from '@admin/lib/api'
import { translateAPIRequestError } from '@admin/lib/apiError'
import { readListPayload, readRecordPayload } from '@admin/lib/listPayload'

type ProviderAssemblyItem = {
  type: string
  adapter: string
  label: string
  assembly: string
  capabilities?: string[]
  configured: boolean
  managed_by: string
}

type ProviderAssembly = {
  profile: string
  deployment_profile: string
  assembly_mode: string
  database: string
  object_storage: string
  workspace_storage: string
  ai_gateway: string
  cache: string
  media_processing: string
  agent_runtime: string
  providers: ProviderAssemblyItem[]
}

type ProviderDescriptor = {
  id: string
  kind: string
  type: string
  adapter: string
  label: string
  version: string
  assembly: string
  capabilities?: string[]
}

type ProviderHealthItem = {
  type: string
  adapter: string
  assembly: string
  status: string
  message?: string
  capabilities?: string[]
}

type ProviderHealthResponse = {
  items: ProviderHealthItem[]
}

type ProviderInstanceField = {
  key: string
  required: boolean
  configured: boolean
}

type ProviderInstance = {
  id: string
  type: string
  adapter: string
  label: string
  assembly: string
  managed_by: string
  configured: boolean
  capabilities?: string[]
  config_fields?: ProviderInstanceField[]
  secret_fields?: ProviderInstanceField[]
}

type ProviderInstancesResponse = {
  items: ProviderInstance[]
}

const EMPTY_PROVIDER_ASSEMBLY: ProviderAssembly = {
  profile: 'local',
  deployment_profile: 'personal-local',
  assembly_mode: 'startup',
  database: '',
  object_storage: '',
  workspace_storage: '',
  ai_gateway: '',
  cache: '',
  media_processing: '',
  agent_runtime: '',
  providers: [],
}

function readProviderAssembly(raw: unknown): ProviderAssembly {
  const record = readRecordPayload(raw)
  return {
    ...EMPTY_PROVIDER_ASSEMBLY,
    ...record,
    providers: readListPayload<ProviderAssemblyItem>(raw, ['providers', 'items']),
  }
}

export function SystemSettingsPage() {
  const { t } = useTranslation()

  const providerAssemblyQuery = useQuery<ProviderAssembly>({
    queryKey: ['backend', 'provider-assembly'],
    queryFn: () => api.get('/backend/dependencies').then((r) => readProviderAssembly(r.data)),
  })

  const providerDescriptorsQuery = useQuery<ProviderDescriptor[]>({
    queryKey: ['backend', 'provider-descriptors'],
    queryFn: () => api.get('/backend/provider-descriptors').then((r) => readListPayload<ProviderDescriptor>(r.data, ['descriptors', 'items', 'records'])),
  })

  const providerHealthQuery = useQuery<ProviderHealthResponse>({
    queryKey: ['backend', 'provider-health'],
    queryFn: () => api.get('/backend/provider-health').then((r) => ({ items: readListPayload<ProviderHealthItem>(r.data) })),
  })

  const providerInstancesQuery = useQuery<ProviderInstancesResponse>({
    queryKey: ['backend', 'provider-instances'],
    queryFn: () => api.get('/backend/provider-instances').then((r) => ({ items: readListPayload<ProviderInstance>(r.data) })),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <AppIconFrame tone="info" className="mt-0.5">
          <Settings size={16} />
        </AppIconFrame>
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('admin.settings.title')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.settings.description')}</p>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <Settings size={16} className="text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t('admin.settings.deployment')}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.settings.deploymentHint')}</p>
          </div>
        </div>
        {providerAssemblyQuery.error ? (
          <AppInlineError>
            {translateAPIRequestError(providerAssemblyQuery.error)}
          </AppInlineError>
        ) : (
          <ProviderAssemblyPanel
            assembly={providerAssemblyQuery.data}
            descriptors={providerDescriptorsQuery.data ?? []}
            healthItems={providerHealthQuery.data?.items ?? []}
            instances={providerInstancesQuery.data?.items ?? []}
            loading={providerAssemblyQuery.isLoading || providerDescriptorsQuery.isLoading || providerHealthQuery.isLoading || providerInstancesQuery.isLoading}
          />
        )}
      </section>
    </div>
  )
}

function ProviderAssemblyPanel({
  assembly,
  descriptors,
  healthItems,
  instances,
  loading,
}: {
  assembly?: ProviderAssembly
  descriptors: ProviderDescriptor[]
  healthItems: ProviderHealthItem[]
  instances: ProviderInstance[]
  loading: boolean
}) {
  const { t } = useTranslation()
  if (loading && !assembly) {
    return <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
  }
  if (!assembly) {
    return <p className="text-xs text-muted-foreground">{t('admin.settings.deploymentUnavailable')}</p>
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <DeploymentMeta label={t('admin.settings.deploymentProfile')} value={t(`admin.settings.deploymentProfiles.${assembly.deployment_profile}`, { defaultValue: assembly.deployment_profile })} />
        <DeploymentMeta label={t('admin.settings.dependencyProfile')} value={assembly.profile} />
        <DeploymentMeta label={t('admin.settings.assemblyMode')} value={t(`admin.settings.assemblyModes.${assembly.assembly_mode}`, { defaultValue: assembly.assembly_mode })} />
        <DeploymentMeta label={t('admin.settings.supportedAdapters')} value={String(descriptors.length)} />
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t('admin.settings.providerType')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.settings.providerAdapter')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.settings.providerCapabilities')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.settings.providerSecrets')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.settings.providerManagedBy')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.settings.providerStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {assembly.providers.map((provider) => {
              const health = healthItems.find((item) => item.type === provider.type && item.adapter === provider.adapter)
              const instance = instances.find((item) => item.type === provider.type && item.adapter === provider.adapter)
              const capabilities = health?.capabilities ?? provider.capabilities ?? descriptors.find((item) => item.type === provider.type && item.adapter === provider.adapter)?.capabilities ?? []
              const secretFields = instance?.secret_fields ?? []
              const configuredSecrets = secretFields.filter((field) => field.configured).length
              const ready = (health?.status ?? (provider.configured ? 'ok' : 'missing_config')) === 'ok'
              return (
                <tr key={provider.type} className="border-t border-border">
                  <td className="px-3 py-2 text-foreground">{t(`admin.settings.providerTypes.${provider.type}`, { defaultValue: provider.type })}</td>
                  <td className="px-3 py-2 text-muted-foreground">{provider.label || provider.adapter}</td>
                  <td className="px-3 py-2 text-muted-foreground">{capabilities.length}</td>
                  <td className="px-3 py-2 text-muted-foreground">{secretFields.length > 0 ? `${configuredSecrets}/${secretFields.length}` : t('admin.settings.providerSecretsNone')}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t(`admin.settings.providerManaged.${provider.managed_by}`, { defaultValue: provider.managed_by })}</td>
                  <td className="px-3 py-2">
                    <StatusBadge intent={ready ? 'success' : 'danger'} className="text-[11px]">
                      {ready ? t('admin.settings.providerConfigured') : t('admin.settings.providerMissingConfig')}
                    </StatusBadge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DeploymentMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}
