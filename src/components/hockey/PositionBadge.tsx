const positionStyles: Record<string, string> = {
  C: "bg-red-100 text-red-700 ring-red-200 dark:bg-red-500/20 dark:text-red-300 dark:ring-red-500/30",
  "1B": "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30",
  "2B": "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-500/20 dark:text-sky-300 dark:ring-sky-500/30",
  SS: "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:ring-indigo-500/30",
  "3B": "bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:ring-orange-500/30",
  OF: "bg-green-100 text-green-700 ring-green-200 dark:bg-green-500/20 dark:text-green-300 dark:ring-green-500/30",
  DH: "bg-pink-100 text-pink-700 ring-pink-200 dark:bg-pink-500/20 dark:text-pink-300 dark:ring-pink-500/30",
  SP: "bg-purple-100 text-purple-700 ring-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:ring-purple-500/30",
  RP: "bg-teal-100 text-teal-700 ring-teal-200 dark:bg-teal-500/20 dark:text-teal-300 dark:ring-teal-500/30",
};

export function normalizePosition(position?: string | null) {
  const code = (position || "—").toUpperCase();
  if (["LF", "CF", "RF"].includes(code)) return "OF";
  return code;
}

export default function PositionBadge({ position, className = "" }: { position?: string | null; className?: string }) {
  const code = normalizePosition(position);
  const style = positionStyles[code] || "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-600";
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-black ring-1 ${style} ${className}`}>{code}</span>;
}
