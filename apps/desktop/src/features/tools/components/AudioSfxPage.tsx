import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'

export default function AudioSfxPage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="audio_sfx"
      capability="audio_sfx"
      jobType="audio_sfx"
      toolName={t('tools.defs.audioSfx.name')}
      toolDescription={t('tools.defs.audioSfx.description')}
      inputType="none"
      outputType="audio"
      promptPlaceholder={t('tools.defs.audioSfx.promptPlaceholder')}
    />
  )
}
