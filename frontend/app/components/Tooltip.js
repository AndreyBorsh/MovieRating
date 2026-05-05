"use client";

export default function Tooltip({ text, children }) {
  return (
    <div className="relative group inline-block">
      {children}

      <div className="absolute hidden group-hover:block bg-black text-white text-xs rounded px-2 py-1 -top-8 left-0 z-50 whitespace-nowrap">
        {text}
      </div>
    </div>
  );
}