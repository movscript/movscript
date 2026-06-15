import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { syncElectronBackendAuthSession } from '@/shared/infrastructure/session/backendAuthSessionSync'
import { LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  UserProfileActions,
  UserProfileCard,
  UserProfileHeader,
  UserProfileIdentity,
  UserProfileLogoutButton,
  UserProfileShell
} from '@movscript/ui/business/app'

export function UserProfilePanel() {
  const { t } = useTranslation()
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const logout = () => {
    void syncElectronBackendAuthSession(null)
    setCurrentUser(null)
  }

  return (
    <UserProfileCard>
      <UserProfileIdentity
        name={currentUser?.username}
        role={currentUser?.system_role === 'super_admin' ? t('sidebar.roles.superAdmin') : t('sidebar.roles.user')}
      />

      <UserProfileActions>
        <UserProfileLogoutButton
          onClick={logout}
          icon={<LogOut size={14} />}
        >
          {t('sidebar.logout')}
        </UserProfileLogoutButton>
      </UserProfileActions>
    </UserProfileCard>
  )
}

export default function UserProfilePage() {
  const { t } = useTranslation()

  return (
    <UserProfileShell>
      <UserProfileHeader title={t('user.title')} description={t('user.subtitle')} />

      <UserProfilePanel />
    </UserProfileShell>
  )
}
