import type { ReactNode } from "react";

export type ResourceScriptReferenceItem = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  content?: ReactNode;
};
