import {
  shotLibraryMeasuredBoxFromRect,
  type ShotLibraryMeasuredBox,
} from '@/features/shot-library/domain/shotLibraryLayout'

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

  if (typeof window === 'undefined') return () => {}
  window.addEventListener('resize', update)
  return () => window.removeEventListener('resize', update)
}
