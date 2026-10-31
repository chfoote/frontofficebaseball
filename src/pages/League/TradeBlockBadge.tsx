export default function TradeBlockBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="This player is available for trade"
      className={`inline-flex whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 ${className}`}
    >
      Trade Block
    </span>
  );
}
