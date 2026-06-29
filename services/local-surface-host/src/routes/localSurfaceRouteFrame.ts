import type {
  SharedSurfaceContentWidth,
  SharedSurfaceRouteDefinition,
} from '@movscript/shared'
import type {
  AppContentLayoutVariant,
  AppContentLayoutWidth,
} from '@movscript/ui/layout'

export type LocalSurfaceRouteFrameVariant = 'content' | 'tool' | 'flush' | 'narrow'

export interface LocalSurfaceRouteFrameContentOptions {
  contentClassName: string
  layoutVariant: AppContentLayoutVariant
  padding: 'normal'
  width: AppContentLayoutWidth
}

export type LocalSurfaceRouteFrameOptions =
  | {
      variant: 'flush'
      className: string
      content?: undefined
    }
  | {
      variant: Exclude<LocalSurfaceRouteFrameVariant, 'flush'>
      className: string
      content: LocalSurfaceRouteFrameContentOptions
    }

const LOCAL_SURFACE_ROUTE_FRAME_WIDTH: Record<Exclude<LocalSurfaceRouteFrameVariant, 'flush'>, AppContentLayoutWidth> = {
  content: 'xwide',
  tool: 'full',
  narrow: 'narrow',
}

const LOCAL_SURFACE_CONTENT_WIDTH: Record<SharedSurfaceContentWidth, AppContentLayoutWidth> = {
  narrow: 'narrow',
  normal: 'normal',
  wide: 'wide',
  xwide: 'xwide',
  full: 'full',
}

export function localSurfaceRouteFrameVariant(
  sharedRoute: SharedSurfaceRouteDefinition | undefined,
): LocalSurfaceRouteFrameVariant {
  if (!sharedRoute) return 'content'
  if (sharedRoute.shellLayout === 'flush') return 'flush'
  if (sharedRoute.contentWidth === 'narrow') return 'narrow'
  if (sharedRoute.area === 'tool' || sharedRoute.area === 'agent') return 'tool'
  return 'content'
}

export function localSurfaceRouteFrameOptions(
  sharedRoute: SharedSurfaceRouteDefinition | undefined,
): LocalSurfaceRouteFrameOptions {
  const variant = localSurfaceRouteFrameVariant(sharedRoute)
  const className = `local-surface-route-frame local-surface-route-frame--${variant}`
  if (variant === 'flush') {
    return { variant, className }
  }

  return {
    variant,
    className,
    content: localSurfaceRouteFrameContentOptions(variant, sharedRoute),
  }
}

export function localSurfaceRouteFrameContentOptions(
  variant: Exclude<LocalSurfaceRouteFrameVariant, 'flush'>,
  sharedRoute?: SharedSurfaceRouteDefinition,
): LocalSurfaceRouteFrameContentOptions {
  return {
    contentClassName: 'local-surface-route-frame__inner',
    layoutVariant: variant === 'narrow' ? 'narrow' : 'contained',
    padding: 'normal',
    width: localSurfaceRouteContentWidth(sharedRoute?.contentWidth, variant),
  }
}

function localSurfaceRouteContentWidth(
  contentWidth: SharedSurfaceContentWidth | undefined,
  variant: Exclude<LocalSurfaceRouteFrameVariant, 'flush'>,
): AppContentLayoutWidth {
  return contentWidth ? LOCAL_SURFACE_CONTENT_WIDTH[contentWidth] : LOCAL_SURFACE_ROUTE_FRAME_WIDTH[variant]
}
