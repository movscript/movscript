import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Frame, FrameActions, FrameBody, FrameHeader, FrameHeading, FrameTitle, type SurfaceProps } from "../../../../primitives";
import type { IconComponent } from "../../../../primitives/types";

export function AppPanel({
  children,
  title,
  icon: Icon,
  iconClassName,
  action,
  emphasis = "plain",
  className,
  bodyClassName,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  icon?: IconComponent;
  iconClassName?: string;
  action?: ReactNode;
  emphasis?: SurfaceProps["emphasis"];
  bodyClassName?: string;
}) {
  return (
    <Frame as="section" kind="panel" density="normal" emphasis={emphasis} className={cn("app-panel", className)} {...props}>
      {title || Icon || action ? (
        <FrameHeader className="ms-surface__header app-panel__header">
          <FrameHeading className="ms-surface__heading app-panel__heading">
            {Icon ? <Icon size={14} className={cn("ms-surface__icon app-panel__icon", iconClassName)} /> : null}
            {title ? <FrameTitle className="ms-surface__title app-panel__title">{title}</FrameTitle> : null}
          </FrameHeading>
          {action ? <FrameActions className="ms-surface__action app-panel__action">{action}</FrameActions> : null}
        </FrameHeader>
      ) : null}
      <FrameBody className={cn("ms-surface__body app-panel__body", bodyClassName)}>{children}</FrameBody>
    </Frame>
  );
}
