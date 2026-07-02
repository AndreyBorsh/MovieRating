export function scoreColor(score) {
  const n = typeof score === "number" ? score : parseFloat(score);
  if (n >= 7.5) return "text-emerald-400";
  if (n >= 5.5) return "text-amber-400";
  return "text-red-400";
}

const SIZES = { sm: "text-base", md: "text-lg", lg: "text-4xl" };

export default function ScoreBadge({ score, size = "md" }) {
  const n = typeof score === "number" ? score : parseFloat(score);
  return (
    <span className={`font-display font-medium ${scoreColor(n)} ${SIZES[size] || SIZES.md}`}>
      {n > 0 ? n.toFixed(1) : "—"}
    </span>
  );
}
