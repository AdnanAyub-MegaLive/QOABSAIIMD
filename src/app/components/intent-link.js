"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";

/**
 * A Link that loads the full page (with its data) as soon as the user shows intent:
 * hover, keyboard focus or touch. Next.js already prefetches the loading screen for
 * links in view; this adds the data without querying every page in the sidebar.
 */
export default function IntentLink({ href, onMouseEnter, onFocus, onTouchStart, ...props }) {
  const router = useRouter();
  const done = useRef(false);
  const warm = () => {
    if (done.current || typeof href !== "string" || !href.startsWith("/")) return;
    done.current = true;
    router.prefetch(href);
  };
  return <Link href={href} {...props}
    onMouseEnter={e => { warm(); onMouseEnter?.(e); }}
    onFocus={e => { warm(); onFocus?.(e); }}
    onTouchStart={e => { warm(); onTouchStart?.(e); }}/>;
}
