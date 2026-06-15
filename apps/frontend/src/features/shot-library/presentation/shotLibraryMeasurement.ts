import {
  shotLibraryMeasuredBoxFromRect,
  type ShotLibraryMeasuredBox,
} from '@/features/shot-library/domain/shotLibraryLayout'
import { listenToWindowEvent } from '@/shared/infrastructure/windowEvents'

export interface ShotLibraryMeasuredElement {
  getBoundingClientRect(): Pick<DOMRectReadOnly, 'width' | 'height'>
}

export function shotLibraryMeasuredBoxFromElement(
  element: ShotLibraryMeasuredElement,
): ShotLibraryMeasuredBox {
  return shotLibraryMeasuredBoxFromRect(element.getBoundingClientRect())
}

export function subscribeShotLibraryMeasuredBox(
  element: HTMLElement | null | undefined,
  onMeasure: (box: ShotLibraryMeasuredBox) => void,
) {
  if (!element) return () => {}

  const update = () => onMeasure(shotLibraryMeasuredBoxFromElement(element))
  update()

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }

  return listenToWindowEvent('resize', update)
}
