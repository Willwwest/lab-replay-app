// A bottom sheet for a focused choice: picking a kid, the capture settings,
// confirming an analysis. Escape or the backdrop closes it; focus moves in
// on open and back to where it was on close.
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./ds/index.jsx";

export default function Sheet({
  title,
  note,
  onClose,
  children,
  footer,
  tone,
}) {
  const panel = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    panel.current
      ?.querySelector(
        "input, select, textarea, button:not([aria-label='Close'])",
      )
      ?.focus({ preventScroll: true });
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("keydown", esc);
      before?.focus?.({ preventScroll: true });
    };
  }, []);
  // Rendered at the document root so no parent's stacking can trap it.
  return createPortal(
    <div
      className="rp-sheet-back"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={panel}
        className={`rp-sheet ${tone === "ink" ? "is-ink" : ""}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="rp-sheet-head">
          <div>
            <h2 className="ds-h3">{title}</h2>
            {note && <p className="ds-note">{note}</p>}
          </div>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </header>
        <div className="rp-sheet-body">{children}</div>
        {footer && <footer className="rp-sheet-foot">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
