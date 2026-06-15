import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../../../lib/cn";
import { Frame, FrameActions, FrameBody, FrameDescription, FrameHeader, FrameHeading, FrameTitle, type SurfaceEmphasis } from "../../../primitives";
import type { WorkbenchIconComponent } from "../types";

export function WorkbenchSection({
  title,
  description,
  icon: Icon,
  action,
  children,
  emphasis = "plain",
  className,
  bodyClassName,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  icon?: WorkbenchIconComponent;
  action?: ReactNode;
  children: ReactNode;
  emphasis?: SurfaceEmphasis;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Frame as="section" kind="section" density="normal" emphasis={emphasis} className={cn("workbench-section", className)} {...props}>
      {title || description || Icon || action ? (
        <FrameHeader className="ms-surface__header workbench-section__header">
          <FrameHeading className="ms-surface__heading workbench-section__heading">
            {Icon ? <Icon size={14} className="ms-surface__icon workbench-section__icon" /> : null}
            <div className="ms-surface__copy workbench-section__copy">
              {title ? <FrameTitle className="ms-surface__title workbench-section__title">{title}</FrameTitle> : null}
              {description ? <FrameDescription className="ms-surface__description workbench-section__description">{description}</FrameDescription> : null}
            </div>
          </FrameHeading>
          {action ? <FrameActions className="ms-surface__action workbench-section__action">{action}</FrameActions> : null}
        </FrameHeader>
      ) : null}
      <FrameBody className={cn("ms-surface__body workbench-section__body", bodyClassName)}>{children}</FrameBody>
    </Frame>
  );
}
