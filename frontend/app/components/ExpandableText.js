"use client";

import { useState, useRef, useLayoutEffect } from "react";

// Clamped text with a "Читать далее" toggle that only appears when the text
// actually overflows the clamp (otherwise the button did nothing).
export default function ExpandableText({ text, className = "", clampClass = "line-clamp-4" }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      // Measured only while clamped (not expanded); +1 for sub-pixel rounding.
      if (!expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    // Re-measure after fonts settle / on resize (line wrapping can change).
    const raf = requestAnimationFrame(check);
    window.addEventListener("resize", check);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", check);
    };
  }, [text, expanded]);

  if (!text) return null;

  return (
    <div className="mt-2">
      <p ref={ref} className={`${className} ${expanded ? "" : clampClass}`}>
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-red-400 hover:text-red-600 mt-1 transition-colors"
        >
          {expanded ? "Скрыть ▲" : "Читать далее ▼"}
        </button>
      )}
    </div>
  );
}
