import { api } from '@admin/lib/api'
import { translateAPIRequestError } from '@admin/lib/apiError'
import { AppInlineError } from '@movscript/ui/business/app'
import { Button, Input, Label, StatusBadge } from '@movscript/ui/primitives'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  RESOURCE_ACCESS_MODE_LABELS,
  emptyResourceAccessProfile,
  resourceAccessModeLabel,
  sanitizeResourceAccessProfile,
  type ResourceAccessCheckResult,
  type ResourceAccessMode,
  type ResourceAccessProfile,
  type ResourceAccessSettings,
} from '../model/resourceAccess'

function ProviderAssetSettingsField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-8 text-xs"
      />
    </label>
  )
}

export function ResourceAccessSettingsPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ResourceAccessSettings>({ profiles: [] })
  const [saved, setSaved] = useState(false)
  const [checkResourceID, setCheckResourceID] = useState('')
  const [checkResult, setCheckResult] = useState<ResourceAccessCheckResult | null>(null)

  const settingsQuery = useQuery<ResourceAccessSettings>({
    queryKey: ['admin', 'settings', 'resource-access'],
    queryFn: () => api.get('/admin/settings/resource-access').then((r) => r.data),
  })
  useEffect(() => {
    if (!settingsQuery.data) return
    setForm({
      profiles: (settingsQuery.data.profiles ?? []).map((profile) => ({
        ...emptyResourceAccessProfile(),
        ...profile,
        signing_secret: '',
      })),
      default_profile_id: settingsQuery.data.default_profile_id ?? '',
    })
  }, [settingsQuery.data])

  const updateSettings = useMutation({
    mutationFn: (payload: ResourceAccessSettings) => api.put('/admin/settings/resource-access', payload).then((r) => r.data as ResourceAccessSettings),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'settings', 'resource-access'], updated)
      queryClient.invalidateQueries({ queryKey: ['admin', 'providers'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })
  const checkResourceAccess = useMutation({
    mutationFn: (resourceID: number) => api.post('/resource-access/check', {
      resource_id: resourceID,
      transport: 'public_url',
      profile_id: form.default_profile_id?.trim() || undefined,
    }).then((r) => r.data as ResourceAccessCheckResult),
    onSuccess: (result) => setCheckResult(result),
  })

  function patchProfile(index: number, patch: Partial<ResourceAccessProfile>) {
    setForm((current) => ({
      ...current,
      profiles: current.profiles.map((profile, i) => (i === index ? { ...profile, ...patch } : profile)),
    }))
  }

  function addProfile(mode: ResourceAccessMode = 'public_tunnel') {
    setForm((current) => {
      const profile = {
        ...emptyResourceAccessProfile(),
        id: `resource-access-${current.profiles.length + 1}`,
        name: resourceAccessModeLabel(mode, t),
        mode,
      }
      return {
        profiles: [...current.profiles, profile],
        default_profile_id: current.default_profile_id || profile.id,
      }
    })
  }

  function removeProfile(index: number) {
    setForm((current) => {
      const removed = current.profiles[index]
      const profiles = current.profiles.filter((_, i) => i !== index)
      const defaultProfileID = current.default_profile_id === removed?.id
        ? (profiles.find((profile) => profile.enabled)?.id ?? profiles[0]?.id ?? '')
        : current.default_profile_id
      return { profiles, default_profile_id: defaultProfileID }
    })
  }

  function submit() {
    const profiles = form.profiles.map(sanitizeResourceAccessProfile)
    updateSettings.mutate({
      profiles,
      default_profile_id: form.default_profile_id?.trim() || profiles.find((profile) => profile.enabled)?.id || profiles[0]?.id || '',
    })
  }

  function runResourceAccessCheck() {
    const resourceID = Number(checkResourceID)
    if (!Number.isFinite(resourceID) || resourceID <= 0) return
    setCheckResult(null)
    checkResourceAccess.mutate(resourceID)
  }

  const defaultProfile = form.profiles.find((profile) => profile.id === form.default_profile_id)
  const enabledPublicProfiles = form.profiles.filter((profile) => profile.enabled && ['public_tunnel', 'public_backend', 'object_relay'].includes(profile.mode) && profile.public_base_url?.trim())
  const hasProfiles = form.profiles.length > 0

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t('admin.resourceAccess.title', { defaultValue: '资源公网访问' })}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t('admin.resourceAccess.description', { defaultValue: '统一配置 RawResource 如何被上游模型访问；Provider 页面只保留账号和素材库私有能力。' })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge intent={enabledPublicProfiles.length > 0 ? 'success' : 'warning'} className="text-[11px]">
            {enabledPublicProfiles.length > 0
              ? t('admin.resourceAccess.status.publicReady', { defaultValue: 'Public access ready' })
              : t('admin.resourceAccess.status.publicMissing', { defaultValue: 'Public access missing' })}
          </StatusBadge>
          <Button type="button" size="sm" onClick={() => addProfile('public_tunnel')}>
            {t('admin.resourceAccess.addProfile', { defaultValue: 'Add profile' })}
          </Button>
        </div>
      </div>

      {settingsQuery.error && <AppInlineError className="mt-3">{translateAPIRequestError(settingsQuery.error)}</AppInlineError>}
      {updateSettings.error && <AppInlineError className="mt-3">{translateAPIRequestError(updateSettings.error)}</AppInlineError>}

      {!hasProfiles && !settingsQuery.isLoading && (
        <div className="mt-4 rounded-md border border-dashed border-border bg-background px-3 py-4 text-sm text-muted-foreground">
          {t('admin.resourceAccess.empty', { defaultValue: '暂无资源公网访问配置。添加 ngrok、Cloudflare Tunnel 或公网后端地址后，需要 public URL 的模型路由才能消费本地资源。' })}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {form.profiles.map((profile, index) => {
          const needsPublicBaseURL = profile.mode === 'public_tunnel' || profile.mode === 'public_backend' || profile.mode === 'object_relay'
          return (
            <div key={`${profile.id || 'new'}-${index}`} className="rounded-md border border-border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{profile.name || profile.id || t('admin.resourceAccess.unnamed', { defaultValue: '未命名访问方式' })}</span>
                    <StatusBadge intent={profile.enabled ? 'success' : 'neutral'} className="text-[11px]">
                      {profile.enabled
                        ? t('admin.resourceAccess.status.enabled', { defaultValue: 'Enabled' })
                        : t('admin.resourceAccess.status.disabled', { defaultValue: 'Disabled' })}
                    </StatusBadge>
                    {form.default_profile_id === profile.id && (
                      <StatusBadge intent="info" className="text-[11px]">
                        {t('admin.resourceAccess.status.default', { defaultValue: 'Default' })}
                      </StatusBadge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{profile.public_base_url || profile.mode}</p>
                </div>
                <Button type="button" size="sm" variant="outline" intent="danger" onClick={() => removeProfile(index)}>
                  {t('common.delete')}
                </Button>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <ProviderAssetSettingsField
                  label={t('admin.resourceAccess.fields.id', { defaultValue: 'Profile ID' })}
                  value={profile.id}
                  onChange={(value) => patchProfile(index, { id: value })}
                  placeholder="local-ngrok"
                />
                <ProviderAssetSettingsField
                  label={t('admin.resourceAccess.fields.name', { defaultValue: 'Name' })}
                  value={profile.name ?? ''}
                  onChange={(value) => patchProfile(index, { name: value })}
                  placeholder="Local ngrok"
                />
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span>{t('admin.resourceAccess.fields.mode', { defaultValue: 'Mode' })}</span>
                  <select
                    value={profile.mode}
                    onChange={(event) => patchProfile(index, { mode: event.target.value as ResourceAccessMode })}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    {Object.keys(RESOURCE_ACCESS_MODE_LABELS).map((value) => (
                      <option key={value} value={value}>{resourceAccessModeLabel(value as ResourceAccessMode, t)}</option>
                    ))}
                  </select>
                </label>
                <ProviderAssetSettingsField
                  label={t('admin.resourceAccess.fields.publicBaseUrl', { defaultValue: 'Public Base URL' })}
                  value={profile.public_base_url ?? ''}
                  onChange={(value) => patchProfile(index, { public_base_url: value })}
                  placeholder={needsPublicBaseURL ? 'https://your-tunnel.example.com' : t('admin.resourceAccess.optional', { defaultValue: 'Optional' })}
                />
                <ProviderAssetSettingsField
                  label={t('admin.resourceAccess.fields.internalBaseUrl', { defaultValue: 'Internal Base URL' })}
                  value={profile.internal_base_url ?? ''}
                  onChange={(value) => patchProfile(index, { internal_base_url: value })}
                  placeholder="http://127.0.0.1:8766"
                />
                <ProviderAssetSettingsField
                  label={t('admin.resourceAccess.fields.expiresSeconds', { defaultValue: 'Expires seconds' })}
                  value={String(profile.expires_seconds ?? 3600)}
                  onChange={(value) => patchProfile(index, { expires_seconds: Number(value) || 3600 })}
                  type="number"
                />
                <ProviderAssetSettingsField
                  label={t('admin.resourceAccess.fields.healthPath', { defaultValue: 'Health check path' })}
                  value={profile.health_check_path ?? ''}
                  onChange={(value) => patchProfile(index, { health_check_path: value })}
                  placeholder="/api/v1/resource-access/health"
                />
                <ProviderAssetSettingsField
                  label={t('admin.resourceAccess.fields.signingSecret', { defaultValue: 'Signing secret' })}
                  value={profile.signing_secret ?? ''}
                  onChange={(value) => patchProfile(index, { signing_secret: value })}
                  type="password"
                  placeholder={profile.signing_secret_set ? t('admin.settings.providerAssetSecretSet') : undefined}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={profile.enabled}
                    onChange={(event) => patchProfile(index, { enabled: event.target.checked })}
                    className="rounded"
                  />
                  {t('admin.resourceAccess.fields.enabled', { defaultValue: 'Enabled' })}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={profile.signing_enabled}
                    onChange={(event) => patchProfile(index, { signing_enabled: event.target.checked })}
                    className="rounded"
                  />
                  {t('admin.resourceAccess.fields.signingEnabled', { defaultValue: 'Signed URLs' })}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={form.default_profile_id === profile.id}
                    onChange={() => setForm((current) => ({ ...current, default_profile_id: profile.id }))}
                    className="rounded"
                  />
                  {t('admin.resourceAccess.fields.defaultProfile', { defaultValue: 'Default profile' })}
                </label>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 rounded-md border border-border bg-background p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="resource-access-check-resource" className="text-xs text-muted-foreground">
              {t('admin.resourceAccess.check.resourceId', { defaultValue: 'RawResource ID' })}
            </Label>
            <Input
              id="resource-access-check-resource"
              type="number"
              min={1}
              value={checkResourceID}
              onChange={(event) => setCheckResourceID(event.target.value)}
              placeholder="101"
              className="mt-1"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={runResourceAccessCheck}
            disabled={checkResourceAccess.isPending || !checkResourceID.trim()}
          >
            {checkResourceAccess.isPending
              ? t('admin.resourceAccess.check.running', { defaultValue: 'Testing…' })
              : t('admin.resourceAccess.check.run', { defaultValue: 'Test public URL' })}
          </Button>
        </div>
        {checkResourceAccess.error && <AppInlineError className="mt-3">{translateAPIRequestError(checkResourceAccess.error)}</AppInlineError>}
        {checkResult && (
          <div className="mt-3 space-y-2 rounded-md border border-border bg-card p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge intent={checkResult.reachable ? 'success' : 'danger'} className="text-[11px]">
                {checkResult.reachable
                  ? t('admin.resourceAccess.check.reachable', { defaultValue: 'Reachable' })
                  : t('admin.resourceAccess.check.unreachable', { defaultValue: 'Unreachable' })}
              </StatusBadge>
              {checkResult.status_code ? <span>HTTP {checkResult.status_code}</span> : null}
              {checkResult.content_type ? <span>{checkResult.content_type}</span> : null}
              {checkResult.content_length !== undefined ? (
                <span>{t('admin.resourceAccess.check.bytes', { defaultValue: '{{count}} bytes', count: checkResult.content_length })}</span>
              ) : null}
            </div>
            <p className="break-all font-mono text-muted-foreground">{checkResult.url}</p>
            {checkResult.error ? <p className="text-destructive">{checkResult.error}</p> : null}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          {defaultProfile
            ? t('admin.resourceAccess.defaultSummary', { defaultValue: 'Default: {{id}}', id: defaultProfile.id })
            : t('admin.resourceAccess.noDefault', { defaultValue: 'No default profile selected' })}
        </p>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-primary">{t('admin.settings.saved')}</span>}
          <Button type="button" size="sm" onClick={submit} disabled={settingsQuery.isLoading || updateSettings.isPending}>
            {updateSettings.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
