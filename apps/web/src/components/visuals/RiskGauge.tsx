// Semicircle gauge that sweeps to a 0–100 risk score. Green under 40, amber to 70, red above.

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useState } from "react";

const RADIUS = 80;
const ARC_LENGTH = Math.PI * RADIUS;

export function riskColor(score: number): string {
  if (score >= 70) return "var(--held)";
  if (score >= 40) return "var(--asking)";
  return "var(--cleared)";
}

export function RiskGauge({ score, isRevealed }: { score: number; isRevealed: boolean }) {
  const shownScore = useMotionValue(0);
  const dashOffset = useTransform(shownScore, (value) => ARC_LENGTH * (1 - value / 100));
  // Needle tip on a circle of radius 66 around the pivot (100,100); score 0 points left, 100 points right.
  const needleTipX = useTransform(shownScore, (value) => 100 - 66 * Math.cos((value / 100) * Math.PI));
  const needleTipY = useTransform(shownScore, (value) => 100 - 66 * Math.sin((value / 100) * Math.PI));
  const [label, setLabel] = useState(0);

  useEffect(() => {
    shownScore.set(0);
    setLabel(0);
    if (!isRevealed) return;
    const controls = animate(shownScore, score, { duration: 1.6, ease: [0.16, 1, 0.3, 1], onUpdate: (value) => setLabel(Math.round(value)) });
    return () => controls.stop();
  }, [score, isRevealed, shownScore]);

  const color = isRevealed ? riskColor(label) : "var(--muted-foreground)";

  return (
    <div className="relative mx-auto w-64">
      <svg viewBox="0 0 200 116" className="w-full overflow-visible">
        <defs>
          <linearGradient id="risk-track" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--cleared)" stopOpacity="0.25" />
            <stop offset="55%" stopColor="var(--asking)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--held)" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#risk-track)" strokeWidth="14" strokeLinecap="round" />
        <motion.path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={ARC_LENGTH}
          style={{ strokeDashoffset: dashOffset }}
        />
        <motion.line x1={100} y1={100} x2={needleTipX} y2={needleTipY} stroke="var(--foreground)" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx="100" cy="100" r="6" fill="var(--foreground)" />
        {[0, 50, 100].map((tick) => (
          <text key={tick} x={tick === 0 ? 14 : tick === 100 ? 186 : 100} y={tick === 50 ? 12 : 114} textAnchor="middle" className="fill-muted-foreground text-[9px]">
            {tick}
          </text>
        ))}
      </svg>
      <div className="mt-1 text-center">
        <div className="text-5xl font-extrabold tabular-nums" style={{ color }}>{isRevealed ? label : "--"}</div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">risk score</div>
      </div>
    </div>
  );
}
