"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useSmoothValue provides 60 FPS smooth mechanical interpolation between numeric readings.
 * Ensures dials, metrics, and gauges glide fluidly like analog precision instruments.
 *
 * @param target The real-time target reading from telemetry
 * @param speed The responsiveness multiplier (default 7.0 for natural damping)
 * @param precision Rounding precision decimal places (default 1)
 */
export function useSmoothValue(
  target: number,
  speed: number = 7.0,
  precision: number = 1,
): number {
  const [displayValue, setDisplayValue] = useState<number>(target);
  const targetRef = useRef<number>(target);
  targetRef.current = isNaN(target) ? 0 : target;

  const currentRef = useRef<number>(targetRef.current);

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const diff = targetRef.current - currentRef.current;
      if (Math.abs(diff) > 0.01) {
        // Natural exponential smoothing (critically damped response)
        currentRef.current += diff * Math.min(1, dt * speed);
        setDisplayValue(Number(currentRef.current.toFixed(precision)));
        animId = requestAnimationFrame(loop);
      } else {
        currentRef.current = targetRef.current;
        setDisplayValue(Number(targetRef.current.toFixed(precision)));
      }
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [target, speed, precision]);

  return displayValue;
}
