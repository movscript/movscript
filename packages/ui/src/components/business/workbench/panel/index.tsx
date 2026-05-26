import type { ReactNode } from "react";

import type { SurfaceEmphasis } from "../../../primitives";
import { WorkbenchSection } from "../section";
import type { WorkbenchIconComponent } from "../types";

export function WorkbenchPanel({
  title,
  icon,
  children,
  action,
  emphasis,
  className,
  bodyClassName,
}: {
  title: string;
  icon: WorkbenchIconComponent;
  children: ReactNode;
  action?: ReactNode;
  emphasis?: SurfaceEmphasis;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <WorkbenchSection
      title={title}
      icon={icon}
      action={action}
      emphasis={emphasis}
      className={className}
      bodyClassName={bodyClassName}
    >
      {children}
    </WorkbenchSection>
  );
}
