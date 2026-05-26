import type { SVGAttributes } from "react";

function IconBase(props: SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function BoxIcon(props: SVGAttributes<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m21 8-9-5-9 5 9 5 9-5Z" />
      <path d="m3 8 9 5v8l-9-5V8Z" />
      <path d="m21 8-9 5v8l9-5V8Z" />
    </IconBase>
  );
}

export function MapPinIcon(props: SVGAttributes<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </IconBase>
  );
}

export function PaletteIcon(props: SVGAttributes<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 1.4-3.4 1 1 0 0 1 .7-1.7H17a4 4 0 0 0 4-4c0-4.9-4-8.9-9-8.9Z" />
      <circle cx="7.5" cy="10.5" r=".7" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7.5" r=".7" fill="currentColor" stroke="none" />
      <circle cx="14" cy="7.5" r=".7" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10.5" r=".7" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function TagIcon(props: SVGAttributes<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M20.5 13.5 13 21l-10-10V3h8l9.5 9.5a1.4 1.4 0 0 1 0 2Z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </IconBase>
  );
}

export function UserRoundIcon(props: SVGAttributes<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </IconBase>
  );
}
