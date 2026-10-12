import type { ReactNode } from "react";

export type IconName =
  | "home" | "box" | "chart" | "settings" | "refresh" | "search"
  | "chevron-right" | "chevron-left" | "arrow-left" | "alert" | "check"
  | "store" | "clock" | "info" | "shield" | "arrow-up" | "layers"
  | "filter" | "x" | "package" | "external";

export function Icon({ name, size = 20, className = "" }: {
  name: IconName; size?: number; className?: string
}) {
  let path: ReactNode;
  switch (name) {
    case "home": path = <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/></>; break;
    case "box": path = <><path d="m3 7 9-4 9 4v10l-9 4-9-4Z"/><path d="m3 7 9 5 9-5M12 12v9"/></>; break;
    case "chart": path = <><path d="M4 20h16M7 16v-5m5 5V5m5 11V9"/></>; break;
    case "settings": path = <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l-1.6 1.6a1.8 1.8 0 0 0-2-.4l-1 .4a1.8 1.8 0 0 0-1.2 1.7h-2a1.8 1.8 0 0 0-1.2-1.7l-1-.4a1.8 1.8 0 0 0-2 .4L6.2 17a1.8 1.8 0 0 0 .4-2l-.4-1a1.8 1.8 0 0 0-1.7-1.2v-2A1.8 1.8 0 0 0 6.2 9l.4-1a1.8 1.8 0 0 0-.4-2L7.8 4.4a1.8 1.8 0 0 0 2 .4l1-.4A1.8 1.8 0 0 0 12 2.7h2a1.8 1.8 0 0 0 1.2 1.7l1 .4a1.8 1.8 0 0 0 2-.4L19.8 6a1.8 1.8 0 0 0-.4 2l.4 1a1.8 1.8 0 0 0 1.7 1.2v2a1.8 1.8 0 0 0-1.7 1.2z" transform="translate(-1 -1) scale(.96)"/></>; break;
    case "refresh": path = <><path d="M20 11a8 8 0 0 0-14-5L4 8M4 4v4h4M4 13a8 8 0 0 0 14 5l2-2M20 20v-4h-4"/></>; break;
    case "search": path = <><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 4.5 4.5"/></>; break;
    case "chevron-right": path = <path d="m9 18 6-6-6-6"/>; break;
    case "chevron-left": case "arrow-left": path = <path d="m15 18-6-6 6-6"/>; break;
    case "alert": path = <><path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 4h.01"/></>; break;
    case "check": path = <path d="m5 12 4 4L19 6"/>; break;
    case "store": path = <><path d="M3 10h18l-2-6H5ZM5 10v10h14V10M9 20v-6h6v6"/></>; break;
    case "clock": path = <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>; break;
    case "info": path = <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></>; break;
    case "shield": path = <><path d="m12 2 8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5Z"/><path d="m9 12 2 2 4-4"/></>; break;
    case "arrow-up": path = <><path d="M12 20V4m-6 6 6-6 6 6"/></>; break;
    case "layers": path = <><path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/></>; break;
    case "filter": path = <><path d="M4 7h16M7 12h10m-7 5h4"/></>; break;
    case "x": path = <path d="M5 5 19 19M19 5 5 19"/>; break;
    case "package": path = <><path d="M3 7 12 3l9 4v10l-9 4-9-4Z"/><path d="m3 7 9 5 9-5"/></>; break;
    case "external": path = <><path d="M13 5h6v6m0-6-9 9"/><path d="M19 14v5H5V5h5"/></>; break;
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round"
    strokeLinejoin="round" className={className}>{path}</svg>;
}
