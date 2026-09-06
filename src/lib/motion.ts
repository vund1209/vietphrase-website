// Shared framer-motion timing so every overlay/transition in the app
// feels like one consistent system instead of five components each
// picking their own duration -- see the planning doc's section 12
// ("audit for a single shared transition-duration/easing token... used
// everywhere, instead of each component picking its own duration").
// Confirmed by grepping every `transition={{ duration: ... }}` call in
// the codebase before this: durations ranged from 0.15 to 0.3 with no
// pattern to the variation.
import type { Transition } from "framer-motion";

/** Backdrop/overlay fade -- the quickest tier, since it's just a dimming layer. */
export const FADE_TRANSITION: Transition = { duration: 0.15, ease: "easeOut" };

/** The standard tier: modals, panels, and per-item entrances (SpanEditor, ChapterTocPanel, AddBookModal, NovelGrid). */
export const STANDARD_TRANSITION: Transition = { duration: 0.2, ease: "easeOut" };
