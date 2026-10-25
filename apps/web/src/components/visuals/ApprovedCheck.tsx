// The approval moment: a ring draws itself, fills green, the check mark draws in, then "Approved".

import { motion } from "motion/react";

const EASE = [0.65, 0, 0.35, 1] as const;

export function ApprovedCheck({ size = 72 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.svg width={size} height={size} viewBox="0 0 52 52" initial={{ scale: 0.6 }} animate={{ scale: [0.6, 1.08, 1] }} transition={{ duration: 0.9, times: [0, 0.7, 1] }}>
        <motion.circle
          cx="26" cy="26" r="24"
          fill="none" stroke="var(--approved)" strokeWidth="2.5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: EASE }}
        />
        <motion.circle
          cx="26" cy="26" r="24"
          fill="var(--approved)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ originX: "26px", originY: "26px" }}
          transition={{ delay: 0.45, duration: 0.3, ease: EASE }}
        />
        <motion.path
          d="M15 27 l7 7 l15 -15"
          fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.7, duration: 0.35, ease: EASE }}
        />
      </motion.svg>
      <motion.span
        className="text-xl font-semibold tracking-tight text-approved"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.95, duration: 0.3 }}
      >
        Approved
      </motion.span>
    </div>
  );
}
