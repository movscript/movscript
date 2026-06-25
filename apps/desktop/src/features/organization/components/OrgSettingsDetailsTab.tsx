import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '@/shared/infrastructure/api'
import { translateApiError } from '@/shared/infrastructure/apiError'
import { organizationKeys } from '@/features/organization/application/organizationQueryKeys'
import {
  invalidateOrganizationMutationResult,
  organizationChangedResult,
} from '@/features/organization/application/organizationMutationInvalidation'
import { OrganizationInlineError } from './OrganizationUi'
import { Button, Input, Label } from '@movscript/ui/primitives'

export function SettingsTab({ orgId }: { orgId: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: org } = useQuery({
    queryKey: organizationKeys.detail(orgId),
    queryFn: () => api.get(`/orgs/${orgId}`).then((r) => r.data),
    onSuccess: (data: any) => { if (!name) setName(data.name) },
  } as any)

  const update = useMutation({
    mutationFn: () => api.put(`/orgs/${orgId}`, { name }).then((r) => r.data),
    onSuccess: () => {
      invalidateOrganizationMutationResult(qc, organizationChangedResult({ orgId }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setError('')
    },
    onError: (e: any) => setError(translateApiError(e.response?.data, t('org.updateFailed'))),
  })

  return (
    <div className="max-w-sm space-y-4">
      <div>
        <Label htmlFor="org-name-setting">{t('org.name')}</Label>
        <Input
          id="org-name-setting"
          value={name || (org as any)?.name || ''}
          onChange={(e) => setName(e.target.value)}
          className="mt-1"
        />
      </div>
      {error && <OrganizationInlineError>{error}</OrganizationInlineError>}
      <Button onClick={() => update.mutate()} disabled={update.isPending || !name.trim()}>
        {saved ? t('org.saved') : update.isPending ? t('common.saving') : t('common.save')}
      </Button>
    </div>
  )
}
