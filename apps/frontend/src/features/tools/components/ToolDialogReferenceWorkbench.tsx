import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AudioLines, FolderArchive, Image as ImageIcon, Video, Wand2 } from 'lucide-react'
import { OverlapPaneRevealButton } from '@movscript/ui/layout'
import { routeLayoutSpecForPathname } from '@/routes/routeLayoutRegistry'
import { useRouteLayoutOverlapPaneController } from '@/features/app-shell/application/useRouteLayoutOverlapPaneController'
import { TOOL_WORKBENCH_RESOURCE_PANE_ID } from '@/features/tools/presentation/toolWorkbenchLayoutSpec'
import {
  ToolDialogBody,
  ToolDialogFrame,
  ToolDialogProgramDescription,
  ToolDialogProgramHeader,
  ToolDialogProgramHeaderText,
  ToolDialogProgramMeta,
  ToolDialogProgramMetaItem,
  ToolDialogProgramTitle,
  ToolDialogResourcePane,
} from './ToolDialogUi'

export interface ReferenceWorkbenchPaneControl {
  collapsed: boolean
  collapse: () => void
}

interface ToolDialogReferenceWorkbenchProps {
  capability: 'image' | 'video' | 'audio'
  capabilityLabel: string
  inputOutputLabel: string
  renderMainPane: (resourcePaneController: ReferenceWorkbenchPaneControl) => ReactNode
  resourcePaneNode: ReactNode
  toolDescription: string
  toolName: string
}

export function ToolDialogReferenceWorkbench({
  capability,
  capabilityLabel,
  inputOutputLabel,
  renderMainPane,
  resourcePaneNode,
  toolDescription,
  toolName,
}: ToolDialogReferenceWorkbenchProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const routeLayout = routeLayoutSpecForPathname(location.pathname)
  const resourcePaneController = useRouteLayoutOverlapPaneController({
    routeLayout,
    paneId: TOOL_WORKBENCH_RESOURCE_PANE_ID,
    resizeEdge: 'left',
    ariaLabel: t('common.resize', { defaultValue: '调整宽度' }),
  })
  const resourcePaneLabel = resourcePaneController.collapsed
    ? t('tools.page.resourcePaneHidden', { defaultValue: '资源库已隐藏' })
    : t('tools.page.resourcePaneVisible', { defaultValue: '资源库已展开' })
  const mainPane = renderMainPane(resourcePaneController)

  return (
    <ToolDialogFrame className="tool-dialog-frame--reference-workbench">
      <ToolDialogProgramHeader>
        <ToolDialogProgramHeaderText>
          <ToolDialogProgramTitle>{toolName}</ToolDialogProgramTitle>
          <ToolDialogProgramDescription>{toolDescription}</ToolDialogProgramDescription>
        </ToolDialogProgramHeaderText>
        <ToolDialogProgramMeta>
          <ToolDialogProgramMetaItem icon={capability === 'video' ? <Video size={13} /> : capability === 'audio' ? <AudioLines size={13} /> : <ImageIcon size={13} />}>
            {capabilityLabel}
          </ToolDialogProgramMetaItem>
          <ToolDialogProgramMetaItem icon={<Wand2 size={13} />}>
            {inputOutputLabel}
          </ToolDialogProgramMetaItem>
          <ToolDialogProgramMetaItem icon={<FolderArchive size={13} />}>
            {resourcePaneLabel}
          </ToolDialogProgramMetaItem>
        </ToolDialogProgramMeta>
      </ToolDialogProgramHeader>
      <ToolDialogBody
        className="tool-dialog-body--reference-workbench"
        {...resourcePaneController.groupProps}
      >
        {mainPane}
        {!resourcePaneController.collapsed ? (
          <ToolDialogResourcePane
            overlapState={resourcePaneController.overlapState}
            resizeHandleProps={{
              ...resourcePaneController.resizeHandleProps,
            }}
          >
            {resourcePaneNode}
          </ToolDialogResourcePane>
        ) : null}
        {resourcePaneController.collapsed ? (
          <OverlapPaneRevealButton
            action="show"
            label={t('common.show', { defaultValue: '显示' })}
            onClick={resourcePaneController.show}
          />
        ) : null}
        {resourcePaneController.expanded ? (
          <OverlapPaneRevealButton
            action="restore"
            label={t('common.restore', { defaultValue: '还原' })}
            onClick={resourcePaneController.restore}
          />
        ) : null}
      </ToolDialogBody>
    </ToolDialogFrame>
  )
}
