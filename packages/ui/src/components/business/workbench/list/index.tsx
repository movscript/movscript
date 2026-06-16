import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../../../lib/cn";
import { Frame, type SurfaceProps } from "../../../primitives";
import type { WorkbenchDensity } from "../types";

export function WorkbenchList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ms-workbench-list workbench-list", className)} {...props}>
      {children}
    </div>
  );
}

export function WorkbenchListItem({
  active,
  density = "normal",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  density?: WorkbenchDensity;
}) {
  return (
    <Frame
      as="button"
      type="button"
      kind="item"
      tone="brand"
      density={density === "compact" ? "compact" : "normal"}
      emphasis="plain"
      interaction={active ? "selected" : "selectable"}
      data-active={active ? "true" : undefined}
      className={cn("ms-workbench-selectable workbench-list-item", className)}
      {...props}
    >
      {children}
    </Frame>
  );
}

export function WorkbenchSurfaceItem({
  active,
  asChild = false,
  density = "normal",
  emphasis = "plain",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  asChild?: boolean;
  density?: WorkbenchDensity;
  emphasis?: SurfaceProps["emphasis"];
  children?: ReactNode;
}) {
  return (
    <Frame
      asChild={asChild}
      kind="item"
      tone="brand"
      density={density === "compact" ? "compact" : "normal"}
      emphasis={emphasis}
      interaction={active ? "selected" : "selectable"}
      data-active={active ? "true" : undefined}
      className={cn("ms-workbench-selectable workbench-list-item", className)}
      {...props}
    >
      {children}
    </Frame>
  );
}
