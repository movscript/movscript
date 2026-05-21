import type { LucideIcon } from 'lucide-react'
import { ArrowRight, Bot, LayoutDashboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export type WorkModeChoice = 'detail' | 'agent'

export function WorkModePrompt({
  title,
  description,
  onSelect,
}: {
  title?: string
  description?: string
  onSelect: (mode: WorkModeChoice) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="w-full">
      {(title || description) ? (
        <div className="mb-8 max-w-2xl">
          {title ? <h1 className="type-display font-semibold tracking-normal">{title}</h1> : null}
          {description ? <p className="mt-3 type-body leading-6 text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <WorkModeCard
          icon={Bot}
          title={t('appSettings.agentWorkMode')}
          description={t('onboarding.workMode.agentDescription')}
          action={t('onboarding.workMode.agentAction')}
          mode="agent"
          onSelect={onSelect}
        />
        <WorkModeCard
          icon={LayoutDashboard}
          title={t('appSettings.detailWorkMode')}
          description={t('onboarding.workMode.detailDescription')}
          action={t('onboarding.workMode.detailAction')}
          mode="detail"
          onSelect={onSelect}
        />
      </div>
    </div>
  )
}

export function WorkModeSwitchGuide({ activeMode, compact = false }: { activeMode: WorkModeChoice; compact?: boolean }) {
  const CurrentIcon = activeMode === 'agent' ? Bot : LayoutDashboard
  const NextIcon = activeMode === 'agent' ? LayoutDashboard : Bot
  return (
    <div className={compact ? 'onboarding-switch-guide onboarding-switch-guide--compact' : 'onboarding-switch-guide'} aria-hidden="true">
      <span className="onboarding-switch-guide__bar">
        <span className="onboarding-switch-guide__dot" />
        <span className="onboarding-switch-guide__button onboarding-switch-guide__button--current">
          <CurrentIcon size={compact ? 11 : 13} />
        </span>
        <span className="onboarding-switch-guide__button onboarding-switch-guide__button--next">
          <NextIcon size={compact ? 11 : 13} />
        </span>
      </span>
    </div>
  )
}

function WorkModeCard({
  icon: Icon,
  title,
  description,
  action,
  mode,
  onSelect,
}: {
  icon: LucideIcon
  title: string
  description: string
  action: string
  mode: WorkModeChoice
  onSelect: (mode: WorkModeChoice) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      className="group rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-primary/5"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon size={20} />
        </div>
        <WorkModeSwitchGuide activeMode={mode} compact />
      </div>
      <h2 className="type-body-lg font-semibold">{title}</h2>
      <p className="mt-2 type-body leading-6 text-muted-foreground">{description}</p>
      <span className="mt-5 inline-flex items-center gap-1.5 type-body font-medium text-primary">
        {action}
        <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  )
}
