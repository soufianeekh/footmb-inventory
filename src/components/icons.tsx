import {
  Home,
  Box,
  ChartNoAxesColumn,
  Settings,
  RefreshCw,
  Search,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  TriangleAlert,
  Check,
  Store,
  Clock,
  Info,
  ShieldCheck,
  ArrowUp,
  Layers,
  ListFilter,
  X,
  Package,
  ExternalLink,
  ShoppingCart,
  Users,
} from "lucide-react";
const icons = {
  home: Home,
  box: Box,
  chart: ChartNoAxesColumn,
  settings: Settings,
  refresh: RefreshCw,
  search: Search,
  "chevron-right": ChevronRight,
  "chevron-left": ChevronLeft,
  "arrow-left": ArrowLeft,
  alert: TriangleAlert,
  check: Check,
  store: Store,
  clock: Clock,
  info: Info,
  shield: ShieldCheck,
  "arrow-up": ArrowUp,
  layers: Layers,
  filter: ListFilter,
  x: X,
  package: Package,
  external: ExternalLink,
  cart: ShoppingCart,
  users: Users,
};
export type IconName = keyof typeof icons;
export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const Component = icons[name];
  return (
    <Component
      aria-hidden
      size={size}
      strokeWidth={1.8}
      className={className}
    />
  );
}
