export default function PlayerInterestButton({
  interested,
  busy = false,
  onClick,
  showLabel = false,
}: {
  interested: boolean;
  busy?: boolean;
  onClick: () => void;
  showLabel?: boolean;
}) {
  const label = interested ? "Withdraw interest" : "Tell this player's manager I'm interested";
  return <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={interested}
    disabled={busy}
    onClick={onClick}
    className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border font-semibold transition disabled:cursor-wait disabled:opacity-50 ${showLabel ? "px-3 py-2 text-sm" : "h-8 w-8 text-lg"} ${interested ? "border-amber-300 bg-amber-50 text-amber-500 dark:border-amber-500/40 dark:bg-amber-500/10" : "border-gray-300 bg-white text-gray-400 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-500 dark:border-gray-700 dark:bg-gray-900"}`}
  >
    <span aria-hidden="true">{interested ? "★" : "☆"}</span>
    {showLabel && <span>{interested ? "Interested" : "I'm Interested"}</span>}
  </button>;
}
