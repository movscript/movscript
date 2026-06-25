import { useEffect, useState, type CSSProperties } from 'react'
import { useResizablePanel } from '@movscript/ui/layout'

import {
  EDITING_INSPECTOR_MAX_WIDTH,
  EDITING_INSPECTOR_MIN_WIDTH,
  EDITING_LIBRARY_MAX_WIDTH,
  EDITING_LIBRARY_MIN_WIDTH,
  EDITING_TIMELINE_MAX_HEIGHT,
  EDITING_TIMELINE_MIN_HEIGHT,
} from '../domain/constants'
import { persistEditingLayoutSizes, readEditingLayoutSizes, subscribeEditingLayoutSizes } from './layoutPersistence'

export function useEditingWorkspaceLayout() {
  const [layoutSizes, setLayoutSizes] = useState(readEditingLayoutSizes)
  useEffect(() => subscribeEditingLayoutSizes(() => {
    setLayoutSizes(readEditingLayoutSizes())
  }), [])
  const layoutStyle = {
    '--editing-library-width': `${layoutSizes.libraryWidth}px`,
    '--editing-inspector-width': `${layoutSizes.inspectorWidth}px`,
    '--editing-timeline-height': `${layoutSizes.timelineHeight}px`,
  } as CSSProperties
  const libraryResize = useResizablePanel({
    size: layoutSizes.libraryWidth,
    onSizeChange: (libraryWidth) => setLayoutSizes((current) => ({ ...current, libraryWidth })),
    onSizeCommit: (libraryWidth) => persistEditingLayoutSizes({ ...layoutSizes, libraryWidth }),
    minSize: EDITING_LIBRARY_MIN_WIDTH,
    maxSize: EDITING_LIBRARY_MAX_WIDTH,
    resizeEdge: 'right',
    ariaLabel: '调整素材资源库宽度',
  })
  const inspectorResize = useResizablePanel({
    size: layoutSizes.inspectorWidth,
    onSizeChange: (inspectorWidth) => setLayoutSizes((current) => ({ ...current, inspectorWidth })),
    onSizeCommit: (inspectorWidth) => persistEditingLayoutSizes({ ...layoutSizes, inspectorWidth }),
    minSize: EDITING_INSPECTOR_MIN_WIDTH,
    maxSize: EDITING_INSPECTOR_MAX_WIDTH,
    resizeEdge: 'left',
    ariaLabel: '调整 Inspector 详情宽度',
  })
  const timelineResize = useResizablePanel({
    size: layoutSizes.timelineHeight,
    onSizeChange: (timelineHeight) => setLayoutSizes((current) => ({ ...current, timelineHeight })),
    onSizeCommit: (timelineHeight) => persistEditingLayoutSizes({ ...layoutSizes, timelineHeight }),
    minSize: EDITING_TIMELINE_MIN_HEIGHT,
    maxSize: EDITING_TIMELINE_MAX_HEIGHT,
    resizeEdge: 'top',
    ariaLabel: '调整时间线高度',
  })

  return {
    inspectorResize,
    layoutStyle,
    libraryResize,
    timelineResize,
  }
}
