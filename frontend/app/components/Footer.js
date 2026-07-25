"use client";

import { useState } from "react";

const SUPPORT_EMAIL = "waw.admin.1@gmail.com";

export default function Footer() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard
      ?.writeText(SUPPORT_EMAIL)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };

  return (
    <footer className="max-w-6xl mx-auto px-4 sm:px-6 pb-10 pt-2">
      <div
        className="border-t pt-4 text-center text-sm text-stone-500"
        style={{ borderColor: "rgba(0,0,0,0.08)" }}
      >
        Возникла проблема или ошибка? Напишите нам —{" "}
        <button
          onClick={copy}
          title="Нажмите, чтобы скопировать"
          className="text-amber-600 hover:text-amber-500 font-medium transition-colors"
        >
          {SUPPORT_EMAIL}
        </button>
        {copied && <span className="ml-2 text-emerald-600 text-xs">скопировано ✓</span>}
      </div>
    </footer>
  );
}
