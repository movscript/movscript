import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import {
  Button,
  type ButtonProps,
} from "../../../primitives";
import { ChevronLeftIcon, ChevronRightIcon } from "../../../primitives/icons";
import type { IconComponent } from "../../../primitives/types";
import { cn } from "../../../../lib/cn";

export const AppWindowIconButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "icon-xs", ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn("app-window-icon-button", className)}
        {...props}
      />
    );
  }
);

AppWindowIconButton.displayName = "AppWindowIconButton";

export function AppPager({
  page,
  pageCount,
  summary,
  previousLabel = "Previous page",
  nextLabel = "Next page",
  onPage,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  page: number;
  pageCount: number;
  summary: ReactNode;
  previousLabel?: string;
  nextLabel?: string;
  onPage: (page: number) => void;
}) {
  const safePageCount = Math.max(1, pageCount);
  const safePage = Math.min(Math.max(1, page), safePageCount);

  return (
    <div className={cn("app-pager", className)} {...props}>
      <span className="app-pager__summary">{summary}</span>
      <div className="app-pager__controls">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={safePage <= 1}
          aria-label={previousLabel}
          onClick={() => onPage(Math.max(1, safePage - 1))}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="app-pager__status">{safePage}/{safePageCount}</span>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={safePage >= safePageCount}
          aria-label={nextLabel}
          onClick={() => onPage(Math.min(safePageCount, safePage + 1))}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}

export function AppTopControlsRoot({
  density = "default",
  extraClassName,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  density?: "default" | "compact";
  extraClassName?: string;
}) {
  return <div data-density={density} className={cn("app-top-controls", extraClassName, className)} {...props} />;
}

export const AppTopControlButton = forwardRef<HTMLButtonElement, ButtonProps & {
  density?: "default" | "compact";
  active?: boolean;
}>(({
  density = "default",
  active = false,
  className,
  ...props
}, ref) => {
  return (
    <Button
      ref={ref}
      size={density === "compact" ? "icon-xs" : "icon-sm"}
      data-density={density}
      data-active={active ? "true" : "false"}
      className={cn("app-top-control-button", className)}
      {...props}
    />
  );
});

AppTopControlButton.displayName = "AppTopControlButton";

export function AppTopMenuLabelPrimary({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("app-top-menu-label__primary", className)} {...props} />;
}

export function AppTopMenuLabelSecondary({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("app-top-menu-label__secondary", className)} {...props} />;
}

export function AppTopMenuItemText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("app-top-menu-item__text", className)} {...props} />;
}

export function AppTopMenuLeadingIcon({ icon: Icon }: { icon: IconComponent }) {
  return <Icon size={14} className="app-top-menu-item__leading-icon" />;
}
