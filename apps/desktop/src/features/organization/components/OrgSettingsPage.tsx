import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import {
  OrganizationTabButton,
  OrganizationTabs,
} from './OrganizationUi'
import { OrgGenerationToolsTab } from '@/features/organization/components/OrgGenerationToolsTab'
import { InvitationsTab, MembersTab, SettingsTab, UsageTab, type OrgSettingsTabKey } from './OrgSettingsTabs'

export default function OrgSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const [tab, setTab] = useState<OrgSettingsTabKey>('members')

  if (!currentOrgID) return null

  const tabs: { key: OrgSettingsTabKey; label: string }[] = [
    { key: 'members', label: t('org.tabs.members') },
    { key: 'usage', label: t('org.tabs.usage') },
    { key: 'invitations', label: t('org.tabs.invitations') },
    { key: 'generation-tools', label: '生成工具' },
    { key: 'settings', label: t('org.tabs.settings') },
  ]

  return (
    <div className={embedded ? '' : 'p-6 max-w-3xl'}>
      {!embedded && <h1 className="type-title font-semibold text-foreground mb-6">{t('org.settingsTitle')}</h1>}

      <OrganizationTabs>
        {tabs.map(({ key, label }) => (
          <OrganizationTabButton
            key={key}
            variant={tab === key ? 'solid' : 'ghost'}
            onClick={() => setTab(key)}
          >
            {label}
          </OrganizationTabButton>
        ))}
      </OrganizationTabs>

      {tab === 'members' && <MembersTab orgId={currentOrgID} />}
      {tab === 'usage' && <UsageTab orgId={currentOrgID} />}
      {tab === 'invitations' && <InvitationsTab orgId={currentOrgID} />}
      {tab === 'generation-tools' && <OrgGenerationToolsTab orgId={currentOrgID} />}
      {tab === 'settings' && <SettingsTab orgId={currentOrgID} />}
    </div>
  )
}
