"use client";

import type { ReactNode } from "react";
import { motion, useIsPresent, useReducedMotion } from "framer-motion";

// Keep visibility rules on the keyed page: the departing page must retain its
// own layout until AnimatePresence finishes its exit, even during rapid clicks.
export default function ArchiveRouteStage({ route, children }: { route: string; children: ReactNode }) {
  const isPresent = useIsPresent();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={`ix-route-stage is-route-${route.slice(1) || "home"}${route === "/" ? " is-home" : " is-secondary"}`}
      inert={!isPresent}
      aria-hidden={!isPresent || undefined}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: reduceMotion ? 0 : isPresent ? .28 : .14, ease: [.22, .68, .3, 1] }}
    >
      {children}
    </motion.div>
  );
}
