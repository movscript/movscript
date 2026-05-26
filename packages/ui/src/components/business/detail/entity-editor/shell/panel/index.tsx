import type { ReactNode } from "react";

import { AppEmptyState, AppPanel } from "../../../../app";

export function DetailEntityEditorShell({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <AppPanel className={className} bodyClassName="detail-entity-editor-shell">
      {children}
    </AppPanel>
  );
}

export function DetailEntityEditorEmptyState({
  title,
  detail,
  className,
}: {
  title: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <AppPanel className={className} bodyClassName="detail-entity-editor-shell">
      <AppEmptyState title={title} detail={detail} compact />
    </AppPanel>
  );
}
