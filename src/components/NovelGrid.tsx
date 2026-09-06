"use client";

// Wraps a list of NovelCard elements in the shared grid layout plus a
// staggered fade-in entrance (ui-ux-pro-max's "Standard" motion tier:
// noticeable but not showy) -- degrades to a plain, static grid when
// prefers-reduced-motion is set, rather than skipping the animation props
// individually.
import { Children, isValidElement } from "react";
import { m, useReducedMotion, type Variants } from "framer-motion";
import { STANDARD_TRANSITION } from "@/lib/motion";

const GRID_CLASSNAME = "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: STANDARD_TRANSITION },
};

export function NovelGrid({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={GRID_CLASSNAME}>{children}</div>;
  }

  return (
    <m.div className={GRID_CLASSNAME} variants={container} initial="hidden" animate="show">
      {Children.toArray(children).map((child, i) => (
        <m.div key={isValidElement(child) ? (child.key ?? i) : i} variants={item}>
          {child}
        </m.div>
      ))}
    </m.div>
  );
}
