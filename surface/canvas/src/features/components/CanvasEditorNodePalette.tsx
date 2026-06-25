import type { TFunction } from 'i18next'
import { GripVertical, Layers3, Search, type LucideIcon } from 'lucide-react'
import {
  CanvasPaletteCollapsedBody,
  CanvasPaletteCollapsedGroup,
  CanvasPaletteCollapsedItemButton,
  CanvasPaletteCollapsedItems,
  CanvasPaletteExpandedBody,
  CanvasPaletteHeader,
  CanvasPaletteHint,
  CanvasPaletteInner,
  CanvasPaletteItemButton,
  CanvasPaletteItemGrid,
  CanvasPalettePanel,
  CanvasPaletteSection,
  CanvasPaletteSectionDescription,
  CanvasPaletteSectionHeader,
  CanvasPaletteSections,
  CanvasPaletteSectionTitle,
} from '../ui/CanvasEditorUi'

import { startCanvasNodeTemplateDrag } from '../domain/canvasDropTarget'
import type { NodeType } from '@movscript/shared'

type CanvasPaletteSectionView = {
  category: {
    id: string
    titleKey: string
    descriptionKey: string
  }
  items: Array<{
    type: NodeType
    icon: LucideIcon
    labelKey: string
    descriptionKey: string
  }>
}

export function CanvasEditorNodePalette({
  collapsed,
  sections,
  onAddNode,
  t,
}: {
  collapsed: boolean
  sections: CanvasPaletteSectionView[]
  onAddNode: (type: NodeType) => void
  t: TFunction
}) {
  return (
    <CanvasPalettePanel collapsed={collapsed}>
      <CanvasPaletteInner>
        {!collapsed && (
          <CanvasPaletteHeader icon={<Layers3 size={14} />}>
            {t('canvas.editor.nodeLibrary')}
          </CanvasPaletteHeader>
        )}

        {collapsed ? (
          <CanvasPaletteCollapsedBody>
            {sections.map(({ category, items }, index) => (
              <CanvasPaletteCollapsedGroup key={category.id} separated={index > 0}>
                <CanvasPaletteCollapsedItems>
                  {items.map((item) => {
                    const Icon = item.icon
                    return (
                      <CanvasPaletteCollapsedItemButton
                        key={item.type}
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          startCanvasNodeTemplateDrag(event.dataTransfer, item.type)
                        }}
                        onClick={() => onAddNode(item.type)}
                        title={t(item.labelKey)}
                        aria-label={t(item.labelKey)}
                      >
                        <Icon size={14} />
                      </CanvasPaletteCollapsedItemButton>
                    )
                  })}
                </CanvasPaletteCollapsedItems>
              </CanvasPaletteCollapsedGroup>
            ))}
          </CanvasPaletteCollapsedBody>
        ) : (
          <CanvasPaletteExpandedBody>
            <CanvasPaletteHint icon={<Search size={12} />}>
              {t('canvas.editor.nodeLibraryHint')}
            </CanvasPaletteHint>
            <CanvasPaletteSections>
              {sections.map(({ category, items }) => (
                <CanvasPaletteSection key={category.id}>
                  <CanvasPaletteSectionHeader>
                    <CanvasPaletteSectionTitle>{t(category.titleKey)}</CanvasPaletteSectionTitle>
                    <CanvasPaletteSectionDescription>{t(category.descriptionKey)}</CanvasPaletteSectionDescription>
                  </CanvasPaletteSectionHeader>
                  <CanvasPaletteItemGrid>
                    {items.map((item) => {
                      const Icon = item.icon
                      return (
                        <CanvasPaletteItemButton
                          key={item.type}
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            startCanvasNodeTemplateDrag(event.dataTransfer, item.type)
                          }}
                          onClick={() => onAddNode(item.type)}
                          icon={<Icon size={14} />}
                          title={t(item.labelKey)}
                          description={t(item.descriptionKey)}
                          dragHandle={<GripVertical size={14} />}
                        />
                      )
                    })}
                  </CanvasPaletteItemGrid>
                </CanvasPaletteSection>
              ))}
            </CanvasPaletteSections>
          </CanvasPaletteExpandedBody>
        )}
      </CanvasPaletteInner>
    </CanvasPalettePanel>
  )
}
