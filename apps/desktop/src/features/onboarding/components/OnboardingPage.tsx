import { ModeSelectionPanel } from '@/features/onboarding/components/ModeSelectionPanel'
import {
  AppSettingsMain,
  AppSettingsShell,
} from '@/features/settings/components/AppSettingsUi'

export default function OnboardingPage() {
  return (
    <AppSettingsShell className="onboarding-shell">
      <AppSettingsMain className="onboarding-shell__main">
        <ModeSelectionPanel variant="onboarding" />
      </AppSettingsMain>
    </AppSettingsShell>
  )
}
