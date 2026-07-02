"use client";

import { useState, useEffect, useRef } from "react";
import { getNote, saveNote } from "@/lib/api";

export default function PrivateNote({ mediaType, mediaId, token }) {
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(""); // "", "saving", "saved"
  const taRef = useRef(null);
  const savedRef = useRef("");
  const contentRef = useRef("");      // latest content for unmount flush
  const inflightRef = useRef(false);

  // Keep a live ref of the current content
  useEffect(() => { contentRef.current = content; }, [content]);

  // Immediate save (used by debounce, blur, unmount)
  const flush = async () => {
    const c = contentRef.current;
    if (!loaded || c === savedRef.current || inflightRef.current) return;
    inflightRef.current = true;
    setStatus("saving");
    try {
      await saveNote(token, mediaType, mediaId, c);
      savedRef.current = c;
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "" : s)), 1500);
    } catch {
      setStatus("");
    } finally {
      inflightRef.current = false;
    }
  };

  // Load existing note
  useEffect(() => {
    if (!token || !mediaId) return;
    let alive = true;
    getNote(token, mediaType, mediaId).then((d) => {
      if (!alive) return;
      const c = d?.content || "";
      setContent(c);
      savedRef.current = c;
      contentRef.current = c;
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [token, mediaType, mediaId]);

  // Debounced autosave
  useEffect(() => {
    if (!loaded || content === savedRef.current) return;
    setStatus("saving");
    const t = setTimeout(flush, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, loaded]);

  // Flush any pending change on unmount (e.g. navigating away)
  useEffect(() => {
    return () => { flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-grow
  useEffect(() => {
    const ta = taRef.current;
    if (!ta || !open) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 400) + "px";
  }, [content, open]);

  if (!token) return null;

  const hasNote = (savedRef.current || "").trim().length > 0;

  return (
    <div className="rounded-xl border" style={{ background: "rgba(255,255,255,0.72)", borderColor: "rgba(0,0,0,0.08)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left group"
      >
        <span className="text-sm text-stone-600 group-hover:text-stone-300 transition-colors flex items-center gap-2">
          📝 Заметка для себя
          {!open && hasNote && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70" title="Есть заметка" />
          )}
        </span>
        <span className="text-stone-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <textarea
            ref={taRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={flush}
            placeholder="Мысли по ходу просмотра, что не забыть, на чём остановились…"
            className="w-full rounded-lg px-3 py-2 text-sm text-stone-800 outline-none focus:ring-1 focus:ring-amber-400/40 resize-y leading-relaxed"
            style={{ background: "#efe9df", border: "1px solid rgba(0,0,0,0.08)", minHeight: 90 }}
          />
          <div className="flex items-center justify-between text-[11px] text-stone-400">
            <span>🔒 Видите только вы</span>
            <span className="text-stone-500">
              {status === "saving" ? "Сохранение…" : status === "saved" ? "Сохранено ✓" : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
