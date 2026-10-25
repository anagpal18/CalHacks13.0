import { animate, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  format?: (value: number) => string;
  durationSeconds?: number;
  className?: string;
}

/** Counts up to `value` once in view; later changes count on from the number currently shown. */
export function AnimatedNumber({ value, format = (shown) => Math.round(shown).toLocaleString("en-US"), durationSeconds = 1.4, className }: AnimatedNumberProps) {
  const elementRef = useRef<HTMLSpanElement>(null);
  const isInView = useInView(elementRef, { once: true });
  const [shownValue, setShownValue] = useState(0);
  const shownValueRef = useRef(0);

  useEffect(() => {
    if (!isInView) return;
    const controls = animate(shownValueRef.current, value, {
      duration: durationSeconds,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        shownValueRef.current = latest;
        setShownValue(latest);
      },
    });
    return () => controls.stop();
  }, [isInView, value, durationSeconds]);

  return <span ref={elementRef} className={className}>{format(shownValue)}</span>;
}
