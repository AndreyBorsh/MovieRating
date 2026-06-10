"use client";

import { useRef, useEffect, useState } from "react";

export default function ReviewEditor({ value, onChange, placeholder }) {
  const taRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

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
      className={`px-2.5 py-1 rounded-md text-xs font-medium text-slate-300 hover:text-amber-400 hover:bg-amber-400/10 transition ${className}`}
      style={{ border: "1px solid #1e2d45" }}
    >
      {children}
    </button>
  );

  return (
    <div>
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
        className="w-full rounded-lg px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-amber-400/50 resize-y transition leading-relaxed"
        style={{ background: "#0c1220", border: "1px solid #1e2d45", minHeight: expanded ? 320 : 120 }}
      />

      <p className="text-[10px] text-slate-600 mt-1.5">
        Выделите текст и нажмите кнопку: <b className="text-slate-400">Ж</b> жирный,{" "}
        <i className="text-slate-400">К</i> курсив, ▦ спойлер (скрытый текст)
      </p>
    </div>
  );
}
