import type { DetailsHTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Frame, FrameBody, FrameHeader } from "../../../../primitives";

export function AppDisclosure({
  title,
  children,
  className,
  bodyClassName,
  ...props
}: Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "title"> & {
  title: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <Frame as="details" kind="panel" density="normal" emphasis="plain" className={cn("app-disclosure", className)} {...props}>
      <FrameHeader as="summary" className="app-disclosure__summary">{title}</FrameHeader>
      <FrameBody className={cn("app-disclosure__body", bodyClassName)}>{children}</FrameBody>
    </Frame>
  );
}
