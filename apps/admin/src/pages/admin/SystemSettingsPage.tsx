import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Settings, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Label } from '@movscript/ui'
import { api } from '@/lib/api'
import { translateAPIRequestError } from '@/lib/apiError'
import { cn } from '@/lib/utils'

type AuthSettings = {
  registration_enabled: boolean
  require_email_verification: boolean
  email: {
    enabled: boolean
    host: string
    port: number
    username?: string
    password?: string
    password_set: boolean
    from_email: string
    from_name?: string
    use_tls: boolean
    use_start_tls: boolean
  }
}

const emptyAuthSettings: AuthSettings = {
  registration_enabled: false,
  require_email_verification: true,
  email: {
    enabled: false,
    host: '',
    port: 587,
    username: '',
    password: '',
    password_set: false,
    from_email: '',
    from_name: 'Movscript',
    use_tls: false,
    use_start_tls: true,
  },
}

export function SystemSettingsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form, setForm] = useState<AuthSettings>(emptyAuthSettings)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const authSettingsQuery = useQuery<AuthSettings>({
    queryKey: ['admin', 'settings', 'auth'],
    queryFn: () => api.get('/admin/settings/auth').then((r) => r.data),
  })

  useEffect(() => {
    if (authSettingsQuery.data) {
      setForm({ ...emptyAuthSettings, ...authSettingsQuery.data, email: { ...emptyAuthSettings.email, ...authSettingsQuery.data.email, password: '' } })
    }
  }, [authSettingsQuery.data])

  const updateSettings = useMutation({
    mutationFn: (payload: AuthSettings) => api.put('/admin/settings/auth', payload).then((r) => r.data as AuthSettings),
    onSuccess: (updated) => {
      setError('')
      setSaved(true)
      setForm({ ...emptyAuthSettings, ...updated, email: { ...emptyAuthSettings.email, ...updated.email, password: '' } })
      qc.setQueryData(['admin', 'settings', 'auth'], updated)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (err: unknown) => setError(translateAPIRequestError(err)),
  })

  const smtpReady = !!(form.email.host.trim() && form.email.from_email.trim() && Number(form.email.port) > 0)
  const canSave = (!form.email.enabled || smtpReady) && (!form.registration_enabled || (form.require_email_verification && form.email.enabled && smtpReady))

  function patchEmail(patch: Partial<AuthSettings['email']>) {
    setForm((current) => ({ ...current, email: { ...current.email, ...patch } }))
  }

  function submit() {
    updateSettings.mutate({
      ...form,
      email: {
        ...form.email,
        port: Number(form.email.port) || 587,
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Settings size={16} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('admin.settings.title')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.settings.description')}</p>
        </div>
      </div>

      {authSettingsQuery.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {translateAPIRequestError(authSettingsQuery.error)}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t('admin.settings.registration')}</h3>
        </div>
        <div className="space-y-3">
          <ToggleRow
            label={t('admin.settings.openRegistration')}
            description={t('admin.settings.openRegistrationHint')}
            checked={form.registration_enabled}
            onChange={(value) => setForm((current) => ({ ...current, registration_enabled: value, require_email_verification: value ? true : current.require_email_verification, email: { ...current.email, enabled: value ? true : current.email.enabled } }))}
          />
          <ToggleRow
            label={t('admin.settings.requireEmailVerification')}
            description={t('admin.settings.requireEmailVerificationHint')}
            checked={form.require_email_verification}
            onChange={(value) => setForm((current) => ({ ...current, require_email_verification: value }))}
            disabled={form.registration_enabled}
          />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <Mail size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t('admin.settings.smtp')}</h3>
        </div>
        <div className="space-y-3">
          <ToggleRow
            label={t('admin.settings.enableEmail')}
            description={t('admin.settings.enableEmailHint')}
            checked={form.email.enabled}
            onChange={(value) => patchEmail({ enabled: value })}
            disabled={form.registration_enabled}
          />
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px]">
            <Field label={t('admin.settings.smtpHost')} value={form.email.host} onChange={(value) => patchEmail({ host: value })} />
            <Field label={t('admin.settings.smtpPort')} value={String(form.email.port || '')} onChange={(value) => patchEmail({ port: Number(value) || 0 })} type="number" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t('admin.settings.smtpUsername')} value={form.email.username ?? ''} onChange={(value) => patchEmail({ username: value })} />
            <Field label={t('admin.settings.smtpPassword')} value={form.email.password ?? ''} onChange={(value) => patchEmail({ password: value })} type="password" placeholder={form.email.password_set ? t('admin.settings.smtpPasswordSet') : undefined} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t('admin.settings.fromEmail')} value={form.email.from_email} onChange={(value) => patchEmail({ from_email: value })} />
            <Field label={t('admin.settings.fromName')} value={form.email.from_name ?? ''} onChange={(value) => patchEmail({ from_name: value })} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <ToggleRow label={t('admin.settings.useStartTLS')} checked={form.email.use_start_tls} onChange={(value) => patchEmail({ use_start_tls: value, use_tls: value ? false : form.email.use_tls })} compact />
            <ToggleRow label={t('admin.settings.useTLS')} checked={form.email.use_tls} onChange={(value) => patchEmail({ use_tls: value, use_start_tls: value ? false : form.email.use_start_tls })} compact />
          </div>
        </div>
      </section>

      {!canSave && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {t('admin.settings.registrationRequiresEmail')}
        </div>
      )}
      <div className="flex justify-end gap-2">
        {saved && <span className="self-center text-xs text-primary">{t('admin.settings.saved')}</span>}
        <Button type="button" onClick={submit} disabled={updateSettings.isPending || !canSave}>
          {updateSettings.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange, disabled, compact }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; compact?: boolean }) {
  return (
    <label className={cn('flex items-start justify-between gap-4 rounded-md border border-border bg-background px-3 py-2', compact && 'items-center')}>
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4" />
    </label>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 text-sm" />
    </div>
  )
}
