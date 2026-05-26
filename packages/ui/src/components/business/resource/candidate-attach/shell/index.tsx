import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Badge } from "../../../../primitives";
import { Button, type ButtonProps } from "../../../../primitives/button";

export function ResourceCandidateAttachShell({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("resource-candidate-attach", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourceCandidateAttachHeader({
  title,
  count,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  count: ReactNode;
}) {
  return (
    <div className={cn("resource-candidate-attach__header", className)} {...props}>
      <div className="resource-candidate-attach__title-row">
        <p className="resource-candidate-attach__title">{title}</p>
        <Badge className="resource-candidate-attach__count">{count}</Badge>
      </div>
      {children}
    </div>
  );
}

export function ResourceCandidateAttachBody({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("resource-candidate-attach__body", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourceCandidateAttachMessage({
  tone = "neutral",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <p data-tone={tone} className={cn("resource-candidate-attach__message", className)} {...props}>
      {children}
    </p>
  );
}

export function ResourceCandidateAttachFooter({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("resource-candidate-attach__footer", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourceCandidateAttachSubmit({ children, ...props }: ButtonProps) {
  return (
    <Button type="button" {...props}>
      {children}
    </Button>
  );
}
