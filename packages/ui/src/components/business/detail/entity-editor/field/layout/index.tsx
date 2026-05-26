import type { FormHTMLAttributes, HTMLAttributes } from "react";

import { cn } from "../../../../../../lib/cn";

export function DetailEntityForm({
  children,
  divided = false,
  className,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & {
  divided?: boolean;
}) {
  return (
    <form className={cn("detail-entity-form", divided && "detail-entity-form--divided", className)} {...props}>
      {children}
    </form>
  );
}

export function DetailEntityFieldGrid({
  children,
  columns = "single",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  columns?: "single" | "responsive";
}) {
  return (
    <div data-columns={columns} className={cn("detail-entity-field-grid", className)} {...props}>
      {children}
    </div>
  );
}
