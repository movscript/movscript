import * as React from "react";
import { cloneElement, type HTMLAttributes, type ReactElement, type ReactNode } from "react";

import { Slot } from "@radix-ui/react-slot";

import { AgentSurfaceBlock } from "@movscript/ui/business/agent";

import { cn } from "@/shared/ui/cn";

function isSingleElementChild(children: React.ReactNode): children is React.ReactElement {
  return React.isValidElement(children) && React.Children.count(children) === 1;
}

const AsChildSlot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
  fallback?: React.ElementType;
}>(({ children, fallback: Fallback = "div", ...props }, ref) => {
  if (isSingleElementChild(children)) {
    return <Slot ref={ref} {...props}>{children}</Slot>;
  }
  return <Fallback ref={ref} {...props}>{children}</Fallback>;
});

AsChildSlot.displayName = "AgentConsoleAsChildSlot";

export function AgentConsoleRunSummaryLink({
  children,
}: {
  children: ReactNode;
}) {
  const child = isSingleElementChild(children)
    ? cloneElement(children as ReactElement<{ className?: string }>, {
      className: cn((children as ReactElement<{ className?: string }>).props.className, "agent-console-run-summary-link"),
    })
    : <div className="agent-console-run-summary-link">{children}</div>;

  return (
    <AgentSurfaceBlock asChild variant="subtle">
      {child}
    </AgentSurfaceBlock>
  );
}

export function AgentConsoleRunSummaryHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-run-summary__header", className)} {...props} />;
}

export function AgentConsoleRunSummaryCopy({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-run-summary__copy", className)} {...props} />;
}

export function AgentConsoleRunSummaryId({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-run-summary__id", className)} {...props} />;
}

export function AgentConsoleRunSummaryMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-run-summary__meta", className)} {...props} />;
}

export function AgentConsoleRunSummaryDetail({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-console-run-summary__detail", className)} {...props} />;
}

export function AgentConsoleManagementLink({
  children,
  icon,
  title,
  detail,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: ReactNode;
  detail: ReactNode;
}) {
  const content = (
    <>
      <span className="agent-console-management-link__icon">{icon}</span>
      <span className="agent-console-management-link__copy">
        <span className="agent-console-management-link__title">{title}</span>
        <span className="agent-console-management-link__detail">{detail}</span>
      </span>
    </>
  );
  const child = isSingleElementChild(children)
    ? cloneElement(children as ReactElement<{ className?: string; children?: ReactNode }>, {
      className: cn((children as ReactElement<{ className?: string }>).props.className, "agent-console-management-link"),
      children: content,
    })
    : <div className="agent-console-management-link">{content}</div>;

  return (
    <AgentSurfaceBlock asChild variant="subtle">
      {child}
    </AgentSurfaceBlock>
  );
}

export function AgentConsoleHistoryClearLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-history-clear__layout", className)} {...props} />;
}

export function AgentConsoleHistoryClearBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-history-clear__body", className)} {...props} />;
}

export function AgentConsoleHistoryClearTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-console-history-clear__title", className)} {...props} />;
}

export function AgentConsoleHistoryClearDetail({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-console-history-clear__detail", className)} {...props} />;
}

export function AgentConsoleHistoryClearActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-history-clear__actions", className)} {...props} />;
}

export function AgentConsoleInlineLink({ children }: { children: ReactNode }) {
  return <AsChildSlot className="agent-console-inline-link">{children}</AsChildSlot>;
}
