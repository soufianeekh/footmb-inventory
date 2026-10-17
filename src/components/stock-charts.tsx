"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Pie,
  PieChart,
  Cell,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { LOCATIONS, type Product } from "@/lib/inventory";
const config = { units: { label: "Unités", color: "#201a70" } };
export function LocationChart({ units }: { units: Record<string, number> }) {
  const data = LOCATIONS.map((l) => ({ name: l.short, units: units[l.key] }));
  return (
    <ChartContainer config={config} className="h-[225px] w-full">
      <BarChart
        data={data}
        accessibilityLayer
        margin={{ left: -25, right: 8, top: 12 }}
      >
        <CartesianGrid vertical={false} stroke="#edf0f7" />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          fontSize={11}
        />
        <YAxis tickLine={false} axisLine={false} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          isAnimationActive={false}
          dataKey="units"
          radius={[4, 4, 0, 0]}
          maxBarSize={42}
        >
          {data.map((d, i) => (
            <Cell key={d.name} fill={["#201a70", "#ff9d0a", "#ffb936"][i]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
export function AvailabilityChart({
  available,
  low,
  out,
  uncertain,
}: {
  available: number;
  low: number;
  out: number;
  uncertain: number;
}) {
  const data = [
    { name: "En stock", value: available, color: "#201a70" },
    { name: "Stock faible", value: low, color: "#ff9d0a" },
    { name: "Rupture", value: out, color: "#ff5269" },
    { name: "Stock partiel", value: uncertain, color: "#cbd2e8" },
  ];
  return (
    <ChartContainer config={config} className="h-[185px] w-full">
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie
          isAnimationActive={false}
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={52}
          outerRadius={78}
          paddingAngle={3}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
export function SizeChart({ products }: { products: Product[] }) {
  const sizes = new Map<string, number>();
  products.forEach((p) =>
    LOCATIONS.forEach((l) =>
      p.sizes[l.key].forEach((s) =>
        sizes.set(s.size, (sizes.get(s.size) || 0) + s.quantity),
      ),
    ),
  );
  const data = [...sizes]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([name, units]) => ({ name, units }));
  return (
    <ChartContainer config={config} className="h-[225px] w-full">
      <BarChart
        data={data}
        accessibilityLayer
        margin={{ left: -25, right: 8, top: 12 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          isAnimationActive={false}
          dataKey="units"
          fill="#ff9d0a"
          radius={[4, 4, 0, 0]}
          maxBarSize={35}
        />
      </BarChart>
    </ChartContainer>
  );
}

export function SalesSourceChart({ data }: { data: Array<{ date: string; delivery: number; store: number; site: number; shopify_pos: number }> }) {
  const chartConfig = {
    delivery: { label: "Livraison", color: "#ff9d0a" },
    site: { label: "Site", color: "#201a70" },
    shopify_pos: { label: "Shopify POS", color: "#7258ff" },
    store: { label: "Magasin", color: "#16a66a" },
  };
  return (
    <ChartContainer config={chartConfig} className="mt-5 h-[250px] w-full">
      <BarChart data={data} accessibilityLayer margin={{ left: -25, right: 8, top: 12 }}>
        <CartesianGrid vertical={false} stroke="#edf0f7" />
        <XAxis dataKey="date" tickFormatter={(value) => String(value).slice(5)} tickLine={false} axisLine={false} fontSize={10} />
        <YAxis tickLine={false} axisLine={false} fontSize={10} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar isAnimationActive={false} dataKey="site" stackId="sales" fill="#201a70" />
        <Bar isAnimationActive={false} dataKey="shopify_pos" stackId="sales" fill="#7258ff" />
        <Bar isAnimationActive={false} dataKey="store" stackId="sales" fill="#16a66a" />
        <Bar isAnimationActive={false} dataKey="delivery" stackId="sales" fill="#ff9d0a" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
