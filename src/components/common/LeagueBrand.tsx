type LeagueBrandProps = {
  compact?: boolean;
  className?: string;
};

export default function LeagueBrand({ compact = false, className = "" }: LeagueBrandProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-green-600 to-slate-900 shadow-sm ring-1 ring-black/10" aria-hidden="true">
        <svg viewBox="0 0 48 48" className="h-9 w-9" role="img">
          <circle cx="24" cy="24" r="19" fill="#fff" stroke="#dbe4ee" strokeWidth="1.5" />
          <path d="M13 10c8 5 14 14 15 27M35 10c-8 5-14 14-15 27" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeDasharray="2.2 3.1" />
        </svg>
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <span className="block text-sm font-black tracking-tight text-gray-950 dark:text-white">
            Front Office Baseball
          </span>
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            Fantasy Sports Platform
          </span>
        </div>
      )}
    </div>
  );
}
