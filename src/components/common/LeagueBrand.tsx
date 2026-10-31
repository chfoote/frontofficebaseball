type LeagueBrandProps = {
  compact?: boolean;
  className?: string;
};

export default function LeagueBrand({ compact = false, className = "" }: LeagueBrandProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-green-600 to-slate-900 text-sm font-black tracking-tight text-white shadow-sm ring-1 ring-black/10">
        FOB
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <span className="block text-sm font-black tracking-tight text-gray-950 dark:text-white">
            Front Office Baseball
          </span>
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            League
          </span>
        </div>
      )}
    </div>
  );
}
