"use client";
import { useEffect, useRef } from "react";
import { m } from "framer-motion";

const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
let locks = 0;
let previousOverflow = "";
export default function PortalDialog({ children, onClose, busy = false, className = "", ...props }) {
  const root = useRef(null);
  const close = useRef(onClose);
  const pending = useRef(busy);
  useEffect(() => { close.current = onClose; pending.current = busy; }, [onClose, busy]);
  useEffect(() => {
    const prior = document.activeElement;
    if (locks++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    const node = root.current;
    const visible = () => [...node.querySelectorAll(focusable)].filter(el => el.getClientRects().length);
    (node.querySelector('[autofocus]') || visible()[0] || node).focus();
    function keydown(e) {
      const dialogs = [...document.querySelectorAll('[data-portal-dialog]')];
      if (dialogs.at(-1) !== node) return;
      if (e.key === 'Escape' && !pending.current) { e.preventDefault(); close.current?.(); }
      if (e.key !== 'Tab') return;
      const elements = visible(); const first = elements[0]; const last = elements.at(-1);
      if (!first) { e.preventDefault(); node.focus(); return; }
      if (e.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); if (--locks === 0) document.body.style.overflow = previousOverflow; if (prior?.isConnected) prior.focus(); };
  }, []);
  return <m.div {...props} ref={root} data-portal-dialog tabIndex={-1} role="dialog" aria-modal="true" aria-busy={busy} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={className}>{children}</m.div>;
}
