"use client";

import { useRef, useEffect, useState } from "react";

export default function ReviewEditor({ value, onChange, placeholder, draftKey }) {
  const taRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [restored, setRestored] = useState(false);
  const hydrated = useRef(false);

  // Restore an unsent draft once, if the field is empty on mount. Survives a
  // dropped session / reload / crash so a long review is never lost.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (!draftKey) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved && saved.trim() && !(value || "").trim()) {
        onChange(saved);
        setRestored(true);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Persist every keystroke immediately; drop the draft once the field is empty.
  useEffect(() => {
    if (!draftKey || !hydrated.current) return;
    try {
      if ((value || "").trim()) localStorage.setItem(draftKey, value);
      else localStorage.removeItem(draftKey);
    } catch {}
  }, [value, draftKey]);

  const clearDraft = () => {
    try { if (draftKey) localStorage.removeItem(draftKey); } catch {}
    setRestored(false);
    onChange("");
  };

  // Auto-grow textarea with content
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const cap = expanded ? 1000 : 420;
    ta.style.height = Math.min(ta.scrollHeight, cap) + "px";
  }, [value, expanded]);

  // Wrap the current selection with markers (before/after)
  const wrap = (before, after = before) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = value || "";
    const selected = text.slice(start, end);
    const next = text.slice(0, start) + before + selected + after + text.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      // place cursor around the (possibly empty) selection, inside the markers
      ta.selectionStart = start + before.length;
      ta.selectionEnd = end + before.length;
    });
  };

  const Btn = ({ onClick, title, children, className = "" }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep textarea selection
      onClick={onClick}
      title={title}
      className={`px-2.5 py-1 rounded-md text-xs font-medium text-stone-200 hover:text-red-400 hover:bg-red-500/10 transition ${className}`}
      style={{ border: "1px solid rgba(255,255,255,0.10)" }}
    >
      {children}
    </button>
  );

  return (
    <div>
      {restored && (
        <div className="flex items-center justify-between gap-2 mb-2 text-xs rounded-md px-2.5 py-1.5"
          style={{ background: "rgba(226,20,29,0.08)", border: "1px solid rgba(226,20,29,0.25)" }}>
          <span className="text-red-300">🕸 Восстановлен несохранённый черновик</span>
          <button type="button" onClick={clearDraft} className="text-stone-400 hover:text-red-400 transition shrink-0">
            стереть
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <Btn onClick={() => wrap("**")} title="Жирный — выделите текст и нажмите">
          <b>Ж</b>
        </Btn>
        <Btn onClick={() => wrap("*")} title="Курсив — выделите текст и нажмите">
          <i>К</i>
        </Btn>
        <Btn onClick={() => wrap("||")} title="Спойлер — выделите текст и нажмите">
          ▦ Спойлер
        </Btn>
        <div className="flex-1" />
        <Btn
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Свернуть поле" : "Развернуть поле"}
        >
          {expanded ? "⤡ Свернуть" : "⤢ Развернуть"}
        </Btn>
      </div>

      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg px-3 py-2.5 text-sm text-stone-50 outline-none focus:ring-1 focus:ring-red-500/50 resize-y transition leading-relaxed"
        style={{ background: "#141b31", border: "1px solid rgba(255,255,255,0.10)", minHeight: expanded ? 320 : 120 }}
      />

      <p className="text-[10px] text-stone-500 mt-1.5">
        Выделите текст и нажмите кнопку: <b className="text-stone-300">Ж</b> жирный,{" "}
        <i className="text-stone-300">К</i> курсив, ▦ спойлер (скрытый текст)
      </p>
    </div>
  );
}
