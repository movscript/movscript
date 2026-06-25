import type { ComponentProps } from 'react'
import { CanvasEditorAuxiliaryPanels } from './CanvasEditorAuxiliaryPanels'
import { CanvasEditorChromeBar } from './CanvasEditorChromeBar'
import { CanvasEditorNodePalette } from './CanvasEditorNodePalette'
import { CanvasEditorViewport } from './CanvasEditorViewport'
import {
  CanvasEditorContent,
  CanvasEditorMain,
  CanvasEditorShell,
} from '../ui/CanvasEditorUi'

interface CanvasEditorWorkspaceViewProps {
  auxiliaryPanelsProps: ComponentProps<typeof CanvasEditorAuxiliaryPanels>
  chromeBarProps: ComponentProps<typeof CanvasEditorChromeBar>
  embedded: boolean
  paletteProps: ComponentProps<typeof CanvasEditorNodePalette>
  useAppHeader: boolean
  viewportProps: ComponentProps<typeof CanvasEditorViewport>
}

export function CanvasEditorWorkspaceView({
  auxiliaryPanelsProps,
  chromeBarProps,
  embedded,
  paletteProps,
  useAppHeader,
  viewportProps,
}: CanvasEditorWorkspaceViewProps) {
  return (
    <CanvasEditorShell embedded={embedded}>
      {!useAppHeader && <CanvasEditorChromeBar {...chromeBarProps} />}

      <CanvasEditorMain>
        <CanvasEditorNodePalette {...paletteProps} />

        <CanvasEditorContent>
          <CanvasEditorViewport {...viewportProps} />
          <CanvasEditorAuxiliaryPanels {...auxiliaryPanelsProps} />
        </CanvasEditorContent>
      </CanvasEditorMain>
    </CanvasEditorShell>
  )
}
