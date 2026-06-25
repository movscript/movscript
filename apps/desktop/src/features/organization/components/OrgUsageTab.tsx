import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'

import { api } from '@/shared/infrastructure/api'
import { organizationKeys } from '@/features/organization/application/organizationQueryKeys'
import {
  OrganizationDataTable,
  OrganizationDataTableBody,
  OrganizationDataTableCell,
  OrganizationDataTableEmptyRow,
  OrganizationDataTableHeader,
  OrganizationDataTableHeadCell,
  OrganizationDataTableRow,
  OrganizationStack,
  OrganizationTableSurface,
  OrganizationUsageCostCard,
  OrganizationUsageMetricCard,
  OrganizationUsageMetricGrid,
} from './OrganizationUi'
import type { OrgUsageResult } from './OrgSettingsTabsModel'

export function UsageTab({ orgId }: { orgId: number }) {
  const { t } = useTranslation()

  const { data } = useQuery<OrgUsageResult>({
    queryKey: organizationKeys.usage(orgId),
    queryFn: () => api.get(`/orgs/${orgId}/usage`).then((r) => r.data),
  })

  const rows = data?.by_user ?? []
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0)
  const totalTokens = rows.reduce((sum, row) => sum + row.tokens, 0)

  return (
    <OrganizationStack>
      <OrganizationUsageMetricGrid>
        <OrganizationUsageMetricCard label={t('org.usage.month')} value={data?.month ?? '—'} />
        <OrganizationUsageMetricCard label={t('org.usage.totalTokens')} value={totalTokens.toLocaleString()} />
      </OrganizationUsageMetricGrid>

      <OrganizationUsageCostCard
        icon={<Coins size={14} />}
        label={t('org.usage.totalCost')}
        value={totalCost.toFixed(3)}
        detail={t('common.credits')}
      />

      <OrganizationTableSurface>
        <OrganizationDataTable>
          <OrganizationDataTableHeader>
            <tr>
              <OrganizationDataTableHeadCell>{t('org.usage.user')}</OrganizationDataTableHeadCell>
              <OrganizationDataTableHeadCell align="right">{t('org.usage.tokens')}</OrganizationDataTableHeadCell>
              <OrganizationDataTableHeadCell align="right">{t('org.usage.cost')}</OrganizationDataTableHeadCell>
            </tr>
          </OrganizationDataTableHeader>
          <OrganizationDataTableBody>
            {rows.map((row) => (
              <OrganizationDataTableRow key={row.user_id} interactive>
                <OrganizationDataTableCell>{row.username}</OrganizationDataTableCell>
                <OrganizationDataTableCell align="right" numeric>{row.tokens.toLocaleString()}</OrganizationDataTableCell>
                <OrganizationDataTableCell align="right" emphasis="strong" numeric>{row.cost.toFixed(3)}</OrganizationDataTableCell>
              </OrganizationDataTableRow>
            ))}
            {rows.length === 0 && (
              <OrganizationDataTableEmptyRow colSpan={3}>{t('org.usage.empty')}</OrganizationDataTableEmptyRow>
            )}
          </OrganizationDataTableBody>
        </OrganizationDataTable>
      </OrganizationTableSurface>
    </OrganizationStack>
  )
}
