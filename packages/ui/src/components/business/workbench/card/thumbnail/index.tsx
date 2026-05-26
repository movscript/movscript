import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { EmptyState, Surface } from "../../../../primitives";
import { ImageIcon } from "../../../../primitives/icons";
import type { WorkbenchIconComponent } from "../../types";

export function WorkbenchThumbnail({
  children,
  icon: Icon = ImageIcon,
  label,
  fit = "cover",
  ratio = "default",
  className,
  ...props
}: {
  children?: ReactNode;
  icon?: WorkbenchIconComponent;
  label?: ReactNode;
  fit?: "cover" | "contain";
  ratio?: "square" | "wide" | "banner" | "default";
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <Surface kind="media" density="normal" emphasis="muted" data-fit={fit} data-ratio={ratio} className={cn("ms-workbench-media-frame workbench-thumbnail", className)} {...props}>
      {children ? (
        <div className="workbench-thumbnail__media">{children}</div>
      ) : (
        <EmptyState icon={<Icon size={16} />} title={label} className="workbench-thumbnail__fallback" />
      )}
    </Surface>
  );
}
