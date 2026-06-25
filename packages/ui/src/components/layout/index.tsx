import type { HTMLAttributes, ReactNode } from "react";
import type { IconComponent } from "../primitives/types";
import { cn } from "../../lib/cn";
import type { LayoutChrome } from "./chrome";
import { useAppShellSurfaceBackground } from "./surface-background";

export { useAppShellSurfaceBackground } from "./surface-background";

export * from "./workspace";
export * from "./app-shell";
export * from "./chrome";
export * from "./route-layout";
export * from "./route-layout-pane-controller";

export type AppContentLayoutVariant =
  | "contained"
  | "workspace"
  | "editor"
  | "narrow";

export type AppContentLayoutWidth =
  | "narrow"
  | "normal"
  | "wide"
  | "xwide"
  | "full";

export type AppRouteViewportScroll = "auto" | "owned" | "hidden";

export function AppRouteViewport({
  children,
  className,
  scroll = "auto",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  scroll?: AppRouteViewportScroll;
}) {
  return (
    <div data-scroll={scroll} className={cn("app-route-viewport", className)} {...props}>
      {children}
    </div>
  );
}

export interface SurfaceRouteFrameContentOptions {
  variant?: AppContentLayoutVariant;
  width?: AppContentLayoutWidth;
  padding?: "normal" | "compact" | "none";
  scroll?: "auto" | "hidden";
  className?: string;
  contentClassName?: string;
}

export function SurfaceRouteFrame({
  children,
  className,
  viewportScroll = "auto",
  content = {},
}: {
  children: ReactNode;
  className?: string;
  viewportScroll?: AppRouteViewportScroll;
  content?: SurfaceRouteFrameContentOptions | false;
}) {
  return (
    <AppRouteViewport scroll={viewportScroll} className={className}>
      {content === false ? children : (
        <AppContentLayout
          variant={content.variant ?? "contained"}
          width={content.width}
          padding={content.padding}
          scroll={content.scroll}
          className={content.className}
          contentClassName={content.contentClassName}
        >
          {children}
        </AppContentLayout>
      )}
    </AppRouteViewport>
  );
}

export function AppContentLayout({
  children,
  className,
  contentClassName,
  chrome = "workspace",
  variant = "contained",
  width,
  padding = "normal",
  scroll = "auto",
  surfaceBackground,
  surfaceHeaderBackground,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  chrome?: Extract<LayoutChrome, "workspace" | "immersive" | "canvas">;
  contentClassName?: string;
  variant?: AppContentLayoutVariant;
  width?: AppContentLayoutWidth;
  padding?: "normal" | "compact" | "none";
  scroll?: "auto" | "hidden";
  surfaceBackground?: string;
  surfaceHeaderBackground?: string;
}) {
  const resolvedWidth = width ?? defaultContentWidth(variant);
  useAppShellSurfaceBackground({
    center: surfaceBackground,
    header: surfaceHeaderBackground ?? surfaceBackground,
  });

  return (
    <div
      data-chrome={chrome}
      data-variant={variant}
      data-padding={padding}
      data-scroll={scroll}
      className={cn("app-content-layout", className)}
      {...props}
    >
      <div
        className={cn(
          "app-content-layout__inner",
          `app-content-layout__inner--${resolvedWidth}`,
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function defaultContentWidth(variant: AppContentLayoutVariant): AppContentLayoutWidth {
  if (variant === "narrow") return "narrow";
  if (variant === "editor" || variant === "workspace") return "full";
  return "xwide";
}

export function AppPageShell({
  children,
  className,
  chrome = "workspace",
  surfaceBackground,
  surfaceHeaderBackground,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  chrome?: Extract<LayoutChrome, "workspace" | "immersive" | "canvas">;
  surfaceBackground?: string;
  surfaceHeaderBackground?: string;
}) {
  useAppShellSurfaceBackground({
    center: surfaceBackground,
    header: surfaceHeaderBackground ?? surfaceBackground,
  });

  return (
    <div className={cn("app-page-shell", className)} data-chrome={chrome} {...props}>
      {children}
    </div>
  );
}

export function AppPageShellHeader({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <header className={cn("app-page-shell__header", className)} {...props}>
      {children}
    </header>
  );
}

export function AppPageShellBody({
  children,
  className,
  padding = "normal",
  scroll = "auto",
  ...props
}: HTMLAttributes<HTMLElement> & {
  padding?: "normal" | "none";
  scroll?: "auto" | "hidden" | "responsive-split";
}) {
  return (
    <main data-padding={padding} data-scroll={scroll} className={cn("app-page-shell__body", className)} {...props}>
      {children}
    </main>
  );
}

export function AppPageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  icon?: IconComponent;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("ms-page-header app-page-header", className)}>
      <div className="ms-page-header__lead app-page-header__lead">
        {Icon ? (
          <span className="ms-center ms-page-header__icon app-page-header__icon">
            <Icon size={18} />
          </span>
        ) : null}
        <div className="ms-page-header__copy app-page-header__copy">
          {eyebrow ? <div className="ms-page-header__cluster app-page-header__eyebrow">{eyebrow}</div> : null}
          <h1 className="ms-page-header__title app-page-header__title">{title}</h1>
          {description ? <p className="ms-page-header__description app-page-header__description">{description}</p> : null}
          {meta ? <div className="ms-page-header__cluster app-page-header__meta">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="ms-page-header__actions app-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function ProjectSurfaceHeader({
  icon: Icon,
  title,
  description,
  meta,
  actions,
  className,
}: {
  icon: IconComponent;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("ms-page-header project-surface-header", className)}>
      <div className="ms-page-header__lead project-surface-header__lead">
        <span className="ms-center ms-page-header__icon project-surface-header__icon">
          <Icon size={18} />
        </span>
        <div className="ms-page-header__copy project-surface-header__copy">
          <div className="ms-page-header__cluster project-surface-header__title-row">
            <h1 className="ms-page-header__title project-surface-header__title">{title}</h1>
            {meta}
          </div>
          {description ? <p className="ms-page-header__description project-surface-header__description">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="ms-page-header__actions project-surface-header__actions">{actions}</div> : null}
    </header>
  );
}
