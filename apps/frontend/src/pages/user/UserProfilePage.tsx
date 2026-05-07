import { useUserStore } from '@/store/userStore'
import { LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/* ─── Profile tab ─── */

function ProfileTab() {
  const { t } = useTranslation()
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)

  return (
    <div className="space-y-6 max-w-sm">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground">
          {currentUser?.username[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-semibold text-foreground">{currentUser?.username}</p>
          <p className="text-sm text-muted-foreground">
            {currentUser?.system_role === 'super_admin' ? t('sidebar.roles.superAdmin') : t('sidebar.roles.user')}
          </p>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <button
          onClick={() => setCurrentUser(null)}
          className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors"
        >
          <LogOut size={15} /> {t('sidebar.logout')}
        </button>
      </div>
    </div>
  )
}

/* ─── Main page ─── */

export default function UserProfilePage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t('user.title')}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t('user.subtitle')}</p>
      </div>

      <ProfileTab />
    </div>
  )
}
