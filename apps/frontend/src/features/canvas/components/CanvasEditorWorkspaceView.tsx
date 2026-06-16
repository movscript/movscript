import type { ComponentProps } from 'react'
import { CanvasEditorAuxiliaryPanels } from '@/features/canvas/components/CanvasEditorAuxiliaryPanels'
import { CanvasEditorChromeBar } from '@/features/canvas/components/CanvasEditorChromeBar'
import { CanvasEditorNodePalette } from '@/features/canvas/components/CanvasEditorNodePalette'
import { CanvasEditorViewport } from '@/features/canvas/components/CanvasEditorViewport'
import {
  CanvasEditorContent,
  CanvasEditorMain,
  CanvasEditorShell,
} from '@/features/canvas/ui/CanvasEditorUi'

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
