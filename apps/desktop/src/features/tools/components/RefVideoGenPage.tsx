import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'
import { ResourceLibraryView } from '@movscript/resource-surface/pages'

export default function RefVideoGenPage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="ref_video_gen"
      capability="video"
      modelQueryCapabilities={['video_i2v', 'video', 'video_v2v']}
      toolName={t('tools.defs.refVideoGen.name')}
      toolDescription={t('tools.defs.refVideoGen.description')}
      inputType="image+video"
      outputType="video"
      promptPlaceholder={t('tools.defs.refVideoGen.promptPlaceholder')}
      layout="reference-workbench"
      showHistory={false}
      resourcePane={<ResourceLibraryView variant="pane" />}
    />
  )
}
