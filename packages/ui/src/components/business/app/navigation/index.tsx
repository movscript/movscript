import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes, type ReactNode } from "react";

import {
  Button,
  DialogContent,
  DropdownMenuContent,
  Input,
  Label,
  NativeSelect,
  Textarea,
  type ButtonProps,
  type InputProps,
  type LabelProps,
  type NativeSelectProps,
  type TextareaProps,
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

export function AppTopLanguageLabel({ className, ...props }: LabelProps) {
  return <Label className={cn("app-top-controls__sr-label", className)} {...props} />;
}

export function AppTopLanguageSelect({
  density = "default",
  className,
  ...props
}: NativeSelectProps & {
  density?: "default" | "compact";
}) {
  return <NativeSelect data-density={density} className={cn("app-top-language-select", className)} {...props} />;
}

export function AppTopProjectMenuContent({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownMenuContent>) {
  return <DropdownMenuContent align="end" className={cn("app-top-project-menu", className)} {...props} />;
}

export function AppTopUserMenuContent({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownMenuContent>) {
  return <DropdownMenuContent align="end" className={cn("app-top-user-menu", className)} {...props} />;
}

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

export function AppTopMenuSelectedIcon({ icon: Icon }: { icon: IconComponent }) {
  return <Icon size={14} className="app-top-menu-item__selected-icon" />;
}

export function AppTopCreateProjectDialogContent(props: ComponentPropsWithoutRef<typeof DialogContent>) {
  return <DialogContent className="app-top-create-project-dialog" {...props} />;
}

export function AppTopCreateProjectForm({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-top-create-project-form", className)} {...props} />;
}

export function AppTopCreateProjectField({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-top-create-project-field", className)} {...props} />;
}

export function AppTopCreateProjectLabel(props: LabelProps) {
  return <Label {...props} />;
}

export function AppTopCreateProjectInput(props: InputProps) {
  return <Input {...props} />;
}

export function AppTopCreateProjectTextarea(props: TextareaProps) {
  return <Textarea {...props} />;
}

export function AppTopCreateProjectActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-top-create-project-actions", className)} {...props} />;
}

export function AppTopCreateProjectActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("app-top-create-project-action", className)} {...props} />;
}
