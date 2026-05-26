import type { CSSProperties, ReactNode } from "react";

import { cn } from "../../../lib/cn";

export function WorkspaceShell({
  sidebar,
  header,
  children,
  assistantPanel,
  contentFrameClassName,
  contentPaddingClassName = "p-2.5",
}: {
  sidebar?: ReactNode;
  header: ReactNode;
  children: ReactNode;
  assistantPanel?: ReactNode;
  contentFrameClassName?: string;
  contentPaddingClassName?: string;
}) {
  return (
    <div className="app-shell fixed inset-0 flex flex-col overflow-hidden text-foreground">
      {header}
      <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
          {sidebar}
          <div className={cn("min-w-0 flex-1 overflow-hidden", contentPaddingClassName)}>
            <div className={cn("app-content-frame h-full min-h-0 min-w-0 overflow-hidden rounded-lg", contentFrameClassName)}>
              {children}
            </div>
          </div>
          {assistantPanel}
        </div>
      </main>
    </div>
  );
}

export function ContentWorkspaceLayout({
  header,
  overview,
  filters,
  list,
  preview,
  detail,
  upstream,
  downstream,
  bottom,
  listWidth = "360px",
  detailWidth = "minmax(0, 1fr)",
  className,
  flow = false,
}: {
  header?: ReactNode;
  overview: ReactNode;
  filters?: ReactNode;
  list: ReactNode;
  preview: ReactNode;
  detail: ReactNode;
  upstream: ReactNode;
  downstream: ReactNode;
  bottom?: ReactNode;
  listWidth?: string;
  detailWidth?: string;
  className?: string;
  flow?: boolean;
}) {
  const contentStyle = {
    "--ui-content-workspace-columns": `${listWidth} ${detailWidth}`,
  } as CSSProperties;

  return (
    <div className={cn("content-workspace-shell bg-background", flow ? "" : "h-full overflow-auto", className)}>
      <div className="space-y-3 p-4" style={contentStyle}>
        {header ? <section className="content-workspace-header">{header}</section> : null}
        <section className="content-workspace-overview">{overview}</section>
        {filters ? <section>{filters}</section> : null}
        <section className={cn("content-workspace-core grid gap-4", flow ? "" : "h-[min(820px,82vh)] min-h-[560px] overflow-hidden")}>
          <div className={cn("content-workspace-column min-w-0", flow ? "space-y-4" : "min-h-0 space-y-4 overflow-y-auto pr-1")}>{list}</div>
          <div className={cn("content-workspace-column min-w-0", flow ? "flex flex-col gap-4" : "min-h-0 space-y-4 overflow-y-auto pr-1")}>
            {detail}
            {preview}
          </div>
        </section>
        <section className="border-t border-border pt-4">
          {bottom ?? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="min-w-0 space-y-4">{upstream}</div>
              <div className="min-w-0 space-y-4">{downstream}</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function MasterDetail({
  list,
  detail,
  listWidth = 288,
  className,
}: {
  list: ReactNode;
  detail: ReactNode;
  listWidth?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full overflow-hidden bg-background", className)}>
      <div style={{ width: listWidth }} className="shrink-0 border-r border-border flex flex-col overflow-hidden bg-muted/50">
        {list}
      </div>
      <div className="flex-1 overflow-hidden">{detail}</div>
    </div>
  );
}

export function EmptyDetail({ message }: { message?: string }) {
  return <div className="h-full flex items-center justify-center text-muted-foreground type-body">{message ?? "Empty"}</div>;
}
