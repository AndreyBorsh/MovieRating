"use client";

import { useState } from "react";

const REVIEW_LIMIT = 300;

// Clickable spoiler: blurred until revealed
function Spoiler({ children }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      onClick={() => setRevealed(true)}
      title={revealed ? "" : "Нажмите, чтобы показать спойлер"}
      className={
        revealed
          ? "rounded px-0.5"
          : "rounded px-1 cursor-pointer select-none bg-stone-600 text-transparent transition"
      }
      style={revealed ? { background: "rgba(148,163,184,0.12)" } : undefined}
    >
      {children}
    </span>
  );
}

// Parse inline markers within a single line into React nodes.
// Supports **bold**, *italic*, ||spoiler||
function parseInline(text, keyPrefix) {
  const nodes = [];
  const re = /\*\*([\s\S]+?)\*\*|\|\|([\s\S]+?)\|\||\*([\s\S]+?)\*/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b-${i}`} className="font-bold text-stone-50">{m[1]}</strong>);
    } else if (m[2] !== undefined) {
      nodes.push(<Spoiler key={`${keyPrefix}-s-${i}`}>{m[2]}</Spoiler>);
    } else if (m[3] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-i-${i}`} className="italic">{m[3]}</em>);
    }
    last = re.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Strip formatting markers for plain-text previews (line-clamped cards)
export function stripMarkers(text) {
  if (!text) return "";
  return text
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/\|\|([\s\S]+?)\|\|/g, "$1")
    .replace(/\*([\s\S]+?)\*/g, "$1");
}

function renderFormatted(text) {
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <span key={i}>
      {parseInline(line, `l${i}`)}
      {i < lines.length - 1 && <br />}
    </span>
  ));
}

export default function ReviewText({ text, muted = false }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const isLong = text.length > REVIEW_LIMIT;
  const displayed = isLong && !expanded ? text.slice(0, REVIEW_LIMIT).trimEnd() + "…" : text;
  const color = muted ? "text-stone-300" : "text-stone-200";
  return (
    <div className={`text-sm ${color} leading-relaxed text-justify hyphens-auto`}>
      {renderFormatted(displayed)}
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="block mt-1.5 text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          {expanded ? "Свернуть ↑" : "Читать дальше ↓"}
        </button>
      )}
    </div>
  );
}
