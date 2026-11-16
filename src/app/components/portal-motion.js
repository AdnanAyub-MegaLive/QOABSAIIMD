"use client";
import { LazyMotion, domAnimation, MotionConfig } from "framer-motion";

export default function PortalMotion({ children }) {
  return <LazyMotion features={domAnimation}><MotionConfig reducedMotion="user" transition={{ duration: .18, ease: "easeOut" }}>{children}</MotionConfig></LazyMotion>;
}
