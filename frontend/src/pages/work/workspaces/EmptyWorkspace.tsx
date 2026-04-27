import type { EntityKind } from '../config'
import { KIND_CONFIG } from '../config'
import { useTranslation } from 'react-i18next'

export function EmptyWorkspace({ kind }: { kind: EntityKind }) {
  const { t } = useTranslation()
  const cfg = KIND_CONFIG[kind]
  const Icon = cfg.icon
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
      <Icon size={40} className="opacity-20" />
      <p className="text-sm">{t('work.emptyWorkspace', { entity: t(cfg.labelKey) })}</p>
    </div>
  )
}
