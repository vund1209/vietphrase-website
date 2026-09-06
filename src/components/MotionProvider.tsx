"use client";

// Defers framer-motion's animation engine into its own async chunk
// instead of bundling it into the main JS -- every current `m`-using
// component (ChapterTocPanel, NovelGrid, SpanEditor, AddBookModal) only
// needs opacity/transform animations and AnimatePresence exit
// transitions, which `domAnimation`'s feature set fully covers (no
// drag/layout needed, so no reason to ship the larger `domMax` bundle).
// `features` takes a loader function (not the bundle itself) so it's
// fetched lazily on first animation rather than at initial page load --
// see the performance plan's Phase 1 ("bundle-size pass"). `strict`
// makes any stray `motion.*` usage (instead of `m.*`) throw instead of
// silently pulling the full engine back in.
import { LazyMotion } from "framer-motion";
import type { ReactNode } from "react";

const loadFeatures = () => import("framer-motion").then((mod) => mod.domAnimation);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}
