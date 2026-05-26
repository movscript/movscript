import { NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { CircleUserRound, LogOut } from 'lucide-react'
import { AppTopControls } from '@/features/app-shell/components/AppTopControls'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ROUTES } from '@/routes/projectRoutes'
import {
  AppAvatar,
  AppTopControlButton,
  AppTopMenuLabelPrimary,
  AppTopMenuLabelSecondary,
  AppTopMenuLeadingIcon,
  AppTopUserMenuContent,
  AppWindowBrandButton,
  AppWindowControls,
  AppWindowHeader,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@movscript/ui'

function UserMenu() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const orgMemberships = useUserStore((s) => s.orgMemberships)
  const currentMembership = orgMemberships.find((membership) => membership.org_id === currentOrgID)

  if (!currentUser) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <AppTopControlButton
          type="button"
          variant="ghost"
          density="compact"
          title={currentUser.username}
          aria-label={currentUser.username}
        >
          <AppAvatar size="xs" name={currentUser.username} />
        </AppTopControlButton>
      </DropdownMenuTrigger>
      <AppTopUserMenuContent>
        <DropdownMenuLabel>
          <AppTopMenuLabelPrimary>{currentUser.username}</AppTopMenuLabelPrimary>
          <AppTopMenuLabelSecondary>
            {currentMembership
              ? t(`org.roles.${currentMembership.role}`, { defaultValue: currentMembership.role })
              : currentUser.system_role === 'super_admin' ? t('sidebar.roles.superAdmin') : t('sidebar.roles.user')}
          </AppTopMenuLabelSecondary>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(ROUTES.user)}>
          <AppTopMenuLeadingIcon icon={CircleUserRound} />
          {t('header.titles.user')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setCurrentUser(null)}>
          <AppTopMenuLeadingIcon icon={LogOut} />
          {t('sidebar.logout')}
        </DropdownMenuItem>
      </AppTopUserMenuContent>
    </DropdownMenu>
  )
}

export function Header({
  titleKey: _titleKey,
  appControls,
  leftControls,
  centerContent,
}: {
  titleKey?: string
  appControls?: ReactNode
  leftControls?: ReactNode
  centerContent?: ReactNode
}) {
  const platform = typeof window === 'undefined' ? undefined : window.api?.platform
  const isMacOS = platform === undefined || platform === 'darwin'
  const controls = (
    <AppWindowControls>
      {appControls}
      <AppTopControls compact />
      <UserMenu />
    </AppWindowControls>
  )

  return (
    <AppWindowHeader
      isMacOS={isMacOS}
      leftControls={leftControls}
      controls={controls}
      centerContent={centerContent}
      fallbackBrand={(
        <AppWindowBrandButton>
          <NavLink to={ROUTES.projects}>
            Movscript
          </NavLink>
        </AppWindowBrandButton>
      )}
    />
  )
}
