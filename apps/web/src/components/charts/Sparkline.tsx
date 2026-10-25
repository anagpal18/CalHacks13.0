// 2px line, current point marked with an 8px ink dot ringed in the surface colour. Single series: no legend.

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  tone?: "data" | "held";
}

export function Sparkline({ values, width = 120, height = 36, tone = "data" }: SparklineProps) {
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;
  const padding = 5;
  const points = values.map((value, index) => [
    padding + (index / (values.length - 1)) * (width - padding * 2),
    padding + (1 - (value - minValue) / range) * (height - padding * 2),
  ]);
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];
  const strokeColor = tone === "held" ? "var(--held)" : "var(--data)";

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <path d={`${path} L${lastX},${height} L${points[0][0]},${height} Z`} fill={strokeColor} opacity={0.08} />
      <path d={path} fill="none" stroke={strokeColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={4} fill="var(--foreground)" stroke="var(--card)" strokeWidth={2} />
    </svg>
  );
}
