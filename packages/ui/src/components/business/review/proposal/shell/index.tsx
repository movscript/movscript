import type { ReactNode } from "react";

import { AppSection } from "../../../app";
import { Badge } from "../../../../primitives";
import type { IconComponent } from "../../types";
import { cn } from "../../../../../lib/cn";

export function ReviewProposalShell({
  kind,
  title,
  description,
  countLabel,
  action,
  children,
  className,
  icon,
  layout = "default",
}: {
  kind: string;
  title: string;
  description: string;
  countLabel?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: IconComponent;
  layout?: "default" | "contained-scroll";
}) {
  const sectionAction = countLabel || action ? (
    <>
      {countLabel ? <Badge>{countLabel}</Badge> : null}
      {action}
    </>
  ) : null;

  return (
    <AppSection
      icon={icon}
      eyebrow={kind}
      title={title}
      description={description}
      action={sectionAction}
      className={cn("review-proposal-shell", layout !== "default" && `review-proposal-shell--${layout}`, className)}
      bodyClassName={layout !== "default" ? "review-proposal-shell__body" : undefined}
    >
      {children}
    </AppSection>
  );
}
