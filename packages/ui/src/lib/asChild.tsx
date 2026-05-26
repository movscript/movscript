"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

export function isSingleElementChild(children: React.ReactNode): children is React.ReactElement {
  return React.isValidElement(children) && React.Children.count(children) === 1;
}

export const AsChildSlot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
  fallback?: React.ElementType;
}>(({ children, fallback: Fallback = "div", ...props }, ref) => {
  if (isSingleElementChild(children)) {
    return <Slot ref={ref} {...props}>{children}</Slot>;
  }
  return <Fallback ref={ref} {...props}>{children}</Fallback>;
});

AsChildSlot.displayName = "AsChildSlot";
