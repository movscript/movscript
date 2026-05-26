import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'

export default function MotionImitationPage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="motion_imitation"
      capability="video"
      toolName={t('tools.defs.motionImitation.name')}
      toolDescription={t('tools.defs.motionImitation.description')}
      inputType="image+video"
      outputType="video"
      promptPlaceholder={t('tools.defs.motionImitation.promptPlaceholder')}
    />
  )
}
