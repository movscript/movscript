import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'

export default function VideoEditPage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="video_edit"
      capability="video"
      toolName={t('tools.defs.videoEdit.name')}
      toolDescription={t('tools.defs.videoEdit.description')}
      inputType="video"
      outputType="video"
      promptPlaceholder={t('tools.defs.videoEdit.promptPlaceholder')}
    />
  )
}
