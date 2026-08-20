// Score → color on a 0–10 scale (bright stops read well on the dark theme).
// Green = good, yellow = middling, orange/red = weak. More gradations so a 7.3
// clearly looks "good", not "bad".
export function scoreColor(score) {
  const n = typeof score === "number" ? score : parseFloat(score);
  if (n >= 8.0) return "text-emerald-400"; // отлично
  if (n >= 7.0) return "text-green-400";   // хорошо
  if (n >= 6.0) return "text-lime-400";    // выше среднего
  if (n >= 5.0) return "text-yellow-400";  // средне
  if (n >= 4.0) return "text-orange-400";  // ниже среднего
  return "text-rose-500";                  // плохо (красный)
}

const SIZES = { sm: "text-base", md: "text-lg", lg: "text-4xl" };

export default function ScoreBadge({ score, size = "md" }) {
  const n = typeof score === "number" ? score : parseFloat(score);
  return (
    <span className={`font-bold tracking-tight ${scoreColor(n)} ${SIZES[size] || SIZES.md}`}>
      {n > 0 ? n.toFixed(1) : "—"}
    </span>
  );
}
