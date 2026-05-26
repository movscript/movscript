import type { HTMLAttributes, TableHTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";
import type { SemanticTone } from "../../../../../semantic";

export function AppDataTable({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("app-data-table", className)} {...props} />;
}

export function AppDataTableHeader({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("app-data-table__header", className)} {...props} />;
}

export function AppDataTableRow({
  interactive = false,
  tone,
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & {
  interactive?: boolean;
  tone?: SemanticTone;
}) {
  return (
    <tr
      data-interactive={interactive ? "true" : undefined}
      data-tone={tone}
      className={cn("app-data-table__row", className)}
      {...props}
    />
  );
}
