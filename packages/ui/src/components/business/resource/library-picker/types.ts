import type { ReactNode } from "react";

import type { IconComponent } from "../../../primitives/types";

export type ResourceLibraryPickerOption = {
  value: string;
  label: ReactNode;
};

export type ResourceLibraryPickerItem = {
  id: string;
  title: ReactNode;
  meta: ReactNode;
  thumbnail?: ReactNode;
  fallbackIcon?: IconComponent;
  selected?: boolean;
};
