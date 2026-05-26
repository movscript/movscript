import type { ReactNode } from "react";

import { AppSection } from "../../../app";
import { Badge } from "../../../../primitives";
import type { IconComponent } from "../../types";

export function ReviewProposalShell({
  kind,
  title,
  description,
  countLabel,
  action,
  children,
  className,
  icon,
}: {
  kind: string;
  title: string;
  description: string;
  countLabel?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: IconComponent;
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
      className={className}
    >
      {children}
    </AppSection>
  );
}
